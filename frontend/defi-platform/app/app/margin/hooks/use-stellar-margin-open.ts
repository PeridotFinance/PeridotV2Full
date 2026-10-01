'use client'

/**
 * use-stellar-margin-open
 *
 * The V3 perps open flow (frontend-v2-to-v3-migration.md) — three signed steps
 * behind one call, with a live stepper:
 *
 *   1. begin_open_position_v3    → locks margin pTokens, writes PendingOpen
 *                                  (nothing is borrowed to the wallet)
 *   2. swap_open_position_v3     → withdraw margin + borrow + swap, ON-CHAIN
 *   3. activate_open_position_v3 → deposit position asset, health check, Open
 *
 * Resume is idempotent: `get_pending_perps_open_execution` tells us whether the
 * swap (step 2) already landed, so a retry that only needs activation skips
 * straight to step 3 (never double-swaps). If a step fails, the position stays
 * PendingOpen — the page shows the recovery banner (resume via `resumePending`,
 * or cancel — but cancel only while NO execution exists; after the swap the only
 * way forward is activation, which the contract allows even past `expires_at`).
 *
 * Collateral is always posted in mock-USDT margin pTokens. `side` selects
 * debt/swap direction via SIDE_MAPPING; the contract infers pool indexes from
 * `side` (we pass pool_tokens/pool_id/pool via the lib layer).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { usePrivy } from '@privy-io/react-auth'
import { useStellarWallet } from '@/hooks/use-stellar-wallet'
import { useStellarWalletSession } from '@/hooks/use-stellar-wallet-session'
import {
  STELLAR_MARGIN_CONFIG as CFG,
  SIDE_MAPPING,
  type PositionSide,
} from '../config/stellarMarginConfig'
import {
  vaultGetExchangeRate,
  getMarginBalancePtokens,
  getPriceUsd,
  estimatePoolSwap,
  beginOpenPositionV3,
  getPendingPerpsOpen,
  getPendingPerpsOpenExecution,
  waitForLedgerBeyond,
  swapOpenPositionV3,
  activateOpenPositionV3,
  ptokensToUnderlying,
  getTokenBalance,
  formatUnitsToDecimal,
  type StellarPendingOpen,
} from '@/lib/stellar-margin'
import { computeBorrowAndFloor, resolveMinOut, describeMinOutShortfall, executionEntryPrice, reconstructLeverage } from '../lib/marginMath'
import {
  readableMarginError,
  isLiveTradingUnavailable,
  isSlippageError,
  isBalanceError,
  isOracleFloorError,
  LIVE_GATE_COPY,
  ORACLE_FLOOR_SIGNATURE,
} from '../lib/stellarMarginErrors'
import { recordMarginTrade, type MarginTradeClientInput } from './use-stellar-margin-journal'
import { isMarginFlowBusy, busyMarginFlowKind, acquireMarginFlow, releaseMarginFlow } from '../lib/marginFlowLock'
import type { StellarPendingOpenView } from '../types/stellarMargin'

export type OpenStep =
  | 'idle'
  | 'quoting'
  | 'beginning'   // step 1/3
  | 'swapping'    // step 2/3
  | 'activating'  // step 3/3
  | 'success'
  | 'error'

export interface OpenParams {
  side: PositionSide
  /** mock-USDT margin pTokens to commit (raw). */
  collateralPtokens: bigint
  /** Integer leverage 2..MAX_LEVERAGE (contract takes u128). */
  leverage: number
  /** User slippage tolerance in bps (e.g. 100 = 1%). */
  slippageBps: number
  /** Optional take-profit trigger price (XLM/USD). Persisted for the TP/SL monitor. */
  takeProfit?: number | null
  /** Optional stop-loss trigger price (XLM/USD). */
  stopLoss?: number | null
}

/**
 * How long the flow lingers on `success` before returning to `idle`.
 *
 * `success` is a MESSAGE state, not a resting state: the CTA renders "Position
 * Opened!" while it lasts. Leaving the flow parked there left a green, *enabled*
 * button labelled "Position Opened!" that opened another real position on the
 * next tap — so it expires.
 */
const SUCCESS_LINGER_MS = 1_800

/** Pause before the single activate retry — long enough for a ledger to close, so
 *  the retry simulates against the state that made the first attempt fail. */
const ACTIVATE_RETRY_DELAY_MS = 6_000

// Plain-language progress, fintech-not-crypto, with x/3 for orientation.
const STEP_LABEL: Record<OpenStep, string> = {
  idle: '',
  quoting: 'Preparing your trade…',
  beginning: 'Opening position · 1/3',
  swapping: 'Building your exposure · 2/3',
  activating: 'Locking it in · 3/3',
  success: 'Position opened',
  error: 'Couldn’t complete',
}

function emit(step: OpenStep, hash?: string) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('peridot:tx-update', {
    detail: { action: 'margin-open-position', step, statusMessage: STEP_LABEL[step], txHash: hash },
  }))
}

/**
 * What landed, for a caller that needs to do something with the new position.
 *
 * Passed only when the on-chain open completed AND its journal row was
 * written — the triggers live nowhere else, so without that row there is nothing
 * to hand the keeper. Plain "something changed, re-read" calls pass nothing.
 */
export interface OpenedInfo {
  positionId: string
  takeProfit: number | null
  stopLoss: number | null
}

export interface UseStellarMarginOpenResult {
  openPosition: (params: OpenParams) => Promise<boolean>
  resumePending: (pending: StellarPendingOpenView) => Promise<boolean>
  step: OpenStep
  stepLabel: string
  error: string | null
  /** The known "live trading not enabled yet" contract gate (calm UI state). */
  unavailable: boolean
  /** The pool couldn't fill at the requested price — the user can retry by
   *  raising their slippage tolerance or shrinking the size. */
  slippage: boolean
  /**
   * Set instead of `slippage` when the pool price has drifted outside the
   * protocol's oracle band. Mutually exclusive with `slippage`: this one is NOT
   * user-fixable (no tolerance, no size), so the panel must not offer a retry.
   * Carries the measured gap and the protocol ceiling for honest copy.
   */
  oracleFloor: { gapPct: number | null; maxGapPct: number } | null
  isLoading: boolean
  /** Position id created by begin_open (string), set even on mid-flow failure. */
  pendingPositionId: string | null
  reset: () => void
}

/**
 * Leverage a pending open was placed at, for the journal row a banner-resumed
 * trade writes. A Short's borrow is XLM against a USDT margin, so the two legs
 * only compare once priced — see marginMath.reconstructLeverage for why adding
 * the raw amounts turned a 5× short into "26×". Oracle reads are skipped for a
 * Long, whose legs are already the same asset.
 */
async function resumeLeverage(
  side: PositionSide,
  marginRaw: bigint,
  borrowRaw: bigint,
): Promise<number | undefined> {
  const usdt = CFG.assets.MOCK_USDT
  const xlm = CFG.assets.XLM
  const common = {
    side,
    marginRaw,
    borrowRaw,
    usdtDecimals: usdt.decimals,
    xlmDecimals: xlm.decimals,
  }
  if (side === 'Long') return reconstructLeverage(common)

  const [usdtPrice, xlmPrice] = await Promise.all([
    getPriceUsd(usdt.token).catch(() => null),
    getPriceUsd(xlm.token).catch(() => null),
  ])
  return reconstructLeverage({
    ...common,
    usdtPriceUsd: usdtPrice ? Number(usdtPrice.price) / Number(usdtPrice.scale) : null,
    xlmPriceUsd: xlmPrice ? Number(xlmPrice.price) / Number(xlmPrice.scale) : null,
  })
}

/**
 * Refuse an open because another margin flow is running — and SAY so.
 *
 * The per-instance guard this replaces returned false silently: the trade button
 * simply did nothing, which reads as a broken app rather than a busy one. Mirrors
 * the close hook's rejectBusy.
 */
function rejectBusy(): false {
  const msg = busyMarginFlowKind() === 'close'
    ? 'Still closing your other position — place this trade once it finishes.'
    : 'Still finishing your other trade — this one is next, give it a moment.'
  toast.info(msg, { id: 'margin-open-busy' })
  return false
}

export function useStellarMarginOpen(onOpened?: (info?: OpenedInfo) => void): UseStellarMarginOpenResult {
  // `onOpened` is also the "something changed on-chain, re-read" callback, and a
  // post-begin FAILURE changes just as much as a success: the collateral is now
  // locked in a PendingOpen. Held in a ref so `fail` can call it without taking
  // the caller's identity as a dependency (it is an inline arrow at both call
  // sites and would re-create the callback on every render).
  const onOpenedRef = useRef(onOpened)
  onOpenedRef.current = onOpened
  const { address, source: walletSource } = useStellarWallet()
  const { getAccessToken } = usePrivy()
  /**
   * Wallet sign-in, for the one journal write that can't be allowed to fail
   * quietly. A kit ("pure Freighter") user proves their address with a signed
   * challenge, and that session expires — see the retry in `finishFromPending`.
   *
   * Held in refs so `finishFromPending` doesn't take them as dependencies: it is
   * re-created on every render otherwise, and the pending-resume path holds on to
   * an identity of it.
   */
  const { signIn: signInWallet } = useStellarWalletSession()
  const walletSessionRef = useRef({ source: walletSource, signIn: signInWallet })
  walletSessionRef.current = { source: walletSource, signIn: signInWallet }
  const [step, setStep] = useState<OpenStep>('idle')
  const [error, setError] = useState<string | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [slippage, setSlippage] = useState(false)
  const [oracleFloor, setOracleFloor] = useState<{ gapPct: number | null; maxGapPct: number } | null>(null)
  const [pendingPositionId, setPendingPositionId] = useState<string | null>(null)
  /**
   * Busy is PROCESS-WIDE, not per hook instance (lib/marginFlowLock).
   *
   * Two instances of this hook are mounted at once — the open panel for fresh
   * trades, the page for the pending-banner resume — and a per-instance ref let
   * them run at the same time, as well as against a close or a TP/SL auto-close.
   * Every leg of every flow is signed by the same Stellar account, whose sequence
   * number `buildSignSubmit` reads fresh per transaction, so overlapping flows
   * race it into txBadSeq mid-flow: the failure mode that strands collateral in a
   * PendingOpen and sends the trader to the recovery banner.
   */
  // Mirror of `step` readable synchronously inside fail() to classify the error
  // by which leg trapped (begin_open vs the post-begin swap/activate legs).
  const stepRef = useRef<OpenStep>('idle')
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearSuccessTimer = useCallback(() => {
    if (successTimerRef.current) { clearTimeout(successTimerRef.current); successTimerRef.current = null }
  }, [])
  const goStep = useCallback((s: OpenStep) => {
    // Any new step supersedes a pending success→idle hand-off.
    if (s !== 'success') clearSuccessTimer()
    stepRef.current = s
    setStep(s)
  }, [clearSuccessTimer])

  /** Show `success` for a beat, then hand the panel back a usable CTA. */
  const goSuccessThenIdle = useCallback(() => {
    goStep('success')
    clearSuccessTimer()
    successTimerRef.current = setTimeout(() => {
      successTimerRef.current = null
      stepRef.current = 'idle'
      setStep('idle')
    }, SUCCESS_LINGER_MS)
  }, [goStep, clearSuccessTimer])

  useEffect(() => clearSuccessTimer, [clearSuccessTimer])

  const fail = useCallback((e: unknown) => {
    // The "live trading not enabled yet" contract gate only ever traps at
    // begin_open (step 1). The same WasmVm/InvalidAction signature thrown by a
    // POST-begin leg (swap/activate) is NOT that gate — it's an execution
    // failure, almost always the Aquarius pool quote falling under the oracle
    // floor. Classifying those as "live trading is being finalized" was
    // misleading; surface them as a liquidity/slippage retry instead.
    const phase = stepRef.current
    const postBegin = phase === 'swapping' || phase === 'activating'
    // `wasmTrap` is the generic Soroban trap (WasmVm/InvalidAction/Unreachable/
    // price-unavailable). At/before begin_open it means the live gate; after it,
    // it's a failed swap leg (pool quote under the oracle floor).
    const wasmTrap = isLiveTradingUnavailable(e)
    const mapped = readableMarginError(e)
    // A SPECIFIC diagnosis (e.g. the vault-upgrade gap mapped from
    // "non-existent contract function") always wins; only the generic gate copy
    // gets re-phrased for the post-begin swap leg.
    const live = wasmTrap && !postBegin && mapped === LIVE_GATE_COPY
    // A post-begin wasm trap is the pool quote falling under the floor — same
    // class of failure (and same fix) as an explicit "slippage too high".
    const poolTrap = wasmTrap && postBegin && mapped === LIVE_GATE_COPY
    // A balance trap on the swap leg is the VAULT/POOL running dry of the borrowed
    // asset, not the user's wallet — and the collateral is now locked in a pending
    // open. Say both things, since the generic copy said neither.
    const dryVault = postBegin && isBalanceError(e)
    // Post-begin, the collateral is already locked in a PendingOpen. Sending the
    // user back to the trade button ("try again") starts a SECOND begin_open and
    // strands the first one, so point at the recovery banner instead.
    const msg = poolTrap
      ? "Couldn't complete the swap — the market moved against the trade. Your collateral is safe: finish or cancel the pending trade below."
      : dryVault
        ? "The pool ran short of the asset this trade borrows. Your collateral is safe — cancel the pending trade below, then retry with a smaller size or less leverage."
        : mapped
    setUnavailable(live)
    // Keep these two mutually exclusive: `slippage` drives the raise-tolerance
    // callout, which must never appear for a gap the tolerance can't close.
    const oracleBand = isOracleFloorError(e)
    setSlippage(!oracleBand && (poolTrap || isSlippageError(e)))
    if (!oracleBand) setOracleFloor(null)
    setError(msg); goStep('error'); emit('error')
    // Calm, non-alarming surface for the known "not live yet" contract gate.
    // Errors stay put until dismissed: an open can strand a pending position, and
    // a 4-second toast is not enough time to read what to do about it.
    if (live) toast.info(msg)
    else toast.error(msg, { duration: Infinity, closeButton: true })
    releaseMarginFlow()
    // A post-begin failure left a PendingOpen on-chain, and both the message above
    // and the oracle/slippage callouts point at the recovery banner "below" — which
    // only renders once the positions sweep has seen the pending. Nothing used to
    // trigger that sweep on the error path, so for up to a full 15s poll the banner
    // the copy names simply wasn't on the page: the trader reads "cancel the pending
    // trade below", looks down, and finds nothing there.
    if (postBegin) onOpenedRef.current?.()
    return false
  }, [])

  /**
   * Steps 2–3 of the V3 open: run the on-chain swap, then activate. Shared by
   * fresh open and pending resume. Idempotent: if the execution read shows the
   * swap already landed on a prior attempt, skip straight to activation (never
   * double-swaps). Requotes before the swap (Aquarius pool state changes after
   * every trade) so we surface "slippage too high" BEFORE asking for a signature.
   */
  const finishFromPending = useCallback(async (
    user: string,
    positionId: bigint,
    pending: Pick<StellarPendingOpen, 'side' | 'borrowAmount' | 'minPositionAmount' | 'collateralPtokens'> & { marginAmount?: bigint },
    meta?: { leverage?: number; collateralUnderlying?: bigint; takeProfit?: number | null; stopLoss?: number | null },
  ): Promise<boolean> => {
    const side: PositionSide = pending.side
    const { swapInIdx, swapOutIdx } = SIDE_MAPPING[side]
    const dec = CFG.assets.XLM.decimals

    // Resume idempotency: if the swap already executed for this pending (step 2
    // done on a prior attempt), don't swap again — just activate.
    let execution = await getPendingPerpsOpenExecution(positionId)

    if (!execution) {
      // Step 2: requote first — if the live pool no longer clears the pending's
      // min output, fail fast with a readable error instead of a signed revert.
      // The V3 minimum covers the TOTAL position (margin × leverage), and the
      // on-chain swap moves the margin along with the borrow for a Long — so the
      // comparable quote is margin+borrow in, plus the margin itself for a Short
      // (whose margin already IS the position asset).
      goStep('swapping'); emit('swapping')
      const marginUnderlying =
        pending.marginAmount != null && pending.marginAmount > BigInt(0)
          ? pending.marginAmount
          : ptokensToUnderlying(pending.collateralPtokens, await vaultGetExchangeRate(CFG.assets.MOCK_USDT.vault))
      const expectedTotal = side === 'Long'
        ? await estimatePoolSwap(swapInIdx, swapOutIdx, marginUnderlying + pending.borrowAmount)
        : marginUnderlying + await estimatePoolSwap(swapInIdx, swapOutIdx, pending.borrowAmount)
      if (expectedTotal < pending.minPositionAmount) {
        // NOT "slippage too high": the minimum is already written into the on-chain
        // PendingOpen, so no tolerance the user picks can move it. Raising it and
        // re-firing would only open a second pending and strand this one.
        throw new Error('pending minimum no longer met by the live quote')
      }
      const swapRes = await swapOpenPositionV3(user, positionId)
      // Let the RPC's simulation view catch up to the swap before building the
      // activate transaction. Without this, activate is simulated against the
      // PRE-swap state — the simulation passes, produces a footprint for a world
      // that no longer exists, and the signed tx traps on application. That is the
      // whole of N25: it failed on the first attempt every time and succeeded on an
      // identical retry, because the retry was simply late enough.
      await waitForLedgerBeyond(swapRes.ledger)
      // Read what the swap actually delivered (journal + safety); fail-soft.
      execution = await getPendingPerpsOpenExecution(positionId)
    }

    // Step 3: activate — deposits the position asset, rechecks health, marks Open.
    //
    // Retried once. Observed live: activate reverts on the first attempt and then
    // succeeds on an identical retry seconds later, with the swap already landed —
    // the signature of state that moved between simulation and application (an
    // interest clock ticking, an oracle entry rolling over), not of a trade that
    // shouldn't happen. Left alone, the user lands in the recovery banner and has
    // to press "Finish" to do exactly what this does.
    //
    // Safe to repeat: the swap is behind the `!execution` guard above, so a retry
    // can only re-attempt the activation itself, never re-swap. A genuine failure
    // (health check, expiry) just costs one extra attempt before surfacing.
    goStep('activating'); emit('activating')
    let actRes: Awaited<ReturnType<typeof activateOpenPositionV3>>
    try {
      actRes = await activateOpenPositionV3(user, positionId)
    } catch (firstErr) {
      console.warn('[margin] activate failed, retrying once', firstErr)
      await new Promise((r) => setTimeout(r, ACTIVATE_RETRY_DELAY_MS))
      actRes = await activateOpenPositionV3(user, positionId)
    }

    goSuccessThenIdle(); emit('success', actRes.hash)
    toast.success('Position opened')

    // Persist to the trade journal (Trades/History tabs). Never throws, and the
    // success UI has already fired above, so awaiting it costs the user nothing —
    // but `onOpened` refetches that journal, and firing it before the row lands
    // returned a Trades list without the trade just placed. It stayed missing
    // until a full page reload. Entry price is stamped server-side from the real
    // feed. Prefer the executed swap output; fall back to a fresh estimate if the
    // execution read failed.
    // For a Short the execution reports the controller's custodied USDT, which
    // includes the margin — so the estimate fallback has to add the margin too,
    // or the two paths disagree by the whole stake and the entry price derived
    // from them lands in a different universe depending on which one ran.
    const marginRawForEntry = pending.marginAmount ?? BigInt(0)
    const positionAmountRaw =
      execution && execution.positionAmount > BigInt(0)
        ? execution.positionAmount
        : (side === 'Short' ? marginRawForEntry : BigInt(0)) +
          (await estimatePoolSwap(swapInIdx, swapOutIdx, pending.borrowAmount))
    const positionAmountHuman = Number(positionAmountRaw) / 10 ** dec
    const borrowHuman = Number(pending.borrowAmount) / 10 ** dec

    // The price the trade actually got, not the feed price the panel showed.
    // Passing it explicitly stops the server stamping `fetchXlmSpot()` — which
    // measured every trade's PnL, chart entry line and TP/SL reference against a
    // price nobody was filled at.
    const executedEntry = executionEntryPrice({
      side,
      collateralUnderlying: meta?.collateralUnderlying ?? marginRawForEntry,
      borrowAmount: pending.borrowAmount,
      positionAmount: positionAmountRaw,
      usdtDecimals: CFG.assets.MOCK_USDT.decimals,
      xlmDecimals: CFG.assets.XLM.decimals,
    })
    const journalRow: MarginTradeClientInput = {
      positionId: positionId.toString(),
      eventType: 'open',
      side,
      collateralSymbol: CFG.assets.MOCK_USDT.label,
      collateralAmount: meta?.collateralUnderlying != null ? Number(meta.collateralUnderlying) / 10 ** dec : undefined,
      positionSymbol: side === 'Long' ? CFG.assets.XLM.label : CFG.assets.MOCK_USDT.label,
      positionAmount: positionAmountHuman,
      borrowAmount: borrowHuman,
      // XLM-denominated exposure: Long holds XLM, Short owes XLM.
      xlmAmount: side === 'Long' ? positionAmountHuman : borrowHuman,
      entryPriceUsd: executedEntry ?? undefined,
      leverageX100: meta?.leverage != null ? Math.round(meta.leverage * 100) : undefined,
      takeProfitUsd: meta?.takeProfit ?? undefined,
      stopLossUsd: meta?.stopLoss ?? undefined,
      // The activation is the transaction that made the position exist, so it's
      // the one the History row should link to. Since the open was split into
      // three signatures nothing passed a hash here any more, and every trade
      // opened after that lost its explorer link — older rows still have theirs,
      // which makes it read like the new trades didn't happen on-chain.
      txHash: actRes.hash,
    }

    /**
     * The journal write is not bookkeeping when a trigger rides on it.
     *
     * TP/SL lives ONLY in this row — nothing on-chain knows about it — so a
     * rejected write means the position is now open, leveraged, and unprotected
     * while the celebration says otherwise. `recordMarginTrade` reports whether
     * the row landed precisely so this branch can exist (see its docstring); the
     * result used to be discarded here, which made the failure invisible.
     *
     * A kit wallet's session expires, and that is the common cause. Ask for the
     * signature once and retry — the same recovery `handleSetTpSl` does on the
     * page — but only when a trigger is actually at stake: a signature prompt on
     * top of a landed trade is worth it to save a stop-loss, not to save a
     * History row.
     */
    const wantsTpSl = meta?.takeProfit != null || meta?.stopLoss != null
    let recorded = await recordMarginTrade(getAccessToken, user, journalRow)
    if (!recorded && wantsTpSl && walletSessionRef.current.source === 'kit') {
      if (await walletSessionRef.current.signIn()) {
        recorded = await recordMarginTrade(getAccessToken, user, journalRow)
      }
    }
    if (!recorded) {
      if (wantsTpSl) {
        toast.error(
          'Your position is open, but your take-profit / stop-loss could not be saved — nothing is watching it. ' +
          'Set them again from Positions.',
          { id: `margin-open-tpsl-unsaved-${positionId}`, duration: Infinity, closeButton: true },
        )
      } else {
        // No trigger at stake: the position is fine, only its History row is
        // missing. Say so briefly rather than letting the trade look unrecorded.
        toast.warning('Your position is open, but it could not be saved to your trade history.', {
          id: `margin-open-unjournaled-${positionId}`,
        })
      }
    }

    // Hand the position up only when its triggers are actually recorded: the
    // always-on keeper is armed from this, and arming cover for levels that
    // failed to save would leave the server watching for a stop the UI doesn't
    // know about.
    onOpened?.(recorded && wantsTpSl
      ? { positionId: positionId.toString(), takeProfit: meta?.takeProfit ?? null, stopLoss: meta?.stopLoss ?? null }
      : undefined)
    releaseMarginFlow()
    return true
  }, [onOpened, getAccessToken, goStep, goSuccessThenIdle])

  const openPosition = useCallback(async (params: OpenParams): Promise<boolean> => {
    if (isMarginFlowBusy()) return rejectBusy()

    const { side, collateralPtokens, leverage, slippageBps, takeProfit, stopLoss } = params
    if (collateralPtokens <= BigInt(0)) { toast.error('Add margin collateral first.'); return false }
    if (leverage < 2 || leverage > CFG.constants.MAX_LEVERAGE) { toast.error(`Choose leverage between 2× and ${CFG.constants.MAX_LEVERAGE}×.`); return false }

    if (!address) { toast.error('Connect your wallet first.'); return false }

    acquireMarginFlow('open')
    setError(null); setUnavailable(false); setSlippage(false); setOracleFloor(null); setPendingPositionId(null)

    try {
      const usdt = CFG.assets.MOCK_USDT
      const xlm = CFG.assets.XLM

      // ── Step 0: quote + compute the slippage floor ─────────────────────────
      goStep('quoting'); emit('quoting')

      const [rate, marginPtokens, usdtPrice, xlmPrice] = await Promise.all([
        vaultGetExchangeRate(usdt.vault),
        getMarginBalancePtokens(address, usdt.token),
        getPriceUsd(usdt.token),
        getPriceUsd(xlm.token),
      ])
      if (marginPtokens < collateralPtokens) {
        throw new Error('insufficient margin balance')
      }
      if (!usdtPrice || !xlmPrice) {
        // Mirrors the contract's null-price trap — surface it as the calm gate.
        throw new Error('price unavailable')
      }

      // Margin is always USDT. The oracle min-out the contract checks is
      // denominated in the POSITION asset, so debt/position prices flip by side:
      // Long borrows USDT → holds XLM; Short borrows XLM → holds USDT.
      const debtPrice = side === 'Long' ? usdtPrice : xlmPrice
      const positionPrice = side === 'Long' ? xlmPrice : usdtPrice
      const { borrowAmount, oracleMinOut, collateralUnderlying } = computeBorrowAndFloor({
        collateralPtokens,
        exchangeRate: rate,
        leverage,
        // A Short borrows the FULL notional — without this the liquidity check
        // and the swap's min-out were both a leverage step too small.
        side,
        collateralPrice: { num: usdtPrice.price, den: usdtPrice.scale },
        debtPrice: { num: debtPrice.price, den: debtPrice.scale },
        positionPrice: { num: positionPrice.price, den: positionPrice.scale },
      })
      if (borrowAmount <= BigInt(0)) throw new Error('Borrow amount is zero')

      // ── Liquidity pre-flight ───────────────────────────────────────────────
      // Step 2 borrows the debt asset OUT of its vault before swapping. If the
      // vault doesn't hold that much, the token transfer traps mid-flow — after
      // begin_open has already locked the user's collateral into a PendingOpen
      // they then have to cancel by hand. Check the vault's actual cash first and
      // refuse cleanly, before anything is signed or locked.
      //
      // This binds on SHORTS in practice: a Short borrows XLM (real, finite
      // testnet liquidity) while a Long borrows mock-USDT (mintable, effectively
      // unlimited) — which is why a 3× short trapped where the same 3× long ran.
      const debtAsset = side === 'Long' ? usdt : xlm
      const vaultCash = await getTokenBalance(debtAsset.token, debtAsset.vault)
      if (vaultCash < borrowAmount) {
        const need = formatUnitsToDecimal(borrowAmount, debtAsset.decimals)
        const have = formatUnitsToDecimal(vaultCash, debtAsset.decimals)
        const fmt = (v: string) => Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })
        throw new Error(
          `Not enough ${debtAsset.label} liquidity to borrow for this trade. ` +
          `The pool has ${fmt(have)} ${debtAsset.label}, this trade needs ${fmt(need)}. ` +
          `Lower your leverage or open a smaller size.`,
        )
      }

      // The V3 minimum covers the TOTAL position (margin × leverage), so the
      // comparable live quote is the FULL swap: margin + borrow in for a Long
      // (the contract swaps the margin too); borrow in plus the margin itself
      // for a Short (its margin already is the position asset).
      const { swapInIdx, swapOutIdx } = SIDE_MAPPING[side]
      // What the on-chain swap will hand back, in the position asset. A Long
      // pushes margin + borrow through the pool. A Short pushes ONLY its borrow
      // — which, now that the borrow is the full notional, is already the whole
      // comparable quote.
      //
      // This used to add the margin on the Short side. That was correct only
      // while the borrow was a leverage step too small: the two errors cancelled
      // to roughly the right number (measured: min-out 974 against proceeds of
      // 982 — it passed by 0.8%). With the borrow corrected the margin term
      // double-counts, and a live 5× short trapped in `swap_open_position_v3`
      // because the min-out it produced (1163) sat above anything the pool could
      // return (~975). The contract compares against the SWAP OUTPUT, not the
      // custodied total.
      const expectedOut = await estimatePoolSwap(
        swapInIdx,
        swapOutIdx,
        side === 'Long' ? collateralUnderlying + borrowAmount : borrowAmount,
      )
      const { amountWithSlippage } = resolveMinOut({ oracleMinOut, expectedOut, slippageBps })
      // A rejection HERE is always the oracle band, never the user's tolerance —
      // `userMinOut` is derived from `expectedOut` and so can never exceed it, which
      // makes `expectedOut < max(floor, userMinOut)` equivalent to `expectedOut <
      // floor` (see describeMinOutShortfall.oracleBound, pinned by test). This used
      // to throw 'slippage too high', which sent the panel into a 100→4000 bps
      // ladder that re-submitted an identical `amount_with_slippage` on every rung
      // and then blamed the user's settings. Say what's actually true instead.
      const shortfall = describeMinOutShortfall({ oracleMinOut, expectedOut, slippageBps })
      if (shortfall.blocked) {
        setOracleFloor({ gapPct: shortfall.poolGapPct, maxGapPct: shortfall.maxGapPct })
        throw new Error(
          `${ORACLE_FLOOR_SIGNATURE}: pool is ${shortfall.poolGapPct?.toFixed(2) ?? '?'}% off the reference ` +
          `price, protocol allows ${shortfall.maxGapPct}%`,
        )
      }

      // ── Step 1: begin_open_position_v3 ─────────────────────────────────────
      goStep('beginning'); emit('beginning')
      const { positionId, ledger: beginLedger } = await beginOpenPositionV3(address, {
        marginAsset: usdt.token,   // fixed for the pair
        baseAsset: xlm.token,
        marginPtokens: collateralPtokens,
        leverage,
        side,
        amountWithSlippage,
      })
      setPendingPositionId(positionId.toString())

      // The read below — and every transaction built from it — goes through the
      // RPC's simulation snapshot, which trails `getTransaction` SUCCESS by up to a
      // ledger. Without this wait `get_pending_perps_open` can answer from a state
      // where the pending doesn't exist yet ("Missing pending open after begin" on a
      // begin that demonstrably landed), and the swap that follows is simulated
      // against that same stale world. Same class as N25.
      await waitForLedgerBeyond(beginLedger)

      // Read canonical pending state — use contract's borrow_amount / min, not ours.
      const pending = await getPendingPerpsOpen(positionId)
      if (!pending) throw new Error('Missing pending open after begin')

      // ── Steps 2–3 ──────────────────────────────────────────────────────────
      return await finishFromPending(address, positionId, pending, { leverage, collateralUnderlying, takeProfit, stopLoss })
    } catch (e) {
      return fail(e)
    }
  }, [address, fail, finishFromPending, onOpened, goStep, goSuccessThenIdle])

  const resumePending = useCallback(async (pending: StellarPendingOpenView): Promise<boolean> => {
    if (isMarginFlowBusy()) return rejectBusy()
    if (!address) { toast.error('Connect your wallet first.'); return false }
    // Expiry only blocks the not-yet-swapped path. Once the swap executed, the
    // contract explicitly supports activating past the pending deadline.
    if (pending.isExpired && !pending.hasExecution) {
      toast.error('This pending position has expired. Cancel it instead.')
      return false
    }

    acquireMarginFlow('open')
    setError(null); setSlippage(false); setOracleFloor(null); setPendingPositionId(pending.id)
    try {
      // Reconstruct the journal meta from the pending itself. Resuming used to pass
      // none, so a position finished through the recovery banner got a journal row
      // with no leverage and no collateral — and the positions table, which prefers
      // the RECORDED leverage over the derived one, then fell back to the derived
      // value. A 3× trade rescued by the banner showed up as 1.2×.
      //
      // TP/SL genuinely can't be recovered here: they're never written on-chain and
      // only reach the journal on the row we're now writing, so a trade that
      // stranded before activation loses them. The banner-resumed position comes
      // back without triggers — the user has to set them again on the row.
      const marginRaw = pending.marginAmountRaw ?? BigInt(0)
      const leverage = await resumeLeverage(pending.side, marginRaw, pending.borrowAmountRaw)
      return await finishFromPending(address, pending.positionId, {
        side: pending.side,
        borrowAmount: pending.borrowAmountRaw,
        minPositionAmount: pending.minPositionAmountRaw,
        collateralPtokens: pending.collateralPtokens,
        marginAmount: pending.marginAmountRaw ?? undefined,
      }, {
        leverage,
        collateralUnderlying: marginRaw > BigInt(0) ? marginRaw : undefined,
      })
    } catch (e) {
      return fail(e)
    }
  }, [address, fail, finishFromPending])

  const reset = useCallback(() => {
    clearSuccessTimer()
    goStep('idle'); setError(null); setUnavailable(false); setSlippage(false); setOracleFloor(null); setPendingPositionId(null); releaseMarginFlow()
  }, [goStep, clearSuccessTimer])

  return {
    openPosition,
    resumePending,
    step,
    stepLabel: STEP_LABEL[step],
    error,
    /** The known "live trading not enabled yet" contract gate (calm UI state). */
    unavailable,
    slippage,
    oracleFloor,
    isLoading: step !== 'idle' && step !== 'success' && step !== 'error',
    pendingPositionId,
    reset,
  }
}

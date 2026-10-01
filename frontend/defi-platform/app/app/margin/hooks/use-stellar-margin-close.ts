'use client'

/**
 * use-stellar-margin-close
 *
 * V3 SPLIT close — the budget-safe replacement for the atomic
 * `close_position_v3`, which trapped with `Error(Budget, ExceededLimit)` on
 * heavier positions (swap-back + repay + oracle reads exceeded the Soroban
 * per-tx CPU budget). Each leg is now its own transaction, mirroring the split
 * open:
 *
 *   1. prepare_close_position_v3(user, id)   → snapshot + PendingClose + the
 *                                              collateral moved into the
 *                                              controller, in ONE transaction
 *   2. get_pending_perps_close(id)           → read collateral_underlying
 *   3. the swap leg — a DIFFERENT entrypoint per side:
 *        Long   swap_close_position_v3(user, id, min_out)
 *               sell all the XLM collateral, guarded by a minimum
 *        Short  swap_close_short_position_v3(user, id, amount_in, min_debt_out)
 *               buy back just the XLM debt; the rest of the USDT margin is
 *               returned to free margin instead of being sold and re-bought
 *   4. finish_close_position_v3(id)          → repay debt, return rest to margin
 *      └─ dust fallback: if finish can't fully repay (interest accrued between
 *         swap and finish), repay the small delta from the wallet, retry finish.
 *
 * Step 1 used to be two calls (`begin_close` then `withdraw_close`) that had to
 * land within ~2 ledgers of each other, and every close that missed that window
 * left a position sitting in `Closing`. The 2026-08-31 contract upgrade folds
 * them into `prepare_close_position_v3`, so the window — and the auto-chaining,
 * the unwind-on-withdraw-failure branch, and the whole "begun but never
 * withdrawn" state — are gone.
 *
 * A debt-free position never enters this flow at all: there is nothing to swap
 * and nothing to repay, so `release_debt_free_position_v3` hands the collateral
 * straight back — see the zero-debt branch of `closePosition`'s pre-flight.
 *
 * `amount_with_slippage` (step 3) is the minimum swap output in the DEBT asset.
 * We fold two floors and pass the stricter — the contract's oracle floor and the
 * live Aquarius quote minus the user tolerance — sized off the ACTUAL withdrawn
 * collateral the pending reports (hybrid), falling back to the pToken estimate.
 *
 * Pre-checks run BEFORE any signature, so a doomed close never strands a pending:
 *   - debt already 0 → release instead of close;
 *   - live quote under the current debt → underwater (a user close would revert;
 *     bad-debt absorption is liquidation-only) → clear message, nothing signed.
 *
 * `finish` landing is not proof the position is gone: a residual left by interest
 * accruing mid-close keeps it in `Closing` (the contract books a `close_residual`
 * and settles it later). So the flow re-reads the position afterwards and reports
 * `settling` — "settlement pending" — instead of claiming a close it can't see.
 *
 * If a leg fails mid-flow the collateral is safe in a PendingClose: recover with
 * `finishPendingClose` (crank), `cancelPendingClose` (before the swap), or
 * `expirePendingClose` (after timeout). All three are surfaced by the positions
 * panel's recovery banner.
 */
import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'
import { usePrivy } from '@privy-io/react-auth'
import { useStellarWallet } from '@/hooks/use-stellar-wallet'
import { STELLAR_MARGIN_CONFIG as CFG, SIDE_MAPPING, assetByToken } from '../config/stellarMarginConfig'
import { recordMarginTrade, reportCloseFailure } from './use-stellar-margin-journal'
import { requestMarginRefresh } from './use-stellar-margin-positions'
import {
  vaultGetMarginBorrowBalance,
  vaultGetAvailableLiquidity,
  vaultGetExchangeRate,
  getPriceUsd,
  estimatePoolSwap,
  getTokenBalance,
  prepareClosePositionV3,
  releaseDebtFreePositionV3,
  getPendingPerpsClose,
  getPosition,
  swapClosePositionV3,
  swapCloseShortPositionV3,
  finishClosePositionV3,
  cancelClosePositionV3,
  expireClosePositionV3,
  repayMarginPositionV3,
  ptokensToUnderlying,
  waitForLedgerBeyond,
  controllerUsesPoolCloseFloor,
} from '@/lib/stellar-margin'
import {
  computeCloseFloor,
  resolveMinOut,
  executionExitPrice,
  dustRepayAmount,
  zeroDebtVerdict,
  shortCloseDebtTarget,
  shortCloseFloorVerdict,
  solveShortCloseInput,
  maxClosableShortDebt,
} from '../lib/marginMath'
import { readableMarginError, isDustFailure, isBalanceError } from '../lib/stellarMarginErrors'
import { isMarginFlowBusy, busyMarginFlowKind, acquireMarginFlow, releaseMarginFlow } from '../lib/marginFlowLock'
import type { StellarMarginPosition, StellarPendingCloseView, PositionSide } from '../types/stellarMargin'

export type CloseStep =
  | 'idle'
  | 'checking'
  | 'preparing'    // step 1/3 — snapshot + collateral out, one transaction
  | 'swapping'     // step 2/3
  | 'finishing'    // step 3/3 (+ dust repay)
  | 'releasing'    // debt-free shortcut: no swap, no finish
  | 'settling'     // finish landed, a residual keeps the position in `Closing`
  | 'success'
  | 'error'

/** User slippage tolerance for the close swap (bps). The oracle floor still
 *  wins whenever it is stricter. */
const CLOSE_SLIPPAGE_BPS = 100

/**
 * Why a close can't clear its minimum.
 *
 * The generic "slippage too high" copy tells the user to raise their tolerance and
 * try a smaller size. On a close both are impossible: the tolerance is fixed
 * (CLOSE_SLIPPAGE_BPS) and there is no partial close. The binding constraint is the
 * on-chain floor, `size × oracle price × (1 − MAX_SLIPPAGE)`.
 *
 * Two different things push a swap under that floor: the position being big enough
 * that its own price impact eats the band (a Long stops clearing somewhere
 * around 15–20k XLM), or the whole Aquarius pool trading below the oracle,
 * which blocks every size at once. Telling them apart needs a second quote, and
 * neither is fixable by the user anyway — there is no partial close and no dial to
 * turn. So state the measured fact and stop short of naming a cause: an earlier
 * draft said "this position is too large for the pool", which was simply wrong for a
 * 217 XLM position on a day the pool sat 5% under the oracle, and would have sent
 * the trader hunting for a smaller size that doesn't exist.
 */
function closeFloorMessage(oracleMinOut: bigint, expectedOut: bigint, floorBinds: boolean): string {
  if (!floorBinds) return 'slippage too high'
  const short = Number(oracleMinOut - expectedOut) / Number(oracleMinOut)
  return (
    `Closing isn’t possible right now — the XLM pool is paying about ${(short * 100).toFixed(1)}% ` +
    `less than the contract will accept for this position, so the close would revert. ` +
    `Nothing was signed and your position is untouched. This usually clears on its own as the ` +
    `pool and the price move back together.`
  )
}

/** A finish shortfall larger than this fraction of the debt is NOT interest dust
 *  — it's genuine slippage/underwater. Cap the auto-repay so a bad close can
 *  never silently drain a large amount from the user's wallet. */
const MAX_DUST_FRACTION_BPS = 200 // 2%

/**
 * How much of a finish shortfall may be repaid automatically, or null when the
 * gap is too big to be interest dust. Pure logic lives in marginMath; this binds
 * it to the hook's cap.
 *
 * The cap used to exist only on the swap-and-finish path. The recovery banner's
 * already-swapped branch repaid `min(walletBalance, fullDebt)` instead, so a
 * close whose swap came in badly short quietly pulled the whole difference out of
 * the wallet on a button labelled "Finish close" — the exact drain the cap was
 * written to prevent, reachable by the one button a stuck trader is most likely
 * to press. Both paths now go through here.
 */
const cappedDustRepay = (freshDebt: bigint, proceeds: bigint, walletBalance: bigint) =>
  dustRepayAmount({ freshDebt, proceeds, walletBalance, maxDustBps: MAX_DUST_FRACTION_BPS })

/** Raw units → a readable amount, for copy that has to name real numbers. */
function humanAmount(raw: bigint, decimals: number): string {
  const n = Number(raw) / 10 ** decimals
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

/**
 * The close is blocked because the vault can't pay the collateral out — not
 * because anything is wrong with the position, and emphatically not because of
 * the trader's own balance.
 *
 * Both numbers are named on purpose. "Not enough liquidity" alone invites the
 * two wrong reactions this failure kept producing: pressing Close again (it
 * fails identically) and topping the wallet up (it changes nothing). Seeing
 * 11,258 needed against 10,319 available makes it obvious that this is someone
 * else's borrow to repay, and that a smaller position is unaffected.
 */
function liquidityShortfallMessage(input: {
  needed: bigint
  available: bigint
  decimals: number
  label: string
}): string {
  const { needed, available, decimals, label } = input
  return (
    `Not enough ${label} in the lending pool to release this position right now — it holds ` +
    `${humanAmount(needed, decimals)} ${label} and the pool can pay out ${humanAmount(available, decimals)} ${label}. ` +
    `Nothing was signed and your position is untouched. This frees up as borrowers repay, ` +
    `usually within a few hours — smaller positions can still be closed in the meantime.`
  )
}

/**
 * A Short whose closing swap can't clear the contract's floor.
 *
 * Deliberately NOT the Long copy. A Long in this spot has nothing to do but
 * wait, which is why {@link closeFloorMessage} stops at stating the fact. A
 * Short has a lever: the swap only has to buy the DEBT back, so repaying part of
 * the debt shrinks the swap until it fits inside the band — and the repay dialog
 * is one tap away in the same row. Naming the amount is the difference between a
 * dead end and an instruction.
 *
 * `repayNeeded <= 0` means no size clears right now (the whole pool is outside
 * the band), so there is no amount to name and we fall back to the plain fact.
 */
function shortCloseFloorMessage(input: {
  shortfall: number
  repayNeeded: bigint
  decimals: number
  label: string
}): string {
  const { shortfall, repayNeeded, decimals, label } = input
  const gap = `about ${(shortfall * 100).toFixed(1)}%`
  if (repayNeeded <= BigInt(0)) {
    return (
      `Closing isn’t possible right now — buying your ${label} debt back costs ${gap} more than ` +
      `the contract will accept, so the close would revert. Nothing was signed and your position ` +
      `is untouched. This clears on its own as the pool and the reference price move back together.`
    )
  }
  return (
    `This position is too large to close in one go right now: buying the whole ${label} debt back ` +
    `costs ${gap} more than the contract will accept. Repay about ` +
    `${humanAmount(repayNeeded, decimals)} ${label} first — use “Add Margin” on this position — ` +
    `and the close will go through. Nothing was signed and your position is untouched.`
  )
}

/**
 * `finish_close_position_v3` landed — is the position actually gone?
 *
 * Not necessarily. Interest keeps accruing while the close is in flight, so the
 * swap proceeds can come up a few stroops short of the debt they were sized
 * against. The contract no longer reverts for that: it books what it could
 * (`close_residual`), keeps the remainder, and leaves the position in `Closing`
 * until the residual settles. Reporting that as "Position closed" would send the
 * trader to a History row for a position still sitting in their list.
 *
 * Fail-soft on purpose. A read that doesn't answer must not invent a residual —
 * the positions sweep re-reads every 15s and raises the settlement notice on its
 * own, so the cost of guessing "closed" here is a banner arriving a beat late,
 * while the cost of guessing "pending" is telling a finished trader to wait.
 */
async function settlementPendingAfterFinish(positionId: bigint, finishLedger?: number): Promise<boolean> {
  try {
    if (finishLedger) await waitForLedgerBeyond(finishLedger)
    const after = await getPosition(positionId)
    return after?.status === 'Closing'
  } catch {
    return false
  }
}

/** Shown when `finish` succeeded but a residual keeps the position open. Says
 *  what is true — the trade is done, the bookkeeping isn't — without implying
 *  the trader has anything left to do. */
const SETTLEMENT_PENDING_COPY =
  'Your position was settled — the last of the interest is still being squared up, so it stays ' +
  'listed for a few minutes. Nothing more to do; your funds are already accounted for.'

const STEP_LABEL: Record<CloseStep, string> = {
  idle: '',
  checking: 'Preparing close…',
  preparing: 'Closing position · 1/3',
  swapping: 'Settling your position · 2/3',
  finishing: 'Returning your funds · 3/3',
  releasing: 'Returning your collateral…',
  settling: 'Settlement pending',
  success: 'Position closed',
  error: 'Couldn’t complete',
}

function emit(step: CloseStep, hash?: string) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('peridot:tx-update', {
    detail: { action: 'margin-close-position', step, statusMessage: STEP_LABEL[step], txHash: hash },
  }))
}

export interface UseStellarMarginCloseResult {
  closePosition: (position: StellarMarginPosition) => Promise<boolean>
  /** Crank a stranded pending close to completion (permissionless finish, with
   *  the dust fallback). Used by the recovery banner. */
  finishPendingClose: (view: StellarPendingCloseView) => Promise<boolean>
  /** Unwind a pending close BEFORE its swap ran, returning collateral. */
  cancelPendingClose: (view: StellarPendingCloseView) => Promise<boolean>
  /** Expire a stalled pending close after timeout (permissionless). */
  expirePendingClose: (view: StellarPendingCloseView) => Promise<boolean>
  step: CloseStep
  stepLabel: string
  error: string | null
  isLoading: boolean
  reset: () => void
}

/**
 * Close serialization is process-wide, not per-hook-instance — and now shared with
 * the OPEN flow (see lib/marginFlowLock).
 *
 * Three instances of this hook are mounted at the same time — the page-level recovery
 * banner, the positions panel, and the TP/SL monitor — and each used to guard itself
 * with its own `busyRef`. That guarded nothing across instances: a take-profit could
 * fire while the trader was already mid-close by hand. The split close requires
 * `withdraw` to land within ~2 ledgers of `begin`, so two interleaved signature prompts
 * can blow that window and strand the position in a pending close.
 *
 * The same reasoning applies across flow KINDS: every leg is signed by the same
 * Stellar account, whose sequence number is read fresh per transaction, so an open
 * running against a close races it into txBadSeq. The lock therefore lives in a
 * shared module both hooks acquire.
 */
const isCloseBusy = isMarginFlowBusy
/** @deprecated kept as the TP/SL monitor's stand-down check — now covers open too. */
export const isMarginCloseBusy = isMarginFlowBusy
const acquireCloseLock = () => acquireMarginFlow('close')
const releaseCloseLock = releaseMarginFlow

/**
 * Refuse a close because another flow is running — and SAY so.
 *
 * A close is four transactions and can take the better part of a minute. Clicking
 * Close on a second position during that window used to return false with no toast,
 * no spinner, no error: the button simply did nothing, which reads as the app being
 * broken rather than busy. ("It closed one position but can't close another one.")
 *
 * The message names which flow is in the way: "still closing your other position" is
 * actively confusing when what's actually running is an open.
 */
function rejectBusy(): false {
  const msg = busyMarginFlowKind() === 'open'
    ? 'Still finishing your other trade — this one is next, give it a moment.'
    : 'Still closing your other position — this one is next, give it a moment.'
  toast.info(msg, { id: 'margin-close-busy' })
  return false
}

export function useStellarMarginClose(onClosed?: (positionId: string) => void): UseStellarMarginCloseResult {
  const { address } = useStellarWallet()
  const { getAccessToken } = usePrivy()
  const [step, setStepState] = useState<CloseStep>('idle')
  const [error, setError] = useState<string | null>(null)
  /**
   * The step, readable synchronously. `step` is state: inside the flow it is
   * always one render behind, so a failure report built from it would name the
   * leg BEFORE the one that actually threw. The ref is written by the same call
   * that schedules the render, so it is correct the instant the throw happens.
   */
  const stepRef = useRef<CloseStep>('idle')
  const setStep = useCallback((s: CloseStep) => { stepRef.current = s; setStepState(s) }, [])

  /**
   * @param ctx which position and which leg died. Optional only because the
   *   recovery actions below can fail before they know — everything that has a
   *   position in hand passes it, because a failure report without a position id
   *   and a side is exactly the report that was useless last time.
   */
  const setFail = useCallback((e: unknown, ctx?: { positionId: string; side?: PositionSide; assetLabel?: string }): boolean => {
    // Read the leg BEFORE anything below moves it. `setStep('error')` writes the
    // same ref, so reading it afterwards reported 'error' every single time —
    // which is the one value that carries no information, on the field the whole
    // report exists for. (Seen in the first live row: "[Short/error]".)
    const failedAt = stepRef.current
    // A token-balance trap on a close is NEVER the trader's wallet — the close
    // spends nothing of theirs. It is the vault being unable to hand back the
    // collateral because someone else has borrowed it. The generic map has no way
    // to know that and says "Insufficient token balance for this step", which is
    // both wrong and unactionable; the open path already learned this lesson
    // (`dryVault` in use-stellar-margin-open). The pre-flight gate above catches
    // the ordinary case before anything is signed — this covers the race where
    // liquidity drains between the check and the transfer.
    const asset = ctx?.assetLabel ?? 'this asset'
    const dryVault = isBalanceError(e) && failedAt !== 'idle' && failedAt !== 'checking'
    const msg = dryVault
      ? failedAt === 'preparing'
        ? `The lending pool ran short of ${asset} just as we went to release your collateral — someone else's borrow is using it. Nothing was spent, your position was put back exactly as it was, and this usually clears within a few hours.`
        : `The lending pool ran short of ${asset} part-way through this close. Your collateral is safe — finish or cancel the close from the notice below.`
      : readableMarginError(e, 'close')
    setError(msg); setStep('error'); emit('error')
    if (ctx) {
      // The RAW error, not the friendly copy: the whole point is to see the
      // panic text the user never gets shown. `failedAt` is where the flow was
      // standing when it threw — the difference between "the swap leg traps" and
      // "closes are broken".
      reportCloseFailure(getAccessToken, address, {
        positionId: ctx.positionId,
        side: ctx.side,
        step: failedAt,
        error: e instanceof Error ? e.message : String(e),
      })
    }
    // Long enough to read twice, but NOT forever.
    //
    // A failed close can leave a pending the user must act on, so the message has
    // to outlive the usual 4 seconds — that part was right. `duration: Infinity`
    // took it too far: sonner pins toasts to the bottom-right corner of the
    // viewport, which is exactly where the positions table's action column sits,
    // and the toast intercepts clicks. So an error about ONE position parked
    // itself on top of the Close button of ANOTHER, permanently, and the second
    // position then looked broken too — clicking it did nothing at all. Seen live:
    // three taps on a Close that was simply underneath a notice.
    //
    // The persistence now lives where it belongs, in the panel's own error banner
    // (`error` below), which sits IN the layout and pushes content instead of
    // covering it. Fixed id so a retry REPLACES the previous notice rather than
    // stacking on it.
    toast.error(msg, { id: 'margin-close-error', duration: 15_000, closeButton: true })
    releaseCloseLock()
    // Whatever went wrong, the chain has probably moved: a close that died after
    // `begin` left a PendingClose that the recovery banner exists to surface, and
    // an unwind put the position back. Re-read now instead of leaving the user
    // looking at the pre-failure picture until the next 15s tick.
    requestMarginRefresh()
    return false
  }, [address, getAccessToken, setStep])

  /**
   * Steps 3–4 (+ dust): swap the withdrawn collateral back to the debt asset at a
   * guarded minimum, then finish. Shared by a fresh close and a pending-close
   * resume. Assumes begin+withdraw already landed (collateral is in the
   * controller). Requotes off the pending's actual collateral before swapping so
   * "slippage too high" surfaces BEFORE the swap signature.
   */
  const swapAndFinish = useCallback(async (
    user: string,
    position: Pick<StellarMarginPosition, 'positionId' | 'side' | 'collateralToken' | 'debtToken' | 'collateralPtokens'>,
    // Returns the `finish` hash — the transaction that actually settled the close,
    // and the one the History row links to — plus the price the closing swap
    // actually got, which the journal stamps instead of the feed price, and
    // whether a residual left the position waiting to settle.
  ): Promise<{ hash?: string; exitPriceUsd?: number; settlementPending?: boolean }> => {
    const debt = assetByToken(position.debtToken)
    const positionAsset = assetByToken(position.collateralToken)
    if (!debt || !positionAsset) throw new Error('Unsupported market.')

    // By the time we get here prepare_close HAS landed: the collateral is out
    // of the position and sitting in the controller. A bare
    // throw from any check below therefore doesn't just cancel the close — it
    // STRANDS the position in `Closing` forever (observed on positions 22/24/25:
    // prepared, then nothing — collateral locked for days).
    //
    // Before the swap the pending is still cancellable, and cancel puts the
    // collateral back into the position. So unwind instead of abandoning: the
    // user ends up with the open position they started with and can retry,
    // rather than a trade that vanished. Attempting cancel is always safe — the
    // contract rejects it once the swap has executed, so a swap that actually
    // landed (e.g. our client timed out) can't be unwound by mistake.
    const abortBeforeSwap = async (err: Error): Promise<never> => {
      try {
        await cancelClosePositionV3(user, position.positionId)
        toast.info('Close cancelled — your collateral is back in the position.')
      } catch {
        /* couldn't unwind — the positions-panel recovery banner is the fallback */
      }
      throw err
    }

    /**
     * Run a read that the rest of this function depends on, unwinding instead of
     * abandoning if the node can't answer.
     *
     * These reads are strict now (`MarginReadUnavailableError` on transport
     * failure) precisely so a dropped request stops being silently read as "no
     * collateral" / "no debt". But past the withdraw, an escaping throw is the
     * one thing this function is built not to do: it leaves the position in
     * `Closing`. So the strictness is paid for here, where cancel is still
     * available and puts everything back.
     */
    const readOrUnwind = async <T,>(read: () => Promise<T>): Promise<T> => {
      try {
        return await read()
      } catch (e) {
        return abortBeforeSwap(e instanceof Error ? e : new Error(String(e)))
      }
    }

    // Canonical collateral to swap: what the contract actually withdrew. Fall
    // back to the pToken estimate if the pending doesn't expose it.
    let collateralUnderlying = await readOrUnwind(async () => {
      const pending = await getPendingPerpsClose(position.positionId)
      return pending?.collateralUnderlying ?? BigInt(0)
    })
    if (collateralUnderlying <= BigInt(0)) {
      const rate = await vaultGetExchangeRate(positionAsset.vault)
      collateralUnderlying = ptokensToUnderlying(position.collateralPtokens, rate)
    }

    if (collateralUnderlying <= BigInt(0)) {
      return abortBeforeSwap(new Error('Position has no collateral to close.'))
    }

    const [currentDebt, positionPrice, debtPrice] = await readOrUnwind(() => Promise.all([
      vaultGetMarginBorrowBalance(debt.vault, position.positionId),
      getPriceUsd(positionAsset.token),
      getPriceUsd(debt.token),
    ]))
    if (!positionPrice || !debtPrice) return abortBeforeSwap(new Error('price unavailable'))

    // Which floor the contract will hold this swap to — see
    // `controllerUsesPoolCloseFloor`. Read here as well as in the pre-flight
    // because the resume path enters this function directly; the answer is
    // cached, so the second read costs nothing.
    const oracleFloorActive = !(await controllerUsesPoolCloseFloor())

    // Close swaps position asset → debt asset: the reverse of the open swap.
    const { swapInIdx, swapOutIdx } = SIDE_MAPPING[position.side]
    const expectedOut = await readOrUnwind(async () => {
      const q = await estimatePoolSwap(swapOutIdx, swapInIdx, collateralUnderlying)
      // The quote is fail-soft (0 on any read problem) because its display
      // callers want a blank rather than a crash. Here 0 would walk straight
      // into the underwater branch and tell the trader their position can't
      // cover its debt — on the strength of a failed HTTP request. A pool
      // quoting exactly nothing for a non-zero input isn't a price, it's a
      // missing answer.
      if (q <= BigInt(0)) throw new Error('Couldn’t price the closing swap — please try again.')
      return q
    })

    // Underwater guard (also for the resume path, which skips the pre-flight):
    // proceeds must cover the debt or the swap/finish reverts.
    if (currentDebt > BigInt(0) && expectedOut < currentDebt) {
      return abortBeforeSwap(new Error(
        'This position is underwater — closing it wouldn’t cover the debt. It will be resolved by liquidation.',
      ))
    }

    // ── Step 3: swap collateral → debt ────────────────────────────────────────
    // The two sides take DIFFERENT entrypoints with different argument shapes
    // (see marginMath's short-close section). Everything above is shared; from
    // here the paths part.
    //
    // A revert on either leaves a pre-swap pending, so both unwind the same way.
    let swapLedger: number | undefined
    /** Swap input and output actually used, for the executed exit price. */
    let swapIn = collateralUnderlying
    let swapOut = expectedOut
    /** The minimum the swap was signed with — the guaranteed proceeds floor the
     *  dust fallback below measures a finish shortfall against. */
    let swapMinOut = BigInt(0)

    if (position.side === 'Short') {
      // Buy back exactly the XLM debt (plus the interest buffer) and leave the
      // rest of the margin in USDT. A debt-free Short has nothing to buy, but the
      // settlement still needs the swap leg to have run, so ask for one stroop.
      const targetOut = currentDebt > BigInt(0) ? shortCloseDebtTarget(currentDebt) : BigInt(1)

      // One solver, shared with the pre-flight. Two implementations of this
      // search would drift, and the drift is not cosmetic: the pre-flight decides
      // whether to sign at all based on the input it computes, so it has to
      // compute the input this leg actually sends. It verifies every rung against
      // a real quote and is bounded — each pass is an RPC round trip inside the
      // pending's window, and an unbounded search would trade a recoverable
      // failure for an expired pending.
      const sizing = await readOrUnwind(() => solveShortCloseInput({
        collateral: collateralUnderlying,
        quoteAtCollateral: expectedOut,
        targetOut,
        quote: (i: bigint) => estimatePoolSwap(swapOutIdx, swapInIdx, i),
      }))
      if (sizing.status !== 'ok') {
        return abortBeforeSwap(new Error(sizing.status === 'underwater'
          ? 'This position is underwater — closing it wouldn’t cover the debt. It will be resolved by liquidation.'
          : 'Couldn’t size the closing swap — the XLM pool kept moving. Nothing was signed; please try again.'))
      }
      const input = sizing.input
      const quoted = sizing.quoted

      swapIn = input
      swapOut = quoted
      swapMinOut = targetOut

      // The floor, measured against the input we actually solved for. The
      // pre-flight ran this before anything was signed; this copy is for the
      // resume path (which enters here directly) and for the pool having moved
      // since. Free — the numbers are already in hand.
      const verdict = shortCloseFloorVerdict({
        swapInput: input,
        targetOut,
        positionPrice: { num: positionPrice.price, den: positionPrice.scale },
        debtPrice: { num: debtPrice.price, den: debtPrice.scale },
        oracleFloorActive,
      })
      if (verdict.blocked) {
        const maxDebt = await maxClosableShortDebt({
          collateral: collateralUnderlying,
          positionPrice: { num: positionPrice.price, den: positionPrice.scale },
          debtPrice: { num: debtPrice.price, den: debtPrice.scale },
          quote: (i: bigint) => estimatePoolSwap(swapOutIdx, swapInIdx, i),
        }).catch(() => BigInt(0))
        return abortBeforeSwap(new Error(shortCloseFloorMessage({
          shortfall: verdict.shortfall,
          repayNeeded: currentDebt > maxDebt ? currentDebt - maxDebt : BigInt(0),
          decimals: debt.decimals,
          label: debt.label,
        })))
      }

      setStep('swapping'); emit('swapping')
      try {
        swapLedger = (await swapCloseShortPositionV3(user, position.positionId, input, targetOut)).ledger
      } catch (swapErr) {
        return abortBeforeSwap(swapErr instanceof Error ? swapErr : new Error(String(swapErr)))
      }
    } else {
      // Long: sell the whole XLM collateral. Size is implied by the withdraw, so
      // the only argument is the minimum — the stricter of the oracle floor and
      // the live quote minus the user tolerance.
      // Zero once the contract's own floor comes from the pool quote: keeping a
      // client-side oracle floor then would be the only thing left blocking a
      // close the contract would accept. `resolveMinOut` degrades to the user's
      // tolerance, which is what the newer contract compares against too.
      const oracleMinOut = oracleFloorActive
        ? computeCloseFloor({
            positionUnderlying: collateralUnderlying,
            positionPrice: { num: positionPrice.price, den: positionPrice.scale },
            debtPrice: { num: debtPrice.price, den: debtPrice.scale },
          })
        : BigInt(0)
      const { userMinOut, amountWithSlippage } = resolveMinOut({ oracleMinOut, expectedOut, slippageBps: CLOSE_SLIPPAGE_BPS })
      if (expectedOut < amountWithSlippage) {
        // Pool quote under the required minimum. Which minimum decides the advice.
        return abortBeforeSwap(new Error(closeFloorMessage(oracleMinOut, expectedOut, oracleMinOut > userMinOut)))
      }

      swapMinOut = amountWithSlippage
      setStep('swapping'); emit('swapping')
      try {
        swapLedger = (await swapClosePositionV3(user, position.positionId, amountWithSlippage)).ledger
      } catch (swapErr) {
        return abortBeforeSwap(swapErr instanceof Error ? swapErr : new Error(String(swapErr)))
      }
    }

    // The price this close is filling at, quoted off the exact size that was
    // swapped — for a Short that is the solved input, not the whole collateral,
    // or the fill would be priced against USDT that never moved. The quote is the
    // pool's own arithmetic for that input, so it is the executed rate, and it is
    // the last read before the signature, so it can't drift the way a post-hoc
    // spot lookup does. Stamped on the History row so realized PnL is measured
    // entry-pool → exit-pool instead of entry-pool → feed.
    const exitPriceUsd = executionExitPrice({
      side: position.side,
      positionUnderlying: swapIn,
      proceeds: swapOut,
      usdtDecimals: CFG.assets.MOCK_USDT.decimals,
      xlmDecimals: CFG.assets.XLM.decimals,
    }) ?? undefined
    // Same simulation lag the open hits between its swap and activate (see N25):
    // building finish before the RPC has the swap simulates against pre-swap state
    // and traps on application. Safe to wait here — unlike begin→withdraw above,
    // which must land inside ~2 ledgers and is deliberately left auto-chained.
    await waitForLedgerBeyond(swapLedger)

    // Step 4: finish (permissionless) — repay debt, return remainder to margin.
    setStep('finishing'); emit('finishing')
    try {
      const res = await finishClosePositionV3(user, position.positionId)
      emit('finishing', res.hash)
      return {
        hash: res.hash,
        exitPriceUsd,
        settlementPending: await settlementPendingAfterFinish(position.positionId, res.ledger),
      }
    } catch (finishErr) {
      // Dust fallback: interest accrued between the swap and finish can leave the
      // proceeds a hair short of the debt. The swap delivered ≥ amountWithSlippage
      // into the controller, so the shortfall is bounded by (debt − minOut). If
      // that gap is small (real interest dust) repay it from the wallet and retry;
      // if it's large it isn't dust (slippage/underwater) — surface it instead of
      // silently pulling a big amount from the wallet.
      if (!isDustFailure(finishErr)) throw finishErr
      const [freshDebt, walletBal] = await Promise.all([
        vaultGetMarginBorrowBalance(debt.vault, position.positionId),
        getTokenBalance(debt.token, user),
      ])
      // The swap delivered at least the minimum it was signed with, so that is
      // the proceeds floor the shortfall is measured against — the Long's
      // `amountWithSlippage`, the Short's `min_debt_out`. Both are the same fact
      // in their own branch, carried out here as `swapMinOut`.
      const repayAmount = cappedDustRepay(freshDebt, swapMinOut, walletBal)
      if (repayAmount == null) throw finishErr
      if (repayAmount <= BigInt(0)) {
        throw new Error(
          `Almost done — a little ${debt.label} is needed to cover accrued interest and finish the close. Add a small amount and retry.`,
        )
      }
      // The retry of finish is built to see the debt this repay just cleared, so it
      // needs the RPC's simulation snapshot to include it — otherwise finish is
      // simulated against the pre-repay debt and fails for the very shortfall that
      // was just paid.
      const repayRes = await repayMarginPositionV3(user, position.positionId, repayAmount)
      await waitForLedgerBeyond(repayRes.ledger)
      const res = await finishClosePositionV3(user, position.positionId)
      emit('finishing', res.hash)
      return {
        hash: res.hash,
        exitPriceUsd,
        settlementPending: await settlementPendingAfterFinish(position.positionId, res.ledger),
      }
    }
  }, [setStep])

  const closePosition = useCallback(async (position: StellarMarginPosition): Promise<boolean> => {
    if (isCloseBusy()) return rejectBusy()

    if (!address) { toast.error('Connect your wallet first.'); return false }
    const debt = assetByToken(position.debtToken)
    const positionAsset = assetByToken(position.collateralToken)
    if (!debt || !positionAsset) { toast.error('Unsupported market.'); return false }

    acquireCloseLock()
    setError(null)
    try {
      setStep('checking'); emit('checking')

      // ── Pre-flight (nothing signed yet) ────────────────────────────────────
      // Fresh reads: debt (interest accrues), exchange rate, oracle prices.
      const [currentDebt, exchangeRate, positionPrice, debtPrice] = await Promise.all([
        vaultGetMarginBorrowBalance(debt.vault, position.positionId),
        vaultGetExchangeRate(positionAsset.vault),
        getPriceUsd(positionAsset.token),
        getPriceUsd(debt.token),
      ])
      // A debt of zero used to be taken, on its own, as "this position is
      // already closed": mark success, write a close row, done. Two different
      // things can produce that zero and only one of them is a closed position.
      //
      //   - the keeper's TP/SL close beat the user to it → genuinely finished,
      //     and the row matters (the on-chain contract keeps no history, so
      //     without it the trade leaves Positions having never reached History);
      //   - the position is simply DEBT-FREE — the repay dialog offers exactly
      //     that, and says so: "the position can no longer be liquidated, your
      //     collateral stays in it until you close". It is still open, still
      //     holds collateral, and shortcutting here filed a close for a trade
      //     that never happened while leaving the collateral locked.
      //
      // The position's own status separates them, so ask it rather than guessing
      // from a number. (A transport failure can no longer masquerade as either:
      // both reads throw now instead of returning a phantom zero.)
      if (currentDebt <= BigInt(0)) {
        const confirmed = await getPosition(position.positionId)
        if (zeroDebtVerdict(confirmed?.status) === 'already-closed') {
          setStep('success'); emit('success')
          await journalClose(getAccessToken, address, position)
          onClosed?.(position.id)
          releaseCloseLock()
          return true
        }
        // Debt-free but still open. There is nothing to swap and nothing to
        // repay, so the close flow is the wrong shape for it — the contract has
        // its own one-call answer, which hands the collateral straight back to
        // free margin. (The previous build had none: a zero-debt close panicked
        // with `zero debt` and the collateral had no path home at all.)
        setStep('releasing'); emit('releasing')
        const rel = await releaseDebtFreePositionV3(address, position.positionId)
        setStep('success'); emit('success', rel.hash)
        toast.success('Position closed — your collateral is back in margin.')
        await journalClose(getAccessToken, address, position, rel.hash)
        onClosed?.(position.id)
        releaseCloseLock()
        return true
      }
      if (!positionPrice || !debtPrice) throw new Error('price unavailable')

      const positionUnderlying = ptokensToUnderlying(position.collateralPtokens, exchangeRate)
      if (positionUnderlying <= BigInt(0)) throw new Error('Position has no collateral to close.')

      // ── Liquidity gate (nothing signed yet) ────────────────────────────────
      // Step 2 moves the WHOLE collateral out of its vault in one transfer. If
      // other traders have borrowed that asset the vault can be short of it while
      // the position itself is perfectly fine — and the transfer then trapped deep
      // in the token contract, which reached the trader as "Insufficient token
      // balance for this step", i.e. as an accusation about their own wallet.
      // Worse, it trapped inside the close itself, so every attempt cost a
      // prepare + a cancel and left the row looking untouched with no reason
      // given.
      //
      // Checked here, before the first signature, with the two numbers that
      // actually decide it. `null` = the read didn't answer; never block a close
      // on that — let the chain judge, as it did before.
      const availableLiquidity = await vaultGetAvailableLiquidity(positionAsset.vault)
      if (availableLiquidity != null && availableLiquidity < positionUnderlying) {
        throw new Error(liquidityShortfallMessage({
          needed: positionUnderlying,
          available: availableLiquidity,
          decimals: positionAsset.decimals,
          label: positionAsset.label,
        }))
      }

      // Underwater guard: proceeds must fully repay the debt or the close reverts
      // (bad debt is reserved for liquidation). Fail BEFORE locking a pending.
      const { swapInIdx, swapOutIdx } = SIDE_MAPPING[position.side]
      const expectedOut = await estimatePoolSwap(swapOutIdx, swapInIdx, positionUnderlying)
      // Fail-soft quote: 0 means "no answer", not "the pool pays nothing". Left
      // alone it reads as underwater and accuses a perfectly healthy position of
      // being unclosable.
      if (expectedOut <= BigInt(0)) {
        throw new Error('Couldn’t price the closing swap — please try again in a moment.')
      }
      if (expectedOut < currentDebt) {
        throw new Error(
          'This position is underwater — closing it wouldn’t cover the debt. It will be resolved by liquidation.',
        )
      }

      // Same oracle-floor/slippage feasibility check `swapAndFinish` runs before
      // the swap — but done HERE, while nothing is signed yet. Without it a
      // doomed close still costs the user a begin + withdraw + cancel round trip
      // to end up exactly where they started. `swapAndFinish` keeps its own copy
      // because the resume path enters there directly and the pool can move
      // between this check and the swap.
      //
      // EACH SIDE ON ITS OWN SWAP. The floor prices whatever the swap leg feeds
      // into the pool: for a Long that is the whole collateral, for a Short only
      // the slice that buys the debt back. Judging a Short by the Long's number
      // would refuse healthy closes — which is why this block used to be
      // long-only. But skipping the Short entirely was the worse half of that
      // trade: the contract applies the floor to the Short's input regardless, so
      // every oversized Short signed, trapped on chain with an unreadable
      // `UnreachableCodeReached`, and left a pending to unwind.
      //
      // Both are gated on the floor still being the contract's rule at all —
      // see `controllerUsesPoolCloseFloor`.
      const oracleFloorActive = !(await controllerUsesPoolCloseFloor())
      const priceFracs = {
        positionPrice: { num: positionPrice.price, den: positionPrice.scale },
        debtPrice: { num: debtPrice.price, den: debtPrice.scale },
      }

      if (position.side === 'Long' && oracleFloorActive) {
        const preflightOracleMinOut = computeCloseFloor({ positionUnderlying, ...priceFracs })
        const preflight = resolveMinOut({
          oracleMinOut: preflightOracleMinOut,
          expectedOut,
          slippageBps: CLOSE_SLIPPAGE_BPS,
        })
        if (expectedOut < preflight.amountWithSlippage) {
          throw new Error(closeFloorMessage(preflightOracleMinOut, expectedOut, preflightOracleMinOut > preflight.userMinOut))
        }
      }

      if (position.side === 'Short' && oracleFloorActive) {
        const targetOut = shortCloseDebtTarget(currentDebt)
        const quote = (input: bigint) => estimatePoolSwap(swapOutIdx, swapInIdx, input)
        const sizing = await solveShortCloseInput({
          collateral: positionUnderlying,
          quoteAtCollateral: expectedOut,
          targetOut,
          quote,
        })
        if (sizing.status !== 'ok') {
          throw new Error(sizing.status === 'underwater'
            ? 'This position is underwater — closing it wouldn’t cover the debt. It will be resolved by liquidation.'
            : 'Couldn’t size the closing swap — the XLM pool kept moving. Nothing was signed; please try again.')
        }

        const verdict = shortCloseFloorVerdict({ swapInput: sizing.input, targetOut, ...priceFracs })
        if (verdict.blocked) {
          // Only now — on the path that is about to refuse a close — is it worth
          // spending a handful of quotes to find out what WOULD work.
          const maxDebt = await maxClosableShortDebt({
            collateral: positionUnderlying,
            quote,
            ...priceFracs,
          })
          throw new Error(shortCloseFloorMessage({
            shortfall: verdict.shortfall,
            repayNeeded: currentDebt > maxDebt ? currentDebt - maxDebt : BigInt(0),
            decimals: debt.decimals,
            label: debt.label,
          }))
        }
      }

      // ── Step 1: prepare_close — snapshot + collateral out, ONE transaction ─
      // This used to be begin_close followed by withdraw_close, which had to
      // land within ~2 ledgers of each other; missing that window left the
      // position in `Closing` with nothing having moved, and the unwind for it
      // was the most-exercised error path in this file. The contract now does
      // both atomically, so neither the window nor the unwind exists.
      setStep('preparing'); emit('preparing')
      const prepRes = await prepareClosePositionV3(address, position.positionId)

      // Let the RPC's simulation snapshot catch up before anything reads through
      // it. Everything in swapAndFinish does: `get_pending_perps_close` would
      // otherwise report the pre-prepare state (collateralUnderlying 0 → the
      // guard cancels a close that was fine), and the swap would be built for a
      // world where the collateral is still in the position. Same class as N25.
      await waitForLedgerBeyond(prepRes.ledger)

      // ── Steps 2–3 ──────────────────────────────────────────────────────────
      const { hash: finishHash, exitPriceUsd, settlementPending } = await swapAndFinish(address, position)

      // The trade is done either way — the journal row is written either way —
      // but only one of the two is allowed to say "closed".
      if (settlementPending) {
        setStep('settling'); emit('settling', finishHash)
        toast.info(SETTLEMENT_PENDING_COPY, { id: 'margin-close-settling', duration: 12_000 })
      } else {
        setStep('success'); emit('success')
        toast.success('Position closed')
      }
      // Awaited (never throws): onClosed refetches the journal, and firing it
      // before the close row lands would return a History without this trade —
      // the row only shows up on the next 30s poll.
      await journalClose(getAccessToken, address, position, finishHash, exitPriceUsd)
      onClosed?.(position.id)
      releaseCloseLock()
      return true
    } catch (e) {
      return setFail(e, { positionId: position.positionId.toString(), side: position.side, assetLabel: positionAsset.label })
    }
  }, [address, onClosed, getAccessToken, swapAndFinish, setFail, setStep])

  // ── Recovery actions (positions-panel banner) ────────────────────────────────

  const finishPendingClose = useCallback(async (view: StellarPendingCloseView): Promise<boolean> => {
    if (isCloseBusy()) return rejectBusy()
    if (!address) { toast.error('Connect your wallet first.'); return false }
    acquireCloseLock()
    setError(null)
    try {
      let finishHash: string | undefined
      // The branch that runs the swap knows what it filled at directly. The
      // already-swapped branch didn't watch it happen — but the pending recorded
      // what the swap delivered, so it can hand the journal the raw legs and let
      // it price them once it knows the side. Either way the close is booked in
      // the pool's domain, never the feed's.
      let exitPriceUsd: number | undefined
      let settlementPending = false
      if (view.hasSwapped) {
        // Swap already landed — just finish (with dust fallback via a minimal
        // re-run of the last step). Read the debt asset for a possible dust repay.
        setStep('finishing'); emit('finishing')
        try {
          const res = await finishClosePositionV3(address, view.positionId)
          finishHash = res.hash
          emit('finishing', res.hash)
          settlementPending = await settlementPendingAfterFinish(view.positionId, res.ledger)
        } catch (finishErr) {
          if (!isDustFailure(finishErr)) throw finishErr
          const debt = assetByToken(view.debtToken)
          if (!debt) throw finishErr
          // Same 2% dust cap as swapAndFinish. The proceeds here aren't a
          // min-out we chose but what the swap actually delivered, which the
          // pending records — re-read it rather than trusting the (up to one
          // poll stale) view, and refuse to auto-repay anything bigger than
          // dust. A real shortfall belongs in the banner's explicit "Repay"
          // dialog, where the trader sees the amount before it leaves.
          const [freshDebt, walletBal, freshPending] = await Promise.all([
            vaultGetMarginBorrowBalance(debt.vault, view.positionId),
            getTokenBalance(debt.token, address),
            getPendingPerpsClose(view.positionId).catch(() => null),
          ])
          const proceeds = freshPending?.receivedDebtAsset ?? view.receivedDebtAssetRaw
          const repay = cappedDustRepay(freshDebt, proceeds, walletBal)
          if (repay == null || repay <= BigInt(0)) throw finishErr
          // Same as the dust path in swapAndFinish: finish must be built against a
          // snapshot that already contains this repay.
          const repayRes = await repayMarginPositionV3(address, view.positionId, repay)
          await waitForLedgerBeyond(repayRes.ledger)
          const res = await finishClosePositionV3(address, view.positionId)
          finishHash = res.hash
          emit('finishing', res.hash)
          settlementPending = await settlementPendingAfterFinish(view.positionId, res.ledger)
        }
      } else {
        // Swap not yet done — run the swap + finish legs from the pending.
        const res = await swapAndFinish(address, {
          positionId: view.positionId,
          side: view.side,
          collateralToken: view.positionToken,
          debtToken: view.debtToken,
          collateralPtokens: BigInt(0), // unused: pending exposes collateralUnderlying
        })
        finishHash = res.hash
        exitPriceUsd = res.exitPriceUsd
        settlementPending = res.settlementPending ?? false
      }
      if (settlementPending) {
        setStep('settling'); emit('settling', finishHash)
        toast.info(SETTLEMENT_PENDING_COPY, { id: 'margin-close-settling', duration: 12_000 })
      } else {
        setStep('success'); emit('success')
        toast.success('Position closed')
      }
      // This IS a completed close — without a journal row the trade never shows
      // up in Trades/History (the on-chain contract keeps no history). Awaited
      // for the same refetch-race reason as in closePosition.
      await journalCloseFromPending(getAccessToken, address, view, finishHash, exitPriceUsd)
      onClosed?.(view.id)
      releaseCloseLock()
      return true
    } catch (e) {
      return setFail(e, { positionId: view.positionId.toString(), side: view.side, assetLabel: assetByToken(view.positionToken)?.label })
    }
  }, [address, onClosed, getAccessToken, swapAndFinish, setFail, setStep])

  const cancelPendingClose = useCallback(async (view: StellarPendingCloseView): Promise<boolean> => {
    if (isCloseBusy()) return rejectBusy()
    if (!address) { toast.error('Connect your wallet first.'); return false }
    if (view.hasSwapped) {
      toast.error('This close already swapped — finish it instead of cancelling.')
      return false
    }
    acquireCloseLock()
    setError(null)
    try {
      await cancelClosePositionV3(address, view.positionId)
      setStep('idle'); emit('idle')
      toast.success('Close cancelled — your collateral is back in the position.')
      onClosed?.(view.id)
      releaseCloseLock()
      return true
    } catch (e) {
      return setFail(e, { positionId: view.positionId.toString(), side: view.side, assetLabel: assetByToken(view.positionToken)?.label })
    }
  }, [address, onClosed, setFail, setStep])

  const expirePendingClose = useCallback(async (view: StellarPendingCloseView): Promise<boolean> => {
    if (isCloseBusy()) return rejectBusy()
    if (!address) { toast.error('Connect your wallet first.'); return false }
    acquireCloseLock()
    setError(null)
    try {
      await expireClosePositionV3(address, view.positionId)
      setStep('idle'); emit('idle')
      toast.success('Pending close cleared — your collateral is safe.')
      onClosed?.(view.id)
      releaseCloseLock()
      return true
    } catch (e) {
      return setFail(e, { positionId: view.positionId.toString(), side: view.side, assetLabel: assetByToken(view.positionToken)?.label })
    }
  }, [address, onClosed, setFail, setStep])

  const reset = useCallback(() => { setStep('idle'); setError(null); releaseCloseLock() }, [setStep])

  return {
    closePosition,
    finishPendingClose,
    cancelPendingClose,
    expirePendingClose,
    step,
    stepLabel: STEP_LABEL[step],
    error,
    isLoading: step !== 'idle' && step !== 'success' && step !== 'settling' && step !== 'error',
    reset,
  }
}

/** Best-effort trade-journal close — server pairs the open row for realized PnL,
 *  and falls back to the feed only when no fill price is supplied. Never throws;
 *  the close already landed on-chain. */
function journalClose(
  getAccessToken: () => Promise<string | null>,
  address: string,
  position: StellarMarginPosition,
  /** Hash of the settling `finish` — omitted only on the already-closed path,
   *  where this client never sent a transaction. */
  txHash?: string,
  /** Price the closing swap filled at. Omitted on the already-closed path (no
   *  swap ran here) — the server then stamps spot. */
  exitPriceUsd?: number,
): Promise<void> {
  return recordMarginTrade(getAccessToken, address, {
    positionId: position.id,
    eventType: 'close',
    txHash,
    exitPriceUsd,
    side: position.side,
    collateralSymbol: position.collateralSymbol,
    collateralAmount: position.collateralAmount,
    xlmAmount: position.side === 'Long' ? position.collateralAmount : position.debtAmount,
    borrowAmount: position.debtAmount,
    leverageX100: Math.round(position.leverage * 100),
    // Omitted rather than 0 when the health read didn't answer — the field is
    // optional, and a stored 0 would read forever as "closed at the brink".
    hfBps: position.healthUnknown ? undefined : Math.round(position.healthFactor * 10_000),
  }).then(() => undefined).catch(() => undefined)
}

/** Same, for a close completed from a stranded PendingClose (recovery banner).
 *  The view carries raw amounts instead of a hydrated position, so amounts are
 *  rebuilt from the asset config; leverage/HF are unknown here and the server
 *  pairs entry price + PnL from the open row anyway. */
function journalCloseFromPending(
  getAccessToken: () => Promise<string | null>,
  address: string,
  view: StellarPendingCloseView,
  txHash?: string,
  exitPriceUsd?: number,
): Promise<void> {
  const positionAsset = assetByToken(view.positionToken)
  const debtAsset = assetByToken(view.debtToken)
  const collateralAmount = positionAsset
    ? Number(view.collateralUnderlyingRaw) / 10 ** positionAsset.decimals
    : undefined
  const debtAmount = debtAsset ? Number(view.debtAmountRaw) / 10 ** debtAsset.decimals : undefined
  return recordMarginTrade(getAccessToken, address, {
    positionId: view.id,
    eventType: 'close',
    txHash,
    exitPriceUsd,
    // Only sent when this client didn't run the swap: the pending's own record
    // of it (in → out), which the server prices once it has read the side.
    exitSwapInRaw: exitPriceUsd == null && view.receivedDebtAssetRaw > BigInt(0)
      ? view.collateralUnderlyingRaw.toString()
      : undefined,
    exitSwapOutRaw: exitPriceUsd == null && view.receivedDebtAssetRaw > BigInt(0)
      ? view.receivedDebtAssetRaw.toString()
      : undefined,
    side: view.side,
    collateralSymbol: positionAsset?.label,
    collateralAmount,
    // XLM exposure mirrors journalClose: Long holds XLM (position asset), Short owes XLM (debt).
    xlmAmount: view.side === 'Long' ? collateralAmount : debtAmount,
    borrowAmount: debtAmount,
  }).then(() => undefined).catch(() => undefined)
}

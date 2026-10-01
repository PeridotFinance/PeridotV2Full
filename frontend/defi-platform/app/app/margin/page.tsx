"use client"

/**
 * Leveraged Margin — Stellar testnet (XLM/USDT).
 *
 * Rewired from the Somnia/EVM atomic flow to the Stellar split flow (Perps V3):
 *   - on-chain positions (no DB), 3-step V3 open behind one button + stepper
 *     (begin → on-chain swap → activate; nothing is borrowed to the wallet)
 *   - pending-open recovery banner (resume / cancel — cancel only pre-swap)
 *   - collateral lives in MarginController custody (no SMA / enable step)
 *
 * See stellar-margin-migration.md for the full rebuild scope.
 */
import { useCallback, useMemo, useRef, useState, useEffect } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { toast } from "sonner"
import { Wallet, Settings2, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { ErrorBoundary } from "@/components/ErrorBoundary"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useStellarWallet } from "@/hooks/use-stellar-wallet"
import { useStellarWalletSession } from "@/hooks/use-stellar-wallet-session"
import { useStellarMarginBalances } from "./hooks/use-stellar-margin-balances"
import { useStellarMarginPositions } from "./hooks/use-stellar-margin-positions"
import { useStellarMarginOpen, type OpenedInfo } from "./hooks/use-stellar-margin-open"
import { useStellarMarginCancel } from "./hooks/use-stellar-margin-cancel"
import { useStellarMarginClose } from "./hooks/use-stellar-margin-close"
import { useStellarMarginOnboarding } from "./hooks/use-stellar-margin-onboarding"
import { useStellarMarginRecovery } from "./hooks/use-stellar-margin-recovery"
import { useMarginJournal, useMarginTradeRecorder } from "./hooks/use-stellar-margin-journal"
import { useStellarTpSlMonitor } from "./hooks/use-stellar-tpsl-monitor"
import { useStellarLimitOrders } from "./hooks/use-stellar-limit-orders"
import { useStellarLimitOrderMonitor } from "./hooks/use-stellar-limit-order-monitor"
import { useStellarLiquidationAlerts } from "./hooks/use-stellar-liquidation-alerts"
import { useStellarKeeperArms } from "./hooks/use-stellar-keeper-arms"
import { useStellarMarginKeeper } from "./hooks/use-stellar-margin-keeper"
import { useStellarPoolMarks } from "./hooks/use-stellar-pool-mark"
import { StellarOpenPanel } from "./components/stellar/StellarOpenPanel"
import { StellarPriceChart, type FillPreview } from "./components/stellar/StellarPriceChart"
import { useStellarPoolPrice } from "./hooks/use-stellar-pool-price"
import { StellarActivityTabs, type ActivityTrade, type ActivityHistory } from "./components/stellar/StellarActivityTabs"
import { ChallengeBanner } from "./components/ChallengeBanner"
import { StellarPendingBanner } from "./components/stellar/StellarPendingBanner"
import { StellarOpenProgress } from "./components/stellar/StellarOpenProgress"
import { StellarCloseProgress } from "./components/stellar/StellarCloseProgress"
import { StellarPendingCloseBanner } from "./components/stellar/StellarPendingCloseBanner"
import { StellarSettlingBanner } from "./components/stellar/StellarSettlingBanner"
import { StellarRecoveryBanner } from "./components/stellar/StellarRecoveryBanner"
import { StellarKeeperNotice } from "./components/stellar/StellarKeeperNotice"
import { StellarCollateralDialog } from "./components/stellar/StellarCollateralDialog"
import { StellarOnboardingCard } from "./components/stellar/StellarOnboardingCard"
import { StellarFundingDialog } from "./components/stellar/StellarFundingDialog"
import { StellarMobilePositionBar } from "./components/stellar/StellarMobilePositionBar"
import { StellarAlertToggle } from "./components/stellar/StellarAlertToggle"
import { resolveChartEntries, summarizeOpenPositions, liquidationPrice } from "./lib/marginMath"
import type { StellarPendingOpenView } from "./types/stellarMargin"
import { STELLAR_MARGIN_CONFIG, type StellarMarginAssetKey } from "./config/stellarMarginConfig"

/**
 * How long an optimistically-hidden (just closed) position stays hidden while the
 * chain still reports it. Comfortably longer than the positions poll (15s) so a
 * successful close never blinks back, short enough that a failed one reappears.
 */
const HIDE_TTL_MS = 45_000

/**
 * How long after its on-chain open a position may still have its entry price
 * bridge-stamped from the live feed while the journal row is in flight. Past
 * this, a missing journal entry is treated as permanently missing and the
 * position shows no PnL instead of a fabricated one.
 */
const ENTRY_BRIDGE_MS = 10 * 60 * 1000

export default function MarginPage() {
  const [mounted, setMounted] = useState(false)
  const [collateralOpen, setCollateralOpen] = useState(false)
  // True while the collateral dialog has a signature/transaction in flight. Lives
  // here, not in the dialog, because it has to gate the dialog's OWN dismissal —
  // see the guard on `onOpenChange` below.
  const [collateralBusy, setCollateralBusy] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const { address, source: walletSource, isConnected: walletConnected } = useStellarWallet()
  const recordTrade = useMarginTradeRecorder(address)

  const { assets: realAssets, refetch: refetchBalances } = useStellarMarginBalances(address ?? null)
  /**
   * Whether the position sweep must keep reading while this tab is hidden.
   *
   * It mirrors the liquidation-alert toggle further down, one render late, and
   * that indirection is the point: the alerts need positions and the sweep needs
   * to know whether anyone is listening, so one of the two has to learn it from
   * the other's last answer rather than its current one. A single stale frame at
   * a 15s cadence costs nothing.
   */
  const [watchWhileHidden, setWatchWhileHidden] = useState(false)
  const { positions: realPositions, pending, pendingCloses, settling, hasLoaded: positionsLoaded, error: positionsError, refetch: refetchPositions } = useStellarMarginPositions(address ?? null, realAssets, watchWhileHidden)

  const refetchAll = () => { refetchBalances(); refetchPositions() }

  // Trade journal (Trades/History tabs). Lives up here so close callbacks can
  // refetch it — a close writes a journal row, and refreshing only the on-chain
  // reads would leave History stale until the next 30s poll.
  //
  // The open-position ids ride along so the journal is guaranteed to contain
  // each open position's rows (entry price, TP/SL, debt basis) even when its
  // `open` row has scrolled past the server's newest-200 window.
  const openPositionIds = useMemo(() => realPositions.map((p) => p.id), [realPositions])
  const journal = useMarginJournal(address, walletConnected, walletSource, openPositionIds)
  const refetchActivity = () => { refetchAll(); journal.refetch() }

  // A kit ("pure Freighter") wallet has no Privy token, so the journal's only
  // credential is the signed session cookie. Nothing prompts for it until the
  // journal comes back 401 — then the activity panel offers the signature and
  // reloads on success.
  const { signIn: signInStellarWallet, status: walletSessionStatus, error: walletSessionError } = useStellarWalletSession()
  const handleJournalSignIn = useCallback(async () => {
    const ok = await signInStellarWallet()
    if (ok) journal.refetch()
  }, [signInStellarWallet, journal])

  // Kit wallets only: the handshake signs through the wallets kit, which can't
  // sign for an embedded Privy address. A Privy user who gets a 401 has an
  // expired Privy session instead — reconnecting is their fix, not a signature.
  const showJournalSignIn = walletSource === "kit" && journal.needsWalletSignIn

  // Ask for the signature the moment the journal says it needs one, instead of
  // waiting for the user to notice a banner. Without a session every trade
  // still goes through on-chain but is never recorded — which is how people
  // ended up invisible on the challenge board while "the site doesn't
  // recognise my wallet". Once per address; a cancelled prompt leaves the
  // manual button, it never nags.
  const autoSignInAttempted = useRef<string | null>(null)
  useEffect(() => {
    if (!showJournalSignIn || !address) return
    if (walletSessionStatus !== 'idle') return
    if (autoSignInAttempted.current === address) return
    autoSignInAttempted.current = address
    void handleJournalSignIn()
  }, [showJournalSignIn, address, walletSessionStatus, handleJournalSignIn])

  // Page-level open hook drives the pending-banner resume; the open panel owns its
  // own instance for fresh opens.
  //
  // Both take `refetchActivity`, not `refetchAll`: finishing or cancelling a pending
  // writes a journal row, and refreshing only the on-chain reads left that trade out
  // of Trades/History until the next 30s journal poll. The identical handlers wired
  // into the activity tabs below already did this; the top banner didn't.
  const { resumePending, isLoading: isResuming, step: resumeStep, stepLabel } = useStellarMarginOpen(() => refetchActivity())
  const { cancelPending, isLoading: isCancelling } = useStellarMarginCancel(() => refetchActivity())

  // Page-level close hook drives the pending-CLOSE recovery banner (finish /
  // cancel / expire a stranded split close). The positions panel owns its own
  // instance for fresh closes. `closeAction` records WHICH of the banner's
  // buttons is running — the hook only exposes one `isLoading` for all three.
  const [closeAction, setCloseAction] = useState<'finish' | 'cancel' | 'expire' | null>(null)
  const {
    finishPendingClose,
    cancelPendingClose,
    expirePendingClose,
    isLoading: isFinishingClose,
    step: closeStep,
    stepLabel: closeStepLabel,
  } = useStellarMarginClose((id) => { applyOptimisticClose(id); refetchActivity() })

  // Testnet onboarding: make a fresh Privy wallet trade-ready (no dead empty state).
  // Setup now funds the margin account directly, so "needs setup" must consider
  // both balances — wallet (pre-setup) and margin (post-setup) — or it would
  // re-trigger after a successful run (which leaves the wallet at 0).
  //
  // …and it must also consider whether the balances are zero because the money is
  // WORKING. A trader who commits all their margin to a position has wallet 0 and
  // margin 0, which reads identically to "brand new account" — that fired the big
  // funding modal right after a successful open.
  const usdtMarginBalanceReal = realAssets.find((a) => a.key === "MOCK_USDT")?.marginUnderlying ?? 0
  const usdtWalletBalance = realAssets.find((a) => a.key === "MOCK_USDT")?.walletBalance ?? 0
  const hasDeployedCapital = realPositions.length > 0 || pending.length > 0 || pendingCloses.length > 0 || settling.length > 0
  /**
   * Have the on-chain balances landed at least once?
   *
   * `realAssets` starts as `[]` and is only ever replaced by a completed read, so a
   * non-empty array is the honest signal. Everything that infers "this account is
   * empty" from a zero balance has to wait for this — otherwise the first frame of
   * every page load tells a funded trader their account is empty and offers them the
   * faucet ("Set up your trading account · Get 250 USDT of free test money"), which
   * is both wrong and, in the auto-opening modal, in the way.
   */
  const balancesReady = realAssets.length > 0
  const onboarding = useStellarMarginOnboarding({
    address: address ?? undefined,
    enabled: walletConnected,
    source: walletSource,
    usdtWalletBalance,
    usdtMarginBalance: usdtMarginBalanceReal,
    hasDeployedCapital,
    balancesReady,
    onFunded: refetchAll,
  })

  // ── Optimistic overlay ─────────────────────────────────────────────────────
  // Reflect collateral moves / closes instantly; the next on-chain read (fired by
  // refetchAll on success, or the polls — positions 15s, balances 20s) supersedes
  // the guess, so it self-reconciles and can never show a stale number for long.
  const [optMarginDelta, setOptMarginDelta] = useState<Partial<Record<StellarMarginAssetKey, number>>>({})
  const [optHidden, setOptHidden] = useState<Array<{ id: string; at: number }>>([])

  // Retire the guesses on CONTENT, not on array identity. Both arrays are rebuilt
  // on every poll (`setAssets(next)` / `setPositions(open)`), so depending on them
  // directly fired the reset ~every 15-20s regardless of what came back: a read
  // that started before a close and returned after it would clear `optHidden` and
  // blink the closed position back until the following read.
  const balanceSig = useMemo(
    () => realAssets.map((a) => `${a.key}:${a.marginUnderlying}:${a.walletBalance}`).join("|"),
    [realAssets],
  )
  useEffect(() => { setOptMarginDelta({}) }, [balanceSig])

  const positionIdSig = useMemo(() => realPositions.map((p) => p.id).join("|"), [realPositions])
  useEffect(() => {
    // A hidden id is only confirmed once the chain stops reporting it.
    const live = new Set(positionIdSig ? positionIdSig.split("|") : [])
    setOptHidden((h) => {
      const next = h.filter((e) => live.has(e.id))
      return next.length === h.length ? h : next
    })
  }, [positionIdSig])

  const applyOptimisticMargin = useCallback((key: StellarMarginAssetKey, delta: number) => {
    setOptMarginDelta((m) => ({ ...m, [key]: (m[key] ?? 0) + delta }))
  }, [])
  const applyOptimisticClose = useCallback((id: string) => {
    setOptHidden((h) => (h.some((e) => e.id === id) ? h : [...h, { id, at: Date.now() }]))
    // …but not forever. If the chain never drops the id (a close that ultimately
    // failed), the guess must expire on its own or it would hide a live position
    // permanently — the one failure mode worse than a brief flicker.
    setTimeout(() => setOptHidden((h) => h.filter((e) => e.id !== id)), HIDE_TTL_MS)
  }, [])

  // Stuck-funds recovery: surfaces vault spot pTokens stranded by a half-finished
  // collateral move (deposit succeeded, transfer/withdraw tail failed).
  // onRecovered fires before the on-chain re-read returns: bump the trading-account
  // balance instantly when funds land in margin, so the UI reacts immediately and
  // the banner's disappearance isn't the only sign anything happened.
  const recovery = useStellarMarginRecovery(realAssets, walletConnected, {
    onDone: refetchAll,
    onRecovered: (key, direction, underlying) => {
      if (direction === "margin") applyOptimisticMargin(key, underlying)
    },
  })

  const mergedAssets = useMemo(() => realAssets.map((a) => {
    const d = optMarginDelta[a.key] ?? 0
    return d ? { ...a, marginUnderlying: Math.max(0, a.marginUnderlying + d) } : a
  }), [realAssets, optMarginDelta])
  const mergedPositions = useMemo(
    () => (optHidden.length ? realPositions.filter((p) => !optHidden.some((e) => e.id === p.id)) : realPositions),
    [realPositions, optHidden],
  )
  const assets = mergedAssets
  const positions = mergedPositions
  const isConnected = walletConnected
  const activePending = pending[0] ?? null
  const activePendingClose = pendingCloses[0] ?? null
  const activeSettling = settling[0] ?? null
  const usdtMarginAmount = assets.find((a) => a.key === "MOCK_USDT")?.marginUnderlying ?? 0

  // ── Chart entry/liq overlays ───────────────────────────────────────────────
  // Entry lines must sit in the real-feed price domain (not the flat $1 oracle).
  // Source of truth: the journal's recorded entry price; for positions without one
  // yet (just-opened), stamp the live feed price on first sight.
  const [lastFeedPrice, setLastFeedPrice] = useState(0)
  const [entryPrices, setEntryPrices] = useState<Record<string, number>>({})
  useEffect(() => {
    setEntryPrices((prev) => {
      const next = { ...prev }
      let changed = false
      for (const r of journal.trades) {
        if (r.event_type === "open" && r.entry_price_usd != null && next[r.position_id] !== r.entry_price_usd) {
          next[r.position_id] = r.entry_price_usd; changed = true
        }
      }
      // Bridge for a position with no recorded entry yet: stamp the live feed so
      // the ticker isn't blank — but ONLY while the position is young enough
      // that its journal row can still plausibly be in flight (the open hook
      // records it and refetches right away). Stamping an OLD position — its
      // journal write failed for good — would re-base its PnL to "the price
      // when this page happened to load", a figure that reads as ~$0 on every
      // reload and then tracks the wrong reference. For those, no entry means
      // no PnL shown, which is honest. Feed-at-open-time is within the
      // execution gap of the true entry, so a bridge stamp that never gets
      // corrected stays approximately right.
      const now = Date.now()
      for (const p of positions) {
        if (next[p.id] == null && lastFeedPrice > 0 && now - p.openedAt.getTime() < ENTRY_BRIDGE_MS) {
          next[p.id] = lastFeedPrice; changed = true
        }
      }
      return changed ? next : prev
    })
  }, [positions, journal.trades, lastFeedPrice])

  // ── The same entries, in the CHART's price domain ──────────────────────────
  // `entryPrices` above are execution prices: what the opening swap filled at in
  // the Aquarius pool. That is the right number for PnL (the mark is quoted from
  // the same pool) and the wrong one to draw on the chart, whose candles are the
  // real market. The testnet pool has sat as much as ~9% from spot because
  // nobody arbitrages it, so the entry line floated off the curve — and the
  // liquidation line, which anchors on the entry, floated with it.
  //
  // The gap can't be corrected after the fact: the pool-vs-market basis drifts,
  // so today's basis says nothing about where the market was last week. Hence a
  // recorded anchor — `feed_price_usd`, stamped server-side at open.
  const [chartEntryPrices, setChartEntryPrices] = useState<Record<string, number>>({})
  useEffect(() => {
    setChartEntryPrices((prev) => {
      const next = { ...prev }
      let changed = false
      for (const r of journal.trades) {
        if (r.event_type === "open" && r.feed_price_usd != null && next[r.position_id] !== r.feed_price_usd) {
          next[r.position_id] = r.feed_price_usd; changed = true
        }
      }
      // Same bridge as the entry map, and for the same reason: a just-opened
      // position's journal row is still in flight, and the live feed is exactly
      // the number that row is about to carry. Kept in its own map so the
      // journal's EXECUTION price can never overwrite it.
      const now = Date.now()
      for (const p of positions) {
        if (next[p.id] == null && lastFeedPrice > 0 && now - p.openedAt.getTime() < ENTRY_BRIDGE_MS) {
          next[p.id] = lastFeedPrice; changed = true
        }
      }
      return changed ? next : prev
    })
  }, [positions, journal.trades, lastFeedPrice])

  // Rows with no feed anchor — opens journalled before the column existed —
  // keep drawing their fill price, which is what the chart did for all of them
  // until now. A missing anchor loses the correction, never the line.
  const chartEntries = useMemo(
    () => resolveChartEntries(entryPrices, chartEntryPrices),
    [entryPrices, chartEntryPrices],
  )

  // What each open position would fetch in the pool right now — the domain its
  // entry price was stamped in, and therefore the only mark that measures the
  // trade rather than the gap between the pool and the feed.
  // The pool's own mid-price and the fill the open panel is currently quoting —
  // both drawn on the chart so the pool/feed spread is visible before trading.
  const poolPrice = useStellarPoolPrice({ feedPrice: lastFeedPrice, enabled: true })
  const [fillPreview, setFillPreview] = useState<FillPreview | null>(null)

  const poolMarks = useStellarPoolMarks({
    positions: positions.map((p) => ({ id: p.id, side: p.side, collateralAmount: p.collateralAmount })),
    feedPrice: lastFeedPrice,
    enabled: true,
  })

  // positionId → TP/SL triggers, joined from the journal's open row (TP/SL
  // aren't on-chain).
  const tpSlByPosition = useMemo(() => {
    const map: Record<string, { takeProfit: number | null; stopLoss: number | null }> = {}
    for (const p of positions) {
      if (p.takeProfitUsd != null || p.stopLossUsd != null) {
        map[p.id] = { takeProfit: p.takeProfitUsd ?? null, stopLoss: p.stopLossUsd ?? null }
      }
    }
    // journal.trades is newest-first; the most recent open/tpsl_set row holds the
    // position's current TP/SL (an edit appends a tpsl_set that supersedes the open).
    const seen = new Set<string>()
    for (const r of journal.trades) {
      if ((r.event_type === "open" || r.event_type === "tpsl_set") && !seen.has(r.position_id)) {
        seen.add(r.position_id)
        map[r.position_id] = { takeProfit: r.take_profit_usd ?? null, stopLoss: r.stop_loss_usd ?? null }
      }
    }
    return map
  }, [positions, journal.trades])

  // positionId → what was borrowed at open, and when. The on-chain debt already
  // includes accrued interest, so this basis is what turns it into a cost: the
  // drift above it IS the borrow interest (see computeBorrowInterest).
  const debtBasisByPosition = useMemo(() => {
    const map: Record<string, { borrowAmount: number; openedAtMs: number }> = {}
    // Partial repayments paid part of that basis back, so they come off it. The
    // on-chain debt is (drawn + interest − repaid); measuring drift against the
    // undiscounted open amount would net the repayment against the interest and
    // report a position that had just repaid as accruing nothing.
    const repaidByPosition: Record<string, number> = {}
    for (const r of journal.trades) {
      if (r.event_type === "repay" && r.borrow_amount != null) {
        repaidByPosition[r.position_id] = (repaidByPosition[r.position_id] ?? 0) + r.borrow_amount
      }
    }
    for (const r of journal.trades) {
      if (r.event_type !== "open" || r.borrow_amount == null || map[r.position_id]) continue
      map[r.position_id] = {
        borrowAmount: Math.max(0, r.borrow_amount - (repaidByPosition[r.position_id] ?? 0)),
        openedAtMs: new Date(r.created_at).getTime(),
      }
    }
    return map
  }, [journal.trades])

  // positionId → what partial repayments already retired: the PnL they locked in
  // and the XLM exposure they removed. Only a SHORT accrues either — its debt IS
  // the XLM exposure, so repaying part of it closes that slice of the trade. A
  // Long repays USDT and retires nothing, which is why its rows carry no
  // xlm_amount and no realized PnL. See StellarPositionsPanel's `repayAdjust`.
  const repayAdjustByPosition = useMemo(() => {
    const map: Record<string, { realizedUsd: number; xlmRetired: number }> = {}
    const add = (id: string, realizedUsd: number, xlmRetired: number) => {
      const cur = map[id] ?? { realizedUsd: 0, xlmRetired: 0 }
      map[id] = { realizedUsd: cur.realizedUsd + realizedUsd, xlmRetired: cur.xlmRetired + xlmRetired }
    }
    for (const r of journal.trades) {
      if (r.event_type === "repay") add(r.position_id, r.realized_pnl_usd ?? 0, r.xlm_amount ?? 0)
    }
    return map
  }, [journal.trades])

  // positionId → the leverage the trader actually chose at open. The position's
  // own `leverage` is derived from live collateral/equity, so it drifts with
  // price and swap execution — showing it as the headline number reads as a bug
  // ("I picked 5× but it says 4.4×").
  const entryLeverageX100ByPosition = useMemo(() => {
    const map: Record<string, number> = {}
    for (const r of journal.trades) {
      if (r.event_type !== "open" || r.leverage_x100 == null || map[r.position_id]) continue
      map[r.position_id] = r.leverage_x100
    }
    return map
  }, [journal.trades])

  const entryLeverageByPosition = useMemo(() => {
    const map: Record<string, number> = {}
    for (const [id, x100] of Object.entries(entryLeverageX100ByPosition)) map[id] = x100 / 100
    return map
  }, [entryLeverageX100ByPosition])

  // Normalize the journal into the activity-tab row shapes.
  const trades: ActivityTrade[] = useMemo(() =>
    journal.trades.filter((r) => r.event_type !== "tpsl_set").map((r) => ({
        // Same reason as `entryLeverageByPosition` above, and it bites harder here:
        // a close row records the position's *live* leverage, which on a trade that
        // moved against you is nothing like what you picked — a 2× short that drifted
        // was logged, and displayed, as "Closed 11.5×" on a platform capped at 5×.
        // The open row of the same position holds the chosen number; prefer it.
        id: String(r.id), eventType: r.event_type as ActivityTrade["eventType"], side: r.side,
        leverageX100: entryLeverageX100ByPosition[r.position_id] ?? r.leverage_x100,
        xlmAmount: r.xlm_amount, entryPriceUsd: r.entry_price_usd, exitPriceUsd: r.exit_price_usd, realizedPnlUsd: r.realized_pnl_usd,
        collateralSymbol: r.collateral_symbol, collateralAmount: r.collateral_amount, txHash: r.tx_hash, createdAt: r.created_at,
      })), [journal.trades, entryLeverageX100ByPosition])

  const history: ActivityHistory[] = useMemo(() =>
    journal.history.map((h) => ({
        positionId: h.positionId, side: h.side,
        leverageX100: entryLeverageX100ByPosition[h.positionId] ?? h.leverageX100,
        xlmAmount: h.xlmAmount,
        entryPriceUsd: h.entryPriceUsd, exitPriceUsd: h.exitPriceUsd, realizedPnlUsd: h.realizedPnlUsd,
        openedAt: h.openedAt, closedAt: h.closedAt, txHash: h.txHash,
      })), [journal.history, entryLeverageX100ByPosition])

  const pendingList: StellarPendingOpenView[] = pending

  // ── Mobile position bar ────────────────────────────────────────────────────
  // One column on a phone means the positions table sits two screens below the
  // order form, so a trader who has just opened something watches a chart that
  // says nothing about them. Same arithmetic as that table (see
  // summarizeOpenPositions), so the bar and the rows can never disagree.
  //
  // Recomputed on every render rather than memoized: its inputs are the poll
  // results and the live feed, which is exactly when it should move anyway, and
  // the loop is a handful of positions.
  const openSummary = summarizeOpenPositions({
    positions,
    entryPrices,
    markPrices: poolMarks,
    debtBasis: debtBasisByPosition,
    repayAdjust: repayAdjustByPosition,
    xlmPrice: lastFeedPrice,
    nowMs: Date.now(),
  })
  const activityRef = useRef<HTMLDivElement | null>(null)

  // Edit/clear TP/SL on an open position — appends a `tpsl_set` journal row that
  // supersedes the open's triggers. Unlike the rest of the journal this write is
  // NOT best-effort: TP/SL exists nowhere else (not on-chain), so a dropped row
  // silently loses the user's stop. Throw on failure and let the editor keep the
  // values on screen.
  const handleSetTpSl = useCallback(
    async (positionId: string, next: { takeProfit: number | null; stopLoss: number | null }) => {
      const row = {
        positionId,
        eventType: "tpsl_set" as const,
        takeProfitUsd: next.takeProfit ?? undefined,
        stopLossUsd: next.stopLoss ?? undefined,
      }
      let ok = await recordTrade(row)
      // A kit wallet with no (or an expired) session is rejected by the journal.
      // This is the one write worth interrupting for a signature: it's the only
      // record the stop-loss has. Ask once, then retry.
      if (!ok && walletSource === "kit") {
        if (await signInStellarWallet()) ok = await recordTrade(row)
      }
      if (!ok) throw new Error("Couldn't save your take-profit / stop-loss. Please try again.")
      await journal.refetch()
    },
    [recordTrade, journal, walletSource, signInStellarWallet],
  )

  // ── TP/SL monitor ──────────────────────────────────────────────────────────
  // Watches the live feed and auto-closes a position when it crosses its TP/SL.
  // Works while the tab is open (the always-on keeper needs server-side Stellar
  // signing Privy doesn't offer — see use-stellar-tpsl-monitor for the why).
  // Always-on arms, for the page-level notice. Same cache the positions panel
  // and the TP/SL popover read.
  const keeperArms = useStellarKeeperArms(true)

  /**
   * What the keeper notice is allowed to tell the trader to do.
   *
   * An arm outlives its position, so "choose Renew cover" was printed for
   * positions that were closed, or whose levels had been cleared — and the
   * popover only offers Renew when there are levels to re-sign. Hand the notice
   * the two facts it needs to check instead of letting it assume.
   */
  const keeperNoticeScope = useMemo(() => {
    const open = new Set<string>()
    const withTriggers = new Set<string>()
    for (const p of positions) {
      open.add(p.id)
      const tp = p.takeProfitUsd ?? tpSlByPosition[p.id]?.takeProfit
      const sl = p.stopLossUsd ?? tpSlByPosition[p.id]?.stopLoss
      if (tp != null || sl != null) withTriggers.add(p.id)
    }
    return { open, withTriggers }
  }, [positions, tpSlByPosition])

  /**
   * Arm the always-on keeper for a position the trader opted into at open time.
   *
   * It can't be armed in the open panel: the keeper pre-signs closes against a
   * concrete position id, and that id only exists once the trade has landed AND
   * been read back. So the panel hands up the intent and this waits for the
   * position to appear, then asks for the signatures.
   *
   * If it doesn't work, saying nothing is the one unacceptable outcome — the
   * trader chose this precisely so they could close the tab. `armPosition` names
   * the cause (a declined signature, most often); this adds the way back and
   * stays on screen until dismissed.
   */
  const { armPosition } = useStellarMarginKeeper()
  // State, not a ref: setting a ref wouldn't re-render, so the arm would wait for
  // whatever unrelated render came next. The ref beside it is the double-fire
  // guard — clearing state is asynchronous, and two runs mean two signature
  // prompts for one position.
  const [pendingArm, setPendingArm] = useState<{ positionId: string; takeProfit: number | null; stopLoss: number | null } | null>(null)
  const armedOnceRef = useRef<string | null>(null)
  useEffect(() => {
    const want = pendingArm
    if (!want || armedOnceRef.current === want.positionId) return
    const position = positions.find((p) => String(p.positionId) === want.positionId)
    if (!position) return // not read back yet; the next positions tick will have it
    armedOnceRef.current = want.positionId
    setPendingArm(null)
    void (async () => {
      const armed = await armPosition(position, { takeProfit: want.takeProfit, stopLoss: want.stopLoss })
      if (armed) { keeperArms.refetch(); return }
      toast.error(
        "Your position is open and your levels are saved, but always-on wasn't switched on — they only run while this page is open. " +
        "Turn it on from the position below (pencil icon → Always-on).",
        { id: `margin-open-arm-failed-${want.positionId}`, duration: Infinity, closeButton: true },
      )
    })()
  }, [pendingArm, positions, armPosition, keeperArms])

  // ── Liquidation warnings ───────────────────────────────────────────────────
  // The market's exit, as opposed to the trader's. TP/SL is covered by the
  // keeper; being closed out is covered by nobody, and the only place it was
  // ever announced was a red badge in a table that goes unwatched. Shape the
  // positions into what the decision needs — including the price it happens at,
  // so the warning names a number instead of a ratio.
  const riskWatch = useMemo(
    () => positions.map((p) => ({
      id: p.id,
      side: p.side,
      healthFactor: p.healthFactor,
      healthUnknown: p.healthUnknown,
      liqPriceUsd: liquidationPrice({
        side: p.side,
        collateralUsd: p.collateralUsd,
        debtUsd: p.debtUsd,
        maintenanceMargin: STELLAR_MARGIN_CONFIG.constants.MAINTENANCE_MARGIN,
        price: lastFeedPrice,
      }),
    })),
    [positions, lastFeedPrice],
  )
  const liquidationAlerts = useStellarLiquidationAlerts(riskWatch, address ?? null)
  // Feeds back into the sweep so a hidden tab keeps reading — see watchWhileHidden.
  useEffect(() => { setWatchWhileHidden(liquidationAlerts.enabled) }, [liquidationAlerts.enabled])

  // Resting limit orders (off-chain, stage 1) and the in-tab monitor that fires
  // them — the entry-side twin of the TP/SL monitor right below.
  const limitOrders = useStellarLimitOrders(address, walletConnected, walletSource)
  const limitOrderMonitor = useStellarLimitOrderMonitor({
    orders: limitOrders.orders,
    assets,
    price: lastFeedPrice,
    enabled: isConnected,
    settle: limitOrders.settle,
    onFilled: () => refetchActivity(),
  })

  const tpSlMonitor = useStellarTpSlMonitor({
    positions,
    tpSlByPosition,
    price: lastFeedPrice,
    enabled: isConnected,
    onClosed: (id) => { applyOptimisticClose(id); refetchActivity() },
  })

  if (!mounted) return null

  return (
    <ErrorBoundary>
      {/* No min-h-screen: with an empty activity panel the content ends ~300px short
          of the fold, and forcing the wrapper to full height pushed the footer down
          behind a band of nothing. The ambient layer below is `fixed`, so it still
          covers the viewport when the content doesn't. */}
      <div className="text-foreground font-sans relative overflow-hidden">
        {/* Ambient background */}
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-primary/5 blur-[120px] animate-pulse" style={{ animationDuration: "8s" }} />
          <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-emerald-500/5 blur-[120px] animate-pulse" style={{ animationDuration: "10s" }} />
        </div>

        <main className={cn("relative w-full px-[10px] pt-8", positions.length > 0 ? "pb-28 lg:pb-12" : "pb-12")}>
          {/* Header */}
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="mb-6">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div>
                <h1 className="text-3xl md:text-4xl lg:text-5xl font-black leading-[1.15] mb-2 text-foreground/90">
                  Margin Trading
                  <span className="ml-3 align-middle text-xs font-bold tracking-widest uppercase px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                    Testnet
                  </span>
                </h1>
                <p className="text-sm text-muted-foreground">Leverage up to {STELLAR_MARGIN_CONFIG.constants.MAX_LEVERAGE}× on XLM · Stellar</p>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                {/* Empty-margin CTA — surfaces the "add collateral" action up in the
                    header too (not just inside the open panel), so a user whose
                    trading account is empty has an unmissable way to fund it.
                    Hidden while onboarding is auto-funding (it fills margin for you),
                    and hidden once capital is deployed: "…to start trading" is wrong
                    advice for someone whose margin is zero because it's in a trade. */}
                {isConnected && balancesReady && usdtMarginAmount <= 0 && !onboarding.isBusy && positions.length === 0 && (
                  <motion.button
                    onClick={() => setCollateralOpen(true)}
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    transition={{ type: "spring", stiffness: 400, damping: 22 }}
                    className="group flex items-center gap-2 px-3.5 py-2 rounded-full cursor-pointer
                      border border-amber-500/40 bg-amber-500/15 hover:bg-amber-500/25
                      text-amber-800 dark:text-amber-300 shadow-sm hover:shadow-md hover:shadow-amber-500/20
                      ring-1 ring-inset ring-amber-500/10 hover:ring-amber-500/30
                      transition-colors"
                  >
                    <Plus className="w-4 h-4 transition-transform group-hover:scale-110" />
                    <span className="text-xs font-bold">Add collateral to start trading</span>
                  </motion.button>
                )}
                {/* Liquidation warnings. Offered only with something to lose:
                    browsers give one clean chance to ask for notification
                    permission, so it is spent when the answer is obviously yes. */}
                {isConnected && positions.length > 0 && (
                  <StellarAlertToggle
                    enabled={liquidationAlerts.enabled}
                    permission={liquidationAlerts.permission}
                    onEnable={liquidationAlerts.enable}
                    onDisable={liquidationAlerts.disable}
                  />
                )}
                {/* Manage-collateral — shows the margin account's active USDT collateral */}
                {isConnected && (
                  <motion.button
                    data-testid="margin-collateral-pill"
                    onClick={() => setCollateralOpen(true)}
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    transition={{ type: "spring", stiffness: 400, damping: 22 }}
                    title="Manage collateral"
                    className="group flex items-center gap-2 px-3.5 py-2 rounded-full cursor-pointer
                      border border-primary/40 bg-primary/10 hover:bg-primary/20
                      shadow-sm hover:shadow-md hover:shadow-primary/20
                      ring-1 ring-inset ring-primary/10 hover:ring-primary/30
                      transition-colors"
                  >
                    <Wallet className="w-4 h-4 text-primary transition-transform group-hover:scale-110" />
                    <span className="text-xs font-medium text-primary/80">Collateral</span>
                    <span className="text-xs font-bold tabular-nums text-foreground">{usdtMarginAmount.toFixed(2)} USDT</span>
                    <Settings2 className="w-3.5 h-3.5 text-primary/70 transition-transform duration-300 group-hover:rotate-90" />
                  </motion.button>
                )}
              </div>
            </div>
          </motion.div>

          {/* Trading challenge promo (self-gating: renders nothing when off) */}
          <ChallengeBanner />

          {/* Resuming a stranded open runs the same three signed steps as a
              fresh one, from this page-level hook — so it needs the same
              "we're finalising, stay put" overlay the order form shows. */}
          <AnimatePresence>
            {isResuming && <StellarOpenProgress step={resumeStep} isResume />}
          </AnimatePresence>

          {/* Cranking a stranded close from the banner below runs the same legs
              as a fresh one, so it gets the same overlay — the "finish" button's
              inline label alone left a minute-long wait looking like nothing. */}
          <AnimatePresence>
            {isFinishingClose && closeAction === 'finish' && <StellarCloseProgress step={closeStep} isRecovery />}
          </AnimatePresence>

          {/* Pending-open recovery */}
          {activePending && (
            <StellarPendingBanner
              pending={activePending}
              onResume={async () => { await resumePending(activePending); refetchActivity() }}
              onCancel={async () => { await cancelPending(activePending); refetchActivity() }}
              isResuming={isResuming}
              isCancelling={isCancelling}
              resumeLabel={stepLabel}
            />
          )}

          {/* Pending-close recovery — a split close that stalled mid-flow.
              `closeAction` splits the close hook's single `isLoading` back into
              which BUTTON is running: passing it as both isFinishing and
              isCancelling made every button in the banner spin at once, so
              pressing "Finish close" also read "Cancelling…" and "Clearing…"
              next to it — three contradictory claims about one action. */}
          {activePendingClose && (
            <StellarPendingCloseBanner
              pending={activePendingClose}
              onFinish={async () => {
                setCloseAction('finish')
                try { await finishPendingClose(activePendingClose) } finally { setCloseAction(null) }
                refetchActivity()
              }}
              onCancel={async () => {
                setCloseAction('cancel')
                try { await cancelPendingClose(activePendingClose) } finally { setCloseAction(null) }
                refetchActivity()
              }}
              onExpire={async () => {
                setCloseAction('expire')
                try { await expirePendingClose(activePendingClose) } finally { setCloseAction(null) }
                refetchActivity()
              }}
              isFinishing={isFinishingClose && closeAction === 'finish'}
              isCancelling={isFinishingClose && (closeAction === 'cancel' || closeAction === 'expire')}
              busy={isFinishingClose}
              finishLabel={closeStepLabel}
              assets={assets}
              onRepaid={refetchActivity}
            />
          )}

          {/* Settled, but the contract is still holding it while an interest
              residual clears. No buttons: there is nothing for the trader to
              sign, and the row exists so the position doesn't disappear from
              the list before it is actually gone. */}
          {activeSettling && <StellarSettlingBanner settling={activeSettling} />}

          {/* What the always-on keeper did (or couldn't do) while nobody was
              watching. The keeper's own log is on a cron host; this is the only
              place the trader ever hears about it. */}
          <StellarKeeperNotice
            items={keeperArms.notable}
            address={address}
            openPositionIds={keeperNoticeScope.open}
            positionsWithTriggers={keeperNoticeScope.withTriggers}
          />

          {/* Stuck-funds recovery — finish an interrupted collateral transfer
              (or send it back to the wallet). Shown above onboarding so a stranded
              balance is the first thing a returning user sees. */}
          <StellarRecoveryBanner
            stuck={recovery.stuck}
            busy={recovery.busy}
            onToMargin={recovery.recoverToMargin}
            onToWallet={recovery.recoverToWallet}
          />

          {/* Testnet onboarding — never leave a connected wallet with an empty page.
              Big auto-opening popup first; inline card persists behind it as fallback. */}
          <StellarFundingDialog
            needsSetup={onboarding.needsSetup}
            step={onboarding.step}
            isBusy={onboarding.isBusy}
            error={onboarding.error}
            onSetup={onboarding.runSetup}
          />
          {(onboarding.needsSetup || onboarding.isBusy) && (
            <StellarOnboardingCard
              step={onboarding.step}
              statusMessage={onboarding.statusMessage}
              isBusy={onboarding.isBusy}
              onSetup={onboarding.runSetup}
            />
          )}

          {/* The faucet is a one-time grant, so a trader who has spent theirs sees
              an empty account with no "get funds" card anywhere. Say why, once,
              instead of letting it read as a missing button. */}
          {onboarding.grantSpent && (
            <div className="mb-5 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <p className="text-xs text-muted-foreground">
                You’ve used your one-time {STELLAR_MARGIN_CONFIG.constants.FAUCET_GRANT_USDT} USDT of test money.
                Add collateral from your wallet to keep trading.
              </p>
            </div>
          )}

          {/* Main grid: Open | (Chart + Activity stacked).
              Activity lives under the chart in the right column so the open panel
              growing (e.g. expanding TP/SL) never pushes it down. */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            <div className="order-1 lg:col-span-4">
              <StellarOpenPanel
                assets={assets}
                isConnected={isConnected}
                onOpened={(info?: OpenedInfo & { alwaysOn?: boolean }) => {
                  if (info?.alwaysOn) {
                    setPendingArm({
                      positionId: info.positionId,
                      takeProfit: info.takeProfit,
                      stopLoss: info.stopLoss,
                    })
                  }
                  refetchActivity()
                }}
                onPendingStranded={refetchActivity}
                onAddCollateral={() => setCollateralOpen(true)}
                onFillQuote={setFillPreview}
                referencePrice={lastFeedPrice}
                onPlaceLimitOrder={limitOrders.place}
                className="h-full min-h-[420px]"
              />
            </div>

            <div ref={activityRef} className="order-2 lg:col-span-8 flex flex-col gap-5">
              <StellarPriceChart
                positions={positions}
                entryPricesFeed={chartEntries}
                entryLeverages={entryLeverageByPosition}
                tpSlPrices={tpSlByPosition}
                autoCloseArmed={tpSlMonitor.armedCount}
                onLivePrice={setLastFeedPrice}
                poolPrice={poolPrice}
                fillPreview={fillPreview}
                className="min-h-[420px]"
              />

              {/* Activity: Positions · Unfinished · Trades · History */}
              <StellarActivityTabs
                positions={positions}
                assets={assets}
                onClosed={refetchActivity}
                onOptimisticClose={applyOptimisticClose}
                tpSlByPosition={tpSlByPosition}
                referencePrice={lastFeedPrice}
                entryPrices={entryPrices}
                markPrices={poolMarks}
                requirePoolMark
                entryLeverages={entryLeverageByPosition}
                debtBasis={debtBasisByPosition}
                repayAdjust={repayAdjustByPosition}
                onSetTpSl={handleSetTpSl}
                onRepaid={refetchActivity}
                allowAlwaysOn
                positionsReady={positionsLoaded}
                notConnected={!isConnected}
                positionsError={positionsError}
                onRetryPositions={refetchPositions}
                pending={pendingList}
                onResume={async (p) => { await resumePending(p); refetchActivity() }}
                onCancel={async (p) => { await cancelPending(p); refetchActivity() }}
                isResuming={isResuming}
                isCancelling={isCancelling}
                resumeLabel={stepLabel}
                trades={trades}
                history={history}
                tradesLoading={journal.isLoading}
                needsWalletSignIn={showJournalSignIn}
                onWalletSignIn={handleJournalSignIn}
                isSigningIn={walletSessionStatus === 'signing'}
                signInError={walletSessionStatus === 'error' ? walletSessionError : null}
                limitOrders={limitOrders.orders}
                limitOrdersWatching={limitOrderMonitor.watchingCount}
                onCancelLimitOrder={limitOrders.cancel}
              />
            </div>
          </div>

          {/* Mobile only — desktop already shows the table next to the chart. */}
          <StellarMobilePositionBar
            count={openSummary.count}
            totalPnlUsd={openSummary.totalPnlUsd}
            anyPnl={openSummary.anyPnl}
            worstHealth={openSummary.worstHealth}
            onView={() => activityRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })}
          />
        </main>

        {/* Manage-collateral dialog.
            Not dismissible mid-transfer: Radix closes on Escape / outside click /
            the X regardless of what the content is doing, and closing UNMOUNTS the
            dialog — so a move that is already signing carried on with its status,
            its errors and its Cancel button gone. The buttons inside were disabled
            while busy; these three exits were not. */}
        <Dialog open={collateralOpen} onOpenChange={(o) => { if (!collateralBusy) setCollateralOpen(o) }}>
          <DialogContent
            data-testid="margin-collateral-dialog"
            closeDisabled={collateralBusy}
            className="max-h-[90vh] w-full max-w-md overflow-y-auto overflow-x-hidden backdrop-blur-xl bg-background/90 border-white/10 p-0"
            onEscapeKeyDown={(e) => { if (collateralBusy) e.preventDefault() }}
            onInteractOutside={(e) => { if (collateralBusy) e.preventDefault() }}
          >
            <DialogHeader className="px-5 pt-5 pb-0">
              <DialogTitle className="text-xl font-bold">Manage Collateral</DialogTitle>
            </DialogHeader>
            <StellarCollateralDialog
              assets={assets}
              onDone={refetchAll}
              onBusyChange={setCollateralBusy}
              onOptimistic={applyOptimisticMargin}
            />
          </DialogContent>
        </Dialog>
      </div>
    </ErrorBoundary>
  )
}

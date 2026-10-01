'use client'

/**
 * Open-positions list with inline close (V3 on-chain swap close — the wallet
 * doesn't need to hold the debt asset).
 */
import { useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { TrendingUp, TrendingDown, X, Loader2, AlertTriangle, HandCoins } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { TermTip } from './TermTip'
import { StellarRepayDialog } from './StellarRepayDialog'
import { useStellarMarginClose } from '../../hooks/use-stellar-margin-close'
import { STELLAR_MARGIN_CONFIG as CFG } from '../../config/stellarMarginConfig'
import { liquidationPrice, liquidationDistancePct, computeUnrealizedPnl, computeBorrowInterest, formatTriggerPrice } from '../../lib/marginMath'
import { MARGIN_HEALTH_CRITICAL, MARGIN_HEALTH_CAUTION } from '../../lib/riskAlerts'
import { AnimatedNumber } from './AnimatedNumber'
import { StellarCloseResult, type CloseResult } from './StellarCloseResult'
import { StellarCloseProgress } from './StellarCloseProgress'
import { StellarTpSlEditPopover } from './StellarTpSlEditPopover'
import { StellarKeeperChip } from './StellarKeeperChip'
import { useStellarKeeperArms } from '../../hooks/use-stellar-keeper-arms'
import type { StellarMarginAsset, StellarMarginPosition } from '../../types/stellarMargin'

interface Props {
  positions: StellarMarginPosition[]
  /** Market state — used for the live liquidation price (cf + current price). */
  assets?: StellarMarginAsset[]
  onClosed?: () => void
  /** Instant UI removal on close, reconciled by the next on-chain read. */
  onOptimisticClose?: (id: string) => void
  /** positionId → take-profit / stop-loss trigger prices (XLM/USD), if set. */
  tpSlByPosition?: Record<string, { takeProfit?: number | null; stopLoss?: number | null }>
  /** Real XLM/USD feed price — anchors Liq. Price into the chart/TP-SL domain. */
  referencePrice?: number
  /** positionId → the price the opening swap FILLED at, drives the live PnL ticker. */
  entryPrices?: Record<string, number>
  /**
   * positionId → what the position's exit is currently worth in the pool
   * (`useStellarPoolMarks`). Entry prices are execution prices, so PnL has to be
   * marked against an execution price too — pairing a pool entry with the feed
   * showed the execution gap as an instant loss on a trade that hadn't moved.
   * The feed stays THE price for Liq./TP-SL, which are feed-domain triggers by
   * definition.
   */
  markPrices?: Record<string, number>
  /**
   * Real mode: a position with no pool mark yet shows NO PnL rather than a
   * feed-marked one — the pool-entry-vs-feed-mark mix displays the execution gap
   * (measured 0.7–5%) as phantom PnL, ×leverage in ROE, until the first quote
   * lands.
   */
  requirePoolMark?: boolean
  /**
   * positionId → the leverage the trader chose at open (journal). Shown as the
   * badge instead of the equity-derived live figure, which drifts with price and
   * swap execution and reads as a bug ("I picked 5× but it says 4.4×").
   */
  entryLeverages?: Record<string, number>
  /**
   * positionId → borrow drawn at open + when. The on-chain debt already carries
   * accrued interest, so this basis is what turns it into the funding cost the
   * position is paying. Absent → no funding shown, PnL is price-only.
   */
  debtBasis?: Record<string, { borrowAmount: number; openedAtMs: number }>
  /**
   * positionId → what partial repayments already retired.
   *
   * Only a Short accrues this, and it exists because the live PnL is sized off
   * the position's CURRENT XLM exposure — which for a Short is its debt. Repaying
   * shrinks that debt, so without these terms the ticker drops by the whole value
   * of the repaid slice the instant the repayment lands, reading as a sudden loss
   * on a trade that just got safer.
   *
   *   realizedUsd — PnL those slices locked in, added back to the live figure
   *   xlmRetired  — XLM exposure they removed, restored to the ROE denominator so
   *                 the percentage is still measured against the whole trade
   */
  repayAdjust?: Record<string, { realizedUsd: number; xlmRetired: number }>
  /** Edit/clear TP/SL on an open position. Read-only when omitted. */
  onSetTpSl?: (positionId: string, next: { takeProfit: number | null; stopLoss: number | null }) => void | Promise<void>
  /** Refresh after a partial repayment landed (debt/health/liq all moved). */
  onRepaid?: () => void
  /** Offer the always-on keeper toggle. */
  allowAlwaysOn?: boolean
  /**
   * Whether the on-chain sweep has completed at least once. Until it has, an empty
   * `positions` array means "we haven't looked yet", not "you have none" — and the
   * empty state told a trader with five open positions they had none for the first
   * seconds of every page load. Defaults to true for callers with no async load.
   */
  positionsReady?: boolean
  /**
   * No wallet yet — there is nothing to sweep, so `positionsReady` never turns
   * true and the panel sat under a spinner promising a load that could not
   * happen, for as long as a logged-out visitor cared to look at it. Checked
   * before readiness: "log in first" outranks "still loading".
   */
  notConnected?: boolean
  /**
   * Why the last on-chain sweep failed, if it did.
   *
   * `positions` is empty in that case too, and without this the panel says "No
   * open positions" — the single most alarming thing it can say to someone whose
   * collateral is on-chain and simply unreadable this second. A failed read must
   * look like a failed read.
   */
  loadError?: string | null
  /** Re-run the sweep (the retry on the error state). */
  onRetryLoad?: () => void
  className?: string
}

/** One formatter for every trigger price in the app — see `formatTriggerPrice`. */
const fmtTrigger = formatTriggerPrice

/** "5×" for whole multipliers, "2.5×" otherwise. */
const fmtLev = (x: number) => {
  const r = Math.round(x * 10) / 10
  return `${r % 1 === 0 ? r.toFixed(0) : r.toFixed(1)}×`
}

/** HF below this is "near liquidation" — surfaced prominently. Defined once, in
 *  lib/riskAlerts, because the liquidation warnings fire on the same line: a
 *  notification that disagreed with the badge it sends you to look at would make
 *  both of them harder to trust. */
const CRITICAL_HF = MARGIN_HEALTH_CRITICAL
const CAUTION_HF = MARGIN_HEALTH_CAUTION

/**
 * How much room to liquidation still counts as comfortable, in percent of the
 * current price. Deliberately generous: XLM moving 8% in a day is unremarkable,
 * so a position with 8% of room is one ordinary day from being closed out.
 */
const LIQ_NEAR_PCT = 8
const LIQ_WATCH_PCT = 15

/** Distance-to-liquidation colour. Mirrors the health badge's severity steps. */
function liqDistanceClass(pct: number): string {
  if (pct <= LIQ_NEAR_PCT) return 'text-red-400'
  if (pct <= LIQ_WATCH_PCT) return 'text-amber-500 dark:text-amber-400'
  return 'text-muted-foreground/50'
}

/** Funding small enough to render as "−$0.00" is not worth a line of its own. */
const FUNDING_EPSILON = 0.005

/**
 * The trader's own money in a position: what it's worth now, minus what it owes.
 *
 * Same expression for both sides — a Long holds XLM against a USDT debt, a Short
 * holds USDT against an XLM debt, and in both cases the difference is theirs. This
 * is what actually lands back in the margin account on close, which is why it needs
 * a name on screen: without it, a 1.2× position reads as "$1,185 size, $200 debt"
 * and the ~$985 returning on close looks like money the app made up.
 *
 * Floored at zero — a position past liquidation has negative equity, and showing
 * "your stake −$12" would suggest the trader owes it on top.
 */
function stakeUsd(p: StellarMarginPosition): number {
  return Math.max(p.collateralUsd - p.debtUsd, 0)
}

function hfBadge(hf: number): string {
  if (hf >= 2) return 'bg-emerald-500/15 text-emerald-400'
  if (hf >= CAUTION_HF) return 'bg-yellow-500/15 text-yellow-400'
  if (hf >= CRITICAL_HF) return 'bg-orange-500/15 text-orange-400'
  return 'bg-red-500/15 text-red-400'
}

/**
 * How a position's health reads on screen — one place, because the desktop table
 * and the mobile cards render the same badge and drifting apart here means one
 * layout alarming while the other doesn't.
 *
 * `healthUnknown` is the oracle being briefly unable to price the pair. The
 * health value is 0 then, which is the loudest thing this badge can say: red,
 * pulsing, "0.00", plus a liquidation warning above the table. That is a
 * frightening claim to make about someone's money on the strength of a read that
 * simply didn't answer — position 35 showed it while sitting at a perfectly safe
 * 12.00 on-chain. A dash says the same thing honestly: we don't know right now.
 */
export function hfView(p: { healthFactor: number; healthUnknown?: boolean }): {
  label: string
  className: string
  critical: boolean
  caution: boolean
} {
  if (p.healthUnknown) {
    return { label: '—', className: 'bg-white/5 text-white/40', critical: false, caution: false }
  }
  return {
    label: p.healthFactor >= 99 ? '∞' : p.healthFactor.toFixed(2),
    className: hfBadge(p.healthFactor),
    critical: p.healthFactor < CRITICAL_HF,
    caution: p.healthFactor >= CRITICAL_HF && p.healthFactor < CAUTION_HF,
  }
}

export function StellarPositionsPanel({ positions, assets, onClosed, onOptimisticClose, tpSlByPosition, referencePrice, entryPrices, markPrices, requirePoolMark, entryLeverages, debtBasis, repayAdjust, onSetTpSl, onRepaid, allowAlwaysOn, positionsReady = true, notConnected, loadError, onRetryLoad, className }: Props) {
  // Always-on state per position. Shared React Query cache — the popover and the
  // page notice read the same rows, so a row can't claim "covered" while the
  // notice says "expired".
  const keeperArms = useStellarKeeperArms(Boolean(allowAlwaysOn))
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  // Which position the repay dialog is open for. Held by id (not by object) so the
  // dialog keeps tracking the SAME position across the panel's polling refreshes —
  // binding the position itself would freeze the preview's "now" side at whatever
  // debt and health were true when the dialog opened.
  const [repayingId, setRepayingId] = useState<string | null>(null)
  // True while that dialog has a repayment in flight — it gates the dialog's own
  // dismissal, which the dialog itself can't do (Radix owns those exits).
  const [repayBusy, setRepayBusy] = useState(false)
  const [closeResult, setCloseResult] = useState<CloseResult | null>(null)
  // Live PnL per position, mirrored into a ref so the close callback can read the
  // figure as of the moment the close ACTUALLY landed.
  //
  // This used to snapshot at confirm-click, which put the modal's number several
  // seconds (and a multi-step on-chain close) ahead of reality — History then
  // reported a different PnL for the same trade. Both now read the same entry price
  // and the same feed tick.
  const pnlRef = useRef<Record<string, CloseResult>>({})
  // WHICH position is closing, not just THAT one is. The close hook exposes a single
  // `isLoading`, so every row's button greyed out together with no indication of
  // why — and the row actually working looked no different from the rest.
  //
  // Closes genuinely must run one at a time (the hook's `busyRef` drops a second
  // call outright, and the split close needs `withdraw` within ~2 ledgers of
  // `begin`), so other rows stay disabled — but now they say so, and the busy row
  // shows the step it's on.
  const [closingId, setClosingId] = useState<string | null>(null)
  /**
   * The close error the user has already waved away, by message.
   *
   * Dismissing goes through here rather than the hook's `reset()` because reset
   * also releases the shared margin flow lock. A user who fails a close, starts an
   * open, and then tidies up the leftover red banner would have released the OPEN's
   * claim — handing the next flow a sequence-number race, from a button that only
   * ever promised to hide a message. Comparing by message also re-shows the banner
   * when the NEXT attempt fails with something different.
   */
  const [dismissedError, setDismissedError] = useState<string | null>(null)
  const {
    closePosition,
    step: closeStep,
    stepLabel: closeStepLabel,
    isLoading: isClosing,
    // Surfaced IN the panel, not only as a toast. A close failure has to stay
    // readable — it can leave a pending the user must act on — but a pinned toast
    // sits in the viewport's bottom-right corner, which is where this table's
    // Close buttons are, and it swallowed clicks meant for them. In the layout it
    // pushes the table down instead of covering it.
    error: closeError,
  } = useStellarMarginClose((id) => {
    setConfirmingId(null)
    const r = pnlRef.current[id]
    if (r) { setCloseResult(r); delete pnlRef.current[id] }
    onOptimisticClose?.(id)
    onClosed?.()
  })

  const xlm = assets?.find((a) => a.key === 'XLM')
  // Prefer the real feed price so Liq. Price shares the chart + TP/SL domain (the
  // testnet oracle's flat $1 would otherwise disagree with the chart's liq line).
  const markIsLive = Boolean(referencePrice && referencePrice > 0)
  const xlmPrice = markIsLive ? referencePrice : (xlm?.priceUsd ?? 1)
  // V3 perps: liquidation is maintenance-margin based (5%), not lending-CF based.
  const maintenanceMargin = CFG.constants.MAINTENANCE_MARGIN
  // A health we couldn't read is not a position near liquidation.
  const atRisk = positions.filter((p) => hfView(p).critical).length
  // Re-resolved from `positions` on every render, so the repay dialog previews
  // against the freshest debt/health rather than a snapshot from when it opened.
  const repayTarget = repayingId ? positions.find((p) => p.id === repayingId) ?? null : null

  // Live (unrealized) PnL per position + the aggregate the header ticker shows.
  // XLM exposure: a Long holds XLM (collateral), a Short owes XLM (debt).
  // PnL is NET of borrow interest — holding a leveraged position costs money, and a
  // price-only figure would quietly overstate what the trader actually keeps.
  const now = Date.now()
  const pnlById: Record<string, ReturnType<typeof computeUnrealizedPnl>> = {}
  const fundingById: Record<string, ReturnType<typeof computeBorrowInterest>> = {}
  // The two prices the PnL is made of, kept so the row can SHOW them. They used
  // to exist only inside this loop, which is why the table could report a number
  // without ever saying which two prices produced it.
  const entryById: Record<string, number | null> = {}
  const markById: Record<string, number | null> = {}
  let totalPnl = 0
  let anyPnl = false
  for (const p of positions) {
    const entry = entryPrices?.[p.id] ?? null
    const basis = debtBasis?.[p.id]
    // The debt asset is XLM for a Short, USDT (≈$1) for a Long. Price XLM off the
    // live feed, never the flat $1 testnet oracle.
    const funding = computeBorrowInterest({
      debtAmount: p.debtAmount,
      borrowAtOpen: basis?.borrowAmount,
      debtPriceUsd: p.debtSymbol === 'XLM' ? xlmPrice : 1,
      openedAtMs: basis?.openedAtMs,
      nowMs: now,
    })
    fundingById[p.id] = funding
    const xlmNow = p.side === 'Long' ? p.collateralAmount : p.debtAmount
    // PnL only: the mark has to sit in the same domain as the entry (see
    // `markPrices` / `requirePoolMark`). Everything else on this row stays on
    // the feed price. No mark yet in real mode → PnL stays null ("—") until the
    // first pool quote lands, rather than flashing the execution gap.
    const markPrice = markPrices?.[p.id] ?? (requirePoolMark ? null : xlmPrice)
    entryById[p.id] = entry
    markById[p.id] = markPrice
    const live = computeUnrealizedPnl({
      side: p.side,
      entry,
      current: markPrice,
      xlmAmount: xlmNow,
      leverage: p.leverage,
      interestUsd: funding?.interestUsd,
    })
    // Fold in what earlier partial repayments already locked in (Shorts only — see
    // the `repayAdjust` prop). ROE is re-derived from the trade's FULL entry
    // exposure rather than rescaled off `live.roe`: a position sitting near
    // break-even has a live PnL of ~0, and scaling through it explodes.
    const adj = repayAdjust?.[p.id]
    let r = live
    if (live && adj && adj.realizedUsd !== 0) {
      const pnlUsd = live.pnlUsd + adj.realizedUsd
      const lev = p.leverage > 0 ? p.leverage : 1
      const entryEquity = entry != null ? ((xlmNow + adj.xlmRetired) * entry) / lev : 0
      r = { ...live, pnlUsd, roe: entryEquity > 0 ? (pnlUsd / entryEquity) * 100 : live.roe }
    }
    pnlById[p.id] = r
    if (r) {
      totalPnl += r.pnlUsd
      anyPnl = true
      // Keep the payoff-modal source current — read on close success, not on confirm.
      // `returnedUsd` rides along for the same reason the PnL does: read at the tick
      // the close lands on, so the modal's "back in your account" matches the margin
      // balance the trader is about to see move.
      pnlRef.current[p.id] = { side: p.side, pnlUsd: r.pnlUsd, roe: r.roe, returnedUsd: stakeUsd(p) }
    }
  }
  const totalUp = totalPnl >= 0

  // Derived per-position view, shared by the desktop table and the mobile cards so
  // the two layouts can never drift apart.
  //
  // This is now genuinely shared. It used to be built here, consumed by the mobile
  // cards, and then quietly recomputed inline by the desktop table — the exact
  // drift the comment claimed to prevent, minus the prevention.
  const rows = positions.map((p) => {
    const isLong = p.side === 'Long'
    const health = hfView(p)
    const liq = liquidationPrice({ side: p.side, collateralUsd: p.collateralUsd, debtUsd: p.debtUsd, maintenanceMargin, price: xlmPrice })
    const liqPct = liquidationDistancePct({ side: p.side, liqPrice: liq, price: xlmPrice })
    const tp = p.takeProfitUsd ?? tpSlByPosition?.[p.id]?.takeProfit
    const sl = p.stopLossUsd ?? tpSlByPosition?.[p.id]?.stopLoss
    const entry = entryById[p.id] ?? null
    const mark = markById[p.id] ?? null
    const pnl = pnlById[p.id]
    // No PnL yet, but there WILL be one: the entry is known and we're waiting on
    // the first pool quote (`requirePoolMark`, up to one refresh interval). That
    // is a different state from "this position has no recorded entry", and
    // rendering both as a bare dash made a normal few-second wait look broken.
    const pnlPending = !pnl && entry != null && entry > 0 && mark == null
    return { p, isLong, critical: health.critical, caution: health.caution, health, liq, liqPct, tp, sl, entry, mark, pnl, funding: fundingById[p.id], pnlPending }
  })
  type Row = (typeof rows)[number]

  /**
   * Entry → Mark, the two prices the PnL is the difference between.
   *
   * Both are execution prices (see `markPrices`): what the opening swap filled at,
   * and what the pool would fill the close at right now. Showing them is what turns
   * the PnL from a number the app asserts into one the trader can check.
   */
  const renderPrices = (row: Row) => {
    const { entry, mark, pnl } = row
    if (entry == null || !(entry > 0)) {
      return (
        <TermTip side="bottom" tip="This position has no recorded entry price, so there is nothing to measure a live PnL against. Its size, debt and health above are read straight from the chain and are unaffected." className="text-muted-foreground/40 no-underline">
          —
        </TermTip>
      )
    }
    const up = pnl ? pnl.pricePct >= 0 : true
    return (
      <TermTip
        side="bottom"
        className="flex flex-col items-end leading-tight tabular-nums no-underline"
        tip="Top: the price your opening trade actually filled at. Bottom: what the pool would fill your close at right now — both quoted the same way, so the gap between them is a real move and not a pricing artefact."
      >
        <span className="text-muted-foreground/80">${fmtTrigger(entry)}</span>
        <span className="text-[10px] flex items-center gap-0.5">
          <span className="text-muted-foreground/30">→</span>
          {mark != null ? (
            <>
              <span className="text-muted-foreground/60">${fmtTrigger(mark)}</span>
              {pnl && (
                <span className={cn('ml-0.5 font-semibold', up ? 'text-emerald-400/70' : 'text-red-400/70')}>
                  {pnl.pricePct >= 0 ? '+' : ''}{pnl.pricePct.toFixed(2)}%
                </span>
              )}
            </>
          ) : (
            <span className="text-muted-foreground/30">pricing…</span>
          )}
        </span>
      </TermTip>
    )
  }

  /**
   * Live PnL, with the arithmetic behind it.
   *
   * Funding lives IN this cell rather than in a column of its own. It used to sit
   * two columns away while already being subtracted here, so the honest way to read
   * the table was to ignore a column — and anyone who instead did the natural thing
   * and subtracted it a second time got a number the app never claimed.
   */
  const renderPnl = (row: Row, big = false) => {
    const { pnl: r, funding: f, pnlPending, p } = row
    if (!r) {
      if (pnlPending) {
        return (
          <TermTip
            side="bottom"
            className="text-muted-foreground/40 text-[11px] no-underline"
            tip="Working out what your exit is worth in the pool you'd actually close into — a few seconds. Nothing is wrong with the position; we simply won't show a profit figure we'd have to correct."
          >
            <span className="inline-flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              pricing…
            </span>
          </TermTip>
        )
      }
      return (
        <TermTip side="bottom" tip="No entry price was recorded for this position, so there is no live profit or loss to show. Everything else on this row is read from the chain as usual." className="text-muted-foreground/40 no-underline">
          —
        </TermTip>
      )
    }
    const up = r.pnlUsd >= 0
    const hasFunding = r.interestUsd > FUNDING_EPSILON
    const lev = entryLeverages?.[p.id] ?? (p.leverage > 0 ? p.leverage : 1)
    const tip = (
      <span className="block space-y-1">
        <span className="block">
          {/* `pricePct` is already directional — a short's profitable move is a
              falling price — so it is stated as for/against, not up/down. */}
          Price moved {Math.abs(r.pricePct).toFixed(2)}% {r.pricePct >= 0 ? 'in your favour' : 'against you'}, worth{' '}
          <strong>{r.grossPnlUsd >= 0 ? '+' : '−'}${Math.abs(r.grossPnlUsd).toFixed(2)}</strong> on this position&apos;s size.
        </span>
        {hasFunding && (
          <span className="block">
            Minus <strong>${r.interestUsd.toFixed(2)}</strong> of borrow interest so far
            {f?.aprPct != null ? ` (${(f.aprPct / 365).toFixed(3)}% per day)` : ''} = {r.pnlUsd >= 0 ? '+' : '−'}${Math.abs(r.pnlUsd).toFixed(2)}.
          </span>
        )}
        <span className="block">
          That is {r.roe >= 0 ? '+' : ''}{r.roe.toFixed(1)}% on your own money — the price move multiplied by your {fmtLev(lev)} leverage.
        </span>
      </span>
    )
    return (
      <TermTip side="bottom" className={cn('flex flex-col leading-tight no-underline', big ? 'items-start' : 'items-end')} tip={tip}>
        <AnimatedNumber
          value={r.pnlUsd}
          prefix="$"
          signed
          decimals={2}
          className={cn(big ? 'text-lg font-black' : 'font-bold', up ? 'text-emerald-400' : 'text-red-400')}
        />
        <span className={cn('tabular-nums', big ? 'text-[11px]' : 'text-[10px]')}>
          <AnimatedNumber value={r.roe} suffix="%" signed decimals={1} className={cn('font-semibold', up ? 'text-emerald-400/70' : 'text-red-400/70')} />
          <span className="text-muted-foreground/40"> on your stake</span>
        </span>
        {hasFunding && (
          <span className={cn('text-muted-foreground/40 tabular-nums', big ? 'text-[10px]' : 'text-[9px]')}>
            after −${r.interestUsd.toFixed(2)} funding
          </span>
        )}
      </TermTip>
    )
  }

  /** Liquidation price + how far the price still has to travel to reach it. */
  const renderLiq = (row: Row, align: 'end' | 'start' = 'end') => {
    const { liq, liqPct, isLong } = row
    if (!liq) return <span className="text-muted-foreground/40">—</span>
    return (
      <div className={cn('flex flex-col leading-tight tabular-nums', align === 'end' ? 'items-end' : 'items-start')}>
        <span className="text-muted-foreground/70">${liq.toFixed(4)}</span>
        {liqPct != null && (
          <TermTip
            side="bottom"
            className={cn('text-[10px] font-semibold no-underline', liqDistanceClass(liqPct))}
            tip={`XLM has to ${isLong ? 'fall' : 'rise'} ${liqPct.toFixed(1)}% from here before this position is closed automatically to cover its debt. Adding margin pushes that further away.`}
          >
            {liqPct.toFixed(1)}% {isLong ? 'below' : 'above'}
          </TermTip>
        )}
      </div>
    )
  }

  /**
   * Take-profit / stop-loss, labelled. The two prices were previously told apart
   * by colour alone — which is no distinction at all for a red-green colour-blind
   * trader looking at the two numbers that close their position for them.
   */
  const renderTpSl = (row: Row, stacked: boolean) => {
    const { tp, sl } = row
    if (tp == null && sl == null) return <span className="text-muted-foreground/30">—</span>
    const Level = ({ label, value, tone }: { label: string; value: number | null | undefined; tone: string }) =>
      value != null ? (
        <span className="inline-flex items-center gap-1 tabular-nums">
          <span className="text-[9px] font-bold text-muted-foreground/40">{label}</span>
          <span className={tone}>${fmtTrigger(value)}</span>
        </span>
      ) : (
        <span className="inline-flex items-center gap-1">
          <span className="text-[9px] font-bold text-muted-foreground/30">{label}</span>
          <span className="text-muted-foreground/30">—</span>
        </span>
      )
    return (
      <div className={cn('flex leading-tight', stacked ? 'flex-col items-end gap-0.5' : 'items-center gap-2')}>
        <Level label="TP" value={tp} tone="text-emerald-400" />
        <Level label="SL" value={sl} tone="text-red-400" />
      </div>
    )
  }

  // Leverage badge, rendered in both layouts. Headline number = what the trader
  // chose at open; the live equity-derived figure (which drifts with price) moves
  // into the tooltip so it stops looking like the position opened at the wrong size.
  const renderLeverageBadge = (p: StellarMarginPosition) => {
    const chosen = entryLeverages?.[p.id]
    const shown = chosen ?? p.leverage
    const drifted = chosen != null && p.leverage > 0 && Math.abs(p.leverage - chosen) >= 0.05
    return (
      <TermTip
        tip={
          chosen != null
            ? `The multiplier you chose when opening this position.${drifted ? ` As the price moves, its current effective leverage drifts with it — right now about ${fmtLev(p.leverage)}.` : ''}`
            : 'Current effective leverage — position size relative to your own margin. It drifts as the price moves.'
        }
        className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[11px] font-bold no-underline"
      >
        {fmtLev(shown)}
      </TermTip>
    )
  }

  /**
   * Can the lending pool actually pay this position's collateral back out?
   *
   * A close moves the WHOLE collateral out of its vault in one transfer, so a
   * position bigger than the market's free liquidity cannot be closed — no matter
   * how healthy it is, and no matter how many times it is tried. Read here so the
   * trader learns it from the row, before they press anything: the failure used to
   * arrive after two signatures as "Insufficient token balance for this step",
   * which reads as an accusation about their own wallet.
   *
   * `null` (read didn't answer) means say nothing. Guessing "can't close" from a
   * dropped request would be the worse error of the two.
   */
  const liquidityGap = (p: StellarMarginPosition): { available: number; label: string } | null => {
    const a = assets?.find((x) => x.token === p.collateralToken)
    if (!a || a.availableLiquidity == null) return null
    if (a.availableLiquidity >= p.collateralAmount) return null
    return { available: a.availableLiquidity, label: a.label }
  }

  // Close / confirm action, rendered in both layouts. `full` gives the mobile card a
  // full-width, always-visible button (no hover reveal — touch has no hover).
  const renderCloseAction = (p: StellarMarginPosition, full = false) => {
    const isConfirming = confirmingId === p.id
    const isThisClosing = closingId === p.id
    // Another row is mid-close: this one can't start until it finishes.
    const blockedByOther = isClosing && !isThisClosing
    // Not a hard block: liquidity can free up between this 20s read and the
    // press, and refusing a close on a stale number is worse than letting the
    // pre-flight say no with the live one. It is a warning, and it is specific.
    const gap = liquidityGap(p)

    const runClose = async () => {
      setClosingId(p.id)
      const ok = await closePosition(p)
      setClosingId(null)
      // On failure drop out of the confirm state so the row doesn't sit there looking
      // stuck. The error toast is persistent (duration: Infinity) and carries the why.
      if (!ok) setConfirmingId(null)
    }

    if (isConfirming) {
      return (
        <div className={cn('flex flex-col gap-1.5', full ? 'w-full' : 'items-end')}>
          {gap && !isThisClosing && (
            <span className={cn('flex items-start gap-1.5 rounded-md bg-amber-500/10 px-2 py-1 text-[10px] leading-snug text-amber-700 dark:text-amber-300', full ? 'w-full' : 'max-w-[15rem]')}>
              <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
              <span>
                Only {gap.available.toLocaleString('en-US', { maximumFractionDigits: 0 })} {gap.label} is free in the
                lending pool right now — this position holds {p.collateralAmount.toLocaleString('en-US', { maximumFractionDigits: 0 })}.
                The close will be refused until borrowers repay.
              </span>
            </span>
          )}
          <div className={cn('flex items-center gap-1.5', full ? 'w-full' : 'justify-end')}>
            <Button
              size="sm"
              onClick={runClose}
              disabled={isClosing}
              title={isThisClosing ? closeStepLabel : blockedByOther ? 'Finishing another close first' : undefined}
              className={cn('text-[11px] bg-red-500 hover:bg-red-600 text-white font-bold', full ? 'h-9 flex-1' : 'h-7 px-3')}
            >
              {isThisClosing ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {/* The split close is 4 steps — name the one it's on rather than
                      spinning silently for the whole flow. */}
                  {full && closeStepLabel ? closeStepLabel : null}
                </span>
              ) : blockedByOther ? 'Waiting…' : full ? 'Confirm close' : 'Confirm'}
            </Button>
            {/* Cancel is local UI state — it stays available unless THIS row is busy. */}
            <Button size="sm" variant="ghost" onClick={() => setConfirmingId(null)} disabled={isThisClosing}
              className={cn('text-[11px] text-muted-foreground', full ? 'h-9 px-3' : 'h-7 px-2')}>Cancel</Button>
          </div>
        </div>
      )
    }
    return (
      <div className={cn('flex items-center gap-1.5', full ? 'w-full' : 'justify-end')}>
        {/* "Add Margin" sits BEFORE Close: it is the non-destructive way out of a
            bad health factor, and the risk banner above sends traders here. The
            label is the trader's word for it — mechanically it repays part of the
            position's debt from the wallet, which is the only lever that moves
            THIS position's health (topping up account collateral doesn't).
            Held back while a close runs — not because repaying is invalid then
            (the contract allows it on Open and Closing alike), but because a
            second signature prompt interleaved with a close's own legs races it
            into txBadSeq — same account, same sequence number — and can strand
            the close. A position already stuck mid-close repays from the recovery
            banner instead. */}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setRepayingId(p.id)}
          disabled={isClosing}
          title={isClosing ? 'Finishing a close first' : "Add margin to this position — pays down its debt from your wallet"}
          className={cn(
            'text-[11px] hover:bg-primary/10 hover:text-primary transition-all',
            full
              ? 'h-9 flex-1 border border-primary/20 text-primary'
              : 'h-7 px-2.5 opacity-60 group-hover:opacity-100',
          )}
        >
          <HandCoins className="w-3 h-3 mr-1" /> Add Margin
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setConfirmingId(p.id)}
          disabled={isClosing}
          title={isClosing ? 'Finishing another close first' : undefined}
          className={cn(
            'text-[11px] hover:bg-red-500/10 hover:text-red-400 transition-all',
            // Mobile: full-width, always visible, outlined. Desktop: compact, dimmed at
            // rest and emphasized on hover — but never fully hidden (opacity-60, not 0),
            // so it's tappable on touch devices that never fire :hover.
            full
              ? 'h-9 flex-1 border border-red-500/20 text-red-500 dark:text-red-400'
              : 'h-7 px-2.5 opacity-60 group-hover:opacity-100',
          )}
        >
          <X className="w-3 h-3 mr-1" /> Close
        </Button>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={cn('relative overflow-hidden rounded-2xl backdrop-blur-xl border border-white/10 shadow-lg bg-white/5', className)}
    >
      {/* The close is four signed calls and two ledger waits — up to a minute in
          which the only feedback used to be a 12px spinner inside the button (and
          on desktop, not even a label beside it). That silence is why a trader
          pressed Close twice and reported the position as stuck. */}
      {isClosing && <StellarCloseProgress step={closeStep} />}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/8">
        <TrendingUp className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold">Positions</span>
        {/* A count is a claim too — "0" while the sweep is still running is the same
            lie the empty state used to tell. Show a placeholder until it's known. */}
        <span className="ml-1 px-1.5 py-px rounded-full bg-white/10 text-[10px] font-bold tabular-nums">{notConnected || positionsReady ? positions.length : '·'}</span>

        {/* Total live PnL ticker — the one number traders watch move. */}
        {anyPnl && (
          <div className="ml-auto flex items-center gap-2">
            <TermTip tip="Combined profit or loss of all open positions, after funding costs — not locked in until you close." className="text-[10px] uppercase tracking-wider text-muted-foreground/50">Unrealized</TermTip>
            <motion.span
              key={totalUp ? 'up' : 'down'}
              animate={{ scale: [1, 1.04, 1] }}
              transition={{ duration: 0.3 }}
              className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-sm font-black tabular-nums',
                totalUp ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10',
              )}
            >
              {totalUp ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              <AnimatedNumber value={totalPnl} prefix="$" signed decimals={2} />
            </motion.span>
          </div>
        )}
      </div>

      {/* Live liquidation alert — graduated, surfaced the moment health drops */}
      <AnimatePresence>
        {atRisk > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-2 px-4 py-2 bg-red-500/10 border-b border-red-500/20 text-red-800 dark:text-red-300 text-xs overflow-hidden">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 animate-pulse" />
            {/* This used to say "close or add collateral". Adding collateral does
                NOT help: liquidation reads a position's own collateral and its own
                debt, and ignores whatever else is sitting in the margin account —
                so the advice sent traders to top up a balance that could never save
                the position. "Add margin" (the row action — a debt repayment under
                the hood) is the move that actually raises health. */}
            <span>
              <strong>{atRisk}</strong> position{atRisk > 1 ? 's' : ''} near liquidation — add margin or close to avoid losing your funds.
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Why a close didn't work — in the layout, above the rows it is about.
          This is the persistent copy of the message; the toast that accompanies it
          now expires, because pinning it forever put it on top of the Close buttons
          of the OTHER positions and made them unclickable. */}
      <AnimatePresence>
        {closeError && closeError !== dismissedError && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="flex items-start gap-2 px-4 py-2.5 bg-red-500/10 border-b border-red-500/20 text-red-800 dark:text-red-300 text-xs overflow-hidden">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span className="flex-1 leading-relaxed">{closeError}</span>
            <button
              type="button"
              onClick={() => setDismissedError(closeError)}
              aria-label="Dismiss"
              className="shrink-0 p-0.5 rounded hover:bg-red-500/20 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {positions.length === 0 && loadError ? (
        // A read that FAILED is not an account that is empty. Saying so plainly —
        // and offering the retry — is the difference between "the network hiccuped"
        // and a trader believing their collateral has disappeared.
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-center px-6">
          <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/25 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground/80">Couldn’t read your positions</p>
            <p className="text-xs text-muted-foreground/60 mt-1 max-w-sm">
              This is a connection problem, not a change to your account — anything you hold is still on-chain and untouched.
            </p>
          </div>
          {onRetryLoad && (
            <Button size="sm" variant="outline" onClick={onRetryLoad} className="h-8 px-3 text-xs">
              Try again
            </Button>
          )}
        </div>
      ) : positions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
          <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
            {notConnected || positionsReady
              ? <TrendingUp className="w-5 h-5 text-muted-foreground/40" />
              : <Loader2 className="w-5 h-5 text-muted-foreground/40 animate-spin" />}
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground/70">
              {notConnected ? 'Your positions live here' : positionsReady ? 'No open positions' : 'Loading your positions…'}
            </p>
            {(notConnected || positionsReady) && (
              <p className="text-xs text-muted-foreground/40 mt-0.5">
                {notConnected
                  ? 'Log in to see them'
                  : 'Use the panel above to open your first trade'}
              </p>
            )}
          </div>
        </div>
      ) : (
        <>
        {/* ── Mobile: stacked cards (no horizontal scroll, always-visible Close) ── */}
        <div className="md:hidden divide-y divide-white/5">
          {rows.map((row) => {
            const { p, isLong, critical, caution, health, liqPct, entry, mark } = row
            const isConfirming = confirmingId === p.id
            return (
              <div key={p.id} className={cn('p-3.5 flex flex-col gap-3',
                isConfirming ? 'bg-red-500/5' : critical ? 'bg-red-500/[0.07]' : caution ? 'bg-yellow-500/[0.04]' : '')}>
                {/* Row 1: side + leverage · health */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-bold', isLong ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400')}>
                      {isLong ? 'LONG' : 'SHORT'}
                    </span>
                    {renderLeverageBadge(p)}
                  </div>
                  <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold', health.className, critical && 'animate-pulse')}>
                    {critical && <AlertTriangle className="w-2.5 h-2.5" />}
                    {health.label}
                  </span>
                </div>

                {/* Row 2: live PnL prominent · how much room is left before liquidation.
                    Funding moved INTO the PnL block (it is already subtracted from it);
                    the space it used to occupy now carries the risk figure a trader can
                    act on, instead of a cost they cannot. */}
                <div className="flex items-end justify-between gap-3">
                  <div className="flex flex-col leading-tight">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground/50">Live PnL</span>
                    {renderPnl(row, true)}
                  </div>
                  <div className="flex flex-col items-end leading-tight">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground/50">To liquidation</span>
                    {liqPct != null ? (
                      <>
                        <span className={cn('text-sm font-bold tabular-nums', liqDistanceClass(liqPct))}>
                          {liqPct.toFixed(1)}%
                        </span>
                        <span className="text-[10px] text-muted-foreground/50">
                          {isLong ? 'if XLM falls' : 'if XLM rises'}
                        </span>
                      </>
                    ) : <span className="text-muted-foreground/40">—</span>}
                  </div>
                </div>

                {/* Row 3: details grid */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
                  <div className="flex flex-col leading-tight">
                    <span className="text-muted-foreground/50">Size</span>
                    <span className="tabular-nums">{p.collateralAmount.toFixed(4)} {p.collateralSymbol}</span>
                  </div>
                  <div className="flex flex-col leading-tight items-end">
                    <span className="text-muted-foreground/50">Debt</span>
                    <span className="tabular-nums">{p.debtAmount.toFixed(2)} {p.debtSymbol}</span>
                  </div>
                  <div className="flex flex-col leading-tight">
                    <span className="text-muted-foreground/50">Entry price</span>
                    <span className="tabular-nums text-muted-foreground/80">{entry != null && entry > 0 ? `$${fmtTrigger(entry)}` : '—'}</span>
                  </div>
                  <div className="flex flex-col leading-tight items-end">
                    <span className="text-muted-foreground/50">Price now</span>
                    <span className="tabular-nums text-muted-foreground/80">{mark != null ? `$${fmtTrigger(mark)}` : 'pricing…'}</span>
                  </div>
                  <div className="flex flex-col leading-tight">
                    <span className="text-muted-foreground/50">Your stake</span>
                    <span className="tabular-nums font-semibold">${stakeUsd(p).toFixed(2)}</span>
                  </div>
                  <div className="flex flex-col leading-tight items-end">
                    <span className="text-muted-foreground/50">Position value</span>
                    <span className="tabular-nums text-muted-foreground/80">${p.collateralUsd.toFixed(2)}</span>
                  </div>
                  <div className="flex flex-col leading-tight">
                    <span className="text-muted-foreground/50">Liq. Price</span>
                    {renderLiq(row, 'start')}
                  </div>
                  <div className="flex flex-col leading-tight items-end">
                    <span className="flex items-center gap-1 text-muted-foreground/50">
                      TP / SL
                      <StellarKeeperChip state={keeperArms.stateFor(p.id)} />
                    </span>
                    <div className="flex items-center gap-1.5">
                      {renderTpSl(row, false)}
                      {onSetTpSl && (
                        <StellarTpSlEditPopover
                          position={p}
                          current={{ takeProfit: row.tp ?? null, stopLoss: row.sl ?? null }}
                          referencePrice={xlmPrice}
                          markIsLive={markIsLive}
                          liqPrice={row.liq}
                          onSave={onSetTpSl}
                          allowAlwaysOn={allowAlwaysOn}
                          entryLeverage={entryLeverages?.[p.id]}
                          entryPrice={entryPrices?.[p.id]}
                        />
                      )}
                    </div>
                  </div>
                </div>

                {isConfirming && (
                  <p className="text-[11px] text-muted-foreground">
                    Closing settles your position and repays the debt automatically — nothing needed in your wallet. What’s left returns to your margin balance.
                  </p>
                )}

                {/* Row 4: full-width close action */}
                {renderCloseAction(p, true)}
              </div>
            )
          })}
        </div>

        {/* ── Desktop / tablet: full table ────────────────────────────────── */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/5 text-muted-foreground/60">
                <th className="py-2.5 font-medium text-left pl-4">Side</th>
                <th className="py-2.5 font-medium text-right pr-4"><TermTip tip="The multiplier you chose when opening — it scales both your gains and your losses. Hover a value to see the position's current effective leverage.">Leverage</TermTip></th>
                {/* Not "Collateral". This column holds what the controller custodies for
                    the position — margin *plus* borrow, swapped into the exposure asset —
                    while the order panel and the header chip use "Collateral" for the
                    trader's own money. Two meanings, one word, and the short case makes
                    them collide outright: 20 USDT of margin showed as "Collateral 40 USDT".
                    "Size" is also what the Trades and History tabs already call it. */}
                <th className="py-2.5 font-medium text-right pr-4"><TermTip tip="The position's full size — your margin plus what it borrowed, held as XLM on a long and as USDT on a short.">Size</TermTip></th>
                <th className="py-2.5 font-medium text-right pr-4"><TermTip tip="What the position borrowed to reach its size — paid back when you close.">Debt</TermTip></th>
                {/* The number the table never showed. Traders read "Size" as the
                    trade and "Debt" as someone else's money, so their own stake was
                    left to be worked out by subtraction — and when it came back on
                    close it looked like the app had invented a thousand dollars. */}
                <th className="py-2.5 font-medium text-right pr-4"><TermTip tip="Your own money in this trade — the size minus what it borrowed. This is what comes back to your account when you close, plus or minus your PnL.">Your stake</TermTip></th>
                {/* The two prices the PnL next door is the difference between. Without
                    them the table asserted a profit and gave the trader no way to check
                    it — the opening price was only findable in the Trades tab, and the
                    current one nowhere at all. */}
                <th className="py-2.5 font-medium text-right pr-4"><TermTip tip="What your opening trade filled at, and what a close would fill at right now. Both are prices from the pool you actually trade against, so the difference between them is the move your PnL is made of.">Entry → Now</TermTip></th>
                {/* Funding used to be a column of its own, two columns away from the
                    figure it had already been subtracted from — so reading the table
                    correctly meant knowing to ignore it, and reading it naively meant
                    subtracting the cost twice. It now sits inside the PnL cell. */}
                <th className="py-2.5 font-medium text-right pr-4"><TermTip tip="Your profit or loss if you closed right now — the price move on your position's size, minus the borrow interest accrued so far. The percentage is on your own money, so it moves with your leverage. Hover a value for the full arithmetic.">Live PnL</TermTip></th>
                <th className="py-2.5 font-medium text-right pr-4"><TermTip tip="If XLM reaches this price, the position is closed automatically to cover its debt. Underneath: how far the price still has to move to get there.">Liq. Price</TermTip></th>
                <th className="py-2.5 font-medium text-right pr-4"><TermTip tip="Take-profit and stop-loss — target prices where the position closes automatically.">TP / SL</TermTip></th>
                <th className="py-2.5 font-medium text-right pr-4"><TermTip tip="How safe the position is. Below 1.0 it gets liquidated — add collateral or close to raise it.">Health</TermTip></th>
                {/* The wide right gutter is not decoration: the support bubble is
                    fixed to the bottom-right of the viewport and sat exactly on top
                    of this column's Close button — clicking Close opened the chat
                    instead, and which row it hit just moved with the scroll. Keep
                    the actions clear of that corner. */}
                <th className="py-2.5 pl-4 md:pr-20" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const { p, isLong, critical, caution, health } = row
                const isConfirming = confirmingId === p.id
                return (
                  <motion.tr key={p.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                    className={cn('border-b border-white/4 group',
                      isConfirming ? 'bg-red-500/5'
                        : critical ? 'bg-red-500/[0.07] hover:bg-red-500/10'
                        : caution ? 'bg-yellow-500/[0.04] hover:bg-yellow-500/[0.07]'
                        : 'hover:bg-white/3')}>
                    <td className="pl-4 py-3">
                      <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-bold', isLong ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400')}>
                        {isLong ? 'LONG' : 'SHORT'}
                      </span>
                    </td>
                    <td className="pr-4 py-3 text-right">
                      {renderLeverageBadge(p)}
                    </td>
                    <td className="pr-4 py-3 text-right tabular-nums">
                      <div>{p.collateralAmount.toFixed(4)} {p.collateralSymbol}</div>
                      <div className="text-[10px] text-muted-foreground/50">${p.collateralUsd.toFixed(2)}</div>
                    </td>
                    <td className="pr-4 py-3 text-right tabular-nums">
                      <div>{p.debtAmount.toFixed(2)} {p.debtSymbol}</div>
                      <div className="text-[10px] text-muted-foreground/50">${p.debtUsd.toFixed(2)}</div>
                    </td>
                    <td className="pr-4 py-3 text-right tabular-nums">
                      <div className="font-semibold">${stakeUsd(p).toFixed(2)}</div>
                      <div className="text-[10px] text-muted-foreground/50">of ${p.collateralUsd.toFixed(2)}</div>
                    </td>
                    {/* Entry → Now — the move the PnL beside it is made of. */}
                    <td className="pr-4 py-3 text-right">
                      {renderPrices(row)}
                    </td>
                    <td className="pr-4 py-3 text-right tabular-nums">
                      {renderPnl(row)}
                    </td>
                    <td className="pr-4 py-3 text-right tabular-nums">
                      {renderLiq(row)}
                    </td>
                    <td className="pr-4 py-3 text-right tabular-nums">
                      <div className="flex items-center justify-end gap-1.5">
                        {renderTpSl(row, true)}
                        {onSetTpSl && (
                          <StellarTpSlEditPopover
                            position={p}
                            current={{ takeProfit: row.tp ?? null, stopLoss: row.sl ?? null }}
                            referencePrice={xlmPrice}
                            markIsLive={markIsLive}
                            liqPrice={row.liq}
                            onSave={onSetTpSl}
                            allowAlwaysOn={allowAlwaysOn}
                            entryLeverage={entryLeverages?.[p.id]}
                            entryPrice={entryPrices?.[p.id]}
                          />
                        )}
                        <StellarKeeperChip state={keeperArms.stateFor(p.id)} />
                      </div>
                    </td>
                    <td className="pr-4 py-3 text-right">
                      <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold', health.className, critical && 'animate-pulse')}>
                        {critical && <AlertTriangle className="w-2.5 h-2.5" />}
                        {health.label}
                      </span>
                    </td>
                    <td className="pr-3 md:pr-20 py-3 text-right">
                      {renderCloseAction(p)}
                    </td>
                  </motion.tr>
                )
              })}
            </tbody>
          </table>
          <AnimatePresence>
            {confirmingId && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="px-4 py-2 text-[11px] text-muted-foreground bg-white/3 border-t border-white/5">
                Closing settles your position and repays the debt automatically — nothing needed in your wallet. What’s left returns to your margin balance.
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        </>
      )}

      {/* Partial repayment. `repayTarget` is re-read from the live `positions` each render,
          so the dialog's before/after preview keeps updating with the poll while
          it's open — and it closes itself if the position disappears (liquidated,
          or closed from another tab) rather than previewing a position that's gone. */}
      {/* Escape / outside click / the X are held back while a repayment is
          signing: they close the dialog, which UNMOUNTS it, and the transaction
          then ran on with its status line, its error and its Cancel button gone.
          The dialog's own buttons were already disabled for exactly this reason —
          these three exits simply weren't. */}
      <Dialog
        open={repayTarget != null}
        onOpenChange={(o) => { if (!o && !repayBusy) setRepayingId(null) }}
      >
        <DialogContent
          data-testid="margin-repay-dialog"
          closeDisabled={repayBusy}
          className="max-h-[90vh] w-full max-w-md overflow-y-auto overflow-x-hidden backdrop-blur-xl bg-background/90 border-white/10 p-0"
          onEscapeKeyDown={(e) => { if (repayBusy) e.preventDefault() }}
          onInteractOutside={(e) => { if (repayBusy) e.preventDefault() }}
        >
          <DialogHeader className="px-5 pt-5 pb-0">
            <DialogTitle className="text-xl font-bold">Add margin</DialogTitle>
          </DialogHeader>
          {repayTarget && (
            <StellarRepayDialog
              position={repayTarget}
              assets={assets}
              referencePrice={xlmPrice}
              onDone={() => { setRepayingId(null); onRepaid?.() }}
              onBalancesChanged={onRepaid}
              onCancel={() => setRepayingId(null)}
              onBusyChange={setRepayBusy}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Realized-PnL payoff modal */}
      <AnimatePresence>
        {closeResult && (
          <StellarCloseResult result={closeResult} onDismiss={() => setCloseResult(null)} />
        )}
      </AnimatePresence>
    </motion.div>
  )
}

'use client'

/**
 * StellarActivityTabs — the bottom activity panel: Positions · Unfinished · Trades · History.
 *
 *   Positions  → live on-chain open positions (existing StellarPositionsPanel).
 *   Unfinished → opens stranded mid-flow (finish or cancel). Tab key is still
 *                `orders`; only the word the user reads changed, and why is
 *                explained at the tab list. Hidden entirely when there are none.
 *   Trades     → chronological event log (DB journal).
 *   History    → closed positions with realized PnL.
 *
 * Trades/History rows are normalized (ActivityTrade / ActivityHistory), so the
 * panel never talks to the journal directly — the page hands rows down.
 */
import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Layers, Clock, Receipt, History as HistoryIcon, Loader2, ExternalLink, AlertTriangle, ShieldCheck, Download, Crosshair, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { STELLAR_MARGIN_NETWORK } from '../../config/stellarMarginConfig'
import { summarizeClosedTrades, closedTradesCsv } from '../../lib/marginMath'
import { StellarPositionsPanel } from './StellarPositionsPanel'
import { formatTriggerPrice } from '../../lib/marginMath'
import type { LimitOrder } from '../../hooks/use-stellar-limit-orders'
import type { StellarMarginAsset, StellarMarginPosition, StellarPendingOpenView } from '../../types/stellarMargin'

export interface ActivityTrade {
  id: string
  eventType: 'open' | 'close' | 'cancel' | 'collateral_in' | 'collateral_out' | 'repay'
  side?: 'Long' | 'Short' | null
  leverageX100?: number | null
  xlmAmount?: number | null
  entryPriceUsd?: number | null
  exitPriceUsd?: number | null
  realizedPnlUsd?: number | null
  collateralSymbol?: string | null
  collateralAmount?: number | null
  txHash?: string | null
  createdAt: string | number
}

export interface ActivityHistory {
  positionId: string
  side: 'Long' | 'Short' | null
  leverageX100: number | null
  /** XLM-denominated exposure — the Size column, so a row says WHAT was closed. */
  xlmAmount: number | null
  entryPriceUsd: number | null
  exitPriceUsd: number | null
  realizedPnlUsd: number | null
  /** When the position was opened — only used to average how long trades are held. */
  openedAt?: string | number | null
  closedAt: string | number
  txHash: string | null
}

type TabKey = 'positions' | 'limits' | 'orders' | 'trades' | 'history'

interface Props {
  positions: StellarMarginPosition[]
  assets: StellarMarginAsset[]
  onClosed: () => void
  onOptimisticClose?: (id: string) => void
  /** positionId → take-profit / stop-loss trigger prices, surfaced in the Positions tab. */
  tpSlByPosition?: Record<string, { takeProfit?: number | null; stopLoss?: number | null }>
  /** Real XLM/USD feed price — keeps the Positions tab's Liq. Price in the chart domain. */
  referencePrice?: number
  /** positionId → recorded entry price; drives the live PnL ticker in Positions. */
  entryPrices?: Record<string, number>
  /** positionId → pool-quoted exit price; the domain the PnL ticker marks against. */
  markPrices?: Record<string, number>
  /** Real mode: hold a position's PnL until its pool mark exists instead of
   *  falling back to the feed — see StellarPositionsPanel. */
  requirePoolMark?: boolean
  /** positionId → leverage chosen at open; the Positions tab shows this instead of the drifting live figure. */
  entryLeverages?: Record<string, number>
  /** positionId → borrow drawn at open + when; turns on-chain debt drift into a funding cost. */
  debtBasis?: Record<string, { borrowAmount: number; openedAtMs: number }>
  /** positionId → PnL/exposure already retired by partial repayments — see StellarPositionsPanel. */
  repayAdjust?: Record<string, { realizedUsd: number; xlmRetired: number }>
  /** Edit/clear TP/SL on an open position (Positions tab). */
  onSetTpSl?: (positionId: string, next: { takeProfit: number | null; stopLoss: number | null }) => void | Promise<void>
  /** Refresh after a partial repayment (Positions tab) — debt/health/liq all moved. */
  onRepaid?: () => void
  /** Offer the always-on keeper toggle. */
  allowAlwaysOn?: boolean
  /** Whether the on-chain position sweep has completed once — see StellarPositionsPanel. */
  positionsReady?: boolean
  /** No wallet connected — the sweep never runs, so the Positions tab must not
   *  wait on it. See StellarPositionsPanel's `notConnected`. */
  notConnected?: boolean
  /** Why the sweep failed, if it did — the Positions tab shows a read error
   *  instead of its empty state. */
  positionsError?: string | null
  /** Re-run the sweep (retry button on that error state). */
  onRetryPositions?: () => void
  // Orders
  pending: StellarPendingOpenView[]
  onResume: (p: StellarPendingOpenView) => void
  onCancel: (p: StellarPendingOpenView) => void
  isResuming: boolean
  isCancelling: boolean
  resumeLabel?: string
  // Limit orders (resting + recently settled). Tab hides when there are none.
  limitOrders?: LimitOrder[]
  /** How many of them this tab is actually watching (the monitor's count). */
  limitOrdersWatching?: number
  onCancelLimitOrder?: (id: number) => Promise<boolean>
  // Trades / History
  trades: ActivityTrade[]
  history: ActivityHistory[]
  tradesLoading?: boolean
  /** The journal rejected our credential — a wallet-kit user who hasn't signed
   *  in yet. Trades/History can't load until they do, and "No trades yet" would
   *  be a lie: their trades may well exist. */
  needsWalletSignIn?: boolean
  onWalletSignIn?: () => void | Promise<void>
  isSigningIn?: boolean
  /** Why the last sign-in attempt failed (e.g. signature cancelled, or the
   *  deployment has no session secret configured) — shown, never swallowed. */
  signInError?: string | null
}

const EVENT_LABEL: Record<ActivityTrade['eventType'], string> = {
  open: 'Opened',
  close: 'Closed',
  cancel: 'Cancelled',
  collateral_in: 'Added margin',
  collateral_out: 'Withdrew margin',
  repay: 'Repaid debt',
}

function timeAgo(t: string | number): string {
  const ms = typeof t === 'number' ? t : Date.parse(t)
  if (!Number.isFinite(ms)) return ''
  const s = Math.floor((Date.now() - ms) / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function txLink(hash?: string | null) {
  if (!hash) return null
  return (
    <a href={`${STELLAR_MARGIN_NETWORK.explorerBase}/tx/${hash}`} target="_blank" rel="noopener noreferrer"
      className="inline-flex items-center gap-0.5 text-muted-foreground/50 hover:text-primary transition-colors">
      <ExternalLink className="w-3 h-3" />
    </a>
  )
}

/** Days/hours granularity for orders that rest for a week, not a ledger window. */
function restingLeft(expiresAt: string): string {
  const secs = Math.floor((Date.parse(expiresAt) - Date.now()) / 1000)
  if (secs <= 0) return 'expiring'
  const d = Math.floor(secs / 86_400)
  const h = Math.floor((secs % 86_400) / 3_600)
  if (d >= 1) return `${d}d${h > 0 ? ` ${h}h` : ''} left`
  const m = Math.floor((secs % 3_600) / 60)
  return h >= 1 ? `${h}h ${m}m left` : `${m}m left`
}

function timeLeft(expiresAt: Date): string {
  const secs = Math.floor((expiresAt.getTime() - Date.now()) / 1000)
  if (secs <= 0) return 'expired'
  const m = Math.floor(secs / 60)
  return m >= 1 ? `${m}m left` : `${secs}s left`
}

const SideBadge = ({ side }: { side?: 'Long' | 'Short' | null }) =>
  side ? (
    <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-bold', side === 'Long' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400')}>
      {side.toUpperCase()}
    </span>
  ) : (
    <span className="text-muted-foreground/40">—</span>
  )

/** Shown in Trades/History when the wallet hasn't proven ownership yet. */
const SignInState = ({ onSignIn, isSigningIn, error }: { onSignIn?: () => void | Promise<void>; isSigningIn?: boolean; error?: string | null }) => (
  <div className="flex flex-col items-center justify-center py-12 gap-3 text-center px-6">
    <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
      <ShieldCheck className="w-5 h-5 text-muted-foreground/40" />
    </div>
    <div>
      <p className="text-sm font-medium text-muted-foreground/70">Verify your wallet to see this</p>
      <p className="text-xs text-muted-foreground/40 mt-0.5 max-w-xs">
        Sign a message to prove the wallet is yours. It costs nothing and moves no funds.
      </p>
    </div>
    {onSignIn && (
      <Button size="sm" onClick={() => onSignIn()} disabled={isSigningIn} className="h-8 px-4 text-xs font-bold">
        {isSigningIn ? <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Waiting for signature…</> : 'Verify wallet'}
      </Button>
    )}
    {error && <p className="text-[11px] text-red-400 max-w-xs">{error}</p>}
  </div>
)

const EmptyState = ({ icon: Icon, title, sub }: { icon: typeof Layers; title: string; sub: string }) => (
  <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
    <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
      <Icon className="w-5 h-5 text-muted-foreground/40" />
    </div>
    <div>
      <p className="text-sm font-medium text-muted-foreground/70">{title}</p>
      <p className="text-xs text-muted-foreground/40 mt-0.5">{sub}</p>
    </div>
  </div>
)

/** Mean holding time, at the coarsest unit that still says something. */
function formatHold(ms: number): string {
  const minutes = ms / 60_000
  if (minutes < 90) return `${Math.round(minutes)}m`
  const hours = minutes / 60
  if (hours < 48) return `${hours.toFixed(hours < 10 ? 1 : 0)}h`
  return `${(hours / 24).toFixed(1)}d`
}

function SummaryCell({ label, value, tone }: { label: string; value: string; tone?: 'up' | 'down' }) {
  return (
    <div className="min-w-[5.5rem]">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground/50">{label}</p>
      <p className={cn(
        'text-sm font-bold tabular-nums',
        tone === 'up' ? 'text-emerald-400' : tone === 'down' ? 'text-red-400' : 'text-foreground',
      )}>
        {value}
      </p>
    </div>
  )
}

/**
 * The record, added up — and downloadable.
 *
 * The table below it answers "what did I do"; nothing answered "how am I doing".
 * Both come out of `summarizeClosedTrades`, which skips trades with no recorded
 * PnL rather than counting them as break-even — so when it has skipped any, this
 * says so instead of quietly reporting a smaller record as the whole one.
 */
function HistorySummary({ rows }: { rows: ActivityHistory[] }) {
  const stats = useMemo(() => summarizeClosedTrades(rows), [rows])
  if (stats.counted === 0) return null

  const exportCsv = () => {
    // The BOM is for Excel, which otherwise reads a UTF-8 CSV as Latin-1. It is
    // added here rather than inside `closedTradesCsv` so the function stays a
    // plain string of the same data the table shows.
    const blob = new Blob(['\ufeff' + closedTradesCsv(rows)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `peridot-margin-history-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div data-testid="margin-history-summary" className="flex flex-wrap items-end gap-x-6 gap-y-3 px-4 py-3 border-b border-white/8 bg-white/2">
      <SummaryCell
        label="Realized PnL"
        value={`${stats.totalPnlUsd > 0 ? '+' : ''}$${stats.totalPnlUsd.toFixed(2)}`}
        tone={stats.totalPnlUsd > 0 ? 'up' : stats.totalPnlUsd < 0 ? 'down' : undefined}
      />
      <SummaryCell
        label="Win rate"
        value={stats.winRate == null ? '—' : `${Math.round(stats.winRate * 100)}%`}
      />
      <SummaryCell label="Trades" value={`${stats.counted}`} />
      <SummaryCell label="Best" value={stats.best == null ? '—' : `${stats.best > 0 ? '+' : ''}$${stats.best.toFixed(2)}`} tone={stats.best != null && stats.best > 0 ? 'up' : undefined} />
      <SummaryCell label="Worst" value={stats.worst == null ? '—' : `${stats.worst > 0 ? '+' : ''}$${stats.worst.toFixed(2)}`} tone={stats.worst != null && stats.worst < 0 ? 'down' : undefined} />
      <SummaryCell label="Avg. hold" value={stats.avgHoldMs == null ? '—' : formatHold(stats.avgHoldMs)} />

      <div className="ml-auto flex items-center gap-3">
        {stats.skipped > 0 && (
          <span className="text-[10px] text-muted-foreground/50">
            {stats.skipped} trade{stats.skipped === 1 ? '' : 's'} without a recorded price not counted
          </span>
        )}
        <Button size="sm" variant="outline" onClick={exportCsv}
          className="h-7 px-2.5 text-[11px] border-white/20 bg-white/5 hover:bg-white/10">
          <Download className="w-3 h-3 mr-1" /> Export CSV
        </Button>
      </div>
    </div>
  )
}

export function StellarActivityTabs(props: Props) {
  const { positions, assets, onClosed, onOptimisticClose, tpSlByPosition, referencePrice, entryPrices, markPrices, requirePoolMark, entryLeverages, debtBasis, repayAdjust, onSetTpSl, onRepaid, allowAlwaysOn, positionsReady, notConnected, positionsError, onRetryPositions, pending, onResume, onCancel, isResuming, isCancelling, resumeLabel, trades, history, tradesLoading, needsWalletSignIn, onWalletSignIn, isSigningIn, signInError, limitOrders = [], limitOrdersWatching, onCancelLimitOrder } = props
  const [tab, setTab] = useState<TabKey>('positions')
  // Resting orders, and the settled ones still worth a glance (a fill, or a
  // failure with its reason). Cancelled and expired rows are noise here.
  const visibleLimitOrders = useMemo(
    () => limitOrders.filter((o) => o.status === 'open' || o.status === 'failed' || o.status === 'filled'),
    [limitOrders],
  )
  const openLimitCount = useMemo(() => limitOrders.filter((o) => o.status === 'open').length, [limitOrders])
  const [cancellingId, setCancellingId] = useState<number | null>(null)

  /**
   * The tab bar.
   *
   * "Unfinished", not "Orders". There are no orders on this venue — no limits, no
   * resting book — so a trader who clicked Orders went looking for something that
   * does not exist, while the person who actually had an open stranded mid-flow
   * would never think to look for it under that word. What lives here is one
   * thing: an open that stopped between its signatures, with the collateral
   * locked until it is finished or cancelled.
   *
   * And because it is only ever that, it is `urgent` and it HIDES when empty: a
   * permanent tab reading 0 is furniture, whereas one that appears only when
   * something is stuck is itself the notification.
   */
  const ALL_TABS: { key: TabKey; label: string; icon: typeof Layers; count: number; urgent?: boolean; hideWhenEmpty?: boolean }[] = [
    { key: 'positions', label: 'Positions', icon: Layers, count: positions.length },
    // Real orders, at last: resting limits. Hidden when there are none, for the
    // same reason as Unfinished — an empty tab is furniture.
    { key: 'limits', label: 'Orders', icon: Crosshair, count: openLimitCount || visibleLimitOrders.length, hideWhenEmpty: true },
    { key: 'orders', label: 'Unfinished', icon: AlertTriangle, count: pending.length, urgent: true, hideWhenEmpty: true },
    { key: 'trades', label: 'Trades', icon: Receipt, count: trades.length },
    { key: 'history', label: 'History', icon: HistoryIcon, count: history.length },
  ]
  const TABS = ALL_TABS.filter((t) => !(t.hideWhenEmpty && t.count === 0))

  // The selected tab can vanish underneath the user — finishing the last stranded
  // open removes "Unfinished" while they are standing in it, which would otherwise
  // leave the bar with nothing highlighted and the panel showing that tab's empty
  // state. Send them back to Positions, which is where the finished open now is.
  const visible = TABS.some((t) => t.key === tab)
  useEffect(() => { if (!visible) setTab('positions') }, [visible])

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="relative overflow-hidden rounded-2xl backdrop-blur-xl border border-white/10 shadow-lg bg-white/5"
    >
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-white/8 overflow-x-auto">
        {TABS.map((t) => {
          const active = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors',
                active ? 'bg-white/10 text-foreground' : 'text-muted-foreground/60 hover:text-foreground/80 hover:bg-white/5',
              )}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
              {t.count > 0 && (
                <span className={cn(
                  'px-1.5 py-px rounded-full text-[10px] font-bold tabular-nums',
                  t.urgent ? 'bg-amber-500/25 text-amber-700 dark:text-amber-300' : active ? 'bg-primary/20 text-primary' : 'bg-white/10',
                )}>
                  {t.count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Unverified wallets learn it HERE, not after a trade whose record was
          silently dropped: Positions is the default tab, so a notice living only
          inside Trades/History would be found too late. */}
      {needsWalletSignIn && (tab === 'positions' || tab === 'orders') && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-white/8 bg-amber-500/5">
          <ShieldCheck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <p className="text-[11px] text-amber-700 dark:text-amber-300 flex-1 min-w-[12rem]">
            Verify your wallet to record and see your trade history.
          </p>
          {onWalletSignIn && (
            <Button size="sm" variant="outline" onClick={() => onWalletSignIn()} disabled={isSigningIn}
              className="h-7 px-3 text-[11px] border-white/20 bg-white/5 hover:bg-white/10">
              {isSigningIn ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Signing…</> : 'Verify'}
            </Button>
          )}
        </div>
      )}

      {/* No AnimatePresence + mode="wait" here, deliberately. That combination holds
          the outgoing panel mounted until its exit animation reports done, and when
          that report went missing the tab bar and the content disagreed indefinitely:
          "History" highlighted with the Trades table under it, "Positions" highlighted
          with History under it — reproducible by hand, and it survived further clicks.
          A tab that shows another tab's data is worse than a tab that doesn't fade, so
          the new panel simply mounts and fades in on its own. */}
      <div>
        <motion.div key={tab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}>
          {/* ── Positions ───────────────────────────────────────────────── */}
          {tab === 'positions' && (
            <StellarPositionsPanel
              positions={positions}
              assets={assets}
              onClosed={onClosed}
              onOptimisticClose={onOptimisticClose}
              tpSlByPosition={tpSlByPosition}
              referencePrice={referencePrice}
              entryPrices={entryPrices}
              markPrices={markPrices}
              requirePoolMark={requirePoolMark}
              entryLeverages={entryLeverages}
              debtBasis={debtBasis}
              onSetTpSl={onSetTpSl}
              repayAdjust={repayAdjust}
              onRepaid={onRepaid}
              allowAlwaysOn={allowAlwaysOn}
              positionsReady={positionsReady}
              notConnected={notConnected}
              loadError={positionsError}
              onRetryLoad={onRetryPositions}
              className="border-0 rounded-none bg-transparent shadow-none"
            />
          )}

          {/* ── Orders (resting limit orders + recent fills / failures) ──── */}
          {tab === 'limits' && (
            visibleLimitOrders.length === 0 ? (
              <EmptyState icon={Crosshair} title="No orders" sub="Switch the trade panel to Limit to open at a price of your choosing" />
            ) : (
              <div>
                {openLimitCount > 0 && (
                  <p className="px-4 pt-2.5 text-[10px] text-muted-foreground">
                    {limitOrdersWatching != null && limitOrdersWatching >= openLimitCount
                      ? (openLimitCount === 1
                          ? 'Watching this order — it fills while this tab is open and in front.'
                          : `Watching these ${openLimitCount} orders — they fill while this tab is open and in front.`)
                      : 'Orders fill while this tab is open and in front.'}
                  </p>
                )}
                <div className="divide-y divide-white/5">
                  {visibleLimitOrders.map((o) => {
                    const notional = o.collateralUsdt * o.leverage
                    const dist = referencePrice && referencePrice > 0 ? ((o.limitPriceUsd - referencePrice) / referencePrice) * 100 : null
                    const busy = cancellingId === o.id
                    const isOpen = o.status === 'open'
                    return (
                      <div key={o.id} data-testid={`margin-limit-order-${o.id}`} className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {o.status === 'failed'
                            ? <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                            : o.status === 'filled'
                              ? <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                              : <Crosshair className="w-4 h-4 text-primary shrink-0" />}
                          <div className="text-xs min-w-0">
                            <div className="font-semibold flex items-center gap-2 flex-wrap">
                              <SideBadge side={o.side} />
                              <span className="tabular-nums">{o.leverage}× · ${notional.toFixed(2)}</span>
                              <span className="text-muted-foreground">at</span>
                              <span className="tabular-nums">${formatTriggerPrice(o.limitPriceUsd)}</span>
                              {o.status === 'filled' && <span className="text-emerald-600 dark:text-emerald-300">Filled</span>}
                              {o.status === 'failed' && <span className="text-red-700 dark:text-red-300">Didn’t fill</span>}
                            </div>
                            <div className="text-muted-foreground/60 mt-0.5 tabular-nums">
                              {isOpen && (
                                <>
                                  {dist != null && `${Math.abs(dist).toFixed(2)}% ${dist < 0 ? 'below' : 'above'} market · `}
                                  {(o.takeProfitUsd != null || o.stopLossUsd != null) && (
                                    <>
                                      {o.takeProfitUsd != null && `TP $${formatTriggerPrice(o.takeProfitUsd)}`}
                                      {o.takeProfitUsd != null && o.stopLossUsd != null && ' / '}
                                      {o.stopLossUsd != null && `SL $${formatTriggerPrice(o.stopLossUsd)}`}
                                      {' · '}
                                    </>
                                  )}
                                  {restingLeft(o.expiresAt)}
                                </>
                              )}
                              {o.status === 'filled' && (o.firedPriceUsd != null ? `triggered at $${formatTriggerPrice(o.firedPriceUsd)}` : 'opened from this order')}
                              {o.status === 'failed' && (o.failReason || 'The order triggered but the position couldn’t be opened.')}
                            </div>
                          </div>
                        </div>
                        {onCancelLimitOrder && (isOpen || o.status === 'failed') && (
                          <div className="flex items-center gap-2 shrink-0">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={async () => { setCancellingId(o.id); try { await onCancelLimitOrder(o.id) } finally { setCancellingId(null) } }}
                              className="h-8 px-3 text-xs border-white/20 bg-white/5 hover:bg-white/10"
                            >
                              {busy
                                ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />{isOpen ? 'Cancelling…' : 'Dismissing…'}</>
                                : <><X className="w-3 h-3 mr-1" />{isOpen ? 'Cancel' : 'Dismiss'}</>}
                            </Button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          )}

          {/* ── Unfinished (opens stranded mid-flow) ────────────────────── */}
          {tab === 'orders' && (
            pending.length === 0 ? (
              <EmptyState icon={Clock} title="Nothing unfinished" sub="An open that stops between its steps appears here to finish or cancel" />
            ) : (
              <div className="divide-y divide-white/5">
                {pending.map((p) => {
                  const busy = isResuming || isCancelling
                  // V3: once the on-chain swap executed, the pending can ONLY be
                  // activated (even past expiry) — cancel would revert. Before
                  // the swap, expired pendings can only be cancelled.
                  const expiredDeadEnd = p.isExpired && !p.hasExecution
                  return (
                    <div key={p.id} className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3">
                      <div className="flex items-center gap-2 flex-1">
                        {expiredDeadEnd ? <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" /> : <Clock className="w-4 h-4 text-amber-400 shrink-0" />}
                        <div className="text-xs">
                          <div className="font-semibold flex items-center gap-2">
                            <SideBadge side={p.side} />
                            <span className={expiredDeadEnd ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'}>
                              {expiredDeadEnd ? 'Expired' : p.hasExecution ? 'Needs activation' : 'Unfinished'}
                            </span>
                          </div>
                          <div className="text-muted-foreground/60 mt-0.5 tabular-nums">
                            {p.hasExecution
                              ? 'swapped — one step from opening'
                              : <>borrowing {p.borrowAmount.toFixed(2)} {p.side === 'Short' ? 'XLM' : 'USDT'}
                                  {!p.isExpired && ` · ${timeLeft(p.expiresAt)}`}</>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {!expiredDeadEnd && (
                          <Button size="sm" onClick={() => onResume(p)} disabled={busy}
                            className="h-8 px-3 text-xs bg-amber-500 hover:bg-amber-600 text-white font-bold">
                            {isResuming ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />{resumeLabel || 'Finishing…'}</> : 'Finish'}
                          </Button>
                        )}
                        {!p.hasExecution && (
                          <Button size="sm" variant="outline" onClick={() => onCancel(p)} disabled={busy}
                            className="h-8 px-3 text-xs border-white/20 bg-white/5 hover:bg-white/10">
                            {isCancelling ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Cancelling…</> : 'Cancel & recover'}
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          )}

          {/* ── Trades (event log) ──────────────────────────────────────── */}
          {tab === 'trades' && (
            needsWalletSignIn && trades.length === 0 ? (
              <SignInState onSignIn={onWalletSignIn} isSigningIn={isSigningIn} error={signInError} />
            ) : tradesLoading && trades.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-xs text-muted-foreground/40"><Loader2 className="w-4 h-4 mr-2 animate-spin" />Loading trades…</div>
            ) : trades.length === 0 ? (
              <EmptyState icon={Receipt} title="No trades yet" sub="Your opens, closes and margin moves will show up here" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/5 text-muted-foreground/60">
                      <th className="py-2.5 font-medium text-left pl-4">Action</th>
                      <th className="py-2.5 font-medium text-left">Side</th>
                      <th className="py-2.5 font-medium text-right">Size</th>
                      <th className="py-2.5 font-medium text-right">Price</th>
                      <th className="py-2.5 font-medium text-right pr-4">When</th>
                      <th className="py-2.5 pr-4" />
                    </tr>
                  </thead>
                  <tbody>
                    {trades.map((t) => {
                      // A repay row's meaningful price is the mark it happened at
                      // (stamped as the exit of the slice it retired), never the
                      // position's opening price — and on a Long, which retires no
                      // XLM exposure at all, there is no price to show.
                      const price = t.eventType === 'close' || t.eventType === 'repay' ? t.exitPriceUsd : t.entryPriceUsd
                      const size = t.xlmAmount != null ? `${t.xlmAmount.toFixed(2)} XLM`
                        : t.collateralAmount != null ? `${t.collateralAmount.toFixed(2)} ${t.collateralSymbol ?? ''}`.trim()
                        : '—'
                      return (
                        <tr key={t.id} className="border-b border-white/4 hover:bg-white/3">
                          <td className="pl-4 py-2.5 font-medium">
                            {EVENT_LABEL[t.eventType]}
                            {t.leverageX100 ? <span className="ml-1.5 text-[10px] text-primary font-bold">{(t.leverageX100 / 100).toFixed(1)}×</span> : null}
                          </td>
                          <td className="py-2.5"><SideBadge side={t.side} /></td>
                          <td className="py-2.5 text-right tabular-nums">{size}</td>
                          <td className="py-2.5 text-right tabular-nums">{price != null ? `$${price.toFixed(4)}` : '—'}</td>
                          <td className="py-2.5 text-right pr-4 text-muted-foreground/50">{timeAgo(t.createdAt)}</td>
                          <td className="py-2.5 pr-4 text-right">{txLink(t.txHash)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}

          {/* ── History (closed positions + PnL) ────────────────────────── */}
          {tab === 'history' && (
            needsWalletSignIn && history.length === 0 ? (
              <SignInState onSignIn={onWalletSignIn} isSigningIn={isSigningIn} error={signInError} />
            ) : history.length === 0 ? (
              <EmptyState icon={HistoryIcon} title="No closed positions" sub="Closed trades and realized PnL land here" />
            ) : (
              <div>
                <HistorySummary rows={history} />
                <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/5 text-muted-foreground/60">
                      <th className="py-2.5 font-medium text-left pl-4">Side</th>
                      <th className="py-2.5 font-medium text-right">Size</th>
                      <th className="py-2.5 font-medium text-right">Entry</th>
                      <th className="py-2.5 font-medium text-right">Exit</th>
                      <th className="py-2.5 font-medium text-right">PnL</th>
                      <th className="py-2.5 font-medium text-right pr-4">Closed</th>
                      <th className="py-2.5 pr-4" />
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h, i) => {
                      // Round before judging the sign, not after: a -0.004 result
                      // was painted red and printed as "$-0.00" — a loss badge on
                      // a number the same cell renders as zero.
                      const pnl = h.realizedPnlUsd == null ? null : Math.round(h.realizedPnlUsd * 100) / 100
                      const pnlUp = (pnl ?? 0) >= 0
                      return (
                        <tr key={`${h.positionId}-${i}`} className="border-b border-white/4 hover:bg-white/3">
                          <td className="pl-4 py-2.5">
                            <span className="inline-flex items-center gap-1.5">
                              <SideBadge side={h.side} />
                              {h.leverageX100 ? <span className="text-[10px] text-primary font-bold">{(h.leverageX100 / 100).toFixed(1)}×</span> : null}
                            </span>
                          </td>
                          <td className="py-2.5 text-right tabular-nums">{h.xlmAmount != null ? `${h.xlmAmount.toFixed(2)} XLM` : '—'}</td>
                          <td className="py-2.5 text-right tabular-nums">{h.entryPriceUsd != null ? `$${h.entryPriceUsd.toFixed(4)}` : '—'}</td>
                          <td className="py-2.5 text-right tabular-nums">{h.exitPriceUsd != null ? `$${h.exitPriceUsd.toFixed(4)}` : '—'}</td>
                          <td className={cn('py-2.5 text-right tabular-nums font-bold', pnl == null || pnl === 0 ? 'text-muted-foreground/50' : pnlUp ? 'text-emerald-400' : 'text-red-400')}>
                            {pnl == null ? '—' : pnl === 0 ? '$0.00' : `${pnlUp ? '+' : ''}$${pnl.toFixed(2)}`}
                          </td>
                          <td className="py-2.5 text-right pr-4 text-muted-foreground/50">{timeAgo(h.closedAt)}</td>
                          <td className="py-2.5 pr-4 text-right">{txLink(h.txHash)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                </div>
              </div>
            )
          )}
        </motion.div>
      </div>
    </motion.div>
  )
}

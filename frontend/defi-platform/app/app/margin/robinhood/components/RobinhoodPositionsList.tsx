'use client'

/**
 * Open positions with live risk (guide 7 and 10).
 *
 * Values come from the risk engine (gross, equity, debt value, actual
 * leverage, health) and the debt market (debt in its own asset). P&L is not
 * `equity - initial margin`, which stops being P&L the moment a user adds
 * margin, repays or pays a fee; it is the event ledger from
 * lib/robinhood/activity.ts (everything returned + equity - everything put
 * in). Entry is the feed price at the open block, the liquidation price an
 * estimate from lib/robinhood/liquidation.ts. An unreadable risk read shows
 * as unavailable, never as health 0 or P&L 0.
 */
import { useState } from 'react'
import { formatUnits } from 'viem'
import { AlertTriangle, ChevronDown, TrendingDown, TrendingUp } from 'lucide-react'
import { ROBINHOOD_DECIMALS } from '@/config/robinhood'
import { GlidingUsd } from './GlidingUsd'
import { cn } from '@/lib/utils'
import type { RobinhoodAccountState, RobinhoodMarketState, RobinhoodPosition } from '@/lib/robinhood/reads'
import type { PositionLedger } from '@/lib/robinhood/activity'
import {
  formatLeverage,
  formatNvda18Display,
  formatSharesAsUsdg,
  formatUsd18Display,
  formatUsdg6Display,
  formatUsdNumber,
} from '../lib/format'
import { RobinhoodPositionActions } from './RobinhoodPositionActions'
import { requestRobinhoodPanel } from '@/hooks/use-robinhood-moment'

interface Props {
  positions: RobinhoodPosition[]
  closedCount: number
  connected: boolean
  isLoading: boolean
  usdgExchangeRate: bigint | null
  account: RobinhoodAccountState | undefined
  market: RobinhoodMarketState | undefined
  ledgers?: Map<string, PositionLedger>
  liquidationPrices?: Record<string, number | null>
  /** A card to light up briefly (just opened, from the result sheet). */
  highlightId?: string | null
  /** The activity tabs name the list already. */
  hideHeader?: boolean
  className?: string
}

function healthTone(h: number | null): { text: string; label: string } {
  if (h === null) return { text: 'text-muted-foreground', label: 'No risk' }
  if (h >= 2) return { text: 'text-emerald-600 dark:text-emerald-400', label: 'Safe' }
  if (h >= 1.5) return { text: 'text-yellow-600 dark:text-yellow-400', label: 'Moderate' }
  if (h >= 1.1) return { text: 'text-orange-600 dark:text-orange-400', label: 'High risk' }
  return { text: 'text-red-600 dark:text-red-400', label: 'Critical' }
}

function pnlTone(v: number | null): string | undefined {
  if (v === null || Math.abs(v) < 0.00005) return undefined
  return v > 0 ? 'text-emerald-500' : 'text-red-500'
}

function Stat({ label, value, sub, className }: { label: string; value: string; sub?: string; className?: string }) {
  return (
    <div>
      <div className={cn('text-sm font-semibold tabular-nums', className)}>{value}</div>
      <div className="text-[10px] text-muted-foreground/60">{label}</div>
      {sub && <div className="text-[10px] text-muted-foreground/50 tabular-nums">{sub}</div>}
    </div>
  )
}

export function PriceTrack({
  direction,
  entry,
  now,
  liq,
}: {
  direction: 'long' | 'short'
  entry: number | null
  now: number | null
  liq: number | null
}) {
  if (now === null || liq === null) return null
  const long = direction === 'long'
  const values = [now, liq, ...(entry !== null ? [entry] : [])]
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const pad = Math.max((hi - lo) * 0.18, now * 0.01)
  const min = lo - pad
  const max = hi + pad
  const at = (v: number) => ((v - min) / (max - min)) * 100
  const distance = liq / now - 1
  const room = Math.abs(distance)
  const tone =
    room >= 0.2
      ? 'text-emerald-600 dark:text-emerald-400'
      : room >= 0.1
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-red-600 dark:text-red-400'
  const winning = entry !== null ? (long ? now >= entry : now <= entry) : null

  return (
    <div className="space-y-1.5">
      <div className="relative h-9">
        <div className="absolute inset-x-0 top-4 h-1.5 rounded-full bg-foreground/[0.08]" />
        <div
          className="absolute top-4 h-1.5 rounded-full bg-[repeating-linear-gradient(135deg,rgba(251,146,60,0.75)_0_4px,rgba(251,146,60,0.25)_4px_8px)]"
          style={long ? { left: 0, width: `${at(liq)}%` } : { left: `${at(liq)}%`, right: 0 }}
        />
        {entry !== null && (
          <div
            className={cn('absolute top-4 h-1.5', winning ? 'bg-emerald-400/70' : 'bg-red-400/70')}
            style={{ left: `${Math.min(at(entry), at(now))}%`, width: `${Math.abs(at(now) - at(entry))}%` }}
          />
        )}
        {entry !== null && (
          <div
            className="absolute top-2.5 h-4 w-0.5 -translate-x-1/2 rounded bg-foreground/70"
            style={{ left: `${at(entry)}%` }}
            title={`Entry $${entry.toFixed(2)}`}
          />
        )}
        <div
          className={cn(
            'absolute top-[11px] h-3.5 w-3.5 -translate-x-1/2 rounded-full border-2 border-background shadow',
            winning === false ? 'bg-red-400' : 'bg-emerald-400',
          )}
          style={{ left: `${at(now)}%` }}
        >
          <span className="absolute inset-0 animate-ping rounded-full bg-inherit opacity-40 motion-reduce:hidden" />
        </div>
        <div
          className="absolute top-[26px] -translate-x-1/2 text-[9px] font-semibold text-orange-600 dark:text-orange-400"
          style={{ left: `${at(liq)}%` }}
        >
          Liq.
        </div>
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-[11px]">
        <span className={cn('font-semibold', tone)}>
          NVDA can {long ? 'fall' : 'rise'} {(room * 100).toFixed(1)}% before liquidation
        </span>
        <span className="tabular-nums text-muted-foreground">
          {entry !== null && <>Entry ${entry.toFixed(2)} · </>}Now ${now.toFixed(2)}
        </span>
      </div>
    </div>
  )
}

function PositionCard({
  p,
  rate,
  account,
  market,
  ledger,
  liquidationPrice,
  highlight,
}: {
  p: RobinhoodPosition
  rate: bigint | null
  account: RobinhoodAccountState | undefined
  market: RobinhoodMarketState | undefined
  ledger: PositionLedger | undefined
  liquidationPrice: number | null
  highlight?: boolean
}) {
  const [details, setDetails] = useState(false)
  const m = p.metrics
  const tone = healthTone(p.health)
  const long = p.direction === 'long'
  const debtInAsset = long ? formatUsdg6Display(p.debtStored) : formatNvda18Display(p.debtStored)
  const healthText = p.riskUnavailable ? 'Unavailable' : p.health === null ? 'No debt' : p.health.toFixed(2)
  const nowPrice =
    market?.prices.nvda.priceUsd18 != null ? Number(formatUnits(market.prices.nvda.priceUsd18, ROBINHOOD_DECIMALS.usd18)) : null
  const pnl = ledger?.pnlUsd ?? null
  const pnlPct = ledger?.pnlPct ?? null

  return (
    <div
      id={`rh-position-${p.id.toString()}`}
      className={cn(
        'relative scroll-mt-24 space-y-4 rounded-2xl border bg-foreground/[0.03] p-4 transition-[border-color,box-shadow] duration-700',
        highlight
          ? cn(
              'shadow-[0_0_0_3px_rgba(16,185,129,0.25)]',
              long ? 'border-emerald-400/60' : 'border-red-400/60 shadow-[0_0_0_3px_rgba(248,113,113,0.25)]',
            )
          : 'border-foreground/[0.08]',
      )}
    >
      <div className="relative flex flex-wrap items-center gap-2">
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold',
            long ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-red-500/15 text-red-600 dark:text-red-400',
          )}
        >
          {long ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
          {long ? 'Long' : 'Short'} NVDA
        </span>
        <span className="rounded-full border border-foreground/[0.08] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
          {formatLeverage(p.leverage)}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">#{p.id.toString()}</span>
        {!p.isActive && (
          <span className="rounded-full border border-foreground/[0.08] px-2 py-0.5 text-[10px] text-muted-foreground">
            {p.statusLabel}
          </span>
        )}
        <span
          className={cn('ml-auto text-sm font-bold tabular-nums', p.riskUnavailable ? 'text-muted-foreground' : tone.text)}
          title="Health above 1 keeps the position safe. Below 1 it can be liquidated."
        >
          {healthText}
          <span className="ml-1 text-[10px] font-normal text-muted-foreground/60">
            health{!p.riskUnavailable && p.health !== null ? ` · ${tone.label}` : ''}
          </span>
        </span>
      </div>

      <div className="relative">
        <div className="text-[11px] text-muted-foreground">Profit and loss</div>
        <div className="flex items-baseline gap-2">
          {pnl !== null ? (
            <GlidingUsd value={pnl} className={cn('text-3xl font-semibold tabular-nums tracking-tight', pnlTone(pnl))} />
          ) : (
            <span className="text-3xl font-semibold text-muted-foreground">n/a</span>
          )}
          {pnlPct !== null && (
            <span className={cn('text-sm font-bold tabular-nums', pnlTone(pnl))}>
              {pnlPct >= 0 ? '+' : ''}
              {pnlPct.toFixed(2)}%
            </span>
          )}
        </div>
      </div>

      {p.liquidatable === true && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-800 dark:text-red-300">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          This position is below its maintenance requirement and can be liquidated.
        </div>
      )}
      {p.riskUnavailable ? (
        <p className="text-xs text-muted-foreground">
          Prices are unavailable right now, so value and health cannot be computed. This does not mean the position is safe.
        </p>
      ) : (
        <PriceTrack direction={p.direction} entry={ledger?.entryPrice ?? null} now={nowPrice} liq={liquidationPrice} />
      )}

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Position value" value={m ? formatUsd18Display(m.grossAssetValueUsd18) : 'n/a'} />
        <Stat
          label="Yours after debt"
          value={m ? formatUsd18Display(m.equityUsd18) : 'n/a'}
          className={m && m.equityUsd18 < 0n ? 'text-red-600 dark:text-red-400' : undefined}
        />
        <Stat
          label="Borrowed"
          value={m ? formatUsd18Display(m.debtValueUsd18) : 'n/a'}
          className="text-orange-600 dark:text-orange-400"
        />
      </div>

      <button
        type="button"
        onClick={() => setDetails((v) => !v)}
        className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
        aria-expanded={details}
      >
        More details
        <ChevronDown className={cn('h-3 w-3 transition-transform', details && 'rotate-180')} />
      </button>
      {details && (
        <div className="grid grid-cols-2 gap-3 border-t border-foreground/[0.05] pt-3 sm:grid-cols-4">
          <Stat
            label="Entry price"
            value={ledger?.entryPrice != null ? formatUsdNumber(ledger.entryPrice) : 'n/a'}
            sub="market at open"
          />
          <Stat
            label="Est. liquidation"
            value={
              liquidationPrice !== null
                ? formatUsdNumber(liquidationPrice)
                : p.health === null && !p.riskUnavailable
                  ? 'None'
                  : 'n/a'
            }
            className="text-orange-600 dark:text-orange-400"
          />
          <Stat
            label="Margin in"
            value={ledger ? formatUsdNumber(ledger.inUsd) : formatSharesAsUsdg(p.lockedMarginShares, rate)}
            sub={ledger && ledger.outUsd > 0 ? `${formatUsdNumber(ledger.outUsd)} returned` : undefined}
          />
          <Stat
            label="Debt"
            value={p.debtStored !== null ? debtInAsset : 'n/a'}
            sub={`requested ${(p.requestedLeverageX100 / 100).toFixed(1)}x`}
          />
        </div>
      )}
      <RobinhoodPositionActions p={p} account={account} market={market} />
    </div>
  )
}

function EmptyPositions() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-foreground/[0.08] px-6 py-8 text-center">
      <div className="flex gap-1.5" aria-hidden>
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
          <TrendingUp className="h-4 w-4" />
        </span>
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-red-500/15 text-red-600 dark:text-red-400">
          <TrendingDown className="h-4 w-4" />
        </span>
      </div>
      <p className="text-sm font-semibold">No open positions</p>
      <p className="max-w-xs text-xs text-muted-foreground">
        Make your call on the ticket. Your trade shows up here with its live profit and how far it is from liquidation.
      </p>
      <button
        type="button"
        onClick={() => requestRobinhoodPanel('trade')}
        className="mt-1 rounded-full bg-foreground px-3.5 py-1.5 text-xs font-semibold text-background transition-opacity hover:opacity-90"
      >
        Start a trade
      </button>
    </div>
  )
}

export function RobinhoodPositionsList({
  positions,
  closedCount,
  connected,
  isLoading,
  usdgExchangeRate,
  account,
  market,
  ledgers,
  liquidationPrices,
  hideHeader,
  highlightId,
  className,
}: Props) {
  return (
    <div className={cn('space-y-3', className)}>
      {!hideHeader && (
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">Positions</h2>
          {closedCount > 0 && <span className="text-[11px] text-muted-foreground">{closedCount} closed</span>}
        </div>
      )}
      {!connected ? (
        <p className="text-sm text-muted-foreground">Log in to see your positions.</p>
      ) : isLoading ? (
        <div className="h-28 rounded-xl bg-foreground/[0.04] animate-pulse" />
      ) : positions.length === 0 ? (
        <EmptyPositions />
      ) : (
        positions.map((p) => (
          <PositionCard
            key={p.id.toString()}
            p={p}
            rate={usdgExchangeRate}
            account={account}
            market={market}
            ledger={ledgers?.get(p.id.toString())}
            liquidationPrice={liquidationPrices?.[p.id.toString()] ?? null}
            highlight={highlightId === p.id.toString()}
          />
        ))
      )}
    </div>
  )
}

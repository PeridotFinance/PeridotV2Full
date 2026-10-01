"use client"

/**
 * ChartsPanel — the Expert-mode history tab for a single market.
 *
 * Why it exists: Expert mode showed only the current value of every metric.
 * The goal is that Expert be genuinely expert-grade: the same
 * numbers over time, plus the raw data to take away. This tab is that: pick a
 * metric, pick a range, read the curve, export the table.
 *
 * Honesty over prettiness — the two rules that shape this component:
 *  - Days the indexer never recorded are gaps, not zeros. Recharts is told to
 *    connect nothing across a null, so a missing week looks missing.
 *  - Volume is labelled "verified volume" everywhere, because it counts only
 *    transactions that passed the leaderboard verifier. Calling it protocol
 *    volume would overstate what we can actually prove.
 */

import { useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Download } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Asset } from '@/types/markets'
import { useMarketSeries, type MarketSeriesPoint } from '@/hooks/use-market-series'

type MetricKey = 'tvlUsd' | 'utilizationPct' | 'totalSupplyApy' | 'borrowApy' | 'priceUsd' | 'volumeUsd'

const METRICS: {
  key: MetricKey
  label: string
  unit: 'usd' | 'percent'
  color: string
  hint: string
}[] = [
  { key: 'tvlUsd', label: 'TVL', unit: 'usd', color: '#10B981', hint: 'Total value supplied to this market.' },
  { key: 'utilizationPct', label: 'Utilization', unit: 'percent', color: '#F59E0B', hint: 'Share of the pool currently borrowed.' },
  { key: 'totalSupplyApy', label: 'Supply APY', unit: 'percent', color: '#34D399', hint: 'Daily average supply rate, including boost sources.' },
  { key: 'borrowApy', label: 'Borrow APY', unit: 'percent', color: '#FB923C', hint: 'Daily average borrow rate.' },
  { key: 'priceUsd', label: 'Price', unit: 'usd', color: '#60A5FA', hint: 'Daily close from the public market feed.' },
  { key: 'volumeUsd', label: 'Volume', unit: 'usd', color: '#A78BFA', hint: 'Verified deposits, withdrawals, borrows and repayments per day.' },
]

const RANGES = [7, 14, 30, 90, 365] as const
type Range = (typeof RANGES)[number]

function rangeLabel(days: Range): string {
  return days === 365 ? '1Y' : `${days}D`
}

function fUsd(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(1)}K`
  if (abs >= 1) return `$${n.toFixed(2)}`
  return `$${n.toFixed(4)}`
}

function fPct(n: number): string {
  return `${n.toFixed(n >= 10 ? 1 : 2)}%`
}

function formatValue(value: number, unit: 'usd' | 'percent'): string {
  return unit === 'usd' ? fUsd(value) : fPct(value)
}

function formatDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

interface ChartsPanelProps {
  asset: Asset
  chainId: number
  /**
   * Live Peridot-vs-Blend split. Only today's value exists — the indexer has
   * never recorded the boosted side — so it's shown as a note under the
   * utilization chart rather than faked as a second series.
   */
  blendPct?: number | null
}

export default function ChartsPanel({ asset, chainId, blendPct = null }: ChartsPanelProps) {
  const [metric, setMetric] = useState<MetricKey>('tvlUsd')
  const [days, setDays] = useState<Range>(30)

  const { data, isLoading, isError } = useMarketSeries({
    assetId: asset.id,
    chainId,
    days,
  })

  const active = METRICS.find((m) => m.key === metric)!
  const points: MarketSeriesPoint[] = data?.points ?? []

  const { chartData, latest, change, hasAnyValue } = useMemo(() => {
    const rows = points.map((p) => ({ day: p.day, value: p[metric] as number | null }))
    const withValue = rows.filter((r) => r.value != null) as { day: string; value: number }[]
    const first = withValue[0]?.value ?? null
    const last = withValue[withValue.length - 1]?.value ?? null
    return {
      chartData: rows,
      latest: last,
      change: first != null && last != null ? last - first : null,
      hasAnyValue: withValue.length > 0,
    }
  }, [points, metric])

  // The export intentionally carries every metric, not just the one on screen —
  // an analyst pulling a spreadsheet wants the whole market, and it costs one
  // extra query rather than six round-trips.
  const exportHref =
    `/api/markets/timeseries?assetId=${encodeURIComponent(asset.id)}` +
    `&chainId=${chainId}&days=${days}&format=csv&label=${encodeURIComponent(asset.symbol)}`

  return (
    <div className="space-y-4" data-testid="charts-panel">
      {/* ── METRIC SELECTOR ─────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1.5">
        {METRICS.map((m) => (
          <button
            key={m.key}
            onClick={() => setMetric(m.key)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors border',
              metric === m.key
                ? 'border-primary/50 bg-primary/10 text-foreground'
                : 'border-border/40 text-muted-foreground hover:text-foreground/80',
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* ── HEADLINE + RANGE ────────────────────────────────────────── */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
            {active.label}
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums leading-tight">
            {latest != null ? formatValue(latest, active.unit) : '--'}
          </div>
          {change != null && (
            <div
              className={cn(
                'text-xs font-mono tabular-nums',
                change >= 0 ? 'text-emerald-400' : 'text-red-400',
              )}
            >
              {change >= 0 ? '+' : ''}
              {formatValue(change, active.unit)} over {rangeLabel(days)}
            </div>
          )}
        </div>

        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setDays(r)}
              className={cn(
                'rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors',
                days === r
                  ? 'bg-primary/15 text-foreground'
                  : 'text-muted-foreground hover:text-foreground/80',
              )}
            >
              {rangeLabel(r)}
            </button>
          ))}
        </div>
      </div>

      {/* ── CHART ───────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border/40 bg-background/50 dark:bg-black/20 p-3">
        {isLoading ? (
          <div className="h-[220px] rounded-lg bg-white/[0.04] animate-pulse" />
        ) : isError ? (
          <div className="h-[220px] flex items-center justify-center text-xs text-muted-foreground">
            Chart data is unavailable right now.
          </div>
        ) : !hasAnyValue ? (
          <div className="h-[220px] flex items-center justify-center text-center text-xs text-muted-foreground px-6">
            No {active.label.toLowerCase()} recorded for this market in the last {rangeLabel(days)}.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`grad-${metric}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={active.color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={active.color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.08} />
              <XAxis
                dataKey="day"
                tickFormatter={formatDay}
                tick={{ fontSize: 10, fill: 'currentColor', opacity: 0.5 }}
                axisLine={false}
                tickLine={false}
                minTickGap={28}
              />
              <YAxis
                width={56}
                tick={{ fontSize: 10, fill: 'currentColor', opacity: 0.5 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => formatValue(v, active.unit)}
                domain={['auto', 'auto']}
              />
              <Tooltip
                contentStyle={{
                  background: 'rgba(10,10,10,0.92)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 12,
                  fontSize: 12,
                }}
                labelFormatter={(label: string) => formatDay(label)}
                formatter={(value: number) => [formatValue(value, active.unit), active.label]}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={active.color}
                strokeWidth={2}
                fill={`url(#grad-${metric})`}
                // A day the indexer never wrote stays a hole in the line —
                // connecting across it would invent history.
                connectNulls={false}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── FOOTER: source note + export ────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-[11px] text-muted-foreground max-w-md leading-snug">
          {active.hint}
          {metric === 'volumeUsd' && ' Counts verified transactions only.'}
          {metric === 'utilizationPct' && blendPct != null && blendPct > 0 && (
            <>
              {' '}
              Right now a further <span className="text-foreground">{blendPct.toFixed(2)}%</span> of
              this market is deployed into Blend via DeFindex — that share is not part of the
              borrowed line above, and only today&apos;s value is known.
            </>
          )}
        </p>
        <a
          href={exportHref}
          download
          className="inline-flex items-center gap-1.5 rounded-lg border border-border/40 px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-border transition-colors"
          data-testid="charts-export"
        >
          <Download className="h-3.5 w-3.5" />
          Export {rangeLabel(days)} (CSV)
        </a>
      </div>
    </div>
  )
}

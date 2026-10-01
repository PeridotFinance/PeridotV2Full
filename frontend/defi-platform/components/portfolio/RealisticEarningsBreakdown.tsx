import React from 'react'
import { Coins } from 'lucide-react'
import { useChartTheme } from '@/components/charts/chart-utils'
import type { EarningsBreakdown } from '@/hooks/use-portfolio-earnings'
import { formatCurrencyPrecise, formatPercent } from '@/lib/number-formatting'
import { SectionCard, MetricRow, toneFor, UNKNOWN } from './analytics-shared'

interface RealisticEarningsBreakdownProps {
  data: {
    earningsBreakdown?: EarningsBreakdown[]
    totalLifetimeEarnings?: number
    totalSuppliedAmount?: number
    totalRedeemedAmount?: number
    netInvestedAmount?: number
    totalROI?: number
    effectiveApy?: number
  }
  hideBalances: boolean
}

const num = (v: unknown): number => (typeof v === 'number' && isFinite(v) ? v : 0)

/**
 * Where the interest came from, and the cash flow it was earned on.
 *
 * Deliberately no "net gain" tile. That figure was `current value minus
 * (verified deposits minus verified withdrawals)`, and the verified trail is
 * incomplete for Privy and cross-chain deposits, so a wallet whose deposits
 * mostly bypassed the verifier saw its entire balance reported as profit.
 * Interest is the one gain this page can actually account for.
 */
export function RealisticEarningsBreakdown({ data, hideBalances }: RealisticEarningsBreakdownProps) {
  const chartTheme = useChartTheme()
  const palette = chartTheme.colors.categorical

  const total = num(data.totalLifetimeEarnings)
  const markets = (data.earningsBreakdown || []).filter((m) => m.amount > 0)
  const deposited = num(data.totalSuppliedAmount)
  const withdrawn = num(data.totalRedeemedAmount)
  const netPrincipal = data.netInvestedAmount != null ? num(data.netInvestedAmount) : deposited - withdrawn
  const roi = data.totalROI
  const apy = data.effectiveApy

  const money = (v: number) => formatCurrencyPrecise(v, hideBalances)

  return (
    <SectionCard
      title="Interest by market"
      subtitle="Lifetime, accrued from your verified deposits against the recorded APY"
      icon={Coins}
    >
      {markets.length > 0 ? (
        <div className="space-y-3">
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted/50">
            {markets.map((m, i) => (
              <div
                key={m.source}
                style={{ width: `${Math.max(m.percentage, 0.75)}%`, backgroundColor: palette[i % palette.length] }}
                title={`${m.source}: ${m.percentage.toFixed(1)}%`}
              />
            ))}
          </div>
          <ul className="divide-y divide-border/40">
            {markets.map((m, i) => (
              <li key={m.source} className="flex items-center justify-between gap-3 py-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: palette[i % palette.length] }}
                  />
                  <span className="text-sm font-medium truncate">
                    {m.source.replace(/ Supply Interest$/, '')}
                  </span>
                </div>
                <div className="text-right shrink-0 font-mono tabular-nums">
                  <span className="text-sm text-emerald-600 dark:text-emerald-400">{money(m.amount)}</span>
                  <span className="text-xs text-muted-foreground ml-2">{m.percentage.toFixed(1)}%</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground py-6 text-center">
          No interest recorded yet. It starts accruing with the first verified deposit.
        </p>
      )}

      <div className="mt-4 pt-3 border-t border-border/40">
        <MetricRow label="Interest earned, lifetime" value={money(total)} tone={total > 0 ? 'positive' : 'neutral'} />
        <MetricRow label="Effective APY" value={apy && apy > 0 ? formatPercent(apy, hideBalances) : UNKNOWN} />
        <MetricRow
          label="Return on capital"
          value={roi == null ? UNKNOWN : formatPercent(num(roi), hideBalances)}
          tone={toneFor(roi)}
        />
        <MetricRow label="Deposited" value={money(deposited)} />
        <MetricRow label="Withdrawn" value={money(withdrawn)} />
        <MetricRow label="Net principal" value={money(netPrincipal)} />
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        Deposits and withdrawals count verified transactions only; balances funded another way
        appear in the portfolio value but not here.
      </p>
    </SectionCard>
  )
}

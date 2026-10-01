import React, { useMemo } from 'react'
import { Wallet, TrendingUp } from 'lucide-react'
import { TimeSeriesChart } from '@/components/charts/TimeSeriesChart'
import { useChartTheme } from '@/components/charts/chart-utils'
import type { EarningsHistoryPoint } from '@/hooks/use-portfolio-earnings'
import { formatCurrencyPrecise, formatPercent } from '@/lib/number-formatting'
import { SectionCard, StatTile, EmptyChart, toneFor, UNKNOWN } from './analytics-shared'

interface PortfolioValueChartProps {
  /** Already sliced to the selected period by the tab. */
  history: EarningsHistoryPoint[]
  periodLabel: string
  currentValue: number
  /** Value change over fixed windows, from the API. `null` = no point that far back. */
  change24hPercent: number | null
  change7dPercent: number | null
  change30dPercent: number | null
  hideBalances: boolean
}

/**
 * Net portfolio value (supplied minus borrowed) per day. Stored end-of-day
 * snapshots override the APY-derived curve wherever they exist, so deposits
 * and withdrawals show as real steps; the change tiles therefore describe the
 * balance, not the yield, and say so.
 */
export function PortfolioValueChart({
  history,
  periodLabel,
  currentValue,
  change24hPercent,
  change7dPercent,
  change30dPercent,
  hideBalances,
}: PortfolioValueChartProps) {
  const chartTheme = useChartTheme()

  const chartData = useMemo(
    () =>
      history.map((point) => ({
        date: point.date,
        supply: point.portfolioValue || 0,
        borrow: 0,
        repay: 0,
        redeem: 0,
      })),
    [history],
  )

  const firstValue = history.length > 0 ? history[0].portfolioValue || 0 : 0
  const lastValue = history.length > 0 ? history[history.length - 1].portfolioValue || 0 : currentValue
  const periodChange = history.length > 1 ? lastValue - firstValue : null

  const money = (v: number) => formatCurrencyPrecise(v, hideBalances)
  const pct = (v: number | null) =>
    v == null ? (hideBalances ? '•••' : UNKNOWN) : formatPercent(v, hideBalances)

  return (
    <SectionCard
      title="Portfolio value"
      subtitle={`Supplied minus borrowed, last ${periodLabel.toLowerCase()}`}
      icon={Wallet}
    >
      {chartData.length > 0 ? (
        <TimeSeriesChart
          data={chartData}
          height={260}
          showBrush={false}
          showLegend={false}
          valueType="currency"
          series={['supply']}
          color={chartTheme.colors.portfolio}
          legendLabels={{ supply: 'Portfolio value' }}
        />
      ) : (
        <EmptyChart icon={TrendingUp} title="No portfolio history yet" />
      )}

      <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Current value" value={money(currentValue)} />
        <StatTile
          label={`Change, ${periodLabel.toLowerCase()}`}
          value={periodChange == null ? UNKNOWN : money(periodChange)}
          tone={toneFor(periodChange)}
          hint="Includes deposits and withdrawals"
        />
        <StatTile label="24h" value={pct(change24hPercent)} tone={toneFor(change24hPercent)} />
        <StatTile label="7 days" value={pct(change7dPercent)} tone={toneFor(change7dPercent)} hint={`30 days: ${pct(change30dPercent)}`} />
      </div>
    </SectionCard>
  )
}

import React, { useMemo, useState } from 'react'
import { TrendingUp, BarChart3 } from 'lucide-react'
import { TimeSeriesChart } from '@/components/charts/TimeSeriesChart'
import { useChartTheme } from '@/components/charts/chart-utils'
import type { EarningsHistoryPoint } from '@/hooks/use-portfolio-earnings'
import { formatCurrencyPrecise } from '@/lib/number-formatting'
import { SectionCard, SegmentedControl, StatTile, EmptyChart, UNKNOWN } from './analytics-shared'

interface EnhancedEarningsChartProps {
  /** Already sliced to the selected period by the tab. */
  history: EarningsHistoryPoint[]
  periodLabel: string
  totalLifetimeEarnings: number
  hideBalances: boolean
}

/**
 * Interest accrued over the selected window.
 *
 * `earnings` per point is the interest the API accrued for that UTC day from
 * the user's verified deposits against the recorded APY, the same walk that
 * produces the lifetime headline; `cumulativeEarnings` is the lifetime running
 * total through that day. Before v6 of the payload the series was a delta of a
 * synthetic value curve, which read 0 on every degraded response while the
 * headline showed real interest.
 */
export function EnhancedEarningsChart({
  history,
  periodLabel,
  totalLifetimeEarnings,
  hideBalances,
}: EnhancedEarningsChartProps) {
  const [mode, setMode] = useState<'cumulative' | 'daily'>('cumulative')
  const chartTheme = useChartTheme()

  const chartData = useMemo(
    () =>
      history.map((point) => ({
        date: point.date,
        supply: (mode === 'daily' ? point.earnings : point.cumulativeEarnings) || 0,
        borrow: 0,
        repay: 0,
        redeem: 0,
      })),
    [history, mode],
  )

  const earnedInPeriod = history.reduce((sum, p) => sum + (p.earnings || 0), 0)
  const daysWithInterest = history.filter((p) => (p.earnings || 0) > 0).length
  const averageDaily = daysWithInterest > 0 ? earnedInPeriod / daysWithInterest : 0
  const bestDay = history.reduce((best, p) => Math.max(best, p.earnings || 0), 0)
  const hasInterest = earnedInPeriod > 0

  const money = (v: number) => formatCurrencyPrecise(v, hideBalances)

  return (
    <SectionCard
      title="Interest earned"
      subtitle={`Accrued across your markets, last ${periodLabel.toLowerCase()}`}
      icon={TrendingUp}
      action={
        <SegmentedControl<'cumulative' | 'daily'>
          ariaLabel="Interest view"
          value={mode}
          onChange={setMode}
          options={[
            { id: 'cumulative', label: 'Cumulative' },
            { id: 'daily', label: 'Daily' },
          ]}
        />
      }
    >
      {chartData.length > 0 && hasInterest ? (
        <TimeSeriesChart
          data={chartData}
          height={260}
          showBrush={false}
          showLegend={false}
          valueType="currency"
          series={['supply']}
          color={chartTheme.colors.portfolio}
          legendLabels={{ supply: mode === 'daily' ? 'Interest that day' : 'Interest to date' }}
        />
      ) : (
        <EmptyChart
          icon={BarChart3}
          title="No interest recorded in this period"
          hint="Interest is accrued from your verified deposits against the recorded APY history."
        />
      )}

      <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          label="Earned in period"
          value={hasInterest ? money(earnedInPeriod) : hideBalances ? '••••' : UNKNOWN}
          tone={hasInterest ? 'positive' : 'neutral'}
        />
        <StatTile label="Average per day" value={hasInterest ? money(averageDaily) : UNKNOWN} hint="Days with interest" />
        <StatTile label="Best day" value={hasInterest ? money(bestDay) : UNKNOWN} />
        <StatTile
          label="Lifetime"
          value={money(totalLifetimeEarnings)}
          tone={totalLifetimeEarnings > 0 ? 'positive' : 'neutral'}
        />
      </div>
    </SectionCard>
  )
}

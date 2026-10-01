import React from 'react'
import { PieChart } from 'lucide-react'
import { DonutChart } from '@/components/charts/DonutChart'
import { useChartTheme } from '@/components/charts/chart-utils'
import { formatCurrencyPrecise } from '@/lib/number-formatting'
import { SectionCard, EmptyChart } from './analytics-shared'

interface TokenPosition {
  assetId: string
  symbol: string
  chainId: number
  chainName: string
  suppliedValueUSD: number
  borrowedValueUSD: number
}

interface AssetBreakdownChartProps {
  positions: TokenPosition[]
  hideBalances: boolean
}

/**
 * Share of supplied value per market, from the live positions the tab is
 * given. The donut and the list beside it read one palette; they used to carry
 * two different colour lists, so the second asset was red in the chart and
 * blue in the legend.
 */
export function AssetBreakdownChart({ positions, hideBalances }: AssetBreakdownChartProps) {
  const chartTheme = useChartTheme()
  const palette = chartTheme.colors.categorical

  const breakdown = React.useMemo(() => {
    const supplied = (positions || []).filter((p) => (p?.suppliedValueUSD || 0) > 0)
    const total = supplied.reduce((sum, p) => sum + p.suppliedValueUSD, 0)
    if (total <= 0) return []
    return supplied
      .map((p) => ({
        key: `${p.symbol}-${p.chainId}`,
        symbol: p.symbol,
        chainName: p.chainName,
        value: p.suppliedValueUSD,
        percentage: (p.suppliedValueUSD / total) * 100,
      }))
      .sort((a, b) => b.value - a.value)
  }, [positions])

  const total = breakdown.reduce((sum, a) => sum + a.value, 0)
  const donutData = breakdown.map((a) => ({
    token_symbol: a.symbol,
    volume: a.value.toString(),
    percentage: a.percentage,
  }))

  return (
    <SectionCard
      title="Allocation"
      subtitle="Share of supplied value per market"
      icon={PieChart}
    >
      {breakdown.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-4 items-center">
          <div className="h-52">
            <DonutChart
              data={donutData}
              height={208}
              showLegend={false}
              innerRadius={58}
              outerRadius={84}
              colors={palette}
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-baseline justify-between text-xs text-muted-foreground mb-2">
              <span>Market</span>
              <span>Supplied · share</span>
            </div>
            <ul className="divide-y divide-border/40">
              {breakdown.slice(0, 6).map((asset, index) => (
                <li key={asset.key} className="flex items-center justify-between gap-3 py-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: palette[index % palette.length] }}
                    />
                    <span className="text-sm font-medium truncate">{asset.symbol}</span>
                    <span className="text-xs text-muted-foreground truncate hidden sm:inline">
                      {asset.chainName}
                    </span>
                  </div>
                  <div className="text-right shrink-0 font-mono tabular-nums">
                    <span className="text-sm">{formatCurrencyPrecise(asset.value, hideBalances)}</span>
                    <span className="text-xs text-muted-foreground ml-2">{asset.percentage.toFixed(1)}%</span>
                  </div>
                </li>
              ))}
            </ul>
            {breakdown.length > 6 && (
              <div className="text-xs text-muted-foreground pt-2">
                +{breakdown.length - 6} more markets
              </div>
            )}
            <div className="flex items-center justify-between pt-3 mt-1 border-t border-border/40 text-sm">
              <span className="text-muted-foreground">Total supplied</span>
              <span className="font-mono tabular-nums font-semibold">
                {formatCurrencyPrecise(total, hideBalances)}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <EmptyChart
          icon={PieChart}
          title="Nothing supplied yet"
          hint="Supply an asset to see how your portfolio is spread."
        />
      )}
    </SectionCard>
  )
}

import React, { useMemo, useState } from 'react'
import { Download, Loader2, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useActiveWallet } from '@/hooks/use-active-wallet'
import { toast } from 'sonner'
import type { EarningsData } from '@/hooks/use-portfolio-earnings'
import { EnhancedEarningsChart } from './EnhancedEarningsChart'
import { PortfolioValueChart } from './PortfolioValueChart'
import { AssetBreakdownChart } from './AssetBreakdownChart'
import { RealisticEarningsBreakdown } from './RealisticEarningsBreakdown'
import { availablePeriods, defaultPeriodId } from './chart-periods'
import { SegmentedControl } from './analytics-shared'

interface AnalyticsTabProps {
  data: EarningsData
  positions: any[]
  hideBalances: boolean
}

/**
 * Analytics: two time series over one shared window, then allocation and the
 * interest split, then export.
 *
 * Every figure comes from `/api/user/earnings` (scoped to the markets this
 * host shows) or the live positions; the "Historical Performance" card with
 * its 3/6/12-month tiles is gone because the API only ever reached 30 days
 * back, so three of its four numbers were permanently a dash.
 */
export function AnalyticsTab({ data, positions, hideBalances }: AnalyticsTabProps) {
  const { address } = useActiveWallet()
  const [isExportingCsv, setIsExportingCsv] = useState(false)

  const history = data.earningsHistory || []
  const periods = useMemo(() => availablePeriods(history.length), [history.length])
  const [periodId, setPeriodId] = useState<string | null>(null)
  // One window for both charts. Each chart used to keep its own selection,
  // and with a 30-point series the default already was "30 Days", so the
  // button looked dead.
  const selectedPeriod = periods.some((p) => p.id === periodId)
    ? (periodId as string)
    : defaultPeriodId(periods)
  const period = periods.find((p) => p.id === selectedPeriod)
  const windowed = useMemo(
    () => history.slice(-(period?.days ?? history.length)),
    [history, period],
  )

  const handleExportCsv = async () => {
    if (!address) {
      toast.error('Please connect your wallet to export data')
      return
    }
    setIsExportingCsv(true)
    toast.loading('Preparing your CSV export...', { id: 'csv-export' })
    try {
      const response = await fetch(`/api/user/export-csv?address=${address}`)
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to export CSV' }))
        throw new Error(errorData.error || 'Failed to export CSV')
      }
      const csvContent = await response.text()
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      const url = URL.createObjectURL(blob)
      link.setAttribute('href', url)
      link.setAttribute('download', `peridot-portfolio-export-${new Date().toISOString().split('T')[0]}.csv`)
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      toast.success('CSV exported successfully!', { id: 'csv-export' })
    } catch (error) {
      console.error('Error exporting CSV:', error)
      toast.error(
        error instanceof Error ? error.message : 'Failed to export CSV. Please try again.',
        { id: 'csv-export' },
      )
    } finally {
      setIsExportingCsv(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {data.degradedMode && (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 border border-border/40 rounded-full px-2.5 py-1">
              <RefreshCw className="w-3 h-3" />
              Live sync unavailable, showing last stored values
            </span>
          )}
        </div>
        {periods.length > 1 && (
          <SegmentedControl
            ariaLabel="Chart window"
            value={selectedPeriod}
            onChange={setPeriodId}
            options={periods.map((p) => ({ id: p.id, label: p.label }))}
          />
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <EnhancedEarningsChart
          history={windowed}
          periodLabel={period?.label ?? 'All'}
          totalLifetimeEarnings={data.totalLifetimeEarnings || 0}
          hideBalances={hideBalances}
        />
        <PortfolioValueChart
          history={windowed}
          periodLabel={period?.label ?? 'All'}
          currentValue={data.currentPortfolioValue || 0}
          change24hPercent={data.portfolioGrowth24hPercent ?? null}
          change7dPercent={data.portfolioGrowth7dPercent ?? null}
          change30dPercent={data.portfolioGrowth30dPercent ?? null}
          hideBalances={hideBalances}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <AssetBreakdownChart positions={positions} hideBalances={hideBalances} />
        <RealisticEarningsBreakdown data={data} hideBalances={hideBalances} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/50 bg-card/60 px-5 py-4">
        <div>
          <div className="text-sm font-medium">Export your data</div>
          <div className="text-xs text-muted-foreground">Transaction history and positions as CSV</div>
        </div>
        <button
          onClick={handleExportCsv}
          disabled={isExportingCsv || !address}
          className={cn(
            'inline-flex items-center gap-2 rounded-lg border border-border/50 bg-background px-3.5 h-9 text-sm font-medium transition-colors',
            isExportingCsv || !address
              ? 'opacity-50 cursor-not-allowed'
              : 'hover:bg-muted/60',
          )}
        >
          {isExportingCsv ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {isExportingCsv ? 'Exporting...' : 'Export CSV'}
        </button>
      </div>
    </div>
  )
}

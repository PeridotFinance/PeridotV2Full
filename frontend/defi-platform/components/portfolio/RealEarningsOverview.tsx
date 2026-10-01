import React from 'react'
import { DollarSign, TrendingUp, TrendingDown, Wallet, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface RealEarningsOverviewProps {
  data: {
    totalSuppliedAmount: number
    totalRedeemedAmount: number
    actualCashEarned: number
    unrealizedGains: number
    realizedGains: number
    totalROI: number
    currentPortfolioValue: number
    portfolioGrowth24hPercent: number
    portfolioGrowth7dPercent: number
    portfolioGrowth30dPercent: number
  }
  hideBalances: boolean
}

export function RealEarningsOverview({ data, hideBalances }: RealEarningsOverviewProps) {
  const formatCurrency = (value: number) => {
    if (hideBalances) return '••••••'
    if (value === undefined || value === null || isNaN(value)) return '$0.00'
    const numValue = typeof value === 'string' ? parseFloat(value) : value
    if (isNaN(numValue)) return '$0.00'
    return `$${numValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
  }

  const formatPercent = (value: number) => {
    if (hideBalances) return '•••'
    if (value === undefined || value === null || isNaN(value)) return '0.00%'
    const numValue = typeof value === 'string' ? parseFloat(value) : value
    if (isNaN(numValue)) return '0.00%'
    return `${numValue > 0 ? '+' : ''}${numValue.toFixed(2)}%`
  }

  const metrics = [
    {
      title: 'Cash Earned',
      value: formatCurrency(data.actualCashEarned),
      change: formatPercent(data.totalROI),
      changeType: data.totalROI >= 0 ? 'positive' : 'negative',
      icon: DollarSign,
      description: 'Actual cash withdrawn',
      color: data.actualCashEarned >= 0 ? 'text-green-500' : 'text-red-500'
    },
    {
      title: 'Unrealized Gains',
      value: formatCurrency(data.unrealizedGains),
      change: formatPercent(data.portfolioGrowth7dPercent),
      changeType: data.portfolioGrowth7dPercent >= 0 ? 'positive' : 'negative',
      icon: TrendingUp,
      description: 'Current portfolio value vs invested',
      color: data.unrealizedGains >= 0 ? 'text-green-500' : 'text-red-500'
    },
    {
      title: 'Total ROI',
      value: formatPercent(data.totalROI),
      change: formatPercent(data.portfolioGrowth30dPercent),
      changeType: data.portfolioGrowth30dPercent >= 0 ? 'positive' : 'negative',
      icon: data.totalROI >= 0 ? TrendingUp : TrendingDown,
      description: 'Overall return on investment',
      color: data.totalROI >= 0 ? 'text-green-500' : 'text-red-500'
    }
  ]

  return (
    <div className="space-y-6">
      {/* Main ROI Card */}
      <Card className="bg-gradient-to-r from-primary/10 to-accent/10 border border-border/50 rounded-2xl">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">Portfolio Performance</h2>
            <div className={cn(
              "flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium",
              data.totalROI >= 0 
                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
            )}>
              {data.totalROI >= 0 ? (
                <ArrowUpRight className="w-4 h-4" />
              ) : (
                <ArrowDownRight className="w-4 h-4" />
              )}
              {formatPercent(data.totalROI)} ROI
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="text-center">
              <div className="text-3xl font-bold mb-1">
                {formatCurrency(data.actualCashEarned)}
              </div>
              <div className="text-sm text-muted-foreground">Cash Earned</div>
            </div>
            
            <div className="text-center">
              <div className="text-3xl font-bold mb-1">
                {formatCurrency(data.unrealizedGains)}
              </div>
              <div className="text-sm text-muted-foreground">Unrealized Gains</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detailed Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {metrics.map((metric, index) => {
          const Icon = metric.icon
          return (
            <Card key={metric.title} className="bg-card/60 border border-border/50 rounded-2xl hover:shadow-lg transition-all duration-300">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Icon className={cn("w-5 h-5", metric.color)} />
                  </div>
                  {metric.change && (
                    <div className={cn(
                      "flex items-center gap-1 text-xs px-2 py-1 rounded-full",
                      metric.changeType === 'positive' 
                        ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                        : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                    )}>
                      {metric.changeType === 'positive' ? (
                        <ArrowUpRight className="w-3 h-3" />
                      ) : (
                        <ArrowDownRight className="w-3 h-3" />
                      )}
                      {metric.change}
                    </div>
                  )}
                </div>
                
                <div>
                  <h3 className="text-sm text-muted-foreground mb-1">{metric.title}</h3>
                  <p className="text-xl font-bold mb-1">{metric.value}</p>
                  <p className="text-xs text-muted-foreground">{metric.description}</p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

    </div>
  )
}

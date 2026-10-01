import React from 'react'
import { TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { EarningsData } from '@/hooks/use-portfolio-earnings'

interface PortfolioGrowthMetricsProps {
  data: EarningsData
  hideBalances: boolean
}

export function PortfolioGrowthMetrics({ data, hideBalances }: PortfolioGrowthMetricsProps) {
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

  const growthMetrics = [
    {
      title: '24h Growth',
      value: formatCurrency(data.portfolioGrowth24h),
      percentage: formatPercent((data.portfolioGrowth24h / 1000) * 100), // Mock percentage
      changeType: data.portfolioGrowth24h >= 0 ? 'positive' : 'negative',
      icon: data.portfolioGrowth24h >= 0 ? TrendingUp : TrendingDown,
      description: 'Portfolio value change in last 24 hours'
    },
    {
      title: '7d Growth',
      value: formatCurrency(data.portfolioGrowth7d),
      percentage: formatPercent((data.portfolioGrowth7d / 1000) * 100), // Mock percentage
      changeType: data.portfolioGrowth7d >= 0 ? 'positive' : 'negative',
      icon: data.portfolioGrowth7d >= 0 ? TrendingUp : TrendingDown,
      description: 'Portfolio value change in last 7 days'
    },
    {
      title: '30d Growth',
      value: formatCurrency(data.portfolioGrowth30d),
      percentage: formatPercent((data.portfolioGrowth30d / 1000) * 100), // Mock percentage
      changeType: data.portfolioGrowth30d >= 0 ? 'positive' : 'negative',
      icon: data.portfolioGrowth30d >= 0 ? TrendingUp : TrendingDown,
      description: 'Portfolio value change in last 30 days'
    }
  ]

  return (
    <Card className="bg-card/60 border border-border/50 rounded-2xl">
      <CardContent className="p-6">
        <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" />
          Portfolio Growth
        </h3>
        
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {growthMetrics.map((metric, index) => {
            const Icon = metric.icon
            return (
              <div
                key={metric.title}
                className="text-center p-4 bg-card/50 border border-border/50 rounded-2xl portfolio-animate-fade-in"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="flex items-center justify-center mb-3">
                  <div className={cn(
                    "p-2 rounded-lg",
                    metric.changeType === 'positive' 
                      ? "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
                      : "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                  )}>
                    <Icon className="w-5 h-5" />
                  </div>
                </div>
                <div className="text-2xl font-bold mb-1">{metric.value}</div>
                <div className="text-sm text-muted-foreground mb-2">{metric.title}</div>
                <div className={cn(
                  "flex items-center justify-center gap-1 text-sm font-medium",
                  metric.changeType === 'positive' 
                    ? "text-green-600 dark:text-green-400"
                    : "text-red-600 dark:text-red-400"
                )}>
                  {metric.changeType === 'positive' ? (
                    <ArrowUpRight className="w-4 h-4" />
                  ) : (
                    <ArrowDownRight className="w-4 h-4" />
                  )}
                  {metric.percentage}
                </div>
                <div className="text-xs text-muted-foreground mt-2">{metric.description}</div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

import React from 'react'
import { 
  DollarSign, 
  Calendar,
  Clock,
  Percent,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { EarningsData } from '@/hooks/use-portfolio-earnings'

interface EarningsOverviewCardsProps {
  data: EarningsData
  hideBalances: boolean
}

export function EarningsOverviewCards({ data, hideBalances }: EarningsOverviewCardsProps) {
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
    return `${numValue.toFixed(2)}%`
  }

  const earningsMetrics = [
    {
      title: 'Total Lifetime Earnings',
      value: formatCurrency(data.totalLifetimeEarnings),
      change: '+12.5%',
      changeType: 'positive' as const,
      icon: DollarSign,
      description: 'All-time earnings from lending',
      color: 'text-green-400'
    },
    {
      title: 'This Month',
      value: formatCurrency(data.monthlyEarnings),
      change: '+8.2%',
      changeType: 'positive' as const,
      icon: Calendar,
      description: 'Interest earned this month',
      color: 'text-blue-400'
    },
    {
      title: 'Average Daily Earnings',
      value: formatCurrency(data.dailyAverageEarnings),
      change: '+3.1%',
      changeType: 'positive' as const,
      icon: Clock,
      description: 'Based on last 30 days',
      color: 'text-purple-400'
    },
    {
      title: 'Effective APY',
      value: formatPercent(data.effectiveApy),
      change: '+0.5%',
      changeType: 'positive' as const,
      icon: Percent,
      description: 'Current yield rate',
      color: 'text-orange-400'
    }
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      {earningsMetrics.map((metric, index) => {
        const Icon = metric.icon
        return (
          <div
            key={metric.title}
            className="bg-card/60 border border-border/50 rounded-2xl p-6 hover:shadow-lg transition-all duration-300 portfolio-animate-fade-in"
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <div className="flex items-center justify-between mb-3">
              <div className={cn("p-2 rounded-lg", metric.color, "bg-opacity-10")}>
                <Icon className="w-5 h-5" />
              </div>
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
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-sm text-muted-foreground">{metric.title}</h3>
              </div>
              <p className="text-2xl font-bold mb-1">{metric.value}</p>
              <p className="text-xs text-muted-foreground">{metric.description}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

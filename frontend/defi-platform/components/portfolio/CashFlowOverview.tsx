import React from 'react'
import { ArrowUpCircle, ArrowDownCircle, Wallet, TrendingUp } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface CashFlowOverviewProps {
  data: {
    totalSuppliedAmount: number
    totalRedeemedAmount: number
    actualCashEarned: number
    currentPortfolioValue: number
    totalROI: number
  }
  hideBalances: boolean
}

export function CashFlowOverview({ data, hideBalances }: CashFlowOverviewProps) {
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
    return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
  }

  const cashFlowData = [
    {
      label: 'Money In',
      amount: data.totalSuppliedAmount,
      icon: ArrowDownCircle,
      color: 'text-blue-500',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
      description: 'Total invested'
    },
    {
      label: 'Money Out',
      amount: data.totalRedeemedAmount,
      icon: ArrowUpCircle,
      color: 'text-orange-500',
      bgColor: 'bg-orange-50 dark:bg-orange-900/20',
      description: 'Total withdrawn'
    },
    {
      label: 'Net Cash Flow',
      amount: data.actualCashEarned,
      icon: Wallet,
      color: data.actualCashEarned >= 0 ? 'text-green-500' : 'text-red-500',
      bgColor: data.actualCashEarned >= 0 ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20',
      description: 'Cash earned (withdrawn - invested)'
    }
  ]

  return (
    <Card className="bg-card/60 border border-border/50 rounded-2xl">
      <CardContent className="p-6">
        <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
          <Wallet className="w-5 h-5 text-primary" />
          Cash Flow Analysis
        </h3>
        
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {cashFlowData.map((item, index) => {
            const Icon = item.icon
            return (
              <div
                key={item.label}
                className={cn(
                  "p-4 rounded-xl border transition-all duration-300 hover:shadow-md",
                  item.bgColor,
                  "border-border/50"
                )}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className={cn("p-2 rounded-lg", item.bgColor)}>
                    <Icon className={cn("w-5 h-5", item.color)} />
                  </div>
                  <div className="text-sm font-medium text-muted-foreground">
                    {item.label}
                  </div>
                </div>
                
                <div className="text-2xl font-bold mb-1">
                  {formatCurrency(item.amount)}
                </div>
                
                <div className="text-xs text-muted-foreground">
                  {item.description}
                </div>
              </div>
            )
          })}
        </div>
        
      </CardContent>
    </Card>
  )
}

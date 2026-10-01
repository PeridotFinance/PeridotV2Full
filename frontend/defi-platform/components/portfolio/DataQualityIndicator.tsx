import React from 'react'
import { CheckCircle, AlertCircle, Info } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface DataQualityIndicatorProps {
  dataQuality: {
    hasTransactions: boolean
    hasBalanceHistory: boolean
    hasPortfolioApy: boolean
    lastTransactionDate?: string
    lastBalanceSnapshot?: string
  }
}

export function DataQualityIndicator({ dataQuality }: DataQualityIndicatorProps) {
  const getStatusIcon = (hasData: boolean) => {
    return hasData ? (
      <CheckCircle className="w-4 h-4 text-green-500" />
    ) : (
      <AlertCircle className="w-4 h-4 text-yellow-500" />
    )
  }

  const getStatusText = (hasData: boolean, label: string) => {
    return hasData ? `${label} Available` : `${label} Not Available`
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never'
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const dataQualityScore = [
    dataQuality.hasTransactions,
    dataQuality.hasBalanceHistory,
    dataQuality.hasPortfolioApy
  ].filter(Boolean).length

  const getScoreColor = (score: number) => {
    if (score === 3) return 'text-green-500'
    if (score === 2) return 'text-yellow-500'
    return 'text-red-500'
  }

  return (
    <Card className="bg-card/60 border border-border/50 rounded-2xl">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Info className="w-4 h-4 text-primary" />
            Data Quality
          </h3>
          <div className={cn("text-sm font-medium", getScoreColor(dataQualityScore))}>
            {dataQualityScore}/3 Complete
          </div>
        </div>
        
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              {getStatusIcon(dataQuality.hasTransactions)}
              <span className={cn(
                dataQuality.hasTransactions ? 'text-foreground' : 'text-muted-foreground'
              )}>
                {getStatusText(dataQuality.hasTransactions, 'Transaction History')}
              </span>
            </div>
            <span className="text-xs text-muted-foreground">
              {formatDate(dataQuality.lastTransactionDate)}
            </span>
          </div>
          
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              {getStatusIcon(dataQuality.hasBalanceHistory)}
              <span className={cn(
                dataQuality.hasBalanceHistory ? 'text-foreground' : 'text-muted-foreground'
              )}>
                {getStatusText(dataQuality.hasBalanceHistory, 'Balance History')}
              </span>
            </div>
            <span className="text-xs text-muted-foreground">
              {formatDate(dataQuality.lastBalanceSnapshot)}
            </span>
          </div>
          
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              {getStatusIcon(dataQuality.hasPortfolioApy)}
              <span className={cn(
                dataQuality.hasPortfolioApy ? 'text-foreground' : 'text-muted-foreground'
              )}>
                {getStatusText(dataQuality.hasPortfolioApy, 'Portfolio APY')}
              </span>
            </div>
            <span className="text-xs text-muted-foreground">
              Current
            </span>
          </div>
        </div>
        
        {dataQualityScore < 3 && (
          <div className="mt-3 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
            <p className="text-xs text-yellow-700 dark:text-yellow-300">
              Some data may be estimated. Complete transactions to get accurate metrics.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

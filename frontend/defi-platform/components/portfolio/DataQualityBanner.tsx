import React from 'react'
import { AlertTriangle, CheckCircle, Info } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface DataQualityBannerProps {
  data: {
    portfolioGrowth24hPercent: number
    portfolioGrowth7dPercent: number
    portfolioGrowth30dPercent: number
    totalSuppliedAmount: number
    actualCashEarned: number
  }
}

export function DataQualityBanner({ data }: DataQualityBannerProps) {
  const hasUnrealisticGrowth = Math.abs(data.portfolioGrowth24hPercent) > 1000 || 
                              Math.abs(data.portfolioGrowth7dPercent) > 1000 || 
                              Math.abs(data.portfolioGrowth30dPercent) > 1000

  const hasHighValueTransaction = data.totalSuppliedAmount > 1000000 || 
                                 Math.abs(data.actualCashEarned) > 1000000

  const getQualityStatus = () => {
    if (hasUnrealisticGrowth) {
      return {
        type: 'warning',
        icon: AlertTriangle,
        title: 'Data Quality Notice',
        message: 'Some growth percentages appear unrealistic. This may be due to limited historical data or calculation issues.',
        color: 'text-yellow-600 dark:text-yellow-400',
        bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
        borderColor: 'border-yellow-200 dark:border-yellow-800'
      }
    }

    if (hasHighValueTransaction) {
      return {
        type: 'info',
        icon: Info,
        title: 'High-Value Portfolio',
        message: 'Your portfolio shows significant transaction volumes. All calculations are based on verified transaction data.',
        color: 'text-blue-600 dark:text-blue-400',
        bgColor: 'bg-blue-50 dark:bg-blue-900/20',
        borderColor: 'border-blue-200 dark:border-blue-800'
      }
    }

    return {
      type: 'success',
      icon: CheckCircle,
      title: 'Data Quality Good',
      message: 'All metrics are calculated from verified transaction data and appear realistic.',
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-50 dark:bg-green-900/20',
      borderColor: 'border-green-200 dark:border-green-800'
    }
  }

  const status = getQualityStatus()
  const Icon = status.icon

  return (
    <Card className={cn(
      "border rounded-xl",
      status.bgColor,
      status.borderColor
    )}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Icon className={cn("w-5 h-5 mt-0.5 flex-shrink-0", status.color)} />
          <div className="flex-1">
            <h3 className={cn("font-semibold text-sm mb-1", status.color)}>
              {status.title}
            </h3>
            <p className="text-sm text-muted-foreground">
              {status.message}
            </p>
            
            {hasUnrealisticGrowth && (
              <div className="mt-2 text-xs text-muted-foreground">
                <strong>Note:</strong> Growth percentages are capped at 0% when historical data appears unreliable to prevent misleading calculations.
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

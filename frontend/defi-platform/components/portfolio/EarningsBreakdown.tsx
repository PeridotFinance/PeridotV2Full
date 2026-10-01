import React from 'react'
import { PieChart, Award } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { EarningsData } from '@/hooks/use-portfolio-earnings'

interface EarningsBreakdownProps {
  data: EarningsData
  hideBalances: boolean
}

export function EarningsBreakdown({ data, hideBalances }: EarningsBreakdownProps) {
  const formatCurrency = (value: number) => {
    if (hideBalances) return '••••••'
    if (value === undefined || value === null || isNaN(value)) return '$0.00'
    return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Earnings Breakdown */}
      <Card className="bg-card/60 border border-border/50 rounded-2xl">
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <PieChart className="w-5 h-5 text-primary" />
            Earnings Breakdown
          </h3>
          
          <div className="space-y-4">
            {(data.earningsBreakdown || []).map((item, index) => (
              <div
                key={item.source}
                className="flex items-center justify-between p-3 bg-card/50 border border-border/50 rounded-2xl portfolio-animate-slide-in"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="flex items-center gap-3">
                  <div 
                    className="w-4 h-4 rounded-full" 
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="font-medium">{item.source}</span>
                </div>
                <div className="text-right">
                  <div className="font-semibold">{formatCurrency(item.amount)}</div>
                  <div className="text-sm text-muted-foreground">{item.percentage}%</div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Achievements */}
      <Card className="bg-card/60 border border-border/50 rounded-2xl">
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Award className="w-5 h-5 text-primary" />
            Achievements
          </h3>
          
          <div className="space-y-3">
            {(data.achievements || []).map((achievement, index) => (
              <div
                key={achievement.id}
                className={cn(
                  "flex items-center justify-between p-3 rounded-2xl border portfolio-animate-slide-in",
                  achievement.achieved 
                    ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
                    : "bg-card/50 border-border/50"
                )}
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "p-2 rounded-2xl",
                    achievement.achieved 
                      ? "bg-green-100 dark:bg-green-900/30"
                      : "bg-muted"
                  )}>
                    <Award className={cn(
                      "w-4 h-4",
                      achievement.achieved 
                        ? "text-green-600 dark:text-green-400"
                        : "text-muted-foreground"
                    )} />
                  </div>
                  <div>
                    <div className="font-medium">{achievement.title}</div>
                    <div className="text-sm text-muted-foreground">{achievement.description}</div>
                  </div>
                </div>
                <div className="text-right">
                  {achievement.achieved ? (
                    <div className="text-sm text-green-600 dark:text-green-400">
                      {achievement.date}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">Locked</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

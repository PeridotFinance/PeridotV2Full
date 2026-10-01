import React from 'react'
import { Target } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { EarningsData } from '@/hooks/use-portfolio-earnings'

interface EarningsGoalsProps {
  data: EarningsData
  hideBalances: boolean
}

export function EarningsGoals({ data, hideBalances }: EarningsGoalsProps) {
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

  return (
    <Card className="bg-card/60 border border-border/50 rounded-2xl">
      <CardContent className="p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Target className="w-5 h-5 text-primary" />
          Earnings Goals
        </h3>
        
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {(data.goals || []).map((goal, index) => (
            <div key={goal.id} className="text-center p-6 bg-card/50 border border-border/50 rounded-2xl">
              <div className="text-2xl font-bold text-primary mb-2">
                {goal.unit === '$' ? formatCurrency(goal.current) : formatPercent(goal.current)}
              </div>
              <div className="text-sm text-muted-foreground mb-2">{goal.title}</div>
              <div className="w-full bg-muted rounded-2xl h-2 portfolio-progress-bg">
                <div 
                  className="bg-primary h-2 rounded-2xl transition-all duration-500 portfolio-progress-fill"
                  style={{ width: `${Math.min(goal.progress, 100)}%` }}
                />
              </div>
              <div className="text-xs text-muted-foreground mt-2">
                Goal: {goal.unit === '$' ? formatCurrency(goal.target) : `${goal.target}%`} ({goal.description})
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

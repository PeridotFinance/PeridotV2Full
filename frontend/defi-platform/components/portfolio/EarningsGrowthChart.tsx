import React, { useState, useMemo } from 'react'
import { TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EarningsData } from '@/hooks/use-portfolio-earnings'

interface EarningsGrowthChartProps {
  data: EarningsData
  hideBalances: boolean
}

export function EarningsGrowthChart({ data, hideBalances }: EarningsGrowthChartProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<'7d' | '30d' | '90d' | '1y' | 'all'>('30d')

  const formatCurrency = (value: number) => {
    if (hideBalances) return '••••••'
    if (value === undefined || value === null || isNaN(value)) return '$0.00'
    return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
  }

  const filteredHistory = useMemo(() => {
    const earningsHistory = data.earningsHistory || []
    const periods = {
      '7d': 7,
      '30d': 30,
      '90d': 90,
      '1y': 365,
      'all': earningsHistory.length
    }
    
    const days = periods[selectedPeriod]
    return earningsHistory.slice(-days)
  }, [data.earningsHistory, selectedPeriod])

  const SimpleEarningsChart = ({ data, height = 200 }: { data: any[], height?: number }) => {
    if (!data || data.length === 0) return null

    const maxEarnings = Math.max(...data.map(d => d.cumulativeEarnings))
    const minEarnings = Math.min(...data.map(d => d.cumulativeEarnings))
    const range = maxEarnings - minEarnings || 1

    const points = data.map((point, index) => {
      const x = (index / (data.length - 1)) * 100
      const y = 100 - ((point.cumulativeEarnings - minEarnings) / range) * 100
      return `${x},${y}`
    }).join(' ')

    return (
      <div className="w-full" style={{ height }}>
        <svg viewBox="0 0 100 100" className="w-full h-full">
          <polyline
            fill="none"
            stroke="#10B981"
            strokeWidth="0.5"
            points={points}
            className="drop-shadow-sm"
          />
          <defs>
            <linearGradient id="earnings-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#10B981" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#10B981" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon
            fill="url(#earnings-gradient)"
            points={`0,100 ${points} 100,100`}
          />
        </svg>
      </div>
    )
  }

  const periods = [
    { id: '7d', label: '7 Days' },
    { id: '30d', label: '30 Days' },
    { id: '90d', label: '90 Days' },
    { id: '1y', label: '1 Year' },
    { id: 'all', label: 'All Time' },
  ]

  const totalEarned = filteredHistory.length > 0 ? (filteredHistory[filteredHistory.length - 1]?.cumulativeEarnings || 0) : 0
  const averageDaily = filteredHistory.length > 0 ? filteredHistory.reduce((sum, d) => sum + (d.earnings || 0), 0) / filteredHistory.length : 0
  const bestDay = filteredHistory.length > 0 ? Math.max(...filteredHistory.map(d => d.earnings || 0)) : 0

  return (
    <Card className="bg-card/60 border border-border/50 rounded-2xl">
      <CardContent className="p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            Earnings Growth
          </h2>
          
          <div className="flex gap-2">
            {periods.map((period) => (
              <Button
                key={period.id}
                variant={selectedPeriod === period.id ? "default" : "ghost"}
                size="sm"
                onClick={() => setSelectedPeriod(period.id as any)}
                className="bg-card/50 border border-border/50"
              >
                {period.label}
              </Button>
            ))}
          </div>
        </div>
        
        <SimpleEarningsChart data={filteredHistory} height={300} />
        
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-sm text-muted-foreground">Total Earned</div>
            <div className="text-lg font-semibold">
              {formatCurrency(totalEarned)}
            </div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Average Daily</div>
            <div className="text-lg font-semibold">
              {formatCurrency(averageDaily)}
            </div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Best Day</div>
            <div className="text-lg font-semibold">
              {formatCurrency(bestDay)}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

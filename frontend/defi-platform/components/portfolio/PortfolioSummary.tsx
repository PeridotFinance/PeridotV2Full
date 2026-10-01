import React, { useState } from 'react'
import { TrendingUp, DollarSign, Percent, Wallet, ChevronDown, ChevronRight, Coins } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PerTokenBreakdown } from '@/hooks/use-portfolio-earnings'

interface PortfolioSummaryProps {
  data: {
    currentPortfolioValue: number
    totalSuppliedAmount: number
    actualCashEarned: number
    totalROI: number
    portfolioGrowth24hPercent: number
    portfolioGrowth7dPercent: number
    portfolioGrowth30dPercent: number
    perTokenBreakdown?: PerTokenBreakdown[]
  }
  hideBalances: boolean
}

export function PortfolioSummary({ data, hideBalances }: PortfolioSummaryProps) {
  const [showTokenBreakdown, setShowTokenBreakdown] = useState(false)

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

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A'
    try {
      const date = new Date(dateString)
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    } catch {
      return dateString
    }
  }

  const getGrowthColor = (value: number) => {
    if (value > 0) return 'text-green-500'
    if (value < 0) return 'text-red-500'
    return 'text-muted-foreground'
  }

  const formatGrowthPercent = (value: number) => {
    if (hideBalances) return '•••'
    if (value === undefined || value === null || isNaN(value)) return '0.00%'
    const numValue = typeof value === 'string' ? parseFloat(value) : value
    if (isNaN(numValue)) return '0.00%'
    // Cap extremely high percentages to prevent display issues
    const cappedValue = Math.min(Math.abs(numValue), 9999.99)
    return `${numValue > 0 ? '+' : ''}${cappedValue.toFixed(2)}%`
  }

  const perTokenBreakdown = data.perTokenBreakdown || []

  return (
    <Card className="bg-gradient-to-br from-primary/10 via-accent/5 to-primary/10 border border-border/50 rounded-2xl">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">Portfolio Summary</h2>
          <div className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-full text-lg font-semibold",
            data.totalROI >= 0 
              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
              : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
          )}>
            <TrendingUp className="w-5 h-5" />
            {formatPercent(data.totalROI)} ROI
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Current Value */}
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Wallet className="w-5 h-5 text-primary" />
              <span className="text-sm font-medium text-muted-foreground">Current Value</span>
            </div>
            <div className="text-3xl font-bold mb-1">
              {formatCurrency(data.currentPortfolioValue)}
            </div>
            <div className="text-sm text-muted-foreground">
              Portfolio worth today
            </div>
          </div>
          
          {/* Total Invested */}
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <DollarSign className="w-5 h-5 text-blue-500" />
              <span className="text-sm font-medium text-muted-foreground">Total Invested</span>
            </div>
            <div className="text-3xl font-bold mb-1">
              {formatCurrency(data.totalSuppliedAmount)}
            </div>
            <div className="text-sm text-muted-foreground">
              Money you've put in
            </div>
          </div>
          
          {/* Cash Earned */}
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <TrendingUp className="w-5 h-5 text-green-500" />
              <span className="text-sm font-medium text-muted-foreground">Cash Earned</span>
            </div>
            <div className={cn("text-3xl font-bold mb-1", data.actualCashEarned >= 0 ? "text-green-500" : "text-red-500")}>
              {formatCurrency(data.actualCashEarned)}
            </div>
            <div className="text-sm text-muted-foreground">
              Actual cash withdrawn
            </div>
          </div>
          
          {/* 24h Growth */}
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Percent className="w-5 h-5 text-purple-500" />
              <span className="text-sm font-medium text-muted-foreground">24h Growth</span>
            </div>
            <div className={cn("text-3xl font-bold mb-1", getGrowthColor(data.portfolioGrowth24hPercent))}>
              {formatGrowthPercent(data.portfolioGrowth24hPercent)}
            </div>
            <div className="text-sm text-muted-foreground">
              Last 24 hours
            </div>
          </div>
        </div>
        
        {/* Per-Token Breakdown Section */}
        {perTokenBreakdown.length > 0 && (
          <div className="mt-8 pt-6 border-t border-border/50">
            <button
              onClick={() => setShowTokenBreakdown(!showTokenBreakdown)}
              className="flex items-center justify-between w-full text-left mb-4 hover:text-primary transition-colors"
            >
              <div className="flex items-center gap-2">
                <Coins className="w-5 h-5" />
                <h3 className="text-lg font-semibold">Per-Token Breakdown</h3>
                <span className="text-sm text-muted-foreground">
                  ({perTokenBreakdown.length} {perTokenBreakdown.length === 1 ? 'token' : 'tokens'})
                </span>
              </div>
              {showTokenBreakdown ? (
                <ChevronDown className="w-5 h-5" />
              ) : (
                <ChevronRight className="w-5 h-5" />
              )}
            </button>
            
            {showTokenBreakdown && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Token</TableHead>
                      <TableHead className="text-right">Total Supplied</TableHead>
                      <TableHead className="text-right">Current Supply</TableHead>
                      <TableHead className="text-right">Earnings</TableHead>
                      <TableHead className="text-right">Current APY</TableHead>
                      <TableHead>Entry Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {perTokenBreakdown
                      .sort((a, b) => b.earnings - a.earnings)
                      .map((token, index) => (
                        <TableRow key={`${token.tokenSymbol}-${token.chainId}-${index}`}>
                          <TableCell className="font-medium">
                            <div className="flex flex-col">
                              <span>{token.tokenSymbol.toUpperCase()}</span>
                              <span className="text-xs text-muted-foreground">Chain {token.chainId}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(token.totalSupplied)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(token.currentSupply)}
                          </TableCell>
                          <TableCell className={cn(
                            "text-right font-semibold",
                            token.earnings >= 0 ? "text-green-500" : "text-red-500"
                          )}>
                            {formatCurrency(token.earnings)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatPercent(token.currentApy)}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDate(token.entryDate)}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
        
      </CardContent>
    </Card>
  )
}

import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AnimatedCounter } from '@/components/ui/animated-components'
import { 
  Wallet, 
  TrendingUp, 
  Shield, 
  Target, 
  Plus,
  Eye,
  Award,
  ChevronDown,
  ChevronRight,
  Coins,
  Info,
  Clock,
  Zap
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { LoadingDots } from '@/components/ui/loading-dots'
import { LiveEarningsValue } from '@/components/shared/LiveEarnings'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { formatCurrencyPrecise, formatPercent as sharedFormatPercent } from '@/lib/number-formatting'

interface OverviewTabProps {
  data: {
    currentPortfolioValue: number
    netAPY: number
    liveNetAPY?: number
    historicalAPY?: number
    healthScore: number
    healthLabel: string
    totalROI: number | undefined
    totalSupplied: number
    totalBorrowed: number
    actualCashEarned: number | undefined
    accruedRewards: string
    isClaiming: boolean
    claimRewards: () => void
  }
  perTokenBreakdown: any[]
  hideBalances: boolean
}

export function OverviewTab({ data, perTokenBreakdown, hideBalances }: OverviewTabProps) {
  const [showTokenBreakdown, setShowTokenBreakdown] = useState(false)
  const [showApyExplanation, setShowApyExplanation] = useState(false)

  // Shared so sub-cent interest stays visible; each tab used to carry its own
  // copy that rounded a real 0.004 down to "$0".
  const formatCurrency = (value: number) => formatCurrencyPrecise(value, hideBalances)

  const formatPercent = (value: number) => sharedFormatPercent(value, hideBalances)

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A'
    try {
      const date = new Date(dateString)
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    } catch {
      return dateString
    }
  }

  const getHealthColor = (label: string) => {
    switch (label.toLowerCase()) {
      case 'safe': return 'text-green-500'
      case 'caution': return 'text-yellow-500'
      case 'risk': return 'text-red-500'
      default: return 'text-muted-foreground'
    }
  }

  const getHealthBgColor = (label: string) => {
    switch (label.toLowerCase()) {
      case 'safe': return 'bg-green-50 dark:bg-green-900/20'
      case 'caution': return 'bg-yellow-50 dark:bg-yellow-900/20'
      case 'risk': return 'bg-red-50 dark:bg-red-900/20'
      default: return 'bg-muted/50'
    }
  }

  return (
    <div className="space-y-6">

      {/* APY Comparison & Explanation */}
      <Card className="bg-card/40 border border-border/50 rounded-2xl overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-500" />
            APY Breakdown: Live vs Historical
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-3 rounded-xl bg-green-500/5 border border-green-500/10">
                <div className="mt-1 p-1.5 bg-green-500/20 rounded-lg">
                  <Zap className="w-4 h-4 text-green-500" />
                </div>
                <div>
                  <div className="font-semibold text-sm">Live Market APY</div>
                  <div className="text-2xl font-bold text-green-500">
                    {formatPercent(data.liveNetAPY ?? 0)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    This is your **current projection**. It answers: "If I keep my current balances exactly as they are, what will I earn over the next year at today's market rates?"
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-xl bg-blue-500/5 border border-blue-500/10">
                <div className="mt-1 p-1.5 bg-blue-500/20 rounded-lg">
                  <Clock className="w-4 h-4 text-blue-500" />
                </div>
                <div>
                  <div className="font-semibold text-sm">Historical Effective APY</div>
                  <div className="text-2xl font-bold text-blue-500">
                    {formatPercent(data.historicalAPY ?? 0)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    This is your **actual performance**. It answers: "Based on my balance history and the interest I have *actually* earned, what has my real return been so far?"
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-muted/30 p-4 rounded-xl space-y-3">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Info className="w-4 h-4 text-primary" />
                Why are they different?
              </h4>
              <div className="text-xs text-muted-foreground space-y-2 leading-relaxed">
                <p>
                  <strong className="text-foreground">1. Market Volatility:</strong> Lending rates change every second based on supply and demand. The <span className="text-green-500 font-medium">Live APY</span> captures this instant value.
                </p>
                <p>
                  <strong className="text-foreground">2. Time Weighting:</strong> If you were earning 5% yesterday and 15% today, your <span className="text-blue-500 font-medium">Historical APY</span> will show an average (e.g., 10%), while your Live APY will show 15%.
                </p>
                <p>
                  <strong className="text-foreground">3. Compounding:</strong> Your Historical APY accounts for the compounding interest already added to your principal over time.
                </p>
                <div className="pt-2 border-t border-border/50">
                  <p className="italic">
                    *We use the **Live APY** in your hero summary to give you the most up-to-date projection of your current earnings power.*
                  </p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        
        {/* Earnings & Returns */}
        <Card className="bg-card/60 border border-border/50 rounded-2xl">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Earnings & Returns</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <div className="text-sm text-muted-foreground">Total Earnings</div>
                <div className={cn(
                  "text-xl font-bold",
                  data.actualCashEarned !== undefined && data.actualCashEarned >= 0 ? "text-green-500" : "text-red-500"
                )}>
                  {data.actualCashEarned === undefined ? (
                    <LoadingDots className="text-muted-foreground" />
                  ) : hideBalances ? (
                    '••••••'
                  ) : (
                    // Live-accruing — a static two-decimal figure sits at $0.00
                    // for any normal deposit size, since a full day of interest
                    // is sub-cent. See components/shared/LiveEarnings.tsx.
                    <LiveEarningsValue
                      base={data.actualCashEarned}
                      balanceUsd={data.totalSupplied}
                      apyPercent={data.liveNetAPY ?? data.netAPY}
                    />
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">Interest earned</div>
              </div>
              <div className="text-right">
                <div className="text-sm text-muted-foreground">Total ROI</div>
                <div className={cn(
                  "text-xl font-bold",
                  data.totalROI !== undefined && data.totalROI >= 0 ? "text-green-500" : "text-red-500"
                )}>
                  {data.totalROI === undefined ? (
                    <LoadingDots className="text-muted-foreground" />
                  ) : (
                    formatPercent(data.totalROI)
                  )}
                </div>
              </div>
            </div>
            <div className="pt-2 border-t border-border/50">
              <div className="text-sm text-muted-foreground">Portfolio Value</div>
              <div className="text-xl font-bold">
                <AnimatedCounter value={data.currentPortfolioValue} prefix="$" duration={0.8} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Rewards */}
        <Card className="bg-card/60 border border-border/50 rounded-2xl">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Award className="w-5 h-5 text-primary" />
              Rewards
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Accrued Rewards</span>
                <span className="font-mono text-sm">
                  {data.accruedRewards ? (Number(data.accruedRewards)/1e18).toFixed(6) : '0.000000'} PERIDOT
                </span>
              </div>
              <Button
                className="w-full"
                disabled={!data.accruedRewards || Number(data.accruedRewards) === 0 || data.isClaiming}
                onClick={data.claimRewards}
              >
                {data.isClaiming ? 'Claiming...' : 'Claim All Rewards'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>


      {/* Per-Token Breakdown */}
      {perTokenBreakdown.length > 0 && (
        <Card className="bg-card/60 border border-border/50 rounded-2xl">
          <CardHeader>
            <button
              onClick={() => setShowTokenBreakdown(!showTokenBreakdown)}
              className="flex items-center justify-between w-full text-left hover:text-primary transition-colors"
            >
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Coins className="w-5 h-5 text-primary" />
                Per-Token Breakdown
                <span className="text-sm text-muted-foreground font-normal">
                  ({perTokenBreakdown.length} {perTokenBreakdown.length === 1 ? 'token' : 'tokens'})
                </span>
              </CardTitle>
              {showTokenBreakdown ? (
                <ChevronDown className="w-5 h-5" />
              ) : (
                <ChevronRight className="w-5 h-5" />
              )}
            </button>
          </CardHeader>
          {showTokenBreakdown && (
            <CardContent>
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
            </CardContent>
          )}
        </Card>
      )}
    </div>
  )
}

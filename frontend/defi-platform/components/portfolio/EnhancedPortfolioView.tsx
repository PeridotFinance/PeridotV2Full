import React, { useMemo, useState } from "react"
import { motion } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AnimatedCounter } from "@/components/ui/animated-components"
import { cn } from "@/lib/utils"
import { useTheme } from "next-themes"
import { PortfolioTabs } from "./PortfolioTabs"
import { OverviewTab } from "./OverviewTab"
import { AssetsTab } from "./AssetsTab"
import { AnalyticsTab } from "./AnalyticsTab"
import { TransactionsTab } from "./TransactionsTab"
import { usePortfolioEarnings } from "@/hooks/use-portfolio-earnings"
import { usePeridotRewards } from "@/hooks/use-peridot-rewards"

interface TokenPosition {
  assetId: string
  icon: string
  symbol: string
  chainId: number
  chainName: string
  suppliedBalance: number
  borrowedBalance: number
  suppliedValueUSD: number
  borrowedValueUSD: number
  priceUSD: number
  decimals: number
  pTokenAddress: string
  marketData: any
}

interface ChainBalance {
  chainId: number
  chainName: string
  totalSupplied: number
  totalBorrowed: number
  liquidity: number
  shortfall: number
  supplyEarningsUSD: number
  supplyRewardsUSD: number
  borrowCostsUSD: number
  borrowRewardsUSD: number
  netEarningsUSD: number
  positions: TokenPosition[]
}

import type { ChainApyEntry as ApyDetails, LiveApyData } from "@/hooks/use-apy-data"

interface EnhancedPortfolioViewProps {
  allPositions: TokenPosition[]        // Context-aware positions (filtered for hub chains)
  globalAllPositions: TokenPosition[]  // All positions across all chains
  chainBalances: ChainBalance[]
  totalSupplied: number
  totalBorrowed: number
  netAPY: number                      // Live Net APY from on-chain
  netEarningsUSD: number              // Live Projected Earnings
  liveApyData: LiveApyData
  onApyDataUpdate?: (chainId: number, assetId: string, apy: ApyDetails) => void
  isLoading: boolean
  hideBalances?: boolean
  // Real borrow-limit usage (0-100), computed from each position's own maxLTV.
  borrowLimitUsed?: number
}

export function EnhancedPortfolioView({
  allPositions,
  globalAllPositions,
  chainBalances,
  totalSupplied,
  totalBorrowed,
  netAPY: liveNetAPY,
  netEarningsUSD: liveNetEarningsUSD,
  liveApyData,
  onApyDataUpdate,
  isLoading,
  hideBalances = false,
  borrowLimitUsed
}: EnhancedPortfolioViewProps) {
  const { theme } = useTheme()
  const [activeTab, setActiveTab] = useState('assets')
  
  // Get portfolio earnings data
  const earningsData = usePortfolioEarnings()
  
  // Get rewards data
  const { accruedRewards, isClaiming, claimRewards } = usePeridotRewards()

  // Health score = headroom left on the borrow limit.
  // Prefer the caller's `borrowLimitUsed`, which weights each position by its
  // own maxLTV. The flat 75% assumption used before contradicted the Health
  // Factor chip in the summary above (Stellar markets carry 90% LTV / 92% LT),
  // so the same position could read "Caution" here and "safe" there.
  const healthScore = useMemo(() => {
    if (totalBorrowed <= 0) return 100
    const used = borrowLimitUsed !== undefined
      ? borrowLimitUsed
      : (totalSupplied > 0 ? (totalBorrowed / (totalSupplied * 0.75)) * 100 : 100)
    return Math.round(100 - Math.max(0, Math.min(100, used)))
  }, [totalSupplied, totalBorrowed, borrowLimitUsed])

  const healthLabel = healthScore > 66 ? 'Safe' : healthScore > 33 ? 'Caution' : 'Risk'

  // Calculate net APY - Prioritize Live Market APY for the main view
  const netAPY = useMemo(() => {
    // `!== 0` rather than `> 0`: a negative live APY is a real result (borrow
    // costs exceeding supply yield), not a missing one. Falling through to the
    // historical figure there would replace a loss with an unrelated gain.
    if (liveNetAPY !== 0) return liveNetAPY
    // Fallback to historical only when live data is genuinely absent
    if (earningsData.effectiveApy && earningsData.effectiveApy > 0) {
      return earningsData.effectiveApy
    }
    return 0
  }, [liveNetAPY, earningsData.effectiveApy])


  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-4 bg-muted rounded w-1/2 mb-2"></div>
                <div className="h-8 bg-muted rounded w-3/4"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  // Calculate additional metrics using earnings data from API
  const currentPortfolioValue = earningsData.currentPortfolioValue || (totalSupplied - totalBorrowed)
  const totalSuppliedFromAPI = earningsData.totalSuppliedAmount || totalSupplied
  const totalRedeemedFromAPI = earningsData.totalRedeemedAmount || 0
  const actualCashEarnedFromAPI = earningsData.actualCashEarned || 0
  
  // Only calculate fallback ROI if we're not loading earnings
  // If loading, pass undefined so UI can show loading state
  const totalROIFromAPI = earningsData.isLoading 
    ? undefined 
    : (earningsData.totalROI || (totalSuppliedFromAPI > 0 ? ((currentPortfolioValue + totalRedeemedFromAPI - totalSuppliedFromAPI) / totalSuppliedFromAPI) * 100 : 0))

  // Prepare data for tabs
  // Cash Earned should show actual lifetime earnings (interest earned), not just withdrawn amounts
  // If loading, use undefined to trigger loading state in children
  const cashEarned = earningsData.isLoading 
    ? undefined 
    : (earningsData.totalLifetimeEarnings || actualCashEarnedFromAPI || 0)
  
  const overviewData = {
    currentPortfolioValue: currentPortfolioValue,
    netAPY,
    liveNetAPY,
    historicalAPY: earningsData.effectiveApy || 0,
    healthScore,
    healthLabel,
    totalROI: totalROIFromAPI,
    totalSupplied,
    totalBorrowed,
    actualCashEarned: cashEarned,
    accruedRewards: accruedRewards?.toString() || '0',
    isClaiming,
    claimRewards
  }

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <PortfolioTabs activeTab={activeTab} onTabChange={setActiveTab} />
      </motion.div>

      {/* Tab Content */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {activeTab === 'overview' && (
          <OverviewTab 
            data={overviewData} 
            hideBalances={hideBalances} 
            perTokenBreakdown={earningsData.perTokenBreakdown || []}
          />
        )}
        
        {activeTab === 'assets' && (
          <AssetsTab
            allPositions={globalAllPositions}
            totalSupplied={totalSupplied}
            totalBorrowed={totalBorrowed}
            liveApyData={liveApyData}
            onApyDataUpdate={onApyDataUpdate}
            hideBalances={hideBalances}
          />
        )}
        
        {activeTab === 'analytics' && (
          <AnalyticsTab 
            data={earningsData} 
            positions={allPositions}
            hideBalances={hideBalances} 
          />
        )}
        
        {activeTab === 'transactions' && (
          <TransactionsTab hideBalances={hideBalances} />
        )}
      </motion.div>
    </div>
  )
} 
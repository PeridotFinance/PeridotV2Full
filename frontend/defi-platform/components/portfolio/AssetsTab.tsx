import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AnimatedCounter } from '@/components/ui/animated-components'
import { 
  PieChart, 
  TrendingUp, 
  TrendingDown,
  ExternalLink
} from 'lucide-react'
import { cn } from '@/lib/utils'
import PortfolioReactorCanvas from './PortfolioReactorCanvas'
import { PortfolioAssetDetailsRow } from './PortfolioAssetDetailsRow'
import { formatCurrency } from '@/lib/number-formatting'
import { resolveHubReadChainId } from '@/config/contracts'

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

interface AssetsTabProps {
  allPositions: TokenPosition[]
  totalSupplied: number
  totalBorrowed: number
  liveApyData: any
  onApyDataUpdate?: (chainId: number, assetId: string, apy: { supplyApy: number; supplyRewardsApy: number; borrowApy: number; borrowRewardsApy: number; }) => void
  hideBalances: boolean
}

export function AssetsTab({ 
  allPositions, 
  totalSupplied, 
  totalBorrowed, 
  liveApyData,
  onApyDataUpdate,
  hideBalances 
}: AssetsTabProps) {


  // Get positions with balances - use USD values since token balances may not be populated
  const suppliedPositions = allPositions.filter(pos => pos.suppliedValueUSD > 0)
  const borrowedPositions = allPositions.filter(pos => pos.borrowedValueUSD > 0)
  const hasAnyPositions = suppliedPositions.length > 0 || borrowedPositions.length > 0

  // Calculate global totals from all positions across all chains
  const globalTotalSupplied = allPositions.reduce((sum, pos) => sum + pos.suppliedValueUSD, 0)
  const globalTotalBorrowed = allPositions.reduce((sum, pos) => sum + pos.borrowedValueUSD, 0)
  const globalTotalPortfolioValue = globalTotalSupplied + globalTotalBorrowed

  // Get APY for a position
  // Always use hub chain ID for APY lookup to ensure we get the correct pool APY
  const getApyForPosition = (position: TokenPosition, type: "supply" | "borrow") => {
    // Resolve to hub chain ID for cross-chain assets (e.g., Arbitrum -> BSC)
    // This ensures we get APY from the actual pool where the asset is supplied/borrowed
    const hubChainId = resolveHubReadChainId(position.chainId) ?? position.chainId
    const chainData = liveApyData[hubChainId]
    if (!chainData || !chainData[position.assetId]) return { apy: 0, rewardsApy: 0 }
    
    const assetData = chainData[position.assetId]
    if (type === "supply") {
      // `supplyApy` is the bare on-chain base rate and is ~0 for Stellar
      // Soroban vaults, whose yield lives entirely in the boost layer. Show the
      // server-authoritative total, minus the incentive layer that gets its own
      // "+X% rewards" line, so the two together add up to what the user earns.
      const rewardsApy = (assetData.supplyRewardsApy ?? 0) + (assetData.boostRewardsApy ?? 0)
      const total = (assetData.totalSupplyApy ?? 0) > 0
        ? assetData.totalSupplyApy
        : (assetData.supplyApy ?? 0)
          + (assetData.supplyRewardsApy ?? 0)
          + (assetData.boostSourceApy ?? 0)
          + (assetData.boostRewardsApy ?? 0)
      return {
        apy: Math.max(0, total - rewardsApy),
        rewardsApy
      }
    } else {
      return {
        apy: assetData.borrowApy,
        rewardsApy: assetData.borrowRewardsApy
      }
    }
  }


  return (
    <div className="space-y-6">
      {/* Asset Allocation Overview */}
      <Card className="bg-card/60 border border-border/50 rounded-2xl">
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <PieChart className="w-5 h-5 text-primary" />
            Asset Allocation
          </CardTitle>
        </CardHeader>
        <CardContent>
          {hasAnyPositions ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Chart */}
              <div className="flex items-center justify-center">
                <PortfolioReactorCanvas
                  suppliedPositions={suppliedPositions}
                  borrowedPositions={borrowedPositions}
                  liveApyData={liveApyData}
                  totalSupplied={globalTotalSupplied}
                  totalBorrowed={globalTotalBorrowed}
                  height={300}
                />
              </div>
              
              {/* Summary Stats */}
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-4 bg-card/50 rounded-xl">
                    <div className="text-2xl font-bold text-green-500">
                      {formatCurrency(globalTotalSupplied, hideBalances)}
                    </div>
                    <div className="text-sm text-muted-foreground">Total Supplied</div>
                  </div>
                  <div className="text-center p-4 bg-card/50 rounded-xl">
                    <div className="text-2xl font-bold text-orange-500">
                      {formatCurrency(globalTotalBorrowed, hideBalances)}
                    </div>
                    <div className="text-sm text-muted-foreground">Total Borrowed</div>
                  </div>
                </div>

                <div className="text-center p-4 bg-gradient-to-r from-primary/10 to-accent/10 rounded-xl">
                  <div className="text-2xl font-bold">
                    {formatCurrency(globalTotalPortfolioValue, hideBalances)}
                  </div>
                  <div className="text-sm text-muted-foreground">Total Portfolio Value</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-48 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <PieChart className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p className="text-sm">No assets supplied yet</p>
                <p className="text-xs mt-1">Supply assets to see allocation</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Supplied Assets */}
      <Card className="bg-card/60 border border-border/50 rounded-2xl">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-green-400 flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Supplied Assets ({suppliedPositions.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {suppliedPositions.length > 0 ? (
            <div className="space-y-3">
              {suppliedPositions.map((position, index) => {
                const { apy, rewardsApy } = getApyForPosition(position, "supply")
                
                return (
                  <PortfolioAssetDetailsRow
                    key={`${position.assetId}-${position.chainId}`}
                    position={position}
                    type="supplied"
                    apy={apy}
                    rewardsApy={rewardsApy}
                    onApyDataUpdate={onApyDataUpdate}
                    isCollateral={true}
                    index={index}
                  />
                )
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <TrendingUp className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="text-sm">No assets supplied yet</p>
              <p className="text-xs mt-1">Go to Markets tab to start supplying</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Borrowed Assets */}
      <Card className="bg-card/60 border border-border/50 rounded-2xl">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-orange-400 flex items-center gap-2">
            <TrendingDown className="w-5 h-5" />
            Borrowed Assets ({borrowedPositions.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {borrowedPositions.length > 0 ? (
            <div className="space-y-3">
              {borrowedPositions.map((position, index) => {
                const { apy, rewardsApy } = getApyForPosition(position, "borrow")
                return (
                  <PortfolioAssetDetailsRow
                    key={`${position.assetId}-${position.chainId}-borrow`}
                    position={position}
                    type="borrowed"
                    apy={apy}
                    rewardsApy={rewardsApy}
                    onApyDataUpdate={onApyDataUpdate}
                    index={index}
                  />
                )
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <TrendingDown className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="text-sm">No borrowed assets</p>
              <p className="text-xs mt-1">Supply collateral first to enable borrowing</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card className="bg-card/60 border border-border/50 rounded-2xl">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Asset Management</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button className="p-4 bg-card/50 rounded-xl hover:bg-card/70 transition-colors text-left">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <ExternalLink className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="font-medium">View All Markets</div>
                  <div className="text-sm text-muted-foreground">Explore available assets</div>
                </div>
              </div>
            </button>
            
            <button className="p-4 bg-card/50 rounded-xl hover:bg-card/70 transition-colors text-left">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-500/10 rounded-lg">
                  <TrendingUp className="w-5 h-5 text-green-500" />
                </div>
                <div>
                  <div className="font-medium">Supply More Assets</div>
                  <div className="text-sm text-muted-foreground">Add to your portfolio</div>
                </div>
              </div>
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

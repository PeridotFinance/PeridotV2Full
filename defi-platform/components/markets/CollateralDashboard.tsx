"use client"

import { useBorrowingPower, useAssetBorrowingPower } from "@/hooks/use-borrowing-power"
import { getMarketsForChain } from "@/data/market-data"
import { useAccount } from "wagmi"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { TrendingUp, TrendingDown, AlertTriangle, Shield, DollarSign } from "lucide-react"
import Image from "next/image"

interface CollateralDashboardProps {
  className?: string
}

export const CollateralDashboard = ({ className }: CollateralDashboardProps) => {
  const { chainId } = useAccount()
  const { borrowingPower, isLoading, getMaxBorrowAmount, isBorrowAmountSafe } = useBorrowingPower()
  
  // Get all assets for current chain that have smart contracts
  const allAssets = chainId ? getMarketsForChain(chainId) : []
  const assetsWithContracts = allAssets.filter(asset => asset.hasSmartContract)

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'safe': return 'text-green-600 bg-green-50 border-green-200'
      case 'moderate': return 'text-yellow-600 bg-yellow-50 border-yellow-200'
      case 'high': return 'text-red-600 bg-red-50 border-red-200'
      default: return 'text-gray-600 bg-gray-50 border-gray-200'
    }
  }

  const getRiskIcon = (risk: string) => {
    switch (risk) {
      case 'safe': return <Shield className="h-4 w-4" />
      case 'moderate': return <AlertTriangle className="h-4 w-4" />
      case 'high': return <AlertTriangle className="h-4 w-4" />
      default: return <Shield className="h-4 w-4" />
    }
  }

  // Don't show loading skeleton, instead show the component with loading states for individual values
  // This prevents layout shift

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Borrowing Power
          </div>
          <Badge className={getRiskColor(borrowingPower.liquidationRisk)}>
            {getRiskIcon(borrowingPower.liquidationRisk)}
            {borrowingPower.liquidationRisk}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Overall Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Available to Borrow</p>
            <p className="text-2xl font-bold text-green-600">
              {isLoading ? (
                <span className="inline-block w-24 h-8 bg-gray-200 rounded animate-pulse"></span>
              ) : (
                `$${borrowingPower.availableBorrowingPowerUSD.toLocaleString(undefined, { 
                  minimumFractionDigits: 2, 
                  maximumFractionDigits: 2 
                })}`
              )}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Total Borrowed</p>
            <p className="text-2xl font-bold text-orange-600">
              {isLoading ? (
                <span className="inline-block w-24 h-8 bg-gray-200 rounded animate-pulse"></span>
              ) : (
                `$${borrowingPower.totalBorrowedUSD.toLocaleString(undefined, { 
                  minimumFractionDigits: 2, 
                  maximumFractionDigits: 2 
                })}`
              )}
            </p>
          </div>
        </div>

        {/* Utilization Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Collateral Utilization</span>
            <span className="font-medium">
              {borrowingPower.collateralUtilization.toFixed(1)}%
            </span>
          </div>
          <Progress 
            value={borrowingPower.collateralUtilization} 
            className="h-2"
          />
          <p className="text-xs text-muted-foreground">
            {borrowingPower.collateralUtilization > 80 
              ? "⚠️ High utilization - consider adding more collateral"
              : borrowingPower.collateralUtilization > 60
              ? "⚡ Moderate utilization - monitor closely"
              : "✅ Safe utilization level"
            }
          </p>
        </div>

        {/* Asset Breakdown */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium">Asset Positions</h4>
          {assetsWithContracts.map(asset => (
            <AssetCollateralRow key={asset.id} assetId={asset.id} />
          ))}
          
          {assetsWithContracts.length === 0 && (
            <div className="text-center py-4 text-muted-foreground">
              <p className="text-sm">No assets supplied yet</p>
              <p className="text-xs">Supply assets to start earning and use as collateral</p>
            </div>
          )}
        </div>

        {/* Available Borrowing by Asset */}
        {borrowingPower.availableBorrowingPowerUSD > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium">You can borrow up to:</h4>
            <div className="grid grid-cols-1 gap-2">
              {assetsWithContracts.map(asset => {
                const maxAmount = getMaxBorrowAmount(asset.id)
                if (maxAmount <= 0) return null
                
                return (
                  <div key={asset.id} className="flex items-center justify-between p-2 bg-muted/30 rounded">
                    <div className="flex items-center gap-2">
                      <Image src={asset.icon} alt={asset.symbol} width={20} height={20} />
                      <span className="text-sm font-medium">{asset.symbol}</span>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {maxAmount.toLocaleString(undefined, { 
                        minimumFractionDigits: 2, 
                        maximumFractionDigits: 4 
                      })}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Individual asset row component
const AssetCollateralRow = ({ assetId }: { assetId: string }) => {
  const assetData = useAssetBorrowingPower(assetId)
  
  // Always show the row structure to prevent layout shift
  if (!assetData.asset) {
    return null // Only hide if asset doesn't exist
  }

  const { asset, suppliedBalance, borrowedBalance, suppliedValueUSD, borrowedValueUSD, borrowingPowerUSD } = assetData

  // Only show if user has supplied or borrowed this asset
  if (!assetData.hasSupplied && !assetData.hasBorrowed) {
    return null
  }

  return (
    <div className="flex items-center justify-between p-3 bg-muted/20 rounded-lg">
      <div className="flex items-center gap-3">
        <Image src={asset.icon} alt={asset.symbol} width={24} height={24} />
        <div>
          <div className="font-medium text-sm">{asset.symbol}</div>
          <div className="text-xs text-muted-foreground">
            LTV: {asset.maxLTV}% | CF: {(asset.maxLTV / 100 * 100).toFixed(0)}%
          </div>
        </div>
      </div>
      
      <div className="text-right space-y-1">
        {assetData.isLoading ? (
          <div className="space-y-1">
            <div className="w-20 h-3 bg-gray-200 rounded animate-pulse"></div>
            <div className="w-16 h-3 bg-gray-200 rounded animate-pulse"></div>
          </div>
        ) : (
          <>
            {assetData.hasSupplied && (
              <div className="flex items-center gap-1 text-xs text-green-600">
                <TrendingUp className="h-3 w-3" />
                <span>
                  {suppliedBalance.toLocaleString(undefined, { 
                    minimumFractionDigits: 2, 
                    maximumFractionDigits: 4 
                  })} ({suppliedValueUSD.toLocaleString(undefined, { 
                    style: 'currency', 
                    currency: 'USD' 
                  })})
                </span>
              </div>
            )}
            
            {assetData.hasBorrowed && (
              <div className="flex items-center gap-1 text-xs text-orange-600">
                <TrendingDown className="h-3 w-3" />
                <span>
                  -{borrowedBalance.toLocaleString(undefined, { 
                    minimumFractionDigits: 2, 
                    maximumFractionDigits: 4 
                  })} ({borrowedValueUSD.toLocaleString(undefined, { 
                    style: 'currency', 
                    currency: 'USD' 
                  })})
                </span>
              </div>
            )}
            
            {borrowingPowerUSD > 0 && (
              <div className="text-xs text-blue-600">
                Power: {borrowingPowerUSD.toLocaleString(undefined, { 
                  style: 'currency', 
                  currency: 'USD' 
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
} 
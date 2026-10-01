"use client"

import { useMemo } from "react"
import { useCrossChainBalances } from "@/hooks/use-cross-chain-balances"
import { useTreasurySelection } from "@/hooks/use-treasury-selection"
import { Card, CardContent, CardHeader } from "../ui/card"
import { Skeleton } from "../ui/skeleton"

export function YieldSummary() {
  const { chainBalances, netAPY, isLoading } = useCrossChainBalances()
  const { selectedHubChainId, selectedAsset } = useTreasurySelection()

  // Calculate accrued yield from actual data for selected chain/asset
  const yieldData = useMemo(() => {
    if (!chainBalances || !selectedHubChainId) {
      return {
        accrued: "0.00",
        range: "3.5% - 5.5%",
        period: "30 days",
        apy: netAPY || 4.5
      }
    }

    const chainBalance = chainBalances.find(cb => cb.chainId === selectedHubChainId)
    if (!chainBalance) {
      return {
        accrued: "0.00",
        range: "3.5% - 5.5%",
        period: "30 days",
        apy: netAPY || 4.5
      }
    }

    // If asset is selected, calculate yield for that asset
    let totalSupplied = chainBalance.totalSupplied || 0
    let assetAPY = netAPY || 4.5

    if (selectedAsset) {
      const position = chainBalance.positions?.find(
        p => p.marketData?.symbol?.toLowerCase() === selectedAsset.symbol.toLowerCase()
      )
      if (position) {
        totalSupplied = position.suppliedValueUSD || 0
        assetAPY = position.marketData?.supplyApy || selectedAsset.supplyApy || netAPY || 4.5
      }
    }

    const estimatedYield = (totalSupplied * assetAPY * 30) / (100 * 365)
    const accrued = estimatedYield > 0 ? estimatedYield.toFixed(2) : "0.00"

    return {
      accrued,
      range: "3.5% - 5.5%",
      period: "30 days",
      apy: assetAPY.toFixed(2)
    }
  }, [chainBalances, selectedHubChainId, selectedAsset, netAPY])

  if (isLoading) {
    return (
      <Card className="rounded-3xl border-2 bg-gradient-to-br from-background to-muted/20 shadow-xl">
        <CardHeader className="pb-4">
          <Skeleton className="h-6 w-32 mb-2 rounded-full" />
          <Skeleton className="h-4 w-48 rounded-full" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-12 w-32 mb-2 rounded-2xl" />
          <Skeleton className="h-4 w-24 rounded-full" />
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs text-muted-foreground mb-1">Yield (30d)</p>
      <p className="text-2xl font-semibold text-green-600 dark:text-green-400">${yieldData.accrued}</p>
      <p className="text-xs text-muted-foreground mt-1">{yieldData.apy}% APY</p>
    </div>
  )
}


"use client"

import { useMemo } from "react"
import { TreasuryAssetCard } from "./TreasuryAssetCard"
import { useTreasurySelection } from "@/hooks/use-treasury-selection"
import { useCrossChainBalances } from "@/hooks/use-cross-chain-balances"
import { getChainConfig } from "@/config/contracts"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Coins } from "lucide-react"

export function TreasuryAssetGrid() {
  const {
    selectedHubChainId,
    selectedAssetId,
    localAssets,
    foreignAssets,
    setSelectedAsset,
  } = useTreasurySelection()

  const { chainBalances, isLoading } = useCrossChainBalances()

  // Get balance for an asset
  const getAssetBalance = useMemo(() => {
    return (assetId: string) => {
      if (!chainBalances || !selectedHubChainId) return { balance: BigInt(0), decimals: 18 }

      const chainBalance = chainBalances.find(cb => cb.chainId === selectedHubChainId)
      if (!chainBalance) return { balance: BigInt(0), decimals: 18 }

      const position = chainBalance.positions?.find(
        p => p.marketData?.symbol?.toLowerCase() === assetId.toLowerCase()
      )

      if (!position) return { balance: BigInt(0), decimals: 18 }

      return {
        balance: position.suppliedAmount || BigInt(0),
        decimals: position.marketData?.decimals || 18,
      }
    }
  }, [chainBalances, selectedHubChainId])

  // Get foreign chain name
  const getForeignChainName = (chainId?: number) => {
    if (!chainId) return undefined
    const config = getChainConfig(chainId)
    return (config as any)?.chainNameReadable || `Chain ${chainId}`
  }

  if (isLoading) {
    return (
      <Card className="rounded-3xl border-2">
        <CardHeader>
          <Skeleton className="h-6 w-32 mb-2 rounded-full" />
          <Skeleton className="h-4 w-48 rounded-full" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-32 rounded-2xl" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  const hasAssets = localAssets.length > 0 || foreignAssets.length > 0

  if (!hasAssets) {
    return (
      <Card className="rounded-3xl border-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Coins className="w-5 h-5" />
            Available Assets
          </CardTitle>
          <CardDescription>
            No assets available on the selected chain
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card className="rounded-3xl border-2 shadow-xl">
      <CardHeader>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
            <Coins className="w-6 h-6 text-primary" />
          </div>
          <div>
            <CardTitle className="text-xl">Available Assets</CardTitle>
            <CardDescription className="text-sm">
              Select an asset to manage
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Local Assets */}
        {localAssets.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold mb-3 text-muted-foreground">
              Available on {selectedHubChainId ? getChainConfig(selectedHubChainId)?.chainNameReadable || "this chain" : "selected chain"}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {localAssets.map(asset => {
                const { balance, decimals } = getAssetBalance(asset.id)
                return (
                  <TreasuryAssetCard
                    key={asset.id}
                    asset={asset}
                    isSelected={selectedAssetId === asset.id}
                    balance={balance}
                    balanceDecimals={decimals}
                    onClick={() => setSelectedAsset(asset.id)}
                    isForeign={false}
                  />
                )
              })}
            </div>
          </div>
        )}

        {/* Foreign Assets */}
        {foreignAssets.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold mb-3 text-muted-foreground">
              Available on other chains
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {foreignAssets.map(asset => {
                const foreignChainName = getForeignChainName(asset.availableOnChainId)
                return (
                  <TreasuryAssetCard
                    key={`${asset.id}-${asset.availableOnChainId}`}
                    asset={asset}
                    isSelected={false}
                    onClick={() => {
                      // Could switch chain or show info
                      console.log("Foreign asset clicked - would switch to chain", asset.availableOnChainId)
                    }}
                    isForeign={true}
                    foreignChainName={foreignChainName}
                  />
                )
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}










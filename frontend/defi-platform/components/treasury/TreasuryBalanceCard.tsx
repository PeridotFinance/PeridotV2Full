"use client"

import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { useAccount } from "wagmi"
import { useCrossChainBalances } from "@/hooks/use-cross-chain-balances"
import { useMemo } from "react"
import { Network } from "lucide-react"
import { getChainConfig } from "@/config/contracts"
import { useTreasurySelection } from "@/hooks/use-treasury-selection"

export function TreasuryBalanceCard() {
  const { address, chainId } = useAccount()
  const { chainBalances, isLoading } = useCrossChainBalances()
  const { selectedHubChainId, selectedAsset, isAutoRouting, routingInfo } = useTreasurySelection()

  // Get balance for selected chain and asset
  const totalBalance = useMemo(() => {
    if (!chainBalances || !selectedHubChainId) return "0.00"
    
    const chainBalance = chainBalances.find(cb => cb.chainId === selectedHubChainId)
    if (!chainBalance) return "0.00"
    
    // If asset is selected, show balance for that asset
    if (selectedAsset) {
      const position = chainBalance.positions?.find(
        p => p.marketData?.symbol?.toLowerCase() === selectedAsset.symbol.toLowerCase()
      )
      if (position) {
        return (position.suppliedValueUSD || 0).toFixed(2)
      }
    }
    
    // Otherwise show total for chain
    return (chainBalance.totalSupplied || 0).toFixed(2)
  }, [chainBalances, selectedHubChainId, selectedAsset])

  const primaryAsset = selectedAsset?.symbol || "USDC"
  const hubChainConfig = selectedHubChainId ? getChainConfig(selectedHubChainId) : null

  if (isLoading) {
    return (
      <div className="rounded-2xl border bg-card p-6">
        <Skeleton className="h-4 w-16 mb-2" />
        <Skeleton className="h-10 w-32" />
      </div>
    )
  }

  return (
    <div className="rounded-2xl border bg-card p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-sm text-muted-foreground mb-1">Balance</p>
          <p className="text-4xl font-semibold tracking-tight">${totalBalance}</p>
        </div>
        {selectedAsset && (
          <Badge variant="secondary" className="rounded-full text-xs">
            {primaryAsset}
          </Badge>
        )}
      </div>
      
      {/* Minimal routing indicator */}
      {isAutoRouting && routingInfo && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-3 border-t">
          <Network className="w-3 h-3" />
          <span>{routingInfo.from} → {routingInfo.to}</span>
        </div>
      )}
    </div>
  )
}


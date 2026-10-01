"use client"

import React from "react"
import { useAccount } from "wagmi"
import { useNetworkContext } from "@/context"
import { getMarketsForChain } from "@/data/market-data"
import MarketSummaryCard from "./MarketSummaryCard"

export default function StatsMarketSection() {
  const { chainId, isConnected } = useAccount()
  const { selectedNetworkId, getChainIdFromNetworkId } = useNetworkContext()

  const resolvedChainId = React.useMemo(() => {
    if (isConnected && chainId) return chainId
    return getChainIdFromNetworkId(selectedNetworkId)
  }, [isConnected, chainId, selectedNetworkId, getChainIdFromNetworkId])

  const assets = React.useMemo(() => getMarketsForChain(resolvedChainId), [resolvedChainId])

  if (!assets || assets.length === 0) return null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Markets on this chain</h2>
        <p className="text-xs text-muted-foreground">Live snapshots of each market</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-1 lg:grid-cols-1 xl:grid-cols-1 gap-4">
        {assets
          .filter(a => a.hasSmartContract)
          .map(asset => (
            <MarketSummaryCard key={`${resolvedChainId}-${asset.id}`} assetId={asset.id} chainId={resolvedChainId ?? undefined} />
          ))}
      </div>
    </div>
  )
}



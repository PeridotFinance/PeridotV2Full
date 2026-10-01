"use client"

import React, { useCallback, useEffect, useRef, useState } from "react"
import { useTheme } from "next-themes"
import { useAccount } from "wagmi"

import { cn } from "@/lib/utils"
import { Asset } from "@/types/markets"
import { useNetworkContext } from "@/context"
import { CHAIN_IDS, resolveHubReadChainId } from "@/config/contracts"
import { Gift } from "lucide-react"

import LiquidityAssetCard from "@/components/markets/LiquidityAssetCard"

type Apy = { supplyApy: number; supplyRewardsApy: number; borrowApy: number; borrowRewardsApy: number }

type GamifiedMarketsViewProps = {
  assets: Asset[]
  isDemoMode: boolean
  onTransaction: (asset: Asset, amount: number, type: "supply" | "borrow") => void
  onApyDataUpdate?: (chainId: number, assetId: string, apy: Apy) => void
}

export const GamifiedMarketsView: React.FC<GamifiedMarketsViewProps> = ({ assets, isDemoMode, onTransaction, onApyDataUpdate }) => {
  const { theme, resolvedTheme } = useTheme()
  const isLight = (resolvedTheme || theme) === "light"
  const { isConnected, chainId } = useAccount()
  const { selectedNetworkId, getChainIdFromNetworkId } = useNetworkContext()

  const [pointsByAsset, setPointsByAsset] = useState<Record<string, number>>({})
  const awardTimeouts = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const baseChainId = isConnected ? chainId : getChainIdFromNetworkId(selectedNetworkId) ?? null
  const hubResolved = resolveHubReadChainId(baseChainId ?? null)
  const isMainnetPreset = (process.env.NEXT_PUBLIC_NETWORK_PRESET || "").startsWith("mainnet")
  const effectiveChainId = hubResolved ?? (isMainnetPreset ? CHAIN_IDS.BSC_MAINNET : baseChainId ?? CHAIN_IDS.BSC_TESTNET)

  const handleTransactionWithRewards = useCallback(
    (asset: Asset, amount: number, type: "supply" | "borrow") => {
      try {
        onTransaction(asset, amount, type)
      } catch {}

      const awarded = 10
      setPointsByAsset((prev) => ({ ...prev, [asset.id]: awarded }))
      if (awardTimeouts.current[asset.id]) {
        clearTimeout(awardTimeouts.current[asset.id])
      }
      awardTimeouts.current[asset.id] = setTimeout(() => {
        setPointsByAsset((prev) => {
          const next = { ...prev }
          delete next[asset.id]
          return next
        })
        delete awardTimeouts.current[asset.id]
      }, 1500)
    },
    [onTransaction]
  )

  useEffect(() => {
    return () => {
      Object.values(awardTimeouts.current).forEach((timeoutId) => clearTimeout(timeoutId))
    }
  }, [])

  return (
    <div className="gamified-markets-container mx-auto max-w-7xl px-3 pb-8 sm:px-6">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {assets.map((asset) => (
          <LiquidityAssetCard
            key={asset.id}
            asset={asset}
            isLight={isLight}
            isConnected={isConnected}
            effectiveChainId={effectiveChainId}
            points={pointsByAsset[asset.id]}
            isDemoMode={isDemoMode}
            onTransaction={handleTransactionWithRewards}
            onApyDataUpdate={onApyDataUpdate}
          />
        ))}
      </div>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
        <Gift className="h-3.5 w-3.5 text-emerald-300" />
        <span>Supply or borrow to earn points. Share your moves with friends!</span>
      </div>
    </div>
  )
}

export default GamifiedMarketsView

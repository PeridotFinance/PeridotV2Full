"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Asset } from "@/types/markets"
import Image from "next/image"
import { useTreasurySelection } from "@/hooks/use-treasury-selection"
import { formatUnits } from "viem"
import { useMemo } from "react"
import { useCrossChainBalances } from "@/hooks/use-cross-chain-balances"

interface TreasuryAssetSelectorProps {
  value?: string
  onValueChange?: (value: string) => void
  showBalance?: boolean
}

export function TreasuryAssetSelector({
  value,
  onValueChange,
  showBalance = true,
}: TreasuryAssetSelectorProps) {
  const {
    selectedAssetId,
    selectedHubChainId,
    localAssets,
    setSelectedAsset,
  } = useTreasurySelection()

  const { chainBalances } = useCrossChainBalances()

  // Use controlled or uncontrolled value
  const currentValue = value ?? selectedAssetId ?? ""
  const handleChange = onValueChange ?? setSelectedAsset

  // Get balance for an asset
  const getAssetBalance = useMemo(() => {
    return (assetId: string) => {
      if (!chainBalances || !selectedHubChainId || !showBalance) return null

      const chainBalance = chainBalances.find(cb => cb.chainId === selectedHubChainId)
      if (!chainBalance) return null

      const position = chainBalance.positions?.find(
        p => p.marketData?.symbol?.toLowerCase() === assetId.toLowerCase()
      )

      if (!position) return null

      return (position.suppliedValueUSD || 0).toFixed(2)
    }
  }, [chainBalances, selectedHubChainId, showBalance])

  const selectedAsset = localAssets.find(a => a.id === currentValue)

  return (
    <Select value={currentValue} onValueChange={handleChange}>
      <SelectTrigger className="h-7 px-2 text-xs rounded-md border-0 bg-muted/50">
        <SelectValue placeholder="Asset">
          {selectedAsset ? (
            <div className="flex items-center gap-1.5">
              <Image
                src={selectedAsset.icon}
                alt={selectedAsset.symbol}
                width={14}
                height={14}
                className="rounded-full"
                onError={(e) => {
                  e.currentTarget.style.display = "none"
                }}
                unoptimized={true}
              />
              <span className="font-medium text-xs">{selectedAsset.symbol}</span>
            </div>
          ) : (
            "Asset"
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="rounded-2xl">
        {localAssets.map((asset) => {
          const balance = getAssetBalance(asset.id)
          return (
            <SelectItem
              key={asset.id}
              value={asset.id}
              className="rounded-xl"
            >
              <div className="flex items-center gap-2 w-full">
                <Image
                  src={asset.icon}
                  alt={asset.symbol}
                  width={20}
                  height={20}
                  className="rounded-full flex-shrink-0"
                  onError={(e) => {
                    e.currentTarget.style.display = "none"
                  }}
                  unoptimized={true}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{asset.symbol}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {asset.name}
                  </div>
                </div>
                {showBalance && balance && (
                  <div className="text-xs text-muted-foreground ml-auto">
                    ${balance}
                  </div>
                )}
              </div>
            </SelectItem>
          )
        })}
      </SelectContent>
    </Select>
  )
}


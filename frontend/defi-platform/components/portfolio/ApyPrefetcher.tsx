"use client"

import React, { useEffect, useMemo } from "react"
import { useBatchApy } from "@/hooks/use-batch-apy"

interface ApyPrefetcherProps {
  positions: Array<{ assetId: string; chainId: number }>
  onApyDataUpdate?: (chainId: number, assetId: string, apy: { supplyApy: number; supplyRewardsApy: number; borrowApy: number; borrowRewardsApy: number; }) => void
}

export const ApyPrefetcher: React.FC<ApyPrefetcherProps> = ({ positions, onApyDataUpdate }) => {
  // Filter unique assetId + chainId combinations to avoid redundant fetches
  const uniquePositions = useMemo(() => {
    const seen = new Set<string>()
    return positions.filter(pos => {
      const key = `${pos.assetId}-${pos.chainId}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [positions])

  const { apyData, isLoading } = useBatchApy(uniquePositions)

  useEffect(() => {
    if (!isLoading && apyData && onApyDataUpdate) {
      uniquePositions.forEach(pos => {
        const key = `${pos.assetId}-${pos.chainId}`
        const apy = apyData[key]
        if (apy) {
          onApyDataUpdate(pos.chainId, pos.assetId, apy)
        }
      })
    }
  }, [uniquePositions, apyData, isLoading, onApyDataUpdate])

  return null
}


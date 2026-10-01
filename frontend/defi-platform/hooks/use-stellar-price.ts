"use client"

import { useState, useEffect, useCallback } from "react"
import { stellarFetchPrice } from "@/lib/stellar-soroban-lending"
import { getStellarVaultConfig } from "@/lib/stellar-soroban-lending"
import { isStellarNetwork } from "@/config/contracts"
import { useNetworkContext } from "@/context"

export function useStellarPrice(assetId: string, enabled = true) {
  const { selectedNetworkId } = useNetworkContext()
  const [price, setPrice] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const fetchPrice = useCallback(async () => {
    const p = await stellarFetchPrice(assetId)
    setPrice(p)
    return p
  }, [assetId])

  useEffect(() => {
    if (!enabled || !isStellarNetwork(selectedNetworkId) || !getStellarVaultConfig(assetId)) {
      setPrice(null)
      setIsLoading(false)
      return
    }
    let cancelled = false
    setIsLoading(true)
    stellarFetchPrice(assetId)
      .then((p) => {
        if (!cancelled) setPrice(p)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => { cancelled = true }
  }, [enabled, selectedNetworkId, assetId])

  return {
    price,
    isLoading,
    hasValidPrice: price !== null && price > 0,
    refetch: fetchPrice,
  }
}

"use client"

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChainApyEntry {
  supplyApy:        number  // base supply APR from the lending market itself
  supplyRewardsApy: number  // peridot rewards layer on the supply side
  /**
   * Boost source APY — the underlying yield-bearing wrapper backing this
   * market. Examples: Morpho vault yield, Pancake LP fees, DefIndex/Blend
   * autocompound for Stellar Soroban vaults.
   */
  boostSourceApy:   number
  /** Boost-side rewards (e.g. Merkl incentives on top of the boost source). */
  boostRewardsApy:  number
  /**
   * Server-computed total supply APY (sum of all components above). Use this
   * over manually summing when present — the indexer is the source of truth.
   */
  totalSupplyApy:   number
  borrowApy:        number
  borrowRewardsApy: number
  /** Server-computed net borrow APY (after rewards). */
  netBorrowApy:     number
}

/** chainId → assetId → apy data */
export type LiveApyData = Record<number, Record<string, ChainApyEntry>>

/** assetId → best combined supply APY across all chains */
export type BestApyPerAsset = Record<string, number>

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Fetches APY data from /api/apy once and shares the result via React Query cache.
 * All consumers that call this hook in the same render tree share one network request.
 */
export function useApyData() {
  const { data: rawApyData, isLoading } = useQuery({
    queryKey:             ["database-apy", "all"],
    staleTime:            60_000,        // 60 s — don't refetch if fresh
    gcTime:               5 * 60_000,    // 5 min — keep in cache across tab switches
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const res  = await fetch("/api/apy")
      const json = await res.json()
      return json.success ? (json.data as Record<string, Record<string, any>>) : {}
    },
  })

  const liveApyData = useMemo((): LiveApyData => {
    if (!rawApyData) return {}
    const result: LiveApyData = {}
    Object.entries(rawApyData).forEach(([assetId, chainToData]) => {
      Object.entries(chainToData).forEach(([chainIdStr, data]) => {
        const cid = Number(chainIdStr)
        if (!result[cid]) result[cid] = {}
        result[cid][assetId] = {
          supplyApy:        data.supplyApy             ?? 0,
          supplyRewardsApy: data.peridotSupplyApy      ?? 0,
          boostSourceApy:   data.boostSourceSupplyApy  ?? 0,
          boostRewardsApy:  data.boostRewardsSupplyApy ?? 0,
          totalSupplyApy:   data.totalSupplyApy        ?? 0,
          borrowApy:        data.borrowApy             ?? 0,
          borrowRewardsApy: data.peridotBorrowApy      ?? 0,
          netBorrowApy:     data.netBorrowApy          ?? 0,
        }
      })
    })
    return result
  }, [rawApyData])

  const bestApyPerAsset = useMemo((): BestApyPerAsset => {
    const result: BestApyPerAsset = {}
    Object.values(liveApyData).forEach((chainData) => {
      Object.entries(chainData).forEach(([aid, data]) => {
        // Prefer the server-computed total when available — that's the
        // indexer's authoritative sum and includes boost layers (DefIndex,
        // Morpho, Pancake) that we'd otherwise have to remember to add here.
        // Fall back to local sum so a 0/missing total doesn't black out
        // markets that have valid component data.
        const total = data.totalSupplyApy > 0
          ? data.totalSupplyApy
          : (data.supplyApy ?? 0)
            + (data.supplyRewardsApy ?? 0)
            + (data.boostSourceApy ?? 0)
            + (data.boostRewardsApy ?? 0)
        if (!result[aid] || total > result[aid]) result[aid] = total
      })
    })
    return result
  }, [liveApyData])

  return { liveApyData, bestApyPerAsset, isLoading }
}

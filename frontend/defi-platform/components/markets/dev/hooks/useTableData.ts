/**
 * useTableData — Batched table-level data hook.
 *
 * Architecture:
 * - ONE useMarketMetrics call → TVL, utilization, priceUsd for all assets
 * - ONE useQuery per unique chainId → APY for all assets on that chain
 *   (Same React Query cache key ['database-apy', chainId] as useDatabaseApy,
 *    so individual panel hooks get cache hits for free)
 * - Zero per-row network hooks
 *
 * Result: N assets = ~3 network calls total (1 metrics + 1-2 APY per chain)
 * vs. N×10 with the original CombinedAssetRow approach.
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAccount } from 'wagmi'
import { useMarketMetrics } from '@/hooks/use-market-metrics'
import { useStellarMarketMetrics } from '@/hooks/use-stellar-market-metrics'
import { useStellarOnly } from '@/config/stellarOnly'
import { fetchApyData } from '@/hooks/use-database-apy'
import { Asset } from '@/types/markets'
import {
  CHAIN_IDS,
  resolveHubReadChainId,
  getDefaultHubChainId,
  isStellarNetwork,
} from '@/config/contracts'
import { useNetworkContext } from '@/context'

export interface AssetRowData {
  supplyApy: number
  borrowApy: number
  totalSupplyApy: number  // includes reward APY
  netBorrowApy: number    // net of rewards
  tvlUsd: number
  utilizationPct: number
  priceUsd: number
  /**
   * Chain this row's numbers were read from — the same resolution the metrics
   * and APY lookups use. Surfaced so downstream consumers (the Charts tab's
   * history query) key their reads to the same chain instead of re-deriving it.
   */
  chainId: number
  /**
   * Boosted-market transparency: what share of TVL is deployed into the
   * DeFindex/Blend vault vs. held idle in the Peridot vault. Null on markets
   * without a boosted vault (EVM, or a Stellar market with boost disabled).
   */
  blendPct: number | null
  idlePct: number | null
  blendUsd: number | null
  /**
   * Yield of the boost source itself (Blend via DeFindex) — the rate the
   * routed share earns, as opposed to Peridot's own lending rate. Shown next
   * to the Blend node in the allocation view so the split names both the
   * counterparty and its rate.
   */
  boostSourceApy: number | null
  isLoading: boolean
}

export function useTableData(assets: Asset[]) {
  const { chainId: walletChainId } = useAccount()
  const { selectedNetworkId, getChainIdFromNetworkId } = useNetworkContext()
  // On the Stellar-only host (peridot.finance) ExpertView renders Soroban
  // markets regardless of the NetworkContext selection, which stays on the EVM
  // preset default there (the switcher is hidden). Treat that host as Stellar
  // too, or all metrics/APY lookups key to chainId 56 and resolve to zeros.
  const stellarOnly = useStellarOnly()
  const isStellar = stellarOnly || isStellarNetwork(selectedNetworkId)

  // ── 1. Market metrics (TVL, utilization, priceUsd) ─────────────────
  // EVM markets come from the DB-backed /api/markets/metrics. Stellar lives
  // on Soroban and isn't written to that table — it's read live on-chain via
  // useStellarMarketMetrics. Both produce the same metricsKey shape
  // ("ASSET-ID:CHAIN_ID") so we can merge them transparently downstream.
  const { metrics: evmMetrics, loading: evmMetricsLoading } = useMarketMetrics()
  const stellarAssetIds = useMemo(
    () => (isStellar ? assets.map((a) => a.id) : []),
    [isStellar, assets]
  )
  const { metrics: stellarMetrics, loading: stellarMetricsLoading } =
    useStellarMarketMetrics(stellarAssetIds, isStellar)
  const metrics = useMemo(
    () => (isStellar ? { ...evmMetrics, ...stellarMetrics } : evmMetrics),
    [isStellar, evmMetrics, stellarMetrics]
  )
  const metricsLoading = evmMetricsLoading || (isStellar && stellarMetricsLoading)

  // ── 2. Hub chain APY ────────────────────────────────────────────────
  // Resolve the effective hub chain for this wallet / network selection.
  // For Stellar selection the worker writes `apy_latest_mainnet` under
  // chainId=56457 — query it directly, the API path is the same.
  // For EVM most assets live on the BSC hub; spoke-chain assets (Monad,
  // Arbitrum) are also readable from the hub via Axelar bridge read routing.
  const hubChainId: number | null = useMemo(() => {
    if (isStellar) return CHAIN_IDS.STELLAR_MAINNET
    // When no wallet is connected, use the selected network's chain ID so the
    // metrics key matches the DB — e.g. BSC Mainnet selected → chainId 56, not 97.
    const effectiveChainId = walletChainId ?? getChainIdFromNetworkId(selectedNetworkId) ?? null
    return (resolveHubReadChainId(effectiveChainId) ?? getDefaultHubChainId(selectedNetworkId)) as number | null
  }, [isStellar, walletChainId, selectedNetworkId, getChainIdFromNetworkId])

  // Direct React Query call — shares cache with useDatabaseApy instances.
  // When panels call useDatabaseApy for their asset, they hit this cache immediately.
  const { data: hubApyResponse, isLoading: apyLoading } = useQuery({
    queryKey: ['database-apy', hubChainId],
    queryFn: () => fetchApyData(hubChainId!),
    enabled: !!hubChainId,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  })

  // ── 3. Per-network APY (Monad, Stellar, etc.) ───────────────────────
  // Collect unique non-hub chain IDs from assets
  const spokeChainsIds = useMemo(() => {
    const ids = new Set<number>()
    assets.forEach(asset => {
      if (asset.availableOnChainId && asset.availableOnChainId !== hubChainId) {
        ids.add(asset.availableOnChainId)
      }
    })
    return [...ids]
  }, [assets, hubChainId])

  // Fetch APY for the first spoke chain (covers Monad etc.)
  // Rules of Hooks: can't loop, so we grab spoke[0] and spoke[1] as stable calls.
  const spokeChain0 = spokeChainsIds[0] ?? null
  const spokeChain1 = spokeChainsIds[1] ?? null

  const { data: spokeApy0 } = useQuery({
    queryKey: ['database-apy', spokeChain0],
    queryFn: () => fetchApyData(spokeChain0!),
    enabled: !!spokeChain0,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  })

  const { data: spokeApy1 } = useQuery({
    queryKey: ['database-apy', spokeChain1],
    queryFn: () => fetchApyData(spokeChain1!),
    enabled: !!spokeChain1,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  })

  // ── 4. Build per-asset data map ─────────────────────────────────────
  const assetTableData = useMemo<Record<string, AssetRowData>>(() => {
    const result: Record<string, AssetRowData> = {}
    const isLoading = metricsLoading || apyLoading

    assets.forEach(asset => {
      const chainId = asset.availableOnChainId ?? hubChainId ?? 56

      // Resolve APY response for this asset's chain
      const apyResponse =
        chainId === hubChainId ? hubApyResponse
        : chainId === spokeChain0 ? spokeApy0
        : chainId === spokeChain1 ? spokeApy1
        : hubApyResponse

      const apyData = apyResponse?.data?.[asset.id]?.[chainId]

      // Market metrics (TVL, utilization, price)
      // API returns keys like "USDC:56" (uppercase asset ID), so we must match that format.
      const metricsKey = `${asset.id.replace(/_/g, '-').toUpperCase()}:${chainId}`
      const m = metrics[metricsKey] as unknown as Record<string, number> | undefined

      // Quiet markets often have no (or a zero) indexed borrow APY, which
      // used to render as "0%". The Stellar metrics hook also reads the live
      // rate model, so prefer that over showing an impossible zero.
      const liveBorrowApr =
        typeof m?.borrowAprPct === 'number' && m.borrowAprPct > 0 ? m.borrowAprPct : null
      const dbBorrowApy =
        typeof apyData?.borrowApy === 'number' && apyData.borrowApy > 0 ? apyData.borrowApy : null
      const borrowApy = dbBorrowApy ?? liveBorrowApr ?? asset.borrowApy

      result[asset.id] = {
        // APY: prefer live data, fall back to static asset data
        supplyApy:     apyData?.supplyApy     ?? asset.supplyApy,
        borrowApy,
        totalSupplyApy: apyData?.totalSupplyApy ?? apyData?.supplyApy ?? asset.supplyApy,
        netBorrowApy:  apyData?.netBorrowApy  ?? borrowApy,
        // Market data
        tvlUsd:         m?.tvlUsd        ?? 0,
        utilizationPct: m?.utilizationPct ?? 0,
        priceUsd:       m?.priceUsd      ?? asset.price,
        chainId,
        blendPct: typeof m?.blendPct === 'number' ? m.blendPct : null,
        idlePct:  typeof m?.idlePct  === 'number' ? m.idlePct  : null,
        blendUsd: typeof m?.blendUsd === 'number' ? m.blendUsd : null,
        boostSourceApy:
          typeof apyData?.boostSourceSupplyApy === 'number' && apyData.boostSourceSupplyApy > 0
            ? apyData.boostSourceSupplyApy
            : null,
        isLoading,
      }
    })

    return result
  }, [
    assets, metrics, metricsLoading, apyLoading,
    hubApyResponse, spokeApy0, spokeApy1,
    hubChainId, spokeChain0, spokeChain1,
  ])

  return { assetTableData, metricsLoading: metricsLoading || apyLoading }
}

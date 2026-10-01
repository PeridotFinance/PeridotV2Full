"use client"

/**
 * Per-market historical series for the Expert charts tab.
 *
 * Cached through React Query with a long stale time: the underlying series is
 * daily-bucketed and the server already caches for 5 minutes, so re-opening a
 * row or flipping between metrics must not re-fetch. Only the range changes the
 * query key — the metric selector filters client-side out of one payload.
 */

import { useQuery } from '@tanstack/react-query'

export interface MarketSeriesPoint {
  day: string
  tvlUsd: number | null
  utilizationPct: number | null
  supplyApy: number | null
  totalSupplyApy: number | null
  borrowApy: number | null
  priceUsd: number | null
  volumeUsd: number | null
  suppliedUsd: number | null
  withdrawnUsd: number | null
  borrowedUsd: number | null
  repaidUsd: number | null
  txCount: number | null
}

export interface MarketSeriesResponse {
  ok: boolean
  assetId: string
  chainId: number
  days: number
  points: MarketSeriesPoint[]
  coverage: { metrics: number; apy: number; price: number; flow: number }
}

export function useMarketSeries(args: {
  assetId: string
  chainId: number
  days: number
  enabled?: boolean
}) {
  const { assetId, chainId, days, enabled = true } = args

  return useQuery<MarketSeriesResponse>({
    queryKey: ['market-series', assetId, chainId, days],
    enabled: enabled && !!assetId && !!chainId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
    queryFn: async () => {
      const res = await fetch(
        `/api/markets/timeseries?assetId=${encodeURIComponent(assetId)}&chainId=${chainId}&days=${days}`,
      )
      if (!res.ok) throw new Error(`market series ${res.status}`)
      const body = (await res.json()) as MarketSeriesResponse
      if (!body?.ok) throw new Error('market series unavailable')
      return body
    },
  })
}

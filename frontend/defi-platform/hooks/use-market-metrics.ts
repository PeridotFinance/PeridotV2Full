import { useQuery } from '@tanstack/react-query'

type MetricsMap = Record<string, {
  utilizationPct: number
  tvlUsd: number
  liquidityUnderlying: number
  liquidityUsd: number
  priceUsd: number
  collateralFactorPct: number
  updatedAt: string
  chainId: number
}>

async function fetchMarketMetrics(): Promise<MetricsMap> {
  const res = await fetch('/api/markets/metrics')
  const json = await res.json()
  if (!json?.ok) {
    throw new Error(json?.error || 'Failed to fetch market metrics')
  }
  return json.data || {}
}

export function useMarketMetrics() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['market-metrics'],
    queryFn: fetchMarketMetrics,
    staleTime: 60_000, // 60s - Fresh for 1 minute
    gcTime: 5 * 60_000, // 5min - Keep in cache for 5 minutes
    retry: 2,
    refetchOnWindowFocus: false,
  })

  return { 
    metrics: data || {}, 
    loading: isLoading, 
    error: error?.message || null 
  }
}



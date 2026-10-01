import { useQuery } from '@tanstack/react-query'

interface DatabasePriceData {
  priceUsd: number
  liquidityUsd: number
  liquidityUnderlying: number
  updatedAt: string
  chainId: number
}

interface DatabasePriceResponse {
  ok: boolean
  data?: DatabasePriceData
  cached?: boolean
  fallback?: boolean
  source?: string
  error?: string
}

interface UseDatabasePriceProps {
  assetId: string
  chainId: number | null
}

interface UseDatabasePriceReturn {
  price: number | null
  liquidityUsd: number
  liquidityUnderlying: number
  isLoading: boolean
  error: Error | null
  lastUpdated: string | null
  hasValidPrice: boolean
  source: string | null
}

export async function fetchPriceData(assetId: string, chainId: number): Promise<DatabasePriceResponse> {
  const response = await fetch(`/api/markets/details?assetId=${assetId}&chainId=${chainId}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`)
  }

  const result: DatabasePriceResponse = await response.json()

  if (!result.ok) {
    throw new Error(result.error || 'Failed to fetch price data')
  }

  return result
}

export function useDatabasePrice({ assetId, chainId }: UseDatabasePriceProps): UseDatabasePriceReturn {
  const { data: priceResponse, isLoading, error } = useQuery({
    queryKey: ['database-price', assetId, chainId],
    queryFn: () => fetchPriceData(assetId, chainId!),
    enabled: !!chainId && !!assetId,
    staleTime: 60_000, // 60s - Fresh for 1 minute
    gcTime: 10 * 60_000, // 10min - Keep in cache for 10 minutes
    retry: 1,
    refetchOnWindowFocus: false,
  })

  const priceData = priceResponse?.data

  // Return default values if no data available
  const defaultReturn: UseDatabasePriceReturn = {
    price: null,
    liquidityUsd: 0,
    liquidityUnderlying: 0,
    isLoading,
    error: error as Error | null,
    lastUpdated: null,
    hasValidPrice: false,
    source: null
  }

  if (!priceData) {
    return defaultReturn
  }

  const price = priceData.priceUsd > 0 ? priceData.priceUsd : null

  return {
    price,
    liquidityUsd: priceData.liquidityUsd,
    liquidityUnderlying: priceData.liquidityUnderlying,
    isLoading,
    error: error as Error | null,
    lastUpdated: priceData.updatedAt,
    hasValidPrice: price !== null,
    source: priceResponse?.source || null
  }
}

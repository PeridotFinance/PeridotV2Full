import { useQuery } from '@tanstack/react-query'

interface MarketDetailsFromDB {
  liquidityUsd: number
  liquidityUnderlying: number
  updatedAt: string
  chainId: number
}

export function useMarketDetailsFromDB(assetId: string, chainId: number) {
  return useQuery({
    queryKey: ['market-details-db', assetId, chainId],
    queryFn: async (): Promise<MarketDetailsFromDB> => {
      const response = await fetch(`/api/markets/details?assetId=${assetId}&chainId=${chainId}`)
      const result = await response.json()

      if (!result.ok) {
        throw new Error(result.error || 'Failed to fetch market details')
      }

      return result.data
    },
    staleTime: 30_000, // 30 seconds
    refetchInterval: 60_000, // Refetch every minute
    enabled: !!assetId && !!chainId,
  })
}


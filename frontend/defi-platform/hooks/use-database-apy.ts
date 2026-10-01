import { useQuery } from '@tanstack/react-query'

interface DatabaseApyData {
  supplyApy: number
  borrowApy: number
  peridotSupplyApy: number
  peridotBorrowApy: number
  boostSourceSupplyApy?: number
  boostRewardsSupplyApy?: number
  totalSupplyApy: number
  netBorrowApy: number
  timestamp: string
}

interface DatabaseApyResponse {
  success: boolean
  data: Record<string, Record<number, DatabaseApyData>>
  timestamp: string
  error?: string
}

interface UseDatabaseApyProps {
  assetId: string
  chainId: number | null
}

interface UseDatabaseApyReturn {
  supplyApy: number
  borrowApy: number
  peridotSupplyApy: number
  peridotBorrowApy: number
  boostSourceSupplyApy: number
  boostRewardsSupplyApy: number
  totalSupplyApy: number
  netBorrowApy: number
  isLoading: boolean
  error: Error | null
  lastUpdated: string | null
}

export async function fetchApyData(chainId: number): Promise<DatabaseApyResponse> {
  const response = await fetch(`/api/apy?chainId=${chainId}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`)
  }

  const result: DatabaseApyResponse = await response.json()
  
  if (!result.success) {
    throw new Error(result.error || 'Failed to fetch APY data')
  }

  return result
}

export function useDatabaseApy({ assetId, chainId }: UseDatabaseApyProps): UseDatabaseApyReturn {
  // Fetch ALL APY data for the chain (batched) - React Query handles deduplication
  const { data: apyResponse, isLoading, error } = useQuery({
    queryKey: ['database-apy', chainId],
    queryFn: () => fetchApyData(chainId!),
    enabled: !!chainId,
    staleTime: 60_000, // 60s - Fresh for 1 minute (matches API cache)
    gcTime: 10 * 60_000, // 10min - Keep in cache for 10 minutes
    retry: 1,
    refetchOnWindowFocus: false,
  })

  // Extract data for this specific asset from the batched response
  const apyData = apyResponse?.data[assetId]?.[chainId!] || null

  // Return default values if no data available
  const defaultReturn: UseDatabaseApyReturn = {
    supplyApy: 0,
    borrowApy: 0,
    peridotSupplyApy: 0,
    peridotBorrowApy: 0,
    boostSourceSupplyApy: 0,
    boostRewardsSupplyApy: 0,
    totalSupplyApy: 0,
    netBorrowApy: 0,
    isLoading,
    error: error as Error | null,
    lastUpdated: null
  }

  if (!apyData) {
    return defaultReturn
  }

  return {
    supplyApy: apyData.supplyApy,
    borrowApy: apyData.borrowApy,
    peridotSupplyApy: apyData.peridotSupplyApy,
    peridotBorrowApy: apyData.peridotBorrowApy,
    boostSourceSupplyApy: apyData.boostSourceSupplyApy ?? 0,
    boostRewardsSupplyApy: apyData.boostRewardsSupplyApy ?? 0,
    totalSupplyApy: apyData.totalSupplyApy,
    netBorrowApy: apyData.netBorrowApy,
    isLoading,
    error: error as Error | null,
    lastUpdated: apyData.timestamp
  }
} 
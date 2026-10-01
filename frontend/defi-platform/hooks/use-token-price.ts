import { useQuery } from '@tanstack/react-query'
import type { TokenPriceData } from '@/app/api/token/price/route'

export function useTokenPrice() {
  return useQuery<TokenPriceData>({
    queryKey: ['token-price'],
    queryFn: async () => {
      const res = await fetch('/api/token/price')
      if (!res.ok) throw new Error('Failed to fetch token price')
      return res.json()
    },
    staleTime:       60_000,
    refetchInterval: 90_000,
    retry: 2,
  })
}

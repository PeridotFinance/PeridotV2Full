'use client'

/**
 * NVDA/USD history for the Robinhood margin chart, from the feed's rounds via
 * /api/robinhood/nvda-price (one server-side walk shared by every visitor).
 * The feed publishes roughly every half hour while the stock trades, so a
 * 30s poll is already faster than the data.
 */
import { useQuery } from '@tanstack/react-query'
import type { FeedRange } from '@/lib/robinhood/feed'

export interface NvdaPriceResponse {
  range: FeedRange
  points: Array<{ time: number; price: number }>
  last: { time: number; price: number }
}

export function useRobinhoodNvdaPrice(range: FeedRange) {
  return useQuery<NvdaPriceResponse>({
    queryKey: ['robinhood', 'nvda-price', range],
    queryFn: async () => {
      const res = await fetch(`/api/robinhood/nvda-price?range=${range}`)
      if (!res.ok) throw new Error('price_history_unavailable')
      return (await res.json()) as NvdaPriceResponse
    },
    staleTime: 20_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    placeholderData: (prev) => prev,
  })
}

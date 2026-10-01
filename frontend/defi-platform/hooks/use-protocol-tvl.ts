import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FEATURE_FLAGS } from '@/config/featureFlags'
import { useAccount } from 'wagmi'
import { useEffect, useRef } from 'react'

export interface ChainTVLData {
  chainId: number
  totalTVL: number
  totalMarketSize: number
  lastUpdated: string | null
}

interface ProtocolTVLData {
  totalTVL: number
  totalMarketSize: number
  chains?: ChainTVLData[]
  isLoading: boolean
  error: string | null
}

export function useProtocolTVL(): ProtocolTVLData {
  const { chainId } = useAccount()
  const queryClient = useQueryClient()

  const { data, isLoading, error } = useQuery({
    queryKey: ['protocol-tvl'],
    queryFn: async () => {
      const url = '/api/tvl'
      const response = await fetch(url)
      
      if (!response.ok) {
        throw new Error(`Failed to fetch TVL: ${response.statusText}`)
      }
      
      return await response.json()
    },
    staleTime: 30000, // 30 seconds
    refetchInterval: FEATURE_FLAGS.LIVE_MARKET_REFRESH ? 30000 : 60000,
    refetchOnWindowFocus: false, // Don't refetch on window focus to reduce load
  })

  const queryClientRef = useRef(queryClient)
  useEffect(() => { queryClientRef.current = queryClient }, [queryClient])

  // Restore snappy feel: refresh on successful transaction
  useEffect(() => {
    let pending: ReturnType<typeof setTimeout> | null = null
    const handler = () => {
      if (pending) clearTimeout(pending)
      pending = setTimeout(() => {
        queryClientRef.current.invalidateQueries({ queryKey: ['protocol-tvl'] })
      }, 1000)
    }
    window.addEventListener('peridot:tx-success', handler)
    return () => {
      window.removeEventListener('peridot:tx-success', handler)
      if (pending) clearTimeout(pending)
    }
  }, []) // stable — queryClient accessed via ref

  return {
    totalTVL: data?.totalTVL || 0,
    totalMarketSize: data?.totalMarketSize || data?.totalTVL || 0,
    chains: data?.chains || [],
    isLoading,
    error: error instanceof Error ? error.message : (error ? String(error) : null)
  }
}

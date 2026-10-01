import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useActiveWallet } from '@/hooks/use-active-wallet'
import { useAuthedFetch } from '@/hooks/use-authed-fetch'
import { useEffect, useRef } from 'react'
import { useStellarOnly } from '@/config/stellarOnly'

export interface EarningsData {
  totalLifetimeEarnings: number
  /** Lifetime interest scaled to a 30-day average. */
  monthlyEarnings: number
  /** Interest that actually accrued in the last 30 days. */
  earnings30d?: number
  dailyAverageEarnings: number
  effectiveApy: number
  portfolioGrowth24h: number
  portfolioGrowth7d: number
  portfolioGrowth30d: number
  portfolioGrowth90d?: number
  portfolioGrowth180d?: number
  portfolioGrowth365d?: number
  portfolioGrowth24hPercent: number
  portfolioGrowth7dPercent: number
  portfolioGrowth30dPercent: number
  portfolioGrowth90dPercent?: number
  portfolioGrowth180dPercent?: number
  portfolioGrowth365dPercent?: number
  currentPortfolioValue: number
  totalSuppliedAmount?: number
  totalRedeemedAmount?: number
  actualCashEarned?: number
  unrealizedGains?: number
  realizedGains?: number
  totalROI?: number
  actualCapitalInvested?: number
  netInvestedAmount?: number
  earningsBreakdown: EarningsBreakdown[]
  achievements: Achievement[]
  goals: EarningsGoal[]
  earningsHistory: EarningsHistoryPoint[]
  perTokenBreakdown?: PerTokenBreakdown[]
  /**
   * `true` when the server's live multicall read failed on the most recent
   * computation. UI should keep its previous chart instead of replacing
   * with this turn's payload, and surface a quiet sync-in-progress hint.
   * See `app/api/user/earnings/route.ts` + `lib/agents/anchored-history.ts`.
   */
  degradedMode?: boolean
  isLoading: boolean
  error: string | null
}

export interface EarningsBreakdown {
  source: string
  amount: number
  percentage: number
  color: string
}

export interface Achievement {
  id: string
  title: string
  description: string
  achieved: boolean
  date?: string
  progress?: number
  maxProgress?: number
}

export interface EarningsGoal {
  id: string
  title: string
  current: number
  target: number
  unit: string
  progress: number
  description: string
}

export interface EarningsHistoryPoint {
  date: string
  earnings: number
  cumulativeEarnings: number
  portfolioValue: number
  timestamp: number
}

export interface PerTokenBreakdown {
  tokenSymbol: string
  chainId: number
  totalSupplied: number
  totalRedeemed: number
  currentSupply: number
  earnings: number
  firstSupplyDate: string
  currentApy: number
  entryDate: string
}

export function usePortfolioEarnings() {
  const { address } = useActiveWallet()
  const { authedFetch, authReady } = useAuthedFetch()
  const queryClient = useQueryClient()
  // The public host shows Stellar markets only (config/stellarOnly.ts). Ask
  // the API for the same scope, or the analytics total counts EVM positions
  // that no other number on the page can see.
  const stellarOnly = useStellarOnly()
  const scope = stellarOnly ? 'stellar' : 'all'

  const { data, isLoading, error } = useQuery({
    queryKey: ['portfolio-earnings', address, scope],
    queryFn: async () => {
      if (!address) return null

      const response = await authedFetch(`/api/user/earnings?address=${address}&scope=${scope}`)
      if (!response.ok) {
        throw new Error('Failed to fetch earnings data')
      }
      
      const result = await response.json()
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch earnings data')
      }
      
      return result.data
    },
    enabled: !!address && authReady,
    staleTime: 60 * 1000, // 1 minute — short enough to retry quickly if we got a stale 0
    retry: 2,
    retryDelay: 1500,
    refetchOnWindowFocus: false,
  })

  const addressRef = useRef(address)
  useEffect(() => { addressRef.current = address }, [address])
  const queryClientRef = useRef(queryClient)
  useEffect(() => { queryClientRef.current = queryClient }, [queryClient])

  // Restore snappy feel: refresh on successful transaction
  useEffect(() => {
    let pending: ReturnType<typeof setTimeout> | null = null
    const handler = () => {
      if (pending) clearTimeout(pending)
      pending = setTimeout(() => {
        const addr = addressRef.current
        if (addr) queryClientRef.current.invalidateQueries({ queryKey: ['portfolio-earnings', addr] })
      }, 1000)
    }
    window.addEventListener('peridot:tx-success', handler)
    return () => {
      window.removeEventListener('peridot:tx-success', handler)
      if (pending) clearTimeout(pending)
    }
  }, []) // stable — address/queryClient accessed via refs

  // Default empty state matches the previous initial state
  const emptyState = {
    totalLifetimeEarnings: 0,
    monthlyEarnings: 0,
    dailyAverageEarnings: 0,
    effectiveApy: 0,
    portfolioGrowth24h: 0,
    portfolioGrowth7d: 0,
    portfolioGrowth30d: 0,
    earningsBreakdown: [],
    achievements: [],
    goals: [],
    earningsHistory: [],
    perTokenBreakdown: [],
    degradedMode: false,
  }

  // If loading and no data, show loading state with empty data
  // If data exists (even if refetching), show data
  const resultData = data || emptyState

  return {
    ...resultData,
    isLoading: isLoading && !data && !!address, // Loading only while RQ is actively fetching and we have an address but no data yet
    error: error instanceof Error ? error.message : (error ? String(error) : null)
  }
}

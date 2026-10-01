import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { isEvmAddress } from '@/config/contracts'
import { useAuthedFetch } from '@/hooks/use-authed-fetch'

const STELLAR_ACCOUNT_RE = /^G[A-Z2-7]{55}$/

/** Wallets the points system can score: EVM hex or a Stellar account. */
function isPointsWallet(addr: string): boolean {
  return isEvmAddress(addr) || STELLAR_ACCOUNT_RE.test(addr.toUpperCase())
}

export interface LeaderboardParams {
  wallet?: string
  period?: '1d' | '7d' | '30d' | 'all'
  limit?: number
  offset?: number
}

export const LEADERBOARD_QUERY_KEY = 'leaderboard-aggregate'
export const LEADERBOARD_BREAKDOWN_KEY = 'leaderboard-breakdown'

export function useLeaderboard(params: LeaderboardParams) {
  const queryClient = useQueryClient()
  const { authedFetch, authReady } = useAuthedFetch()
  const listQs = new URLSearchParams()
  if (params.period) listQs.append('period', params.period)
  if (params.limit) listQs.append('limit', params.limit.toString())
  if (params.offset) listQs.append('offset', params.offset.toString())

  const userQs = new URLSearchParams()
  if (params.wallet) userQs.append('wallet', params.wallet)
  if (params.period) userQs.append('period', params.period)

  const query = useQuery({
    queryKey: [LEADERBOARD_QUERY_KEY, params, authReady],
    queryFn: async () => {
      // Fetch list and user data in parallel
      // The list is public; /api/user/me is private (auth-gated) — only fetch
      // the user's own row once the Privy token is ready. A null userRes just
      // means the public list renders without the personal row, which the
      // merge below already handles gracefully.
      const [listRes, userRes] = await Promise.all([
        fetch(`/api/leaderboard/list?${listQs.toString()}`),
        // EVM or Stellar: Stellar txs earn points too (verify-stellar writes
        // them onto the G-address row), so gating this on `isEvmAddress` was
        // what kept a Stellar user's own points and rank off their screen.
        params.wallet && isPointsWallet(params.wallet) && authReady
          ? authedFetch(`/api/user/me?${userQs.toString()}`).catch(() => null)
          : Promise.resolve(null)
      ])

      if (!listRes.ok) {
        throw new Error('Failed to fetch leaderboard list')
      }

      const listData = await listRes.json()
      let userData = null

      if (userRes) {
        if (!userRes.ok) {
           // If user fetch fails, we can still return the list, but log error
           console.error('Failed to fetch user data')
        } else {
           userData = await userRes.json()
        }
      }

      // Merge data to match previous aggregate response structure for compatibility
      return {
        leaderboard: listData.leaderboard || [],
        stats: listData.stats || null,
        pagination: listData.pagination,
        user: userData?.user || null,
        transactions: userData?.transactions || [],
        profile: userData?.profile || null,
        referral: userData?.referral || null,
        dailyLogin: userData?.dailyLogin || null,
      }
    },
    // The list API is cached for 30s public, user data is private
    staleTime: 30000, 
    gcTime: 10 * 60 * 1000,
  })

  const leaderboardQcRef = useRef(queryClient)
  useEffect(() => { leaderboardQcRef.current = queryClient }, [queryClient])

  // Refresh on successful transaction
  useEffect(() => {
    let pending: ReturnType<typeof setTimeout> | null = null
    const handler = () => {
      if (pending) clearTimeout(pending)
      pending = setTimeout(() => {
        leaderboardQcRef.current.invalidateQueries({ queryKey: [LEADERBOARD_QUERY_KEY] })
      }, 1000)
    }
    window.addEventListener('peridot:tx-success', handler)
    return () => {
      window.removeEventListener('peridot:tx-success', handler)
      if (pending) clearTimeout(pending)
    }
  }, []) // stable — queryClient accessed via ref

  return query
}

export function useLeaderboardBreakdown(wallet?: string) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: [LEADERBOARD_BREAKDOWN_KEY, wallet],
    queryFn: async () => {
      if (!wallet) return null
      const res = await fetch(`/api/leaderboard/breakdown?wallet=${wallet}`)
      if (!res.ok) {
        throw new Error('Failed to fetch leaderboard breakdown')
      }
      return res.json()
    },
    enabled: !!wallet && isPointsWallet(wallet),
    staleTime: 60000,
  })

  const breakdownQcRef = useRef(queryClient)
  useEffect(() => { breakdownQcRef.current = queryClient }, [queryClient])
  const walletRef = useRef(wallet)
  useEffect(() => { walletRef.current = wallet }, [wallet])

  // Refresh on successful transaction
  useEffect(() => {
    let pending: ReturnType<typeof setTimeout> | null = null
    const handler = () => {
      if (!walletRef.current) return
      if (pending) clearTimeout(pending)
      pending = setTimeout(() => {
        if (walletRef.current) {
          breakdownQcRef.current.invalidateQueries({ queryKey: [LEADERBOARD_BREAKDOWN_KEY, walletRef.current] })
        }
      }, 1000)
    }
    window.addEventListener('peridot:tx-success', handler)
    return () => {
      window.removeEventListener('peridot:tx-success', handler)
      if (pending) clearTimeout(pending)
    }
  }, []) // stable — wallet/queryClient accessed via refs

  return query
}

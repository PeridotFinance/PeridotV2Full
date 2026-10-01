'use client'

/**
 * use-robinhood-margin-account
 *
 * One wallet's Robinhood margin footing: USDG/NVDA/pToken balances, the six
 * allowances the flows need, free and locked vault margin, and unsettled fee
 * rewards. One Multicall3 round-trip every 15s while the tab is visible.
 *
 * The address defaults to the connected wagmi account, but a caller can pass
 * one explicitly (the keeper, a support view). No address means no query.
 */
import { useQuery } from '@tanstack/react-query'
import { useAccount } from 'wagmi'
import type { Address } from 'viem'
import { getRobinhoodPublicClient } from '@/lib/robinhood/client'
import { useRobinhoodRefreshListener } from './use-robinhood-refresh'
import { readRobinhoodAccountState } from '@/lib/robinhood/reads'

export const robinhoodAccountQueryKey = (user: string | undefined) =>
  ['robinhood', 'margin', 'account', user?.toLowerCase() ?? null] as const

const REFRESH_MS = 15_000

export function useRobinhoodMarginAccount(
  options: { address?: Address; enabled?: boolean; refetchMs?: number } = {},
) {
  const { address: connected } = useAccount()
  const user = options.address ?? connected
  useRobinhoodRefreshListener()
  const query = useQuery({
    queryKey: robinhoodAccountQueryKey(user),
    queryFn: () => readRobinhoodAccountState(getRobinhoodPublicClient(), user as Address),
    enabled: (options.enabled ?? true) && !!user,
    staleTime: 8_000,
    refetchInterval: options.refetchMs ?? REFRESH_MS,
    refetchIntervalInBackground: false,
    retry: 1,
  })
  return {
    user,
    account: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    dataUpdatedAt: query.dataUpdatedAt,
  }
}

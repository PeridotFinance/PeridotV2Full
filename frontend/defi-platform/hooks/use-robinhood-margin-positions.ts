'use client'

/**
 * use-robinhood-margin-positions
 *
 * The wallet's positions on the Robinhood executor, with live risk metrics.
 * Discovery is either a bounded enumeration below `nextPositionId` (the
 * canary has a handful of ids) or a paginated PositionOpened log scan from
 * the executor's deploy block, chosen in lib/robinhood/reads.ts. Hydration is
 * one multicall for the structs and one for metrics, debt and shares.
 *
 * Refresh: 15s while visible, and on demand through `requestRobinhoodRefresh`
 * after any confirmed transaction, so a fresh open does not wait a cycle.
 * A `riskUnavailable` position is shown as "risk unavailable", never as
 * health 0 (guide section 4), and the hook carries that through untouched.
 */
import { useQuery } from '@tanstack/react-query'
import { useAccount } from 'wagmi'
import type { Address } from 'viem'
import { getRobinhoodPublicClient } from '@/lib/robinhood/client'
import { readRobinhoodPositions, type RobinhoodPosition } from '@/lib/robinhood/reads'
import { useRobinhoodMarginMarket } from './use-robinhood-margin-market'
import { useRobinhoodRefreshListener } from './use-robinhood-refresh'

export const robinhoodPositionsQueryKey = (user: string | undefined) =>
  ['robinhood', 'margin', 'positions', user?.toLowerCase() ?? null] as const

const REFRESH_MS = 15_000

export { ROBINHOOD_REFRESH_EVENT, requestRobinhoodRefresh } from './use-robinhood-refresh'

export function useRobinhoodMarginPositions(
  options: { address?: Address; enabled?: boolean; refetchMs?: number; includeClosed?: boolean } = {},
) {
  const { address: connected } = useAccount()
  const user = options.address ?? connected
  const { market } = useRobinhoodMarginMarket({ enabled: options.enabled ?? true })

  const query = useQuery({
    queryKey: robinhoodPositionsQueryKey(user),
    queryFn: () =>
      readRobinhoodPositions(getRobinhoodPublicClient(), user as Address, {
        nextPositionId: market?.nextPositionId ?? undefined,
        exchangeRates: market
          ? { pUSDG: market.markets.pUSDG.exchangeRate, pNVDA: market.markets.pNVDA.exchangeRate }
          : undefined,
      }),
    enabled: (options.enabled ?? true) && !!user,
    staleTime: 8_000,
    refetchInterval: options.refetchMs ?? REFRESH_MS,
    refetchIntervalInBackground: false,
    retry: 1,
  })

  useRobinhoodRefreshListener()

  const all: RobinhoodPosition[] = query.data?.positions ?? []
  const open = all.filter((p) => p.status >= 1 && p.status <= 4)
  const closed = all.filter((p) => p.status >= 5)

  return {
    user,
    positions: options.includeClosed ? all : open,
    openPositions: open,
    closedPositions: closed,
    discovery: query.data?.discovery,
    failures: query.data?.failures ?? [],
    blockNumber: query.data?.blockNumber,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    dataUpdatedAt: query.dataUpdatedAt,
  }
}

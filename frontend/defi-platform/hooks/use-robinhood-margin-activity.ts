'use client'

/**
 * The wallet's Robinhood margin history (chain events from
 * /api/robinhood/activity) folded into per-position ledgers, history rows and
 * totals (lib/robinhood/activity.ts). Live equity for open positions comes
 * from the positions hook, so unrealized P&L moves with the 15s position
 * refresh while the event list itself only has to change when something
 * happens on chain.
 */
import { useEffect, useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAccount } from 'wagmi'
import {
  buildRobinhoodHistory,
  buildRobinhoodLedgers,
  summarizeRobinhoodLedgers,
  type RobinhoodIndexedEvent,
} from '@/lib/robinhood/activity'
import type { RobinhoodMarketState, RobinhoodPosition } from '@/lib/robinhood/reads'
import { ROBINHOOD_REFRESH_EVENT, useRobinhoodRefreshListener } from './use-robinhood-refresh'

/** After our own confirmed tx, ask the server for a fresh scan for this long. */
const FRESH_WINDOW_MS = 30_000

export const robinhoodActivityQueryKey = (user: string | undefined) =>
  ['robinhood', 'margin', 'activity', user?.toLowerCase() ?? null] as const

export function useRobinhoodMarginActivity(
  positions: RobinhoodPosition[],
  market: RobinhoodMarketState | undefined,
) {
  const { address } = useAccount()
  const refreshedAt = useRef(0)
  useEffect(() => {
    const mark = () => {
      refreshedAt.current = Date.now()
    }
    window.addEventListener(ROBINHOOD_REFRESH_EVENT, mark)
    return () => window.removeEventListener(ROBINHOOD_REFRESH_EVENT, mark)
  }, [])
  const query = useQuery<{ events: RobinhoodIndexedEvent[] }>({
    queryKey: robinhoodActivityQueryKey(address),
    queryFn: async () => {
      const fresh = Date.now() - refreshedAt.current < FRESH_WINDOW_MS ? '&fresh=1' : ''
      const res = await fetch(`/api/robinhood/activity?user=${address}${fresh}`)
      if (!res.ok) throw new Error('history_unavailable')
      return (await res.json()) as { events: RobinhoodIndexedEvent[] }
    },
    enabled: !!address,
    staleTime: 10_000,
    refetchInterval: 20_000,
    refetchIntervalInBackground: false,
    retry: 1,
  })
  useRobinhoodRefreshListener()

  const pUSDG = market?.markets.pUSDG.exchangeRate ?? null
  const pNVDA = market?.markets.pNVDA.exchangeRate ?? null

  return useMemo(() => {
    const events = query.data?.events ?? []
    const rates = { pUSDG, pNVDA }
    const ledgers = buildRobinhoodLedgers(events, positions, rates)
    return {
      events,
      ledgers,
      history: buildRobinhoodHistory(events, ledgers, rates),
      summary: summarizeRobinhoodLedgers(ledgers.values()),
      isLoading: query.isLoading,
      isError: query.isError,
      refetch: query.refetch,
    }
  }, [query.data, query.isLoading, query.isError, query.refetch, positions, pUSDG, pNVDA])
}

'use client'

/**
 * use-robinhood-margin-market
 *
 * The wallet-independent picture of the Robinhood NVDA/USDG margin product:
 * open gate, fees, pair risk, oracle priceability and prices, flash capacity,
 * market cash and exchange rates. One Multicall3 round-trip every 20s while a
 * tab is visible. Every consumer shares the same React Query entry, so a page
 * with five widgets still costs one read.
 *
 * Availability is per action (guide section 4): `opensPaused` only gates
 * opening; a stale price only gates the swap-based actions. The derived
 * `availability` block spells that out so no component re-derives it.
 */
import { useQuery } from '@tanstack/react-query'
import { getRobinhoodPublicClient } from '@/lib/robinhood/client'
import { useRobinhoodRefreshListener } from './use-robinhood-refresh'
import { readRobinhoodMarketState, type RobinhoodMarketState } from '@/lib/robinhood/reads'

export const ROBINHOOD_MARKET_QUERY_KEY = ['robinhood', 'margin', 'market'] as const

const REFRESH_MS = 20_000

export interface RobinhoodMarketAvailability {
  /** Both markets priceable and both prices read. Required for open, close, addCollateral. */
  pricesAvailable: boolean
  /** Opens not paused, pair enabled, margin accepted, flash live, prices live. */
  canOpenLong: boolean
  canOpenShort: boolean
  /** Prices live: the normal close path can be quoted. */
  canClose: boolean
  /** Repayment with underlying never needs a price; only the read itself can fail. */
  canRepay: boolean
  /** Every read in the batch failed: treat the chain as unreachable. */
  unreachable: boolean
}

export function deriveRobinhoodAvailability(state: RobinhoodMarketState | undefined): RobinhoodMarketAvailability {
  if (!state) {
    return { pricesAvailable: false, canOpenLong: false, canOpenShort: false, canClose: false, canRepay: false, unreachable: true }
  }
  const pricesAvailable =
    state.prices.usdg.priceUsd18 !== null && state.prices.nvda.priceUsd18 !== null
  const openBase =
    state.opensPaused === false &&
    state.marginAccepted === true &&
    state.flash.paused === false &&
    pricesAvailable
  const canOpenLong =
    openBase && state.pairRisk.long?.enabled === true && (state.flash.maxUsdg ?? 0n) > 0n
  const canOpenShort =
    openBase && state.pairRisk.short?.enabled === true && (state.flash.maxNvda ?? 0n) > 0n
  const unreachable = state.failures.length >= 19
  return {
    pricesAvailable,
    canOpenLong,
    canOpenShort,
    canClose: pricesAvailable && state.flash.paused === false,
    canRepay: !unreachable,
    unreachable,
  }
}

export function useRobinhoodMarginMarket(options: { enabled?: boolean; refetchMs?: number } = {}) {
  useRobinhoodRefreshListener()
  const query = useQuery({
    queryKey: ROBINHOOD_MARKET_QUERY_KEY,
    queryFn: () => readRobinhoodMarketState(getRobinhoodPublicClient()),
    enabled: options.enabled ?? true,
    staleTime: 10_000,
    refetchInterval: options.refetchMs ?? REFRESH_MS,
    refetchIntervalInBackground: false,
    retry: 1,
  })
  return {
    market: query.data,
    availability: deriveRobinhoodAvailability(query.data),
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    dataUpdatedAt: query.dataUpdatedAt,
  }
}

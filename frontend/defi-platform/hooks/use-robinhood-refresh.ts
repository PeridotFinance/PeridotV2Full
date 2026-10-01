'use client'

/**
 * One refresh signal for every Robinhood reader. Any flow that changed chain
 * state (a confirmed approval, mint, deposit or open) fires
 * `requestRobinhoodRefresh()`, and each mounted reader invalidates the whole
 * `['robinhood','margin']` and `['robinhood','lending']` families, so a deposit
 * form without a positions list still sees its new free margin at once, and a
 * lending supply shows up in the margin page's pUSDG balance (same market).
 */
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'

export const ROBINHOOD_REFRESH_EVENT = 'peridot:robinhood-refresh'

export function requestRobinhoodRefresh(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(ROBINHOOD_REFRESH_EVENT))
}

export function useRobinhoodRefreshListener(): void {
  const queryClient = useQueryClient()
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onRefresh = () => {
      queryClient.invalidateQueries({ queryKey: ['robinhood', 'margin'] })
      queryClient.invalidateQueries({ queryKey: ['robinhood', 'lending'] })
    }
    window.addEventListener(ROBINHOOD_REFRESH_EVENT, onRefresh)
    return () => window.removeEventListener(ROBINHOOD_REFRESH_EVENT, onRefresh)
  }, [queryClient])
}

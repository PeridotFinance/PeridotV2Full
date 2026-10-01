"use client"

import { useCallback, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  STELLAR_MAX_ENTERED_MARKETS_FOR_BORROW,
  stellarExitMarket,
  stellarGetBorrowBalance,
  stellarGetPtokenBalance,
  stellarGetUserMarkets,
} from "@/lib/stellar-soroban-lending"
import { stellarSorobanMainnetContracts } from "@/config/contracts"
import { STELLAR_PORTFOLIO_POSITIONS_QUERY_KEY } from "@/hooks/use-stellar-portfolio-positions"

export const STELLAR_MARKET_SLOTS_QUERY_KEY = "stellar-market-slots"

export interface StellarMarketSlot {
  vaultId: string
  symbol: string
  /** Entered and still holding something, so it cannot be left yet. */
  hasBalance: boolean
}

/**
 * How many Peridot markets this Stellar account is *entered* into, and which of
 * those it could leave right now.
 *
 * Entering a market is what costs the controller compute on every borrow-side
 * read, and the cost does not go away when the balance does: a market entered
 * once and emptied later still gets its full pass through the liquidity loop.
 * Past {@link STELLAR_MAX_ENTERED_MARKETS_FOR_BORROW} the loop no longer fits in
 * a Soroban transaction, and every borrow number the app shows is unreadable
 * rather than zero.
 *
 * Deliberately reads the *entered* set (`get_user_markets`) rather than the
 * funded one. The surfaces that keyed their warning on funded markets never
 * warned the users who are actually stuck: an account can be entered in three
 * markets while holding a balance in one.
 */
export function useStellarMarketSlots(address: string | null | undefined) {
  const queryClient = useQueryClient()
  const [isLeaving, setIsLeaving] = useState(false)
  const [leaveError, setLeaveError] = useState<string | null>(null)

  const query = useQuery({
    queryKey: [STELLAR_MARKET_SLOTS_QUERY_KEY, address || ""],
    enabled: Boolean(address),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<StellarMarketSlot[]> => {
      if (!address) return []
      const entered = await stellarGetUserMarkets(address)
      if (!entered.length) return []
      const symbolByVault = new Map<string, string>(
        Object.values(stellarSorobanMainnetContracts.markets).map(
          (m) => [m.vaultId, m.symbol] as [string, string],
        ),
      )
      return Promise.all(
        entered.map(async (vaultId) => {
          const [ptoken, debt] = await Promise.all([
            stellarGetPtokenBalance(vaultId, address),
            stellarGetBorrowBalance(vaultId, address),
          ])
          const toBig = (v: string) => {
            try {
              return BigInt(v)
            } catch {
              // An unreadable balance must read as "occupied", never as empty:
              // offering to leave a market we could not check would hand the
              // user a transaction the contract rejects.
              return BigInt(1)
            }
          }
          return {
            vaultId,
            symbol: symbolByVault.get(vaultId) ?? "market",
            hasBalance: toBig(ptoken) > BigInt(0) || toBig(debt) > BigInt(0),
          }
        }),
      )
    },
  })

  const slots = query.data ?? []
  const emptySlots = useMemo(() => slots.filter((s) => !s.hasBalance), [slots])

  /**
   * Leave every entered market that holds nothing, one signature each.
   *
   * Stops at the first failure rather than pushing on: each exit is a separate
   * wallet prompt, and a user who declined one has not agreed to the next.
   */
  const leaveEmptyMarkets = useCallback(async () => {
    if (!address || !emptySlots.length) return
    setIsLeaving(true)
    setLeaveError(null)
    try {
      for (const slot of emptySlots) {
        await stellarExitMarket(address, slot.vaultId)
      }
    } catch (err) {
      setLeaveError(err instanceof Error ? err.message : "Could not leave the market")
    } finally {
      setIsLeaving(false)
      queryClient.invalidateQueries({ queryKey: [STELLAR_MARKET_SLOTS_QUERY_KEY] })
      queryClient.invalidateQueries({ queryKey: [STELLAR_PORTFOLIO_POSITIONS_QUERY_KEY] })
      queryClient.invalidateQueries({ queryKey: ["stellar-borrow-capacity-usd"] })
      queryClient.invalidateQueries({ queryKey: ["stellar-preview-borrow-max"] })
    }
  }, [address, emptySlots, queryClient])

  return {
    slots,
    enteredCount: slots.length,
    /** Entered in more markets than the controller can price in one transaction. */
    tooManyMarkets: slots.length > STELLAR_MAX_ENTERED_MARKETS_FOR_BORROW,
    /** Markets that can be left right now (nothing supplied, nothing borrowed). */
    emptySlots,
    /** Markets that still hold something, so they must be emptied before leaving. */
    occupiedSlots: useMemo(() => slots.filter((s) => s.hasBalance), [slots]),
    isLoading: query.isLoading,
    leaveEmptyMarkets,
    isLeaving,
    leaveError,
    refetch: query.refetch,
  }
}

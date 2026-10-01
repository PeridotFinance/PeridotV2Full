"use client"

import { useCallback } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { usePrivy } from "@privy-io/react-auth"
import { FEATURE_FLAGS } from "@/config/featureFlags"

/**
 * Client hook for the user's registered Bridge payout destination — the
 * Stellar G-address that incoming SEPA deposits are auto-forwarded to.
 *
 * The UI needs two pieces of state cheaply:
 *   - "has the user set a payout address yet?" (drives the custody-warning
 *     banner + the withdraw button label)
 *   - "is auto-forward on?" (drives the future settings toggle)
 *
 * Returns null `address` for users with no Bridge customer (404'd by the
 * route) — same shape as "address not set yet", so callers stay branch-free.
 */

export interface BridgePayoutAddress {
  address: string | null
  setAt: string | null
  autoForwardEnabled: boolean
}

const ZERO: BridgePayoutAddress = {
  address: null,
  setAt: null,
  autoForwardEnabled: true,
}

const KEY = ["bridge-onramp", "payout-address"]

async function fetchPayoutAddress(token: string | null): Promise<BridgePayoutAddress> {
  const res = await fetch("/api/bridge/payout-address", {
    credentials: "include",
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  })
  if (res.status === 401 || res.status === 404) return ZERO
  if (!res.ok) throw new Error(`Payout address request failed: ${res.status}`)
  return (await res.json()) as BridgePayoutAddress
}

export interface UseBridgePayoutAddress extends BridgePayoutAddress {
  isLoading: boolean
  refresh: () => void
}

export function useBridgePayoutAddress(enabled = true): UseBridgePayoutAddress {
  const { getAccessToken, authenticated } = usePrivy()
  const queryClient = useQueryClient()

  const token = useCallback(
    () => getAccessToken().catch(() => null),
    [getAccessToken],
  )

  const query = useQuery<BridgePayoutAddress>({
    queryKey: KEY,
    enabled: enabled && FEATURE_FLAGS.FIAT_ONRAMP_BRIDGE && authenticated,
    queryFn: async () => fetchPayoutAddress(await token()),
    staleTime: 60_000,
    // Refetch on focus so the banner clears immediately after the user links
    // a Stellar wallet in another tab.
    refetchOnWindowFocus: true,
  })

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: KEY })
  }, [queryClient])

  const data = query.data ?? ZERO
  return {
    address: data.address,
    setAt: data.setAt,
    autoForwardEnabled: data.autoForwardEnabled,
    isLoading: query.isLoading,
    refresh,
  }
}

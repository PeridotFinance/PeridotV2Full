"use client"

import { useCallback, useEffect, useRef } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { usePrivy } from "@privy-io/react-auth"
import { toast } from "sonner"
import { FEATURE_FLAGS } from "@/config/featureFlags"

/**
 * Client hook for the authenticated user's Euro balance held by Bridge.
 *
 * The shape deliberately mirrors what the UI needs to render, not the
 * underlying on-chain reality: `available` (€ that can be spent), `pending`
 * (€ on its way). The on-ramp sheet's state machine is intentionally not part
 * of this hook — for "you have €X" you only need the number.
 */

export interface BridgeAutoPayout {
  id: string
  amount: string
  /** Stablecoin the payout delivered ("eurc" | "usdc"); may be null on legacy rows. */
  currency: string | null
  createdAt: string
  status: string
}

interface PerAsset {
  available: number
  pending: number
}

export interface BridgeBalance {
  /** EURC on the Bridge-managed Stellar wallet + EURC-routed SEPA in-flight. */
  eurc: PerAsset
  /** USDC on the same wallet (post EUR→USDC FX) + USDC-routed SEPA in-flight. */
  usdc: PerAsset
  // Legacy EUR-only shape — mirrors `eurc` so existing readers keep working.
  available: number
  pending: number
  currency: "EUR"
  walletAddress: string | null
  lastAutoPayout: BridgeAutoPayout | null
}

const ZERO_ASSET: PerAsset = { available: 0, pending: 0 }
const ZERO: BridgeBalance = {
  eurc: ZERO_ASSET,
  usdc: ZERO_ASSET,
  available: 0,
  pending: 0,
  currency: "EUR",
  walletAddress: null,
  lastAutoPayout: null,
}

const BALANCE_KEY = ["bridge-onramp", "balance"]

async function fetchBalance(token: string | null): Promise<BridgeBalance> {
  const res = await fetch("/api/bridge/balance", {
    credentials: "include",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  if (res.status === 401 || res.status === 404) return ZERO
  if (!res.ok) throw new Error(`Balance request failed: ${res.status}`)
  return (await res.json()) as BridgeBalance
}

export interface UseBridgeBalance extends BridgeBalance {
  /** True the first time we don't yet know the answer. */
  isLoading: boolean
  /** True for background re-fetches; render a subtle "syncing" affordance. */
  isFetching: boolean
  /** Force a refresh — e.g. after the user finishes a deposit elsewhere. */
  refresh: () => void
}

export function useBridgeBalance(enabled = true): UseBridgeBalance {
  const { getAccessToken, authenticated } = usePrivy()
  const queryClient = useQueryClient()

  const token = useCallback(
    () => getAccessToken().catch(() => null),
    [getAccessToken],
  )

  const query = useQuery<BridgeBalance>({
    queryKey: BALANCE_KEY,
    enabled: enabled && FEATURE_FLAGS.FIAT_ONRAMP_BRIDGE && authenticated,
    queryFn: async () => fetchBalance(await token()),
    staleTime: 20_000,
    // Slow background poll so the balance ticks up after a SEPA settles even
    // if no webhook fires (e.g. local dev with the webhook disabled).
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  })

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: BALANCE_KEY })
  }, [queryClient])

  // Surface auto-forward arrivals to the Stellar wallet. Tracks the last
  // payout id we've already announced so we toast exactly once per
  // server-side payout, even across re-mounts (the ref persists for the
  // life of the hook instance, and React Query keeps one cached entry).
  // First load is silent: a freshly-mounted hook can't tell whether a
  // payout it sees is "new" or just "the latest historical one".
  const data = query.data ?? ZERO
  const lastSeenId = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    const latest = data.lastAutoPayout
    if (latest === undefined) return
    if (lastSeenId.current === undefined) {
      lastSeenId.current = latest?.id ?? null
      return
    }
    if (latest && latest.id !== lastSeenId.current) {
      const amount = Number(latest.amount)
      const formatted = Number.isFinite(amount)
        ? amount.toLocaleString(undefined, { style: "currency", currency: "EUR" })
        : `€${latest.amount}`
      toast.success(`${formatted} landed in your Stellar wallet`, {
        description: "Auto-forwarded from your euro balance.",
      })
      lastSeenId.current = latest.id
    }
  }, [data.lastAutoPayout])

  return {
    eurc: data.eurc,
    usdc: data.usdc,
    available: data.available,
    pending: data.pending,
    currency: data.currency,
    walletAddress: data.walletAddress,
    lastAutoPayout: data.lastAutoPayout,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    refresh,
  }
}

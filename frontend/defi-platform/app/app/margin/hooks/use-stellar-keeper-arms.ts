"use client"

/**
 * use-stellar-keeper-arms — one shared read of the always-on arms.
 *
 * Everything that wants to say something about always-on (the chip in a position
 * row, the validity line in the TP/SL popover, the page notice) reads from here,
 * so they can never disagree about whether a position is covered.
 *
 * Deliberately a React Query cache, not prop-drilling: the popover mounts per
 * row and the notice sits at page level, and threading the same object down two
 * different trees is how `allowAlwaysOn` once arrived at the popover as
 * `undefined` and hid the toggle for everyone.
 *
 * Failure behaviour matters here. A failed read resolves to NO arms, and "no arm"
 * renders as "not covered" — the same class of bug as commit 47300aaf, where a
 * blank journal read silently showed every stop-loss as absent. So: throw on a
 * bad response, let React Query keep the last good data, and let the UI render
 * nothing rather than a false negative.
 */
import { useCallback } from "react"
import { useQuery } from "@tanstack/react-query"
import { usePrivy } from "@privy-io/react-auth"
import { useStellarWallet } from "@/hooks/use-stellar-wallet"
import { FEATURE_FLAGS } from "@/config/featureFlags"
import { describeKeeperArm, type KeeperArmState } from "../lib/keeperArmStatus"

export interface KeeperArmView {
  position_id: string
  side: "Long" | "Short"
  take_profit_usd: number | null
  stop_loss_usd: number | null
  valid_until_ledger: number
  status: string
  attempts: number
  last_error: string | null
  fired_kind: "tp" | "sl" | null
  fired_tx_hash: string | null
  arm_version: number
  has_cancel_entry: boolean
  created_at: string
  updated_at: string
}

interface KeeperInfo {
  enabled: boolean
  keeperPublicKey: string | null
  latestLedger: number | null
  arms: KeeperArmView[]
}

export interface KeeperArmsResult {
  /** Server keeper configured and reachable. */
  enabled: boolean
  keeperPublicKey: string | null
  latestLedger: number | null
  /** positionId → the arm row, whatever its status. */
  byPosition: Record<string, KeeperArmView>
  /** positionId → what to tell the trader about it. */
  stateFor: (positionId: string) => KeeperArmState | null
  /** Arms worth interrupting for (expired, needs re-check, fired, deferred). */
  notable: Array<{ arm: KeeperArmView; state: KeeperArmState }>
  isLoading: boolean
  refetch: () => void
}

const EMPTY: Record<string, KeeperArmView> = {}

export function useStellarKeeperArms(enabled = true): KeeperArmsResult {
  const { address } = useStellarWallet()
  const { getAccessToken } = usePrivy()
  const active = enabled && FEATURE_FLAGS.MARGIN_KEEPER_ALWAYS_ON && Boolean(address)

  const query = useQuery<KeeperInfo>({
    queryKey: ["margin", "keeper-arms", address],
    enabled: active,
    // The arms only change when the user arms something or the keeper acts, so a
    // minute is plenty — and the expiry countdown is measured in days.
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
    queryFn: async () => {
      const token = await getAccessToken()
      const res = await fetch(`/api/margin/keeper?address=${address}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) throw new Error(`keeper arms ${res.status}`)
      return (await res.json()) as KeeperInfo
    },
  })

  const arms = query.data?.arms ?? []
  const latestLedger = query.data?.latestLedger ?? null
  const byPosition = arms.length
    ? arms.reduce<Record<string, KeeperArmView>>((acc, a) => {
        // listKeeperArms is newest-first; keep the newest row per position.
        if (!acc[a.position_id]) acc[a.position_id] = a
        return acc
      }, {})
    : EMPTY

  const stateFor = useCallback(
    (positionId: string) => {
      const arm = byPosition[positionId]
      return arm ? describeKeeperArm(arm, latestLedger) : null
    },
    [byPosition, latestLedger],
  )

  const notable = arms
    .map((arm) => ({ arm, state: describeKeeperArm(arm, latestLedger) }))
    .filter((x) => x.state.notable)

  return {
    enabled: Boolean(query.data?.enabled),
    keeperPublicKey: query.data?.keeperPublicKey ?? null,
    latestLedger,
    byPosition,
    stateFor,
    notable,
    isLoading: query.isLoading,
    refetch: query.refetch,
  }
}

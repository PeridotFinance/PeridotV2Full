"use client"

/**
 * The user's cross-chain deposits, as the UI sees them.
 *
 * One query drives three surfaces: the progress row under the deposit sheet, the
 * "arrived but not invested" banner, and the history list. They must never
 * disagree about a transfer's state, so they share this hook rather than each
 * polling for itself.
 *
 * Polling cadence follows the work, not the clock: a transfer in flight is
 * checked every few seconds because the user is watching it, and a list with
 * nothing pending falls back to a slow refresh. The expensive part of the route
 * (the Horizon trustline read) is likewise only paid while something is pending.
 *
 * Two credentials, like the margin journal: a Privy bearer *or* the Stellar
 * wallet-session cookie. A Freighter user has no Privy session and never will.
 */

import { useCallback, useMemo } from "react"
import { usePrivy } from "@privy-io/react-auth"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import type { StellarWalletSource } from "@/hooks/use-stellar-wallet"
import { readPrivyToken } from "@/app/app/margin/hooks/use-stellar-margin-journal"
import type { CctpRecipientReadiness } from "@/lib/cctp/trustline"

export type CctpStatus =
  | "burned"
  | "attested"
  | "minted"
  | "supplied"
  | "dismissed"
  | "failed"

export interface CctpTransferRow {
  id: number
  sourceChainId: number
  amountUsdc: number
  burnTxHash: string
  mintTxHash: string | null
  supplyTxHash: string | null
  status: CctpStatus
  failReason: string | null
  createdAt: string
  updatedAt: string
}

interface ServerRow {
  id: number
  source_chain_id: number
  amount_usdc: number | string
  burn_tx_hash: string
  mint_tx_hash: string | null
  supply_tx_hash: string | null
  status: CctpStatus
  fail_reason: string | null
  created_at: string
  updated_at: string
}

function fromRow(r: ServerRow): CctpTransferRow {
  return {
    id: r.id,
    sourceChainId: Number(r.source_chain_id),
    // Postgres numeric arrives as a string through the driver; a silent NaN here
    // would render as "NaN USDC" on the one screen about the user's money.
    amountUsdc: Number(r.amount_usdc),
    burnTxHash: r.burn_tx_hash,
    mintTxHash: r.mint_tx_hash,
    supplyTxHash: r.supply_tx_hash,
    status: r.status,
    failReason: r.fail_reason,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

/** Still moving — the user is owed a live view of it. */
export function isCctpInFlight(t: CctpTransferRow): boolean {
  return t.status === "burned" || t.status === "attested"
}

/** Money has landed on Stellar and is waiting for the user to decide. */
export function isCctpAwaitingUser(t: CctpTransferRow): boolean {
  return t.status === "minted"
}

export interface UseCctpTransfers {
  transfers: CctpTransferRow[]
  inFlight: CctpTransferRow[]
  awaitingUser: CctpTransferRow[]
  /**
   * Why a pending mint cannot land, when something blocks it. `null` while
   * nothing is pending — absence of a blocker, not proof of readiness.
   */
  recipient: CctpRecipientReadiness | null
  isLoading: boolean
  refetch: () => void
  /** Nudge the relayer for one transfer instead of waiting for the cron. */
  advance: (burnTxHash: string) => Promise<void>
  /** Record that the user invested the arrived USDC. */
  markSupplied: (id: number, supplyTxHash: string) => Promise<boolean>
  /** Record that the user chose to leave it in the wallet. */
  dismiss: (id: number) => Promise<boolean>
}

export function useCctpTransfers(
  address: string | undefined | null,
  enabled: boolean,
  walletSource?: StellarWalletSource,
): UseCctpTransfers {
  const { getAccessToken } = usePrivy()
  const queryClient = useQueryClient()
  const isKitWallet = walletSource === "kit"
  const queryKey = useMemo(
    () => ["cctp-transfers", address, isKitWallet ? "kit" : "privy"],
    [address, isKitWallet],
  )

  const query = useQuery<{ transfers: CctpTransferRow[]; recipient: CctpRecipientReadiness | null }>({
    queryKey,
    enabled: enabled && Boolean(address),
    staleTime: 4_000,
    // Fast while the user is watching money move, slow once nothing is pending.
    refetchInterval: (q) =>
      (q.state.data?.transfers ?? []).some(isCctpInFlight) ? 8_000 : 60_000,
    queryFn: async () => {
      if (!address) throw new Error("cctp: no address")
      const token = await readPrivyToken(getAccessToken)
      if (!token && !isKitWallet) throw new Error("cctp: no auth token yet")
      const res = await fetch(`/api/cctp/transfers?address=${encodeURIComponent(address)}`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) throw new Error(`cctp: ${res.status}`)
      const json = (await res.json()) as {
        transfers: ServerRow[]
        recipient: CctpRecipientReadiness | null
      }
      return { transfers: (json.transfers ?? []).map(fromRow), recipient: json.recipient ?? null }
    },
    placeholderData: (prev) => prev,
    // An auth failure will not fix itself by asking again.
    retry: (n, err) => !/: 40[13]$/.test(String(err?.message)) && n < 3,
  })

  const transfers = query.data?.transfers ?? []

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey })
  }, [queryClient, queryKey])

  const authed = useCallback(
    async (url: string, init: RequestInit) => {
      const token = await readPrivyToken(getAccessToken)
      return fetch(url, {
        ...init,
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(init.headers as Record<string, string> | undefined),
        },
      })
    },
    [getAccessToken],
  )

  const advance = useCallback(
    async (burnTxHash: string) => {
      if (!address) return
      // Best-effort by design: the cron reaches every transfer within a minute,
      // so a failed nudge costs the user nothing but a slightly slower row. It
      // must never surface as an error on a deposit that is fine.
      await authed("/api/cctp/advance", {
        method: "POST",
        body: JSON.stringify({ stellarAddress: address, burnTxHash }),
      }).catch(() => null)
      invalidate()
    },
    [address, authed, invalidate],
  )

  const patch = useCallback(
    async (body: Record<string, unknown>): Promise<boolean> => {
      if (!address) return false
      const res = await authed("/api/cctp/transfers", {
        method: "PATCH",
        body: JSON.stringify({ stellarAddress: address, ...body }),
      }).catch(() => null)
      invalidate()
      // 409 means the row had already moved on — someone else recorded the same
      // outcome. The user's intent holds either way, so it is not a failure.
      return Boolean(res && (res.ok || res.status === 409))
    },
    [address, authed, invalidate],
  )

  return {
    transfers,
    inFlight: transfers.filter(isCctpInFlight),
    awaitingUser: transfers.filter(isCctpAwaitingUser),
    recipient: query.data?.recipient ?? null,
    isLoading: query.isLoading,
    refetch: invalidate,
    advance,
    markSupplied: (id, supplyTxHash) => patch({ id, action: "supplied", supplyTxHash }),
    dismiss: (id) => patch({ id, action: "dismissed" }),
  }
}

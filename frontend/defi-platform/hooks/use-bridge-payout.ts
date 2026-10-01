"use client"

import { useCallback, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { usePrivy } from "@privy-io/react-auth"
import { toast } from "sonner"

/**
 * Client hook for the "Withdraw to my Stellar wallet" button. Wraps
 * POST /api/bridge/payout and translates the orchestrator's structured
 * `skipped` reasons into user-facing toasts.
 *
 * `amount` is optional — omit to sweep the full available balance, pass a
 * decimal string for a partial withdrawal.
 */

export type BridgePayoutCurrency = "eurc" | "usdc"

export interface BridgePayoutOptions {
  /** Decimal-string amount; omit to sweep the full available balance. */
  amount?: string
  /** Stablecoin to withdraw — defaults to EURC. */
  currency?: BridgePayoutCurrency
}

export interface UseBridgePayout {
  isPending: boolean
  /** Trigger a withdrawal. Returns true on success, false otherwise. */
  withdraw: (opts?: BridgePayoutOptions | string) => Promise<boolean>
}

const SKIP_MESSAGES: Record<string, string> = {
  no_customer: "Start a bank transfer first to open a Bridge account.",
  no_custodial_wallet: "Your Bridge wallet isn't ready yet — finish KYC first.",
  no_payout_address: "Link your Stellar wallet first so we know where to send the money.",
  auto_forward_disabled: "Auto-forward is off — toggle it on or use this button manually.",
  kyc_not_approved: "Bridge is still reviewing your KYC. You'll be able to withdraw once it's approved.",
  sepa_not_approved: "Your SEPA endorsement is still pending. We'll notify you once it's active.",
  invalid_amount: "Enter a valid amount.",
  no_balance: "Nothing to withdraw right now.",
  already_paid: "This deposit was already forwarded.",
}

export function useBridgePayout(): UseBridgePayout {
  const { getAccessToken, authenticated } = usePrivy()
  const queryClient = useQueryClient()
  const [isPending, setIsPending] = useState(false)

  const withdraw = useCallback(
    async (opts?: BridgePayoutOptions | string): Promise<boolean> => {
      if (!authenticated) {
        toast.error("Sign in first to withdraw.")
        return false
      }
      // Back-compat: original signature accepted just `amount`.
      const options: BridgePayoutOptions =
        typeof opts === "string" ? { amount: opts } : opts ?? {}

      setIsPending(true)
      try {
        const token = await getAccessToken().catch(() => null)
        const payload: Record<string, unknown> = {}
        if (options.amount) payload.amount = options.amount
        if (options.currency) payload.currency = options.currency
        const res = await fetch("/api/bridge/payout", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(payload),
        })
        const body = (await res.json().catch(() => ({}))) as {
          status?: string
          reason?: string
        }

        if (res.ok && body.status === "executed") {
          toast.success("Withdrawal sent — it should land in seconds.")
          // Bust both the balance (custody just dropped) and the payout-address
          // query (a successful withdraw is a strong signal the address is set
          // and valid — relevant when the user just linked their wallet).
          queryClient.invalidateQueries({ queryKey: ["bridge-onramp", "balance"] })
          queryClient.invalidateQueries({ queryKey: ["bridge-onramp", "payout-address"] })
          return true
        }
        if (body.status === "skipped" && body.reason) {
          toast.info(SKIP_MESSAGES[body.reason] ?? body.reason)
          return false
        }
        const fallback =
          body.reason ?? `Couldn't start the withdrawal (HTTP ${res.status}).`
        toast.error(fallback)
        return false
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error"
        toast.error(`Withdrawal failed: ${msg}`)
        return false
      } finally {
        setIsPending(false)
      }
    },
    [authenticated, getAccessToken, queryClient],
  )

  return { isPending, withdraw }
}

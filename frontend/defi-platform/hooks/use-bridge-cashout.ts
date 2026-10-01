"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { usePrivy } from "@privy-io/react-auth"
import { toast } from "sonner"
import { FEATURE_FLAGS } from "@/config/featureFlags"
import { useStellarWallet } from "@/hooks/use-stellar-wallet"

/**
 * Client hook for "Cash out to your bank" — EURC or USDC on the user's own
 * Stellar wallet → EUR in their bank account, via a Bridge liquidation address
 * per source currency.
 *
 * One bucket is active at a time: EURC while it holds anything (1:1, no FX),
 * USDC otherwise — the same preference BridgeFundingStatus uses for
 * withdrawals. A user holding both drains EURC first, then the sheet flips to
 * the dollar bucket by itself.
 *
 * The order of operations matters and is the inverse of the on-ramp's: the user
 * signs and broadcasts the payment FIRST, and only then do we tell the server.
 * So the reporting call is best-effort — once the send resolves the money is
 * gone, and a failed report costs a history row, not the withdrawal (Bridge's
 * drain webhook reconciles either way).
 */

export type CashoutCurrency = "eurc" | "usdc"

/**
 * Smallest amount a cash-out may send, per source currency.
 *
 * Bridge enforces transaction minimums on liquidation addresses ($1 for
 * non-USDT stablecoins, €1 on the SEPA payout leg) and is explicit about the
 * consequence: deposits below the minimum "will not be credited or returned".
 * Dust sent there is simply gone — so the UI must refuse to build such a
 * payment at all.
 *
 * EURC converts 1:1 into EUR, so €1 clears both legs. USDC passes through
 * EUR/USD conversion plus Bridge's FX spread on the way out, and $1 lands
 * around €0.92 — under the SEPA minimum. $2 clears it with margin to spare.
 */
export const MIN_CASHOUT: Record<CashoutCurrency, number> = { eurc: 1, usdc: 2 }

export interface OfframpSendTarget {
  /** Stellar address to pay. Already memo-resolved by the server. */
  address: string
  /** Memo to attach, or null when the address needs none. */
  memo: string | null
}

export interface OfframpDestination {
  /** Per-source-currency targets; a currency missing here can't cash out yet. */
  targets: Partial<Record<CashoutCurrency, OfframpSendTarget>>
  bank: {
    ibanLast4: string | null
    bankName: string | null
    holderName: string | null
  }
}

export interface CashoutRecord {
  id: string
  amount: string
  currency: string
  fiatAmount: string | null
  destinationCurrency: string
  status: string
  failureReason: string | null
  stellarTxHash: string
  createdAt: string
  completedAt: string | null
}

export interface RegisterBankInput {
  iban: string
  bic?: string
  /** ISO 3166-1 alpha-3. */
  country: string
  holderName: string
  firstName: string
  lastName: string
  bankName?: string
}

export interface UseBridgeCashout {
  destination: OfframpDestination | null
  isLoadingDestination: boolean
  /** Spendable amount in the ACTIVE bucket, as a decimal string. */
  balance: string
  /** Which bucket `balance` (and the next cash-out) is denominated in. */
  balanceCurrency: CashoutCurrency
  /**
   * What the OTHER bucket holds, as a decimal string — so the sheet can say
   * "plus $X in dollars" instead of silently hiding money behind the flip.
   */
  otherBalance: string
  otherCurrency: CashoutCurrency
  isLoadingBalance: boolean
  cashouts: CashoutRecord[]
  hasPending: boolean
  isRegistering: boolean
  isSending: boolean
  /** Register the user's IBAN and provision their cash-out address. */
  registerBank: (input: RegisterBankInput) => Promise<boolean>
  /** Sign, send and report a cash-out. Returns true on a broadcast payment. */
  cashOut: (amount: string) => Promise<boolean>
}

const DESTINATION_KEY = ["bridge-onramp", "cashout-destination"]
const HISTORY_KEY = ["bridge-onramp", "cashout-history"]
const BALANCE_KEY = ["bridge-onramp", "cashout-balance"]

const SKIP_MESSAGES: Record<string, string> = {
  no_customer: "Verify your identity first before cashing out.",
  kyc_not_approved:
    "Bridge is still reviewing your verification. You'll be able to cash out once it's approved.",
  sepa_not_approved:
    "Your bank payout approval is still pending. We'll notify you once it's active.",
  no_external_account: "Add your bank account first.",
  no_liquidation_address: "Your cash-out account isn't ready yet. Try again in a moment.",
  invalid_amount: "Enter a valid amount.",
  invalid_bank_details: "Check your IBAN and BIC — they don't look right.",
  unsupported_country: "We can't pay out to banks in that country yet.",
  already_submitted: "That withdrawal was already recorded.",
}

export function useBridgeCashout(enabled = true): UseBridgeCashout {
  const { getAccessToken, authenticated } = usePrivy()
  const { address: stellarAddress } = useStellarWallet()
  const queryClient = useQueryClient()
  const [isRegistering, setIsRegistering] = useState(false)
  const [isSending, setIsSending] = useState(false)

  const active = enabled && FEATURE_FLAGS.FIAT_OFFRAMP_BRIDGE && authenticated

  const authedFetch = useCallback(
    async <T,>(url: string, init?: RequestInit): Promise<T> => {
      const token = await getAccessToken().catch(() => null)
      const res = await fetch(url, {
        ...init,
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(init?.headers ?? {}),
        },
      })
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (!res.ok) {
        const err = new Error(
          (body.error as string) ?? `Request failed: ${res.status}`,
        ) as Error & { code?: string }
        if (typeof body.code === "string") err.code = body.code
        throw err
      }
      return body as T
    },
    [getAccessToken],
  )

  const destinationQuery = useQuery({
    queryKey: DESTINATION_KEY,
    enabled: active,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      // Not-yet-registered is the normal first-run state, not an error — the
      // sentinel keeps callers branch-free, as use-bridge-balance does.
      const res = await fetch("/api/bridge/offramp/destination", {
        credentials: "include",
        headers: await (async () => {
          const token = await getAccessToken().catch(() => null)
          return token ? { Authorization: `Bearer ${token}` } : {}
        })(),
      })
      if (res.status === 401 || res.status === 404) return { destination: null }
      if (!res.ok) throw new Error(`Request failed: ${res.status}`)
      return (await res.json()) as { destination: OfframpDestination | null }
    },
  })

  const historyQuery = useQuery({
    queryKey: HISTORY_KEY,
    enabled: active,
    staleTime: 20_000,
    // Poll only while Bridge still owes the user money.
    refetchInterval: (q) =>
      (q.state.data as { pending?: boolean } | undefined)?.pending ? 20_000 : false,
    queryFn: async () => {
      const res = await fetch("/api/bridge/offramp/history", {
        credentials: "include",
        headers: await (async () => {
          const token = await getAccessToken().catch(() => null)
          return token ? { Authorization: `Bearer ${token}` } : {}
        })(),
      })
      if (res.status === 401 || res.status === 404) {
        return { cashouts: [], pending: false }
      }
      if (!res.ok) throw new Error(`Request failed: ${res.status}`)
      return (await res.json()) as { cashouts: CashoutRecord[]; pending: boolean }
    },
  })

  // Read straight from Horizon: this is the user's OWN wallet, not the
  // custodial one /api/bridge/balance reports on.
  const balanceQuery = useQuery({
    queryKey: [...BALANCE_KEY, stellarAddress ?? "none"],
    enabled: active && Boolean(stellarAddress),
    staleTime: 20_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { stellarEurcBalance, stellarUsdcBalance } = await import(
        "@/lib/stellar-payment"
      )
      const [eurc, usdc] = await Promise.all([
        stellarEurcBalance(stellarAddress as string),
        stellarUsdcBalance(stellarAddress as string),
      ])
      return { eurc, usdc }
    },
  })

  // The active bucket: EURC while it holds a *cashable* amount (1:1 into EUR),
  // else USDC. "Cashable" means at or above MIN_CASHOUT — €0.40 of EURC dust
  // is below Bridge's minimum and can never leave, so it must not pin the
  // sheet to an unusable € bucket while dollars sit next to it. When neither
  // bucket clears its minimum, show whichever holds anything so the user sees
  // their (too small) balance instead of a flat zero. Until the balances have
  // loaded, stay on EURC — the sheet renders € by default and must not flash
  // a $ at legacy users for one query round-trip.
  const balances = balanceQuery.data ?? { eurc: "0", usdc: "0" }
  const eurcHeld = Number(balances.eurc)
  const usdcHeld = Number(balances.usdc)
  let balanceCurrency: CashoutCurrency = "eurc"
  if (balanceQuery.data) {
    if (eurcHeld >= MIN_CASHOUT.eurc) balanceCurrency = "eurc"
    else if (usdcHeld >= MIN_CASHOUT.usdc) balanceCurrency = "usdc"
    else if (eurcHeld > 0) balanceCurrency = "eurc"
    else if (usdcHeld > 0) balanceCurrency = "usdc"
  }

  // Top-up provisioning for users registered before the USDC leg existed:
  // their destination has no USDC target, so a wallet holding only USDC would
  // dead-end. One empty POST reuses their bank account and provisions the
  // missing address. Gated on an actual USDC balance so users Bridge can't
  // route USDC for don't trigger a doomed Bridge call on every open, and
  // attempted once per mount so a persistent refusal can't loop.
  const topUpAttempted = useRef(false)
  const destination = destinationQuery.data?.destination ?? null
  useEffect(() => {
    if (
      !active ||
      topUpAttempted.current ||
      !destination ||
      destination.targets.usdc ||
      Number(balances.usdc) <= 0
    ) {
      return
    }
    topUpAttempted.current = true
    authedFetch<{ status: string }>("/api/bridge/offramp/destination", {
      method: "POST",
      body: JSON.stringify({}),
    })
      .then((body) => {
        if (body.status === "ready") {
          queryClient.invalidateQueries({ queryKey: DESTINATION_KEY })
        }
      })
      .catch((err) => console.warn("[cashout] usdc top-up provisioning failed", err))
  }, [active, destination, balances.usdc, authedFetch, queryClient])

  const registerBank = useCallback(
    async (input: RegisterBankInput): Promise<boolean> => {
      if (!authenticated) {
        toast.error("Sign in first to cash out.")
        return false
      }
      setIsRegistering(true)
      try {
        const body = await authedFetch<{ status: string; reason?: string }>(
          "/api/bridge/offramp/destination",
          { method: "POST", body: JSON.stringify(input) },
        )
        if (body.status === "ready") {
          queryClient.invalidateQueries({ queryKey: DESTINATION_KEY })
          return true
        }
        if (body.status === "skipped" && body.reason) {
          toast.info(SKIP_MESSAGES[body.reason] ?? body.reason)
          return false
        }
        toast.error(body.reason ?? "Couldn't add your bank account.")
        return false
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Unknown error")
        return false
      } finally {
        setIsRegistering(false)
      }
    },
    [authenticated, authedFetch, queryClient],
  )

  const cashOut = useCallback(
    async (amount: string): Promise<boolean> => {
      if (!destination) {
        toast.error("Add your bank account first.")
        return false
      }
      if (!stellarAddress) {
        toast.error("Connect your wallet first.")
        return false
      }
      // The bucket's target is provisioned separately from the bank account —
      // a missing one means Bridge hasn't (or won't) route this currency.
      const target = destination.targets[balanceCurrency]
      if (!target) {
        toast.error("Cashing out this balance isn't ready yet. Try again in a moment.")
        return false
      }
      // Last gate before money moves: an amount under Bridge's minimum is
      // neither credited nor returned. The screen validates too, but this is
      // the callback that actually signs — it must not trust its caller.
      if (Number(amount) < MIN_CASHOUT[balanceCurrency]) {
        const sym = balanceCurrency === "usdc" ? "$" : "€"
        toast.error(`The minimum cash-out is ${sym}${MIN_CASHOUT[balanceCurrency]}.`)
        return false
      }

      setIsSending(true)
      try {
        // Loaded lazily: the Stellar SDK is heavy and browser-hostile, and the
        // codebase never pulls it into a module graph statically.
        const { stellarSendEurc, stellarSendUsdc } = await import(
          "@/lib/stellar-payment"
        )
        const send = balanceCurrency === "eurc" ? stellarSendEurc : stellarSendUsdc
        const txHash = await send(stellarAddress, target.address, amount, target.memo)

        // Past this line the money has left the wallet. Reporting is
        // best-effort — the drain webhook reconciles even if this throws, so a
        // failure here must not read to the user as a failed withdrawal.
        try {
          await authedFetch("/api/bridge/offramp/cashout", {
            method: "POST",
            body: JSON.stringify({
              stellarTxHash: txHash,
              amount,
              currency: balanceCurrency,
            }),
          })
        } catch (err) {
          console.warn("[cashout] payment sent but reporting failed", err)
        }

        toast.success("On its way — your bank should have it within a day.")
        queryClient.invalidateQueries({ queryKey: HISTORY_KEY })
        queryClient.invalidateQueries({ queryKey: BALANCE_KEY })
        queryClient.invalidateQueries({ queryKey: ["bridge-onramp", "balance"] })
        return true
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "The payment didn't go through.")
        return false
      } finally {
        setIsSending(false)
      }
    },
    [destination, balanceCurrency, stellarAddress, authedFetch, queryClient],
  )

  return {
    destination,
    isLoadingDestination: destinationQuery.isLoading,
    balance: balances[balanceCurrency],
    balanceCurrency,
    otherBalance: balances[balanceCurrency === "eurc" ? "usdc" : "eurc"],
    otherCurrency: balanceCurrency === "eurc" ? "usdc" : "eurc",
    isLoadingBalance: balanceQuery.isLoading,
    cashouts: historyQuery.data?.cashouts ?? [],
    hasPending: Boolean(historyQuery.data?.pending),
    isRegistering,
    isSending,
    registerBank,
    cashOut,
  }
}

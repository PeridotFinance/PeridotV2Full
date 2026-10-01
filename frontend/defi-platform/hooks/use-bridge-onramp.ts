"use client"

import { useCallback, useMemo, useRef } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { usePrivy } from "@privy-io/react-auth"
import { FEATURE_FLAGS } from "@/config/featureFlags"
import { useStellarWallet } from "@/hooks/use-stellar-wallet"

/**
 * Client hook for the Bridge.xyz fiat on-ramp ("Geld aufladen").
 *
 * Wraps the /api/bridge/* endpoints: KYC link, bank-account (IBAN) provisioning
 * and top-up history. Deliberately surfaces only fintech concepts — there is no
 * chain/USDC vocabulary in the returned shape.
 */

export type OnrampState =
  | "not_started"
  | "tos_pending"
  | "kyc_in_progress"
  | "kyc_rejected"
  | "sepa_pending"
  | "ready"
  | "active"

export interface OnrampCustomer {
  kycStatus: string
  tosStatus: string
  sepaApproved: boolean
  endorsements: Record<string, string>
  rejectionReasons: unknown
}

export type OnrampDestinationCurrency = "eurc" | "usdc"

export interface OnrampBankAccount {
  holderName: string | null
  iban: string | null
  bic: string | null
  bankName: string | null
  /** Fiat the user wires (always EUR via SEPA today). */
  currency: string
  /** Stablecoin the deposit converts to. */
  destinationCurrency: OnrampDestinationCurrency
  status: string
}

interface OnrampStateResponse {
  state: OnrampState
  customer: OnrampCustomer | null
  bankAccount: OnrampBankAccount | null
  bankAccounts?: OnrampBankAccount[]
}

export interface OnrampTransfer {
  id: string
  amount: number | null
  currency: string
  status: "processing" | "completed" | "in_review" | "refunded"
  date: string | null
}

interface KycLinkResponse {
  customerId: string
  kycLink: string
  tosLink: string
  kycStatus: string
  tosStatus: string
}

const STATE_KEY = ["bridge-onramp", "state"]
const TRANSFERS_KEY = ["bridge-onramp", "transfers"]

async function authedFetch<T>(
  url: string,
  token: string | null,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  })
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    const err = new Error((body.error as string) || `Request failed: ${res.status}`)
    ;(err as Error & { code?: string }).code = body.code as string | undefined
    throw err
  }
  return body as T
}

export interface UseBridgeOnramp {
  state: OnrampState
  customer: OnrampCustomer | null
  /** Legacy single-account field (EURC if present, else first). */
  bankAccount: OnrampBankAccount | null
  /** All provisioned bank accounts — one per destination currency. */
  bankAccounts: OnrampBankAccount[]
  transfers: OnrampTransfer[]
  hasPendingTransfer: boolean
  isLoading: boolean
  /** True while the on-ramp state is being (re)fetched in the background. */
  isFetching: boolean
  isError: boolean
  error: Error | null
  /** Starts (or resumes) identity verification — returns the hosted KYC link. */
  requestKycLink: ReturnType<typeof useMutation<KycLinkResponse, Error, KycLinkInput>>
  /** Provisions a bank account (IBAN) once KYC + SEPA are approved. */
  createBankAccount: ReturnType<
    typeof useMutation<OnrampStateResponse, Error, CreateBankAccountInput | void>
  >
  refresh: () => void
}

export interface CreateBankAccountInput {
  /** Which stablecoin the deposit should convert to. Defaults to EURC. */
  destinationCurrency?: OnrampDestinationCurrency
}

export interface KycLinkInput {
  email: string
  fullName?: string
  /** ISO 3166-1 alpha-3 country of residence. */
  country: string
}

export function useBridgeOnramp(enabled = true): UseBridgeOnramp {
  const { getAccessToken, authenticated } = usePrivy()
  const queryClient = useQueryClient()

  // Embedded Stellar wallet — the auto-forward destination. Kept in a ref so the
  // mutation's onSuccess always reads the latest address without re-creating the
  // mutation. Used to establish the EURC trustline the forward needs to land.
  const stellar = useStellarWallet()
  const stellarRef = useRef(stellar)
  stellarRef.current = stellar

  const token = useCallback(
    () => getAccessToken().catch(() => null),
    [getAccessToken],
  )

  const stateQuery = useQuery<OnrampStateResponse>({
    queryKey: STATE_KEY,
    enabled: enabled && authenticated,
    staleTime: 15_000,
    queryFn: async () => authedFetch<OnrampStateResponse>("/api/bridge/customer", await token()),
    // Poll while ToS acceptance, verification, or SEPA approval is still in
    // flight — the hosted ToS / KYC pages open in a new tab, so the user
    // returns to *this* tab and the state must advance on its own.
    refetchInterval: (query) => {
      const s = query.state.data?.state
      return s === "tos_pending" || s === "kyc_in_progress" || s === "sepa_pending"
        ? 15_000
        : false
    },
    // KYC happens in a separate browser tab — refetch the moment the user
    // returns here so the flow advances immediately instead of waiting on the
    // poll interval.
    refetchOnWindowFocus: true,
  })

  const transfersQuery = useQuery<{ transfers: OnrampTransfer[]; pending: boolean }>({
    queryKey: TRANSFERS_KEY,
    enabled: enabled && authenticated && stateQuery.data?.state === "active",
    staleTime: 20_000,
    queryFn: async () =>
      authedFetch<{ transfers: OnrampTransfer[]; pending: boolean }>(
        "/api/bridge/transfers",
        await token(),
      ),
    refetchInterval: (query) => (query.state.data?.pending ? 20_000 : false),
  })

  const requestKycLink = useMutation<KycLinkResponse, Error, KycLinkInput>({
    mutationFn: async (input) =>
      authedFetch<KycLinkResponse>("/api/bridge/kyc-link", await token(), {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: STATE_KEY })
    },
  })

  const createBankAccount = useMutation<
    OnrampStateResponse,
    Error,
    CreateBankAccountInput | void
  >({
    mutationFn: async (input) =>
      authedFetch<OnrampStateResponse>("/api/bridge/virtual-account", await token(), {
        method: "POST",
        body: input ? JSON.stringify(input) : undefined,
      }),
    onSuccess: (data, input) => {
      queryClient.setQueryData(STATE_KEY, data)
      queryClient.invalidateQueries({ queryKey: TRANSFERS_KEY })
      // The deposit will arrive on this user's embedded wallet as a classic
      // asset, which bounces without a trustline — establish it now (idempotent,
      // silent, signed client-side). Plenty of lead time before SEPA settles.
      // Best-effort: failure just means we retry on the next provisioning.
      //
      // Must follow the DESTINATION currency: direct-to-wallet deposits settle
      // in USDC, the managed-wallet flow forwards EURC. Trust the account we
      // were actually issued rather than the requested input, so a server-side
      // substitution can never leave us trusting the wrong asset.
      const requested = input ? input.destinationCurrency : undefined
      const currency =
        data.bankAccounts?.find((a) => a.destinationCurrency === requested)
          ?.destinationCurrency ??
        data.bankAccounts?.[0]?.destinationCurrency ??
        requested ??
        "eurc"
      const s = stellarRef.current
      if (FEATURE_FLAGS.WALLET_PRIVY_STELLAR_EMBEDDED && s.source === "privy" && s.address) {
        const addr = s.address
        void import("@/lib/stellar-trustline")
          .then((m) => m.stellarEstablishOnrampTrustline(addr, currency))
          .catch((e) => console.warn("[use-bridge-onramp] trustline failed", currency, e))
      }
    },
  })

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: STATE_KEY })
    queryClient.invalidateQueries({ queryKey: TRANSFERS_KEY })
  }, [queryClient])

  return useMemo<UseBridgeOnramp>(
    () => ({
      state: stateQuery.data?.state ?? "not_started",
      customer: stateQuery.data?.customer ?? null,
      bankAccount: stateQuery.data?.bankAccount ?? null,
      bankAccounts: stateQuery.data?.bankAccounts ?? [],
      transfers: transfersQuery.data?.transfers ?? [],
      hasPendingTransfer: transfersQuery.data?.pending ?? false,
      isLoading: stateQuery.isLoading,
      isFetching: stateQuery.isFetching || transfersQuery.isFetching,
      isError: stateQuery.isError,
      error: (stateQuery.error as Error | null) ?? null,
      requestKycLink,
      createBankAccount,
      refresh,
    }),
    [
      stateQuery.data,
      stateQuery.isLoading,
      stateQuery.isFetching,
      stateQuery.isError,
      stateQuery.error,
      transfersQuery.isFetching,
      transfersQuery.data,
      requestKycLink,
      createBankAccount,
      refresh,
    ],
  )
}

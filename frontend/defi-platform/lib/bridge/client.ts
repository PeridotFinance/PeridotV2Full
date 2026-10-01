/**
 * Server-side Bridge.xyz API client.
 *
 * NEVER import this into client components — it carries `BRIDGE_API_KEY`.
 * All write calls take an idempotency key so retries (ours or the network's)
 * never create a duplicate customer / virtual account.
 */

import crypto from "crypto"
import type {
  BridgeCustomer,
  BridgeDrain,
  BridgeEndorsementName,
  BridgeExternalAccount,
  BridgeFiatCurrency,
  BridgeKycLink,
  BridgeLiquidationAddress,
  BridgeTransfer,
  BridgeVirtualAccount,
  BridgeVirtualAccountActivity,
  BridgeWallet,
} from "./types"

const PRODUCTION_BASE_URL = "https://api.bridge.xyz/v0"
const SANDBOX_BASE_URL = "https://api.sandbox.bridge.xyz/v0"

/**
 * The on-ramp runs against Bridge's sandbox UNLESS `BRIDGE_ENV=production` is
 * set explicitly. This is a deliberate safety default — real money movement
 * only ever happens after a conscious opt-in, never by forgetting an env var.
 */
function isProduction(): boolean {
  return process.env.BRIDGE_ENV === "production"
}

/**
 * Name of the Bridge environment the client currently talks to. Persisted on
 * every customer row so a sandbox-era customer can never poison lookups after
 * the app flips to production (its ids 404 on the other API).
 */
export function bridgeEnvName(): "production" | "sandbox" {
  return isProduction() ? "production" : "sandbox"
}

export class BridgeApiError extends Error {
  readonly status: number
  readonly body: unknown
  constructor(status: number, body: unknown) {
    super(`Bridge API error ${status}`)
    this.name = "BridgeApiError"
    this.status = status
    this.body = body
  }
}

export class BridgeConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BridgeConfigError"
  }
}

/**
 * True when Bridge refused because OUR Bridge account is not entitled to
 * create customer-managed wallets — not because of anything the user did:
 *
 *   POST /customers/{id}/wallets -> 400 invalid_parameters
 *     source.key.customer_id: "Your account requires additional approval to
 *     create this type of wallet. Please contact Bridge to enable this service."
 *
 * Observed in production on every chain (stellar/base/solana) while the same
 * call succeeds in sandbox — the entitlement is per environment. It is a
 * permanent condition until Bridge enables it, so callers must surface it as
 * "pending on our side" and NOT invite the user to retry.
 */
export function isWalletNotEnabledError(err: unknown): boolean {
  if (!(err instanceof BridgeApiError) || err.status !== 400) return false
  // Match on the message text rather than the shape: Bridge nests it under
  // source.key.<field> and the field name is not guaranteed to stay customer_id.
  return /requires additional approval to create this type of wallet/i.test(
    JSON.stringify(err.body ?? ""),
  )
}

function baseUrl(): string {
  if (process.env.BRIDGE_API_URL) {
    return process.env.BRIDGE_API_URL.replace(/\/+$/, "")
  }
  return isProduction() ? PRODUCTION_BASE_URL : SANDBOX_BASE_URL
}

/** The active API key — sandbox by default, production only when opted in. */
function resolveApiKey(): string | undefined {
  return isProduction()
    ? process.env.BRIDGE_API_KEY
    : process.env.BRIDGE_SANDBOX_KEY || process.env.BRIDGE_API_KEY
}

function apiKey(): string {
  const key = resolveApiKey()
  if (!key) {
    throw new BridgeConfigError(
      isProduction()
        ? "BRIDGE_API_KEY is not set"
        : "BRIDGE_SANDBOX_KEY is not set",
    )
  }
  return key
}

interface BridgeFetchOptions {
  method?: "GET" | "POST" | "PUT"
  body?: unknown
  /** POST only — dedupes retries. Defaults to a fresh UUID. Ignored on PUT. */
  idempotencyKey?: string
}

async function bridgeFetch<T>(path: string, opts: BridgeFetchOptions = {}): Promise<T> {
  const method = opts.method ?? "GET"
  const headers: Record<string, string> = {
    "Api-Key": apiKey(),
    Accept: "application/json",
  }
  if (method !== "GET") {
    headers["Content-Type"] = "application/json"
  }
  // POST only. Bridge 422s a PUT that carries an Idempotency-Key ("Cannot set
  // Idempotency-Key on this request, either because the PUT method does not
  // support it") — verified against the sandbox. PUT is already idempotent by
  // definition, so there is nothing to dedupe.
  if (method === "POST") {
    headers["Idempotency-Key"] = opts.idempotencyKey ?? crypto.randomUUID()
  }

  const res = await fetch(`${baseUrl()}${path}`, {
    method,
    headers,
    body: method === "GET" ? undefined : JSON.stringify(opts.body ?? {}),
    cache: "no-store",
  })

  const text = await res.text()
  let parsed: unknown = undefined
  if (text) {
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = text
    }
  }

  if (!res.ok) {
    throw new BridgeApiError(res.status, parsed)
  }
  return parsed as T
}

/** True when a usable Bridge API key is configured — gate routes on this. */
export function isBridgeConfigured(): boolean {
  return Boolean(resolveApiKey())
}

/** "sandbox" | "production" — surfaced for logging / UI badges. */
export function bridgeEnvironment(): "sandbox" | "production" {
  return isProduction() ? "production" : "sandbox"
}

// ── KYC links ────────────────────────────────────────────────────────────────

export interface CreateKycLinkParams {
  email: string
  type?: "individual" | "business"
  fullName?: string
  endorsements?: BridgeEndorsementName[]
  redirectUri?: string
  idempotencyKey?: string
}

/**
 * Generates a hosted KYC link. Bridge creates the customer record and runs the
 * Persona KYC flow on its own pages — no PII passes through our servers.
 */
export function createKycLink(params: CreateKycLinkParams): Promise<BridgeKycLink> {
  const body: Record<string, unknown> = {
    email: params.email,
    type: params.type ?? "individual",
  }
  if (params.fullName) body.full_name = params.fullName
  if (params.endorsements?.length) body.endorsements = params.endorsements
  if (params.redirectUri) body.redirect_uri = params.redirectUri

  return bridgeFetch<BridgeKycLink>("/kyc_links", {
    method: "POST",
    body,
    idempotencyKey: params.idempotencyKey,
  })
}

export function getKycLink(id: string): Promise<BridgeKycLink> {
  return bridgeFetch<BridgeKycLink>(`/kyc_links/${encodeURIComponent(id)}`)
}

// ── Customers ────────────────────────────────────────────────────────────────

export function getCustomer(id: string): Promise<BridgeCustomer> {
  return bridgeFetch<BridgeCustomer>(`/customers/${encodeURIComponent(id)}`)
}

// ── Bridge-managed wallets (Dollar-Access step 3) ────────────────────────────

/**
 * Provisions a Bridge-managed wallet for the customer on the given chain.
 * Bridge custodies the wallet — this is what makes the on-ramp work without
 * the user ever needing their own (Stellar) wallet or a browser extension.
 *
 * Requires the customer to have completed KYC and accepted the ToS.
 */
export function createBridgeWallet(
  customerId: string,
  chain: string,
  idempotencyKey?: string,
): Promise<BridgeWallet> {
  return bridgeFetch<BridgeWallet>(
    `/customers/${encodeURIComponent(customerId)}/wallets`,
    { method: "POST", body: { chain }, idempotencyKey },
  )
}

/** Lists the customer's Bridge-managed wallets. */
export async function listBridgeWallets(customerId: string): Promise<BridgeWallet[]> {
  const res = await bridgeFetch<{ data?: BridgeWallet[] } | BridgeWallet[]>(
    `/customers/${encodeURIComponent(customerId)}/wallets`,
  )
  return Array.isArray(res) ? res : res.data ?? []
}

// ── Virtual accounts ─────────────────────────────────────────────────────────

/** Lists the customer's virtual accounts (IBANs) as Bridge currently has them. */
export async function listVirtualAccounts(
  customerId: string,
): Promise<BridgeVirtualAccount[]> {
  const res = await bridgeFetch<{ data?: BridgeVirtualAccount[] } | BridgeVirtualAccount[]>(
    `/customers/${encodeURIComponent(customerId)}/virtual_accounts`,
  )
  return Array.isArray(res) ? res : res.data ?? []
}

export interface CreateVirtualAccountParams {
  customerId: string
  sourceCurrency: BridgeFiatCurrency
  destinationRail: string
  destinationCurrency: string
  destinationAddress: string
  destinationMemo?: string
  developerFeePercent?: string
  idempotencyKey?: string
}

export function createVirtualAccount(
  params: CreateVirtualAccountParams,
): Promise<BridgeVirtualAccount> {
  const destination: Record<string, unknown> = {
    payment_rail: params.destinationRail,
    currency: params.destinationCurrency,
    address: params.destinationAddress,
  }
  if (params.destinationMemo) destination.blockchain_memo = params.destinationMemo

  const body: Record<string, unknown> = {
    source: { currency: params.sourceCurrency },
    destination,
  }
  if (params.developerFeePercent) body.developer_fee_percent = params.developerFeePercent

  return bridgeFetch<BridgeVirtualAccount>(
    `/customers/${encodeURIComponent(params.customerId)}/virtual_accounts`,
    { method: "POST", body, idempotencyKey: params.idempotencyKey },
  )
}

export function getVirtualAccount(
  customerId: string,
  virtualAccountId: string,
): Promise<BridgeVirtualAccount> {
  return bridgeFetch<BridgeVirtualAccount>(
    `/customers/${encodeURIComponent(customerId)}/virtual_accounts/${encodeURIComponent(
      virtualAccountId,
    )}`,
  )
}

// ── Transfers (custodial wallet → external address) ─────────────────────────

export interface CreateTransferParams {
  /** Customer the transfer is executed on behalf of (KYC + sanctions check). */
  customerId: string
  /** The Bridge-managed wallet id we're spending from. */
  fromWalletId: string
  sourcePaymentRail: string // "stellar"
  sourceCurrency: string // "eurc"
  destinationPaymentRail: string // "stellar"
  destinationCurrency: string // "eurc"
  destinationAddress: string // user's G-address
  destinationMemo?: string
  /** Amount as a decimal string in the source currency, e.g. "12.34". */
  amount: string
  /** Optional developer-fee in basis points, recorded for reporting only. */
  developerFee?: string
  idempotencyKey?: string
}

/**
 * Initiates a Bridge transfer from a custodial wallet to an external address.
 * Used to forward EURC from the Bridge-managed Stellar wallet (where SEPA
 * deposits land) to the user's own Stellar wallet.
 *
 * Bridge returns immediately with a `state` like "payment_submitted"; the
 * terminal "payment_processed" + on-chain tx hash arrives via webhook
 * (`transfer.updated`) or by polling `getTransfer`.
 */
export function createTransfer(params: CreateTransferParams): Promise<BridgeTransfer> {
  const body: Record<string, unknown> = {
    amount: params.amount,
    on_behalf_of: params.customerId,
    source: {
      payment_rail: params.sourcePaymentRail,
      currency: params.sourceCurrency,
      from_wallet_id: params.fromWalletId,
    },
    destination: {
      payment_rail: params.destinationPaymentRail,
      currency: params.destinationCurrency,
      to_address: params.destinationAddress,
      ...(params.destinationMemo ? { blockchain_memo: params.destinationMemo } : {}),
    },
  }
  if (params.developerFee) body.developer_fee = params.developerFee

  return bridgeFetch<BridgeTransfer>("/transfers", {
    method: "POST",
    body,
    idempotencyKey: params.idempotencyKey,
  })
}

export function getTransfer(transferId: string): Promise<BridgeTransfer> {
  return bridgeFetch<BridgeTransfer>(`/transfers/${encodeURIComponent(transferId)}`)
}

// ── External accounts (off-ramp: the user's own bank account) ────────────────

export interface CreateExternalAccountParams {
  customerId: string
  /** IBAN, unformatted (no spaces). Bridge stores it; we only keep the last 4. */
  iban: string
  /**
   * Optional since SEPA went IBAN-only (2016) — Bridge's schema agrees, but
   * notes a BIC "may improve payment success rates", so we pass it through
   * whenever the user has one.
   */
  bic?: string
  /** ISO 3166-1 alpha-3, matching `lib/bridge/countries.ts`. */
  country: string
  accountOwnerName: string
  firstName: string
  lastName: string
  bankName?: string
  idempotencyKey?: string
}

/**
 * Registers the customer's own bank account as a payout destination. Required
 * before a liquidation address can pay out to fiat.
 *
 * EUR/SEPA only for now: `account_type: "iban"` requires `account_owner_type`,
 * and individual owners must supply first/last name separately from the
 * display-only `account_owner_name`.
 */
export function createExternalAccount(
  params: CreateExternalAccountParams,
): Promise<BridgeExternalAccount> {
  const body: Record<string, unknown> = {
    currency: "eur",
    account_type: "iban",
    account_owner_type: "individual",
    account_owner_name: params.accountOwnerName,
    first_name: params.firstName,
    last_name: params.lastName,
    iban: {
      account_number: params.iban,
      ...(params.bic ? { bic: params.bic } : {}),
      country: params.country,
    },
  }
  if (params.bankName) body.bank_name = params.bankName

  return bridgeFetch<BridgeExternalAccount>(
    `/customers/${encodeURIComponent(params.customerId)}/external_accounts`,
    { method: "POST", body, idempotencyKey: params.idempotencyKey },
  )
}

export async function listExternalAccounts(
  customerId: string,
): Promise<BridgeExternalAccount[]> {
  const res = await bridgeFetch<{ data?: BridgeExternalAccount[] } | BridgeExternalAccount[]>(
    `/customers/${encodeURIComponent(customerId)}/external_accounts`,
  )
  return Array.isArray(res) ? res : res.data ?? []
}

// ── Liquidation addresses (off-ramp: crypto in → fiat out) ───────────────────

export interface CreateLiquidationAddressParams {
  customerId: string
  chain: string // "stellar"
  currency: string // "eurc"
  externalAccountId: string
  destinationPaymentRail: string // "sepa"
  destinationCurrency: string // "eur"
  /** Statement reference the user sees on their bank line. 6–140 chars. */
  destinationSepaReference?: string
  /**
   * Where funds go if the payout can't be delivered. Stellar needs the memo —
   * without it Bridge can't route the refund back to the right end-customer.
   */
  returnInstructions?: { address: string; blockchain_memo?: string }
  idempotencyKey?: string
}

/**
 * Creates a permanent address that auto-converts anything sent to it and pays
 * the proceeds out to `externalAccountId`. This is the whole off-ramp: after
 * this, cashing out is just a chain payment — no further API call from us.
 *
 * We deliberately omit `custom_developer_fee_percent` — no fee in v1.
 */
export function createLiquidationAddress(
  params: CreateLiquidationAddressParams,
): Promise<BridgeLiquidationAddress> {
  const body: Record<string, unknown> = {
    chain: params.chain,
    currency: params.currency,
    external_account_id: params.externalAccountId,
    destination_payment_rail: params.destinationPaymentRail,
    destination_currency: params.destinationCurrency,
  }
  if (params.destinationSepaReference) {
    body.destination_sepa_reference = params.destinationSepaReference
  }
  // `return_address` is deprecated and unsupported on Stellar; the object form
  // is the only one that can carry the memo Stellar refunds need.
  if (params.returnInstructions) body.return_instructions = params.returnInstructions

  return bridgeFetch<BridgeLiquidationAddress>(
    `/customers/${encodeURIComponent(params.customerId)}/liquidation_addresses`,
    { method: "POST", body, idempotencyKey: params.idempotencyKey },
  )
}

export async function listLiquidationAddresses(
  customerId: string,
): Promise<BridgeLiquidationAddress[]> {
  const res = await bridgeFetch<
    { data?: BridgeLiquidationAddress[] } | BridgeLiquidationAddress[]
  >(`/customers/${encodeURIComponent(customerId)}/liquidation_addresses`)
  return Array.isArray(res) ? res : res.data ?? []
}

/** Drain history for a liquidation address (refresh fallback to webhooks). */
export async function getLiquidationAddressDrains(
  customerId: string,
  liquidationAddressId: string,
): Promise<BridgeDrain[]> {
  const res = await bridgeFetch<{ data?: BridgeDrain[] } | BridgeDrain[]>(
    `/customers/${encodeURIComponent(customerId)}/liquidation_addresses/${encodeURIComponent(
      liquidationAddressId,
    )}/drains`,
  )
  return Array.isArray(res) ? res : res.data ?? []
}

/** Deposit-lifecycle events for a virtual account (refresh fallback to webhooks). */
export async function getVirtualAccountHistory(
  customerId: string,
  virtualAccountId: string,
): Promise<BridgeVirtualAccountActivity[]> {
  const res = await bridgeFetch<{ data?: BridgeVirtualAccountActivity[] } | BridgeVirtualAccountActivity[]>(
    `/customers/${encodeURIComponent(customerId)}/virtual_accounts/${encodeURIComponent(
      virtualAccountId,
    )}/history`,
  )
  return Array.isArray(res) ? res : res.data ?? []
}

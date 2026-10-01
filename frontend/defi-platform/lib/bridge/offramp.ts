/**
 * Off-ramp orchestrator — EURC or USDC on the user's own Stellar wallet → EUR
 * in their own bank account over SEPA (USDC pays Bridge's EUR/USD spread).
 *
 * NOT to be confused with `payouts.ts`, which despite the name is the on-ramp's
 * crypto tail (Bridge custody → the user's G-address). This file is the fiat
 * cash-out, and the control flow is the mirror image of the on-ramp's:
 *
 *   On-ramp:  Bridge pushes money at us; we react to webhooks.
 *   Off-ramp: the USER pushes money at Bridge; we record it and the webhook
 *             only confirms afterwards.
 *
 * That inversion is why there is no "execute" here. A Bridge liquidation
 * address is a permanent Stellar address pre-wired to the user's IBAN — once
 * provisioned, cashing out is an ordinary Stellar payment the client signs. We
 * never move the funds ourselves, so the two jobs left are:
 *
 *   1. `ensureOfframpDestination` — provision (once) the IBAN + address pair.
 *   2. `recordCashoutSubmission` — write down a payment the user has already
 *      broadcast, so it shows in their history before Bridge reports the drain.
 */

import {
  BridgeApiError,
  createExternalAccount,
  createLiquidationAddress,
} from "./client"
import {
  getCustomerByPrivyId,
  getCashoutByTxHash,
  getExternalAccountByPrivyId,
  getLiquidationAddressByPrivyId,
  insertExternalAccount,
  insertLiquidationAddress,
  insertPendingCashout,
  type BridgeCashoutRow,
  type BridgeCustomerRow,
  type BridgeExternalAccountRow,
  type BridgeLiquidationAddressRow,
} from "./store"
import { isKycApproved, hasSepaEndorsement } from "./status"
import { supportsSepaOnramp } from "./countries"

/** Chain the user's stablecoins live on. */
export const OFFRAMP_CHAIN = "stellar"
/**
 * What the user can send. EURC was the only pair in v1 (no FX, no spread), but
 * the on-ramp's direct-to-wallet mode delivers USDC — without a USDC leg a
 * freshly funded user opens "Cash out" and sees €0. Order matters: EURC first,
 * because it converts 1:1 and USDC pays Bridge's EUR/USD spread.
 */
export const OFFRAMP_CURRENCIES = ["eurc", "usdc"] as const
export type OfframpCurrency = (typeof OFFRAMP_CURRENCIES)[number]

export function isOfframpCurrency(v: unknown): v is OfframpCurrency {
  return v === "eurc" || v === "usdc"
}

/** What lands in their bank. */
export const OFFRAMP_DESTINATION_CURRENCY = "eur"
export const OFFRAMP_DESTINATION_RAIL = "sepa"

/** What the user's bank statement says. Bridge requires 6–140 chars. */
const SEPA_REFERENCE = "Peridot cash out"

export type CashoutSkipReason =
  | "already_submitted"
  | "no_customer"
  | "no_external_account"
  | "no_liquidation_address"
  | "kyc_not_approved"
  | "sepa_not_approved"
  | "invalid_amount"
  | "unsupported_country"
  | "invalid_bank_details"

export type EnsureDestinationOutcome =
  | { status: "ready"; destination: OfframpDestination }
  | { status: "skipped"; reason: CashoutSkipReason }
  | { status: "failed"; reason: string }

export type RecordCashoutOutcome =
  | { status: "recorded"; cashout: BridgeCashoutRow }
  | { status: "skipped"; reason: CashoutSkipReason; cashout?: BridgeCashoutRow }
  | { status: "failed"; reason: string }

/**
 * Per-currency send target. `memo` is null when Bridge issued a memoless
 * address — see `resolveSendTarget`.
 */
export interface OfframpSendTarget {
  /** Stellar address the client pays. Already memo-resolved. */
  address: string
  /** Memo to attach, or null when the address needs none. */
  memo: string | null
}

/**
 * Where the client can send funds, and the bank account it all lands in.
 * One bank account, one target per source currency — a currency missing from
 * `targets` cannot cash out (Bridge refused or hasn't provisioned it yet).
 */
export interface OfframpDestination {
  targets: Partial<Record<OfframpCurrency, OfframpSendTarget>>
  bank: {
    ibanLast4: string | null
    bankName: string | null
    holderName: string | null
  }
}

const IBAN_RE = /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/
const BIC_RE = /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/

export function normalizeIban(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase()
}

export function isValidIban(raw: string): boolean {
  return IBAN_RE.test(normalizeIban(raw))
}

export function isValidBic(raw: string): boolean {
  return BIC_RE.test(raw.replace(/\s+/g, "").toUpperCase())
}

function isPositiveDecimal(amount: string): boolean {
  if (!/^\d+(\.\d+)?$/.test(amount)) return false
  return Number(amount) > 0
}

/** Bridge errors carry the useful detail in the body; bound what we persist. */
function normalizeError(err: unknown): string {
  return err instanceof BridgeApiError
    ? `bridge_${err.status}: ${JSON.stringify(err.body).slice(0, 400)}`
    : err instanceof Error
      ? err.message
      : "unknown error"
}

/**
 * Gate check for cash-out eligibility. Deliberately NOT `payouts.ts`'s
 * `gateCustomer`: that one hard-requires `payout_stellar_address` and returns
 * `no_payout_address`, which is meaningless here — our destination is a bank
 * account, not a G-address.
 *
 * The `sepa` endorsement is the same one the on-ramp already requires, and it
 * covers the rail in both directions: an existing verified user needs no
 * re-verification to cash out.
 */
function gateOfframpCustomer(
  customer: BridgeCustomerRow | null,
): CashoutSkipReason | null {
  if (!customer || !customer.bridge_customer_id) return "no_customer"
  if (!isKycApproved(customer.kyc_status)) return "kyc_not_approved"
  if (!hasSepaEndorsement(customer.endorsements)) return "sepa_not_approved"
  return null
}

/**
 * Picks the address to send to and whether a memo is needed.
 *
 * Stellar routes by memo, and a deposit that arrives without one is delayed or
 * misattributed. Bridge's escape hatch is `memoless_address` — a dedicated
 * address needing no memo — which we prefer whenever it's present. It appears
 * in Bridge's response schema but not their prose docs, so we treat it as
 * optional and fall back to address + memo.
 */
export function resolveSendTarget(
  row: BridgeLiquidationAddressRow,
): { address: string; memo: string | null } {
  if (row.memoless_address) return { address: row.memoless_address, memo: null }
  return { address: row.address, memo: row.blockchain_memo }
}

function serializeDestination(
  targets: Partial<Record<OfframpCurrency, OfframpSendTarget>>,
  ext: BridgeExternalAccountRow,
): OfframpDestination {
  return {
    targets,
    bank: {
      ibanLast4: ext.iban_last4,
      bankName: ext.bank_name,
      holderName: ext.account_holder_name,
    },
  }
}

export interface EnsureOfframpDestinationInput {
  privyUserId: string
  /**
   * Bank details — required only on first registration. A user whose external
   * account already exists may call with none of them (a "top-up" call) to
   * provision liquidation addresses for currencies added after they signed up.
   */
  iban?: string
  bic?: string
  /** ISO 3166-1 alpha-3, matching `countries.ts`. */
  country?: string
  holderName?: string
  firstName?: string
  lastName?: string
  bankName?: string
}

/**
 * Provisions (or returns) the liquidation address for one source currency.
 * Existing rows short-circuit without touching Bridge.
 */
async function ensureLiquidationAddress(
  privyUserId: string,
  bridgeCustomerId: string,
  externalAccountId: string,
  currency: OfframpCurrency,
): Promise<OfframpSendTarget> {
  const existing = await getLiquidationAddressByPrivyId(
    privyUserId,
    currency,
    OFFRAMP_DESTINATION_CURRENCY,
  )
  if (existing) return resolveSendTarget(existing)

  const created = await createLiquidationAddress({
    customerId: bridgeCustomerId,
    chain: OFFRAMP_CHAIN,
    currency,
    externalAccountId,
    destinationPaymentRail: OFFRAMP_DESTINATION_RAIL,
    destinationCurrency: OFFRAMP_DESTINATION_CURRENCY,
    destinationSepaReference: SEPA_REFERENCE,
    idempotencyKey: `offramp-liq:${privyUserId}:${currency}`,
  })
  const row = await insertLiquidationAddress({
    privyUserId,
    bridgeCustomerId,
    bridgeLiquidationAddressId: created.id,
    chain: created.chain ?? OFFRAMP_CHAIN,
    currency: created.currency ?? currency,
    address: created.address,
    blockchainMemo: created.blockchain_memo ?? null,
    memolessAddress: created.memoless_address ?? null,
    destinationRail: created.destination_payment_rail ?? OFFRAMP_DESTINATION_RAIL,
    destinationCurrency: created.destination_currency ?? OFFRAMP_DESTINATION_CURRENCY,
    bridgeExternalAccountId: externalAccountId,
    state: created.state ?? "active",
  })
  if (!row) throw new Error("failed to persist liquidation address")
  return resolveSendTarget(row)
}

/**
 * Returns the user's cash-out destination, provisioning whatever is missing.
 *
 * Idempotent by design: existing rows are returned without touching Bridge, so
 * the client can call this on every open of the sheet. Two shapes of call:
 * with bank details (first registration) or without (a "top-up" for a user
 * registered before a source currency existed — their external account is
 * reused and only the missing liquidation addresses are provisioned).
 *
 * Per-currency failures degrade instead of failing the whole destination: a
 * currency Bridge won't route must not take down the ones that work. Only a
 * destination with no working currency at all is `failed`.
 */
export async function ensureOfframpDestination(
  input: EnsureOfframpDestinationInput,
): Promise<EnsureDestinationOutcome> {
  const customer = await getCustomerByPrivyId(input.privyUserId)
  const gate = gateOfframpCustomer(customer)
  if (gate) return { status: "skipped", reason: gate }
  const c = customer as BridgeCustomerRow
  const bridgeCustomerId = c.bridge_customer_id as string

  let ext = await getExternalAccountByPrivyId(input.privyUserId)
  if (!ext) {
    // First registration — now the bank details are mandatory.
    if (
      !input.iban ||
      !input.country ||
      !input.holderName ||
      !input.firstName ||
      !input.lastName
    ) {
      return { status: "skipped", reason: "no_external_account" }
    }
    const iban = normalizeIban(input.iban)
    // SEPA has been IBAN-only since 2016 and Bridge's schema marks the BIC
    // optional — but a wrong one is still worse than none, so a BIC that WAS
    // typed must be a real one.
    const bic = input.bic ? input.bic.replace(/\s+/g, "").toUpperCase() : null
    if (!isValidIban(iban) || (bic !== null && !isValidBic(bic))) {
      return { status: "skipped", reason: "invalid_bank_details" }
    }
    // Same SEPA zone applies in both directions, so we reuse the on-ramp's list
    // rather than maintaining a second copy that can drift.
    if (!supportsSepaOnramp(input.country)) {
      return { status: "skipped", reason: "unsupported_country" }
    }
    try {
      const created = await createExternalAccount({
        customerId: bridgeCustomerId,
        iban,
        bic: bic ?? undefined,
        country: input.country,
        accountOwnerName: input.holderName,
        firstName: input.firstName,
        lastName: input.lastName,
        bankName: input.bankName,
        // One bank account per user in v1 — a stable key means a retried
        // request can't register the same IBAN twice.
        idempotencyKey: `offramp-ext:${input.privyUserId}`,
      })
      ext = await insertExternalAccount({
        privyUserId: input.privyUserId,
        bridgeCustomerId,
        bridgeExternalAccountId: created.id,
        currency: "eur",
        // Only the last 4 — Bridge holds the full IBAN and we never need it
        // again, so keeping it would be needless PII at rest.
        ibanLast4: iban.slice(-4),
        bic,
        bankName: created.bank_name ?? input.bankName ?? null,
        accountHolderName: created.account_owner_name ?? input.holderName,
        country: input.country,
      })
      if (!ext) throw new Error("failed to persist external account")
    } catch (err) {
      return { status: "failed", reason: normalizeError(err) }
    }
  }

  const targets: Partial<Record<OfframpCurrency, OfframpSendTarget>> = {}
  let lastError: string | null = null
  for (const currency of OFFRAMP_CURRENCIES) {
    try {
      targets[currency] = await ensureLiquidationAddress(
        input.privyUserId,
        bridgeCustomerId,
        ext.bridge_external_account_id,
        currency,
      )
    } catch (err) {
      lastError = normalizeError(err)
      console.error(
        `[bridge/offramp] provisioning ${currency} liquidation address failed`,
        lastError,
      )
    }
  }
  if (Object.keys(targets).length === 0) {
    return { status: "failed", reason: lastError ?? "no cash-out currency available" }
  }
  return { status: "ready", destination: serializeDestination(targets, ext) }
}

/** Read-only: the destination if it exists, without provisioning one. */
export async function getOfframpDestination(
  privyUserId: string,
): Promise<OfframpDestination | null> {
  const ext = await getExternalAccountByPrivyId(privyUserId)
  if (!ext) return null
  const targets: Partial<Record<OfframpCurrency, OfframpSendTarget>> = {}
  for (const currency of OFFRAMP_CURRENCIES) {
    const liq = await getLiquidationAddressByPrivyId(
      privyUserId,
      currency,
      OFFRAMP_DESTINATION_CURRENCY,
    )
    if (liq) targets[currency] = resolveSendTarget(liq)
  }
  if (Object.keys(targets).length === 0) return null
  return serializeDestination(targets, ext)
}

export interface RecordCashoutSubmissionInput {
  privyUserId: string
  /** Hash of the Stellar payment the client has already broadcast. */
  stellarTxHash: string
  amount: string
  /** What the payment sent. Defaults to EURC for pre-USDC clients. */
  currency?: OfframpCurrency
}

/**
 * Records a cash-out the user has already broadcast.
 *
 * By the time this runs the money is gone — the client signed and submitted the
 * payment before calling us. So this cannot fail the withdrawal, only fail to
 * *log* it; the drain webhook will still reconcile (and will insert the row
 * itself if this call never lands). That's why a missing liquidation address
 * here is a skip, not an error.
 */
export async function recordCashoutSubmission(
  input: RecordCashoutSubmissionInput,
): Promise<RecordCashoutOutcome> {
  if (!isPositiveDecimal(input.amount)) {
    return { status: "skipped", reason: "invalid_amount" }
  }

  const customer = await getCustomerByPrivyId(input.privyUserId)
  const gate = gateOfframpCustomer(customer)
  if (gate) return { status: "skipped", reason: gate }
  const bridgeCustomerId = (customer as BridgeCustomerRow).bridge_customer_id as string

  const currency = input.currency ?? "eurc"
  const liq = await getLiquidationAddressByPrivyId(
    input.privyUserId,
    currency,
    OFFRAMP_DESTINATION_CURRENCY,
  )
  if (!liq) return { status: "skipped", reason: "no_liquidation_address" }

  // Cheap short-circuit for the common re-report (double-clicked confirm, a
  // retried request) before we attempt the insert.
  const existing = await getCashoutByTxHash(input.stellarTxHash)
  if (existing) {
    return { status: "skipped", reason: "already_submitted", cashout: existing }
  }

  try {
    const row = await insertPendingCashout({
      privyUserId: input.privyUserId,
      bridgeCustomerId,
      stellarTxHash: input.stellarTxHash,
      amount: input.amount,
      currency,
      destinationCurrency: OFFRAMP_DESTINATION_CURRENCY,
    })
    // ON CONFLICT DO NOTHING returns nothing when a parallel writer (or the
    // drain webhook, arriving first on a fast chain) won the race.
    if (!row) {
      const raced = await getCashoutByTxHash(input.stellarTxHash)
      return {
        status: "skipped",
        reason: "already_submitted",
        cashout: raced ?? undefined,
      }
    }
    return { status: "recorded", cashout: row }
  } catch (err) {
    return { status: "failed", reason: normalizeError(err) }
  }
}

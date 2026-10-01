/**
 * Shared assembly of the on-ramp state returned by /api/bridge/customer and
 * /api/bridge/virtual-account. Underscore-prefixed so Next.js never routes it.
 *
 * The serialized shape is deliberately jargon-free — no chain, address, memo or
 * "USDC" leaks to the client. The user only ever sees a bank account and a
 * euro balance.
 */

import { BridgeApiError, getCustomer, listVirtualAccounts } from "@/lib/bridge/client"
import {
  getCustomerByPrivyId,
  insertVirtualAccount,
  listVirtualAccountsByPrivyId,
  updateCustomerStatusByBridgeId,
  type BridgeCustomerRow,
  type BridgeVirtualAccountRow,
} from "@/lib/bridge/store"
import {
  deriveOnrampState,
  endorsementsToMap,
  hasSepaEndorsement,
  isKycApproved,
  isKycRejected,
  isTosApproved,
  normalizeCustomerKycStatus,
  normalizeEndorsements,
  type OnrampState,
} from "@/lib/bridge/status"

/** Fiat the user funds with — EUR via SEPA bank transfer. */
export const ONRAMP_CURRENCY = "eur"

/**
 * Where Bridge delivers the converted funds. Following the Bridge "Dollar
 * Access" flow: Bridge provisions a managed wallet for the customer (step 3)
 * and the virtual account routes deposits into it (`bridge_wallet` rail). The
 * managed wallet lives on Stellar. The user picks the *destination currency*
 * (EURC or USDC); the rail and chain are fixed.
 *
 * Currency trade-off the user implicitly makes by picking USDC:
 *   - EUR → EURC: 0% FX (same currency, fiat→stablecoin only)
 *   - EUR → USDC: up to 1% FX spread (EUR/USD conversion inside Bridge)
 * Surfaced in the UI before they pick.
 */
export const ONRAMP_DESTINATION_RAIL = "bridge_wallet"
/** Chain for the Bridge-managed wallet provisioned per customer. */
export const ONRAMP_WALLET_CHAIN = "stellar"

/**
 * Direct-to-wallet mode ({@link FEATURE_FLAGS.FIAT_ONRAMP_DIRECT_TO_WALLET}):
 * Bridge pays the user's OWN Stellar account, so the rail is the chain itself
 * rather than `bridge_wallet` — which is precisely the rail our production
 * account is not entitled to use.
 *
 * Verified against production 2026-07-28:
 *   eur -> usdc @ stellar, external address  -> 201, IBAN issued
 *   eur -> eurc @ stellar, external address  -> 400 "this route from source ->
 *                                               destination is currently not supported"
 * Hence USDC only on this path; EURC by bank transfer requires the managed
 * wallet (and therefore the Bridge entitlement).
 */
export const ONRAMP_DIRECT_RAIL = "stellar"

/**
 * Stellar payouts must carry a memo — Bridge rejects the create call without
 * one ("Blockchain memo must be set when payment_rail is stellar"). The
 * destination is the user's own account, so the memo carries no routing
 * meaning; it is a constant purely to satisfy that requirement. Do NOT change
 * it once accounts exist: it is baked into every already-issued IBAN.
 */
export const ONRAMP_DIRECT_MEMO = "peridot"

/** Destination currencies Bridge supports on the direct (external) path. */
export const ONRAMP_DIRECT_CURRENCIES: readonly OnrampDestinationCurrency[] = ["usdc"]

/** Destination stablecoins the user can receive via bank transfer. */
export type OnrampDestinationCurrency = "eurc" | "usdc"

export const ONRAMP_DESTINATION_CURRENCIES: readonly OnrampDestinationCurrency[] = [
  "eurc",
  "usdc",
] as const

/** Default for legacy callers; new code should pass the currency explicitly. */
export const ONRAMP_DESTINATION_CURRENCY: OnrampDestinationCurrency = "eurc"

export function isOnrampDestinationCurrency(
  v: unknown,
): v is OnrampDestinationCurrency {
  return v === "eurc" || v === "usdc"
}

export interface OnrampBankAccount {
  holderName: string | null
  iban: string | null
  bic: string | null
  bankName: string | null
  /** Fiat the user wires (always EUR via SEPA today). */
  currency: string
  /** Stablecoin the deposit converts to ("eurc" | "usdc"). */
  destinationCurrency: OnrampDestinationCurrency
  status: string
}

export interface OnrampStateResponse {
  state: OnrampState
  customer: {
    kycStatus: string
    tosStatus: string
    sepaApproved: boolean
    endorsements: Record<string, string>
    rejectionReasons: unknown
  } | null
  /**
   * Legacy single-account field — kept for any client still reading it.
   * Returns the EURC account if present, else the first one. New clients
   * should iterate `bankAccounts` and pick by `destinationCurrency`.
   */
  bankAccount: OnrampBankAccount | null
  /** All provisioned bank accounts for this user, one per destination currency. */
  bankAccounts: OnrampBankAccount[]
}

/**
 * Whether there is anything left to learn from Bridge for this customer.
 * NOT just "KYC terminal": after KYC approval the ToS and SEPA endorsement
 * can still be pending, and without polling they only ever advance via
 * webhooks — a user would hang in `sepa_pending` forever on a missed (or
 * never-registered) webhook.
 */
function isFullyOnboarded(row: BridgeCustomerRow): boolean {
  return (
    isKycApproved(row.kyc_status) &&
    isTosApproved(row.tos_status) &&
    hasSepaEndorsement(row.endorsements)
  )
}

/**
 * Best-effort refresh of an incomplete customer straight from Bridge. Keeps
 * the flow correct even without webhooks. Failures are swallowed — the DB
 * copy is still returned — but a 404 is logged loudly: it means this customer
 * id does not exist in the current Bridge environment (sandbox/production
 * mismatch) and the row will stay stale until the user re-onboards.
 */
async function refreshCustomer(row: BridgeCustomerRow): Promise<BridgeCustomerRow> {
  if (!row.bridge_customer_id) return row
  if (isKycRejected(row.kyc_status) || isFullyOnboarded(row)) return row
  try {
    const fresh = await getCustomer(row.bridge_customer_id)
    const updated = await updateCustomerStatusByBridgeId(row.bridge_customer_id, {
      kycStatus: normalizeCustomerKycStatus(fresh.status),
      // The customer object carries ToS as a boolean; only ever promote — a
      // missing/false flag must not demote a webhook-approved ToS.
      ...(fresh.has_accepted_terms_of_service === true ? { tosStatus: "approved" } : {}),
      // Only overwrite endorsements when Bridge actually returned them.
      ...(fresh.endorsements?.length
        ? { endorsements: endorsementsToMap(fresh.endorsements) }
        : {}),
      rejectionReasons: fresh.rejection_reasons ?? null,
    })
    return updated ?? row
  } catch (err) {
    if (err instanceof BridgeApiError && err.status === 404) {
      console.error(
        `[bridge/_state] customer ${row.bridge_customer_id} not found in the ` +
          `current Bridge environment — row likely belongs to the other env.`,
      )
    } else if (!(err instanceof BridgeApiError)) {
      console.error("[bridge/_state] customer refresh failed", err)
    }
    return row
  }
}

/**
 * Deposit instructions used to be written once at provisioning and trusted
 * forever — safe while they were immutable. Bridge's September 2026 upgrade
 * renames the holder on EXISTING accounts (the customer's own name instead of
 * Bridge's), so a stored copy can now silently go stale. Re-read the
 * instructions from Bridge once any stored row is older than this; the upsert
 * bumps `updated_at` (touch trigger) even when nothing changed, so the check
 * self-throttles.
 */
const DEPOSIT_INSTRUCTIONS_MAX_AGE_MS = 6 * 60 * 60 * 1000

/**
 * Best-effort re-sync of the stored deposit instructions from Bridge, in the
 * spirit of {@link refreshCustomer}: failures are swallowed and the DB copy is
 * returned unchanged. Bridge is the source of truth, but a partial answer must
 * never wipe a stored field — every column falls back to what we already have.
 */
async function refreshVirtualAccounts(
  customer: BridgeCustomerRow,
  rows: BridgeVirtualAccountRow[],
): Promise<BridgeVirtualAccountRow[]> {
  if (!customer.bridge_customer_id || rows.length === 0) return rows
  const cutoff = Date.now() - DEPOSIT_INSTRUCTIONS_MAX_AGE_MS
  if (rows.every((r) => new Date(r.updated_at).getTime() > cutoff)) return rows
  try {
    const fresh = await listVirtualAccounts(customer.bridge_customer_id)
    const byId = new Map(fresh.map((a) => [a.id, a]))
    return await Promise.all(
      rows.map(async (row) => {
        const account = byId.get(row.bridge_account_id)
        const deposit = account?.source_deposit_instructions
        if (!deposit) return row
        return insertVirtualAccount({
          privyUserId: row.privy_user_id,
          bridgeCustomerId: row.bridge_customer_id,
          bridgeAccountId: row.bridge_account_id,
          fiatCurrency: row.fiat_currency,
          iban: deposit.iban ?? row.iban,
          bic: deposit.bic ?? row.bic,
          bankName: deposit.bank_name ?? row.bank_name,
          accountHolderName: deposit.account_holder_name ?? row.account_holder_name,
          destinationRail: account.destination?.payment_rail ?? row.destination_rail,
          destinationCurrency: account.destination?.currency ?? row.destination_currency,
          destinationAddress: account.destination?.address ?? row.destination_address,
          destinationMemo: account.destination?.blockchain_memo ?? row.destination_memo,
          status: account.status ?? row.status,
        })
      }),
    )
  } catch (err) {
    console.error("[bridge/_state] virtual-account refresh failed", err)
    return rows
  }
}

function serializeCustomer(row: BridgeCustomerRow): OnrampStateResponse["customer"] {
  const endorsements = normalizeEndorsements(row.endorsements)
  return {
    kycStatus: row.kyc_status,
    tosStatus: row.tos_status,
    sepaApproved: hasSepaEndorsement(endorsements),
    endorsements,
    rejectionReasons: row.rejection_reasons ?? null,
  }
}

function serializeBankAccount(row: BridgeVirtualAccountRow): OnrampBankAccount {
  // Trust the DB column; fall back to "eurc" for legacy rows that predate
  // multi-destination support and have whatever value Bridge originally set.
  const dest = isOnrampDestinationCurrency(row.destination_currency)
    ? row.destination_currency
    : "eurc"
  return {
    holderName: row.account_holder_name,
    iban: row.iban,
    bic: row.bic,
    bankName: row.bank_name,
    currency: row.fiat_currency,
    destinationCurrency: dest,
    status: row.status,
  }
}

/** Assembles the complete on-ramp picture for one Privy user. */
export async function buildOnrampState(
  privyUserId: string,
  opts: { refresh?: boolean } = {},
): Promise<OnrampStateResponse> {
  let customer = await getCustomerByPrivyId(privyUserId)
  if (customer && opts.refresh !== false) {
    customer = await refreshCustomer(customer)
  }
  let accountRows = await listVirtualAccountsByPrivyId(privyUserId, ONRAMP_CURRENCY)
  // Same opt-out as the customer refresh: the provisioning POST just wrote
  // fresh instructions and passes `refresh: false`.
  if (customer && opts.refresh !== false) {
    accountRows = await refreshVirtualAccounts(customer, accountRows)
  }
  const bankAccounts = accountRows.map(serializeBankAccount)
  // Legacy field — preserve previous behavior of "the user's bank account":
  // prefer EURC since that's been the only one until now.
  const bankAccount =
    bankAccounts.find((a) => a.destinationCurrency === "eurc") ??
    bankAccounts[0] ??
    null

  const state = deriveOnrampState({
    hasCustomer: Boolean(customer),
    kycStatus: customer?.kyc_status,
    tosStatus: customer?.tos_status,
    endorsements: customer?.endorsements,
    hasVirtualAccount: bankAccounts.length > 0,
  })

  return {
    state,
    customer: customer ? serializeCustomer(customer) : null,
    bankAccount,
    bankAccounts,
  }
}

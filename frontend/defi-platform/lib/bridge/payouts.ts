/**
 * Payout orchestrator — forwards EURC from the Bridge-managed custodial Stellar
 * wallet to the user's own Stellar wallet (Freighter/xBull/Albedo G-address).
 *
 * Two entry points share this code path:
 *   - the webhook (`virtual_account.activity` with type `funds_received` /
 *     `payment_processed`) calls it with `trigger: "auto"` and the inbound
 *     activity id as the idempotency anchor.
 *   - the manual "Withdraw to my Stellar wallet" button posts to
 *     /api/bridge/payout, which calls it with `trigger: "manual"` (and a
 *     synthetic anchor so the user can't double-click into a double-pay).
 *
 * Failure handling: any error after we've reserved a `bridge_payouts` row gets
 * persisted on that row as status='failed'. We never delete failed rows — they
 * become the visible "retry" affordance in the UI.
 */

import { BridgeApiError, createTransfer } from "./client"
import {
  getCustomerByPrivyId,
  getPayoutBySourceActivityId,
  insertPendingPayout,
  updatePayoutStatus,
  type BridgeCustomerRow,
  type BridgePayoutRow,
} from "./store"
import { isKycApproved, hasSepaEndorsement } from "./status"
import {
  ONRAMP_DESTINATION_CURRENCY,
  ONRAMP_WALLET_CHAIN,
  type OnrampDestinationCurrency,
} from "@/app/api/bridge/_state"

export type ExecutePayoutOutcome =
  | { status: "executed"; payout: BridgePayoutRow }
  | { status: "skipped"; reason: SkipReason; payout?: BridgePayoutRow }
  | { status: "failed"; reason: string; payout?: BridgePayoutRow }

export type SkipReason =
  | "already_paid"
  | "no_customer"
  | "no_custodial_wallet"
  | "no_payout_address"
  | "auto_forward_disabled"
  | "kyc_not_approved"
  | "sepa_not_approved"
  | "invalid_amount"

export interface ExecutePayoutInput {
  privyUserId: string
  /** Origin: webhook auto-forward vs user-clicked manual withdrawal. */
  trigger: "auto" | "manual"
  /** Decimal-string amount to transfer, in `currency` units. */
  amount: string
  /**
   * Stablecoin to move. Auto-forward passes whatever the inbound activity
   * reported; manual button passes the asset the user is withdrawing. Both
   * EURC and USDC live on the same Stellar custodial wallet, so the
   * destination is shared — only `source.currency` differs per call.
   */
  currency?: OnrampDestinationCurrency
  /**
   * Idempotency anchor stored on the payout row. For auto: the inbound
   * `bridge_event_object_id`. For manual: a synthetic id (e.g.
   * `manual:{privy_user_id}:{ms timestamp}`) so a double-clicked button
   * collapses to one payout.
   */
  sourceActivityId: string | null
  /** When true, skip the auto_forward_enabled gate (manual button bypasses). */
  ignoreAutoForwardFlag?: boolean
}

const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/

function isValidStellarAddress(addr: string | null | undefined): addr is string {
  return typeof addr === "string" && STELLAR_ADDRESS_RE.test(addr)
}

function isPositiveDecimal(amount: string): boolean {
  if (!/^\d+(\.\d+)?$/.test(amount)) return false
  return Number(amount) > 0
}

/**
 * Gate check: returns a skip reason when the customer isn't payout-eligible.
 * Order matters — most specific failures first so the caller can surface a
 * useful message ("link your Stellar wallet" beats "KYC pending").
 */
function gateCustomer(
  customer: BridgeCustomerRow | null,
  trigger: "auto" | "manual",
  ignoreAutoForwardFlag: boolean,
): SkipReason | null {
  if (!customer) return "no_customer"
  if (!customer.bridge_customer_id || !customer.bridge_wallet_id) {
    return "no_custodial_wallet"
  }
  if (!isValidStellarAddress(customer.payout_stellar_address)) {
    return "no_payout_address"
  }
  if (trigger === "auto" && !ignoreAutoForwardFlag && !customer.auto_forward_enabled) {
    return "auto_forward_disabled"
  }
  if (!isKycApproved(customer.kyc_status)) return "kyc_not_approved"
  if (!hasSepaEndorsement(customer.endorsements)) return "sepa_not_approved"
  return null
}

export async function executePayout(
  input: ExecutePayoutInput,
): Promise<ExecutePayoutOutcome> {
  if (!isPositiveDecimal(input.amount)) {
    return { status: "skipped", reason: "invalid_amount" }
  }
  const currency: OnrampDestinationCurrency = input.currency ?? ONRAMP_DESTINATION_CURRENCY

  const customer = await getCustomerByPrivyId(input.privyUserId)
  const gate = gateCustomer(customer, input.trigger, Boolean(input.ignoreAutoForwardFlag))
  if (gate) return { status: "skipped", reason: gate }
  // gateCustomer guaranteed all of these are non-null:
  const c = customer as BridgeCustomerRow
  const bridgeCustomerId = c.bridge_customer_id as string
  const fromWalletId = c.bridge_wallet_id as string
  const destinationAddress = c.payout_stellar_address as string

  // Idempotency: short-circuit before the INSERT for the cheap, common case
  // where a webhook re-fires for an activity we've already paid out.
  if (input.sourceActivityId) {
    const existing = await getPayoutBySourceActivityId(input.sourceActivityId)
    if (existing) {
      return { status: "skipped", reason: "already_paid", payout: existing }
    }
  }

  const row = await insertPendingPayout({
    privyUserId: input.privyUserId,
    bridgeCustomerId,
    sourceActivityId: input.sourceActivityId,
    destinationAddress,
    amount: input.amount,
    currency,
    trigger: input.trigger,
  })
  // ON CONFLICT (source_activity_id) DO NOTHING returns no row when a parallel
  // insert won the race — treat that as "already paid".
  if (!row) {
    const existing = input.sourceActivityId
      ? await getPayoutBySourceActivityId(input.sourceActivityId)
      : null
    return { status: "skipped", reason: "already_paid", payout: existing ?? undefined }
  }

  try {
    const transfer = await createTransfer({
      customerId: bridgeCustomerId,
      fromWalletId,
      sourcePaymentRail: ONRAMP_WALLET_CHAIN,
      sourceCurrency: currency,
      destinationPaymentRail: ONRAMP_WALLET_CHAIN,
      destinationCurrency: currency,
      destinationAddress,
      amount: input.amount,
      // Reuse the payout row id as the Bridge idempotency key — survives
      // process restarts mid-flight, unlike a fresh UUID.
      idempotencyKey: `payout:${row.id}`,
    })

    const terminal = transfer.state === "payment_processed"
    const updated = await updatePayoutStatus(row.id, {
      status: terminal ? "completed" : "submitted",
      bridgeTransferId: transfer.id,
      feeAmount: transfer.developer_fee ?? null,
      stellarTxHash: transfer.receipt?.destination_tx_hash ?? null,
      completed: terminal,
    })
    return { status: "executed", payout: updated ?? row }
  } catch (err) {
    const reason =
      err instanceof BridgeApiError
        ? `bridge_${err.status}: ${JSON.stringify(err.body).slice(0, 400)}`
        : err instanceof Error
          ? err.message
          : "unknown error"
    const failed = await updatePayoutStatus(row.id, {
      status: "failed",
      failureReason: reason,
    })
    return { status: "failed", reason, payout: failed ?? row }
  }
}

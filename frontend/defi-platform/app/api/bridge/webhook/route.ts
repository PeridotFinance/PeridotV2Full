/**
 * POST /api/bridge/webhook
 *
 * Receives Bridge.xyz webhook deliveries (customer / KYC / virtual-account
 * activity). Authentication is the RSA signature — NOT a Privy token — so this
 * route is exempt from the browser-context check in middleware.ts.
 *
 * All handlers are idempotent: customer/KYC updates are plain status writes,
 * and transfer events upsert on the Bridge activity id, so Bridge's
 * at-least-once retries never double-apply.
 */

import { NextRequest, NextResponse } from "next/server"
import { FEATURE_FLAGS } from "@/config/featureFlags"
import {
  SIGNATURE_HEADER,
  parseWebhookEvent,
  verifyWebhookSignature,
} from "@/lib/bridge/webhook"
import { endorsementsToMap, normalizeCustomerKycStatus } from "@/lib/bridge/status"
import {
  getCustomerByBridgeId,
  getVirtualAccountByBridgeId,
  recordTransferEvent,
  updateCustomerStatusByBridgeId,
  upsertCashoutFromDrain,
  type BridgeCashoutRow,
} from "@/lib/bridge/store"
import { executePayout } from "@/lib/bridge/payouts"
import { ensureVirtualAccountForCustomer } from "@/lib/bridge/provision"
import { notifyDepositArrived } from "@/lib/bridge/arrival-push"
import { isOnrampDestinationCurrency } from "../_state"
import type { BridgeWebhookEvent } from "@/lib/bridge/types"

/**
 * Activity types that signify EURC has actually landed in the custodial wallet
 * and is safe to forward. `payment_submitted` and `in_review` are NOT in this
 * set — Bridge still holds the funds at those stages, and a transfer attempt
 * would either be rejected or, worse, race the settlement.
 */
const SETTLED_ACTIVITY_TYPES = new Set(["funds_received", "payment_processed"])

function str(v: unknown): string | null {
  return typeof v === "string" && v ? v : null
}

async function handleCustomerEvent(event: BridgeWebhookEvent): Promise<void> {
  const obj = event.event_object ?? {}
  const bridgeCustomerId = str(obj.id)
  if (!bridgeCustomerId) return
  const endorsements = endorsementsToMap(obj.endorsements as never)
  const customer = await updateCustomerStatusByBridgeId(bridgeCustomerId, {
    // `status` here is the customer-object vocabulary ("active"), not the
    // kyc_link one ("approved") — normalize or this webhook demotes an
    // approved user back to kyc_in_progress until the next poll re-fixes it.
    kycStatus: str(obj.status) ? normalizeCustomerKycStatus(str(obj.status)) : undefined,
    endorsements: Object.keys(endorsements).length ? endorsements : undefined,
    rejectionReasons: obj.rejection_reasons ?? null,
  })
  // Verification just moved — this is the event that flips a user to "may hold
  // an IBAN", so it is where the IBAN gets created. Best-effort inside; the
  // manual "Set up my account" button remains the fallback.
  await ensureVirtualAccountForCustomer(customer)
}

async function handleKycLinkEvent(event: BridgeWebhookEvent): Promise<void> {
  const obj = event.event_object ?? {}
  const bridgeCustomerId = str(obj.customer_id)
  if (!bridgeCustomerId) return
  const customer = await updateCustomerStatusByBridgeId(bridgeCustomerId, {
    kycStatus: str(obj.kyc_status) ?? undefined,
    tosStatus: str(obj.tos_status) ?? undefined,
  })
  // The SEPA endorsement rides on customer events, not this one, so this call
  // usually finds the gates still closed and does nothing. It is here for the
  // order in which Bridge happens to deliver: whichever of the two events
  // completes the picture provisions the account.
  await ensureVirtualAccountForCustomer(customer)
}

async function handleVirtualAccountActivity(event: BridgeWebhookEvent): Promise<void> {
  const obj = event.event_object ?? {}
  const activityId = str(obj.id)
  const virtualAccountId = str(obj.virtual_account_id)
  if (!activityId || !virtualAccountId) return

  // Resolve which Privy user this deposit belongs to.
  let privyUserId: string | null = null
  const va = await getVirtualAccountByBridgeId(virtualAccountId)
  if (va) {
    privyUserId = va.privy_user_id
  } else {
    const customerId = str(obj.customer_id)
    if (customerId) {
      const customer = await getCustomerByBridgeId(customerId)
      privyUserId = customer?.privy_user_id ?? null
    }
  }
  if (!privyUserId) return // unattributable — ack and drop

  const source = (obj.source ?? {}) as Record<string, unknown>
  const activityType = str(obj.type)
  const amount = str(obj.amount)
  await recordTransferEvent({
    bridgeEventObjectId: activityId,
    bridgeAccountId: virtualAccountId,
    privyUserId,
    activityType,
    amount,
    currency: str(obj.currency),
    sourceAmount: str(source.amount),
    sourceCurrency: str(source.currency),
    status: str(event.event_object_status) ?? activityType,
    occurredAt: str(obj.created_at) ?? event.event_created_at,
  })

  // Auto-forward to the user's own Stellar wallet once funds settle.
  // `executePayout` is fully idempotent on `activityId`, so the at-least-once
  // delivery semantics of Bridge webhooks can't double-pay. Skips silently
  // when the user has no payout address yet — the manual button picks up
  // those orphaned funds later.
  if (activityType && SETTLED_ACTIVITY_TYPES.has(activityType) && amount) {
    // Tell the user their transfer landed — the tab that showed the IBAN is
    // long closed by now. Deduped per activity id inside, so the several
    // settled events one deposit produces announce it exactly once. Push
    // failures never touch the webhook ack, same rule as the payout below.
    try {
      await notifyDepositArrived({
        privyUserId,
        activityId,
        amount,
        currency: str(obj.currency),
        sourceAmount: str(source.amount),
        sourceCurrency: str(source.currency),
      })
    } catch (err) {
      console.error("[bridge/webhook] arrival push threw", err)
    }

    // Route the payout in whatever stablecoin the inbound activity is
    // denominated in — EURC for EUR→EURC virtual accounts, USDC for
    // EUR→USDC ones. Unknown currency → fall back to executePayout's default
    // so legacy EURC-only flows keep working.
    const currencyRaw = (str(obj.currency) ?? "").toLowerCase()
    const currency = isOnrampDestinationCurrency(currencyRaw) ? currencyRaw : undefined

    try {
      const outcome = await executePayout({
        privyUserId,
        trigger: "auto",
        amount,
        currency,
        sourceActivityId: activityId,
      })
      if (outcome.status === "failed") {
        console.error("[bridge/webhook] auto-payout failed", {
          activityId,
          reason: outcome.reason,
        })
      } else if (outcome.status === "skipped" && outcome.reason !== "already_paid") {
        console.info("[bridge/webhook] auto-payout skipped", {
          activityId,
          reason: outcome.reason,
        })
      }
    } catch (err) {
      // Never let a payout error fail the webhook ack — the inbound activity
      // is already persisted, and a manual retry path exists.
      console.error("[bridge/webhook] auto-payout threw", err)
    }
  }
}

/**
 * Drain state → our cash-out status. Bridge drains only ever move forward
 * (funds_received → payment_submitted → payment_processed), so this mapping
 * never needs to guard against regressions.
 */
function drainStateToStatus(state: string | null): BridgeCashoutRow["status"] {
  switch (state) {
    case "funds_received":
    case "in_review":
      return "funds_received"
    case "payment_submitted":
      return "payment_submitted"
    case "payment_processed":
      return "completed"
    case "returned":
    case "undeliverable":
      return "returned"
    case "refunded":
    case "refund_in_flight":
      return "refunded"
    case "error":
      return "failed"
    default:
      return "submitted"
  }
}

/**
 * Off-ramp confirmation: Bridge drained a deposit from a liquidation address and
 * is paying the proceeds out over SEPA.
 *
 * Note the direction — we initiated nothing here. The user sent the funds
 * themselves, so this webhook is the FIRST time the server hears about the
 * withdrawal in the general case. Hence the upsert: usually our own
 * /offramp/cashout call created the row moments earlier, but a user who sends
 * to their liquidation address straight from an external wallet has made a
 * perfectly real withdrawal that should still show up in their history.
 */
async function handleLiquidationAddressEvent(event: BridgeWebhookEvent): Promise<void> {
  const obj = event.event_object ?? {}
  const drainId = str(obj.id)
  // The user's inbound payment hash is our join key back to `bridge_cashouts`.
  // Without it we can't attribute the drain to a row, and inserting on a null
  // key would defeat the unique index — drop it.
  const depositTxHash = str(obj.deposit_tx_hash)
  if (!drainId || !depositTxHash) return

  const bridgeCustomerId = str(obj.customer_id)
  if (!bridgeCustomerId) return
  const customer = await getCustomerByBridgeId(bridgeCustomerId)
  if (!customer) return // unattributable — ack and drop

  const state = str(event.event_object_status) ?? str(obj.state)
  const status = drainStateToStatus(state)
  const destination = (obj.destination ?? {}) as Record<string, unknown>

  await upsertCashoutFromDrain({
    privyUserId: customer.privy_user_id,
    bridgeCustomerId,
    stellarTxHash: depositTxHash.toLowerCase(),
    bridgeDrainId: drainId,
    amount: str(obj.amount) ?? "0",
    currency: (str(obj.currency) ?? "eurc").toLowerCase(),
    // The euro figure only exists once Bridge has actually converted.
    fiatAmount: str(obj.destination_amount) ?? null,
    destinationCurrency: (str(destination.currency) ?? "eur").toLowerCase(),
    status,
    completed: status === "completed",
  })
}

export async function POST(req: NextRequest) {
  if (!FEATURE_FLAGS.FIAT_ONRAMP_BRIDGE) {
    return NextResponse.json({ error: "disabled" }, { status: 404 })
  }

  // Raw body is required — re-serialising parsed JSON would break the signature.
  const rawBody = await req.text()
  const signature = req.headers.get(SIGNATURE_HEADER)

  const verification = verifyWebhookSignature(signature, rawBody)
  if (!verification.valid) {
    console.warn("[bridge/webhook] rejected delivery:", verification.reason)
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  let event: BridgeWebhookEvent
  try {
    event = parseWebhookEvent(rawBody)
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
  }

  try {
    const category = (event.event_category || "").toLowerCase()
    if (category.startsWith("customer")) {
      await handleCustomerEvent(event)
    } else if (category.startsWith("kyc_link")) {
      await handleKycLinkEvent(event)
    } else if (category.startsWith("virtual_account")) {
      await handleVirtualAccountActivity(event)
    } else if (category.startsWith("liquidation_address")) {
      // Off-ramp drains. Gated separately: the cash-out tables only exist where
      // the off-ramp migration has run, and an unknown category is acked anyway.
      if (FEATURE_FLAGS.FIAT_OFFRAMP_BRIDGE) {
        await handleLiquidationAddressEvent(event)
      }
    }
    // Unknown categories are acknowledged so Bridge stops retrying them.
    return NextResponse.json({ received: true })
  } catch (err) {
    // 500 → Bridge retries later; safe because every handler is idempotent.
    console.error("[bridge/webhook] handler error", event.event_type, err)
    return NextResponse.json({ error: "Processing failed" }, { status: 500 })
  }
}

/**
 * POST /api/bridge/payout
 *
 * Manually forwards EURC from the user's Bridge-managed custodial Stellar
 * wallet to the user's own Stellar wallet. Used by the "Withdraw to my Stellar
 * wallet" button, plus as a fallback when the webhook auto-forward couldn't
 * fire (e.g. the user had no payout address linked when SEPA settled).
 *
 * Body:
 *   { amount?: string }   // decimal EURC; omit to sweep the full available balance
 *
 * Response:
 *   { status: "executed" | "skipped" | "failed", reason?: string, payout?: {...} }
 *
 * Idempotency: each click reserves a `bridge_payouts` row keyed on a synthetic
 * `manual:{privyUserId}:{ms}` id. A double-click within the same millisecond
 * collides on that key and collapses to one Bridge transfer.
 */

import { NextRequest, NextResponse } from "next/server"
import { FEATURE_FLAGS } from "@/config/featureFlags"
import { authenticateBridgeRequest } from "@/lib/bridge/auth"
import { getCustomerByPrivyId } from "@/lib/bridge/store"
import { getStellarStablecoinBalances } from "@/lib/bridge/stellar-balance"
import { executePayout } from "@/lib/bridge/payouts"
import {
  ONRAMP_DESTINATION_CURRENCY,
  isOnrampDestinationCurrency,
  type OnrampDestinationCurrency,
} from "../_state"

function isPositiveDecimal(s: unknown): s is string {
  return typeof s === "string" && /^\d+(\.\d+)?$/.test(s) && Number(s) > 0
}

export async function POST(req: NextRequest) {
  if (!FEATURE_FLAGS.FIAT_ONRAMP_BRIDGE) {
    return NextResponse.json({ error: "Fiat on-ramp is disabled" }, { status: 404 })
  }

  const auth = await authenticateBridgeRequest(req)
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { amount?: unknown; currency?: unknown } = {}
  try {
    const raw = await req.text()
    if (raw) body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  // Pick the stablecoin to withdraw. Default = EURC for backward compatibility
  // with the original euro-only withdraw button.
  const currency: OnrampDestinationCurrency = isOnrampDestinationCurrency(body.currency)
    ? body.currency
    : ONRAMP_DESTINATION_CURRENCY

  // Default to "sweep everything available" — that's the trade-republic-y
  // expectation of "withdraw to my wallet". Custom amounts (partial) are
  // accepted for power users.
  let amount: string | null = null
  if (body.amount === undefined || body.amount === null) {
    const customer = await getCustomerByPrivyId(auth.userId)
    if (!customer) return NextResponse.json({ status: "skipped", reason: "no_customer" })
    const balances = await getStellarStablecoinBalances(customer.bridge_wallet_address)
    const available = currency === "usdc" ? balances.usdc : balances.eurc
    if (available <= 0) {
      return NextResponse.json({ status: "skipped", reason: "no_balance" })
    }
    // Stellar uses 7-decimal precision; round down so we never overdraft.
    amount = (Math.floor(available * 1e7) / 1e7).toFixed(7)
  } else if (isPositiveDecimal(body.amount)) {
    amount = body.amount
  } else {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 })
  }

  const outcome = await executePayout({
    privyUserId: auth.userId,
    trigger: "manual",
    amount,
    currency,
    // Synthetic anchor is currency-scoped so a parallel "withdraw EUR" and
    // "withdraw USD" at the same millisecond don't collide on the unique key.
    sourceActivityId: `manual:${auth.userId}:${currency}:${Date.now()}`,
    ignoreAutoForwardFlag: true,
  })

  const httpStatus = outcome.status === "failed" ? 502 : 200
  return NextResponse.json(outcome, { status: httpStatus })
}

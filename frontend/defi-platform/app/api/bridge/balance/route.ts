/**
 * GET /api/bridge/balance
 *
 * Returns the authenticated user's stablecoin balances held by Bridge so the
 * rest of the app can show "you have €X" / "you have $X" without wiring the
 * on-ramp sheet's state machine into every surface that needs it.
 *
 *   {
 *     eurc: {
 *       available: number   // EURC sitting in the Bridge-managed Stellar wallet
 *       pending:   number   // SEPA → EURC Bridge has ack'd but not settled
 *     },
 *     usdc: {
 *       available: number   // USDC on the same Stellar wallet (post EUR→USDC FX)
 *       pending:   number
 *     },
 *
 *     // Legacy fields for callers that haven't been updated to read .eurc.
 *     available: number, pending: number, currency: "EUR",
 *
 *     walletAddress:  string | null,
 *     lastAutoPayout: { id, amount, currency, createdAt, status } | null
 *   }
 *
 * `available` is the live Horizon balance — source of truth, slightly lagging
 * webhooks. `pending` is the un-settled portion summed from
 * `bridge_transfer_events`, so the user sees money "on its way" before Bridge
 * has written the credit to Stellar.
 *
 * Zero is returned for users with no on-ramp customer yet — keeps callers
 * branch-free; "no balance" looks the same as "no customer".
 */

import { NextRequest, NextResponse } from "next/server"
import { FEATURE_FLAGS } from "@/config/featureFlags"
import { authenticateBridgeRequest } from "@/lib/bridge/auth"
import { getStellarStablecoinBalances } from "@/lib/bridge/stellar-balance"
import {
  getCustomerByPrivyId,
  getLatestAutoPayoutForUser,
  sumPendingTransfersForUser,
} from "@/lib/bridge/store"

interface PerAsset {
  available: number
  pending: number
}

interface BalanceResponse {
  eurc: PerAsset
  usdc: PerAsset
  // Legacy fields — EUR-centric snapshot the old UI reads.
  available: number
  pending: number
  currency: "EUR"
  walletAddress: string | null
  lastAutoPayout: {
    id: string
    amount: string
    currency: string | null
    createdAt: string
    status: string
  } | null
}

const ZERO_ASSET: PerAsset = { available: 0, pending: 0 }
const ZERO: BalanceResponse = {
  eurc: ZERO_ASSET,
  usdc: ZERO_ASSET,
  available: 0,
  pending: 0,
  currency: "EUR",
  walletAddress: null,
  lastAutoPayout: null,
}

export async function GET(req: NextRequest) {
  if (!FEATURE_FLAGS.FIAT_ONRAMP_BRIDGE) {
    return NextResponse.json({ error: "Fiat on-ramp is disabled" }, { status: 404 })
  }

  const auth = await authenticateBridgeRequest(req)
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const customer = await getCustomerByPrivyId(auth.userId)
    if (!customer) return NextResponse.json(ZERO)

    const [chain, eurcPending, usdcPending, latestAuto] = await Promise.all([
      getStellarStablecoinBalances(customer.bridge_wallet_address),
      sumPendingTransfersForUser(auth.userId, "eurc").catch(() => 0),
      sumPendingTransfersForUser(auth.userId, "usdc").catch(() => 0),
      getLatestAutoPayoutForUser(auth.userId).catch(() => null),
    ])

    const body: BalanceResponse = {
      eurc: { available: chain.eurc, pending: eurcPending },
      usdc: { available: chain.usdc, pending: usdcPending },
      // Legacy EUR-only fields for older clients.
      available: chain.eurc,
      pending: eurcPending,
      currency: "EUR",
      walletAddress: customer.bridge_wallet_address,
      lastAutoPayout: latestAuto
        ? {
            id: latestAuto.id,
            amount: latestAuto.amount,
            currency: latestAuto.currency,
            createdAt: latestAuto.created_at,
            status: latestAuto.status,
          }
        : null,
    }
    return NextResponse.json(body)
  } catch (err) {
    console.error("[bridge/balance] failed", err)
    return NextResponse.json({ error: "Could not load balance" }, { status: 500 })
  }
}

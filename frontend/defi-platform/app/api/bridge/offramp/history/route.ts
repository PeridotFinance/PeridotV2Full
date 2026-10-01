/**
 * GET /api/bridge/offramp/history
 *
 * The user's cash-outs, newest first.
 *
 * The serialized shape stays jargon-free in the spirit of `_state.ts` — the
 * user sees an amount, a status and a date. The Stellar tx hash is included
 * because it's the only handle support has if a withdrawal goes missing, but
 * the UI is not expected to show it by default.
 */

import { NextRequest, NextResponse } from "next/server"
import { FEATURE_FLAGS } from "@/config/featureFlags"
import { authenticateBridgeRequest } from "@/lib/bridge/auth"
import { listCashoutsForUser, type BridgeCashoutRow } from "@/lib/bridge/store"

/** Statuses where Bridge still owes the user money. */
const IN_FLIGHT = new Set(["submitted", "funds_received", "payment_submitted"])

function serialize(row: BridgeCashoutRow) {
  return {
    id: row.id,
    amount: row.amount,
    currency: row.currency,
    fiatAmount: row.fiat_amount,
    destinationCurrency: row.destination_currency,
    status: row.status,
    failureReason: row.failure_reason,
    stellarTxHash: row.stellar_tx_hash,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  }
}

export async function GET(req: NextRequest) {
  if (!FEATURE_FLAGS.FIAT_OFFRAMP_BRIDGE) {
    return NextResponse.json({ error: "Cash out is disabled" }, { status: 404 })
  }

  const auth = await authenticateBridgeRequest(req)
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const rows = await listCashoutsForUser(auth.userId)
  return NextResponse.json({
    cashouts: rows.map(serialize),
    // Drives the UI's poll-while-pending behaviour, same as the on-ramp's
    // transfers route.
    pending: rows.some((r) => IN_FLIGHT.has(r.status)),
  })
}

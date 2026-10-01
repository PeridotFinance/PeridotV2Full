/**
 * GET /api/bridge/transfers
 *
 * Returns the authenticated user's fiat top-up history, fed by Bridge webhooks.
 * Amounts are reported in the euro the user actually sent — the USDC settlement
 * detail is intentionally not exposed.
 */

import { NextRequest, NextResponse } from "next/server"
import { FEATURE_FLAGS } from "@/config/featureFlags"
import { authenticateBridgeRequest } from "@/lib/bridge/auth"
import { isBridgeConfigured } from "@/lib/bridge/client"
import { listTransferEvents, type BridgeTransferEventRow } from "@/lib/bridge/store"

/** Coarse status the UI renders, derived from Bridge's activity type. */
type FriendlyStatus = "processing" | "completed" | "in_review" | "refunded"

function friendlyStatus(row: BridgeTransferEventRow): FriendlyStatus {
  const type = (row.activity_type || row.status || "").toLowerCase()
  if (type.includes("refund")) return "refunded"
  if (type.includes("review")) return "in_review"
  if (type.includes("processed") || type.includes("completed") || type.includes("paid")) {
    return "completed"
  }
  return "processing"
}

function serializeTransfer(row: BridgeTransferEventRow) {
  // Prefer the fiat amount the user sent; fall back to the settled amount.
  const amount = row.source_amount ?? row.amount
  const currency = (row.source_currency ?? "eur").toUpperCase()
  return {
    id: row.bridge_event_object_id,
    amount: amount != null ? Number(amount) : null,
    currency,
    status: friendlyStatus(row),
    date: row.occurred_at ?? row.created_at,
  }
}

export async function GET(req: NextRequest) {
  if (!FEATURE_FLAGS.FIAT_ONRAMP_BRIDGE) {
    return NextResponse.json({ error: "Fiat on-ramp is disabled" }, { status: 404 })
  }
  if (!isBridgeConfigured()) {
    return NextResponse.json({ error: "On-ramp is not configured" }, { status: 503 })
  }

  const auth = await authenticateBridgeRequest(req)
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const rows = await listTransferEvents(auth.userId)
    const transfers = rows.map(serializeTransfer)
    const pending = transfers.some(
      (t) => t.status === "processing" || t.status === "in_review",
    )
    return NextResponse.json({ transfers, pending })
  } catch (err) {
    console.error("[bridge/transfers] failed", err)
    return NextResponse.json({ error: "Could not load top-up history" }, { status: 500 })
  }
}

/**
 * POST /api/bridge/offramp/cashout
 *
 * Records a cash-out the user has ALREADY broadcast. Unlike the on-ramp's
 * payout route, this initiates nothing: by the time it runs, the client has
 * signed and submitted the Stellar payment and the money is on its way to
 * Bridge. This only writes it down so it appears in history before the drain
 * webhook confirms it.
 *
 * That means a failure here never costs the user their withdrawal — the drain
 * webhook reconciles regardless, and will insert the row itself if this call
 * never lands.
 *
 * Body:
 *   { stellarTxHash: string, amount: string, currency?: "eurc" | "usdc" }
 *   // amount is a decimal in the sent asset; currency defaults to eurc
 *
 * Response:
 *   { status: "recorded" | "skipped" | "failed", reason?: string, cashout?: {...} }
 *
 * Idempotency: the Stellar tx hash is the anchor, so re-reporting the same
 * payment collapses to `skipped: already_submitted`.
 */

import { NextRequest, NextResponse } from "next/server"
import { FEATURE_FLAGS } from "@/config/featureFlags"
import { authenticateBridgeRequest } from "@/lib/bridge/auth"
import { isOfframpCurrency, recordCashoutSubmission } from "@/lib/bridge/offramp"

/** Stellar tx hashes are 32-byte hex digests. */
const TX_HASH_RE = /^[0-9a-f]{64}$/i

export async function POST(req: NextRequest) {
  if (!FEATURE_FLAGS.FIAT_OFFRAMP_BRIDGE) {
    return NextResponse.json({ error: "Cash out is disabled" }, { status: 404 })
  }

  const auth = await authenticateBridgeRequest(req)
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { stellarTxHash?: unknown; amount?: unknown; currency?: unknown } = {}
  try {
    const raw = await req.text()
    if (raw) body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const stellarTxHash =
    typeof body.stellarTxHash === "string" ? body.stellarTxHash.trim() : ""
  if (!TX_HASH_RE.test(stellarTxHash)) {
    return NextResponse.json({ error: "Invalid stellarTxHash" }, { status: 400 })
  }
  if (typeof body.amount !== "string") {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 })
  }
  // Absent = EURC: clients predating the USDC leg never send it.
  if (body.currency !== undefined && !isOfframpCurrency(body.currency)) {
    return NextResponse.json({ error: "Invalid currency" }, { status: 400 })
  }

  const outcome = await recordCashoutSubmission({
    privyUserId: auth.userId,
    stellarTxHash: stellarTxHash.toLowerCase(),
    amount: body.amount,
    currency: body.currency as "eurc" | "usdc" | undefined,
  })

  const httpStatus = outcome.status === "failed" ? 502 : 200
  return NextResponse.json(outcome, { status: httpStatus })
}

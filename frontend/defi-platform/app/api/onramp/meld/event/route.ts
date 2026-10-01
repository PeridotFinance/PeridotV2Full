/**
 * POST /api/onramp/meld/event
 *
 * Records the lifecycle of a Meld card on-ramp purchase. Privy's `fund()` gives
 * us no amount and no webhook, so the client reports two phases:
 *   - `initiated` — purchase confirmed in Meld; we store the destination and a
 *     balance baseline so settlement can be detected (here or via reconcile).
 *   - `settled`   — the client's balance-watch saw the delta land; we record the
 *     credited amount. Idempotent on a client-generated key.
 *
 * Identity comes from the verified Privy token, never the body.
 */

import { NextRequest, NextResponse } from "next/server"
import { FEATURE_FLAGS } from "@/config/featureFlags"
import { authenticateOnrampRequest } from "@/lib/onramp/auth"
import { recordInitiated, markSettled } from "@/lib/onramp/store"
import type { MeldAsset } from "@/lib/onramp/meld"

const VALID_ASSETS = new Set<MeldAsset>(["usdc", "usdt"])

export async function POST(req: NextRequest) {
  if (!FEATURE_FLAGS.FIAT_ONRAMP_MELD) {
    return NextResponse.json({ error: "Meld on-ramp is disabled" }, { status: 404 })
  }

  const auth = await authenticateOnrampRequest(req)
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const idempotencyKey = String(body?.idempotencyKey ?? "").trim()
  if (!idempotencyKey) {
    return NextResponse.json({ error: "Missing idempotencyKey" }, { status: 400 })
  }

  try {
    if (body?.phase === "initiated") {
      const asset = String(body?.asset ?? "").toLowerCase() as MeldAsset
      const chain = String(body?.chain ?? "")
      const address = String(body?.address ?? "")
      const baselineAmount = Number(body?.baselineAmount)
      if (!VALID_ASSETS.has(asset) || !chain || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
        return NextResponse.json({ error: "Invalid initiation payload" }, { status: 400 })
      }
      if (!Number.isFinite(baselineAmount) || baselineAmount < 0) {
        return NextResponse.json({ error: "Invalid baselineAmount" }, { status: 400 })
      }
      const row = await recordInitiated({
        idempotencyKey,
        privyUserId: auth.userId,
        address,
        chain,
        asset,
        fiatHint: body?.fiatHint ? String(body.fiatHint).toLowerCase() : null,
        baselineAmount,
      })
      return NextResponse.json({ ok: true, id: row.id, status: row.status })
    }

    if (body?.phase === "settled") {
      const amount = Number(body?.amount)
      if (!Number.isFinite(amount) || amount <= 0) {
        return NextResponse.json({ error: "Invalid amount" }, { status: 400 })
      }
      const row = await markSettled({
        idempotencyKey,
        privyUserId: auth.userId,
        amount,
        via: "client",
      })
      // Null → already settled/expired; treat as a no-op success (idempotent).
      return NextResponse.json({ ok: true, settled: !!row })
    }

    return NextResponse.json({ error: "Unknown phase" }, { status: 400 })
  } catch (err) {
    console.error("[onramp/meld/event] failed", err)
    return NextResponse.json({ error: "Could not record event" }, { status: 500 })
  }
}

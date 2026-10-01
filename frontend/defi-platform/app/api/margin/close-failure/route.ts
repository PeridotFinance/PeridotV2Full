/**
 * Client-side close-failure reporting.
 *
 *   POST /api/margin/close-failure — record one failed close attempt.
 *
 * The gap this fills: when a close dies in the browser, the ONLY trace is a
 * console line in a tab nobody is watching. A Short position that could not be
 * closed at all went unnoticed for three days that way — the server sweeper
 * dutifully expired the stranded pending once a minute and logged a clean
 * recovery, so from the outside everything looked healthy while the trader was
 * stuck in a loop.
 *
 * Rows land in `margin_close_sweeps` (same shape: position, owner, action,
 * error) under a DISTINCT action — `client_failed`, never `failed` — because the
 * sweeper counts its own `failed` rows for backoff and must not be parked by a
 * browser's bad day.
 *
 * Best-effort by contract: the caller fires and forgets, and every failure here
 * is swallowed. Reporting a broken close must never be the reason a close looks
 * broken.
 */
import { NextRequest, NextResponse } from "next/server"
import { FEATURE_FLAGS } from "@/config/featureFlags"
import { authorizeStellarAddress } from "@/lib/stellar/wallet-auth"
import { sql } from "@/lib/database"

export const runtime = "nodejs"

const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/

export async function POST(req: NextRequest) {
  if (!FEATURE_FLAGS.WALLET_PRIVY_STELLAR_EMBEDDED) {
    return NextResponse.json({ error: "not_enabled" }, { status: 404 })
  }

  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }

  const address = typeof body.userAddress === "string" ? body.userAddress : ""
  if (!STELLAR_ADDRESS_RE.test(address)) {
    return NextResponse.json({ error: "invalid_address" }, { status: 400 })
  }
  const positionId = String(body.positionId ?? "")
  if (!/^\d{1,20}$/.test(positionId)) {
    return NextResponse.json({ error: "invalid_position_id" }, { status: 400 })
  }

  const auth = await authorizeStellarAddress(req, address)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  // Which leg died and on which side — the two facts that turned "closes are
  // broken" into "Short closes trap in the swap leg". Capped hard: this string is
  // attacker-supplied and lands in an ops log.
  const step = typeof body.step === "string" ? body.step.slice(0, 32) : "unknown"
  const side = typeof body.side === "string" ? body.side.slice(0, 8) : "unknown"
  // 400 chars was too tight to be useful: a Soroban trap spends its first ~200
  // on the host error and the frame that panicked, so the cap cut the log off
  // exactly where the cause lives — the inner call whose return preceded the
  // panic. Diagnosing the Short-close trap meant reconstructing that from the
  // contract source instead of reading it here. 4 KB keeps the whole event log
  // for a normal trap while still bounding an attacker-supplied string.
  const reason = typeof body.error === "string" ? body.error.slice(0, 4_000) : ""
  const detail = `[${side}/${step}] ${reason}`.slice(0, 4_100)

  try {
    await sql`
      INSERT INTO margin_close_sweeps (position_id, user_address, action, tx_hash, error, network)
      VALUES (${positionId}, ${address}, 'client_failed', NULL, ${detail}, 'testnet')
    `
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[margin/close-failure] insert failed:", e)
    return NextResponse.json({ error: "insert_failed" }, { status: 500 })
  }
}

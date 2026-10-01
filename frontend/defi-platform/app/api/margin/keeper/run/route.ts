/**
 * Always-on margin TP/SL keeper — executor (cron-driven).
 *
 *   POST /api/margin/keeper/run    (Bearer MARGIN_KEEPER_RUN_TOKEN)
 *
 * One pass over all armed rows: expire stale signatures, fetch XLM/USD spot, and
 * submit the pre-signed repay-only close for any position whose TP/SL crossed.
 * A cron polls this on an interval. Token-gated so only the cron (not the
 * public) can drive it.
 *
 * Fails closed: no STELLAR_KEEPER_SECRET → `enabled:false`, no-op. No run token
 * configured → 503 (never run unauthenticated).
 */
import { NextRequest, NextResponse } from "next/server"
import { FEATURE_FLAGS } from "@/config/featureFlags"
import { runKeeperOnce } from "@/lib/margin/keeper-execute"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

function authorized(req: NextRequest): boolean {
  const token = process.env.MARGIN_KEEPER_RUN_TOKEN?.trim()
  if (!token) return false
  const header = req.headers.get("authorization") || ""
  const provided = header.startsWith("Bearer ") ? header.slice(7) : req.nextUrl.searchParams.get("token") || ""
  // Length-aware constant-ish compare (tokens are server-fixed; timing is moot,
  // but avoid the trivially-short mismatch shortcut leaking length).
  if (provided.length !== token.length) return false
  let diff = 0
  for (let i = 0; i < token.length; i++) diff |= provided.charCodeAt(i) ^ token.charCodeAt(i)
  return diff === 0
}

export async function POST(req: NextRequest) {
  if (!FEATURE_FLAGS.MARGIN_KEEPER_ALWAYS_ON) {
    return NextResponse.json({ error: "not_enabled" }, { status: 404 })
  }
  if (!process.env.MARGIN_KEEPER_RUN_TOKEN?.trim()) {
    return NextResponse.json({ error: "run_token_unconfigured" }, { status: 503 })
  }
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  try {
    // Ops/test price override (?price=) — caller is already run-token-gated.
    const priceRaw = req.nextUrl.searchParams.get("price")
    const priceOverride = priceRaw ? Number(priceRaw) : undefined
    const summary = await runKeeperOnce(priceOverride && priceOverride > 0 ? priceOverride : undefined)
    return NextResponse.json(summary)
  } catch (e) {
    console.error("[margin/keeper/run] failed:", e)
    return NextResponse.json({ error: "run_failed", message: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

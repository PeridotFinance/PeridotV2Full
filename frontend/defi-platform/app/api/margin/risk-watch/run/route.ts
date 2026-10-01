/**
 * Liquidation-warning pass (cron-driven).
 *
 *   POST /api/margin/risk-watch/run    (Bearer MARGIN_KEEPER_RUN_TOKEN)
 *
 * Reads health on chain for every address with a live push subscription and
 * pushes a notification for anything close to liquidation. Shares the keeper's
 * run token and cron host — it is the same job family and the same trust
 * boundary, and a second token would be a second thing to rotate.
 *
 * Fails closed: no VAPID keys → `enabled:false`, no-op. No run token configured
 * → 503, never an unauthenticated run.
 */
import { NextRequest, NextResponse } from "next/server"
import { runRiskWatchOnce } from "@/lib/margin/risk-watch"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

function authorized(req: NextRequest): boolean {
  const token = process.env.MARGIN_KEEPER_RUN_TOKEN?.trim()
  if (!token) return false
  const header = req.headers.get("authorization") || ""
  const provided = header.startsWith("Bearer ") ? header.slice(7) : req.nextUrl.searchParams.get("token") || ""
  if (provided.length !== token.length) return false
  let diff = 0
  for (let i = 0; i < token.length; i++) diff |= provided.charCodeAt(i) ^ token.charCodeAt(i)
  return diff === 0
}

export async function POST(req: NextRequest) {
  if (!process.env.MARGIN_KEEPER_RUN_TOKEN?.trim()) {
    return NextResponse.json({ error: "run_token_unconfigured" }, { status: 503 })
  }
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  try {
    return NextResponse.json(await runRiskWatchOnce())
  } catch (e) {
    console.error("[margin/risk-watch/run] failed:", e)
    return NextResponse.json({ error: "run_failed", message: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

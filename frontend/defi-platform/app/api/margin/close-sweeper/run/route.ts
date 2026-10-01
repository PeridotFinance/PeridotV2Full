/**
 * Pending-close sweeper — executor (cron-driven).
 *
 *   POST /api/margin/close-sweeper/run    (Bearer MARGIN_KEEPER_RUN_TOKEN)
 *
 * Cranks stranded V3 split closes to completion for users who aren't watching:
 * `finish` when the swap already landed, `expire` when an un-swapped pending
 * timed out. Both legs are permissionless, so no user signature is involved —
 * see `lib/margin/close-sweeper.ts` for why this is the floor under the UI's
 * recovery banner rather than a duplicate of it.
 *
 * Deliberately NOT gated on MARGIN_KEEPER_ALWAYS_ON: the TP/SL keeper is a
 * trading feature that can be switched off, this is a funds-recovery safety net
 * that must keep running as long as margin trading is live. It shares that
 * feature's run token and keeper account.
 *
 * Fails closed: no STELLAR_KEEPER_SECRET → `enabled:false`, no-op. No run token
 * configured → 503 (never run unauthenticated).
 *
 * Ops: `?address=G…` restricts the pass to one trader (debugging a report).
 */
import { NextRequest, NextResponse } from "next/server"
import { FEATURE_FLAGS } from "@/config/featureFlags"
import { sweepPendingClosesOnce } from "@/lib/margin/close-sweeper"

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
  if (!FEATURE_FLAGS.MARGIN_TRADING_STELLAR) {
    return NextResponse.json({ error: "not_enabled" }, { status: 404 })
  }
  if (!process.env.MARGIN_KEEPER_RUN_TOKEN?.trim()) {
    return NextResponse.json({ error: "run_token_unconfigured" }, { status: 503 })
  }
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  try {
    const one = req.nextUrl.searchParams.get("address")?.trim()
    const summary = await sweepPendingClosesOnce(one ? { addresses: [one] } : undefined)
    return NextResponse.json(summary)
  } catch (e) {
    console.error("[margin/close-sweeper/run] failed:", e)
    return NextResponse.json(
      { error: "sweep_failed", message: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}

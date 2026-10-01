/**
 * Ambassador milestone sweep (cron-driven).
 *
 *   POST /api/referral/ambassador/run    (Bearer REFERRAL_AMBASSADOR_RUN_TOKEN)
 *
 * Reads how much every not-yet-qualified invitee has supplied on Stellar,
 * advances or resets their 30-day streak, and books the $5/$5 rewards when the
 * milestone is met. Idempotent — a referral already checked today is skipped,
 * so running twice in an hour costs one query.
 *
 * Fails closed: no run token configured → 503, never an unauthenticated run.
 */
import { NextRequest, NextResponse } from "next/server"
import { runAmbassadorSweep } from "@/lib/referral/ambassador-sweep"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

function authorized(req: NextRequest): boolean {
  const token = process.env.REFERRAL_AMBASSADOR_RUN_TOKEN?.trim()
  if (!token) return false
  const header = req.headers.get("authorization") || ""
  const provided = header.startsWith("Bearer ")
    ? header.slice(7)
    : req.nextUrl.searchParams.get("token") || ""
  if (provided.length !== token.length) return false
  let diff = 0
  for (let i = 0; i < token.length; i++) diff |= provided.charCodeAt(i) ^ token.charCodeAt(i)
  return diff === 0
}

export async function POST(req: NextRequest) {
  if (!process.env.REFERRAL_AMBASSADOR_RUN_TOKEN?.trim()) {
    return NextResponse.json({ error: "run_token_unconfigured" }, { status: 503 })
  }
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  try {
    return NextResponse.json(await runAmbassadorSweep())
  } catch (e) {
    console.error("[referral/ambassador/run] failed:", e)
    return NextResponse.json(
      { error: "run_failed", message: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    )
  }
}

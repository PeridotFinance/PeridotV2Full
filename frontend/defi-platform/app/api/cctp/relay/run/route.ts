/**
 * Cross-chain relay pass (cron-driven), for both rails.
 *
 *   POST /api/cctp/relay/run    (Bearer CCTP_RELAY_RUN_TOKEN)
 *
 * The safety net behind the browser. CCTP: fetches Circle's attestation for
 * every burn still waiting and mints it on Stellar. SODAX: hands reported
 * hashes to the relay and follows them to delivery (lib/crosschain/poller.ts).
 * Both stop at delivery; supplying is the user's decision and is asked in the
 * UI (see lib/cctp/process.ts).
 *
 * The two passes are independent: a missing CCTP relayer key or a SODAX outage
 * leaves the other rail working. `idle` is true when neither had anything to do,
 * which is what the cron script keys its silence on.
 *
 * Fails closed: no run token configured → 503, never an unauthenticated run.
 * No relayer key → `enabled:false` and a no-op, because failing transfers we
 * cannot move would be worse than leaving them for the next pass.
 */
import { NextRequest, NextResponse } from "next/server"
import { runCctpPassOnce } from "@/lib/cctp/process"
import { runSodaxPassOnce } from "@/lib/crosschain/poller"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

/** Constant-time compare — same shape as the margin keeper's gate. */
function authorized(req: NextRequest): boolean {
  const token = process.env.CCTP_RELAY_RUN_TOKEN?.trim()
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
  if (!process.env.CCTP_RELAY_RUN_TOKEN?.trim()) {
    return NextResponse.json({ error: "run_token_unconfigured" }, { status: 503 })
  }
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  try {
    const [cctp, sodax] = await Promise.all([
      runCctpPassOnce(),
      runSodaxPassOnce().catch((e) => ({
        scanned: 0,
        moved: {},
        errors: [{ id: 0, step: "pass", message: e instanceof Error ? e.message : String(e) }],
      })),
    ])
    const idle = cctp.scanned === 0 && cctp.errors.length === 0 && sodax.scanned === 0 && sodax.errors.length === 0
    return NextResponse.json({ ...cctp, sodax, idle })
  } catch (e) {
    console.error("[cctp/relay/run] failed:", e)
    return NextResponse.json(
      { error: "run_failed", message: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}

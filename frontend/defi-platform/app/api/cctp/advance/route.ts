/**
 * Push one transfer forward now.
 *
 *   POST /api/cctp/advance   { stellarAddress, burnTxHash }
 *
 * The cron would pick this transfer up within the minute; this endpoint exists
 * so the ordinary case — a user sitting in front of the progress row — does not
 * have to wait for it. The tab calls it while it polls.
 *
 * Same state-guarded transitions as the cron, so the two racing each other cost
 * one wasted simulation and nothing else.
 */
import { NextRequest, NextResponse } from "next/server"
import { authorizeStellarAddress } from "@/lib/stellar/wallet-auth"
import { advanceTransfer } from "@/lib/cctp/process"
import { getByBurnTxHash } from "@/lib/cctp/store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const stellarAddress = String(body?.stellarAddress || "").toUpperCase()
  const burnTxHash = String(body?.burnTxHash || "")

  if (!STELLAR_ADDRESS_RE.test(stellarAddress) || !burnTxHash) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 })
  }

  const auth = await authorizeStellarAddress(req, stellarAddress)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status || 401 })

  // Ownership is proven for the address, not for the row — check the row is
  // actually this user's before doing anything with it.
  const existing = await getByBurnTxHash(burnTxHash)
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 })
  if (existing.stellar_address !== stellarAddress) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  try {
    return NextResponse.json({ transfer: await advanceTransfer(burnTxHash) })
  } catch (e) {
    // The transfer is not lost when this fails — the cron will try again. Say so
    // rather than returning a bare 500 the UI would have to guess about.
    console.error("[cctp/advance] failed:", e)
    return NextResponse.json(
      { error: "advance_failed", retrying: true, message: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    )
  }
}

/**
 * A wallet's Robinhood margin history, straight from chain events
 * (lib/robinhood/indexer.ts): every position it opened with every later
 * event on those ids, plus its own vault deposits, withdrawals and reward
 * settlements. Public data, so no auth: anyone can read the same logs.
 *
 * Each event carries the NVDA feed price at its block time; the client turns
 * the list into per-position cash flows and P&L (lib/robinhood/activity.ts)
 * because only it holds the live equity an open position is worth right now.
 */
import { NextRequest, NextResponse } from "next/server"
import { isAddress } from "viem"
import { ensureRobinhoodIndex, getRobinhoodIndexMeta, getRobinhoodUserEvents } from "@/lib/robinhood/indexer"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const user = request.nextUrl.searchParams.get("user") ?? ""
  if (!isAddress(user)) {
    return NextResponse.json({ error: "user must be an address" }, { status: 400 })
  }
  // `fresh=1` comes from a client whose own transaction just confirmed; the
  // index still refuses to rescan more often than every few seconds.
  const fresh = request.nextUrl.searchParams.get("fresh") === "1"
  try {
    await ensureRobinhoodIndex(fresh ? 0 : undefined)
  } catch (err) {
    console.error("[robinhood-activity] index refresh failed:", err)
    return NextResponse.json({ error: "History unavailable" }, { status: 503 })
  }
  return NextResponse.json({ events: getRobinhoodUserEvents(user), ...getRobinhoodIndexMeta() })
}

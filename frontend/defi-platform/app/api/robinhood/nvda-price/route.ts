/**
 * NVDA/USD history for the Robinhood margin chart, from the pair feed's own
 * rounds (lib/robinhood/feed.ts), cached per process by lib/robinhood/indexer.ts.
 *
 * `?range=1D|1W|1M|Max`, measured back from the last round rather than from
 * now, so a closed market still shows its last session. `last` is the feed's
 * newest round; whether the margin oracle will actually price against it right
 * now is a separate question (`marketPriceable`), which the page reads itself.
 */
import { NextRequest, NextResponse } from "next/server"
import { ensureRobinhoodIndex, getRobinhoodFeedPoints } from "@/lib/robinhood/indexer"
import { FEED_RANGES, sliceFeedRange, type FeedRange } from "@/lib/robinhood/feed"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("range") ?? "1W"
  const range = (FEED_RANGES as string[]).includes(raw) ? (raw as FeedRange) : "1W"
  try {
    await ensureRobinhoodIndex()
  } catch (err) {
    console.error("[robinhood-nvda-price] refresh failed:", err)
  }
  const all = getRobinhoodFeedPoints()
  if (all.length === 0) {
    return NextResponse.json({ error: "Price history unavailable" }, { status: 503 })
  }
  const points = sliceFeedRange(all, range).map((p) => ({ time: p.time, price: p.price }))
  const last = all[all.length - 1]
  return NextResponse.json(
    { range, points, last: { time: last.time, price: last.price } },
    { headers: { "cache-control": "public, max-age=10" } },
  )
}

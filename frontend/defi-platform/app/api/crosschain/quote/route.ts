/**
 *   GET /api/crosschain/quote?src=&dst=&srcToken=&dstToken=&amount=[&slippageBps=]
 *
 * What a transfer would deliver. `amount` is in the source token's smallest
 * unit. Answers `limit` (the roll-out cap) instead of failing, so the form can
 * show the quote and say why the button is off. SODAX's own refusals come back
 * as `amount_too_low` ("Minimum is $5") and `no_path` ("Too large for one
 * transfer"). Public and a GET, so it rides the general read budget while the
 * user types.
 */
import { NextRequest, NextResponse } from "next/server"
import { quoteLeg } from "@/lib/crosschain/server"
import { errorResponse, failure, parseXcChain } from "@/lib/crosschain/http"
import { xcError } from "@/lib/crosschain/errors"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams
  const src = parseXcChain(q.get("src"))
  const dst = parseXcChain(q.get("dst"))
  const srcToken = q.get("srcToken") ?? ""
  const dstToken = q.get("dstToken") ?? ""
  const amount = q.get("amount") ?? ""
  const slippageBps = q.get("slippageBps") ? Number(q.get("slippageBps")) : undefined
  if (src == null || dst == null || !srcToken || !dstToken || !/^\d+$/.test(amount)) {
    return errorResponse(xcError("unsupported", "Incomplete quote request."), 400)
  }
  const started = Date.now()
  try {
    const leg = await quoteLeg({ src, dst, srcToken, dstToken, amount, slippageBps })
    return NextResponse.json({
      direction: leg.direction,
      rail: "sodax",
      srcAmount: leg.srcAmount.toString(),
      quotedOut: leg.quotedOut.toString(),
      minOut: leg.minOut.toString(),
      srcDecimals: leg.srcToken.decimals,
      dstDecimals: leg.dstToken.decimals,
      usd: leg.usd,
      limit: leg.limit,
      ms: Date.now() - started,
    })
  } catch (e) {
    return failure(e, "quote")
  }
}

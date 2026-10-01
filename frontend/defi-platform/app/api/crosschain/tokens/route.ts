/**
 *   GET /api/crosschain/tokens?chain=stellar|<evm chain id>
 *
 * The tokens the app moves on one chain, from SODAX's list, with a dollar
 * price for the ones that are not stablecoins (as SODAX would pay them out in
 * USDC). Public: nothing here is about a user.
 */
import { NextRequest, NextResponse } from "next/server"
import { offeredTokens, usdPrice } from "@/lib/crosschain/server"
import { isStableSymbol } from "@/lib/crosschain/route"
import { errorResponse, failure, parseXcChain } from "@/lib/crosschain/http"
import { xcError } from "@/lib/crosschain/errors"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const chain = parseXcChain(req.nextUrl.searchParams.get("chain"))
  if (chain == null) return errorResponse(xcError("unsupported", "Unknown chain."), 400)
  try {
    const tokens = await offeredTokens(chain)
    const priced = await Promise.all(
      tokens.map(async (t) => ({
        symbol: t.symbol,
        name: t.name,
        decimals: t.decimals,
        address: t.address,
        usdPrice: isStableSymbol(t.symbol) ? 1 : await usdPrice(chain, t),
      })),
    )
    return NextResponse.json(
      { chain, tokens: priced },
      { headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600" } },
    )
  } catch (e) {
    return failure(e, "tokens")
  }
}

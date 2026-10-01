/**
 *   POST /api/crosschain/intent   { src, dst, srcToken, dstToken, amount, slippageBps?, stellarAddress, evmAddress }
 *
 * Build the transfer and open its row, BEFORE the user signs. The row holds the
 * intent and the relay payload, so from the moment the wallet returns a hash
 * the server can finish the transfer without the tab. Answers the unsigned
 * source transaction: EVM calldata, or for a Stellar source a prepared envelope
 * (base64 XDR in `tx.data`) to sign as it is.
 *
 * The quote is taken here, not trusted from the client, so the minimum the
 * intent enforces is one this server computed. Gated by the engine flag and
 * the `CROSSCHAIN_PAUSED` kill switch; nothing after this route is.
 */
import { NextRequest, NextResponse } from "next/server"
import { createIntent, prepareLeg } from "@/lib/crosschain/server"
import { createSodaxTransfer } from "@/lib/cctp/store"
import { toTransferView } from "@/lib/crosschain/view"
import { crossChainNewTransfersAllowed } from "@/config/crossChainEngine"
import { errorResponse, failure, parseXcChain, requireStellarOwner } from "@/lib/crosschain/http"
import { xcError } from "@/lib/crosschain/errors"
import { normalizeWalletAddress } from "@/lib/walletKeys"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  if (!crossChainNewTransfersAllowed()) return errorResponse(xcError("disabled"), 503)
  const body = await req.json().catch(() => null)
  const src = parseXcChain(body?.src)
  const dst = parseXcChain(body?.dst)
  if (!body || src == null || dst == null) return errorResponse(xcError("unsupported"), 400)

  const stellarAddress = String(body.stellarAddress ?? "").toUpperCase()
  const denied = await requireStellarOwner(req, stellarAddress)
  if (denied) return denied

  try {
    const leg = await prepareLeg({
      src,
      dst,
      srcToken: String(body.srcToken ?? ""),
      dstToken: String(body.dstToken ?? ""),
      amount: String(body.amount ?? ""),
      slippageBps: body.slippageBps != null ? Number(body.slippageBps) : undefined,
      stellarAddress,
      evmAddress: String(body.evmAddress ?? ""),
    })
    const created = await createIntent(leg)
    const row = await createSodaxTransfer({
      direction: leg.direction,
      stellarAddress,
      evmAddress: normalizeWalletAddress(String(body.evmAddress)),
      srcChain: String(src),
      srcToken: leg.srcToken.address,
      srcSymbol: leg.srcToken.symbol,
      srcDecimals: leg.srcToken.decimals,
      srcAmount: leg.srcAmount.toString(),
      dstChain: String(dst),
      dstToken: leg.dstToken.address,
      dstSymbol: leg.dstToken.symbol,
      dstDecimals: leg.dstToken.decimals,
      quotedOut: leg.quotedOut.toString(),
      minOut: leg.minOut.toString(),
      usdValue: leg.usd == null ? null : Math.round(leg.usd * 100) / 100,
      intent: created.intent as unknown as Record<string, unknown>,
      relayData: created.relayData.payload,
      deadlineAt: leg.deadlineAt,
    })
    return NextResponse.json({ transfer: toTransferView(row), tx: created.tx })
  } catch (e) {
    return failure(e, "intent")
  }
}

/**
 *   POST /api/crosschain/approve   { src, dst, srcToken, dstToken, amount, slippageBps?, stellarAddress, evmAddress }
 *
 * Whether the EVM wallet has to approve SODAX's spoke for this exact transfer
 * first, and if so the transactions to sign: `resetTx` (USDT-style tokens that
 * refuse to change a non-zero allowance) and then `tx`. Native coins and
 * Stellar sources never need one. No row is written: nothing is committed
 * until the intent route runs.
 */
import { NextRequest, NextResponse } from "next/server"
import { sodaxAllowanceValid, sodaxApprove } from "@/lib/crosschain/sodax"
import { prepareLeg } from "@/lib/crosschain/server"
import { isNativeToken, isStellar } from "@/lib/crosschain/route"
import { crossChainNewTransfersAllowed } from "@/config/crossChainEngine"
import { errorResponse, failure, parseXcChain } from "@/lib/crosschain/http"
import { xcError } from "@/lib/crosschain/errors"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  if (!crossChainNewTransfersAllowed()) return errorResponse(xcError("disabled"), 503)
  const body = await req.json().catch(() => null)
  const src = parseXcChain(body?.src)
  const dst = parseXcChain(body?.dst)
  if (!body || src == null || dst == null) return errorResponse(xcError("unsupported"), 400)
  try {
    const leg = await prepareLeg({
      src,
      dst,
      srcToken: String(body.srcToken ?? ""),
      dstToken: String(body.dstToken ?? ""),
      amount: String(body.amount ?? ""),
      slippageBps: body.slippageBps != null ? Number(body.slippageBps) : undefined,
      stellarAddress: String(body.stellarAddress ?? "").toUpperCase(),
      evmAddress: String(body.evmAddress ?? ""),
    })
    if (isStellar(src) || isNativeToken(src, leg.srcToken)) return NextResponse.json({ valid: true })
    if (await sodaxAllowanceValid(leg.params)) return NextResponse.json({ valid: true })
    const { tx, resetTx } = await sodaxApprove(leg.params)
    return NextResponse.json({ valid: false, tx, resetTx: resetTx ?? null })
  } catch (e) {
    return failure(e, "approve")
  }
}

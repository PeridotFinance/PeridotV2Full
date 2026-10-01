/**
 * Limit orders (off-chain order book, stage 1 — see lib/margin/limit-orders.ts).
 *
 *   GET   /api/margin/limit-orders?address=G…   — open + recently settled orders
 *   POST  /api/margin/limit-orders               — place one
 *   PATCH /api/margin/limit-orders               — settle one: filled | failed | cancelled
 *
 * Auth is `authorizeStellarAddress`, the same gate as the journal: a Privy
 * bearer whose linked accounts include the address, or the Stellar-wallet
 * session cookie. Nobody reads, places or cancels an order for an address they
 * can't prove they hold.
 *
 * Validation here is about shape and bounds. Whether the limit sits on the
 * right side of the market is the client's call (`validateLimitOrderDraft`),
 * because the server has no live mark — and an order that would fire at once
 * costs the trader a market open, not the protocol anything.
 */
import { NextRequest, NextResponse } from "next/server"
import { FEATURE_FLAGS } from "@/config/featureFlags"
import { authorizeStellarAddress } from "@/lib/stellar/wallet-auth"
import {
  createLimitOrder,
  listLimitOrders,
  settleLimitOrder,
  MAX_OPEN_LIMIT_ORDERS,
  type LimitOrderSide,
} from "@/lib/margin/limit-orders"

export const runtime = "nodejs"

const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/
const MAX_LEVERAGE = 10
const MIN_EXPIRY_MS = 5 * 60 * 1000
const MAX_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000
const MAX_REASON_LEN = 400

function enabled() {
  return FEATURE_FLAGS.WALLET_PRIVY_STELLAR_EMBEDDED
}

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN
  return Number.isFinite(n) ? n : null
}

export async function GET(req: NextRequest) {
  if (!enabled()) return NextResponse.json({ error: "not_enabled" }, { status: 404 })
  const address = req.nextUrl.searchParams.get("address") || ""
  if (!STELLAR_ADDRESS_RE.test(address)) return NextResponse.json({ error: "invalid_address" }, { status: 400 })
  const auth = await authorizeStellarAddress(req, address)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  try {
    const orders = await listLimitOrders(address)
    return NextResponse.json({ orders })
  } catch (e) {
    console.error("[margin/limit-orders] list failed:", e)
    return NextResponse.json({ error: "list_failed" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!enabled()) return NextResponse.json({ error: "not_enabled" }, { status: 404 })
  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { return NextResponse.json({ error: "invalid_body" }, { status: 400 }) }

  const address = typeof body.userAddress === "string" ? body.userAddress : ""
  if (!STELLAR_ADDRESS_RE.test(address)) return NextResponse.json({ error: "invalid_address" }, { status: 400 })
  const side = body.side as LimitOrderSide
  if (side !== "Long" && side !== "Short") return NextResponse.json({ error: "invalid_side" }, { status: 400 })
  const collateralUsdt = num(body.collateralUsdt)
  const leverage = num(body.leverage)
  const limitPriceUsd = num(body.limitPriceUsd)
  const slippageBps = num(body.slippageBps) ?? 100
  const takeProfitUsd = body.takeProfitUsd == null ? null : num(body.takeProfitUsd)
  const stopLossUsd = body.stopLossUsd == null ? null : num(body.stopLossUsd)
  const expiresInMs = num(body.expiresInMs)
  if (!collateralUsdt || collateralUsdt <= 0) return NextResponse.json({ error: "invalid_collateral" }, { status: 400 })
  if (!leverage || !Number.isInteger(leverage) || leverage < 2 || leverage > MAX_LEVERAGE) return NextResponse.json({ error: "invalid_leverage" }, { status: 400 })
  if (!limitPriceUsd || limitPriceUsd <= 0) return NextResponse.json({ error: "invalid_limit_price" }, { status: 400 })
  if (slippageBps < 1 || slippageBps > 5000) return NextResponse.json({ error: "invalid_slippage" }, { status: 400 })
  if (takeProfitUsd != null && takeProfitUsd <= 0) return NextResponse.json({ error: "invalid_take_profit" }, { status: 400 })
  if (stopLossUsd != null && stopLossUsd <= 0) return NextResponse.json({ error: "invalid_stop_loss" }, { status: 400 })
  // TP/SL are relative to the entry the order will make, so they are checked
  // against the LIMIT, not the current mark.
  if (side === "Long" && ((takeProfitUsd != null && takeProfitUsd <= limitPriceUsd) || (stopLossUsd != null && stopLossUsd >= limitPriceUsd))) {
    return NextResponse.json({ error: "tpsl_wrong_side" }, { status: 400 })
  }
  if (side === "Short" && ((takeProfitUsd != null && takeProfitUsd >= limitPriceUsd) || (stopLossUsd != null && stopLossUsd <= limitPriceUsd))) {
    return NextResponse.json({ error: "tpsl_wrong_side" }, { status: 400 })
  }
  if (!expiresInMs || expiresInMs < MIN_EXPIRY_MS || expiresInMs > MAX_EXPIRY_MS) return NextResponse.json({ error: "invalid_expiry" }, { status: 400 })

  const auth = await authorizeStellarAddress(req, address)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const order = await createLimitOrder({
      userAddress: address,
      side,
      collateralUsdt,
      leverage,
      limitPriceUsd,
      slippageBps: Math.round(slippageBps),
      takeProfitUsd,
      stopLossUsd,
      expiresAt: new Date(Date.now() + expiresInMs),
    })
    if (order === "too_many") {
      return NextResponse.json({ error: "too_many_open_orders", max: MAX_OPEN_LIMIT_ORDERS }, { status: 409 })
    }
    return NextResponse.json({ ok: true, order })
  } catch (e) {
    console.error("[margin/limit-orders] create failed:", e)
    return NextResponse.json({ error: "create_failed" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  if (!enabled()) return NextResponse.json({ error: "not_enabled" }, { status: 404 })
  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { return NextResponse.json({ error: "invalid_body" }, { status: 400 }) }

  const address = typeof body.userAddress === "string" ? body.userAddress : ""
  if (!STELLAR_ADDRESS_RE.test(address)) return NextResponse.json({ error: "invalid_address" }, { status: 400 })
  const id = num(body.id)
  if (!id || !Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "invalid_id" }, { status: 400 })
  const status = body.status
  if (status !== "filled" && status !== "failed" && status !== "cancelled") {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 })
  }
  const positionId = typeof body.positionId === "string" && body.positionId ? body.positionId : null
  const failReason = typeof body.failReason === "string" ? body.failReason.slice(0, MAX_REASON_LEN) : null
  const firedPriceUsd = body.firedPriceUsd == null ? null : num(body.firedPriceUsd)

  const auth = await authorizeStellarAddress(req, address)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const order = await settleLimitOrder({ id, userAddress: address, status, positionId, failReason, firedPriceUsd })
    if (!order) return NextResponse.json({ error: "not_open" }, { status: 409 })
    return NextResponse.json({ ok: true, order })
  } catch (e) {
    console.error("[margin/limit-orders] settle failed:", e)
    return NextResponse.json({ error: "settle_failed" }, { status: 500 })
  }
}

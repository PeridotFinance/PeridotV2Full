/**
 * Stellar margin trade journal API.
 *
 *   POST /api/margin/journal  — record one open/close/collateral/cancel event.
 *   GET  /api/margin/journal?address=G…  — { trades, history } for the Trades/History tabs.
 *
 * Live positions are on-chain; this persists the historical layer the contract
 * doesn't expose. Auth is `authorizeStellarAddress`: either a verified Privy
 * bearer whose linked accounts include the address, or a signed Stellar-wallet
 * session cookie bound to it (kit/Freighter users, who have no Privy account) —
 * so nobody can read or write another account's journal.
 */
import { NextRequest, NextResponse } from "next/server"
import { FEATURE_FLAGS } from "@/config/featureFlags"
import { authorizeStellarAddress } from "@/lib/stellar/wallet-auth"
import {
  recordMarginTrade,
  listMarginTrades,
  listClosedPositions,
  type MarginEventType,
  type MarginTradeInput,
} from "@/lib/margin-journal"
import { postTradeToChallengeFeed } from "@/lib/challenge/feed"

export const runtime = "nodejs"

const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/
const EVENT_TYPES: MarginEventType[] = ["open", "close", "cancel", "collateral_in", "collateral_out", "tpsl_set", "repay"]

export async function POST(req: NextRequest) {
  if (!FEATURE_FLAGS.WALLET_PRIVY_STELLAR_EMBEDDED) {
    return NextResponse.json({ error: "not_enabled" }, { status: 404 })
  }

  let body: Partial<MarginTradeInput> = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }

  const address = body.userAddress
  if (!address || !STELLAR_ADDRESS_RE.test(address)) {
    return NextResponse.json({ error: "invalid_address" }, { status: 400 })
  }
  if (!body.eventType || !EVENT_TYPES.includes(body.eventType)) {
    return NextResponse.json({ error: "invalid_event_type" }, { status: 400 })
  }
  if (!body.positionId) {
    return NextResponse.json({ error: "missing_position_id" }, { status: 400 })
  }

  const auth = await authorizeStellarAddress(req, address)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const { id } = await recordMarginTrade({ ...body, userAddress: address, eventType: body.eventType, positionId: String(body.positionId) })
    // Best-effort: mirror the STORED row into the challenge feed. Swallows its
    // own errors — a chat hiccup must never fail a recorded trade.
    await postTradeToChallengeFeed({ tradeId: id, userAddress: address, eventType: body.eventType, network: body.network || "testnet" })
    return NextResponse.json({ ok: true, id })
  } catch (e) {
    console.error("[margin/journal] insert failed:", e)
    return NextResponse.json({ error: "insert_failed" }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  if (!FEATURE_FLAGS.WALLET_PRIVY_STELLAR_EMBEDDED) {
    return NextResponse.json({ error: "not_enabled" }, { status: 404 })
  }

  const address = req.nextUrl.searchParams.get("address") || ""
  if (!STELLAR_ADDRESS_RE.test(address)) {
    return NextResponse.json({ error: "invalid_address" }, { status: 400 })
  }

  const auth = await authorizeStellarAddress(req, address)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  // Positions still open on-chain (comma-separated u64 ids). Their journal rows
  // are always included — the newest-200 window alone loses an old position's
  // `open` row (and with it the entry price / TP/SL / debt basis) for active
  // traders. Ids are validated hard; the list function caps the count.
  const openIds = (req.nextUrl.searchParams.get("openIds") || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^\d{1,20}$/.test(s))

  try {
    const [trades, history] = await Promise.all([listMarginTrades(address, "testnet", openIds), listClosedPositions(address)])
    return NextResponse.json({ trades, history })
  } catch (e) {
    console.error("[margin/journal] read failed:", e)
    return NextResponse.json({ error: "read_failed" }, { status: 500 })
  }
}

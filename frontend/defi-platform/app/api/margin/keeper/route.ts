/**
 * Always-on margin TP/SL keeper — user-facing control plane.
 *
 *   GET    /api/margin/keeper?address=G…  → { enabled, keeperPublicKey, arms }
 *   POST   /api/margin/keeper             → arm a position (store pre-signed close)
 *   DELETE /api/margin/keeper?address=G…&positionId=…  → disarm
 *
 * Auth mirrors /api/margin/journal (`authorizeStellarAddress`): a verified Privy
 * bearer whose linked accounts include `address`, or a signed Stellar-wallet
 * session cookie bound to it. The keeper public key
 * is exposed so the client can simulate the close against it (a foreign source is
 * required to surface the user's `require_auth` entry for pre-signing).
 *
 * A stored entry authorizes ONE exact call on THIS position and nothing else:
 * prepare_close, cancel_close, or swap_close at one specific min_out. Each is
 * single-use (Soroban nonce) and expires at valid_until_ledger. The swap arrives
 * as a ladder of candidates because its min_out is only valid inside a window that
 * moves with the price — see lib/margin/keeper-store.ts.
 */
import { NextRequest, NextResponse } from "next/server"
import { FEATURE_FLAGS } from "@/config/featureFlags"
import { authorizeStellarAddress } from "@/lib/stellar/wallet-auth"
import { getKeeperPublicKey, getLatestLedgerCached, isKeeperConfigured } from "@/lib/margin/keeper-execute"
import {
  upsertKeeperArm,
  cancelKeeperArm,
  listKeeperArms,
  type KeeperSwapRung,
} from "@/lib/margin/keeper-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const G_RE = /^G[A-Z2-7]{55}$/
const C_RE = /^C[A-Z2-7]{55}$/

function gate(): NextResponse | null {
  if (!FEATURE_FLAGS.MARGIN_KEEPER_ALWAYS_ON) {
    return NextResponse.json({ error: "not_enabled" }, { status: 404 })
  }
  return null
}

export async function GET(req: NextRequest) {
  const blocked = gate()
  if (blocked) return blocked

  const address = req.nextUrl.searchParams.get("address") || ""
  if (!G_RE.test(address)) return NextResponse.json({ error: "invalid_address" }, { status: 400 })

  const auth = await authorizeStellarAddress(req, address)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  // The keeper public key is static config — surface it even if the arms read
  // fails (DB blip), so the client can still build + pre-sign an arm.
  let arms: Awaited<ReturnType<typeof listKeeperArms>> = []
  try {
    arms = await listKeeperArms(address)
  } catch (e) {
    console.error("[margin/keeper] arms read failed (returning keeper info anyway):", e)
  }

  // `latestLedger` is what turns `valid_until_ledger` into a date the trader can
  // read. Best-effort: null simply means the UI stays quiet about expiry.
  const latestLedger = await getLatestLedgerCached().catch(() => null)

  return NextResponse.json({
    enabled: isKeeperConfigured(),
    keeperPublicKey: getKeeperPublicKey(),
    latestLedger,
    // Slimmed on purpose. The full rows carry the pre-signed auth entries and the
    // 13-rung ladder — tens of kilobytes of signature material per position that
    // no client needs to render a chip, and that has no business travelling more
    // often than it must.
    arms: arms.map((a) => ({
      position_id: a.position_id,
      side: a.side,
      take_profit_usd: a.take_profit_usd,
      stop_loss_usd: a.stop_loss_usd,
      valid_until_ledger: a.valid_until_ledger,
      status: a.status,
      attempts: a.attempts,
      last_error: a.last_error,
      fired_kind: a.fired_kind,
      fired_tx_hash: a.fired_tx_hash,
      arm_version: a.arm_version,
      /** Pre-83e987da arms can't roll back a close they had to abandon. */
      has_cancel_entry: Boolean(a.cancel_auth_entry),
      created_at: a.created_at,
      updated_at: a.updated_at,
    })),
  })
}

export async function POST(req: NextRequest) {
  const blocked = gate()
  if (blocked) return blocked
  if (!isKeeperConfigured()) {
    return NextResponse.json({ error: "keeper_unconfigured" }, { status: 503 })
  }

  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }

  const userAddress = String(body.userAddress || "")
  const positionId = String(body.positionId || "")
  const side = body.side === "Long" || body.side === "Short" ? body.side : null
  const debtToken = String(body.debtToken || "")
  const prepareAuthEntry = String(body.prepareAuthEntry || "")
  const cancelAuthEntry = String(body.cancelAuthEntry || "")
  const swapRungsRaw = Array.isArray(body.swapRungs) ? body.swapRungs : []
  const validUntilLedger = Number(body.validUntilLedger)
  const takeProfitUsd = body.takeProfitUsd == null ? null : Number(body.takeProfitUsd)
  const stopLossUsd = body.stopLossUsd == null ? null : Number(body.stopLossUsd)

  if (!G_RE.test(userAddress)) return NextResponse.json({ error: "invalid_address" }, { status: 400 })
  if (!/^\d+$/.test(positionId)) return NextResponse.json({ error: "invalid_position_id" }, { status: 400 })
  if (!side) return NextResponse.json({ error: "invalid_side" }, { status: 400 })
  if (!C_RE.test(debtToken)) return NextResponse.json({ error: "invalid_debt_token" }, { status: 400 })
  const entryOk = (e: string) => Boolean(e) && e.length <= 20_000
  if (!entryOk(prepareAuthEntry) || !entryOk(cancelAuthEntry)) {
    return NextResponse.json({ error: "invalid_auth_entry" }, { status: 400 })
  }
  // The ladder is what makes the swap leg pre-signable; an arm without it can
  // prepare a close it can never finish, which is worse than no arm.
  const swapRungs: KeeperSwapRung[] = []
  for (const r of swapRungsRaw) {
    const o = r as Record<string, unknown>
    const bp = Number(o?.bp)
    const minOut = String(o?.minOut ?? o?.min_out ?? "")
    const entry = String(o?.entry ?? "")
    if (!Number.isInteger(bp) || !/^\d+$/.test(minOut) || !entryOk(entry)) {
      return NextResponse.json({ error: "invalid_swap_rung" }, { status: 400 })
    }
    swapRungs.push({ bp, min_out: minOut, entry })
  }
  if (swapRungs.length < 3 || swapRungs.length > 64) {
    return NextResponse.json({ error: "invalid_swap_rungs" }, { status: 400 })
  }
  if (!Number.isInteger(validUntilLedger) || validUntilLedger <= 0) {
    return NextResponse.json({ error: "invalid_valid_until" }, { status: 400 })
  }
  if ((takeProfitUsd == null || !(takeProfitUsd > 0)) && (stopLossUsd == null || !(stopLossUsd > 0))) {
    return NextResponse.json({ error: "no_trigger" }, { status: 400 })
  }

  const auth = await authorizeStellarAddress(req, userAddress)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const { id } = await upsertKeeperArm({
      userAddress,
      positionId,
      side,
      debtToken,
      takeProfitUsd: takeProfitUsd && takeProfitUsd > 0 ? takeProfitUsd : null,
      stopLossUsd: stopLossUsd && stopLossUsd > 0 ? stopLossUsd : null,
      prepareAuthEntry,
      cancelAuthEntry,
      swapRungs,
      validUntilLedger,
    })
    return NextResponse.json({ ok: true, id })
  } catch (e) {
    console.error("[margin/keeper] arm failed:", e)
    return NextResponse.json({ error: "arm_failed" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const blocked = gate()
  if (blocked) return blocked

  const address = req.nextUrl.searchParams.get("address") || ""
  const positionId = req.nextUrl.searchParams.get("positionId") || ""
  if (!G_RE.test(address)) return NextResponse.json({ error: "invalid_address" }, { status: 400 })
  if (!/^\d+$/.test(positionId)) return NextResponse.json({ error: "invalid_position_id" }, { status: 400 })

  const auth = await authorizeStellarAddress(req, address)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    await cancelKeeperArm(address, positionId)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[margin/keeper] disarm failed:", e)
    return NextResponse.json({ error: "disarm_failed" }, { status: 500 })
  }
}

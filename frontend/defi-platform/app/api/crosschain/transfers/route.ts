/**
 * The user's own transfers on the SODAX rail.
 *
 *   GET   /api/crosschain/transfers?address=G…    in flight, waiting to be supplied, recent
 *   PATCH /api/crosschain/transfers               { id, stellarAddress, action, … }
 *
 * PATCH actions, all by the owner's hand and never by a job:
 *   delivered  { amount }         what the tab measured arriving (display only)
 *   supplied   { supplyTxHash }   an 'in' delivery went into the Peridot market
 *   dismissed                     close a finished row
 */
import { NextRequest, NextResponse } from "next/server"
import { listSodaxForAddress, markSodaxDismissed, markSodaxSupplied, recordDelivered } from "@/lib/cctp/store"
import { toTransferView } from "@/lib/crosschain/view"
import { errorResponse, requireStellarOwner, STELLAR_TX_HASH_RE } from "@/lib/crosschain/http"
import { xcError } from "@/lib/crosschain/errors"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const address = (req.nextUrl.searchParams.get("address") ?? "").toUpperCase()
  const denied = await requireStellarOwner(req, address)
  if (denied) return denied
  const rows = await listSodaxForAddress(address)
  return NextResponse.json({ transfers: rows.map(toTransferView) })
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const id = Number(body?.id)
  const stellarAddress = String(body?.stellarAddress ?? "").toUpperCase()
  const action = String(body?.action ?? "")
  if (!Number.isInteger(id) || id <= 0) return errorResponse(xcError("unsupported", "Missing transfer id."), 400)

  const denied = await requireStellarOwner(req, stellarAddress)
  if (denied) return denied

  if (action === "delivered") {
    const amount = String(body?.amount ?? "")
    if (!/^\d+$/.test(amount)) return errorResponse(xcError("unsupported", "Invalid amount."), 400)
    const row = await recordDelivered(id, stellarAddress, amount)
    // 409 rather than an error: already recorded, or not delivered yet.
    return row ? NextResponse.json({ transfer: toTransferView(row) }) : NextResponse.json({ error: "not_recordable" }, { status: 409 })
  }
  if (action === "supplied") {
    const supplyTxHash = String(body?.supplyTxHash ?? "")
    if (!STELLAR_TX_HASH_RE.test(supplyTxHash)) return errorResponse(xcError("unsupported", "Invalid transaction hash."), 400)
    const row = await markSodaxSupplied(id, stellarAddress, supplyTxHash)
    return row ? NextResponse.json({ transfer: toTransferView(row) }) : NextResponse.json({ error: "not_suppliable" }, { status: 409 })
  }
  if (action === "dismissed") {
    const row = await markSodaxDismissed(id, stellarAddress)
    return row ? NextResponse.json({ transfer: toTransferView(row) }) : NextResponse.json({ error: "not_dismissable" }, { status: 409 })
  }
  return errorResponse(xcError("unsupported", "Unknown action."), 400)
}

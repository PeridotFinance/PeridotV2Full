/**
 *   POST /api/crosschain/submit   { id, stellarAddress, txHash, stage: "sent" | "confirmed" | "reverted" }
 *
 * The tab reports the source transaction, in up to three steps:
 *
 *   sent       the wallet returned a hash. Reported before waiting for anything,
 *              because from here on the money may have left the wallet and the
 *              hash is the only thread back to it.
 *   confirmed  the source chain included it: hand it to SODAX's relay now
 *              rather than waiting for the cron's minute.
 *   reverted   it failed on the source chain; nothing left the wallet.
 *
 * Not gated by the engine flag or the kill switch: a transfer that was signed
 * has to be able to finish.
 */
import { NextRequest, NextResponse } from "next/server"
import { getSodaxTransfer, markSodaxFailed, recordSourceTx } from "@/lib/cctp/store"
import { advanceSodaxTransfer } from "@/lib/crosschain/server"
import { toTransferView } from "@/lib/crosschain/view"
import { errorResponse, failure, isTxHashFor, requireStellarOwner } from "@/lib/crosschain/http"
import { xcError } from "@/lib/crosschain/errors"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const id = Number(body?.id)
  const stellarAddress = String(body?.stellarAddress ?? "").toUpperCase()
  const txHash = String(body?.txHash ?? "")
  const stage = String(body?.stage ?? "")
  if (!Number.isInteger(id) || id <= 0 || !["sent", "confirmed", "reverted"].includes(stage)) {
    return errorResponse(xcError("unsupported", "Incomplete report."), 400)
  }

  const denied = await requireStellarOwner(req, stellarAddress)
  if (denied) return denied

  const row = await getSodaxTransfer(id)
  if (!row || row.stellar_address !== stellarAddress) return NextResponse.json({ error: "not_found" }, { status: 404 })
  const srcChain = row.src_chain === "stellar" ? "stellar" : Number(row.src_chain)
  if (!isTxHashFor(srcChain, txHash)) return errorResponse(xcError("unsupported", "Invalid transaction hash."), 400)

  try {
    const recorded = await recordSourceTx(id, txHash)
    if (!recorded) {
      // A different hash is already on the row: one intent, one payment.
      return NextResponse.json({ error: "hash_conflict", transfer: toTransferView(row) }, { status: 409 })
    }
    if (stage === "reverted") {
      const failed = await markSodaxFailed(id, "The transaction failed on the source network. Nothing was sent.")
      return NextResponse.json({ transfer: toTransferView(failed ?? recorded) })
    }
    const next = stage === "confirmed" ? await advanceSodaxTransfer(recorded, { confirmed: true }) : recorded
    return NextResponse.json({ transfer: toTransferView(next) })
  } catch (e) {
    return failure(e, "submit")
  }
}

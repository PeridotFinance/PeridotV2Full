/**
 *   GET /api/crosschain/status?id=&address=G…
 *
 * Where one transfer stands, advanced by one step first when it is still on its
 * way (one SODAX status call). The watching tab polls this; the cron does the
 * same for tabs that are gone, through the same guarded transitions.
 */
import { NextRequest, NextResponse } from "next/server"
import { getSodaxTransfer } from "@/lib/cctp/store"
import { advanceSodaxTransfer } from "@/lib/crosschain/server"
import { toTransferView } from "@/lib/crosschain/view"
import { errorResponse, requireStellarOwner } from "@/lib/crosschain/http"
import { xcError } from "@/lib/crosschain/errors"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30

export async function GET(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("id"))
  const address = (req.nextUrl.searchParams.get("address") ?? "").toUpperCase()
  if (!Number.isInteger(id) || id <= 0) return errorResponse(xcError("unsupported", "Missing transfer id."), 400)

  const denied = await requireStellarOwner(req, address)
  if (denied) return denied

  const row = await getSodaxTransfer(id)
  if (!row || row.stellar_address !== address) return NextResponse.json({ error: "not_found" }, { status: 404 })

  try {
    return NextResponse.json({ transfer: toTransferView(await advanceSodaxTransfer(row)) })
  } catch (e) {
    // The row is intact; the next poll or the cron tries again.
    console.error("[crosschain/status]", e)
    return NextResponse.json({ transfer: toTransferView(row), stale: true })
  }
}

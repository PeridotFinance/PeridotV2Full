/**
 * GET  /api/bridge/offramp/destination — the user's cash-out destination, or null.
 * POST /api/bridge/offramp/destination — register their IBAN and provision it.
 *
 * The destination is a Bridge liquidation address: a permanent Stellar address
 * wired to the user's own bank account. Once it exists, cashing out is just a
 * Stellar payment the client signs — we never touch the funds.
 *
 * POST body:
 *   { iban, country, holderName, firstName, lastName, bic?, bankName? }
 *   or {} — top-up call for an already-registered user: reuses their bank
 *   account and provisions liquidation addresses for any missing currency.
 *
 * Response:
 *   { status: "ready", destination: { address, memo, bank } }
 *   { status: "skipped", reason: CashoutSkipReason }
 *   { status: "failed", reason: string }
 *
 * POST is idempotent — once provisioned it returns the existing destination
 * without calling Bridge, so the client may call it on every sheet open.
 */

import { NextRequest, NextResponse } from "next/server"
import { FEATURE_FLAGS } from "@/config/featureFlags"
import { authenticateBridgeRequest } from "@/lib/bridge/auth"
import { ensureOfframpDestination, getOfframpDestination } from "@/lib/bridge/offramp"

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null
}

export async function GET(req: NextRequest) {
  if (!FEATURE_FLAGS.FIAT_OFFRAMP_BRIDGE) {
    return NextResponse.json({ error: "Cash out is disabled" }, { status: 404 })
  }

  const auth = await authenticateBridgeRequest(req)
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const destination = await getOfframpDestination(auth.userId)
  return NextResponse.json({ destination })
}

export async function POST(req: NextRequest) {
  if (!FEATURE_FLAGS.FIAT_OFFRAMP_BRIDGE) {
    return NextResponse.json({ error: "Cash out is disabled" }, { status: 404 })
  }

  const auth = await authenticateBridgeRequest(req)
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: Record<string, unknown> = {}
  try {
    const raw = await req.text()
    if (raw) body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const iban = str(body.iban)
  const bic = str(body.bic)
  const country = str(body.country)
  const holderName = str(body.holderName)
  const firstName = str(body.firstName)
  const lastName = str(body.lastName)
  const anyBankField = Boolean(
    iban || bic || country || holderName || firstName || lastName,
  )
  // The BIC is deliberately absent here: SEPA is IBAN-only and Bridge marks it
  // optional. It still counts as "any" above — a lone BIC is a client bug.
  const allBankFields = Boolean(
    iban && country && holderName && firstName && lastName,
  )
  // Two valid shapes: the full set (first registration) or none of them (a
  // top-up call re-provisioning missing currencies against the existing bank
  // account). A partial set is still a client bug and keeps its 400.
  if (anyBankField && !allBankFields) {
    return NextResponse.json(
      { error: "iban, country, holderName, firstName and lastName are required" },
      { status: 400 },
    )
  }

  const outcome = await ensureOfframpDestination({
    privyUserId: auth.userId,
    ...(allBankFields
      ? {
          iban: iban as string,
          bic: bic ?? undefined,
          country: country as string,
          holderName: holderName as string,
          firstName: firstName as string,
          lastName: lastName as string,
          bankName: str(body.bankName) ?? undefined,
        }
      : {}),
  })

  const httpStatus = outcome.status === "failed" ? 502 : 200
  return NextResponse.json(outcome, { status: httpStatus })
}

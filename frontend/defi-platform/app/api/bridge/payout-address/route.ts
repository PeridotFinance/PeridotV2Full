/**
 * GET  /api/bridge/payout-address — returns the user's current payout address.
 * POST /api/bridge/payout-address — sets/rotates the destination Stellar G-address.
 *
 * The address must already be linked + signature-verified for this Privy user
 * in account_wallet_links (chain_namespace='stellar', verification_status
 * 'verified'). This is the only place we trust an address as "owned by the
 * caller" — never the body alone, since the same body would let one user
 * redirect another user's SEPA payout.
 *
 * Body for POST:
 *   { address: string, autoForward?: boolean }
 */

import { NextRequest, NextResponse } from "next/server"
import { FEATURE_FLAGS } from "@/config/featureFlags"
import { sql } from "@/lib/database"
import { getTableNames } from "@/lib/tableResolver"
import { authenticateBridgeRequest } from "@/lib/bridge/auth"
import {
  getCustomerByPrivyId,
  setPayoutAddressForCustomer,
} from "@/lib/bridge/store"
import {
  getAccountIdForPrivyUser,
  normalizeLinkedWalletAddress,
} from "@/app/api/account/wallet-links/_lib"

const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/

interface SetPayoutAddressBody {
  address?: unknown
  autoForward?: unknown
}

async function isVerifiedStellarLink(
  privyUserId: string,
  normalized: string,
): Promise<boolean> {
  const accountId = await getAccountIdForPrivyUser(privyUserId)
  if (!accountId) return false
  const t = getTableNames()
  const rows = (await sql`
    SELECT 1
    FROM ${sql(t.accountWalletLinks)}
    WHERE account_id = ${accountId}
      AND chain_namespace = 'stellar'
      AND normalized_address = ${normalized}
      AND verification_status = 'verified'
    LIMIT 1
  `) as Array<{ "?column?": number }>
  return rows.length > 0
}

export async function GET(req: NextRequest) {
  if (!FEATURE_FLAGS.FIAT_ONRAMP_BRIDGE) {
    return NextResponse.json({ error: "Fiat on-ramp is disabled" }, { status: 404 })
  }
  const auth = await authenticateBridgeRequest(req)
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const customer = await getCustomerByPrivyId(auth.userId)
  return NextResponse.json({
    address: customer?.payout_stellar_address ?? null,
    setAt: customer?.payout_address_set_at ?? null,
    autoForwardEnabled: customer?.auto_forward_enabled ?? true,
  })
}

export async function POST(req: NextRequest) {
  if (!FEATURE_FLAGS.FIAT_ONRAMP_BRIDGE) {
    return NextResponse.json({ error: "Fiat on-ramp is disabled" }, { status: 404 })
  }
  const auth = await authenticateBridgeRequest(req)
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: SetPayoutAddressBody = {}
  try {
    const raw = await req.text()
    if (raw) body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const address = typeof body.address === "string" ? body.address.trim() : ""
  if (!STELLAR_ADDRESS_RE.test(address)) {
    return NextResponse.json({ error: "Invalid Stellar address" }, { status: 400 })
  }
  const autoForward = body.autoForward === undefined ? true : Boolean(body.autoForward)

  const normalized = normalizeLinkedWalletAddress("stellar", address)
  if (!normalized) {
    return NextResponse.json({ error: "Invalid Stellar address" }, { status: 400 })
  }

  // Refuse to set a payout target the user hasn't proven ownership of. Forces
  // the UI to walk the user through the link/sign-challenge flow first.
  const owned = await isVerifiedStellarLink(auth.userId, normalized)
  if (!owned) {
    return NextResponse.json(
      { error: "Address must be linked + verified to your account first" },
      { status: 403 },
    )
  }

  // A customer row must exist before we can store the payout address — KYC has
  // to have been started at least once.
  const customer = await getCustomerByPrivyId(auth.userId)
  if (!customer) {
    return NextResponse.json(
      { error: "Start the bank-transfer KYC flow first" },
      { status: 409 },
    )
  }

  const updated = await setPayoutAddressForCustomer(auth.userId, address, autoForward)
  return NextResponse.json({
    address: updated?.payout_stellar_address ?? null,
    setAt: updated?.payout_address_set_at ?? null,
    autoForwardEnabled: updated?.auto_forward_enabled ?? autoForward,
  })
}

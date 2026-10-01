/**
 * The margin sandbox's one-time test-money grant.
 *
 *   GET  /api/margin/faucet-claim?address=G…  → { available, amountUnits, amountUsdt }
 *   POST /api/margin/faucet-claim { address }  → { granted, amountUnits } | 409
 *
 * The mint itself stays client-side (the user's own wallet signs it; the mock
 * token's `mint` is open on testnet). This route is the ledger of who already
 * had their 250 — see lib/margin/faucet-claim.ts for why one grant per ACCOUNT,
 * and why an unfunded reservation may be retried.
 *
 * Auth is `authorizeStellarAddress`, exactly like the journal: a verified Privy
 * bearer whose linked accounts include the address, or the signed Stellar-wallet
 * session cookie (kit/Freighter users). Unauthenticated callers get nothing —
 * otherwise the cap would be one grant per address *anyone* cares to name.
 */
import { NextRequest, NextResponse } from "next/server"
import { FEATURE_FLAGS } from "@/config/featureFlags"
import { authorizeStellarAddress } from "@/lib/stellar/wallet-auth"
import {
  claimFaucetGrant,
  faucetClaimAvailable,
  resolveFaucetAccountKey,
  FAUCET_GRANT_UNITS,
} from "@/lib/margin/faucet-claim"
import { STELLAR_MARGIN_CONFIG as CFG } from "@/app/app/margin/config/stellarMarginConfig"

export const runtime = "nodejs"

const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/

export async function GET(req: NextRequest) {
  if (!FEATURE_FLAGS.WALLET_PRIVY_STELLAR_EMBEDDED) {
    return NextResponse.json({ error: "not_enabled" }, { status: 404 })
  }
  const address = (req.nextUrl.searchParams.get("address") || "").toUpperCase()
  if (!STELLAR_ADDRESS_RE.test(address)) {
    return NextResponse.json({ error: "invalid_address" }, { status: 400 })
  }

  const auth = await authorizeStellarAddress(req, address)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const accountKey = await resolveFaucetAccountKey(address, auth.privyUserId)
    const available = await faucetClaimAvailable(accountKey, address)
    return NextResponse.json({
      available,
      amountUnits: String(FAUCET_GRANT_UNITS),
      amountUsdt: CFG.constants.FAUCET_GRANT_USDT,
    })
  } catch (e) {
    console.error("[margin/faucet-claim] status read failed:", e)
    return NextResponse.json({ error: "status_failed" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!FEATURE_FLAGS.WALLET_PRIVY_STELLAR_EMBEDDED) {
    return NextResponse.json({ error: "not_enabled" }, { status: 404 })
  }

  let address = ""
  try {
    address = String((await req.json())?.address || "").toUpperCase()
  } catch {
    /* malformed body → invalid_address below */
  }
  if (!STELLAR_ADDRESS_RE.test(address)) {
    return NextResponse.json({ error: "invalid_address" }, { status: 400 })
  }

  const auth = await authorizeStellarAddress(req, address)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const accountKey = await resolveFaucetAccountKey(address, auth.privyUserId)
    const result = await claimFaucetGrant(accountKey, address)
    if (!result.granted) {
      return NextResponse.json(
        { granted: false, reason: result.reason, amountUsdt: CFG.constants.FAUCET_GRANT_USDT },
        { status: 409 },
      )
    }
    return NextResponse.json({
      granted: true,
      amountUnits: String(result.amountUnits),
      amountUsdt: CFG.constants.FAUCET_GRANT_USDT,
    })
  } catch (e) {
    console.error("[margin/faucet-claim] claim failed:", e)
    return NextResponse.json({ error: "claim_failed" }, { status: 500 })
  }
}

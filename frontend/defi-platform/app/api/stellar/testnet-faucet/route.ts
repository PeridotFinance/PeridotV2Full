/**
 * POST /api/stellar/testnet-faucet — activate a Privy embedded Stellar wallet on
 * TESTNET for the margin sandbox.
 *
 * Why server-side: Friendbot (the Stellar testnet faucet) sends no CORS headers,
 * so a browser `fetch` to it is blocked — the client onboarding flow surfaced
 * this as "Could not reach the testnet faucet". Proxying it from the server (no
 * CORS, no secret needed) fixes that. Funding is XLM only; the test-USDT mint
 * stays client-side (the user's own wallet signs it).
 *
 * Two caller shapes:
 *   - Privy embedded wallet — sends a Bearer token; we verify it AND that the
 *     target address is one of the caller's own linked Stellar wallets.
 *   - External wallet (Freighter / WalletConnect via the kit) — has no Privy
 *     session, so it sends no Bearer. Friendbot is a public, secret-less,
 *     TESTNET-only faucet (anyone can hit it directly; we only proxy it because
 *     it sends no CORS headers), so for a syntactically valid testnet G-address
 *     we proxy it without a Privy session. Abuse of our server IP is bounded by
 *     the middleware rate-limiter and the feature flag.
 *
 * Safety:
 *   - Flag-gated (`WALLET_PRIVY_STELLAR_EMBEDDED`).
 *   - When a Bearer token IS present it must be valid and own the address (so a
 *     logged-in Privy user can't fund an arbitrary address through our IP).
 *   - Idempotent: an already-activated account reports `already_funded`.
 *
 * Body:    { address: "G…" }
 * Returns: { funded: boolean, reason?: string }
 */
import { NextRequest, NextResponse } from "next/server"
import { FEATURE_FLAGS } from "@/config/featureFlags"
import { getPrivyClient } from "@/lib/bridge/auth"

export const runtime = "nodejs"

const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/
const FRIENDBOT_URL = "https://friendbot.stellar.org"

export async function POST(req: NextRequest) {
  if (!FEATURE_FLAGS.WALLET_PRIVY_STELLAR_EMBEDDED) {
    return NextResponse.json({ error: "not_enabled" }, { status: 404 })
  }

  // 1. Validate input.
  let address: string | undefined
  try {
    address = (await req.json())?.address
  } catch {
    /* malformed body */
  }
  if (!address || !STELLAR_ADDRESS_RE.test(address)) {
    return NextResponse.json({ error: "invalid_address" }, { status: 400 })
  }

  // 2. Auth is conditional on caller shape. A Privy embedded wallet sends a
  //    Bearer token — verify it and require the address be one of the caller's
  //    own linked Stellar wallets. An external wallet (Freighter / kit) has no
  //    Privy session and sends no Bearer; for a valid testnet address we proxy
  //    the public friendbot faucet without one (see header doc).
  const authHeader = req.headers.get("authorization")
  if (authHeader?.startsWith("Bearer ")) {
    let userId: string | undefined
    try {
      const claims = await getPrivyClient().verifyAuthToken(authHeader.slice(7))
      userId = claims?.userId
    } catch {
      /* invalid token → treat as unauthorized below */
    }
    if (!userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    try {
      const user = await getPrivyClient().getUserById(userId)
      const owns = user?.linkedAccounts?.some(
        (a) =>
          a.type === "wallet" &&
          (a as { chainType?: string }).chainType === "stellar" &&
          (a as { address?: string }).address === address,
      )
      if (!owns) {
        return NextResponse.json({ error: "address_not_owned" }, { status: 403 })
      }
    } catch {
      return NextResponse.json({ error: "ownership_check_failed" }, { status: 403 })
    }
  }

  // 3. Friendbot (server-side → no CORS). 400 with op_already_exists = success.
  try {
    const res = await fetch(`${FRIENDBOT_URL}/?addr=${encodeURIComponent(address)}`)
    if (res.ok) {
      return NextResponse.json({ funded: true })
    }
    const body = await res.text().catch(() => "")
    if (/op_already_exists|already.*funded|account.*exists/i.test(body)) {
      return NextResponse.json({ funded: true, reason: "already_funded" })
    }
    console.error("[testnet-faucet] friendbot rejected:", res.status, body.slice(0, 200))
    return NextResponse.json({ funded: false, reason: "faucet_unavailable" }, { status: 502 })
  } catch (e) {
    console.error("[testnet-faucet] friendbot fetch failed:", e)
    return NextResponse.json({ funded: false, reason: "faucet_unreachable" }, { status: 502 })
  }
}

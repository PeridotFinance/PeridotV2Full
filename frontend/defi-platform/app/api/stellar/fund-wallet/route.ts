/**
 * POST /api/stellar/fund-wallet
 *
 * Pays for an embedded Stellar wallet. A wallet Privy has just created holds
 * nothing, so it cannot exist on the ledger, hold a trustline or pay a fee, and
 * Privy sponsors nothing on Stellar. A server-held funder sends the XLM:
 * `createAccount` for a new wallet, and a small top-up for one that has run
 * low. The rules (amounts, how often, when the funder itself is too low) are
 * `lib/stellar-funder/policy.ts`.
 *
 * Safety:
 *   - Flag-gated (`WALLET_PRIVY_STELLAR_EMBEDDED`).
 *   - Needs a verified Privy bearer token, and the address must be one of the
 *     caller's own linked Stellar wallets, so nobody can drain the funder by
 *     naming someone else's address.
 *   - Nothing is signed unless the funder can pay for it. It used to submit
 *     regardless, and an empty funder burned a fee on every login.
 *   - A wallet is topped up at most once per window, read from the ledger.
 *   - A Horizon that cannot answer is a 503, never "the wallet does not exist".
 *   - No `STELLAR_FUNDER_SECRET`: answers `funder_not_configured`, so local
 *     development works without funds.
 *
 * Body:    { address: "G..." }
 * Returns: { funded: boolean, kind?: "create" | "refill", reason?: string, hash?: string }
 */

import { NextRequest, NextResponse } from "next/server"
import { FEATURE_FLAGS } from "@/config/featureFlags"
import { getPrivyClient } from "@/lib/bridge/auth"
import { fundWallet, HorizonUnavailable } from "@/lib/stellar-funder/server"

export const runtime = "nodejs"

const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/

export async function POST(req: NextRequest) {
  if (!FEATURE_FLAGS.WALLET_PRIVY_STELLAR_EMBEDDED) {
    return NextResponse.json({ error: "not_enabled" }, { status: 404 })
  }

  // 1. Authenticate.
  const authHeader = req.headers.get("authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  let userId: string | undefined
  try {
    const claims = await getPrivyClient().verifyAuthToken(authHeader.slice(7))
    userId = claims?.userId
  } catch {
    /* fall through to 401 */
  }
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  // 2. Validate input.
  let address: string | undefined
  try {
    address = (await req.json())?.address
  } catch {
    /* malformed body */
  }
  if (!address || !STELLAR_ADDRESS_RE.test(address)) {
    return NextResponse.json({ error: "invalid_address" }, { status: 400 })
  }

  // 3. Verify ownership: the address must be one of the caller's embedded
  //    Stellar wallets.
  //
  //    The client calls this the moment `createWallet` resolves, and Privy's
  //    read API can still be serving a user record without the brand-new wallet
  //    on it. That lag is indistinguishable from a genuinely foreign address, so
  //    we re-read once before rejecting rather than 403'ing a legitimate
  //    first-login funding call.
  const ownsAddress = async (): Promise<boolean> => {
    const user = await getPrivyClient().getUserById(userId!)
    return Boolean(
      user?.linkedAccounts?.some(
        (a) =>
          a.type === "wallet" &&
          (a as { chainType?: string }).chainType === "stellar" &&
          (a as { address?: string }).address === address,
      ),
    )
  }
  try {
    let owns = await ownsAddress()
    if (!owns) {
      await new Promise((r) => setTimeout(r, 1200))
      owns = await ownsAddress()
    }
    if (!owns) {
      return NextResponse.json({ error: "address_not_owned" }, { status: 403 })
    }
  } catch {
    return NextResponse.json({ error: "ownership_check_failed" }, { status: 403 })
  }

  // 4. Funder configured?
  const funderSecret = process.env.STELLAR_FUNDER_SECRET
  if (!funderSecret) {
    return NextResponse.json({ funded: false, reason: "funder_not_configured" })
  }

  // 5. Create the wallet, or top it up when it has run low.
  try {
    const outcome = await fundWallet(address, funderSecret)
    if (outcome.kind !== "none") {
      return NextResponse.json({ funded: true, kind: outcome.kind, hash: outcome.hash })
    }
    if (outcome.reason === "funder_depleted") {
      console.error("[fund-wallet] the funder cannot pay for", address.slice(0, 6))
      return NextResponse.json({ error: "funder_depleted" }, { status: 503 })
    }
    return NextResponse.json({ funded: false, reason: outcome.reason })
  } catch (e) {
    if (e instanceof HorizonUnavailable) {
      return NextResponse.json({ error: "horizon_unavailable" }, { status: 503 })
    }
    console.error("[fund-wallet] funding failed:", e)
    return NextResponse.json({ error: "funding_failed" }, { status: 500 })
  }
}

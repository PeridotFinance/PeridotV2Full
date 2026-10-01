/**
 * Ownership check for per-address Stellar endpoints (margin journal, keeper arms).
 *
 * There are two ways a trader can hold a Stellar address on this app, and both
 * must be able to prove it:
 *
 *   1. Privy — the embedded Stellar wallet, or an external one linked to the
 *      Privy account. Proof = a verified bearer token whose linked accounts
 *      contain the address.
 *   2. Stellar wallets kit ("pure Freighter") — connected in the browser with no
 *      Privy account at all. Proof = the httpOnly session cookie minted by
 *      /api/agents/stellar-auth after the user signed a challenge with that key.
 *
 * Only path 1 existed before, so kit users were 401/403'd on their own journal:
 * their trades were never recorded and the Trades/History tabs stayed empty
 * forever while Positions/Orders (pure on-chain reads) worked — which read as
 * "the tabs are broken".
 *
 * The cookie is checked first: it's a local HMAC verify with no network hop,
 * whereas the Privy path costs two API calls. A stale cookie simply falls
 * through to the bearer check.
 */
import type { NextRequest } from "next/server"
import { getPrivyClient } from "@/lib/bridge/auth"
import { verifyStellarSessionCookie } from "@/lib/agents/stellar-session"

/**
 * Deliberately one flat shape rather than a discriminated union: the project
 * compiles with `strict` off, where TS won't narrow `ok: true | false` unions,
 * so callers reading `auth.error` after `if (!auth.ok)` would not typecheck.
 */
export interface StellarAuthResult {
  ok: boolean
  /** Which credential proved it — set only when ok. */
  method?: "stellar-session" | "privy"
  /** The Privy DID behind the token, when the bearer path proved it. Lets callers
   *  key per-ACCOUNT state (the faucet's one-time grant) rather than per-address,
   *  so a second wallet under the same login isn't a second identity. Absent for
   *  the cookie path — a pure-Freighter user has no Privy account at all. */
  privyUserId?: string
  /** HTTP status + error code to return — set only when not ok. */
  status?: number
  error?: string
}

/**
 * Authorize `address` for this request. Returns ok only when the caller has
 * proven control of exactly that G-address.
 */
export async function authorizeStellarAddress(
  req: NextRequest,
  address: string,
): Promise<StellarAuthResult> {
  // 1. Stellar-wallet session cookie (no Privy account required).
  try {
    if (verifyStellarSessionCookie(req.cookies) === address) {
      return { ok: true, method: "stellar-session" }
    }
  } catch {
    /* malformed cookie — fall through to the bearer path */
  }

  // 2. Privy bearer token + linked-wallet ownership.
  const authHeader = req.headers.get("authorization")
  if (!authHeader?.startsWith("Bearer ")) return { ok: false, status: 401, error: "unauthorized" }

  let userId: string | undefined
  try {
    const claims = await getPrivyClient().verifyAuthToken(authHeader.slice(7))
    userId = claims?.userId
  } catch {
    /* fall through */
  }
  if (!userId) return { ok: false, status: 401, error: "unauthorized" }

  try {
    const user = await getPrivyClient().getUserById(userId)
    const owns = user?.linkedAccounts?.some(
      (a) =>
        a.type === "wallet" &&
        (a as { chainType?: string }).chainType === "stellar" &&
        (a as { address?: string }).address === address,
    )
    if (!owns) return { ok: false, status: 403, error: "address_not_owned" }
  } catch {
    return { ok: false, status: 403, error: "ownership_check_failed" }
  }
  return { ok: true, method: "privy", privyUserId: userId }
}

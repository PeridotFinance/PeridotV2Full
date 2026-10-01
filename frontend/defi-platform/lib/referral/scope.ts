/**
 * Who is asking, for the referral routes.
 *
 * There are two ways to hold an address on this app and the invite page has to
 * work for both. Until now these routes only accepted the first:
 *
 *   1. Privy — a verified bearer token, which also yields every EVM and Stellar
 *      address the account has linked. The referral code was very likely made
 *      with an EVM wallet while the program pays out on Stellar, so that whole
 *      set matters, not just the address in the query string.
 *   2. Stellar wallets kit ("pure Freighter") — no Privy account at all, so no
 *      bearer exists. Proof is the httpOnly session cookie minted by
 *      /api/agents/stellar-auth after the user signed a challenge with that
 *      key, exactly as the margin journal and agent chat accept it.
 *
 * Path 2 users could reach /app/invite (the page gate lets a Stellar-only
 * session in) but every request behind it 401'd: no code, no invitees, and a
 * "Generate" button that could not succeed. A dead end.
 *
 * The cookie is checked only after the bearer, and it proves exactly one
 * address — a kit user has no linked-wallet graph to widen the scope with.
 */

import type { NextRequest } from "next/server"
import {
  authenticateUserScope,
  ensureScopeOwnsAddress,
  type UserScope,
} from "@/lib/auth/userScope"
import { verifyStellarSessionCookie } from "@/lib/agents/stellar-session"
import { normalizeWalletAddress } from "@/lib/walletKeys"

const STELLAR_RE = /^G[A-Z2-7]{55}$/

export interface ReferralScope {
  /** Every address this caller provably owns. Chain-native keys. */
  owned: string[]
  /** Which credential proved it. */
  via: "privy" | "stellar-session"
  /** Present only on the Privy path — kit users have no Peridot account. */
  privyScope: UserScope | null
}

/** The address a Stellar wallet-session cookie proves, if one is present. */
function stellarSessionAddress(request: NextRequest): string | null {
  try {
    const address = verifyStellarSessionCookie(request.cookies)
    return address && STELLAR_RE.test(address) ? address : null
  } catch {
    return null
  }
}

/**
 * Resolve the caller's owned addresses, or null when nothing proves them.
 *
 * `requestedAddress` is the address the route was asked about; when given, the
 * caller must own it. Omit it to just ask "who is this?" (the referred-
 * transactions route proves its relationship from the owned set instead).
 *
 * Returns null for "no usable credential" (→ 401). A caller that is
 * authenticated but does not own the requested address gets `denied: true`
 * (→ 403), so the two stay distinguishable at the route.
 */
export async function resolveReferralScope(
  request: NextRequest,
  requestedAddress?: string | null
): Promise<{ scope: ReferralScope | null; denied: boolean }> {
  const requested = requestedAddress
    ? normalizeWalletAddress(String(requestedAddress).trim())
    : null

  const privy = await authenticateUserScope(request)
  if (privy) {
    if (!requested || (await ensureScopeOwnsAddress(privy, requested))) {
      const owned = [
        ...new Set([...(requested ? [requested] : []), ...privy.evmAddresses, ...privy.stellarAddresses]),
      ]
      return { scope: { owned, via: "privy", privyScope: privy }, denied: false }
    }
    // A Privy user may still be driving a kit wallet the token knows nothing
    // about, so fall through to the cookie before refusing.
  }

  const sessionAddress = stellarSessionAddress(request)
  if (sessionAddress && (!requested || requested === sessionAddress)) {
    return {
      scope: { owned: [sessionAddress], via: "stellar-session", privyScope: null },
      denied: false,
    }
  }

  // Authenticated, but not for this address.
  if (privy || sessionAddress) return { scope: null, denied: true }
  return { scope: null, denied: false }
}

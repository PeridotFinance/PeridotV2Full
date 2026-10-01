/**
 * Request authentication for the /api/bridge/* routes.
 *
 * These endpoints move real money and create KYC records, so they require a
 * verified Privy access token (Bearer) — they never trust a wallet address
 * passed in the body. The Privy DID (`userId`) is the identity anchor: one
 * human = one Bridge customer, independent of how many wallets they linked.
 */

import type { NextRequest } from "next/server"
import { PrivyClient } from "@privy-io/server-auth"
import { resolveEvmAddress } from "@/lib/agents/resolve-wallet"

let cachedClient: PrivyClient | null = null

export function getPrivyClient(): PrivyClient {
  if (!cachedClient) {
    cachedClient = new PrivyClient(
      process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
      process.env.PRIVY_APP_SECRET!,
    )
  }
  return cachedClient
}

export interface BridgeAuthContext {
  /** Privy DID — stable per-person id, used as `privy_user_id`. */
  userId: string
  /** Resolved EVM address, when the user has one linked (may be null). */
  evmAddress: string | null
}

/**
 * Verifies the Bearer token on a request and resolves the caller's identity.
 * Returns null when the token is missing, malformed, or invalid.
 */
export async function authenticateBridgeRequest(
  req: NextRequest,
): Promise<BridgeAuthContext | null> {
  const authHeader = req.headers.get("authorization")
  if (!authHeader?.startsWith("Bearer ")) return null

  try {
    const token = authHeader.substring(7)
    const privy = getPrivyClient()
    const claims = await privy.verifyAuthToken(token)
    if (!claims?.userId) return null
    const evmAddress = await resolveEvmAddress(privy, claims.userId).catch(() => null)
    return { userId: claims.userId, evmAddress }
  } catch {
    return null
  }
}

/**
 * All emails Privy has actually verified for this user: the `email` account
 * (OTP-confirmed) plus every OAuth account's email (Google/Apple/… verify it
 * before Privy ever sees it). Free-typed emails from our own forms are NOT in
 * this set — that distinction is what lets the KYC route decide whether a
 * Bridge customer that surfaced under another DID really belongs to the
 * caller, or is someone else's account they merely typed the address of.
 *
 * Returns an empty set on any Privy API failure — callers must treat that as
 * "nothing proven", never as an open door.
 */
export async function getVerifiedPrivyEmails(userId: string): Promise<Set<string>> {
  const emails = new Set<string>()
  try {
    const user = await getPrivyClient().getUserById(userId)
    const linked =
      (user as { linkedAccounts?: Array<{ type?: string; address?: string; email?: string }> } | null)
        ?.linkedAccounts ?? []
    for (const account of linked) {
      if (account?.type === "email" && typeof account.address === "string") {
        emails.add(account.address.trim().toLowerCase())
      } else if (typeof account?.email === "string") {
        emails.add(account.email.trim().toLowerCase())
      }
    }
  } catch {
    // fall through with whatever was collected (usually nothing)
  }
  return emails
}

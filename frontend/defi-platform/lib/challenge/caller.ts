/**
 * Who is asking — for the challenge's *public* reads (leaderboard, feed).
 *
 * Absence is never an error here: the board and the room are readable by
 * anyone, and the account only decides which row is marked "yours" and whether
 * the composer is open.
 *
 * Both credentials the app hands out are accepted, for the same reason the join
 * route accepts both: a pure-Freighter trader has no Privy bearer, and reading
 * only the bearer left them looking logged-out on the very board they had just
 * entered — no "your rank" strip, `joined: false`, and a closed composer.
 *
 * The Privy bearer wins when present, matching the join route's account
 * resolution exactly; otherwise the wallet-session cookie resolves through the
 * address's **verified** link. Nothing is created here — a read must not mint
 * an identity — so a wallet-only trader resolves only after they have joined.
 */
import type { NextRequest } from "next/server"
import { getPrivyClient } from "@/lib/bridge/auth"
import { verifyStellarSessionCookie } from "@/lib/agents/stellar-session"
import { getAccountIdForPrivyDid, getAccountIdForStellarAddress } from "@/lib/challenge/db"

export async function resolveCallerAccountId(req: NextRequest): Promise<number | null> {
  return (await resolveCallerAccountIds(req))[0] ?? null
}

/**
 * Every account the request can vouch for, Privy first. Usually one; two when
 * a Privy login sits next to a Freighter key that entered on its own (before
 * the join route started linking them). Readers that look for "my row" should
 * try each in order rather than trusting the first — otherwise the person who
 * joined with the wallet is told they never did, the moment they also log in.
 */
export async function resolveCallerAccountIds(req: NextRequest): Promise<number[]> {
  const ids: number[] = []
  const header = req.headers.get("authorization")
  if (header?.startsWith("Bearer ")) {
    try {
      const claims = await getPrivyClient().verifyAuthToken(header.slice(7))
      if (claims?.userId) {
        const accountId = await getAccountIdForPrivyDid(claims.userId)
        if (accountId) ids.push(accountId)
      }
    } catch {
      /* an expired bearer falls through to the wallet session */
    }
  }

  try {
    const address = verifyStellarSessionCookie(req.cookies)
    if (address) {
      const accountId = await getAccountIdForStellarAddress(address)
      if (accountId && !ids.includes(accountId)) ids.push(accountId)
    }
  } catch {
    /* malformed cookie — treat as signed out */
  }
  return ids
}

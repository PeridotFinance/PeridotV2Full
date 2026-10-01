/**
 * Shared authentication for all agent routes.
 *
 * Historically each route duplicated the same Privy-token block inline. This
 * centralizes it AND adds the Stellar-wallet session path (Stufe 3), so a
 * "pure Freighter" user (no Privy session) can use the agent too. Resolution
 * order:
 *
 *   1. E2E bypass        — dev-only test harness (tryE2EAuth)
 *   2. Privy bearer      — social/email/EVM users; identity = EVM ?? Stellar
 *   3. Stellar session   — httpOnly cookie minted via /api/agents/stellar-auth
 *
 * `userAddress` is the primary DB/identity key (EVM 0x for EVM users, or a
 * Stellar G-address for Stellar-only users). `evmAddress` is null whenever the
 * user has no EVM wallet so callers can gate EVM-only work.
 */

import type { NextRequest } from 'next/server'
import { PrivyClient } from '@privy-io/server-auth'
import { tryE2EAuth } from './test-auth'
import { resolveAgentIdentity } from './resolve-wallet'
import { verifyStellarSessionCookie } from './stellar-session'

export interface AgentAuth {
  /** Primary identity key — EVM 0x or Stellar G-address. */
  userAddress: string
  /** EVM wallet when linked; null for Stellar-only users. */
  evmAddress: string | null
  /** Privy DID when authed via Privy; null for e2e / Stellar-session. */
  privyUserId: string | null
  method: 'e2e' | 'privy' | 'stellar'
}

const privy = new PrivyClient(
  process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
  process.env.PRIVY_APP_SECRET!,
)

/**
 * Authenticate an agent request. Returns the resolved identity, or null when
 * no valid credential is present (caller should 401).
 */
export async function authenticateAgentRequest(req: NextRequest): Promise<AgentAuth | null> {
  // 1. E2E bypass (dev only — tryE2EAuth no-ops in production).
  const e2e = tryE2EAuth(req.headers, req.cookies)
  if (e2e?.authorized) {
    return {
      userAddress: e2e.userAddress,
      evmAddress: e2e.userAddress,
      privyUserId: null,
      method: 'e2e',
    }
  }

  // 2. Privy bearer token.
  const authHeader = req.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const claims = await privy.verifyAuthToken(authHeader.substring(7))
      const identity = await resolveAgentIdentity(privy, claims.userId)
      if (identity.userAddress) {
        return {
          userAddress: identity.userAddress,
          evmAddress: identity.evmAddress,
          privyUserId: claims.userId,
          method: 'privy',
        }
      }
    } catch {
      // Fall through — a stale/invalid bearer shouldn't block a valid cookie.
    }
  }

  // 3. Stellar-wallet session cookie (Stufe 3).
  const stellarAddress = verifyStellarSessionCookie(req.cookies)
  if (stellarAddress) {
    return {
      userAddress: stellarAddress,
      evmAddress: null,
      privyUserId: null,
      method: 'stellar',
    }
  }

  return null
}

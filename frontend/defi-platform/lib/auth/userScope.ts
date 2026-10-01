/**
 * Server-side user scope for private-data endpoints.
 *
 * The security boundary for all "my data" routes (earnings, transactions,
 * portfolio, export-csv, referral stats, margin, …). Historically these routes
 * took an attacker-controlled `?address=0x…` and resolved it to the owning
 * Peridot account via `resolveLinkedWallets`, returning that account's *entire*
 * linked-wallet graph + aggregated financials to ANY caller — an IDOR +
 * deanonymization leak (which wallets belong to the same person).
 *
 * This module closes that hole: it verifies the Privy session, derives the
 * authenticated user's OWN account + verified addresses, and lets a route
 * assert that the requested address is one the caller actually owns. Identity
 * comes from the cryptographic Privy token, never from the request body/query.
 *
 * `loginMethods` in this app includes `'wallet'`, so every logged-in user —
 * social, email, OR external-wallet-via-Privy — has a verifiable token. The
 * only edge is token-readiness timing on first paint, which the frontend
 * handles by gating fetches on `authenticated && token` (see use-authed-fetch).
 */

import type { NextRequest } from "next/server"
import { PrivyClient } from "@privy-io/server-auth"
import { query } from "@/lib/database"
import { getTableNames } from "@/lib/tableResolver"
import {
  fetchPrivyLinkedWallets,
  upsertVerifiedEmbeddedLink,
  getOrCreateAccountId,
} from "@/app/api/account/wallet-links/_lib"

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID || process.env.PRIVY_APP_ID
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET

let privyClient: PrivyClient | null = null
function getPrivyClient(): PrivyClient {
  if (!PRIVY_APP_ID || !PRIVY_APP_SECRET) {
    throw new Error("Privy credentials are not configured")
  }
  if (!privyClient) privyClient = new PrivyClient(PRIVY_APP_ID, PRIVY_APP_SECRET)
  return privyClient
}

export interface UserScope {
  privyUserId: string
  accountId: number | null
  /** Lowercased EVM addresses the authenticated account owns (verified links + embedded EOA). */
  evmAddresses: string[]
  /** Uppercased Stellar addresses the authenticated account owns. */
  stellarAddresses: string[]
}

function normalizeEvm(a: string): string | null {
  return /^0x[a-fA-F0-9]{40}$/.test(a.trim()) ? a.trim().toLowerCase() : null
}
function normalizeStellar(a: string): string | null {
  const up = a.trim().toUpperCase()
  return /^(G|C)[A-Z2-7]{55}$/.test(up) ? up : null
}

/**
 * Verify the Privy bearer token and load the authenticated account's owned
 * addresses. Returns null when no/invalid token is present (caller should 401).
 *
 * Owned addresses come from two sources, unioned:
 *   1. account_wallet_links rows with verification_status='verified' for the
 *      account mapped to this Privy user (covers external wallets the user
 *      sign-to-linked, plus embedded wallets already synced).
 *   2. The Privy embedded wallet hint from the DID itself (the `0x…` embedded
 *      in `did:privy:…` style ids, when present) — a cheap belt-and-suspenders
 *      so a brand-new user whose links haven't been written yet still resolves.
 */
export async function authenticateUserScope(request: NextRequest): Promise<UserScope | null> {
  const authHeader = request.headers.get("authorization")
  if (!authHeader?.startsWith("Bearer ")) return null

  let privyUserId: string
  try {
    const claims = await getPrivyClient().verifyAuthToken(authHeader.slice(7))
    if (!claims?.userId) return null
    privyUserId = claims.userId
  } catch {
    return null
  }

  const t = getTableNames()

  const accountRows = await query(
    `SELECT id FROM ${t.peridotAccounts} WHERE privy_user_id = $1 LIMIT 1`,
    [privyUserId]
  )
  const accountId = accountRows.rows?.[0]?.id ? Number(accountRows.rows[0].id) : null

  const evmAddresses = new Set<string>()
  const stellarAddresses = new Set<string>()

  if (accountId) {
    const linkRows = await query(
      `SELECT normalized_address, chain_namespace
       FROM ${t.accountWalletLinks}
       WHERE account_id = $1 AND verification_status = 'verified'`,
      [accountId]
    )
    for (const row of (linkRows.rows || []) as Array<{ normalized_address?: string; chain_namespace?: string }>) {
      const addr = row.normalized_address
      if (!addr) continue
      if (row.chain_namespace === "evm") {
        const n = normalizeEvm(addr)
        if (n) evmAddresses.add(n)
      } else if (row.chain_namespace === "stellar") {
        const n = normalizeStellar(addr)
        if (n) stellarAddresses.add(n)
      }
    }
  }

  // Belt-and-suspenders: embedded EVM hint carried in the Privy DID.
  const hint = privyUserId.match(/0x[a-fA-F0-9]{40}/)?.[0]
  if (hint) {
    const n = normalizeEvm(hint)
    if (n) evmAddresses.add(n)
  }

  return {
    privyUserId,
    accountId,
    evmAddresses: [...evmAddresses],
    stellarAddresses: [...stellarAddresses],
  }
}

/**
 * True when `requestedAddress` is one the authenticated scope owns. Use this in
 * routes that still accept an `?address=` param so the frontend shape is
 * unchanged but the data is gated to the caller's own wallets.
 */
export function scopeOwnsAddress(scope: UserScope, requestedAddress: string | null | undefined): boolean {
  if (!requestedAddress) return false
  const evm = normalizeEvm(requestedAddress)
  if (evm) return scope.evmAddresses.includes(evm)
  const stellar = normalizeStellar(requestedAddress)
  if (stellar) return scope.stellarAddresses.includes(stellar)
  return false
}

/**
 * Ownership check with an authoritative fallback. Prefer this over the bare
 * `scopeOwnsAddress` in routes that gate an `?address=` param.
 *
 * Fast path: the DB-derived scope (verified links + DID hint) — covers the
 * steady state with zero extra latency.
 *
 * Fallback (only on a miss): ask Privy which wallets this *verified* session
 * actually owns — both embedded (Privy-managed) and external wallets the user
 * linked through Privy (Privy verifies control with a signature at link time,
 * so those are owned too). This removes the first-login race where a gated read
 * (balance, daily-login) beats the fire-and-forget `sync-embedded` write that
 * persists the verified link — previously a 403 that left balances empty and
 * silently dropped the day's check-in points. When the address matches, we
 * lazily self-heal the `account_wallet_links` row so subsequent requests take
 * the fast path. Authorization is proven by the token, so a failed heal still
 * grants access.
 */
export async function ensureScopeOwnsAddress(
  scope: UserScope,
  requestedAddress: string | null | undefined
): Promise<boolean> {
  if (scopeOwnsAddress(scope, requestedAddress)) return true
  if (!requestedAddress) return false

  const evm = normalizeEvm(requestedAddress)
  const stellar = evm ? null : normalizeStellar(requestedAddress)
  const target = evm || stellar
  if (!target) return false

  let linked: Awaited<ReturnType<typeof fetchPrivyLinkedWallets>>
  try {
    linked = await fetchPrivyLinkedWallets(scope.privyUserId)
  } catch (e) {
    console.warn("[userScope] Privy linked-wallet fetch failed; denying", e)
    return false
  }

  const match = linked.find((w) => w.normalized === target)
  if (!match) return false

  // Best-effort self-heal: persist the verified link and reflect it in the
  // in-memory scope for the rest of this request. Authorization already holds.
  try {
    const accountId = scope.accountId ?? (await getOrCreateAccountId(scope.privyUserId))
    scope.accountId = accountId
    await upsertVerifiedEmbeddedLink({
      accountId,
      namespace: match.namespace,
      address: match.address,
      normalized: match.normalized,
      verificationMethod: match.source === "embedded" ? "privy_embedded" : "privy_linked",
    })
    if (match.namespace === "evm") scope.evmAddresses.push(match.normalized)
    else scope.stellarAddresses.push(match.normalized)
  } catch (e) {
    console.warn("[userScope] self-heal link upsert failed (access still granted)", e)
  }

  return true
}

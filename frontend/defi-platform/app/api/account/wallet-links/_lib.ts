import { NextRequest, NextResponse } from "next/server"
import { PrivyClient } from "@privy-io/server-auth"
import { sql } from "@/lib/database"
import { getTableNames } from "@/lib/tableResolver"

export type ChainNamespace = "evm" | "stellar"

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID || process.env.PRIVY_APP_ID
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET

let privyClient: PrivyClient | null = null

function getPrivyClient(): PrivyClient {
  if (!PRIVY_APP_ID || !PRIVY_APP_SECRET) {
    throw new Error("Privy credentials are not configured")
  }
  if (!privyClient) {
    privyClient = new PrivyClient(PRIVY_APP_ID, PRIVY_APP_SECRET)
  }
  return privyClient
}

function extractEvmAddressHint(privyUserId: string): string | null {
  const match = privyUserId.match(/0x[a-fA-F0-9]{40}/)
  return match ? match[0].toLowerCase() : null
}

export async function authenticatePrivyRequest(
  request: NextRequest
): Promise<{ privyUserId: string; evmAddressHint: string | null } | NextResponse> {
  const authHeader = request.headers.get("authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ success: false, error: "Missing bearer token" }, { status: 401 })
  }

  const token = authHeader.slice(7)
  try {
    const claims = await getPrivyClient().verifyAuthToken(token)
    if (!claims?.userId) {
      return NextResponse.json({ success: false, error: "Invalid auth token" }, { status: 401 })
    }

    return {
      privyUserId: claims.userId,
      evmAddressHint: extractEvmAddressHint(claims.userId),
    }
  } catch {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }
}

/**
 * Soft-fail variant: returns null on missing/invalid token instead of a 401.
 * Use this from routes where Privy auth is optional (e.g. verify-stellar uses it
 * only to opportunistically link a Stellar wallet to the user's account; the tx
 * record itself must succeed regardless of auth).
 */
export async function tryAuthenticatePrivyUserId(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get("authorization")
  if (!authHeader?.startsWith("Bearer ")) return null
  const token = authHeader.slice(7)
  try {
    const claims = await getPrivyClient().verifyAuthToken(token)
    return claims?.userId ?? null
  } catch {
    return null
  }
}

export function parseChainNamespace(value: unknown): ChainNamespace | null {
  if (value === "evm" || value === "stellar") return value
  return null
}

export function normalizeLinkedWalletAddress(
  chainNamespace: ChainNamespace,
  rawAddress: string
): string | null {
  const trimmed = rawAddress.trim()
  if (!trimmed) return null

  if (chainNamespace === "evm") {
    if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed)) return null
    return trimmed.toLowerCase()
  }

  if (!/^(G|C)[A-Z2-7]{55}$/.test(trimmed.toUpperCase())) return null
  return trimmed.toUpperCase()
}

export async function getAccountIdForPrivyUser(privyUserId: string): Promise<number | null> {
  const t = getTableNames()
  const rows = (await sql`
    SELECT id
    FROM ${sql(t.peridotAccounts)}
    WHERE privy_user_id = ${privyUserId}
    LIMIT 1
  `) as Array<{ id: number }>
  const row = rows[0]
  return row ? Number(row.id) : null
}

export async function getOrCreateAccountId(privyUserId: string): Promise<number> {
  const t = getTableNames()
  const existing = await getAccountIdForPrivyUser(privyUserId)
  if (existing) return existing

  const inserted = (await sql`
    INSERT INTO ${sql(t.peridotAccounts)} (privy_user_id)
    VALUES (${privyUserId})
    ON CONFLICT (privy_user_id) DO UPDATE SET updated_at = NOW()
    RETURNING id
  `) as Array<{ id: number }>
  return Number(inserted[0].id)
}

export function formatWalletLinkRow(
  row: {
    id: number
    account_id: number
    chain_namespace: ChainNamespace
    chain_reference: string | null
    address: string
    normalized_address: string
    label: string | null
    is_primary: boolean
    verification_status: string
    verification_method: string | null
    verified_at: string | null
    metadata: Record<string, unknown> | null
    created_at: string
    updated_at: string
  }
) {
  return {
    id: Number(row.id),
    accountId: Number(row.account_id),
    chainNamespace: row.chain_namespace as ChainNamespace,
    chainReference: row.chain_reference || null,
    address: row.address,
    normalizedAddress: row.normalized_address,
    label: row.label || null,
    isPrimary: Boolean(row.is_primary),
    verificationStatus: row.verification_status,
    verificationMethod: row.verification_method || null,
    verifiedAt: row.verified_at || null,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export interface EmbeddedWalletRef {
  namespace: ChainNamespace
  /** Original-cased address as Privy reports it. */
  address: string
  /** Lowercased (EVM) / uppercased (Stellar) lookup form. */
  normalized: string
}

export interface LinkedWalletRef extends EmbeddedWalletRef {
  /**
   * `embedded` = Privy-managed wallet (key custodied by Privy; no signature
   * needed to prove ownership). `external` = a wallet the user connected and
   * linked through Privy's flow, where Privy verified control via a signature
   * at link time. Both are authoritative proof the session owns the address.
   */
  source: "embedded" | "external"
}

/**
 * Authoritatively read the wallets Privy attributes to this user, straight from
 * Privy's server — never from the client. This is the security boundary: the
 * Privy session proves ownership of exactly these addresses. Trusting
 * client-supplied addresses here would let a caller claim someone else's wallet
 * (and siphon its leaderboard points into their account via aggregation).
 *
 * Includes both the embedded EVM/Stellar wallets and EVM wallets the user
 * linked externally through Privy (Privy verifies control with a signature when
 * an external wallet is linked, so those are owned too). Stellar only ever
 * appears as the embedded wallet — external Freighter connects via the Wallets
 * Kit, not Privy.
 */
export async function fetchPrivyLinkedWallets(privyUserId: string): Promise<LinkedWalletRef[]> {
  const user = await getPrivyClient().getUser(privyUserId)
  const accounts = ((user as { linkedAccounts?: unknown[] })?.linkedAccounts ?? []) as Array<Record<string, unknown>>
  const out: LinkedWalletRef[] = []
  for (const a of accounts) {
    if (a?.type !== "wallet") continue
    const address = typeof a?.address === "string" ? a.address : null
    if (!address) continue
    const chainType = a?.chainType
    const isPrivyManaged = a?.walletClientType === "privy"

    if (chainType === "ethereum") {
      const normalized = normalizeLinkedWalletAddress("evm", address)
      if (normalized) out.push({ namespace: "evm", address, normalized, source: isPrivyManaged ? "embedded" : "external" })
    } else if (chainType === "stellar") {
      const normalized = normalizeLinkedWalletAddress("stellar", address)
      if (normalized) out.push({ namespace: "stellar", address, normalized, source: "embedded" })
    }
  }
  return out
}

/**
 * The embedded-only subset of {@link fetchPrivyLinkedWallets}. Used by the
 * login-time auto-link, which intentionally only auto-verifies embedded wallets
 * (external wallets go through the explicit sign-to-link flow there).
 */
export async function fetchPrivyEmbeddedWallets(privyUserId: string): Promise<EmbeddedWalletRef[]> {
  const all = await fetchPrivyLinkedWallets(privyUserId)
  return all
    .filter((w) => w.source === "embedded")
    .map(({ namespace, address, normalized }) => ({ namespace, address, normalized }))
}

export type EmbeddedLinkOutcome = "inserted" | "verified" | "collision"

/**
 * Upsert a `verified` account_wallet_links row for a Privy-proven wallet.
 * Mirrors the opportunistic-link logic in verify-stellar but is namespace-
 * generic. `verificationMethod` records how ownership was proven (defaults to
 * `privy_embedded`; pass `privy_linked` for externally-linked wallets). Refuses
 * to move an address that another account already owns (returns 'collision').
 */
export async function upsertVerifiedEmbeddedLink(params: {
  accountId: number
  namespace: ChainNamespace
  address: string
  normalized: string
  verificationMethod?: string
}): Promise<EmbeddedLinkOutcome> {
  const t = getTableNames()
  const { accountId, namespace, address, normalized, verificationMethod = "privy_embedded" } = params

  const existing = (await sql`
    SELECT id, account_id
    FROM ${sql(t.accountWalletLinks)}
    WHERE chain_namespace = ${namespace}
      AND normalized_address = ${normalized}
    LIMIT 1
  `) as Array<{ id: number; account_id: number }>

  const row = existing[0]
  if (row && Number(row.account_id) !== accountId) {
    console.warn(
      "[embedded-link] address already linked to a different account; skipping.",
      { namespace, normalized, requestingAccount: accountId, ownerAccount: row.account_id },
    )
    return "collision"
  }

  if (row) {
    await sql`
      UPDATE ${sql(t.accountWalletLinks)}
      SET verification_status = 'verified',
          verification_method = ${verificationMethod},
          verified_at = COALESCE(verified_at, NOW()),
          updated_at = NOW()
      WHERE id = ${Number(row.id)}
    `
    return "verified"
  }

  const existingChainLinks = (await sql`
    SELECT COUNT(*)::int AS cnt
    FROM ${sql(t.accountWalletLinks)}
    WHERE account_id = ${accountId}
      AND chain_namespace = ${namespace}
  `) as Array<{ cnt: number }>
  const isFirst = Number(existingChainLinks[0]?.cnt || 0) === 0

  await sql`
    INSERT INTO ${sql(t.accountWalletLinks)} (
      account_id, chain_namespace, address, normalized_address,
      is_primary, verification_status, verification_method, verified_at
    )
    VALUES (
      ${accountId}, ${namespace}, ${address}, ${normalized},
      ${isFirst}, 'verified', ${verificationMethod}, NOW()
    )
  `
  return "inserted"
}

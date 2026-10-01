import { query } from "@/lib/database"
import { getTableNames } from "@/lib/tableResolver"

export function normalizeLookupAddress(input: string): string {
  const trimmed = input.trim()
  if (/^0x[a-fA-F0-9]{40}$/.test(trimmed)) return trimmed.toLowerCase()
  if (/^(G|C)[A-Z2-7]{55}$/i.test(trimmed)) return trimmed.toUpperCase()
  return trimmed
}

export interface LinkedWalletResolution {
  accountId: number | null
  /** Combined list of all verified addresses across namespaces, suitable for `WHERE wallet_address = ANY($1)`. */
  walletAddresses: string[]
  evmAddresses: string[]
  stellarAddresses: string[]
  cacheScopeKey: string
}

function toEvmLookupAddress(normalized: string): string {
  if (/^0x[a-f0-9]{40}$/i.test(normalized)) return normalized.toLowerCase()
  return normalized
}

function isEvmFormat(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address)
}

function isStellarFormat(address: string): boolean {
  return /^(G|C)[A-Z2-7]{55}$/i.test(address)
}

interface LinkRow {
  normalized_address?: string
  chain_namespace?: string
}

/**
 * Look up every verified wallet linked to the same Peridot account as `inputAddress`.
 * Resolves across both EVM and Stellar namespaces so a single Privy user with
 * Privy + Freighter sees unified data.
 *
 * If the input address has no account_wallet_links row yet (anonymous lookup),
 * falls back to returning just that address in the appropriate namespace bucket.
 */
export async function resolveLinkedWallets(inputAddress: string): Promise<LinkedWalletResolution> {
  const t = getTableNames()
  const normalized = normalizeLookupAddress(inputAddress)

  const matchedLinkResult = await query(
    `SELECT account_id
     FROM ${t.accountWalletLinks}
     WHERE normalized_address = $1
     LIMIT 1`,
    [normalized]
  )

  const matchedLink = matchedLinkResult.rows?.[0]
  const accountId = matchedLink?.account_id ? Number(matchedLink.account_id) : null

  if (!accountId) {
    const fallback = isEvmFormat(normalized) ? toEvmLookupAddress(normalized) : normalized
    const evmAddresses = isEvmFormat(normalized) ? [fallback] : []
    const stellarAddresses = isStellarFormat(normalized) ? [fallback] : []
    return {
      accountId: null,
      walletAddresses: [fallback],
      evmAddresses,
      stellarAddresses,
      cacheScopeKey: `wallet:${fallback}`,
    }
  }

  const linkedResult = await query(
    `SELECT normalized_address, chain_namespace
     FROM ${t.accountWalletLinks}
     WHERE account_id = $1
       AND verification_status = 'verified'
     ORDER BY chain_namespace ASC, is_primary DESC, created_at ASC`,
    [accountId]
  )

  const evmAddresses: string[] = []
  const stellarAddresses: string[] = []
  for (const row of (linkedResult.rows || []) as LinkRow[]) {
    const addr = row.normalized_address
    if (!addr) continue
    if (row.chain_namespace === "evm") {
      evmAddresses.push(addr.toLowerCase())
    } else if (row.chain_namespace === "stellar") {
      stellarAddresses.push(addr.toUpperCase())
    }
  }

  // Fall back to the input address in its own bucket if no verified rows came back
  // (e.g., link exists but is still pending). Avoids returning an empty result that
  // would silently hide the user's data.
  if (evmAddresses.length === 0 && stellarAddresses.length === 0) {
    if (isEvmFormat(normalized)) evmAddresses.push(toEvmLookupAddress(normalized))
    else if (isStellarFormat(normalized)) stellarAddresses.push(normalized)
  }

  return {
    accountId,
    walletAddresses: [...evmAddresses, ...stellarAddresses],
    evmAddresses,
    stellarAddresses,
    cacheScopeKey: `account:${accountId}`,
  }
}

/**
 * @deprecated Use `resolveLinkedWallets` — this alias returns EVM-only addresses
 * for callers that historically only consumed EVM lookups (level-data,
 * portfolio-data, earnings, export-csv). Keeping the EVM-only behavior avoids
 * accidentally pushing G-addresses into queries that were never built for them.
 */
export async function resolveLinkedEvmWallets(
  inputAddress: string
): Promise<{ accountId: number | null; walletAddresses: string[]; cacheScopeKey: string }> {
  const full = await resolveLinkedWallets(inputAddress)
  const walletAddresses =
    full.evmAddresses.length > 0
      ? full.evmAddresses
      : isEvmFormat(normalizeLookupAddress(inputAddress))
        ? [toEvmLookupAddress(normalizeLookupAddress(inputAddress))]
        : full.walletAddresses
  return {
    accountId: full.accountId,
    walletAddresses,
    cacheScopeKey: full.cacheScopeKey,
  }
}

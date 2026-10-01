/**
 * Resolve the caller's EVM wallet address from a Privy auth token.
 *
 * Privy `userId` is a DID like `did:privy:<id>`. For wallet-first logins the
 * `<id>` IS the 0x address; for social/email logins it's an internal Privy
 * user ID, and the linked wallet has to be fetched from Privy's server API.
 *
 * Selection priority matches what the frontend's `useActiveWallet` exposes:
 *   1. Privy-managed embedded EVM wallet — this is what the UI pill shows for
 *      social/email logins, and what `privy:connections` in localStorage
 *      points to. Must win over `user.wallet.address` because the latter can
 *      be stale (e.g. points at a previously-linked external wallet the user
 *      isn't actively using, leading the agent to read the WRONG wallet's
 *      balances — see the 0xda5d…/0x35DF… mismatch bug).
 *   2. Any other EVM wallet in `linkedAccounts` (e.g. external wallet-first
 *      login without an embedded wallet).
 *   3. Legacy `user.wallet.address` as last-resort fallback.
 *
 * Returns null when no EVM wallet is linked.
 */

import type { PrivyClient } from '@privy-io/server-auth'

const EVM_RE = /0x[a-fA-F0-9]{40}/

interface LinkedAccount {
  address?: string
  type?: string
  chainType?: string
  walletClientType?: string
  connectorType?: string
}

function isEvmAddress(a: string | undefined): a is string {
  return typeof a === 'string' && EVM_RE.test(a) && !/^0x0{40}$/i.test(a)
}

export async function resolveEvmAddress(
  privy: PrivyClient,
  userId: string,
): Promise<string | null> {
  // Wallet-first logins have the address embedded in the DID.
  const hint = userId.match(EVM_RE)?.[0]
  if (hint) return hint.toLowerCase()

  try {
    const user = await privy.getUserById(userId)
    const linked =
      (user as { linkedAccounts?: LinkedAccount[] } | null)?.linkedAccounts ?? []

    // 1) Privy embedded EVM wallet — matches `useActiveWallet` on the client.
    const embedded = linked.find(
      (a) =>
        a?.type === 'wallet' &&
        a?.chainType !== 'solana' &&
        (a?.walletClientType === 'privy' || a?.connectorType === 'embedded') &&
        isEvmAddress(a?.address),
    )
    if (embedded?.address) return embedded.address.toLowerCase()

    // 2) Any non-Solana EVM wallet in linkedAccounts.
    const external = linked.find(
      (a) => a?.type === 'wallet' && a?.chainType !== 'solana' && isEvmAddress(a?.address),
    )
    if (external?.address) return external.address.toLowerCase()

    // 3) Legacy fallback — may be stale for users with multiple linked wallets.
    const primary = (user as { wallet?: { address?: string } } | null)?.wallet?.address
    if (isEvmAddress(primary)) return primary.toLowerCase()
  } catch {
    // fall through — caller decides how to handle "no address"
  }
  return null
}

const STELLAR_RE = /^G[A-Z2-7]{55}$/

/**
 * Resolve the caller's Privy-managed embedded Stellar wallet (Tier-2) from a
 * Privy user id. This is the wallet the user signs Soroban lending txs with, so
 * it's the natural Bridge auto-forward / payout destination. Returns null when
 * no embedded Stellar wallet is linked (e.g. the embedded flag is off, or the
 * wallet hasn't provisioned yet).
 */
/**
 * Resolve the agent's identity for a Privy user: the EVM wallet when linked,
 * otherwise the Stellar wallet (Stufe 1 — Stellar-only users). `userAddress`
 * is the primary key the agent uses for DB rows / action lookups; `evmAddress`
 * is null for Stellar-only users so callers can gate EVM-only work. Both null
 * means no wallet linked → caller should 401. Keeping this in one place ensures
 * the chat route and the execute route resolve the SAME identity, so action
 * rows written by one are found by the other.
 */
export async function resolveAgentIdentity(
  privy: PrivyClient,
  userId: string,
): Promise<{ userAddress: string | null; evmAddress: string | null }> {
  const evmAddress = await resolveEvmAddress(privy, userId)
  if (evmAddress) return { userAddress: evmAddress, evmAddress }
  const stellar = await resolveStellarAddress(privy, userId)
  return { userAddress: stellar, evmAddress: null }
}

export async function resolveStellarAddress(
  privy: PrivyClient,
  userId: string,
): Promise<string | null> {
  try {
    const user = await privy.getUserById(userId)
    const linked =
      (user as { linkedAccounts?: LinkedAccount[] } | null)?.linkedAccounts ?? []
    const embedded = linked.find(
      (a) =>
        a?.type === 'wallet' &&
        a?.chainType === 'stellar' &&
        typeof a?.address === 'string' &&
        STELLAR_RE.test(a.address),
    )
    return embedded?.address ?? null
  } catch {
    return null
  }
}

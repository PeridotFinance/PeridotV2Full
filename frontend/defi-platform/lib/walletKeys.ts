/**
 * How a wallet address is keyed in the database.
 *
 * Two conventions live side by side, and mixing them up is what made Stellar
 * users invisible to the points system:
 *
 *   1. Wallet-IDENTITY tables — leaderboard_users, verified_transactions,
 *      daily_logins, leaderboard_ranks, referrals, premium/boost, the APY and
 *      earnings caches — store the address chain-natively: EVM hex lowercased
 *      (it is case-insensitive), Stellar base32 preserved exactly (it is NOT —
 *      lowercasing a G-address produces a different, invalid address).
 *      Use {@link normalizeWalletAddress}.
 *
 *   2. user_profiles — display data (username, badges, selections), not an
 *      identity — is keyed by the LOWERCASED address on every chain. Joins onto
 *      it therefore wrap the other side in LOWER(). Use {@link profileKey}.
 *
 * The bug this replaces: writes went through the chain-native rule while every
 * read did an unconditional `toLowerCase()`, so a G-address lookup matched no
 * row at all. Stellar traders were earning points (verify-stellar writes them)
 * that no query could return — and `getUserRank`'s "count everyone above me"
 * subquery compared against NULL and reported them as rank #1.
 *
 * Kept in its own dependency-free module so it is importable from both server
 * code and tests (lib/database.ts pulls in node built-ins).
 */

const STELLAR_ACCOUNT_RE = /^G[A-Z2-7]{55}$/
const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/

/**
 * The key for wallet-identity tables. For an EVM address this is exactly
 * `toLowerCase()`, so switching a call site over can never change EVM behaviour.
 */
export function normalizeWalletAddress(addr: string): string {
  if (!addr) return addr
  if (STELLAR_ACCOUNT_RE.test(addr)) return addr
  return addr.toLowerCase()
}

/** The key `user_profiles` is stored under: always lowercase, on every chain. */
export function profileKey(addr: string): string {
  return (addr || '').toLowerCase()
}

/** A wallet address the points system can key on: EVM hex or Stellar account. */
export function isSupportedWallet(addr: string | null | undefined): boolean {
  if (!addr) return false
  return EVM_ADDRESS_RE.test(addr) || STELLAR_ACCOUNT_RE.test(addr.toUpperCase())
}

/**
 * Referral counters for the leaderboard payloads (/api/leaderboard/aggregate,
 * /api/user/me).
 *
 * Both routes used to read two things that could never be right:
 *
 *   1. `getTableNames()`, which on mainnet resolves to the `_mainnet` referral
 *      twins. Those are empty; every row lives in the unsuffixed tables
 *      (REFERRAL_TABLES).
 *   2. `referral_stats.total_referrals` / `verified_referrals`. The trigger
 *      functions that were meant to maintain them exist in the database, but
 *      no trigger calls them, so every counter is 0 (1658 rows, all zero, on
 *      2026-09-11, against 3848 referrals of which 2593 verified).
 *
 * So the counts come from `referrals` itself, across every address the account
 * owns: a referral code made with the EVM wallet still belongs to the user when
 * they look at the leaderboard with their Stellar one, as in /api/referral/stats.
 */

import { query } from "@/lib/database"
import { REFERRAL_TABLES as T } from "@/lib/referral/ambassador"

export interface ReferralSummary {
  stats: {
    totalReferrals: number
    verifiedReferrals: number
    /** When the most recent referral landed. */
    lastUpdated: string | null
    referralCode: string | null
  }
  referredUsers: { walletAddress: string; referredAt: string; isVerified: boolean }[]
}

/**
 * @param addresses chain-native keys (normalizeWalletAddress) of every wallet
 *   the account owns.
 * @param preferred the address the caller asked with; its code wins when
 *   several of the account's addresses carry one.
 * @param includeReferredUsers the list of invited wallets is private to the
 *   owner. Only an authenticated route may ask for it.
 */
export async function getReferralSummary(
  addresses: string[],
  preferred: string,
  { includeReferredUsers }: { includeReferredUsers: boolean }
): Promise<ReferralSummary> {
  const owned = Array.from(new Set([preferred, ...addresses]))

  const [counts, code, referred] = await Promise.all([
    query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE is_verified)::int AS verified,
              MAX(referred_at) AS last_referred_at
         FROM ${T.referrals}
        WHERE referrer_wallet_address = ANY($1::text[])`,
      [owned]
    ),
    query(
      `SELECT referral_code
         FROM ${T.referralCodes}
        WHERE user_wallet_address = ANY($1::text[])
        ORDER BY (user_wallet_address = $2) DESC, created_at ASC
        LIMIT 1`,
      [owned, preferred]
    ),
    includeReferredUsers
      ? query(
          `SELECT referred_wallet_address, referred_at, is_verified
             FROM ${T.referrals}
            WHERE referrer_wallet_address = ANY($1::text[])
            ORDER BY referred_at DESC`,
          [owned]
        )
      : Promise.resolve({ rows: [] as any[] }),
  ])

  const row = (counts.rows?.[0] ?? {}) as any
  return {
    stats: {
      totalReferrals: Number(row.total) || 0,
      verifiedReferrals: Number(row.verified) || 0,
      lastUpdated: row.last_referred_at ?? null,
      referralCode: (code.rows?.[0] as any)?.referral_code ?? null,
    },
    referredUsers: (referred.rows || []).map((r: any) => ({
      walletAddress: r.referred_wallet_address,
      referredAt: r.referred_at,
      isVerified: r.is_verified,
    })),
  }
}

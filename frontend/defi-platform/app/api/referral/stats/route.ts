import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/database'
import { resolveReferralScope } from '@/lib/referral/scope'
import { normalizeWalletAddress } from '@/lib/walletKeys'
import {
  AMBASSADOR_PROGRAM,
  REFERRAL_TABLES as T,
  toProgress,
} from '@/lib/referral/ambassador'

// Server-side cache for referral stats to prevent DoS
const referralCache = new Map<string, { data: any, timestamp: number }>();
const pendingRequests = new Map<string, Promise<any>>();
const CACHE_TTL = 30000; // 30 seconds

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const walletAddress = searchParams.get('walletAddress')

    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Wallet address is required' },
        { status: 400 }
      )
    }

    // Referral network (referred-users list) is private — owner only. Accepts
    // either credential: a Privy bearer, or the Stellar wallet-session cookie a
    // pure-Freighter user holds (see lib/referral/scope).
    const { scope, denied } = await resolveReferralScope(request, walletAddress)
    if (!scope) {
      return NextResponse.json(
        { error: denied ? 'Forbidden' : 'Unauthorized' },
        { status: denied ? 403 : 401 }
      )
    }

    const wallet = normalizeWalletAddress(walletAddress)

    // The Ambassador Program pays out on Stellar, but the referral code was
    // very likely generated with the user's EVM wallet — so the lookup spans
    // every address this account owns, not just the one it is connected with.
    // Without this, a Freighter session shows an empty referral page to
    // somebody who has ten invitees.
    const owned = scope.owned

    // 1. Check cache
    const cacheKey = [...owned].sort().join('|')
    const cached = referralCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      return NextResponse.json(cached.data, {
        headers: {
          'Cache-Control': 'private, s-maxage=30, stale-while-revalidate=60',
          'X-Cache': 'HIT'
        }
      });
    }

    // 2. Coalesce requests
    if (pendingRequests.has(cacheKey)) {
      const coalescedData = await pendingRequests.get(cacheKey);
      return NextResponse.json(coalescedData, {
        headers: {
          'Cache-Control': 'private, s-maxage=30, stale-while-revalidate=60',
          'X-Cache': 'COALESCED'
        }
      });
    }

    const fetchPromise = (async () => {
      // Code + counters. The requested wallet wins when several of the
      // account's addresses happen to carry a code, so the link a user sees
      // does not change as they switch chains.
      const codeResult = await query(
        `SELECT c.user_wallet_address,
                c.referral_code,
                COALESCE(s.total_referrals, 0) AS total_referrals,
                COALESCE(s.verified_referrals, 0) AS verified_referrals,
                s.last_updated
           FROM ${T.referralCodes} c
           LEFT JOIN ${T.referralStats} s ON s.user_wallet_address = c.user_wallet_address
          WHERE c.user_wallet_address = ANY($1::text[])
          ORDER BY (c.user_wallet_address = $2) DESC, c.created_at ASC
          LIMIT 1`,
        [owned, wallet]
      )
      const code = codeResult.rows[0] || null

      // Invitees + their milestone progress, across every owned address.
      //
      // The reward row rides along because `qualified_at` alone does not mean
      // money: a self-referral (both wallets, one Peridot account) reaches the
      // milestone and is booked `void`. Without this the page would show the
      // person a "$5 earned" badge for a reward that will never be paid.
      const referredResult = await query(
        `SELECT r.id,
                r.referred_wallet_address,
                r.referred_at,
                r.is_verified,
                r.hold_streak_started_on,
                r.hold_streak_days,
                r.last_supply_usd,
                r.last_checked_at,
                r.qualified_at,
                w.status AS reward_status
           FROM ${T.referrals} r
           LEFT JOIN ${T.rewards} w
             ON w.referral_id = r.id AND w.role = 'referrer'
          WHERE r.referrer_wallet_address = ANY($1::text[])
          ORDER BY r.referred_at DESC`,
        [owned]
      )

      const referredUsers = (referredResult.rows || []).map((row: any) => ({
        walletAddress: row.referred_wallet_address,
        referredAt: row.referred_at,
        isVerified: row.is_verified,
        progress: toProgress(row),
        rewardStatus: row.reward_status ?? null,
      }))

      // Money earned by this account, on either side of a referral — a user who
      // was invited and then invited others has both.
      const rewardsResult = await query(
        `SELECT role, status, COUNT(*)::int AS count, COALESCE(SUM(amount_usd), 0) AS total_usd
           FROM ${T.rewards}
          WHERE beneficiary_wallet_address = ANY($1::text[])
          GROUP BY role, status`,
        [owned]
      )

      let earnedUsd = 0
      let paidUsd = 0
      let qualifiedCount = 0
      for (const row of (rewardsResult.rows || []) as any[]) {
        const amount = Number(row.total_usd) || 0
        if (row.status === 'earned') {
          earnedUsd += amount
          qualifiedCount += Number(row.count) || 0
        } else if (row.status === 'paid') {
          paidUsd += amount
          qualifiedCount += Number(row.count) || 0
        }
        // `void` rows (self-referral) are deliberately invisible here.
      }

      const resultData = {
        success: true,
        stats: {
          // Counted from the invitee list: referral_stats' counters are never
          // maintained (no trigger drives them) and read 0 for everyone.
          totalReferrals: referredUsers.length,
          verifiedReferrals: referredUsers.filter((u) => u.isVerified).length,
          lastUpdated: code?.last_updated || null,
          referralCode: code?.referral_code || null,
          // Ambassador milestone rollup. A voided referral reached the
          // milestone but earns nothing, so it must not be counted as one that
          // did — the number sits directly above "Rewards Earned".
          qualifiedReferrals: referredUsers.filter(
            (u) => u.progress.qualified && u.rewardStatus !== 'void'
          ).length,
          rewardsEarnedUsd: earnedUsd,
          rewardsPaidUsd: paidUsd,
          rewardsPendingUsd: earnedUsd,
          rewardCount: qualifiedCount,
        },
        program: AMBASSADOR_PROGRAM,
        referredUsers,
      };

      referralCache.set(cacheKey, { data: resultData, timestamp: Date.now() });
      return resultData;
    })();

    pendingRequests.set(cacheKey, fetchPromise);

    try {
      const resultData = await fetchPromise;
      return NextResponse.json(resultData, {
        headers: {
          'Cache-Control': 'private, s-maxage=30, stale-while-revalidate=60',
          'X-Cache': 'MISS'
        }
      });
    } finally {
      pendingRequests.delete(cacheKey);
    }

  } catch (error) {
    console.error('Error fetching referral stats:', error)
    return NextResponse.json(
      { error: 'Failed to fetch referral statistics' },
      { status: 500 }
    )
  }
}

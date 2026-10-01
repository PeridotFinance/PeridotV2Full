import { NextRequest, NextResponse } from 'next/server'
import { LeaderboardDB, query } from '@/lib/database'
import { getDailyLoginPoints } from '@/lib/rewards/policy'
import { resolveLinkedEvmWallets } from '@/lib/linkedAccountResolver'
import { getTableNames } from '@/lib/tableResolver'
import { LEADERBOARD_ACCOUNT_SCOPED } from '@/config/featureFlags'
import { AccountLeaderboardDB } from '@/lib/leaderboardAccount'
import { resolveAccountIdentity } from '@/lib/accountIdentity'

// Server-side cache for level data to prevent DoS
const levelDataCache = new Map<string, { data: any, timestamp: number }>();
const pendingRequests = new Map<string, Promise<any>>();
const CACHE_TTL = 60000; // 60 seconds

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const inputAddress = searchParams.get('wallet')

    if (!inputAddress || !inputAddress.trim()) {
      return NextResponse.json({ error: 'Wallet address required' }, { status: 400 })
    }

    const { accountId, walletAddresses, cacheScopeKey } = await resolveLinkedEvmWallets(inputAddress)
    const cacheKey = cacheScopeKey

    // 1. Check cache
    const cached = levelDataCache.get(cacheKey)
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      return NextResponse.json(cached.data, {
        headers: { 
          'X-Cache': 'HIT',
          'Cache-Control': 'private, s-maxage=60, stale-while-revalidate=120'
        }
      })
    }

    // 2. Coalesce concurrent requests
    if (pendingRequests.has(cacheKey)) {
      const coalescedData = await pendingRequests.get(cacheKey)
      return NextResponse.json(coalescedData, {
        headers: { 
          'X-Cache': 'COALESCED',
          'Cache-Control': 'private, s-maxage=60, stale-while-revalidate=120'
        }
      })
    }

    const fetchPromise = (async () => {
      const t = getTableNames()
      const accountScopedFlag = LEADERBOARD_ACCOUNT_SCOPED

      // Account-scoped path: single MV lookup; aggregation already pre-computed.
      let accountScopedUser: any = null
      if (accountScopedFlag !== 'off') {
        try {
          const identity = await resolveAccountIdentity(inputAddress)
          const acct = await AccountLeaderboardDB.getAccount(identity.accountKey)
          if (acct) {
            accountScopedUser = {
              wallet_address: acct.display_wallet,
              account_key: acct.account_key,
              linked_wallet_count: acct.linked_wallet_count,
              wallet_addresses: acct.wallet_addresses,
              total_points: Number(acct.total_points || 0),
              supply_count: Number(acct.supply_count || 0),
              borrow_count: Number(acct.borrow_count || 0),
              repay_count: Number(acct.repay_count || 0),
              redeem_count: Number(acct.redeem_count || 0),
              last_updated: acct.last_updated || null,
              created_at: acct.last_updated || null,
              rank: acct.global_rank ?? null,
              all_time_points: Number(acct.total_points || 0),
              global_rank: acct.global_rank ?? null,
            }
          }
        } catch (err) {
          console.warn('[LevelData] account-scoped lookup failed, falling back:', (err as any)?.message)
        }
      }

      // Legacy per-wallet aggregation (still authoritative when flag != 'on').
      const aggregateRows = await query(
        `SELECT
          COALESCE(SUM(total_points), 0) AS total_points,
          COALESCE(SUM(supply_count), 0) AS supply_count,
          COALESCE(SUM(borrow_count), 0) AS borrow_count,
          COALESCE(SUM(repay_count), 0) AS repay_count,
          COALESCE(SUM(redeem_count), 0) AS redeem_count,
          MAX(last_updated) AS last_updated
        FROM ${t.leaderboardUsers}
        WHERE wallet_address = ANY($1::text[])`,
        [walletAddresses]
      )
      const aggregate = aggregateRows.rows?.[0] || {}
      const totalPoints = Number(aggregate.total_points || 0)
      const representativeWallet = walletAddresses[0] || inputAddress.toLowerCase()

      // Keep rank compatible by using representative linked EVM wallet rank.
      const userRank = await LeaderboardDB.getUserRank(representativeWallet)
      const legacyUser = {
        wallet_address: representativeWallet,
        total_points: totalPoints,
        supply_count: Number(aggregate.supply_count || 0),
        borrow_count: Number(aggregate.borrow_count || 0),
        repay_count: Number(aggregate.repay_count || 0),
        redeem_count: Number(aggregate.redeem_count || 0),
        last_updated: aggregate.last_updated || null,
        created_at: aggregate.last_updated || null,
      }

      // Divergence log in dual-read mode (10% sample).
      if (accountScopedFlag === 'dual-read' && accountScopedUser && Math.random() < 0.1) {
        if (Number(accountScopedUser.total_points) !== totalPoints) {
          console.warn('[level_data_account_scope_divergence]', JSON.stringify({
            requestedAddress: inputAddress,
            accountKey: accountScopedUser.account_key,
            oldPoints: totalPoints,
            newPoints: accountScopedUser.total_points,
            linkedWalletCount: accountScopedUser.linked_wallet_count,
          }))
        }
      }

      const useAccountScope = accountScopedFlag === 'on' && accountScopedUser !== null
      const user = useAccountScope ? accountScopedUser : legacyUser

      // Return data in the same format as the aggregate endpoint
      const response = {
        account: {
          accountId,
          requestedAddress: inputAddress,
          resolvedWallets: walletAddresses,
        },
        user: user ? (useAccountScope ? user : {
          ...user,
          rank: userRank ?? null,
          all_time_points: Number(totalPoints || 0),
          global_rank: userRank,
        }) : null,
        profile: user ? {
          wallet_address: representativeWallet,
          username: null,
          xp: Number(totalPoints || 0),
          selections: {
            badgeId: null,
            borderColor: null,
            nameEmoji: null,
          },
          display: {
            displayBadge: null,
            borderColor: null,
            nameEmoji: null,
          },
          earnedBadges: [],
          unlocked: {
            emojis: [],
            borderColors: [],
          },
          nextBadge: null,
          afterNextBadgeHint: null,
        } : null,
        transactions: [],
        referral: {
          stats: {
            totalReferrals: 0,
            verifiedReferrals: 0,
            lastUpdated: null,
            referralCode: null,
          },
          referredUsers: [],
        },
        dailyLogin: {
          eligible: false,
          loginHistory: [],
          loginStreak: 0,
          dailyPoints: getDailyLoginPoints(),
        },
      }

      const result = { success: true, ...response };
      levelDataCache.set(cacheKey, { data: result, timestamp: Date.now() });
      return result;
    })()

    pendingRequests.set(cacheKey, fetchPromise)

    try {
      const result = await fetchPromise
      return NextResponse.json(result, {
        headers: { 
          'X-Cache': 'MISS',
          'Cache-Control': 'private, s-maxage=60, stale-while-revalidate=120'
        }
      })
    } finally {
      pendingRequests.delete(cacheKey)
    }

  } catch (error) {
    console.error('Level data API error:', error)
    return NextResponse.json({ error: 'Failed to fetch level data' }, { status: 500 })
  }
}




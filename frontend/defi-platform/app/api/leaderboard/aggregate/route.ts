import { NextRequest, NextResponse } from 'next/server'
import { LeaderboardDB, query, sql, normalizeWalletAddress, isSupportedWallet } from '@/lib/database'
import { getTableNames } from '@/lib/tableResolver'
import { deriveDisplayFromProfile, getAllBadges, getAfterNextBadge, getCurrentSeason, getEarnedBadges, getNextBadge, getUniqueMultiPositionCriteria, getBadgesByIds } from '@/lib/achievements'
import { getDailyLoginPoints } from '@/lib/rewards/policy'
import { LEADERBOARD_ACCOUNT_SCOPED } from '@/config/featureFlags'
import { AccountLeaderboardDB } from '@/lib/leaderboardAccount'
import { resolveAccountIdentity } from '@/lib/accountIdentity'
import { getReferralSummary } from '@/lib/referral/summary'

// Server-side cache for aggregate data to prevent DoS
const aggregateCache = new Map<string, { data: any, timestamp: number }>();
const pendingRequests = new Map<string, Promise<any>>();
const CACHE_TTL = 30000; // 30 seconds

// All-time grand totals move very slowly (a few new wallets/txs per minute) and
// are identical across every wallet/period/offset cache key. Memoize them
// separately with a longer TTL so the extra count queries don't run on every
// per-wallet aggregate miss.
const ALL_TIME_STATS_TTL = 5 * 60 * 1000; // 5 minutes
let allTimeStatsCache: {
  data: { total_users: number; total_verified_transactions: number; total_points_awarded: number }
  timestamp: number
} | null = null;

async function getGlobalAllTimeStatsCached() {
  if (allTimeStatsCache && Date.now() - allTimeStatsCache.timestamp < ALL_TIME_STATS_TTL) {
    return allTimeStatsCache.data;
  }
  const data = await LeaderboardDB.getGlobalAllTimeStats();
  allTimeStatsCache = { data, timestamp: Date.now() };
  return data;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = Math.min(1000, Math.max(1, parseInt(searchParams.get('limit') || '100')))
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0'))
    const rawWallet = searchParams.get('wallet')?.trim() || undefined
    // A malformed address is the caller's mistake: answer 400 before the cache
    // and the DB, instead of throwing inside the fetch and reporting a 500.
    if (rawWallet && !isSupportedWallet(rawWallet)) {
      return NextResponse.json({ error: 'Invalid wallet address format' }, { status: 400 })
    }
    // Stellar accounts are base32 and case-sensitive; isSupportedWallet accepts
    // them in any case, so restore the canonical upper-case form here.
    const walletAddress = rawWallet && !rawWallet.startsWith('0x') ? rawWallet.toUpperCase() : rawWallet
    const periodParam = (searchParams.get('period') || '7d').toLowerCase()
    const allowed: Record<string, '1d' | '7d' | '30d' | 'all'> = { '1d': '1d', '7d': '7d', '30d': '30d', 'all': 'all' }
    const period = allowed[periodParam] || '7d'

    // Normalize cache key - works for both global and wallet-specific requests
    const cacheKey = `${walletAddress || 'global'}:${period}:${limit}:${offset}`;
    
    // 1. Check cache first (for everyone)
    const cached = aggregateCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      return NextResponse.json(cached.data, {
        headers: { 
          'Cache-Control': walletAddress ? 'private, s-maxage=30, stale-while-revalidate=60' : 'public, s-maxage=30, stale-while-revalidate=60',
          'X-Cache': 'HIT'
        }
      });
    }

    // 2. Coalesce concurrent requests
    if (pendingRequests.has(cacheKey)) {
      const coalescedData = await pendingRequests.get(cacheKey);
      return NextResponse.json(coalescedData, {
        headers: { 
          'Cache-Control': walletAddress ? 'private, s-maxage=30, stale-while-revalidate=60' : 'public, s-maxage=30, stale-while-revalidate=60',
          'X-Cache': 'COALESCED'
        }
      });
    }

    const fetchPromise = (async () => {
      // Base leaderboard data
      const [leaderboard, baseStats, globalAllTime] = await Promise.all([
        LeaderboardDB.getLeaderboardForPeriod(period, limit, offset),
        LeaderboardDB.getLeaderboardStats(),
        getGlobalAllTimeStatsCached(),
      ])

      // Headline KPI numbers (users / verified txs / points) reflect the all-time,
      // cross-network, cross-season grand total — not just the current ~500 S2
      // wallets. Per-action breakdowns (total_supplies, etc.) stay as-is.
      const stats = { ...baseStats, ...globalAllTime }

      const seasonId = getCurrentSeason()?.id || null
      // Optimization: For the list, don't do heavy badge recalculations
      const enriched = leaderboard.map((u: any) => {
        const badgesField: any = u?.badges
        let selectedBadgeId: string | null = null
        let selectedBorderColor: string | null = null
        let selectedNameEmoji: string | null = null
        
        if (badgesField) {
          try {
            const parsed = typeof badgesField === 'string' ? JSON.parse(badgesField) : badgesField
            const sel = parsed?.selected || {}
            selectedBadgeId = sel.badgeId || null
            selectedBorderColor = sel.borderColor || null
            selectedNameEmoji = sel.nameEmoji || null
          } catch {}
        }

        // Fast lookup for the selected badge meta
        const selectedBadgeMeta = selectedBadgeId ? getAllBadges().find(b => b.id === selectedBadgeId) : null
        const isAllowedForLeaderboard = selectedBadgeMeta?.allowLeaderboardDisplay !== false

        const listDisplayBadge = (selectedBadgeMeta && isAllowedForLeaderboard)
          ? { 
              id: selectedBadgeMeta.id, 
              name: selectedBadgeMeta.name, 
              icon: selectedBadgeMeta.icon, 
              tier: selectedBadgeMeta.tier, 
              borderColor: selectedBorderColor || null, 
              emoji: selectedNameEmoji || null 
            }
          : null

        return {
          ...u,
          displayBadge: listDisplayBadge,
          borderColor: selectedBorderColor || null,
          nameEmoji: selectedNameEmoji || null,
          borderStyle: selectedBorderColor ? 'pulse' : 'still',
          badgeStyle: 'still',
          suggestions: { emoji: null, borderColor: null },
        }
      })

      const globalRows = await LeaderboardDB.getAllTimePointsAndRanks(
        walletAddress 
          ? [...enriched.map((u: any) => u.wallet_address), walletAddress]
          : enriched.map((u: any) => u.wallet_address)
      )
      const globalMap = new Map(globalRows.map(r => [r.wallet_address.toLowerCase(), r]))
      const enrichedWithGlobals = enriched.map((u: any) => {
        const g = globalMap.get(u.wallet_address.toLowerCase())
        return {
          ...u,
          all_time_points: Number(g?.all_time_points ?? u.total_points ?? 0),
          global_rank: g?.global_rank ?? null,
        }
      })

      if (!walletAddress) {
        const result = {
          leaderboard: enrichedWithGlobals,
          stats,
          pagination: { limit, offset, hasMore: leaderboard.length === limit },
          user: null,
          transactions: [],
          profile: null,
          referral: null,
          dailyLogin: await LeaderboardDB.getDailyLoginStats(),
        }
        aggregateCache.set(cacheKey, { data: result, timestamp: Date.now() });
        return result;
      }

      const t = getTableNames()
      const walletKey = normalizeWalletAddress(walletAddress)
      const [user, userRank, periodStats, userTransactions, profileRow] = await Promise.all([
        LeaderboardDB.getUser(walletAddress),
        LeaderboardDB.getUserRank(walletAddress),
        LeaderboardDB.getUserPeriodStats(walletAddress, period),
        LeaderboardDB.getUserTransactions(walletAddress, 20),
        (async () => {
          const rows = await sql`
            SELECT wallet_address, username, badges, stats
            FROM ${sql(t.userProfiles)}
            WHERE wallet_address = ${walletAddress.toLowerCase()}
            LIMIT 1
          `
          return (rows as any[])[0] || null
        })(),
      ])

      const multiPositionCriteria = getUniqueMultiPositionCriteria()
      const precomputedStats = (profileRow as any)?.stats || (user as any)?.stats;
      
      let loginStreaks, txStats, txStreak, consolidatedStreaks,
          stablecoinCount, blueChipCount, stablecoinsSuppliedOrBorrowedCount,
          eligible, loginHistory,
          totalLoginDays, effectiveApy, multiPositionResults: number[];

      // Counts and code only: this route is public, and the list of invited
      // wallets is owner-only (/api/referral/stats, /api/user/me). A failed
      // read is reported as unknown (null), never as zero referrals.
      const referralPromise = resolveAccountIdentity(walletAddress)
        .then(identity => identity.walletAddresses, () => [] as string[])
        .then(owned => getReferralSummary(owned, walletKey, { includeReferredUsers: false }))
        .catch(err => {
          console.warn('[Aggregate] referral summary failed:', err?.message)
          return null
        })

      if (precomputedStats && Object.keys(precomputedStats).length > 0) {
        loginStreaks = { current: precomputedStats.loginStreak, max: precomputedStats.maxLoginStreak };
        txStats = {
          totalTransactions: precomputedStats.totalTransactions,
          transactionsByType: precomputedStats.transactionsByType,
          totalUsdVolume: precomputedStats.totalUsdVolume,
          crossChainTotalTransactions: precomputedStats.crossChainTotalTransactions,
          crossChainTotalUsdVolume: precomputedStats.crossChainTotalUsdVolume
        };
        txStreak = precomputedStats.transactionStreak;
        consolidatedStreaks = precomputedStats.positionMaintainedDaysByThreshold || {};
        if (!consolidatedStreaks[0]) {
          consolidatedStreaks[0] = precomputedStats.positionMaintainedDays || { supply: 0, borrow: 0, any: 0 };
        }
        stablecoinCount = precomputedStats.distinctStablecoinSuppliedCount;
        blueChipCount = precomputedStats.distinctBlueChipSuppliedCount;
        stablecoinsSuppliedOrBorrowedCount = precomputedStats.distinctStablecoinsSuppliedOrBorrowedCount;
        totalLoginDays = precomputedStats.totalLoginDays;
        effectiveApy = precomputedStats.effectiveApy;
        
        const [isEligible, dailyLogins] = await Promise.all([
          LeaderboardDB.isEligibleForDailyLogin(walletAddress),
          LeaderboardDB.getUserDailyLogins(walletAddress, 7)
        ]);

        eligible = isEligible;
        loginHistory = dailyLogins;
        
        // Use precomputed multi-position stats if available
        if (precomputedStats.multiPositionMaintained) {
          multiPositionResults = multiPositionCriteria.map(criteria => {
            const chainIdsKey = criteria.requiredChainIds ? `:${criteria.requiredChainIds.sort().join(',')}` : ''
            const key = `${criteria.positionType}:${criteria.minUsdValuePerPosition}:${criteria.positionCount}${chainIdsKey}`
            return precomputedStats.multiPositionMaintained[key] || 0
          });
        } else {
          multiPositionResults = await Promise.all(multiPositionCriteria.map(criteria =>
            LeaderboardDB.getMultiPositionMaintainedStreak(walletAddress, {
              positionType: criteria.positionType,
              positionCount: criteria.positionCount,
              minUsdValuePerPosition: criteria.minUsdValuePerPosition,
              lookbackDays: 180,
              requiredChainIds: criteria.requiredChainIds
            })
          ));
        }
      } else {
        const baseQueries = [
          LeaderboardDB.getUserLoginStreaks(walletAddress),
          LeaderboardDB.getUserTransactionStats(walletAddress),
          LeaderboardDB.getUserTransactionStreak(walletAddress),
          LeaderboardDB.getConsolidatedStreaks(walletAddress),
          LeaderboardDB.getDistinctSuppliedStablecoinCount(walletAddress),
          LeaderboardDB.getDistinctSuppliedBlueChipCount(walletAddress),
          LeaderboardDB.getDistinctStablecoinsSuppliedOrBorrowed(walletAddress),
          LeaderboardDB.isEligibleForDailyLogin(walletAddress),
          LeaderboardDB.getUserDailyLogins(walletAddress, 7),
          LeaderboardDB.getTotalLoginDays(walletAddress),
          LeaderboardDB.getUserEffectiveApy(walletAddress),
        ]

        const multiPositionQueries = multiPositionCriteria.map(criteria =>
          LeaderboardDB.getMultiPositionMaintainedStreak(walletAddress, {
            positionType: criteria.positionType,
            positionCount: criteria.positionCount,
            minUsdValuePerPosition: criteria.minUsdValuePerPosition,
            lookbackDays: 180,
            requiredChainIds: criteria.requiredChainIds
          })
        )

        const allResults = await Promise.all([...baseQueries, ...multiPositionQueries])
        const baseResults = allResults.slice(0, baseQueries.length)
        multiPositionResults = allResults.slice(baseQueries.length) as number[]

        [
          loginStreaks, txStats, txStreak, consolidatedStreaks,
          stablecoinCount, blueChipCount, stablecoinsSuppliedOrBorrowedCount,
          eligible, loginHistory,
          totalLoginDays, effectiveApy
        ] = baseResults;
      }

      const maintained0 = consolidatedStreaks[0] || { supply: 0, borrow: 0, any: 0 }
      const maintained100 = consolidatedStreaks[100] || { supply: 0, borrow: 0, any: 0 }
      const maintained250 = consolidatedStreaks[250] || { supply: 0, borrow: 0, any: 0 }
      const maintained2500 = consolidatedStreaks[2500] || { supply: 0, borrow: 0, any: 0 }
      const maintained10000 = consolidatedStreaks[10000] || { supply: 0, borrow: 0, any: 0 }
      const maintained100000 = consolidatedStreaks[100000] || { supply: 0, borrow: 0, any: 0 }
      const maintained500000 = consolidatedStreaks[500000] || { supply: 0, borrow: 0, any: 0 }

      const multiPositionMaintained: Record<string, number> = {}
      multiPositionCriteria.forEach((criteria, index) => {
        const chainIdsKey = criteria.requiredChainIds ? `:${criteria.requiredChainIds.sort().join(',')}` : ''
        const key = `${criteria.positionType}:${criteria.minUsdValuePerPosition}:${criteria.positionCount}${chainIdsKey}`
        multiPositionMaintained[key] = multiPositionResults[index] || 0
      })

      const loginStreak = loginStreaks.current
      const maxLoginStreak = loginStreaks.max
      
      const globalRow = globalMap.get(walletAddress.toLowerCase()) || { all_time_points: Number((user as any)?.total_points || 0), global_rank: userRank }

      const userXp = Number((user as any)?.total_points || 0)
      const parsedBadges = (() => {
        try {
          const raw = (profileRow as any)?.badges
          return typeof raw === 'string' ? JSON.parse(raw) : raw
        } catch { return null }
      })()
      const selections = (() => {
        const sel = parsedBadges?.selected || {}
        return { badgeId: sel.badgeId || null, borderColor: sel.borderColor || null, nameEmoji: sel.nameEmoji || null }
      })()
      
      const storedBadgeIds: string[] = Array.isArray(parsedBadges?.earned) ? parsedBadges.earned : []
      const storedBadges = getBadgesByIds(storedBadgeIds)
      
      const storedBadgesByTier: Partial<Record<'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond', number>> = {}
      for (const badge of storedBadges) {
        const tier = badge.tier as 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond'
        storedBadgesByTier[tier] = (storedBadgesByTier[tier] || 0) + 1
      }
      
      const newlyEarned = getEarnedBadges({
        userXp, seasonId: seasonId, loginStreak, maxLoginStreak, totalLoginDays,
        transactionStreak: txStreak, totalTransactions: txStats.totalTransactions,
        transactionsByType: txStats.transactionsByType,
        crossChainTotalTransactions: (txStats as any).crossChainTotalTransactions,
        crossChainTransactionsByType: (txStats as any).crossChainTransactionsByType,
        totalUsdVolume: txStats.totalUsdVolume, crossChainTotalUsdVolume: (txStats as any).crossChainTotalUsdVolume,
        supplyPositionDays: maintained0.supply,
        positionMaintainedDays: { supply: maintained0.supply, borrow: maintained0.borrow, any: maintained0.any },
        positionMaintainedDaysByThreshold: { '100': { supply: maintained100.supply, borrow: maintained100.borrow, any: maintained100.any }, '250': { supply: maintained250.supply, borrow: maintained250.borrow, any: maintained250.any }, '2500': { supply: maintained2500.supply, borrow: maintained2500.borrow, any: maintained2500.any }, '10000': { supply: maintained10000.supply, borrow: maintained10000.borrow, any: maintained10000.any }, '100000': { supply: maintained100000.supply, borrow: maintained100000.borrow, any: maintained100000.any }, '500000': { supply: maintained500000.supply, borrow: maintained500000.borrow, any: maintained500000.any } },
        distinctStablecoinSuppliedCount: stablecoinCount, distinctBlueChipSuppliedCount: blueChipCount,
        distinctStablecoinsSuppliedOrBorrowedCount: stablecoinsSuppliedOrBorrowedCount,
        effectiveApy, multiPositionMaintained, completedAchievementsCount: storedBadgeIds.length,
        completedAchievementsByTier: storedBadgesByTier,
      }, seasonId, { excludeIds: storedBadgeIds })

      const mergedEarned = [...storedBadges, ...newlyEarned].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))

      // Trigger point awards if any (don't await to speed up response)
      if (newlyEarned.length > 0) {
        (async () => {
          try {
            for (const b of newlyEarned) {
              if (b.pointsReward && b.pointsReward > 0) {
                await LeaderboardDB.awardBadgePoints(walletAddress, b.pointsReward, `BADGE:${b.id}`)
              }
            }
            await LeaderboardDB.upsertUserEarnedBadges(walletAddress, newlyEarned.map(b => b.id))
          } catch (e) {
            console.error(`[Aggregate] Background badge award failed for ${walletAddress}:`, e)
          }
        })()
      }

      const allEarnedIds = mergedEarned.map(b => b.id)
      const nextBadge = getNextBadge({
        userXp, seasonId: seasonId, loginStreak, maxLoginStreak, totalLoginDays,
        totalTransactions: txStats.totalTransactions, transactionsByType: txStats.transactionsByType,
        crossChainTotalTransactions: (txStats as any).crossChainTotalTransactions,
        crossChainTransactionsByType: (txStats as any).crossChainTransactionsByType,
        totalUsdVolume: txStats.totalUsdVolume, crossChainTotalUsdVolume: (txStats as any).crossChainTotalUsdVolume,
        supplyPositionDays: maintained0.supply,
        positionMaintainedDays: { supply: maintained0.supply, borrow: maintained0.borrow, any: maintained0.any },
        positionMaintainedDaysByThreshold: { '100': { supply: maintained100.supply, borrow: maintained100.borrow, any: maintained100.any }, '250': { supply: maintained250.supply, borrow: maintained250.borrow, any: maintained250.any }, '2500': { supply: maintained2500.supply, borrow: maintained2500.borrow, any: maintained2500.any }, '10000': { supply: maintained10000.supply, borrow: maintained10000.borrow, any: maintained10000.any }, '100000': { supply: maintained100000.supply, borrow: maintained100000.borrow, any: maintained100000.any }, '500000': { supply: maintained500000.supply, borrow: maintained500000.borrow, any: maintained500000.any } },
        distinctStablecoinSuppliedCount: stablecoinCount, distinctBlueChipSuppliedCount: blueChipCount,
        distinctStablecoinsSuppliedOrBorrowedCount: stablecoinsSuppliedOrBorrowedCount,
        effectiveApy, multiPositionMaintained, completedAchievementsCount: allEarnedIds.length,
      }, seasonId, allEarnedIds)

      const afterNextBadgeHint = getAfterNextBadge({
        userXp, seasonId: seasonId, loginStreak, maxLoginStreak, totalLoginDays,
        totalTransactions: txStats.totalTransactions, transactionsByType: txStats.transactionsByType,
        crossChainTotalTransactions: (txStats as any).crossChainTotalTransactions,
        crossChainTransactionsByType: (txStats as any).crossChainTransactionsByType,
        totalUsdVolume: txStats.totalUsdVolume, crossChainTotalUsdVolume: (txStats as any).crossChainTotalUsdVolume,
        supplyPositionDays: maintained0.supply,
        positionMaintainedDays: { supply: maintained0.supply, borrow: maintained0.borrow, any: maintained0.any },
        positionMaintainedDaysByThreshold: { '100': { supply: maintained100.supply, borrow: maintained100.borrow, any: maintained100.any }, '250': { supply: maintained250.supply, borrow: maintained250.borrow, any: maintained250.any }, '2500': { supply: maintained2500.supply, borrow: maintained2500.borrow, any: maintained2500.any }, '10000': { supply: maintained10000.supply, borrow: maintained10000.borrow, any: maintained10000.any }, '100000': { supply: maintained100000.supply, borrow: maintained100000.borrow, any: maintained100000.any }, '500000': { supply: maintained500000.supply, borrow: maintained500000.borrow, any: maintained500000.any } },
        distinctStablecoinSuppliedCount: stablecoinCount, distinctBlueChipSuppliedCount: blueChipCount,
        distinctStablecoinsSuppliedOrBorrowedCount: stablecoinsSuppliedOrBorrowedCount,
        effectiveApy, multiPositionMaintained, completedAchievementsCount: allEarnedIds.length,
      }, seasonId, allEarnedIds)

      const derivedDisplay = deriveDisplayFromProfile({
        userXp, seasonId: seasonId, selectedBadgeId: selections.badgeId,
        selectedBorderColor: selections.borderColor, selectedNameEmoji: selections.nameEmoji,
        loginStreak, maxLoginStreak, totalLoginDays, transactionStreak: txStreak,
        totalTransactions: txStats.totalTransactions, transactionsByType: txStats.transactionsByType,
        crossChainTotalTransactions: (txStats as any).crossChainTotalTransactions,
        crossChainTransactionsByType: (txStats as any).crossChainTransactionsByType,
        totalUsdVolume: txStats.totalUsdVolume,
        supplyPositionDays: maintained0.supply,
        positionMaintainedDays: { supply: maintained0.supply, borrow: maintained0.borrow, any: maintained0.any },
        positionMaintainedDaysByThreshold: { '100': { supply: maintained100.supply, borrow: maintained100.borrow, any: maintained100.any }, '250': { supply: maintained250.supply, borrow: maintained250.borrow, any: maintained250.any }, '2500': { supply: maintained2500.supply, borrow: maintained2500.borrow, any: maintained2500.any }, '10000': { supply: maintained10000.supply, borrow: maintained10000.borrow, any: maintained10000.any }, '100000': { supply: maintained100000.supply, borrow: maintained100000.borrow, any: maintained100000.any }, '500000': { supply: maintained500000.supply, borrow: maintained500000.borrow, any: maintained500000.any } },
        distinctStablecoinSuppliedCount: stablecoinCount, distinctBlueChipSuppliedCount: blueChipCount,
        storedBadgeIds: allEarnedIds,
      })

      const referral = await referralPromise

      // ── Account-scoped read layer (PR 2 dual-read) ──
      // Computes the same shape under account identity. In 'dual-read' mode we
      // log divergences and still return the legacy per-wallet values. In 'on'
      // mode we swap the affected fields. In 'off' mode this block is skipped
      // entirely — zero overhead for production until cutover.
      let effectiveLeaderboard = enrichedWithGlobals
      let effectiveUser = user ? { ...user, rank: userRank, period_points: periodStats.points, period_rank: periodStats.rank, all_time_points: Number(globalRow.all_time_points || (user as any)?.total_points || 0), global_rank: globalRow.global_rank ?? userRank } : null
      let effectiveTransactions = userTransactions || []
      const accountScopedFlag = LEADERBOARD_ACCOUNT_SCOPED

      if (accountScopedFlag !== 'off') {
        try {
          const accountLeaderboardRows = await AccountLeaderboardDB.getAccountLeaderboardForPeriod(period, limit, offset)

          let identity: Awaited<ReturnType<typeof resolveAccountIdentity>> | null = null
          let accountUserRow: Awaited<ReturnType<typeof AccountLeaderboardDB.getAccount>> | null = null
          let accountPeriodPoints = 0
          let accountTransactions: any[] = []
          let accountAllTimeMap: Map<string, { all_time_points: number; global_rank: number }> = new Map()

          if (walletAddress) {
            identity = await resolveAccountIdentity(walletAddress)
            const accountKeys = [...accountLeaderboardRows.map((r: any) => r.account_key), identity.accountKey]
            const [acctRow, periodStatsAcct, txs, allTimeRows] = await Promise.all([
              AccountLeaderboardDB.getAccount(identity.accountKey),
              AccountLeaderboardDB.getAccountPeriodStats(identity.walletAddresses, period),
              AccountLeaderboardDB.getAccountTransactions(identity.walletAddresses, 20),
              AccountLeaderboardDB.getAccountAllTimePointsAndRanks(Array.from(new Set(accountKeys))),
            ])
            accountUserRow = acctRow
            accountPeriodPoints = periodStatsAcct.points
            accountTransactions = txs
            accountAllTimeMap = new Map(allTimeRows.map((r: any) => [r.account_key, r]))
          } else {
            const keys = accountLeaderboardRows.map((r: any) => r.account_key)
            const allTimeRows = keys.length ? await AccountLeaderboardDB.getAccountAllTimePointsAndRanks(keys) : []
            accountAllTimeMap = new Map(allTimeRows.map((r: any) => [r.account_key, r]))
          }

          // Parity divergence log (dual-read only, 10% sample)
          if (accountScopedFlag === 'dual-read' && walletAddress && accountUserRow && user) {
            const oldPts = Number((user as any)?.total_points || 0)
            const newPts = Number((accountUserRow as any)?.total_points || 0)
            const oldRank = userRank ?? null
            const newRank = (accountUserRow as any)?.global_rank ?? null
            if (oldPts !== newPts || oldRank !== newRank) {
              if (Math.random() < 0.1) {
                console.warn('[leaderboard_account_scope_divergence]', JSON.stringify({
                  walletAddress: walletAddress.toLowerCase(),
                  accountKey: (accountUserRow as any)?.account_key,
                  oldPoints: oldPts,
                  newPoints: newPts,
                  oldRank,
                  newRank,
                  oldPeriodPoints: periodStats.points,
                  newPeriodPoints: accountPeriodPoints,
                  linkedWalletCount: (accountUserRow as any)?.linked_wallet_count ?? 1,
                  period,
                }))
              }
            }
          }

          if (accountScopedFlag === 'on') {
            // Enrich account leaderboard rows to match the legacy shape FE consumes
            effectiveLeaderboard = accountLeaderboardRows.map((row: any) => {
              const badgesField = row?.badges
              let selectedBadgeId: string | null = null
              let selectedBorderColor: string | null = null
              let selectedNameEmoji: string | null = null
              if (badgesField) {
                try {
                  const parsed = typeof badgesField === 'string' ? JSON.parse(badgesField) : badgesField
                  const sel = parsed?.selected || {}
                  selectedBadgeId = sel.badgeId || null
                  selectedBorderColor = sel.borderColor || null
                  selectedNameEmoji = sel.nameEmoji || null
                } catch {}
              }
              const selectedBadgeMeta = selectedBadgeId ? getAllBadges().find(b => b.id === selectedBadgeId) : null
              const isAllowedForLeaderboard = selectedBadgeMeta?.allowLeaderboardDisplay !== false
              const listDisplayBadge = (selectedBadgeMeta && isAllowedForLeaderboard)
                ? { id: selectedBadgeMeta.id, name: selectedBadgeMeta.name, icon: selectedBadgeMeta.icon, tier: selectedBadgeMeta.tier, borderColor: selectedBorderColor || null, emoji: selectedNameEmoji || null }
                : null
              const globalForRow = accountAllTimeMap.get(row.account_key)
              return {
                ...row,
                wallet_address: row.display_wallet, // FE keys on wallet_address; display wallet is stable per account
                total_points: Number(row.total_points || 0),
                all_time_points: Number(globalForRow?.all_time_points ?? row.total_points ?? 0),
                global_rank: globalForRow?.global_rank ?? row.global_rank ?? null,
                displayBadge: listDisplayBadge,
                borderColor: selectedBorderColor || null,
                nameEmoji: selectedNameEmoji || null,
                borderStyle: selectedBorderColor ? 'pulse' : 'still',
                badgeStyle: 'still',
                suggestions: { emoji: null, borderColor: null },
              }
            })

            if (accountUserRow && user) {
              const acctGlobal = accountAllTimeMap.get((accountUserRow as any).account_key)
              effectiveUser = {
                ...user,
                wallet_address: (accountUserRow as any).display_wallet || (user as any).wallet_address,
                account_key: (accountUserRow as any).account_key,
                linked_wallet_count: (accountUserRow as any).linked_wallet_count ?? 1,
                wallet_addresses: (accountUserRow as any).wallet_addresses || [],
                total_points: Number((accountUserRow as any).total_points || 0),
                rank: (accountUserRow as any).global_rank ?? null,
                period_points: accountPeriodPoints,
                period_rank: null,
                all_time_points: Number(acctGlobal?.all_time_points ?? (accountUserRow as any).total_points ?? 0),
                global_rank: acctGlobal?.global_rank ?? (accountUserRow as any).global_rank ?? null,
              } as any
            }

            effectiveTransactions = accountTransactions
          }
        } catch (err) {
          // Defensive: never let the account-scoped path break the response.
          console.warn('[Aggregate] account-scoped path failed, falling back to per-wallet:', (err as any)?.message)
        }
      }

      const resultData = {
        leaderboard: effectiveLeaderboard,
        stats,
        pagination: { limit, offset, hasMore: leaderboard.length === limit },
        user: effectiveUser,
        transactions: effectiveTransactions,
        profile: user ? {
          wallet_address: (profileRow as any)?.wallet_address || walletAddress.toLowerCase(),
          username: (profileRow as any)?.username || null,
          xp: userXp,
          selections,
          display: derivedDisplay,
          earnedBadges: mergedEarned.map(b => ({ id: b.id, name: b.name, icon: b.icon, unlockEmoji: b.unlockEmoji || null, unlockBorderColor: b.unlockBorderColor || null, tier: b.tier, allowLeaderboardDisplay: b.allowLeaderboardDisplay !== false })),
          unlocked: {
            emojis: Array.from(new Set(mergedEarned.map(b => b.unlockEmoji).filter(Boolean) as string[])),
            borderColors: Array.from(new Set(mergedEarned.map(b => b.unlockBorderColor).filter(Boolean) as string[])),
          },
          nextBadge,
          afterNextBadgeHint,
        } : null,
        referral,
        dailyLogin: { eligible, loginHistory, loginStreak, dailyPoints: getDailyLoginPoints() },
      }

      aggregateCache.set(cacheKey, { data: resultData, timestamp: Date.now() });
      return resultData;
    })();

    pendingRequests.set(cacheKey, fetchPromise);

    try {
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Request Timeout')), 25000)
      );
      const resultData = await Promise.race([fetchPromise, timeoutPromise]);
      return NextResponse.json(resultData, {
        headers: { 
          'Cache-Control': walletAddress ? 'private, s-maxage=30, stale-while-revalidate=60' : 'public, s-maxage=30, stale-while-revalidate=60',
          'X-Cache': 'MISS'
        }
      });
    } finally {
      pendingRequests.delete(cacheKey);
    }


  } catch (error) {
    console.error('Aggregate leaderboard API error:', error)
    return NextResponse.json({ error: 'Failed to fetch aggregate leaderboard data' }, { status: 500 })
  }
}

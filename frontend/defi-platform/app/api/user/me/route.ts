import { NextRequest, NextResponse } from 'next/server'
import { authenticateUserScope, ensureScopeOwnsAddress } from '@/lib/auth/userScope'
import { LeaderboardDB, sql, normalizeWalletAddress, profileKey } from '@/lib/database'
import { getTableNames } from '@/lib/tableResolver'
import { deriveDisplayFromProfile, getEarnedBadges, getNextBadge, getAfterNextBadge, getUniqueMultiPositionCriteria, getBadgesByIds, getCurrentSeason, SEASONS } from '@/lib/achievements'
import { getDailyLoginPoints } from '@/lib/rewards/policy'
import { getReferralSummary } from '@/lib/referral/summary'

// Coalesce requests for the same user to prevent thundering herd on user stats
const pendingUserRequests = new Map<string, Promise<any>>();

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const walletAddress = searchParams.get('wallet')
    const periodParam = (searchParams.get('period') || 'all').toLowerCase()
    const allowed: Record<string, '1d' | '7d' | '30d' | 'all'> = { '1d': '1d', '7d': '7d', '30d': '30d', 'all': 'all' }
    const period = allowed[periodParam] || 'all'

    // EVM 0x… or Stellar G… — Stellar transactions earn points through
    // /api/leaderboard/verify-stellar and land on the G-address row in
    // leaderboard_users, so this route has to be able to read them back.
    // Ownership is enforced below either way (userScope covers both chains).
    const isEvm = !!walletAddress?.match(/^0x[a-fA-F0-9]{40}$/)
    const isStellar = !!walletAddress?.toUpperCase().match(/^G[A-Z2-7]{55}$/)
    if (!walletAddress || (!isEvm && !isStellar)) {
      return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 })
    }

    // Private account data (referral graph, login history) — owner only.
    const scope = await authenticateUserScope(request)
    if (!scope) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!(await ensureScopeOwnsAddress(scope, walletAddress))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Canonical key, so `G…` and `g…` don't split the coalescing map in two.
    const cacheKey = `${normalizeWalletAddress(walletAddress)}:${period}`;

    // Thundering herd protection: coalesce identical requests
    if (pendingUserRequests.has(cacheKey)) {
      const coalescedData = await pendingUserRequests.get(cacheKey);
      return NextResponse.json(coalescedData, {
        headers: {
          'Cache-Control': 'private, no-cache, no-store, must-revalidate',
          'X-Cache': 'COALESCED'
        }
      });
    }

    const fetchPromise = (async () => {
      const t = getTableNames()
      // 1. Fetch ALL user-specific data in parallel
      const [user, userRank, periodStats, userTransactions, profileRow] = await Promise.all([
        LeaderboardDB.getUser(walletAddress),
        LeaderboardDB.getUserRank(walletAddress), // Fast via Materialized View
        LeaderboardDB.getUserPeriodStats(walletAddress, period),
        LeaderboardDB.getUserTransactions(walletAddress, 20),
        (async () => {
           const rows = await sql`
             SELECT wallet_address, username, badges, stats
             FROM ${sql(t.userProfiles)}
             WHERE wallet_address = ${profileKey(walletAddress)}
             LIMIT 1
           `
           return (rows as any[])[0] || null
        })(),
      ])

      const multiPositionCriteria = getUniqueMultiPositionCriteria()
      const precomputedStats = (profileRow as any)?.stats || (user as any)?.stats;
      const currentSeason = getCurrentSeason()
      const seasonId = currentSeason?.id || null
      // Season start date used to scope badge criteria to the current season only
      const seasonStart = currentSeason?.startAt || null
        
      let loginStreaks, txStats, txStreak, consolidatedStreaks,
          stablecoinCount, blueChipCount, stablecoinsSuppliedOrBorrowedCount,
          eligible, loginHistory,
          totalLoginDays, effectiveApy, multiPositionResults: number[];

      // Across every address the session owns (the code may sit on the EVM
      // wallet while the user browses with the Stellar one). A failed read is
      // reported as unknown (null), never as zero referrals.
      const referralPromise = getReferralSummary(
        [...scope.evmAddresses, ...scope.stellarAddresses],
        normalizeWalletAddress(walletAddress),
        { includeReferredUsers: true }
      ).catch(err => {
        console.warn('[user/me] referral summary failed:', err?.message)
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
        
        const [isEligible, dailyLogins, seasonTxStats, seasonLoginStreaks, seasonLoginDays] = await Promise.all([
          LeaderboardDB.isEligibleForDailyLogin(walletAddress),
          LeaderboardDB.getUserDailyLogins(walletAddress, 7),
          // Always fetch season-scoped stats live — precomputed stats are all-time and
          // would incorrectly carry S1 activity into S2 badge evaluation.
          LeaderboardDB.getUserTransactionStats(walletAddress, seasonStart ?? undefined),
          LeaderboardDB.getUserLoginStreaks(walletAddress, seasonStart ?? undefined),
          LeaderboardDB.getTotalLoginDays(walletAddress, seasonStart ?? undefined),
        ]);

        eligible = isEligible;
        loginHistory = dailyLogins;
        // Override precomputed all-time stats with season-scoped live values
        txStats = seasonTxStats;
        loginStreaks = seasonLoginStreaks;
        totalLoginDays = seasonLoginDays;
        
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
          LeaderboardDB.getUserLoginStreaks(walletAddress, seasonStart ?? undefined),
          LeaderboardDB.getUserTransactionStats(walletAddress, seasonStart ?? undefined),
          LeaderboardDB.getUserTransactionStreak(walletAddress),
          LeaderboardDB.getConsolidatedStreaks(walletAddress),
          LeaderboardDB.getDistinctSuppliedStablecoinCount(walletAddress),
          LeaderboardDB.getDistinctSuppliedBlueChipCount(walletAddress),
          LeaderboardDB.getDistinctStablecoinsSuppliedOrBorrowed(walletAddress),
          LeaderboardDB.isEligibleForDailyLogin(walletAddress),
          LeaderboardDB.getUserDailyLogins(walletAddress, 7),
          LeaderboardDB.getTotalLoginDays(walletAddress, seasonStart ?? undefined),
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

        ;[
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
      
      // Calculate full rank and points
      const userXp = Number((user as any)?.total_points || 0)
      
      // Parse badges
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
            console.error(`[UserStats] Background badge award failed for ${walletAddress}:`, e)
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
        distinctStablecoinsSuppliedOrBorrowedCount: stablecoinsSuppliedOrBorrowedCount,
        storedBadgeIds: allEarnedIds,
      })

      const referral = await referralPromise

      // Determine all_time_points using rank calculation fallback if not explicitly returned
      const allTimePoints = Number((user as any)?.total_points || 0) + Number((profileRow as any)?.xp || 0)
      
      const resultData = {
        user: user ? { ...user, rank: userRank, period_points: periodStats.points, period_rank: periodStats.rank, all_time_points: allTimePoints, global_rank: userRank } : null,
        transactions: userTransactions || [],
        profile: user ? {
          wallet_address: (profileRow as any)?.wallet_address || normalizeWalletAddress(walletAddress),
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

      return resultData;
    })();

    pendingUserRequests.set(cacheKey, fetchPromise);

    try {
      const result = await fetchPromise;
      return NextResponse.json(result, {
        headers: {
          'Cache-Control': 'private, no-cache, no-store, must-revalidate',
        }
      });
    } finally {
      pendingUserRequests.delete(cacheKey);
    }

  } catch (error) {
    console.error('User stats error:', error)
    return NextResponse.json({ error: 'Failed to fetch user data' }, { status: 500 })
  }
}


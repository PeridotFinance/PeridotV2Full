import { NextRequest, NextResponse } from 'next/server'
import { LeaderboardDB, normalizeWalletAddress, isSupportedWallet } from '@/lib/database'
import { getEarnedBadges, getCurrentSeason } from '@/lib/achievements'
import { getDailyLoginPoints } from '@/lib/rewards/policy'
import { LEADERBOARD_ACCOUNT_SCOPED } from '@/config/featureFlags'
import { invalidateAccountIdentity } from '@/lib/accountIdentity'
import { authenticateUserScope, ensureScopeOwnsAddress } from '@/lib/auth/userScope'

// Cache and request coalescing moved to top level for access by both GET and POST
const dailyLoginCache = new Map<string, { data: any, timestamp: number }>();
const pendingGetRequests = new Map<string, Promise<any>>();
const DAILY_GET_CACHE_TTL = 30000; // 30 seconds

// Rate limiting for POST endpoint
const rateLimitCache = new Map<string, number>();
const RATE_LIMIT_WINDOW = 60000; // 1 minute

// POST - Claim daily login bonus
export async function POST(request: NextRequest) {
  try {
    const { walletAddress } = await request.json()
    
    // Basic validation
    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Wallet address is required' },
        { status: 400 }
      )
    }

    // Only the owner may claim their own daily bonus. Without this, anyone could
    // pre-claim (grief) another wallet's bonus by spraying addresses.
    const scope = await authenticateUserScope(request)
    if (!scope) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!(await ensureScopeOwnsAddress(scope, walletAddress))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Rate limiting: 1 per minute
    const now = Date.now()
    const lastRequest = rateLimitCache.get(normalizeWalletAddress(walletAddress))
    if (lastRequest && now - lastRequest < RATE_LIMIT_WINDOW) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again in a minute.' },
        { status: 429 }
      )
    }
    rateLimitCache.set(normalizeWalletAddress(walletAddress), now)

    // EVM 0x… or Stellar G… — a Stellar-only user checks in for the same
    // bonus; the streak rows are keyed chain-natively (see normalizeWalletAddress).
    if (!isSupportedWallet(walletAddress)) {
      return NextResponse.json(
        { error: 'Invalid wallet address format' },
        { status: 400 }
      )
    }

    // Check if user is eligible for daily login bonus
    const isEligible = await LeaderboardDB.isEligibleForDailyLogin(walletAddress)
    
    if (!isEligible) {
      return NextResponse.json(
        { 
          awarded: false, 
          points: 0, 
          message: 'Already claimed today\'s login bonus',
          alreadyClaimed: true
        },
        { status: 200 }
      )
    }

    // Award the daily login bonus (pass current season so the DB increments the season counter)
    const currentSeason = getCurrentSeason()
    const result = await LeaderboardDB.awardDailyLoginBonus(walletAddress, currentSeason?.id)

    if (result.awarded) {
      // Invalidate the cache for this user immediately after successful award
      const wallet = normalizeWalletAddress(walletAddress)
      dailyLoginCache.delete(wallet)
      pendingGetRequests.delete(wallet)

      // Account-scoped read layer: fire-and-forget MV refresh + identity cache bust.
      if (LEADERBOARD_ACCOUNT_SCOPED !== 'off') {
        void LeaderboardDB.refreshLeaderboardAccountsMV().catch((err) => {
          console.warn('[DailyLogin] MV refresh trigger failed:', (err as any)?.message)
        })
        invalidateAccountIdentity(walletAddress)
      }

      // Use MINIMAL data from the award result for immediate UI response
      const loginStreak = result.loginStreak || 0;

      // OPTIMIZATION: Move heavy badge evaluation and profile syncing to background
      // This reduces response time from ~4s to ~200ms
      ;(async () => {
        try {
          const [updatedUser, streaks] = await Promise.all([
            LeaderboardDB.getUser(walletAddress),
            LeaderboardDB.getConsolidatedStreaks(walletAddress),
          ])

          // Season-scoped stats: use S2 transaction counts + S2 login days for badge evaluation
          const seasonStats = currentSeason
            ? await LeaderboardDB.getSeasonTransactionStats(walletAddress, currentSeason.startAt)
            : await LeaderboardDB.getUserTransactionStats(walletAddress)

          // Season-scoped login days (already incremented above by awardDailyLoginBonus)
          const seasonLoginDays = currentSeason
            ? await LeaderboardDB.getSeasonLoginDays(walletAddress, currentSeason.id)
            : 0

          // Get stored badge IDs first (to skip re-evaluating already earned badges)
          let storedBadgeIds: string[] = []
          try {
            const prevBadges = (updatedUser as any)?.badges
            const parsed = typeof prevBadges === 'string' ? JSON.parse(prevBadges) : prevBadges
            if (parsed && Array.isArray(parsed.earned)) storedBadgeIds = parsed.earned
          } catch {}

          const maintained = streaks[0] || { supply: 0, borrow: 0, any: 0 }
          const maintainedByThreshold = {
            '100':    streaks[100]    || { supply: 0, borrow: 0, any: 0 },
            '250':    streaks[250]    || { supply: 0, borrow: 0, any: 0 },
            '2500':   streaks[2500]   || { supply: 0, borrow: 0, any: 0 },
            '10000':  streaks[10000]  || { supply: 0, borrow: 0, any: 0 },
            '100000': streaks[100000] || { supply: 0, borrow: 0, any: 0 },
            '500000': streaks[500000] || { supply: 0, borrow: 0, any: 0 },
          }

          const newlyEarned = getEarnedBadges({
            userXp: +((updatedUser as any)?.total_points || 0),
            loginStreak,
            maxLoginStreak: result.maxLoginStreak || loginStreak,
            // Pass season-scoped login days so S2 login-day badges evaluate against S2 days only
            totalLoginDays: seasonLoginDays,
            totalTransactions: seasonStats.totalTransactions,
            transactionsByType: seasonStats.transactionsByType,
            totalUsdVolume: seasonStats.totalUsdVolume,
            supplyPositionDays: maintained.supply,
            positionMaintainedDays: { supply: maintained.supply, borrow: maintained.borrow, any: maintained.any },
            positionMaintainedDaysByThreshold: maintainedByThreshold,
            completedAchievementsCount: storedBadgeIds.length,
            seasonId: currentSeason?.id,
          }, currentSeason?.id, { excludeIds: storedBadgeIds })
          
          if (newlyEarned.length > 0) {
            console.log(`[Daily Login] Background newly earned badges for ${walletAddress}:`, newlyEarned.map(b => b.id))
            for (const b of newlyEarned) {
              if (b.pointsReward && b.pointsReward > 0) {
                await LeaderboardDB.awardBadgePoints(walletAddress, b.pointsReward, `BADGE:${b.id}`)
              }
            }
            await LeaderboardDB.upsertUserEarnedBadges(walletAddress, newlyEarned.map(b => b.id))
          }
        } catch (error) {
          console.error(`[Daily Login] Background processing failed for ${walletAddress}:`, error)
        }
      })()

      // Return immediately with the minimal data needed for the popup
      return NextResponse.json({
        success: true,
        awarded: true,
        points: result.points,
        message: result.message,
        loginStreak,
        // Simplified isNewUser check: if points awarded match total points or user is new
        isNewUser: result.message.toLowerCase().includes('welcome') || result.points >= 50 
      })
    } else {
      return NextResponse.json(
        { 
          awarded: false, 
          points: 0, 
          message: result.message,
          alreadyClaimed: true
        },
        { status: 200 }
      )
    }

  } catch (error) {
    console.error('Daily login bonus error:', error)
    
    return NextResponse.json(
      { error: 'Failed to process daily login bonus. Please try again.' },
      { status: 500 }
    )
  }
}

// GET - Check eligibility and get login stats
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const walletAddress = searchParams.get('wallet')
    
    if (!walletAddress) {
      // Return general daily login stats
      const stats = await LeaderboardDB.getDailyLoginStats()
      return NextResponse.json({
        stats
      })
    }

    // EVM 0x… or Stellar G… — a Stellar-only user checks in for the same
    // bonus; the streak rows are keyed chain-natively (see normalizeWalletAddress).
    if (!isSupportedWallet(walletAddress)) {
      return NextResponse.json(
        { error: 'Invalid wallet address format' },
        { status: 400 }
      )
    }

    const wallet = normalizeWalletAddress(walletAddress)

    // 1. Check cache
    const cached = dailyLoginCache.get(wallet)
    if (cached && (Date.now() - cached.timestamp < DAILY_GET_CACHE_TTL)) {
      return NextResponse.json(cached.data, {
        headers: { 
          'X-Cache': 'HIT',
          'Cache-Control': 'private, s-maxage=30, stale-while-revalidate=60'
        }
      })
    }

    // 2. Coalesce
    if (pendingGetRequests.has(wallet)) {
      const coalescedData = await pendingGetRequests.get(wallet)
      return NextResponse.json(coalescedData, {
        headers: { 
          'X-Cache': 'COALESCED',
          'Cache-Control': 'private, s-maxage=30, stale-while-revalidate=60'
        }
      })
    }

    const fetchPromise = (async () => {
      // Get user-specific login data
      const [isEligible, loginHistory, loginStreaks] = await Promise.all([
        LeaderboardDB.isEligibleForDailyLogin(walletAddress),
        LeaderboardDB.getUserDailyLogins(walletAddress, 7), // Last 7 days
        LeaderboardDB.getUserLoginStreaks(walletAddress)
      ])
      
      const response = {
        eligible: isEligible,
        loginHistory,
        loginStreak: loginStreaks.current,
        dailyPoints: getDailyLoginPoints()
      }
      
      dailyLoginCache.set(wallet, { data: response, timestamp: Date.now() })
      return response
    })()

    pendingGetRequests.set(wallet, fetchPromise)

    try {
      const result = await fetchPromise
      return NextResponse.json(result, {
        headers: { 
          'X-Cache': 'MISS',
          'Cache-Control': 'private, s-maxage=30, stale-while-revalidate=60'
        }
      })
    } finally {
      pendingGetRequests.delete(wallet)
    }

  } catch (error) {
    console.error('Daily login check error:', error)
    
    return NextResponse.json(
      { error: 'Failed to check daily login status. Please try again.' },
      { status: 500 }
    )
  }
} 
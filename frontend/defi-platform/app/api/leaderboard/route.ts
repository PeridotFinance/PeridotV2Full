import { NextRequest, NextResponse } from 'next/server'
import { LeaderboardDB } from '@/lib/database'
import { deriveDisplayFromProfile, getCurrentSeason, getAllBadges } from '@/lib/achievements'

// Request coalescing map to prevent "Thundering Herd"
const pendingRequests = new Map<string, Promise<any>>();

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '100')
    const offset = parseInt(searchParams.get('offset') || '0')
    const walletAddress = searchParams.get('wallet')
    const periodParam = (searchParams.get('period') || '7d').toLowerCase()
    const allowed: Record<string, '1d' | '7d' | '30d' | 'all'> = { '1d': '1d', '7d': '7d', '30d': '30d', 'all': 'all' }
    const period = allowed[periodParam] || '7d'
    
    // Normalize cache key
    const cacheKey = `${walletAddress || 'global'}:${period}:${limit}:${offset}`;

    // 1. Request Coalescing: If a request for this data is already in progress, wait for it
    if (pendingRequests.has(cacheKey)) {
      const coalescedData = await pendingRequests.get(cacheKey);
      return NextResponse.json(coalescedData, {
        headers: {
          'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=60',
          'X-Cache': 'COALESCED'
        }
      });
    }

    // Validate limit and offset
    if (limit < 1 || limit > 1000) {
      return NextResponse.json(
        { error: 'Limit must be between 1 and 1000' },
        { status: 400 }
      )
    }

    if (offset < 0) {
      return NextResponse.json(
        { error: 'Offset must be non-negative' },
        { status: 400 }
      )
    }

    const fetchPromise = (async () => {
      // If wallet address is provided, get user-specific data
      if (walletAddress) {
        // Validate wallet address format
        if (!walletAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
          throw new Error('Invalid wallet address format');
        }

        const user = await LeaderboardDB.getUser(walletAddress)
        const userRank = await LeaderboardDB.getUserRank(walletAddress)
        const periodStats = await LeaderboardDB.getUserPeriodStats(walletAddress, period)
        const globalBundle = await LeaderboardDB.getAllTimePointsAndRanks([walletAddress])
        const globalRow = globalBundle[0] || { all_time_points: Number((user as any)?.total_points || 0), global_rank: userRank }
        const userTransactions = await LeaderboardDB.getUserTransactions(walletAddress, 20)

        // Derive safe display values (server-authoritative)
        const currentSeason = getCurrentSeason()
        const seasonId = currentSeason?.id || null
        const xp = Number((user as any)?.xp || 0)
        // Read stored selections from user.badges JSON if present
        const badgesField: any = (user as any)?.badges
        let selectedBadgeId: string | null = null
        let selectedBorderColor: string | null = null
        let selectedNameEmoji: string | null = null
        let storedBadgeIds: string[] = []
        if (badgesField) {
          try {
            const parsed = typeof badgesField === 'string' ? JSON.parse(badgesField) : badgesField
            const sel = parsed?.selected || {}
            selectedBadgeId = sel.badgeId || null
            selectedBorderColor = sel.borderColor || null
            selectedNameEmoji = sel.nameEmoji || null
            if (Array.isArray(parsed?.earned)) storedBadgeIds = parsed.earned
          } catch (_) {}
        }
        // Fetch login streaks + season-scoped login days in parallel
        let loginStreak: number | undefined
        let maxLoginStreak: number | undefined
        let seasonLoginDays: number = 0
        try {
          const [streaks, sld] = await Promise.all([
            LeaderboardDB.getUserLoginStreaks(walletAddress),
            currentSeason
              ? LeaderboardDB.getSeasonLoginDays(walletAddress, currentSeason.id)
              : Promise.resolve(0),
          ])
          loginStreak    = streaks.current
          maxLoginStreak = streaks.max
          seasonLoginDays = sld
        } catch (_) {}
        const derived = deriveDisplayFromProfile({
          userXp: xp,
          selectedBadgeId,
          selectedBorderColor,
          selectedNameEmoji,
          seasonId,
          loginStreak,
          maxLoginStreak,
          // Pass season-scoped login days so nextBadge/afterNextBadge are accurate for S2
          totalLoginDays: seasonLoginDays,
          storedBadgeIds,
        })

        return {
          user: user ? {
            ...user,
            rank: userRank,
            period_points: periodStats.points,
            period_rank: periodStats.rank,
            all_time_points: Number(globalRow.all_time_points || (user as any)?.total_points || 0),
            global_rank: globalRow.global_rank ?? userRank,
            displayBadge: derived.displayBadge,
            borderColor: derived.borderColor,
            nameEmoji: derived.nameEmoji,
            borderStyle: derived.borderStyle,
            badgeStyle: derived.displayBadge?.badgeStyle,
            suggestions: { emoji: derived.suggestedEmoji || null, borderColor: derived.suggestedBorderColor || null },
            nextBadge: derived.nextBadge,
            afterNextBadgeHint: derived.afterNextBadgeHint,
          } : null,
          transactions: userTransactions
        }
      }

      // Get general leaderboard data (optionally time-windowed)
      const leaderboard = await LeaderboardDB.getLeaderboardForPeriod(period, limit, offset)
      const stats = await LeaderboardDB.getLeaderboardStats()

      // Attach derived display fields per user
      const seasonId = getCurrentSeason()?.id || null
      const enriched = await Promise.all(leaderboard.map(async u => {
        const xp = Number((u as any)?.xp || 0)
        const badgesField: any = (u as any)?.badges
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
          } catch (_) {}
        }
        // Skip loginStreak lookups for list to avoid N+1 queries
        const derived = deriveDisplayFromProfile({ userXp: xp, selectedBadgeId, selectedBorderColor, selectedNameEmoji, seasonId })
        // For the list view, avoid strict earned checks to show user's explicit selections without N+1 lookups
        const selectedBadgeMeta = selectedBadgeId ? getAllBadges().find(b => b.id === selectedBadgeId) : null
        const isAllowedForLeaderboard = selectedBadgeMeta?.allowLeaderboardDisplay !== false
        const derivedIsAllowed = derived.displayBadge ? (getAllBadges().find(b => b.id === derived.displayBadge!.id)?.allowLeaderboardDisplay !== false) : false
        const listDisplayBadge = (selectedBadgeMeta && isAllowedForLeaderboard)
          ? { id: selectedBadgeMeta.id, name: selectedBadgeMeta.name, icon: selectedBadgeMeta.icon, tier: selectedBadgeMeta.tier, borderColor: derived.borderColor || null, emoji: selectedNameEmoji || null }
          : (selectedBadgeId ? (derivedIsAllowed ? derived.displayBadge : null) : null)
        return {
          ...u,
          // Show selected badge only if allowed for leaderboard; otherwise fall back to derived (or null)
          displayBadge: selectedBadgeId ? listDisplayBadge : null,
          borderColor: derived.borderColor,
          // Prefer the explicit selected emoji if present
          nameEmoji: selectedNameEmoji || derived.nameEmoji,
          borderStyle: derived.borderStyle,
          badgeStyle: derived.displayBadge?.badgeStyle,
          suggestions: { emoji: derived.suggestedEmoji || null, borderColor: derived.suggestedBorderColor || null },
        }
      }))

      // Attach global totals and ranks for listed wallets
      const wallets = enriched.map((u: any) => u.wallet_address)
      const globalRows = await LeaderboardDB.getAllTimePointsAndRanks(wallets)
      const globalMap = new Map(globalRows.map(r => [r.wallet_address.toLowerCase(), r]))
      const enrichedWithGlobals = enriched.map((u: any) => {
        const g = globalMap.get(u.wallet_address.toLowerCase())
        return {
          ...u,
          all_time_points: Number(g?.all_time_points ?? u.total_points ?? 0),
          global_rank: g?.global_rank ?? null,
        }
      })

      return {
        leaderboard: enrichedWithGlobals,
        stats,
        pagination: {
          limit,
          offset,
          hasMore: leaderboard.length === limit
        }
      }
    })();

    pendingRequests.set(cacheKey, fetchPromise);

    try {
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Request Timeout')), 25000)
      );
      const resultData = await Promise.race([fetchPromise, timeoutPromise]);
      return NextResponse.json(resultData, {
        headers: {
          'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=60',
          'X-Cache': 'MISS'
        }
      })
    } finally {
      pendingRequests.delete(cacheKey);
    }

  } catch (error: any) {
    console.error('Leaderboard API error:', error)
    
    // Check for specific validation errors that should return 400
    if (error.message === 'Invalid wallet address format') {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to fetch leaderboard data' },
      { status: 500 }
    )
  }
}
 
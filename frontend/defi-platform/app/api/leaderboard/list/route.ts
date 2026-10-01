import { NextRequest, NextResponse } from 'next/server'
import { LeaderboardDB, ClaimDB } from '@/lib/database'
import { getAllBadges } from '@/lib/achievements'

// Heavy caching for the public list
const listCache = new Map<string, { data: any, timestamp: number }>();
const pendingRequests = new Map<string, Promise<any>>();
const CACHE_TTL = 30000; // 30 seconds

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = Math.min(1000, Math.max(1, parseInt(searchParams.get('limit') || '100')))
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0'))
    const periodParam = (searchParams.get('period') || 'all').toLowerCase()
    const allowed: Record<string, '1d' | '7d' | '30d' | 'all'> = { '1d': '1d', '7d': '7d', '30d': '30d', 'all': 'all' }
    const period = allowed[periodParam] || 'all'

    const cacheKey = `list:${period}:${limit}:${offset}`;
    
    // 1. Check Cache
    const cached = listCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      return NextResponse.json(cached.data, {
        headers: { 
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
          'X-Cache': 'HIT'
        }
      });
    }

    // 2. Coalesce concurrent requests (Thundering Herd protection)
    if (pendingRequests.has(cacheKey)) {
      const coalescedData = await pendingRequests.get(cacheKey);
      return NextResponse.json(coalescedData, {
        headers: { 
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
          'X-Cache': 'COALESCED'
        }
      });
    }

    // 3. Fetch Data
    const fetchPromise = (async () => {
      const [leaderboard, stats] = await Promise.all([
        LeaderboardDB.getLeaderboardForPeriod(period, limit, offset),
        LeaderboardDB.getLeaderboardStats(),
      ])

      // 4. Lightweight Enrichment (Display Badges only)
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

      // 5. Attach Global Ranks (Optimized)
      const globalRows = await LeaderboardDB.getAllTimePointsAndRanks(enriched.map((u: any) => u.wallet_address))
      const globalMap = new Map(globalRows.map(r => [r.wallet_address.toLowerCase(), r]))

      // 6. Attach premium status (single batch query)
      const premiumUsers = await ClaimDB.listPremiumUsers(500)
      const premiumSet = new Set(premiumUsers.map(p => p.normalized_address))

      const finalLeaderboard = enriched.map((u: any) => {
        const g = globalMap.get(u.wallet_address.toLowerCase())
        return {
          ...u,
          all_time_points: Number(g?.all_time_points ?? u.total_points ?? 0),
          global_rank: g?.global_rank ?? null,
          isPremium: premiumSet.has(u.wallet_address.toLowerCase()),
        }
      })

      const result = {
        leaderboard: finalLeaderboard,
        stats,
        pagination: { limit, offset, hasMore: leaderboard.length === limit }
      }

      listCache.set(cacheKey, { data: result, timestamp: Date.now() });
      return result;
    })();

    pendingRequests.set(cacheKey, fetchPromise);

    try {
      const resultData = await fetchPromise;
      return NextResponse.json(resultData, {
        headers: { 
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
          'X-Cache': 'MISS'
        }
      });
    } finally {
      pendingRequests.delete(cacheKey);
    }

  } catch (error) {
    console.error('Leaderboard list error:', error)
    return NextResponse.json({ error: 'Failed to fetch leaderboard list' }, { status: 500 })
  }
}


import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { getTableNames } from '@/lib/tableResolver'
import { deriveDisplayFromProfile, getAfterNextBadge, getCurrentSeason, getEarnedBadges, getNextBadge, getBadgesByIds } from '@/lib/achievements'
import { LeaderboardDB } from '@/lib/database'
import { PrivyClient } from '@privy-io/server-auth'
import { resolveEvmAddress } from '@/lib/agents/resolve-wallet'

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET;
const privy = new PrivyClient(PRIVY_APP_ID!, PRIVY_APP_SECRET!);

function parseSelections(badgesField: any): { selectedBadgeId: string | null; selectedBorderColor: string | null; selectedNameEmoji: string | null } {
  try {
    if (!badgesField) return { selectedBadgeId: null, selectedBorderColor: null, selectedNameEmoji: null }
    if (typeof badgesField === 'string') {
      const parsed = JSON.parse(badgesField)
      const sel = parsed?.selected || {}
      return { selectedBadgeId: sel.badgeId || null, selectedBorderColor: sel.borderColor || null, selectedNameEmoji: sel.nameEmoji || null }
    }
    if (typeof badgesField === 'object') {
      const sel = (badgesField as any)?.selected || {}
      return { selectedBadgeId: sel.badgeId || null, selectedBorderColor: sel.borderColor || null, selectedNameEmoji: sel.nameEmoji || null }
    }
  } catch (_) {}
  return { selectedBadgeId: null, selectedBorderColor: null, selectedNameEmoji: null }
}

// Server-side cache to prevent DoS
const displayCache = new Map<string, { data: any, timestamp: number }>();
const pendingRequests = new Map<string, Promise<any>>();
const CACHE_TTL = 30000; // 30 seconds

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const wallet = searchParams.get('wallet')
    if (!wallet || !wallet.match(/^0x[a-fA-F0-9]{40}$/)) {
      return NextResponse.json({ error: 'Invalid or missing wallet' }, { status: 400 })
    }

    const walletAddress = wallet.toLowerCase();

    // 1. Check cache
    const cached = displayCache.get(walletAddress);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      return NextResponse.json(cached.data, {
        headers: {
          'Cache-Control': 'private, s-maxage=30, stale-while-revalidate=60',
          'X-Cache': 'HIT'
        }
      });
    }

    // 2. Coalesce concurrent requests
    if (pendingRequests.has(walletAddress)) {
      const coalescedData = await pendingRequests.get(walletAddress);
      return NextResponse.json(coalescedData, {
        headers: {
          'Cache-Control': 'private, s-maxage=30, stale-while-revalidate=60',
          'X-Cache': 'COALESCED'
        }
      });
    }

    const fetchPromise = (async () => {
      const t = getTableNames()
      const rows = await sql`
        SELECT wallet_address, username, badges
        FROM ${sql(t.userProfiles)}
        WHERE wallet_address = ${walletAddress}
        LIMIT 1
      `
      const profile = (rows as any[])[0] || null
      const seasonId = getCurrentSeason()?.id || null
      // Use leaderboard total_points as pts source of truth
      const leaderboardUser = await LeaderboardDB.getUser(walletAddress)
      const xp = Number((leaderboardUser as any)?.total_points || 0)
      let loginStreak: number | undefined
      let maxLoginStreak: number | undefined
      let totalLoginDays: number | undefined
      try { 
        const streaks = await LeaderboardDB.getUserLoginStreaks(walletAddress)
        loginStreak = streaks.current
        maxLoginStreak = streaks.max
        totalLoginDays = await LeaderboardDB.getTotalLoginDays(walletAddress)
      } catch (_) {}
      const { selectedBadgeId, selectedBorderColor, selectedNameEmoji } = parseSelections(profile?.badges)
      
      // OPTIMIZATION: Get stored badge IDs first - we'll skip calculating these
      const parsedBadges = typeof profile?.badges === 'string' ? JSON.parse(profile.badges || '{}') : (profile?.badges || {})
      const storedBadgeIds: string[] = Array.isArray(parsedBadges?.earned) ? parsedBadges.earned : []
      const storedBadges = getBadgesByIds(storedBadgeIds)
      
      // Include transaction stats to ensure tx-count-based badges appear
      const stats = await LeaderboardDB.getUserTransactionStats(walletAddress)
      const maintained = await LeaderboardDB.getMaintainedPositionStreaks(walletAddress, { minUsdValue: 0, lookbackDays: 180 })
      const maintained100 = await LeaderboardDB.getMaintainedPositionStreaks(walletAddress, { minUsdValue: 100, lookbackDays: 180 })
      const maintained250 = await LeaderboardDB.getMaintainedPositionStreaks(walletAddress, { minUsdValue: 250, lookbackDays: 180 })
      const maintained2500 = await LeaderboardDB.getMaintainedPositionStreaks(walletAddress, { minUsdValue: 2500, lookbackDays: 180 })
      const maintained10000 = await LeaderboardDB.getMaintainedPositionStreaks(walletAddress, { minUsdValue: 10000, lookbackDays: 180 })
      const maintained100000 = await LeaderboardDB.getMaintainedPositionStreaks(walletAddress, { minUsdValue: 100000, lookbackDays: 180 })
      const maintained500000 = await LeaderboardDB.getMaintainedPositionStreaks(walletAddress, { minUsdValue: 500000, lookbackDays: 180 })
      const stablecoinSuppliedCount = await LeaderboardDB.getDistinctSuppliedStablecoinCount(walletAddress)
      const blueChipSuppliedCount = await LeaderboardDB.getDistinctSuppliedBlueChipCount(walletAddress)
      const transactionStreak = await LeaderboardDB.getUserTransactionStreak(walletAddress)
      
      // OPTIMIZATION: Only calculate badges that user doesn't have yet
      const newlyEarned = getEarnedBadges({ 
        userXp: xp, seasonId, loginStreak, maxLoginStreak, totalLoginDays,
        totalTransactions: stats.totalTransactions, transactionsByType: stats.transactionsByType, totalUsdVolume: stats.totalUsdVolume,
        crossChainTotalUsdVolume: (stats as any).crossChainTotalUsdVolume,
        crossChainTotalTransactions: (stats as any).crossChainTotalTransactions,
        crossChainTransactionsByType: (stats as any).crossChainTransactionsByType,
        transactionStreak,
        supplyPositionDays: maintained.supply,
        positionMaintainedDays: { supply: maintained.supply, borrow: maintained.borrow, any: maintained.any },
        positionMaintainedDaysByThreshold: { '100': { supply: maintained100.supply, borrow: maintained100.borrow, any: maintained100.any }, '250': { supply: maintained250.supply, borrow: maintained250.borrow, any: maintained250.any }, '2500': { supply: maintained2500.supply, borrow: maintained2500.borrow, any: maintained2500.any }, '10000': { supply: maintained10000.supply, borrow: maintained10000.borrow, any: maintained10000.any }, '100000': { supply: maintained100000.supply, borrow: maintained100000.borrow, any: maintained100000.any }, '500000': { supply: maintained500000.supply, borrow: maintained500000.borrow, any: maintained500000.any } },
        distinctStablecoinSuppliedCount: stablecoinSuppliedCount,
        distinctBlueChipSuppliedCount: blueChipSuppliedCount,
        completedAchievementsCount: storedBadgeIds.length, // Include stored count for meta-achievements
      }, seasonId, { excludeIds: storedBadgeIds })
      
      // Merge stored badges with newly earned ones
      const mergedEarned = [...storedBadges, ...newlyEarned].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
      const allEarnedIds = mergedEarned.map(b => b.id)
      
      // Award XP and save newly earned badges
      try {
        for (const b of newlyEarned) {
          if (b.pointsReward && b.pointsReward > 0) {
            await LeaderboardDB.awardBadgePoints(walletAddress, b.pointsReward, `BADGE:${b.id}`)
          }
        }
        
        if (newlyEarned.length > 0) {
          await LeaderboardDB.upsertUserEarnedBadges(walletAddress, newlyEarned.map(b => b.id))
        }
        
        // Reconcile badge XP on read to ensure XP is not stale
        const expectedBadgeXp = mergedEarned.reduce((sum, b) => sum + (b.pointsReward || 0), 0)
        const xpRow = await LeaderboardDB.getUser(walletAddress)
        const currentBadgeXp = Number((xpRow as any)?.xp || 0)
        const delta = Math.max(0, expectedBadgeXp - currentBadgeXp)
        if (delta > 0) {
          await LeaderboardDB.awardBadgePoints(walletAddress, delta, 'BADGE:RECONCILE')
        }
      } catch (badgeError) {
        console.error(`[Profile Display] Badge evaluation/reconciliation failed for ${walletAddress}:`, badgeError)
      }
      
      // Use stored badge IDs for optimized display derivation
      const derived = deriveDisplayFromProfile({ 
        userXp: xp, seasonId, selectedBadgeId, selectedBorderColor, selectedNameEmoji, loginStreak, maxLoginStreak,
        totalLoginDays,
        transactionStreak,
        totalTransactions: stats.totalTransactions,
        transactionsByType: stats.transactionsByType,
        crossChainTotalTransactions: (stats as any).crossChainTotalTransactions,
        crossChainTransactionsByType: (stats as any).crossChainTransactionsByType,
        totalUsdVolume: stats.totalUsdVolume,
        crossChainTotalUsdVolume: (stats as any).crossChainTotalUsdVolume,
        supplyPositionDays: maintained.supply,
        positionMaintainedDays: { supply: maintained.supply, borrow: maintained.borrow, any: maintained.any },
        positionMaintainedDaysByThreshold: { '100': { supply: maintained100.supply, borrow: maintained100.borrow, any: maintained100.any }, '250': { supply: maintained250.supply, borrow: maintained250.borrow, any: maintained250.any }, '2500': { supply: maintained2500.supply, borrow: maintained2500.borrow, any: maintained2500.any }, '10000': { supply: maintained10000.supply, borrow: maintained10000.borrow, any: maintained10000.any }, '100000': { supply: maintained100000.supply, borrow: maintained100000.borrow, any: maintained100000.any }, '500000': { supply: maintained500000.supply, borrow: maintained500000.borrow, any: maintained500000.any } },
        distinctStablecoinSuppliedCount: stablecoinSuppliedCount,
        distinctBlueChipSuppliedCount: blueChipSuppliedCount,
        completedAchievementsCount: allEarnedIds.length,
        storedBadgeIds: allEarnedIds, // Pass all earned badges for optimization
      })
      
      const nextBadge = getNextBadge({ 
        userXp: xp, seasonId, loginStreak, maxLoginStreak, totalLoginDays, totalTransactions: stats.totalTransactions, transactionsByType: stats.transactionsByType, totalUsdVolume: stats.totalUsdVolume,
        crossChainTotalUsdVolume: (stats as any).crossChainTotalUsdVolume,
        crossChainTotalTransactions: (stats as any).crossChainTotalTransactions,
        crossChainTransactionsByType: (stats as any).crossChainTransactionsByType,
        supplyPositionDays: maintained.supply,
        positionMaintainedDays: { supply: maintained.supply, borrow: maintained.borrow, any: maintained.any },
        positionMaintainedDaysByThreshold: { '100': { supply: maintained100.supply, borrow: maintained100.borrow, any: maintained100.any }, '250': { supply: maintained250.supply, borrow: maintained250.borrow, any: maintained250.any }, '2500': { supply: maintained2500.supply, borrow: maintained2500.borrow, any: maintained2500.any }, '10000': { supply: maintained10000.supply, borrow: maintained10000.borrow, any: maintained10000.any }, '100000': { supply: maintained100000.supply, borrow: maintained100000.borrow, any: maintained100000.any }, '500000': { supply: maintained500000.supply, borrow: maintained500000.borrow, any: maintained500000.any } },
        distinctStablecoinSuppliedCount: stablecoinSuppliedCount,
        distinctBlueChipSuppliedCount: blueChipSuppliedCount,
      }, seasonId, allEarnedIds)
      const afterNextBadgeHint = getAfterNextBadge({ 
        userXp: xp, seasonId, loginStreak, maxLoginStreak, totalLoginDays, totalTransactions: stats.totalTransactions, transactionsByType: stats.transactionsByType, totalUsdVolume: stats.totalUsdVolume,
        crossChainTotalTransactions: (stats as any).crossChainTotalTransactions,
        crossChainTransactionsByType: (stats as any).crossChainTransactionsByType,
        supplyPositionDays: maintained.supply,
        positionMaintainedDays: { supply: maintained.supply, borrow: maintained.borrow, any: maintained.any },
        positionMaintainedDaysByThreshold: { '100': { supply: maintained100.supply, borrow: maintained100.borrow, any: maintained100.any }, '250': { supply: maintained250.supply, borrow: maintained250.borrow, any: maintained250.any }, '2500': { supply: maintained2500.supply, borrow: maintained2500.borrow, any: maintained2500.any }, '10000': { supply: maintained10000.supply, borrow: maintained10000.borrow, any: maintained10000.any }, '100000': { supply: maintained100000.supply, borrow: maintained100000.borrow, any: maintained100000.any }, '500000': { supply: maintained500000.supply, borrow: maintained500000.borrow, any: maintained500000.any } },
        distinctStablecoinSuppliedCount: stablecoinSuppliedCount,
        distinctBlueChipSuppliedCount: blueChipSuppliedCount,
      }, seasonId, allEarnedIds)

      // Build unlocked arrays for UI using merged badges (permanent + new)
      const unlockedEmojis = Array.from(new Set(mergedEarned.map(b => b.unlockEmoji).filter(Boolean) as string[]))
      const unlockedBorderColors = Array.from(new Set(mergedEarned.map(b => b.unlockBorderColor).filter(Boolean) as string[]))

      const result = {
        profile: {
          wallet_address: walletAddress,
          username: profile?.username || null,
          xp,
          selections: {
            badgeId: selectedBadgeId,
            borderColor: selectedBorderColor,
            nameEmoji: selectedNameEmoji,
          },
          display: derived,
          earnedBadges: mergedEarned.map(b => ({ id: b.id, name: b.name, icon: b.icon, unlockEmoji: b.unlockEmoji || null, unlockBorderColor: b.unlockBorderColor || null, tier: b.tier, allowLeaderboardDisplay: b.allowLeaderboardDisplay !== false })),
          unlocked: { emojis: unlockedEmojis, borderColors: unlockedBorderColors },
          suggestions: { emoji: derived.suggestedEmoji || null, borderColor: derived.suggestedBorderColor || null },
          nextBadge,
          afterNextBadgeHint,
        }
      };

      displayCache.set(walletAddress, { data: result, timestamp: Date.now() });
      return result;
    })();

    pendingRequests.set(walletAddress, fetchPromise);

    try {
      const resultData = await fetchPromise;
      return NextResponse.json(resultData, {
        headers: {
          'Cache-Control': 'private, s-maxage=30, stale-while-revalidate=60',
          'X-Cache': 'MISS'
        }
      });
    } finally {
      pendingRequests.delete(walletAddress);
    }
  } catch (error) {
    console.error('GET /api/user/profile/display error:', error)
    return NextResponse.json({ error: 'Failed to load profile display' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const t = getTableNames()
    
    // 1. Soft-verify Privy Access Token from Authorization Header
    const authHeader = request.headers.get('authorization')
    let authenticatedAddress = null;

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7)
      try {
        const verifiedClaims = await privy.verifyAuthToken(token)
        // resolveEvmAddress handles social-login DIDs where userId is a CUID
        // rather than an embedded-address. Matches the other agent routes.
        const resolved = await resolveEvmAddress(privy, verifiedClaims.userId)
        authenticatedAddress = resolved?.toLowerCase() ?? null
      } catch (e) {
        console.warn('[profile-display] Privy token verification failed (continuing):', e)
      }
    }

    const body = await request.json()
    const { walletAddress, selected_badge_id, selected_border_color, selected_name_emoji } = body || {}

    if (!walletAddress) {
      return NextResponse.json({ success: false, error: 'Missing walletAddress' }, { status: 400 })
    }
    
    // 2. Optional: Verify Wallet Ownership (Soft Check)
    const isDirectOwner = authenticatedAddress === walletAddress.toLowerCase();
    const isAuthorized = !authenticatedAddress || isDirectOwner;

    if (authenticatedAddress && !isAuthorized) {
      console.warn('[profile-display] Auth token does not match wallet address', {
        authenticatedAddress,
        walletAddress
      })
    }

    if (!walletAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      return NextResponse.json({ success: false, error: 'Invalid wallet address' }, { status: 400 })
    }

    // Load current profile and compute points + stats server-side
    const rows = await sql`
      SELECT wallet_address, username, xp, badges
      FROM ${sql(t.userProfiles)}
      WHERE wallet_address = ${walletAddress.toLowerCase()}
      LIMIT 1
    `
    const profile = (rows as any[])[0] || null
    const seasonId = getCurrentSeason()?.id || null
    const leaderboardUser = await LeaderboardDB.getUser(walletAddress)
    const xp = Number((leaderboardUser as any)?.total_points || 0)
    let loginStreak: number | undefined
    let maxLoginStreak: number | undefined
    let totalLoginDays: number | undefined
    try { 
      const streaks = await LeaderboardDB.getUserLoginStreaks(walletAddress)
      loginStreak = streaks.current
      maxLoginStreak = streaks.max
      totalLoginDays = await LeaderboardDB.getTotalLoginDays(walletAddress)
    } catch (_) {}
    const stats = await LeaderboardDB.getUserTransactionStats(walletAddress)
    // Align POST validation context with GET to avoid rejecting valid selections
    // Also include achievements-completed context so meta badges (e.g., Journeyman) can be validated correctly
    let transactionStreak: number | undefined
    let maintained: any = { supply: 0, borrow: 0, any: 0 }
    let maintained100: any = { supply: 0, borrow: 0, any: 0 }
    let maintained250: any = { supply: 0, borrow: 0, any: 0 }
    let maintained2500: any = { supply: 0, borrow: 0, any: 0 }
    let maintained10000: any = { supply: 0, borrow: 0, any: 0 }
    let maintained100000: any = { supply: 0, borrow: 0, any: 0 }
    let maintained500000: any = { supply: 0, borrow: 0, any: 0 }
    let stablecoinSuppliedCount: number | undefined
    let blueChipSuppliedCount: number | undefined
    let completedAchievementsCount: number | undefined
    let completedAchievementsByTier: any = undefined
    try {
      transactionStreak = await LeaderboardDB.getUserTransactionStreak(walletAddress)
    } catch {}
    try {
      maintained = await LeaderboardDB.getMaintainedPositionStreaks(walletAddress, { minUsdValue: 0, lookbackDays: 180 })
      maintained100 = await LeaderboardDB.getMaintainedPositionStreaks(walletAddress, { minUsdValue: 100, lookbackDays: 180 })
      maintained250 = await LeaderboardDB.getMaintainedPositionStreaks(walletAddress, { minUsdValue: 250, lookbackDays: 180 })
      maintained2500 = await LeaderboardDB.getMaintainedPositionStreaks(walletAddress, { minUsdValue: 2500, lookbackDays: 180 })
      maintained10000 = await LeaderboardDB.getMaintainedPositionStreaks(walletAddress, { minUsdValue: 10000, lookbackDays: 180 })
      maintained100000 = await LeaderboardDB.getMaintainedPositionStreaks(walletAddress, { minUsdValue: 100000, lookbackDays: 180 })
      maintained500000 = await LeaderboardDB.getMaintainedPositionStreaks(walletAddress, { minUsdValue: 500000, lookbackDays: 180 })
    } catch {}
    try {
      stablecoinSuppliedCount = await LeaderboardDB.getDistinctSuppliedStablecoinCount(walletAddress)
    } catch {}
    try {
      blueChipSuppliedCount = await LeaderboardDB.getDistinctSuppliedBlueChipCount(walletAddress)
    } catch {}
    // Parse existing profile badges to compute completed achievements count
    try {
      const parsed = typeof profile?.badges === 'string' ? JSON.parse(profile.badges) : profile?.badges
      const earnedIds: string[] = Array.isArray(parsed?.earned) ? parsed.earned : []
      completedAchievementsCount = earnedIds.length
      // Optionally: completedAchievementsByTier can be populated if/when tier mapping is stored
    } catch {}

    const earned = getEarnedBadges({ 
      userXp: xp, seasonId, loginStreak, maxLoginStreak, totalLoginDays,
      transactionStreak,
      totalTransactions: stats.totalTransactions,
      transactionsByType: stats.transactionsByType,
      totalUsdVolume: stats.totalUsdVolume,
      supplyPositionDays: maintained.supply,
      positionMaintainedDays: { supply: maintained.supply, borrow: maintained.borrow, any: maintained.any },
      positionMaintainedDaysByThreshold: { '100': { supply: maintained100.supply, borrow: maintained100.borrow, any: maintained100.any }, '250': { supply: maintained250.supply, borrow: maintained250.borrow, any: maintained250.any }, '2500': { supply: maintained2500.supply, borrow: maintained2500.borrow, any: maintained2500.any }, '10000': { supply: maintained10000.supply, borrow: maintained10000.borrow, any: maintained10000.any }, '100000': { supply: maintained100000.supply, borrow: maintained100000.borrow, any: maintained100000.any }, '500000': { supply: maintained500000.supply, borrow: maintained500000.borrow, any: maintained500000.any } },
      distinctStablecoinSuppliedCount: stablecoinSuppliedCount,
      distinctBlueChipSuppliedCount: blueChipSuppliedCount,
      completedAchievementsCount,
      completedAchievementsByTier,
    })
    // Include stored badges in validation to match GET behavior
    let storedBadges: any[] = []
    try {
      const parsed = typeof profile?.badges === 'string' ? JSON.parse(profile.badges) : profile?.badges
      const storedIds: string[] = Array.isArray(parsed?.earned) ? parsed.earned : []
      if (storedIds.length > 0) {
        storedBadges = getBadgesByIds(storedIds)
      }
    } catch (_) {}

    const allValidBadges = [...earned, ...storedBadges]

    const earnedIds = new Set(allValidBadges.map(b => b.id))
    const unlockedColors = new Set(allValidBadges.map(b => b.unlockBorderColor).filter(Boolean) as string[])
    const unlockedEmojis = new Set(allValidBadges.map(b => b.unlockEmoji).filter(Boolean) as string[])

    // Validate explicit selections only
    const safeBadgeId = selected_badge_id && earnedIds.has(selected_badge_id) ? selected_badge_id : null
    const safeBorderColor = selected_border_color && unlockedColors.has(selected_border_color) ? selected_border_color : null
    const safeNameEmoji = selected_name_emoji && unlockedEmojis.has(selected_name_emoji) ? selected_name_emoji : null

    // Persist selections and earned badges inside badges JSON (server-derived; cannot self-assign)
    const existingBadges = profile?.badges || null
    let updatedBadges: any
    // Determine which earned badges are newly unlocked compared to stored set, to award XP if missing
    let prevEarned: string[] = []
    try {
      const parsed = typeof existingBadges === 'string' ? JSON.parse(existingBadges) : existingBadges
      if (parsed && !Array.isArray(parsed) && typeof parsed === 'object') {
        prevEarned = Array.isArray(parsed.earned) ? parsed.earned : []
        const mergedEarned = Array.from(new Set<string>([...prevEarned, ...Array.from(earnedIds)]))
        updatedBadges = { ...parsed, selected: { badgeId: safeBadgeId, borderColor: safeBorderColor, nameEmoji: safeNameEmoji }, earned: mergedEarned }
      } else {
        // Legacy or empty -> write fresh object
        updatedBadges = { selected: { badgeId: safeBadgeId, borderColor: safeBorderColor, nameEmoji: safeNameEmoji }, earned: Array.from(earnedIds) }
      }
    } catch (_) {
      updatedBadges = { selected: { badgeId: safeBadgeId, borderColor: safeBorderColor, nameEmoji: safeNameEmoji }, earned: Array.from(earnedIds) }
    }

    // Award points for badges newly earned but not previously credited
    try {
      const prevEarnedSet = new Set(prevEarned)
      for (const b of earned) {
        if (!prevEarnedSet.has(b.id) && b.pointsReward && b.pointsReward > 0) {
          await LeaderboardDB.awardBadgePoints(walletAddress, b.pointsReward, `BADGE:${b.id}`)
        }
      }
    } catch {}

    // Reconcile badge XP in case some previously-earned badges were never credited
    try {
      const expectedBadgeXp = earned.reduce((sum, b) => sum + (b.pointsReward || 0), 0)
      const xpRow = await sql`
        SELECT xp FROM ${sql(t.userProfiles)} WHERE wallet_address = ${walletAddress.toLowerCase()} LIMIT 1
      `
      const currentBadgeXp = Number((xpRow as any[])[0]?.xp || 0)
      const delta = Math.max(0, expectedBadgeXp - currentBadgeXp)
      if (delta > 0) {
        await LeaderboardDB.awardBadgePoints(walletAddress, delta, 'BADGE:RECONCILE')
      }
    } catch {}

    const fallbackUsername = (profile?.username && String(profile.username).slice(0, 32)) || walletAddress.toLowerCase().slice(0, 32)
    await sql`
      INSERT INTO ${sql(t.userProfiles)} (wallet_address, username, badges)
      VALUES (${walletAddress.toLowerCase()}, ${fallbackUsername}, ${JSON.stringify(updatedBadges)})
      ON CONFLICT (wallet_address) DO UPDATE SET
        badges = EXCLUDED.badges,
        updated_at = NOW()
    `

    const derived = deriveDisplayFromProfile({ userXp: xp, seasonId, selectedBadgeId: safeBadgeId, selectedBorderColor: safeBorderColor, selectedNameEmoji: safeNameEmoji, loginStreak, maxLoginStreak, totalLoginDays })

    return NextResponse.json({ success: true, display: derived })
  } catch (error) {
    console.error('POST /api/user/profile/display error:', error)
    return NextResponse.json({ success: false, error: 'Failed to update profile display' }, { status: 500 })
  }
}

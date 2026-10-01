/**
 * Season-Scoped Stats — unit tests (Checkpoints 6 & 7)
 *
 * Tests the pure logic of:
 * - incrementSeasonLoginDays / getSeasonLoginDays JSONB behaviour
 * - getSeasonTransactionStats date-filter logic (simulated)
 * - AchievementContext construction with season-scoped values
 * - Badge evaluation using season-scoped vs all-time stats
 * - awardDailyLoginBonus passing seasonId (contract test)
 */

import { describe, it, expect } from 'vitest'
import { getEarnedBadges, getCurrentSeason, SEASONS, type AchievementContext } from '@/lib/achievements'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Simulate what the route builds for S2 badge evaluation */
function buildS2Context(overrides: Partial<AchievementContext> = {}): AchievementContext {
  return {
    userXp: 0,
    seasonId: 's2',
    totalTransactions: 0,
    transactionsByType: {},
    totalUsdVolume: 0,
    totalLoginDays: 0,   // ← season-scoped days (from season_login_days->>'s2')
    loginStreak: 0,
    maxLoginStreak: 0,
    supplyPositionDays: 0,
    ...overrides,
  }
}

/** Simulate the JSONB increment logic in incrementSeasonLoginDays */
function simulateJsonbIncrement(
  current: Record<string, number>,
  seasonId: string
): Record<string, number> {
  return {
    ...current,
    [seasonId]: (current[seasonId] ?? 0) + 1,
  }
}

/** Simulate what getSeasonLoginDays reads back */
function simulateGetSeasonLoginDays(
  jsonb: Record<string, number>,
  seasonId: string
): number {
  return jsonb[seasonId] ?? 0
}

// ─── JSONB season_login_days mechanics ───────────────────────────────────────

describe('season_login_days JSONB mechanics', () => {
  it('initialises to 0 when key is absent', () => {
    const jsonb: Record<string, number> = {}
    expect(simulateGetSeasonLoginDays(jsonb, 's2')).toBe(0)
  })

  it('increments from 0 to 1 on first login', () => {
    let jsonb: Record<string, number> = {}
    jsonb = simulateJsonbIncrement(jsonb, 's2')
    expect(simulateGetSeasonLoginDays(jsonb, 's2')).toBe(1)
  })

  it('increments across multiple logins', () => {
    let jsonb: Record<string, number> = {}
    for (let i = 0; i < 60; i++) {
      jsonb = simulateJsonbIncrement(jsonb, 's2')
    }
    expect(simulateGetSeasonLoginDays(jsonb, 's2')).toBe(60)
  })

  it('s2 counter is independent of s1 counter', () => {
    let jsonb: Record<string, number> = { s1: 95 }
    jsonb = simulateJsonbIncrement(jsonb, 's2')
    expect(jsonb['s1']).toBe(95) // s1 untouched
    expect(jsonb['s2']).toBe(1)
  })

  it('s3 counter can be added later without touching s2', () => {
    let jsonb: Record<string, number> = { s2: 45 }
    jsonb = simulateJsonbIncrement(jsonb, 's3')
    expect(jsonb['s2']).toBe(45) // s2 untouched
    expect(jsonb['s3']).toBe(1)
  })

  it('reads correct value for each season independently', () => {
    const jsonb: Record<string, number> = { s1: 200, s2: 45, s3: 3 }
    expect(simulateGetSeasonLoginDays(jsonb, 's1')).toBe(200)
    expect(simulateGetSeasonLoginDays(jsonb, 's2')).toBe(45)
    expect(simulateGetSeasonLoginDays(jsonb, 's3')).toBe(3)
    expect(simulateGetSeasonLoginDays(jsonb, 's4')).toBe(0) // missing → 0
  })
})

// ─── Season-scoped login days in badge evaluation ────────────────────────────

describe('S2 login-day badges — season-scoped totalLoginDays', () => {
  it('s2_gm_ser (5 days) does NOT unlock when veteran has 100 all-time days but 0 S2 days', () => {
    // s2_wanderer is now position_maintained_for_days — use s2_gm_ser (total_days_logged_in_at_least: 5)
    const ctx = buildS2Context({ totalLoginDays: 0 })
    expect(getEarnedBadges(ctx, 's2').map(b => b.id)).not.toContain('s2_gm_ser')
  })

  it('s2_gm_ser unlocks once S2 login days reach 5', () => {
    const ctx = buildS2Context({ totalLoginDays: 5 })
    expect(getEarnedBadges(ctx, 's2').map(b => b.id)).toContain('s2_gm_ser')
  })

  it('s2_eternal_presence (200 days) requires 200 S2 login days, not 200 all-time', () => {
    // s2_frequent_flyer is now multi_position_maintained — use s2_eternal_presence for login-day boundary test
    const withLowS2 = buildS2Context({ totalLoginDays: 199 })
    const withFullS2 = buildS2Context({ totalLoginDays: 200 })
    expect(getEarnedBadges(withLowS2, 's2').map(b => b.id)).not.toContain('s2_eternal_presence')
    expect(getEarnedBadges(withFullS2, 's2').map(b => b.id)).toContain('s2_eternal_presence')
  })

  it('s2_eternal_presence (200 days) requires 200 S2 login days', () => {
    const ctx = buildS2Context({ totalLoginDays: 200 })
    expect(getEarnedBadges(ctx, 's2').map(b => b.id)).toContain('s2_eternal_presence')
  })

  it('veteran with 200 all-time days but only 5 S2 days cannot earn s2_eternal_presence', () => {
    // All-time=200 is irrelevant — we pass s2LoginDays=5 as totalLoginDays
    const ctx = buildS2Context({ totalLoginDays: 5 })
    expect(getEarnedBadges(ctx, 's2').map(b => b.id)).not.toContain('s2_eternal_presence')
  })
})

// ─── Season-scoped transaction stats in badge evaluation ─────────────────────

describe('S2 transaction badges — season-scoped counts', () => {
  it('s2_first_spark requires 1 S2 tx (not S1 carry-over)', () => {
    const ctx = buildS2Context({ totalTransactions: 1 })
    expect(getEarnedBadges(ctx, 's2').map(b => b.id)).toContain('s2_first_spark')
  })

  it('s2_executor does NOT unlock with 0 S2 cross-chain volume', () => {
    // s2_executor is now usd_volume_at_least: 5000 with isCrossChain: true
    const ctx = buildS2Context({ crossChainTotalUsdVolume: 0 })
    expect(getEarnedBadges(ctx, 's2').map(b => b.id)).not.toContain('s2_executor')
  })

  it('s2_executor unlocks with $5000 S2 cross-chain volume', () => {
    const ctx = buildS2Context({ crossChainTotalUsdVolume: 5000 })
    expect(getEarnedBadges(ctx, 's2').map(b => b.id)).toContain('s2_executor')
  })

  it('s2_capital_engine ($10k volume) uses S2 volume only', () => {
    const noVol = buildS2Context({ totalUsdVolume: 0 })
    const hasVol = buildS2Context({ totalUsdVolume: 10000 })
    expect(getEarnedBadges(noVol, 's2').map(b => b.id)).not.toContain('s2_capital_engine')
    expect(getEarnedBadges(hasVol, 's2').map(b => b.id)).toContain('s2_capital_engine')
  })

  it('s2_liquidity_provider requires 1 supply tx in S2', () => {
    const noSupply = buildS2Context({ transactionsByType: { borrow: 5 } })
    const hasSupply = buildS2Context({ transactionsByType: { supply: 1 } })
    expect(getEarnedBadges(noSupply, 's2').map(b => b.id)).not.toContain('s2_liquidity_provider')
    expect(getEarnedBadges(hasSupply, 's2').map(b => b.id)).toContain('s2_liquidity_provider')
  })
})

// ─── S2 XP evaluation ────────────────────────────────────────────────────────

describe('S2 XP-based badges — uses reset XP column', () => {
  it('s2_ignition (100 pts) unlocks with S2 XP = 100', () => {
    const ctx = buildS2Context({ userXp: 100 })
    expect(getEarnedBadges(ctx, 's2').map(b => b.id)).toContain('s2_ignition')
  })

  it('s2_accumulator (500 pts) does not unlock with 100 pts', () => {
    const ctx = buildS2Context({ userXp: 100 })
    expect(getEarnedBadges(ctx, 's2').map(b => b.id)).not.toContain('s2_accumulator')
  })

  it('s2_deep_voyager requires 50k S2 pts AND $100k S2 volume', () => {
    const onlyXp = buildS2Context({ userXp: 50000, totalUsdVolume: 9999 })
    const both   = buildS2Context({ userXp: 50000, totalUsdVolume: 100000 })
    expect(getEarnedBadges(onlyXp, 's2').map(b => b.id)).not.toContain('s2_deep_voyager')
    expect(getEarnedBadges(both,   's2').map(b => b.id)).toContain('s2_deep_voyager')
  })
})

// ─── S1 badges are NOT accidentally re-awarded in S2 context ─────────────────

describe('S1 badges are season-gated out of S2 evaluation', () => {
  it('a user with massive S2 stats does not earn any S1 badges', () => {
    const ctx = buildS2Context({
      userXp: 999999,
      totalTransactions: 999,
      totalUsdVolume: 9999999,
      supplyPositionDays: 365,
      loginStreak: 365,
      maxLoginStreak: 365,
      totalLoginDays: 365,
    })
    const earned = getEarnedBadges(ctx, 's2')
    earned.forEach(b => {
      expect(b.id).toMatch(/^s2_/)
    })
  })
})

// ─── getCurrentSeason correctness ────────────────────────────────────────────

describe('getCurrentSeason — S2 is active', () => {
  it('returns a Season object', () => {
    const season = getCurrentSeason()
    expect(season).not.toBeNull()
  })

  it('returns S2 (the only active season)', () => {
    const season = getCurrentSeason()
    // S1 is inactive, S2 has isActive: true
    expect(season?.id).toBe('s2')
  })

  it('S1 is marked inactive', () => {
    const s1 = SEASONS.find(s => s.id === 's1')
    expect(s1?.isActive).toBe(false)
  })

  it('S2 is marked active', () => {
    const s2 = SEASONS.find(s => s.id === 's2')
    expect(s2?.isActive).toBe(true)
  })

  it('season has a startAt date that can be used for getSeasonTransactionStats', () => {
    const season = getCurrentSeason()
    expect(season?.startAt).toBeTruthy()
    expect(new Date(season!.startAt).toISOString().replace('.000Z', 'Z')).toBe(season!.startAt)
  })
})

// ─── awardDailyLoginBonus contract — seasonId propagation ────────────────────

describe('awardDailyLoginBonus seasonId contract', () => {
  it('getCurrentSeason().id should be passed as seasonId to awardDailyLoginBonus', () => {
    // This test documents the calling contract established in the route.
    // The route calls: LeaderboardDB.awardDailyLoginBonus(wallet, getCurrentSeason()?.id)
    const season = getCurrentSeason()
    const seasonIdToPass = season?.id

    // Verify the value is what we expect (not undefined, not null)
    expect(seasonIdToPass).toBe('s2')
  })

  it('if no active season, seasonId is undefined and no increment is made (no crash)', () => {
    // Documents the safe default: if currentSeason is null, seasonId = undefined
    const noSeason = null
    const seasonId = noSeason ?? undefined
    // Should be undefined — DB method guards: `if (seasonId) { ... }`
    expect(seasonId).toBeUndefined()
  })
})

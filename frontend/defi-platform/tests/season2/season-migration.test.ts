/**
 * Season 2 Migration Tests
 *
 * Covers:
 * 1. badges.json structure & integrity
 * 2. Season-gating: S1 badges only evaluated in S1 context, S2 only in S2
 * 3. Earned S1 badges survive into S2 (stored in excludeIds / merged list)
 * 4. Season-scoped login day evaluation (pass s2LoginDays as totalLoginDays)
 * 5. S2 color/emoji palette — new colors are NOT in S1 list
 * 6. getEarnedBadges, getMergedEarnedBadges, deriveDisplayFromProfile cross-season
 * 7. Snapshot SQL logic (dry-run via archive table JSONB operations)
 */

import { describe, it, expect } from 'vitest'
import {
  getAllBadges,
  getEarnedBadges,
  getMergedEarnedBadges,
  getBadgesByIds,
  deriveDisplayFromProfile,
  ALLOWED_BORDER_COLORS,
  ALLOWED_NAME_EMOJIS,
  type Badge,
  type AchievementContext,
} from '@/lib/achievements'

// ─── Helpers ────────────────────────────────────────────────────────────────

const s1Badges = () => getAllBadges().filter(b => b.seasonIds?.includes('s1'))
const s2Badges = () => getAllBadges().filter(b => b.seasonIds?.includes('s2'))

const s2Ctx = (overrides: Partial<AchievementContext> = {}): AchievementContext => ({
  userXp: 0,
  seasonId: 's2',
  totalTransactions: 0,
  totalUsdVolume: 0,
  totalLoginDays: 0,
  loginStreak: 0,
  maxLoginStreak: 0,
  supplyPositionDays: 0,
  ...overrides,
})

// ─── 1. badges.json integrity ───────────────────────────────────────────────

describe('badges.json — S1 integrity', () => {
  it('loads S1 badges', () => {
    expect(s1Badges().length).toBeGreaterThan(0)
  })

  it('all S1 badge IDs start with s1_ (excluding known legacy/test badges)', () => {
    // Known exceptions in badges.json that pre-date the s1_ naming convention
    // or are test-only fixtures. These should not be renamed as badge IDs are
    // stored in user DB records and renaming would require a migration.
    const LEGACY_IDS = new Set([
      'bronze_first_watch',          // old naming, no s1_ prefix
      'test_effective_apy_badge',    // dev fixture
      'test_achievements_completed', // dev fixture
      'test_achievements_completed_gold', // dev fixture
    ])
    s1Badges()
      .filter(b => !LEGACY_IDS.has(b.id))
      .forEach(b => {
        expect(b.id, `S1 badge "${b.id}" should start with s1_`).toMatch(/^s1_/)
      })
  })

  it('no duplicate IDs across entire badge list', () => {
    const ids = getAllBadges().map(b => b.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })

  it('all S1 badges have valid criteria types', () => {
    const validTypes = new Set([
      'xp_at_least', 'login_streak_at_least', 'total_days_logged_in_at_least',
      'transactions_at_least', 'supply_position_days_at_least', 'usd_volume_at_least',
      'position_maintained_for_days', 'multi_position_maintained', 'season_in',
      'distinct_assets_interacted_with', 'achievements_completed_at_least',
      'achievements_completed_all', 'transaction_streak_at_least',
      'effective_apy_at_least', 'total_lifetime_earnings_at_least', 'daily_average_earnings_at_least',
      'leaderboard_rank_at_least',
      // Extended criteria types added during S1 development
      'single_transaction_at_least',
      'complex_transaction_path',
      'cross_chain_repay_different_asset',
      'repay_within_time',
    ])
    s1Badges().forEach(b => {
      b.criteria?.forEach(c => {
        expect(validTypes.has(c.type), `Unknown criteria type "${c.type}" on badge "${b.id}"`).toBe(true)
      })
    })
  })

  it('all badges have required fields', () => {
    getAllBadges().forEach(b => {
      expect(b.id, `Badge missing id`).toBeTruthy()
      expect(b.name, `Badge ${b.id} missing name`).toBeTruthy()
      expect(b.icon, `Badge ${b.id} missing icon`).toBeTruthy()
      expect(['bronze', 'silver', 'gold', 'platinum', 'diamond']).toContain(b.tier)
    })
  })
})

describe('badges.json — S2 integrity', () => {
  it('loads S2 badges', () => {
    expect(s2Badges().length).toBeGreaterThan(0)
  })

  it('all S2 badge IDs start with s2_', () => {
    s2Badges().forEach(b => {
      expect(b.id).toMatch(/^s2_/)
    })
  })

  it('S2 badges cover all five tiers', () => {
    const tiers = new Set(s2Badges().map(b => b.tier))
    expect(tiers.has('bronze')).toBe(true)
    expect(tiers.has('silver')).toBe(true)
    expect(tiers.has('gold')).toBe(true)
    expect(tiers.has('platinum')).toBe(true)
    expect(tiers.has('diamond')).toBe(true)
  })

  it('all S2 badges have seasonIds containing s2', () => {
    s2Badges().forEach(b => {
      expect(b.seasonIds).toContain('s2')
    })
  })

  it('S2 badge IDs do not overlap with S1 badge IDs', () => {
    const s1Ids = new Set(s1Badges().map(b => b.id))
    s2Badges().forEach(b => {
      expect(s1Ids.has(b.id), `Duplicate ID across seasons: ${b.id}`).toBe(false)
    })
  })

  it('all S2 badges have valid criteria types', () => {
    const validTypes = new Set([
      'xp_at_least', 'login_streak_at_least', 'total_days_logged_in_at_least',
      'transactions_at_least', 'supply_position_days_at_least', 'usd_volume_at_least',
      'position_maintained_for_days', 'multi_position_maintained', 'season_in',
      'distinct_assets_interacted_with', 'achievements_completed_at_least',
      'achievements_completed_all', 'transaction_streak_at_least',
      'effective_apy_at_least', 'total_lifetime_earnings_at_least', 'daily_average_earnings_at_least',
      'leaderboard_rank_at_least',
    ])
    s2Badges().forEach(b => {
      b.criteria?.forEach(c => {
        expect(validTypes.has(c.type), `Unknown criteria type "${c.type}" on badge "${b.id}"`).toBe(true)
      })
    })
  })

  it('S2 has exactly one secret badge', () => {
    const secrets = s2Badges().filter(b => b.rarity === 'secret')
    expect(secrets).toHaveLength(1)
    expect(secrets[0].id).toBe('s2_dark_matter')
    expect(secrets[0].hiddenUntilXp).toBe(1000000)
  })

  it('S2 is the only season with a secret badge (S1 has none)', () => {
    // s1_secret_gem was never shipped — S1 has no secret-rarity badge.
    // s2_dark_matter is the sole secret badge across all seasons.
    const s1SecretBadges = s1Badges().filter(b => b.rarity === 'secret')
    const s2SecretBadges = s2Badges().filter(b => b.rarity === 'secret')
    expect(s1SecretBadges).toHaveLength(0)
    expect(s2SecretBadges).toHaveLength(1)
    expect(s2SecretBadges[0].id).toBe('s2_dark_matter')
  })

  it('sortOrders within S2 are unique', () => {
    const orders = s2Badges().map(b => b.sortOrder).filter(Boolean)
    const unique = new Set(orders)
    expect(unique.size).toBe(orders.length)
  })
})

// ─── 2. Season-gating ────────────────────────────────────────────────────────

describe('Season gating — S1 badges not evaluated in S2 context', () => {
  it('getEarnedBadges in S2 context returns only S2 badges', () => {
    const ctx = s2Ctx({ userXp: 999999, totalTransactions: 999, totalUsdVolume: 9999999, supplyPositionDays: 365, loginStreak: 365, maxLoginStreak: 365, totalLoginDays: 365 })
    const earned = getEarnedBadges(ctx, 's2')
    earned.forEach(b => {
      expect(b.seasonIds, `Badge ${b.id} should be gated to s2`).toContain('s2')
      expect(b.seasonIds, `Badge ${b.id} should NOT be awarded in s2`).not.toContain('s1')
    })
  })

  it('getEarnedBadges in S1 context returns only S1 badges', () => {
    const ctx: AchievementContext = {
      userXp: 999999, seasonId: 's1',
      totalTransactions: 999, totalUsdVolume: 9999999,
      supplyPositionDays: 365, loginStreak: 365, maxLoginStreak: 365, totalLoginDays: 365,
    }
    const earned = getEarnedBadges(ctx, 's1')
    earned.forEach(b => {
      expect(b.seasonIds, `Badge ${b.id} should be gated to s1`).toContain('s1')
    })
  })
})

// ─── 3. S1 badges persist into S2 via excludeIds / merged list ───────────────

describe('Cross-season badge persistence', () => {
  const s1EarnedIds = ['s1_bronze_transactionist', 's1_bronze_sentinel', 's1_diamond_hands']

  it('getMergedEarnedBadges returns S1 badges by ID lookup', () => {
    const merged = getMergedEarnedBadges(s1EarnedIds, [])
    const ids = merged.map(b => b.id)
    expect(ids).toContain('s1_bronze_transactionist')
    expect(ids).toContain('s1_bronze_sentinel')
    expect(ids).toContain('s1_diamond_hands')
  })

  it('getMergedEarnedBadges combines S1 stored + S2 newly earned badges', () => {
    const newS2Badges = getEarnedBadges(
      s2Ctx({ totalTransactions: 5, userXp: 100 }),
      's2'
    )
    const merged = getMergedEarnedBadges(s1EarnedIds, newS2Badges)
    const ids = merged.map(b => b.id)
    // S1 IDs should still be present
    expect(ids).toContain('s1_bronze_transactionist')
    // S2 newly earned should also be present (if any were earned)
    newS2Badges.forEach(b => {
      expect(ids).toContain(b.id)
    })
  })

  it('getEarnedBadges with excludeIds skips already-stored S1 badges', () => {
    const ctx = s2Ctx({ userXp: 999999, totalTransactions: 999 })
    const withoutExclude = getEarnedBadges(ctx, 's2')
    const withExclude = getEarnedBadges(ctx, 's2', { excludeIds: withoutExclude.map(b => b.id) })
    expect(withExclude).toHaveLength(0) // all already counted
  })

  it('S1 badge objects are retrievable from the merged list even in S2 season', () => {
    const s1Objs = getBadgesByIds(s1EarnedIds)
    expect(s1Objs).toHaveLength(s1EarnedIds.length)
    s1Objs.forEach(b => expect(b.seasonIds).toContain('s1'))
  })
})

// ─── 4. Season-scoped login day evaluation ───────────────────────────────────

describe('Season-scoped login days (s2LoginDays passed as totalLoginDays)', () => {
  // s2_wanderer is now position_maintained_for_days (not a login-day badge).
  // Use s2_gm_ser (total_days_logged_in_at_least: 5) to test login-day scoping.
  it('s2_gm_ser (5 days) unlocks when seasonLoginDays=5 is passed as totalLoginDays', () => {
    const ctx = s2Ctx({ totalLoginDays: 5 })
    const ids = getEarnedBadges(ctx, 's2').map(b => b.id)
    expect(ids).toContain('s2_gm_ser')
  })

  it('s2_gm_ser does NOT unlock when totalLoginDays=4', () => {
    const ctx = s2Ctx({ totalLoginDays: 4 })
    const ids = getEarnedBadges(ctx, 's2').map(b => b.id)
    expect(ids).not.toContain('s2_gm_ser')
  })

  it('s2_eternal_presence (200 days) unlocks when seasonLoginDays=200 passed as totalLoginDays', () => {
    // s2_frequent_flyer is now multi_position_maintained — use s2_eternal_presence for high login-day test
    const ctx = s2Ctx({ totalLoginDays: 200 })
    const ids = getEarnedBadges(ctx, 's2').map(b => b.id)
    expect(ids).toContain('s2_eternal_presence')
  })

  it('veteran user cannot earn s2_eternal_presence with only 5 S2 login days', () => {
    const ctx = s2Ctx({ totalLoginDays: 5 })
    const ids = getEarnedBadges(ctx, 's2').map(b => b.id)
    expect(ids).not.toContain('s2_eternal_presence')
  })

  it('s2_eternal_presence (200 days) requires 200 season login days', () => {
    const ctxLow = s2Ctx({ totalLoginDays: 150 })
    const ctxHigh = s2Ctx({ totalLoginDays: 200 })
    expect(getEarnedBadges(ctxLow, 's2').map(b => b.id)).not.toContain('s2_eternal_presence')
    expect(getEarnedBadges(ctxHigh, 's2').map(b => b.id)).toContain('s2_eternal_presence')
  })
})

// ─── 5. S2 unlock colors are exclusive (not in S1 allowed list) ──────────────

describe('S2 color palette exclusivity', () => {
  const s2UnlockColors = [
    '#06B6D4',
    '#0EA5E9',
    '#7C3AED',
    '#F97316',
    '#DC2626',
    '#FDE047',
    'linear-gradient(135deg, #7C3AED 0%, #06B6D4 100%)',
  ]

  const s1OnlyColors = [
    '#5e7945',
    '#B3C2A6',
    '#8BA376',
    '#797D62',
    '#CED6C7',
    'linear-gradient(135deg, #5e7945 0%, #CED6C7 100%)',
    '#B9F2FF',
  ]

  it('all S2 exclusive colors are present in ALLOWED_BORDER_COLORS', () => {
    s2UnlockColors.forEach(color => {
      expect(
        ALLOWED_BORDER_COLORS.includes(color),
        `S2 color "${color}" must be in ALLOWED_BORDER_COLORS`
      ).toBe(true)
    })
  })

  it('S2 badge unlockBorderColors are all in ALLOWED_BORDER_COLORS', () => {
    s2Badges().forEach(b => {
      if (b.unlockBorderColor) {
        expect(
          ALLOWED_BORDER_COLORS.includes(b.unlockBorderColor),
          `Badge ${b.id} has unlockBorderColor "${b.unlockBorderColor}" not in allowed list`
        ).toBe(true)
      }
    })
  })

  it('S2 badge unlockBorderColors do NOT use S1-signature colors', () => {
    const s1Signature = new Set(s1OnlyColors)
    s2Badges().forEach(b => {
      if (b.unlockBorderColor) {
        expect(
          s1Signature.has(b.unlockBorderColor),
          `Badge ${b.id} must not use S1 signature color "${b.unlockBorderColor}"`
        ).toBe(false)
      }
    })
  })

  it('S1 badge unlockBorderColors do NOT use S2-exclusive colors', () => {
    const s2Set = new Set(s2UnlockColors)
    s1Badges().forEach(b => {
      if (b.unlockBorderColor) {
        expect(
          s2Set.has(b.unlockBorderColor),
          `S1 badge ${b.id} must not use S2 color "${b.unlockBorderColor}"`
        ).toBe(false)
      }
    })
  })

  it('S2 emojis are present in ALLOWED_NAME_EMOJIS', () => {
    const s2Emojis = ['⚡', '🌊', '🌀', '⛓️', '💫', '🔮', '🌙']
    s2Emojis.forEach(emoji => {
      expect(
        ALLOWED_NAME_EMOJIS.includes(emoji),
        `S2 emoji "${emoji}" must be in ALLOWED_NAME_EMOJIS`
      ).toBe(true)
    })
  })

  it('S2 badge unlockEmojis are all in ALLOWED_NAME_EMOJIS', () => {
    s2Badges().forEach(b => {
      if (b.unlockEmoji) {
        expect(
          ALLOWED_NAME_EMOJIS.includes(b.unlockEmoji),
          `Badge ${b.id} has unlockEmoji "${b.unlockEmoji}" not in ALLOWED_NAME_EMOJIS`
        ).toBe(true)
      }
    })
  })
})

// ─── 6. getEarnedBadges S2 criteria correctness ──────────────────────────────

describe('S2 badge criteria — correct unlock thresholds', () => {
  it('s2_first_spark unlocks on 1 transaction', () => {
    const ctx = s2Ctx({ totalTransactions: 1 })
    expect(getEarnedBadges(ctx, 's2').map(b => b.id)).toContain('s2_first_spark')
  })

  it('s2_liquidity_provider unlocks on 1 supply', () => {
    const ctx = s2Ctx({ transactionsByType: { supply: 1 } })
    expect(getEarnedBadges(ctx, 's2').map(b => b.id)).toContain('s2_liquidity_provider')
  })

  it('s2_leverage_seeker unlocks on 1 borrow', () => {
    const ctx = s2Ctx({ transactionsByType: { borrow: 1 } })
    expect(getEarnedBadges(ctx, 's2').map(b => b.id)).toContain('s2_leverage_seeker')
  })

  it('s2_ignition unlocks at 100 xp, hidden until 50', () => {
    const badge = getAllBadges().find(b => b.id === 's2_ignition')!
    expect(badge.hiddenUntilXp).toBe(50)
    const ctx = s2Ctx({ userXp: 100 })
    expect(getEarnedBadges(ctx, 's2').map(b => b.id)).toContain('s2_ignition')
  })

  it('s2_all_rounder requires all 4 action types', () => {
    const missing = s2Ctx({ transactionsByType: { supply: 1, borrow: 1, repay: 1 } })
    const complete = s2Ctx({ transactionsByType: { supply: 1, borrow: 1, repay: 1, redeem: 1 } })
    expect(getEarnedBadges(missing, 's2').map(b => b.id)).not.toContain('s2_all_rounder')
    expect(getEarnedBadges(complete, 's2').map(b => b.id)).toContain('s2_all_rounder')
  })

  it('s2_vault_keeper requires 14 supply days at $2500+ (position_maintained_for_days)', () => {
    // Badge uses positionMaintainedDaysByThreshold — supplyPositionDays alone is insufficient
    const withThreshold = (days: number) => s2Ctx({
      positionMaintainedDaysByThreshold: { '2500': { supply: days, borrow: 0 } },
    })
    expect(getEarnedBadges(withThreshold(13), 's2').map(b => b.id)).not.toContain('s2_vault_keeper')
    expect(getEarnedBadges(withThreshold(14), 's2').map(b => b.id)).toContain('s2_vault_keeper')
  })

  it('s2_capital_engine requires $10k volume', () => {
    expect(getEarnedBadges(s2Ctx({ totalUsdVolume: 9999 }), 's2').map(b => b.id)).not.toContain('s2_capital_engine')
    expect(getEarnedBadges(s2Ctx({ totalUsdVolume: 10000 }), 's2').map(b => b.id)).toContain('s2_capital_engine')
  })

  it('s2_long_runner requires 30 supply position days (supply_position_days_at_least)', () => {
    expect(getEarnedBadges(s2Ctx({ supplyPositionDays: 29 }), 's2').map(b => b.id)).not.toContain('s2_long_runner')
    expect(getEarnedBadges(s2Ctx({ supplyPositionDays: 30 }), 's2').map(b => b.id)).toContain('s2_long_runner')
  })

  it('s2_ironclad requires 30 supply days', () => {
    expect(getEarnedBadges(s2Ctx({ supplyPositionDays: 29 }), 's2').map(b => b.id)).not.toContain('s2_ironclad')
    expect(getEarnedBadges(s2Ctx({ supplyPositionDays: 30 }), 's2').map(b => b.id)).toContain('s2_ironclad')
  })

  it('s2_deep_voyager requires both 50k xp AND $100k volume', () => {
    const onlyXp = s2Ctx({ userXp: 50000, totalUsdVolume: 50000 })
    const onlyVol = s2Ctx({ userXp: 10000, totalUsdVolume: 100000 })
    const both = s2Ctx({ userXp: 50000, totalUsdVolume: 100000 })
    expect(getEarnedBadges(onlyXp, 's2').map(b => b.id)).not.toContain('s2_deep_voyager')
    expect(getEarnedBadges(onlyVol, 's2').map(b => b.id)).not.toContain('s2_deep_voyager')
    expect(getEarnedBadges(both, 's2').map(b => b.id)).toContain('s2_deep_voyager')
  })

  it('s2_dark_matter (secret) requires 8 supplies AND $888 volume', () => {
    const missing = s2Ctx({ transactionsByType: { supply: 7 }, totalUsdVolume: 888 })
    const full = s2Ctx({ transactionsByType: { supply: 8 }, totalUsdVolume: 888 })
    expect(getEarnedBadges(missing, 's2').map(b => b.id)).not.toContain('s2_dark_matter')
    expect(getEarnedBadges(full, 's2').map(b => b.id)).toContain('s2_dark_matter')
  })
})

// ─── 7. deriveDisplayFromProfile cross-season behavior ───────────────────────

describe('deriveDisplayFromProfile — cross-season display', () => {
  it('selected S1 badge is still displayable in S2 context (cross-season flex)', () => {
    // User earned s1_diamond_hands in S1, wants to display it in S2
    const result = deriveDisplayFromProfile({
      userXp: 100, // S2 XP is low, S1 was high
      seasonId: 's2',
      storedBadgeIds: ['s1_bronze_transactionist', 's1_bronze_sentinel', 's1_diamond_hands'],
      selectedBadgeId: 's1_diamond_hands',
      selectedBorderColor: 'linear-gradient(135deg, #5e7945 0%, #CED6C7 100%)',
    })
    expect(result.displayBadge?.id).toBe('s1_diamond_hands')
    // S1 gradient is still in allowed list so borderColor should resolve
    expect(result.borderColor).toBe('linear-gradient(135deg, #5e7945 0%, #CED6C7 100%)')
  })

  it('best badge from S2 is shown if no S1 badge selected', () => {
    const result = deriveDisplayFromProfile({
      userXp: 500,
      seasonId: 's2',
      storedBadgeIds: [],
      totalTransactions: 100,
      supplyPositionDays: 30,
      totalUsdVolume: 250000,
      loginStreak: 21,
      maxLoginStreak: 21,
    })
    // Should show the highest earned S2 badge
    expect(result.displayBadge?.id).toMatch(/^s2_/)
  })

  it('S1 stored badges contribute to merged earned set', () => {
    const merged = getMergedEarnedBadges(
      ['s1_bronze_transactionist', 's1_bronze_sentinel'],
      getEarnedBadges(s2Ctx({ totalTransactions: 5 }), 's2')
    )
    const ids = merged.map(b => b.id)
    expect(ids).toContain('s1_bronze_transactionist')
    expect(ids).toContain('s1_bronze_sentinel')
  })

  it('nextBadge for a new S2 user with 0 stats points to first S2 badge', () => {
    const result = deriveDisplayFromProfile({
      userXp: 0,
      seasonId: 's2',
      storedBadgeIds: [],
    })
    expect(result.nextBadge?.id).toMatch(/^s2_/)
  })
})

// ─── 8. Snapshot SQL data shape (unit-level dry run) ────────────────────────

describe('Season archive data shape', () => {
  it('badge_ids array from user profiles is a string array', () => {
    // Simulates what the SQL step does: extract badge IDs from the earned array
    const badgesField = { earned: ['s1_bronze_transactionist', 's1_bronze_sentinel', 's1_diamond_hands'], selected: {} }
    const earnedArray: string[] = badgesField.earned
    expect(Array.isArray(earnedArray)).toBe(true)
    earnedArray.forEach(id => expect(typeof id).toBe('string'))
  })

  it('season_login_days JSONB key increment works correctly (JS simulation)', () => {
    // Simulates jsonb_set(season_login_days, '{s2}', (COALESCE(...) + 1)::jsonb)
    const current: Record<string, number> = {}
    const s2Key = 's2'
    current[s2Key] = (current[s2Key] ?? 0) + 1
    expect(current['s2']).toBe(1)
    current[s2Key] = (current[s2Key] ?? 0) + 1
    expect(current['s2']).toBe(2)
  })

  it('season archive row has all expected fields', () => {
    type ArchiveRow = {
      wallet_address: string
      season_id: string
      final_points: number
      final_rank: number | null
      supply_count: number
      borrow_count: number
      repay_count: number
      redeem_count: number
      total_login_days: number
      badge_ids: string[]
    }
    const row: ArchiveRow = {
      wallet_address: '0xabc',
      season_id: 's1',
      final_points: 14230,
      final_rank: 42,
      supply_count: 10,
      borrow_count: 5,
      repay_count: 3,
      redeem_count: 2,
      total_login_days: 90,
      badge_ids: ['s1_bronze_transactionist', 's1_bronze_sentinel'],
    }
    expect(row.season_id).toBe('s1')
    expect(row.badge_ids).toContain('s1_bronze_transactionist')
    expect(row.final_rank).toBe(42)
  })
})

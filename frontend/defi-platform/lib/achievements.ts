// Centralized achievements, badges, and seasons configuration and helpers
// Note: "points" (pts) are equivalent to what was previously called "XP".
// eslint-disable-next-line @typescript-eslint/no-var-requires
import badgesJson from '@/data/badges.json'

export type Season = {
  id: string
  name: string
  startAt: string // ISO string
  endAt: string // ISO string
  isActive?: boolean
}

export type AchievementCriteria =
  | { type: 'xp_at_least'; value: number }
  | { type: 'login_streak_at_least'; days: number }
  | { type: 'total_days_logged_in_at_least'; days: number }
  | { type: 'transactions_at_least'; count: number; actionTypes?: ('supply' | 'borrow' | 'repay' | 'redeem')[]; isCrossChain?: boolean }
  | { type: 'supply_position_days_at_least'; days: number }
  | { type: 'usd_volume_at_least'; amount: number; isCrossChain?: boolean }
  | { type: 'season_in'; seasonIds: string[] }
  | { type: 'position_maintained_for_days'; days: number; positionType: 'supply' | 'borrow' | 'any'; minUsdValue?: number }
  | { type: 'multi_position_maintained'; positionCount: number; minUsdValuePerPosition: number; days: number; positionType: 'supply' | 'borrow'; requiredChainIds?: number[] }
  | { type: 'distinct_assets_interacted_with'; count: number; actionTypes: ('supply' | 'borrow')[]; assetCategory: 'stablecoin' | 'blue_chip' }
  | { type: 'transaction_streak_at_least'; days: number }
  | { type: 'effective_apy_at_least'; value: number } // Effective APY percentage (e.g., 5 for 5%)
  | { type: 'total_lifetime_earnings_at_least'; amount: number } // Total lifetime earnings in USD
  | { type: 'daily_average_earnings_at_least'; amount: number } // Daily average earnings in USD
  // ===== Leaderboard & Meta =====
  | { type: 'leaderboard_rank_at_least'; board: 'liquidator_volume_usd' | 'total_volume_usd'; rank: number; withinSeason: boolean }
  | { type: 'achievements_completed_at_least'; count: number; tier?: 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Diamond'; pathId?: string }
  | { type: 'achievements_completed_all'; achievementIds: string[] }



export type Badge = {
  // A "badge" represents an achievement (unlocked by meeting criteria). Not a rank tier.
  id: string
  name: string
  description: string
  icon: string // representative icon for the achievement card
  // Visual unlocks granted by this achievement (optional)
  unlockBorderColor?: string
  unlockEmoji?: string
  // Sorting and visibility
  tier: 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond'
  sortOrder?: number
  // Legacy/simple gating
  xpThreshold?: number
  // Explicit criteria (all must be satisfied). If present, takes precedence over xpThreshold-only checks
  criteria?: AchievementCriteria[]
  // Seasonal availability
  seasonIds?: string[]
  rarity?: 'common' | 'uncommon' | 'rare' | 'superrare' | 'legendary' | 'secret'
  hiddenUntilXp?: number
  // New: sub-track within a badge family (e.g., L1/L2 variants)
  subTier?: string
  // New: points awarded upon first unlock of this badge
  pointsReward?: number
  // Surface-specific gating: if false, do not allow this badge to be used for leaderboard display flexing
  allowLeaderboardDisplay?: boolean
}

export const SEASONS: Season[] = [
  {
    id: 's1',
    name: 'Season 1',
    startAt: '2025-09-12T00:00:00Z',
    endAt: '2025-12-25T23:59:59Z',
    isActive: false,
  },
  {
    id: 's2',
    name: 'Season 2',
    startAt: '2026-03-17T00:00:00Z',
    endAt: '2026-10-31T23:59:59Z',
    isActive: true,
  },
]

export const BADGES: Badge[] = (badgesJson as Badge[]).length > 0 ? (badgesJson as Badge[]) : [
    // --- Bronze Tier (Onboarding & First Actions) ---
    {
        id: 's1_initiate',
        name: 'Initiate',
        description: "Make your first transaction on Peridot.",
        icon: '🎯',
        tier: 'bronze',
        criteria: [{ type: 'transactions_at_least', count: 1 }],
        seasonIds: ['s1'],
        rarity: 'common',
        sortOrder: 10,
    },
    {
        id: 's1_depositor',
        name: 'Depositor',
        description: "Supply any amount of assets for the first time.",
        icon: '📥',
        tier: 'bronze',
        criteria: [{ type: 'transactions_at_least', count: 1, actionTypes: ['supply'] }],
        seasonIds: ['s1'],
        rarity: 'common',
        sortOrder: 20,
    },
    {
        id: 's1_borrower',
        name: 'Borrower',
        description: "Borrow any amount of assets for the first time.",
        icon: '📤',
        tier: 'bronze',
        criteria: [{ type: 'transactions_at_least', count: 1, actionTypes: ['borrow'] }],
        seasonIds: ['s1'],
        rarity: 'common',
        sortOrder: 25,
    },
    {
        id: 's1_hatchling',
        name: 'Hatchling',
        description: "Earn your first 100 points.",
        icon: '🥚',
        tier: 'bronze',
        criteria: [{ type: 'xp_at_least', value: 100 }],
        seasonIds: ['s1'],
        rarity: 'common',
        hiddenUntilXp: 50,
        sortOrder: 30,
        unlockEmoji: '🥚',
    },

    // --- Silver Tier (Consistent Engagement) ---
    {
        id: 's1_weekender',
        name: 'Weekender',
        description: "Log in on 3 separate days.",
        icon: '🗓️',
        tier: 'silver',
        criteria: [{ type: 'total_days_logged_in_at_least', days: 3 }],
        seasonIds: ['s1'],
        rarity: 'common',
        unlockEmoji: '✨',
        unlockBorderColor: '#5e7945',
        sortOrder: 100,
    },
    {
        id: 's1_regular_visitor',
        name: 'Regular Visitor',
        description: "Log in on 60 separate days.",
        icon: '📅',
        tier: 'gold',
        criteria: [{ type: 'total_days_logged_in_at_least', days: 60 }],
        seasonIds: ['s1'],
        rarity: 'rare',
        sortOrder: 215,
    },
    {
        id: 's1_centennial_login',
        name: 'Centennial',
        description: "Log in on 100 separate days.",
        icon: '💯',
        tier: 'platinum',
        criteria: [{ type: 'total_days_logged_in_at_least', days: 100 }],
        seasonIds: ['s1'],
        rarity: 'superrare',
        unlockEmoji: '💯',
        sortOrder: 315,
    },
    {
        id: 's1_year_of_peridot',
        name: 'Year of Peridot',
        description: "Log in on 200 separate days.",
        icon: '🌍',
        tier: 'diamond',
        criteria: [{ type: 'total_days_logged_in_at_least', days: 200 }],
        seasonIds: ['s1'],
        rarity: 'legendary',
        unlockBorderColor: '#B9F2FF',
        sortOrder: 415,
    },
    {
        id: 's1_high_five',
        name: 'High Five',
        description: "Complete 5 total transactions.",
        icon: '🖐️',
        tier: 'silver',
        criteria: [{ type: 'transactions_at_least', count: 5 }],
        seasonIds: ['s1'],
        rarity: 'common',
        unlockBorderColor: '#B3C2A6', // Celadon Green
        sortOrder: 110,
    },
    {
        id: 's1_steady_hand',
        name: 'Steady Hand',
        description: "Maintain a supply position for 7 consecutive days.",
        icon: '🧘',
        tier: 'silver',
        criteria: [{ type: 'supply_position_days_at_least', days: 7 }],
        seasonIds: ['s1'],
        rarity: 'uncommon',
        sortOrder: 115,
    },
    {
        id: 's1_collector',
        name: 'Collector',
        description: "Accrue 500 points.",
        icon: '🪙',
        tier: 'silver',
        criteria: [{ type: 'xp_at_least', value: 500 }],
        seasonIds: ['s1'],
        rarity: 'common',
        sortOrder: 120,
    },
    {
        id: 's1_polymath',
        name: 'Polymath',
        description: "Perform a supply, borrow, repay, and redeem action.",
        icon: '⚗️',
        tier: 'silver',
        criteria: [
            { type: 'transactions_at_least', count: 1, actionTypes: ['supply'] },
            { type: 'transactions_at_least', count: 1, actionTypes: ['borrow'] },
            { type: 'transactions_at_least', count: 1, actionTypes: ['repay'] },
            { type: 'transactions_at_least', count: 1, actionTypes: ['redeem'] },
        ],
        seasonIds: ['s1'],
        rarity: 'uncommon',
        sortOrder: 130,
    },

    // --- Gold Tier (Strategic & High-Volume Actions) ---
    {
        id: 's1_loyalist',
        name: 'Loyalist',
        description: "Maintain a supply position for 14 consecutive days.",
        icon: '🛡️',
        tier: 'gold',
        criteria: [{ type: 'supply_position_days_at_least', days: 14 }],
        seasonIds: ['s1'],
        rarity: 'uncommon',
        unlockBorderColor: '#8BA376', // Sage Green
        sortOrder: 200,
    },
    {
        id: 's1_power_user',
        name: 'Power User',
        description: "Complete 25 total transactions.",
        icon: '⚡',
        tier: 'gold',
        criteria: [{ type: 'transactions_at_least', count: 25 }],
        seasonIds: ['s1'],
        rarity: 'rare',
        unlockEmoji: '🔗',
        sortOrder: 210,
    },
    {
        id: 's1_artisan',
        name: 'Artisan',
        description: 'Complete 50 total transactions.',
        icon: '🛠️',
        tier: 'gold',
        criteria: [{ type: 'transactions_at_least', count: 50 }],
        seasonIds: ['s1'],
        rarity: 'rare',
        sortOrder: 215,
    },
    {
        id: 's1_heavy_lifter',
        name: 'Heavy Lifter',
        description: "Reach a total supply or borrow volume of $10,000.",
        icon: '🏋️',
        tier: 'gold',
        criteria: [{ type: 'usd_volume_at_least', amount: 10000 }],
        seasonIds: ['s1'],
        rarity: 'rare',
        unlockBorderColor: '#797D62', // Olive Drab
        sortOrder: 220,
    },
    {
        id: 's1_marathon',
        name: 'Marathon',
        description: "Achieve a 14-day login streak.",
        icon: '🏃',
        tier: 'gold',
        criteria: [{ type: 'login_streak_at_least', days: 14 }],
        seasonIds: ['s1'],
        rarity: 'rare',
        sortOrder: 230,
    },
    
    // --- Platinum Tier (Mastery & Dedication) ---
    {
        id: 's1_diamond_hands',
        name: 'Diamond Hands',
        description: "Maintain a supply position for 30 consecutive days.",
        icon: '💎',
        tier: 'platinum',
        criteria: [{ type: 'supply_position_days_at_least', days: 30 }],
        seasonIds: ['s1'],
        rarity: 'superrare',
        unlockEmoji: '💎',
        unlockBorderColor: '#CED6C7', // Geyser
        sortOrder: 300,
    },
    {
        id: 's1_firestarter',
        name: 'Firestarter',
        description: "Achieve a 7-day login streak.",
        icon: '🔥',
        tier: 'platinum',
        criteria: [{ type: 'login_streak_at_least', days: 7 }],
        seasonIds: ['s1'],
        rarity: 'rare',
        unlockEmoji: '🔥',
        sortOrder: 310,
    },
    {
        id: 's1_centurion',
        name: 'Centurion',
        description: "Complete 100 total transactions.",
        icon: '💯',
        tier: 'platinum',
        criteria: [{ type: 'transactions_at_least', count: 100 }],
        seasonIds: ['s1'],
        rarity: 'superrare',
        sortOrder: 320,
    },
    {
        id: 's1_magnate',
        name: 'Magnate',
        description: "Reach $250,000 in total volume.",
        icon: '💼',
        tier: 'platinum',
        criteria: [{ type: 'usd_volume_at_least', amount: 250000 }],
        seasonIds: ['s1'],
        rarity: 'superrare',
        sortOrder: 330,
    },
    {
        id: 's1_eternal_flame',
        name: 'Eternal Flame',
        description: "Achieve a 21-day login streak.",
        icon: '🔥',
        tier: 'platinum',
        criteria: [{ type: 'login_streak_at_least', days: 21 }],
        seasonIds: ['s1'],
        rarity: 'superrare',
        sortOrder: 340,
    },

    // --- Diamond Tier (Season 1 Pinnacle) ---
    {
        id: 's1_grandmaster',
        name: 'Grandmaster',
        description: "Complete 250 total transactions.",
        icon: '🥋',
        tier: 'diamond',
        criteria: [{ type: 'transactions_at_least', count: 250 }],
        seasonIds: ['s1'],
        rarity: 'legendary',
        sortOrder: 400,
    },
    {
        id: 's1_rock_solid',
        name: 'Rock Solid',
        description: "Maintain a supply position for 60 consecutive days.",
        icon: '🗿',
        tier: 'diamond',
        criteria: [{ type: 'supply_position_days_at_least', days: 60 }],
        seasonIds: ['s1'],
        rarity: 'legendary',
        sortOrder: 410,
    },
    {
        id: 's1_genesis_voyager',
        name: 'Genesis Voyager',
        description: "A true pioneer of the first season.",
        icon: '🌌',
        tier: 'diamond',
        criteria: [
            { type: 'xp_at_least', value: 50000 },
            { type: 'usd_volume_at_least', amount: 100000 },
        ],
        seasonIds: ['s1'],
        rarity: 'legendary',
        unlockEmoji: '🚀',
        unlockBorderColor: 'linear-gradient(135deg, #5e7945 0%, #CED6C7 100%)',
        sortOrder: 420,
    },

    // --- Secret/Hidden Badge ---
    {
        id: 's1_secret_gem',
        name: 'Gemologist',
        description: "???",
        icon: '🤫',
        tier: 'diamond',
        criteria: [
            { type: 'transactions_at_least', count: 1, actionTypes: ['redeem'] },
            { type: 'usd_volume_at_least', amount: 777},
        ],
        seasonIds: ['s1'],
        rarity: 'secret',
        hiddenUntilXp: 1000000,
        sortOrder: 500,
    }
];

export function getAllBadges(): Badge[] {
  return BADGES
}

export const ALLOWED_BORDER_COLORS: string[] = [
  // --- Season 1 colors (kept permanently — users who unlocked them retain access) ---
  '#B9F2FF', // Diamond
  '#E5E4E2', // Platinum
  '#FFD700', // Gold
  '#A9A9A9', // Gray
  '#C0C0C0', // Silver
  '#CD7F32', // Bronze
  '#8BA376', // Sage Green
  '#5e7945', // Season 1 Green (S1 signature)
  '#F472B6', // Pink
  '#9CA3AF', // Gray
  '#60A5FA', // Blue
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#A78BFA', // Violet
  '#B3C2A6', // Celadon Green
  '#797D62', // Olive Drab
  '#CED6C7', // Geyser (Light Gray-Green)
  'linear-gradient(135deg, #5e7945 0%, #CED6C7 100%)', // S1 special gradient
  // --- Season 2 exclusive colors (unlocked via S2 badge achievements) ---
  '#06B6D4', // Cosmic Cyan   — S2 signature color
  '#0EA5E9', // Sky Blue       — S2 early access
  '#7C3AED', // Vivid Violet   — S2 mid-tier
  '#F97316', // Solar Orange   — S2 high-tier
  '#DC2626', // Power Red      — S2 platinum-tier
  '#FDE047', // Star Gold      — S2 diamond login badge
  'linear-gradient(135deg, #7C3AED 0%, #06B6D4 100%)', // S2 special gradient
  // --- Season 2 new badge unlocks ---
  '#52B788', // Forest Green  — Sparfuchs (DE)
  '#009C3B', // Brazil Green  — Samba Rhythm (BR)
  '#FF4500', // Degen Orange  — Degen OG
  '#7F1D1D', // Crimson Grind — The Grind
  '#F59E0B', // Amber          — Quad Runner (bronze)
  '#A78BFA', // Violet         — Quad Master (silver)
]

export const ALLOWED_NAME_EMOJIS: string[] = [
  // Season 1 emojis
  '🥉', '⚔️', '🌌', '💸', '🔁', '🥈', '🟡', '🏆', '⚪', '🛡️',
  '🥚', '🔵', '🟢', '🟠', '✨', '🚀', '🎯', '💎', '🔥', '🔗', 'चक्र',
  // Season 2 emojis
  '⚡', '🌊', '🌀', '⛓️', '💫', '🔮', '🌙',
  // Season 2 new badge unlocks
  '🔄', '🔧', '🦍', '⚙️', '🔥', '💎',
]

export function getCurrentSeason(): Season | null {
  const now = new Date()
  for (const s of SEASONS) {
    const start = new Date(s.startAt)
    const end = new Date(s.endAt)
    if (now >= start && now <= end) return s
  }
  return SEASONS.find(s => s.isActive) || null
}

export function isSeasonAllowed(badge: Badge, seasonId?: string | null): boolean {
  if (!badge.seasonIds || badge.seasonIds.length === 0) return true
  if (!seasonId) return true
  return badge.seasonIds.includes(seasonId)
}

export type AchievementContext = {
  userXp: number // points (pts)
  loginStreak?: number // Current streak ending today
  maxLoginStreak?: number // Maximum historical streak ever achieved
  totalLoginDays?: number // Total unique days logged in
  transactionStreak?: number
  totalTransactions?: number
  transactionsByType?: Partial<Record<'supply' | 'borrow' | 'repay' | 'redeem', number>>
  crossChainTotalTransactions?: number
  crossChainTransactionsByType?: Partial<Record<'supply' | 'borrow' | 'repay' | 'redeem', number>>
  supplyPositionDays?: number
  positionMaintainedDays?: Partial<Record<'supply' | 'borrow' | 'any', number>>
  positionMaintainedDaysByThreshold?: Record<string, Partial<Record<'supply' | 'borrow' | 'any', number>>>
  distinctStablecoinSuppliedCount?: number
  distinctBlueChipSuppliedCount?: number
  distinctStablecoinsSuppliedOrBorrowedCount?: number
  completedAchievementsCount?: number
  completedAchievementsByTier?: Partial<Record<'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond', number>>
  multiPositionMaintained?: Record<string, number>
  totalUsdVolume?: number
  crossChainTotalUsdVolume?: number
  effectiveApy?: number // Effective APY percentage (e.g., 5.5 for 5.5%)
  totalLifetimeEarnings?: number // Total lifetime earnings in USD
  dailyAverageEarnings?: number // Daily average earnings in USD
  seasonId?: string | null
  // The set of achievements already earned within this evaluation pass (or from storage) for meta-criteria checks
  earnedAchievementIds?: Set<string>
}

function meetsCriteria(badge: Badge, ctx: AchievementContext): boolean {
  if (!isSeasonAllowed(badge, ctx.seasonId || getCurrentSeason()?.id)) return false
  const criteria = badge.criteria
  if (criteria && criteria.length > 0) {
    return criteria.every(c => {
      switch (c.type) {
        case 'xp_at_least':
          return (ctx.userXp || 0) >= c.value
        case 'login_streak_at_least':
          // Use maxLoginStreak if available (historical check), otherwise fall back to current loginStreak
          const streakToCheck = ctx.maxLoginStreak !== undefined ? ctx.maxLoginStreak : (ctx.loginStreak || 0)
          return streakToCheck >= c.days
        case 'total_days_logged_in_at_least':
          return (ctx.totalLoginDays || 0) >= c.days
        case 'transaction_streak_at_least':
          return (ctx.transactionStreak || 0) >= c.days
        case 'transactions_at_least': {
          const useCross = !!c.isCrossChain
          if (c.actionTypes && c.actionTypes.length > 0) {
            const byType = useCross ? (ctx.crossChainTransactionsByType || {}) : (ctx.transactionsByType || {})
            const sum = c.actionTypes.reduce((acc, t) => acc + (byType[t] || 0), 0)
            return sum >= c.count
          }
          const total = useCross ? (ctx.crossChainTotalTransactions || 0) : (ctx.totalTransactions || 0)
          return total >= c.count
        }
        case 'supply_position_days_at_least':
          return (ctx.supplyPositionDays || 0) >= c.days
        case 'position_maintained_for_days': {
          let byType = ctx.positionMaintainedDays || {}
          let hasThresholdData = false

          if (typeof c.minUsdValue === 'number' && ctx.positionMaintainedDaysByThreshold) {
            const key = String(c.minUsdValue)
            if (ctx.positionMaintainedDaysByThreshold[key] !== undefined) {
              byType = ctx.positionMaintainedDaysByThreshold[key]!
              hasThresholdData = true
            }
          }

          if (c.positionType === 'supply') {
            // If this badge requires a specific USD threshold, we MUST have threshold data to evaluate it
            if (typeof c.minUsdValue === 'number' && !hasThresholdData) {
              return false // Cannot evaluate threshold requirement without threshold data
            }
            // Use available data - no fallback to non-threshold data for threshold badges
            const supplyDays = byType.supply ?? 0
            return supplyDays >= c.days
          }
          if (c.positionType === 'borrow') {
            // Same logic for borrow positions
            if (typeof c.minUsdValue === 'number' && !hasThresholdData) {
              return false
            }
            const borrowDays = byType.borrow ?? 0
            return borrowDays >= c.days
          }
          // For 'any' position type
          if (typeof c.minUsdValue === 'number' && !hasThresholdData) {
            return false
          }
          const anyDays = byType.any ?? Math.max(byType.supply || 0, byType.borrow || 0)
          return anyDays >= c.days
        }
        case 'usd_volume_at_least': {
          const useCross = !!c.isCrossChain
          const vol = useCross ? (ctx.crossChainTotalUsdVolume || 0) : (ctx.totalUsdVolume || 0)
          return vol >= c.amount
        }
        case 'season_in':
          return c.seasonIds.includes(ctx.seasonId || getCurrentSeason()?.id || '')
        case 'distinct_assets_interacted_with': {
          // Check if both supply AND borrow are required
          if (c.assetCategory === 'stablecoin' &&
              c.actionTypes?.includes('supply') &&
              c.actionTypes?.includes('borrow')) {
            return (ctx.distinctStablecoinsSuppliedOrBorrowedCount || 0) >= c.count
          }
          // Fallback to original supply-only logic for single-action badges
          if (c.assetCategory === 'stablecoin' && c.actionTypes?.includes('supply')) {
            return (ctx.distinctStablecoinSuppliedCount || 0) >= c.count
          }
          if (c.assetCategory === 'blue_chip' && c.actionTypes?.includes('supply')) {
            return (ctx.distinctBlueChipSuppliedCount || 0) >= c.count
          }
          return false
        }
        case 'achievements_completed_at_least': {
          if (c.tier) {
            const byTier = ctx.completedAchievementsByTier || {}
            const tierKey = c.tier.toLowerCase() as keyof NonNullable<typeof byTier>
            return (byTier[tierKey] || 0) >= c.count
          }
          return (ctx.completedAchievementsCount || 0) >= c.count
        }
        case 'achievements_completed_all': {
          const earned = ctx.earnedAchievementIds
          if (!earned || earned.size === 0) return false
          return c.achievementIds.every(id => earned.has(id))
        }
        case 'multi_position_maintained': {
          const chainIdsKey = c.requiredChainIds ? `:${c.requiredChainIds.sort().join(',')}` : ''
          const key = `${c.positionType}:${c.minUsdValuePerPosition}:${c.positionCount}${chainIdsKey}`
          return (ctx.multiPositionMaintained?.[key] || 0) >= c.days
        }
        case 'effective_apy_at_least':
          return (ctx.effectiveApy || 0) >= c.value
        case 'total_lifetime_earnings_at_least':
          return (ctx.totalLifetimeEarnings || 0) >= c.amount
        case 'daily_average_earnings_at_least':
          return (ctx.dailyAverageEarnings || 0) >= c.amount
        default:
          return false
      }
    })
  }
  // Fallback to legacy xpThreshold if no explicit criteria
  if (typeof badge.xpThreshold === 'number') {
    return (ctx.userXp || 0) >= badge.xpThreshold
  }
  return false
}

export type GetEarnedBadgesOptions = {
  // IDs of badges already permanently stored - skip calculating these
  excludeIds?: string[]
  // For meta-achievement counting: include stored badge count in completedAchievementsCount
  storedBadgeCount?: number
  storedBadgesByTier?: Partial<Record<'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond', number>>
}

export function getEarnedBadges(
  userXpOrCtx: number | AchievementContext, 
  seasonId?: string | null,
  options?: GetEarnedBadgesOptions
): Badge[] {
  const baseCtx: AchievementContext = typeof userXpOrCtx === 'number' ? { userXp: userXpOrCtx, seasonId } : userXpOrCtx
  const excludeSet = new Set(options?.excludeIds || [])
  
  // Get all badges allowed for season, excluding already-earned ones for optimization
  const all = getAllBadges().filter(b => 
    isSeasonAllowed(b, baseCtx.seasonId || seasonId || getCurrentSeason()?.id) &&
    !excludeSet.has(b.id) // Skip badges user already has permanently
  )
  
  // If all badges are excluded, nothing to calculate
  if (all.length === 0) return []
  
  // Pass 1: compute achievements that do NOT depend on other achievements' completion
  // By providing an empty set for earnedAchievementIds, achievements_completed_all will evaluate to false in this pass
  const pass1Ctx: AchievementContext = { ...baseCtx, earnedAchievementIds: new Set<string>() }
  const baseEarned = all.filter(b => meetsCriteria(b, pass1Ctx))
  const baseSet = new Set(baseEarned.map(b => b.id))
  
  // For meta-achievements, include stored badges in the count
  // This ensures "complete X achievements" badges work correctly
  const totalEarnedIds = new Set([...excludeSet, ...baseSet])
  
  // Pass 2: evaluate meta achievements that require already-earned IDs (e.g., achievements_completed_all)
  const pass2Ctx: AchievementContext = { ...baseCtx, earnedAchievementIds: totalEarnedIds }
  const metaEarned = all.filter(b => !baseSet.has(b.id) && meetsCriteria(b, pass2Ctx))
  
  const combined = [...baseEarned, ...metaEarned]
  return combined.sort((a, b) => (a.sortOrder || a.xpThreshold || 0) - (b.sortOrder || b.xpThreshold || 0))
}

// Determine which badges became newly unlocked compared to a previous set
export function diffNewlyUnlockedBadges(previousIds: Set<string>, current: Badge[]): Badge[] {
  return current.filter(b => !previousIds.has(b.id))
}

// Merge stored (permanent) badge IDs with newly calculated badges
// This ensures once a badge is earned, it stays even if user no longer meets criteria
export function getMergedEarnedBadges(
  storedBadgeIds: string[],
  newlyEarnedBadges: Badge[]
): Badge[] {
  const allBadges = getAllBadges()
  const mergedIds = new Set([...storedBadgeIds, ...newlyEarnedBadges.map(b => b.id)])
  return allBadges
    .filter(b => mergedIds.has(b.id))
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
}

// Get badges by IDs (for retrieving stored badges as Badge objects)
export function getBadgesByIds(ids: string[]): Badge[] {
  const idSet = new Set(ids)
  return getAllBadges()
    .filter(b => idSet.has(b.id))
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
}

export function getBestBadge(userXpOrCtx: number | AchievementContext, seasonId?: string | null, storedBadgeIds?: string[]): Badge | null {
  // If stored badges provided, include them in the "earned" set
  const storedBadges = storedBadgeIds ? getBadgesByIds(storedBadgeIds) : []
  const newlyEarned = getEarnedBadges(userXpOrCtx as any, seasonId, { excludeIds: storedBadgeIds })
  const earned = [...storedBadges, ...newlyEarned].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
  return earned.length ? earned[earned.length - 1] : null
}

export function getNextBadge(userXpOrCtx: number | AchievementContext, seasonId?: string | null, storedBadgeIds?: string[]): Badge | null {
  const ctx: AchievementContext = typeof userXpOrCtx === 'number' ? { userXp: userXpOrCtx, seasonId } : userXpOrCtx
  const allowed = getAllBadges().filter(b => isSeasonAllowed(b, ctx.seasonId || seasonId || getCurrentSeason()?.id))
  const ordered = allowed.sort((a, b) => (a.sortOrder || a.xpThreshold || 0) - (b.sortOrder || b.xpThreshold || 0))
  
  // Combine stored badges with newly calculated ones
  const storedSet = new Set(storedBadgeIds || [])
  const newlyEarned = getEarnedBadges(ctx, seasonId, { excludeIds: storedBadgeIds })
  const earnedIds = new Set([...storedSet, ...newlyEarned.map(b => b.id)])
  
  const firstLocked = ordered.find(b => !earnedIds.has(b.id))
  return firstLocked || null
}

// Extract unique multi-position criteria combinations from all badges
export function getUniqueMultiPositionCriteria(): Array<{
  positionType: 'supply' | 'borrow'
  positionCount: number
  minUsdValuePerPosition: number
  days: number
  requiredChainIds?: number[]
}> {
  const combinations = new Map<string, {
    positionType: 'supply' | 'borrow'
    positionCount: number
    minUsdValuePerPosition: number
    days: number
    requiredChainIds?: number[]
  }>()

  const allBadges = getAllBadges()

  for (const badge of allBadges) {
    if (badge.criteria) {
      for (const criterion of badge.criteria) {
        if (criterion.type === 'multi_position_maintained') {
          const chainIdsKey = criterion.requiredChainIds ? `:${criterion.requiredChainIds.sort().join(',')}` : ''
          const key = `${criterion.positionType}:${criterion.minUsdValuePerPosition}:${criterion.positionCount}${chainIdsKey}`
          if (!combinations.has(key)) {
            combinations.set(key, {
              positionType: criterion.positionType,
              positionCount: criterion.positionCount,
              minUsdValuePerPosition: criterion.minUsdValuePerPosition,
              days: criterion.days,
              requiredChainIds: criterion.requiredChainIds
            })
          }
        }
      }
    }
  }

  return Array.from(combinations.values())
}

export function getAfterNextBadge(userXpOrCtx: number | AchievementContext, seasonId?: string | null, storedBadgeIds?: string[]): Partial<Badge> | null {
  const ctx: AchievementContext = typeof userXpOrCtx === 'number' ? { userXp: userXpOrCtx, seasonId } : userXpOrCtx
  const allowed = getAllBadges().filter(b => isSeasonAllowed(b, ctx.seasonId || seasonId || getCurrentSeason()?.id)).sort((a, b) => (a.sortOrder || a.xpThreshold || 0) - (b.sortOrder || b.xpThreshold || 0))
  
  // Combine stored badges with newly calculated ones
  const storedSet = new Set(storedBadgeIds || [])
  const newlyEarned = getEarnedBadges(ctx, seasonId, { excludeIds: storedBadgeIds })
  const earnedIds = new Set([...storedSet, ...newlyEarned.map(b => b.id)])
  const remaining = allowed.filter(b => !earnedIds.has(b.id))
  if (remaining.length >= 2) {
    const b = remaining[1]
    return { id: b.id, name: b.name, tier: b.tier, icon: '❓' } as Partial<Badge>
  }
  return null
}

export type DerivedDisplay = {
  displayBadge: { id: string; name: string; icon: string; tier: Badge['tier']; borderColor: string | null; emoji: string | null; badgeStyle?: 'still' | 'glow' | 'float' | 'spin' } | null
  borderColor: string | null
  nameEmoji: string | null
  nextBadge: Badge | null
  afterNextBadgeHint: Partial<Badge> | null
  borderStyle?: 'still' | 'pulse' | 'orbit' | 'shine'
  // Suggestions indicate defaults the UI can show, but are NOT applied selections
  suggestedEmoji?: string | null
  suggestedBorderColor?: string | null
}

export function deriveDisplayFromProfile(params: {
  userXp: number
  selectedBadgeId?: string | null
  selectedBorderColor?: string | null
  selectedNameEmoji?: string | null
  seasonId?: string | null
  loginStreak?: number
  maxLoginStreak?: number
  totalLoginDays?: number
  transactionStreak?: number
  totalTransactions?: number
  transactionsByType?: Partial<Record<'supply' | 'borrow' | 'repay' | 'redeem', number>>
  crossChainTotalTransactions?: number
  crossChainTransactionsByType?: Partial<Record<'supply' | 'borrow' | 'repay' | 'redeem', number>>
  supplyPositionDays?: number
  positionMaintainedDays?: Partial<Record<'supply' | 'borrow' | 'any', number>>
  positionMaintainedDaysByThreshold?: Record<string, Partial<Record<'supply' | 'borrow' | 'any', number>>>
  distinctStablecoinSuppliedCount?: number
  distinctBlueChipSuppliedCount?: number
  distinctStablecoinsSuppliedOrBorrowedCount?: number
  completedAchievementsCount?: number
  completedAchievementsByTier?: Partial<Record<'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond', number>>
  multiPositionMaintained?: Record<string, number>
  totalUsdVolume?: number
  crossChainTotalUsdVolume?: number
  // Stored badge IDs for optimization - skip recalculating these
  storedBadgeIds?: string[]
}): DerivedDisplay {
  const seasonId = params.seasonId || getCurrentSeason()?.id || null
  const storedBadgeIds = params.storedBadgeIds || []
  const ctx: AchievementContext = {
    userXp: params.userXp,
    loginStreak: params.loginStreak,
    maxLoginStreak: params.maxLoginStreak,
    totalLoginDays: params.totalLoginDays,
    transactionStreak: params.transactionStreak,
    totalTransactions: params.totalTransactions,
    transactionsByType: params.transactionsByType,
    crossChainTotalTransactions: params.crossChainTotalTransactions,
    crossChainTransactionsByType: params.crossChainTransactionsByType,
    supplyPositionDays: params.supplyPositionDays,
    positionMaintainedDays: params.positionMaintainedDays,
    positionMaintainedDaysByThreshold: params.positionMaintainedDaysByThreshold,
    distinctStablecoinSuppliedCount: params.distinctStablecoinSuppliedCount,
    distinctBlueChipSuppliedCount: params.distinctBlueChipSuppliedCount,
    completedAchievementsCount: params.completedAchievementsCount,
    completedAchievementsByTier: params.completedAchievementsByTier,
    multiPositionMaintained: params.multiPositionMaintained,
    totalUsdVolume: params.totalUsdVolume,
    crossChainTotalUsdVolume: params.crossChainTotalUsdVolume,
    seasonId,
  }
  // Use stored badge IDs for optimization
  const best = getBestBadge(ctx, seasonId, storedBadgeIds)
  const storedBadges = getBadgesByIds(storedBadgeIds)
  const newlyEarned = getEarnedBadges(ctx, seasonId, { excludeIds: storedBadgeIds })
  const earned = [...storedBadges, ...newlyEarned].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
  const selectedBadge = earned.find(b => b.id === params.selectedBadgeId) || null
  const badgeForDisplay = selectedBadge || best || null
  const firstUnlockedBorder = (() => {
    for (let i = earned.length - 1; i >= 0; i--) {
      if (earned[i].unlockBorderColor) return earned[i].unlockBorderColor!
    }
    return null
  })()
  const firstUnlockedEmoji = (() => {
    for (let i = earned.length - 1; i >= 0; i--) {
      if (earned[i].unlockEmoji) return earned[i].unlockEmoji!
    }
    return null
  })()
  // Only honor explicit selections for display; suggestions are separate
  const borderColor = params.selectedBorderColor && ALLOWED_BORDER_COLORS.includes(params.selectedBorderColor)
    ? params.selectedBorderColor
    : null
  const nameEmoji = params.selectedNameEmoji && ALLOWED_NAME_EMOJIS.includes(params.selectedNameEmoji)
    ? params.selectedNameEmoji
    : null
  const nextBadge = getNextBadge(ctx, seasonId, storedBadgeIds)
  const afterNextBadgeHint = getAfterNextBadge(ctx, seasonId, storedBadgeIds)
  return {
    displayBadge: badgeForDisplay
      ? { id: badgeForDisplay.id, name: badgeForDisplay.name, icon: badgeForDisplay.icon, tier: badgeForDisplay.tier, borderColor: borderColor || null, emoji: nameEmoji || null, badgeStyle: 'still' }
      : null,
    borderColor,
    nameEmoji,
    nextBadge,
    afterNextBadgeHint,
    borderStyle: borderColor ? 'pulse' : 'still',
    suggestedEmoji: badgeForDisplay?.unlockEmoji || firstUnlockedEmoji || null,
    suggestedBorderColor: badgeForDisplay?.unlockBorderColor || firstUnlockedBorder || null,
  }
}



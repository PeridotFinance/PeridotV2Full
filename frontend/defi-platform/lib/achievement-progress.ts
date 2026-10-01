import { type Badge, type AchievementCriteria, type AchievementContext } from './achievements'

export type { AchievementContext }

/**
 * Calculate progress percentage for a single achievement criterion
 */
export function calculateCriterionProgress(
  criterion: AchievementCriteria,
  ctx: AchievementContext
): { current: number; target: number; progress: number } {
  switch (criterion.type) {
    case 'xp_at_least':
      return {
        current: ctx.userXp || 0,
        target: criterion.value,
        progress: Math.min(100, ((ctx.userXp || 0) / criterion.value) * 100)
      }
    
    case 'login_streak_at_least':
      const streakToCheck = ctx.maxLoginStreak !== undefined ? ctx.maxLoginStreak : (ctx.loginStreak || 0)
      return {
        current: streakToCheck,
        target: criterion.days,
        progress: Math.min(100, (streakToCheck / criterion.days) * 100)
      }

    case 'total_days_logged_in_at_least':
      return {
        current: ctx.totalLoginDays || 0,
        target: criterion.days,
        progress: Math.min(100, ((ctx.totalLoginDays || 0) / criterion.days) * 100)
      }
    
    case 'transaction_streak_at_least':
      return {
        current: ctx.transactionStreak || 0,
        target: criterion.days,
        progress: Math.min(100, ((ctx.transactionStreak || 0) / criterion.days) * 100)
      }
    
    case 'transactions_at_least': {
      const useCross = !!criterion.isCrossChain
      let current = 0
      if (criterion.actionTypes && criterion.actionTypes.length > 0) {
        const byType = useCross ? (ctx.crossChainTransactionsByType || {}) : (ctx.transactionsByType || {})
        current = criterion.actionTypes.reduce((acc, t) => acc + (byType[t] || 0), 0)
      } else {
        current = useCross ? (ctx.crossChainTotalTransactions || 0) : (ctx.totalTransactions || 0)
      }
      return {
        current,
        target: criterion.count,
        progress: Math.min(100, (current / criterion.count) * 100)
      }
    }
    
    case 'supply_position_days_at_least':
      return {
        current: ctx.supplyPositionDays || 0,
        target: criterion.days,
        progress: Math.min(100, ((ctx.supplyPositionDays || 0) / criterion.days) * 100)
      }
    
    case 'position_maintained_for_days': {
      let byType = ctx.positionMaintainedDays || {}
      if (typeof criterion.minUsdValue === 'number' && ctx.positionMaintainedDaysByThreshold) {
        const key = String(criterion.minUsdValue)
        if (ctx.positionMaintainedDaysByThreshold[key]) {
          byType = ctx.positionMaintainedDaysByThreshold[key]!
        }
      }
      let current = 0
      if (criterion.positionType === 'supply') {
        current = byType.supply ?? ctx.supplyPositionDays ?? 0
      } else if (criterion.positionType === 'borrow') {
        current = byType.borrow ?? 0
      } else {
        current = byType.any ?? Math.max(byType.supply || 0, byType.borrow || 0)
      }
      return {
        current,
        target: criterion.days,
        progress: Math.min(100, (current / criterion.days) * 100)
      }
    }
    
    case 'usd_volume_at_least': {
      const useCross = !!criterion.isCrossChain
      const current = useCross ? (ctx.crossChainTotalUsdVolume || 0) : (ctx.totalUsdVolume || 0)
      return {
        current,
        target: criterion.amount,
        progress: Math.min(100, (current / criterion.amount) * 100)
      }
    }
    
    case 'distinct_assets_interacted_with': {
      let current = 0
      if (criterion.assetCategory === 'stablecoin' && criterion.actionTypes?.includes('supply')) {
        current = ctx.distinctStablecoinSuppliedCount || 0
      } else if (criterion.assetCategory === 'blue_chip' && criterion.actionTypes?.includes('supply')) {
        current = ctx.distinctBlueChipSuppliedCount || 0
      }
      return {
        current,
        target: criterion.count,
        progress: Math.min(100, (current / criterion.count) * 100)
      }
    }
    
    case 'achievements_completed_at_least': {
      let current = 0
      if (criterion.tier) {
        const byTier = ctx.completedAchievementsByTier || {}
        const tierKey = criterion.tier.toLowerCase() as keyof typeof byTier
        current = byTier[tierKey] || 0
      } else {
        current = ctx.completedAchievementsCount || 0
      }
      return {
        current,
        target: criterion.count,
        progress: Math.min(100, (current / criterion.count) * 100)
      }
    }
    
    case 'achievements_completed_all': {
      const earned = ctx.earnedAchievementIds
      if (!earned || earned.size === 0) {
        return { current: 0, target: criterion.achievementIds.length, progress: 0 }
      }
      const completed = criterion.achievementIds.filter(id => earned.has(id)).length
      return {
        current: completed,
        target: criterion.achievementIds.length,
        progress: Math.min(100, (completed / criterion.achievementIds.length) * 100)
      }
    }
    
    case 'multi_position_maintained': {
      const key = `${criterion.positionType}:${criterion.minUsdValuePerPosition}:${criterion.positionCount}`
      const current = ctx.multiPositionMaintained?.[key] || 0
      return {
        current,
        target: criterion.days,
        progress: Math.min(100, (current / criterion.days) * 100)
      }
    }
    
    case 'effective_apy_at_least':
      return {
        current: ctx.effectiveApy || 0,
        target: criterion.value,
        progress: Math.min(100, ((ctx.effectiveApy || 0) / criterion.value) * 100)
      }
    
    case 'total_lifetime_earnings_at_least':
      return {
        current: ctx.totalLifetimeEarnings || 0,
        target: criterion.amount,
        progress: Math.min(100, ((ctx.totalLifetimeEarnings || 0) / criterion.amount) * 100)
      }
    
    case 'daily_average_earnings_at_least':
      return {
        current: ctx.dailyAverageEarnings || 0,
        target: criterion.amount,
        progress: Math.min(100, ((ctx.dailyAverageEarnings || 0) / criterion.amount) * 100)
      }
    
    default:
      return { current: 0, target: 1, progress: 0 }
  }
}

/**
 * Calculate overall progress for an achievement badge
 * Returns the minimum progress across all criteria (all must be met)
 */
export function calculateAchievementProgress(
  badge: Badge,
  ctx: AchievementContext
): { progress: number; criteriaProgress: Array<{ criterion: AchievementCriteria; current: number; target: number; progress: number }> } {
  if (!badge.criteria || badge.criteria.length === 0) {
    // Legacy badges with only xpThreshold
    if (typeof badge.xpThreshold === 'number') {
      const progress = Math.min(100, ((ctx.userXp || 0) / badge.xpThreshold) * 100)
      return {
        progress,
        criteriaProgress: [{
          criterion: { type: 'xp_at_least', value: badge.xpThreshold },
          current: ctx.userXp || 0,
          target: badge.xpThreshold,
          progress
        }]
      }
    }
    return { progress: 0, criteriaProgress: [] }
  }

  const criteriaProgress = badge.criteria.map(c => ({
    criterion: c,
    ...calculateCriterionProgress(c, ctx)
  }))

  // Overall progress is the minimum (all criteria must be met)
  const progress = Math.min(...criteriaProgress.map(cp => cp.progress))

  return { progress, criteriaProgress }
}


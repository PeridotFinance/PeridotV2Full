// Centralized, environment-aware rewards policy

export type ActionType = 'supply' | 'borrow' | 'repay' | 'redeem'

type PointsPolicy = {
  basePoints: Record<ActionType, number>
  usdBonusThresholds: Array<{ minUsd: number; add: number }>
  dailyLoginPoints: number
  throttle?: {
    windowHours: number
    tiers: Array<{ minOrdinal: number; maxOrdinal?: number; factor: number }>
  }
}

// Chain-specific multipliers for special promotions
export function getChainPointsMultiplier(chainId?: number): number {
  if (!chainId) return 1

  // 10x points multiplier for Monad Mainnet
  if (chainId === 143) { // MONAD_MAINNET
    return 1
  }

  // 10x points multiplier for Somnia Testnet
  if (chainId === 50312) { // SOMNIA_TESTNET
    return 1
  }

  return 1
}

// Combined chain and asset-specific multipliers
export function getPointsMultiplier(chainId?: number, assetId?: string): number {
  if (!chainId) return 1

  let multiplier = 1

  // Chain-specific multipliers
  multiplier *= getChainPointsMultiplier(chainId)

  // Asset-specific multipliers
  if (assetId) {
    const normalizedAssetId = assetId.toLowerCase()

    // 5x points multiplier for AUSD on Monad Mainnet
    if (chainId === 143 && normalizedAssetId === 'ausd') { // MONAD_MAINNET
      multiplier *= 5
    }
  }

  return multiplier
}

export function getNetworkPreset(): string {
  return process.env.NEXT_PUBLIC_NETWORK_PRESET || 'testnet'
}

export function getPointsPolicy(preset: string = getNetworkPreset()): PointsPolicy {
  // Default/testnet policy mirrors current behavior
  const testnetPolicy: PointsPolicy = {
    basePoints: {
      supply: 10,
      borrow: 15,
      repay: 5,
      redeem: 2,
    },
    usdBonusThresholds: [
      { minUsd: 10000, add: 50 },
      { minUsd: 1000, add: 20 },
      { minUsd: 100, add: 5 },
    ],
    dailyLoginPoints: 20,
    throttle: {
      windowHours: 24,
      tiers: [
        { minOrdinal: 1, maxOrdinal: 6, factor: 1 },
        { minOrdinal: 7, maxOrdinal: 12, factor: 0.5 },
        { minOrdinal: 13, factor: 0.25 },
      ],
    },
  }

  // Mainnet policy values: apply to any preset starting with "mainnet"
  if (String(preset).toLowerCase().startsWith('mainnet')) {
    return {
      basePoints: {
        supply: 20,
        borrow: 30,
        repay: 10,
        redeem: 5,
      },
      // Order from highest to lowest so first match yields the correct tier
      usdBonusThresholds: [
        { minUsd: 50000, add: 200 },
        { minUsd: 20000, add: 120 },
        { minUsd: 10000, add: 80 },
        { minUsd: 5000, add: 60 },
        { minUsd: 1000, add: 40 },
        { minUsd: 500, add: 20 },
        { minUsd: 100, add: 10 },
      ],
      dailyLoginPoints: 50,
      throttle: {
        windowHours: 24,
        tiers: [
          { minOrdinal: 1, maxOrdinal: 2, factor: 1 },
          { minOrdinal: 3, maxOrdinal: 5, factor: 0.5 },
          { minOrdinal: 6, maxOrdinal: 10, factor: 0.25 },
          { minOrdinal: 11, factor: 0.1 },
        ],
      },
    }
  }

  return testnetPolicy
}

export function calculateTransactionPoints(
  actionType: ActionType,
  usdValue?: number
): number {
  // If USD value is less than 1, only award 1 point (anti-exploit)
  if (usdValue !== undefined && usdValue < 1) {
    return 1
  }

  const policy = getPointsPolicy()
  let points = policy.basePoints[actionType]

  if (usdValue && usdValue > 0) {
    for (const tier of policy.usdBonusThresholds) {
      if (usdValue >= tier.minUsd) {
        points += tier.add
        break
      }
    }
  }

  return points
}

export function getDailyLoginPoints(): number {
  return getPointsPolicy().dailyLoginPoints
}

// Compute throttle factor from ordinal using policy tiers
export function getThrottleFactorFromPolicy(ordinal: number, preset: string = getNetworkPreset()): number {
  try {
    const policy = getPointsPolicy(preset)
    const throttle = policy.throttle
    if (!throttle || !Array.isArray(throttle.tiers) || ordinal <= 0) return 1
    for (const tier of throttle.tiers) {
      const minOk = ordinal >= tier.minOrdinal
      const maxOk = tier.maxOrdinal == null ? true : ordinal <= tier.maxOrdinal
      if (minOk && maxOk) return tier.factor
    }
    return 1
  } catch {
    return 1
  }
}



// ---------------------------------------------------------------------------
// Margin positions (Robinhood Chain first)
// ---------------------------------------------------------------------------
//
// A margin round trip gives the capital back, so points per action would pay
// anyone who opens and closes in a loop. The real award is therefore for the
// position HELD: time-weighted notional, paid once on the owner's full close.
// Opening earns a flat token amount only, so a cycle of opens stays worthless.
// Capital times time cannot be manufactured: ten parallel positions of $100
// score exactly what one of $1,000 does.

export const MARGIN_POINTS = {
  /** Flat award for opening a position. */
  open: 1,
  /** Points per USD of gross notional held for one day. $1,000 for a week = 70. */
  perUsdDay: 0.01,
  /** A position closed sooner than this earns no hold award. */
  minHoldSeconds: 60 * 60,
  /** Hold time beyond this does not count further. */
  maxHoldDays: 30,
  /** Ceiling of the hold award for one position. */
  maxPerPosition: 250,
} as const

/** Hold award for a fully closed position; the inputs come from lib/robinhood/points. */
export function calculateMarginHoldPoints(exposureUsdDays: number, heldSeconds: number): number {
  if (!Number.isFinite(exposureUsdDays) || exposureUsdDays <= 0) return 0
  if (!Number.isFinite(heldSeconds) || heldSeconds < MARGIN_POINTS.minHoldSeconds) return 0
  return Math.min(MARGIN_POINTS.maxPerPosition, Math.floor(exposureUsdDays * MARGIN_POINTS.perUsdDay))
}

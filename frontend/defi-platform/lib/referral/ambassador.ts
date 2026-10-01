/**
 * Ambassador Program — the rules, in one place.
 *
 * The old referral reward fired the moment an invited wallet made a single
 * transaction, which costs nothing to fake and is worth nothing to the
 * protocol. This one pays for deposits that stay: the invited user must hold at
 * least $100 of supplied value in the Peridot Stellar markets for 30 straight
 * days, and then BOTH sides earn $5.
 *
 * Everything downstream — the sweep, the API, the invite page, the admin payout
 * list — reads its numbers from here, so the copy a user sees and the threshold
 * the job enforces cannot drift apart.
 *
 * Payout is deliberately NOT automated. Qualification books an `earned` row in
 * `referral_rewards`; a human pays it from the admin list and marks it `paid`.
 * There is no server-held key that can move user money on a schedule.
 */

export const AMBASSADOR_PROGRAM = {
  /** Supplied value on Stellar the invited wallet must hold, in USD. */
  minDepositUsd: 100,
  /** Consecutive days it must stay at or above that value. */
  holdDays: 30,
  /** Paid to the referrer AND to the invited user, each, in USD. */
  rewardUsd: 5,
  /** What the payout is settled in. */
  payoutAsset: "USDC",
  payoutNetwork: "stellar",
} as const

/**
 * Physical referral table names.
 *
 * NOT from lib/tableResolver on purpose: the referral API routes have always
 * addressed the unsuffixed tables, and that is where the rows are — the
 * `_mainnet` twins were created by the resolver's naming scheme and never
 * written to. Centralised here so the ambassador code and the routes it feeds
 * cannot disagree about which table the program runs on.
 */
export const REFERRAL_TABLES = {
  referrals: "referrals",
  referralCodes: "referral_codes",
  referralStats: "referral_stats",
  depositSnapshots: "referral_deposit_snapshots",
  rewards: "referral_rewards",
  runs: "referral_ambassador_runs",
} as const

export type RewardRole = "referrer" | "referred"
export type RewardStatus = "earned" | "paid" | "void"

/** Per-referral milestone progress, as the invite page renders it. */
export interface AmbassadorProgress {
  /** Supplied USD at the last sweep. Null when never checked. */
  supplyUsd: number | null
  /** Days of unbroken qualifying balance observed so far. */
  holdDays: number
  /** Days still to go. 0 once qualified. */
  daysRemaining: number
  /** True once the milestone is met and the rewards are booked. */
  qualified: boolean
  qualifiedAt: string | null
  /** When the sweep last looked at this wallet. */
  lastCheckedAt: string | null
  /**
   * Where the user is in the funnel — drives which sentence the UI shows.
   *   `no_deposit`  — nothing supplied on Stellar yet
   *   `below`       — supplying, but under the threshold
   *   `holding`     — at or above the threshold, streak running
   *   `qualified`   — milestone met, $5 booked for both sides
   */
  stage: "no_deposit" | "below" | "holding" | "qualified"
}

/** Days the streak has run, given the day it started. Inclusive of both ends. */
export function holdDaysFrom(startedOn: Date | string | null, today: Date = new Date()): number {
  if (!startedOn) return 0
  const start = typeof startedOn === "string" ? new Date(startedOn) : startedOn
  if (Number.isNaN(start.getTime())) return 0
  const startUtc = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  const days = Math.floor((todayUtc - startUtc) / 86_400_000) + 1
  return days > 0 ? days : 0
}

/** Shape a `referrals` row into the progress the UI and API share. */
export function toProgress(row: {
  hold_streak_days?: number | string | null
  hold_streak_started_on?: string | Date | null
  last_supply_usd?: number | string | null
  last_checked_at?: string | Date | null
  qualified_at?: string | Date | null
}): AmbassadorProgress {
  const qualifiedAt = row.qualified_at ? new Date(row.qualified_at).toISOString() : null
  const supplyRaw = row.last_supply_usd
  const supplyUsd = supplyRaw === null || supplyRaw === undefined ? null : Number(supplyRaw)

  // Recompute from the start date rather than trusting the stored counter, so
  // progress keeps ticking between sweeps instead of freezing at the last run.
  const liveDays = qualifiedAt
    ? AMBASSADOR_PROGRAM.holdDays
    : Math.min(holdDaysFrom(row.hold_streak_started_on ?? null), AMBASSADOR_PROGRAM.holdDays)
  const storedDays = Number(row.hold_streak_days || 0)
  const holdDays = Math.max(liveDays, Math.min(storedDays, AMBASSADOR_PROGRAM.holdDays))

  let stage: AmbassadorProgress["stage"]
  if (qualifiedAt) stage = "qualified"
  else if (supplyUsd === null || supplyUsd <= 0) stage = "no_deposit"
  else if (supplyUsd < AMBASSADOR_PROGRAM.minDepositUsd) stage = "below"
  else stage = "holding"

  return {
    supplyUsd: supplyUsd === null || Number.isNaN(supplyUsd) ? null : supplyUsd,
    holdDays,
    daysRemaining: qualifiedAt ? 0 : Math.max(0, AMBASSADOR_PROGRAM.holdDays - holdDays),
    qualified: Boolean(qualifiedAt),
    qualifiedAt,
    lastCheckedAt: row.last_checked_at ? new Date(row.last_checked_at).toISOString() : null,
    stage,
  }
}

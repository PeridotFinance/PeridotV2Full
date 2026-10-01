/**
 * The Ambassador milestone sweep.
 *
 * Once a day it looks at every referral that has not qualified yet, reads how
 * much the invited wallet has supplied on Stellar, and moves the streak. When a
 * streak reaches {@link AMBASSADOR_PROGRAM.holdDays}, it books $5 for the
 * referrer and $5 for the invited user in `referral_rewards` and stops checking
 * that referral forever.
 *
 * Three deliberate biases, all in the user's favour:
 *
 *  - A day the sweep did not run neither counts nor resets. The streak is
 *    (today − started_on), so cron downtime cannot cost anyone their month.
 *  - A degraded read (Stellar RPC down, oracle silent) is skipped, not written.
 *    Writing 0 because the network was unreachable would look identical to a
 *    withdrawal and would reset a 29-day streak.
 *  - An unreachable identity store is likewise skipped. "This account has no
 *    Stellar wallet" and "the lookup failed" must never collapse into the same
 *    branch: only the first one is allowed to clear a streak.
 *  - Qualification is checked against the account's *whole* Stellar wallet set,
 *    not the one address the referral link happened to be clicked with.
 *
 * The one bias against the user is self-referral: if both sides resolve to the
 * same Peridot account the rewards are booked `void`, not `earned`.
 */

import { query } from "@/lib/database"
import { resolveAccountIdentity } from "@/lib/accountIdentity"
import { getStellarSuppliedUsd } from "@/lib/referral/stellar-supply"
import {
  AMBASSADOR_PROGRAM,
  REFERRAL_TABLES as T,
  holdDaysFrom,
} from "@/lib/referral/ambassador"

/**
 * Referrals inspected per pass. Most cost a DB lookup and nothing else (no
 * Stellar wallet linked → no RPC); the ones that do read the chain take ~1s.
 * The time budget below is the real limiter — this just bounds the query.
 */
const BATCH_SIZE = 800
/** Wall-clock budget; the route's maxDuration is 60s. */
const TIME_BUDGET_MS = 45_000
/** Parallel wallet reads. Each is ~6 Soroban simulations. */
const CONCURRENCY = 4

export interface SweepResult {
  enabled: boolean
  checked: number
  qualified: number
  skipped: number
  errors: number
  durationMs: number
}

interface CandidateRow {
  id: number
  referrer_wallet_address: string
  referred_wallet_address: string
  hold_streak_started_on: string | null
  hold_streak_days: number | null
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10)
}

async function processOne(row: CandidateRow, today: string): Promise<"qualified" | "moved" | "skipped"> {
  // A THROWN resolution is not an empty one. Swallowing it into `[]` would take
  // the "no Stellar wallet" branch below and clear a running streak because the
  // identity store blinked — the same class of mistake the degraded-read guard
  // exists to prevent. Leave the row for the next pass instead.
  let stellarAddresses: string[]
  try {
    stellarAddresses = (await resolveAccountIdentity(row.referred_wallet_address)).stellarAddresses ?? []
  } catch (e) {
    console.warn(`[ambassador] identity lookup failed for referral ${row.id}; leaving untouched`, e)
    return "skipped"
  }

  // No Stellar wallet at all: nothing to measure. Stamp the row so the invite
  // page can say "no deposit yet" instead of "checking…" and any streak is
  // cleared — but skip the snapshot, which would otherwise write a zero every
  // day for thousands of wallets that have never touched Stellar.
  if (stellarAddresses.length === 0) {
    await recordObservation(row, today, 0, [], false, false)
    return "moved"
  }

  const supply = await getStellarSuppliedUsd(stellarAddresses)

  // Degraded read below the threshold is indistinguishable from a withdrawal.
  // Leave the row untouched and try again next pass.
  if (supply.degraded && supply.totalUsd < AMBASSADOR_PROGRAM.minDepositUsd) {
    return "skipped"
  }

  const qualifies = supply.totalUsd >= AMBASSADOR_PROGRAM.minDepositUsd
  const streakDays = await recordObservation(
    row,
    today,
    supply.totalUsd,
    stellarAddresses,
    qualifies
  )

  if (qualifies && streakDays >= AMBASSADOR_PROGRAM.holdDays) {
    return (await bookRewards(row, stellarAddresses)) ? "qualified" : "skipped"
  }
  return "moved"
}

/**
 * Write today's observation and advance (or reset) the streak. Returns the
 * streak length in days after the write.
 */
async function recordObservation(
  row: CandidateRow,
  today: string,
  supplyUsd: number,
  stellarAddresses: string[],
  qualifies: boolean,
  writeSnapshot = true
): Promise<number> {
  if (writeSnapshot) {
    await query(
      `INSERT INTO ${T.depositSnapshots}
         (referred_wallet_address, snapshot_date, supply_usd, qualifies, stellar_addresses)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (referred_wallet_address, snapshot_date) DO UPDATE
         SET supply_usd = EXCLUDED.supply_usd,
             qualifies = EXCLUDED.qualifies,
             stellar_addresses = EXCLUDED.stellar_addresses,
             recorded_at = NOW()`,
      [row.referred_wallet_address, today, supplyUsd.toFixed(6), qualifies, stellarAddresses]
    )
  }

  // A qualifying observation starts the streak if none is running and leaves it
  // alone otherwise; a non-qualifying one clears it outright.
  const startedOn = qualifies ? row.hold_streak_started_on || today : null
  const streakDays = qualifies ? holdDaysFrom(startedOn) : 0

  await query(
    `UPDATE ${T.referrals}
        SET hold_streak_started_on = $2,
            hold_streak_days = $3,
            last_supply_usd = $4,
            last_checked_at = NOW()
      WHERE id = $1`,
    [row.id, startedOn, streakDays, supplyUsd.toFixed(6)]
  )

  return streakDays
}

/**
 * Mark the referral qualified and book both $5 rows. Idempotent — the unique
 * (referral_id, role) index makes a re-run a no-op, so a crash between the two
 * writes is recoverable by simply running again.
 *
 * Returns false when it declined to book, which leaves the referral unqualified
 * and therefore a candidate again on the next pass.
 */
async function bookRewards(row: CandidateRow, referredStellar: string[]): Promise<boolean> {
  // Self-referral across two wallets of the same Peridot account: book the rows
  // so the attempt is on record, but as `void` so no payout list ever shows it.
  //
  // The lookup must succeed for that verdict to mean anything: treating a
  // failure as "different accounts" would fail OPEN and book a real, payable
  // reward for a self-referral. This is the one write that turns into money, so
  // it waits for a definite answer rather than guessing — a day's delay on a
  // manual payout costs nothing, since the streak is already banked.
  let referrerIdentity: Awaited<ReturnType<typeof resolveAccountIdentity>>
  let referredIdentity: Awaited<ReturnType<typeof resolveAccountIdentity>>
  try {
    ;[referrerIdentity, referredIdentity] = await Promise.all([
      resolveAccountIdentity(row.referrer_wallet_address),
      resolveAccountIdentity(row.referred_wallet_address),
    ])
  } catch (e) {
    console.warn(`[ambassador] cannot verify sides of referral ${row.id}; not booking yet`, e)
    return false
  }

  const sameAccount =
    referrerIdentity?.accountId != null &&
    referredIdentity?.accountId != null &&
    referrerIdentity.accountId === referredIdentity.accountId
  const status = sameAccount ? "void" : "earned"
  const note = sameAccount ? "self-referral: both wallets resolve to one Peridot account" : null

  const sides: Array<{ role: "referrer" | "referred"; wallet: string; payout: string | null }> = [
    {
      role: "referrer",
      wallet: row.referrer_wallet_address,
      payout: referrerIdentity?.stellarAddresses?.[0] ?? null,
    },
    {
      role: "referred",
      wallet: row.referred_wallet_address,
      payout: referredStellar[0] ?? referredIdentity?.stellarAddresses?.[0] ?? null,
    },
  ]

  for (const side of sides) {
    await query(
      `INSERT INTO ${T.rewards}
         (referral_id, beneficiary_wallet_address, role, amount_usd,
          payout_asset, payout_network, status, payout_address, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (referral_id, role) DO NOTHING`,
      [
        row.id,
        side.wallet,
        side.role,
        AMBASSADOR_PROGRAM.rewardUsd,
        AMBASSADOR_PROGRAM.payoutAsset,
        AMBASSADOR_PROGRAM.payoutNetwork,
        status,
        side.payout,
        note,
      ]
    )
  }

  await query(
    `UPDATE ${T.referrals}
        SET qualified_at = COALESCE(qualified_at, NOW()),
            hold_streak_days = $2
      WHERE id = $1`,
    [row.id, AMBASSADOR_PROGRAM.holdDays]
  )
  return true
}

/**
 * One pass. Safe to call more often than daily — a referral already checked
 * today is not re-read, so extra runs cost one query and nothing else.
 */
export async function runAmbassadorSweep(): Promise<SweepResult> {
  const started = Date.now()
  const today = todayUtc()

  const runRow = await query(
    `INSERT INTO ${T.runs} (started_at) VALUES (NOW()) RETURNING id`
  )
  const runId = runRow.rows?.[0]?.id ?? null

  const candidates = await query(
    `SELECT id, referrer_wallet_address, referred_wallet_address,
            hold_streak_started_on, hold_streak_days
       FROM ${T.referrals}
      WHERE qualified_at IS NULL
        AND (last_checked_at IS NULL OR last_checked_at < $1::date)
      ORDER BY last_checked_at ASC NULLS FIRST, id ASC
      LIMIT $2`,
    [today, BATCH_SIZE]
  )
  const rows = (candidates.rows || []) as CandidateRow[]

  let checked = 0
  let qualified = 0
  let skipped = 0
  let errors = 0
  let cursor = 0

  const worker = async () => {
    while (cursor < rows.length) {
      if (Date.now() - started > TIME_BUDGET_MS) return
      const row = rows[cursor++]
      try {
        const outcome = await processOne(row, today)
        checked++
        if (outcome === "qualified") qualified++
        else if (outcome === "skipped") skipped++
      } catch (e) {
        errors++
        console.error(`[ambassador] referral ${row.id} failed:`, e)
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length || 1) }, worker))

  if (runId != null) {
    await query(
      `UPDATE ${T.runs}
          SET finished_at = NOW(), checked = $2, qualified = $3, errors = $4, note = $5
        WHERE id = $1`,
      [
        runId,
        checked,
        qualified,
        errors,
        `${rows.length} candidates, ${skipped} skipped on degraded reads`,
      ]
    )
  }

  return {
    enabled: true,
    checked,
    qualified,
    skipped,
    errors,
    durationMs: Date.now() - started,
  }
}

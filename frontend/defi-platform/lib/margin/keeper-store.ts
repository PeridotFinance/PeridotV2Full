/**
 * Server-side store for the always-on margin TP/SL keeper (`margin_keeper_arms`).
 *
 * Each row is a position the user "armed": the signatures the keeper needs to close
 * it when TP/SL crosses, handed over in advance (Path A — no contract change).
 * Schema: scripts/migration_margin_keeper_v3.sql.
 *
 * V3 arms carry a signed auth entry per owner-signed leg instead of the single V2
 * one. Since the 2026-08-31 controller upgrade that is two — `prepare` and the
 * `cancel` unwind — plus the swap ladder. The swap leg's `min_out` argument is
 * only accepted inside [oracle floor, pool output] — a ~2% window that moves with
 * the price — so it can't be a single pre-signed value; the user signs a LADDER of
 * candidates and the keeper submits whichever rung lands in the live window.
 *
 * Server-only — touches the DB directly. Never import into client code.
 */
import { sql } from "@/lib/database"

export type KeeperArmStatus = "armed" | "fired" | "expired" | "cancelled" | "failed"

/** One pre-signed `swap_close_position_v3(user, id, min_out)` candidate. */
export interface KeeperSwapRung {
  /** Offset from the arm-time oracle floor, in basis points (−600 … +600). */
  bp: number
  /** u128 units — the exact `min_out` this entry authorizes, and nothing else. */
  min_out: string
  /** base64 SorobanAuthorizationEntry XDR. */
  entry: string
}

export interface KeeperArmInput {
  userAddress: string
  positionId: string
  side: "Long" | "Short"
  debtToken: string
  takeProfitUsd: number | null
  stopLossUsd: number | null
  /** base64 SorobanAuthorizationEntry for prepare_close_position_v3(user, id) —
   *  one call where v3 arms needed two (begin then withdraw). */
  prepareAuthEntry: string
  /** base64 SorobanAuthorizationEntry for cancel_close_position_v3(user, id) — the
   *  unwind path when the swap window collapses mid-close. */
  cancelAuthEntry: string
  /** Pre-signed swap candidates, ascending by min_out. */
  swapRungs: KeeperSwapRung[]
  validUntilLedger: number
}

export interface KeeperArmRow {
  id: string
  user_address: string
  position_id: string
  side: "Long" | "Short"
  debt_token: string
  take_profit_usd: number | null
  stop_loss_usd: number | null
  /** V2 leftovers — always null on V3 arms. Kept so retired rows stay readable. */
  max_repay: string | null
  signed_auth_entry: string | null
  /** The one owner-signed leg that starts the close. Null on pre-V4 rows, whose
   *  `begin_auth_entry` / `withdraw_auth_entry` columns still hold their (now
   *  unusable) entries — those columns are deliberately not selected, so nothing
   *  can accidentally submit a leg the contract no longer takes. */
  prepare_auth_entry: string | null
  cancel_auth_entry: string | null
  swap_rungs: KeeperSwapRung[] | null
  /** 2 = the dead repay-only arm, 3 = the begin+withdraw split close, 4 = the
   *  one-transaction `prepare_close_position_v3` split close. */
  arm_version: number
  valid_until_ledger: number
  status: KeeperArmStatus
  attempts: number
  last_error: string | null
  fired_tx_hash: string | null
  fired_kind: "tp" | "sl" | null
  created_at: string
  updated_at: string
}

/** Arm (or re-arm) a position. Replaces any existing arm for (account, position). */
export async function upsertKeeperArm(input: KeeperArmInput): Promise<{ id: string }> {
  const rows = await sql<{ id: string }[]>`
    INSERT INTO margin_keeper_arms (
      user_address, position_id, side, debt_token,
      take_profit_usd, stop_loss_usd,
      prepare_auth_entry, cancel_auth_entry, swap_rungs, arm_version,
      valid_until_ledger, status, attempts, last_error,
      fired_tx_hash, fired_kind, updated_at
    ) VALUES (
      ${input.userAddress}, ${input.positionId}, ${input.side}, ${input.debtToken},
      ${input.takeProfitUsd}, ${input.stopLossUsd},
      ${input.prepareAuthEntry}, ${input.cancelAuthEntry},
      ${sql.json(input.swapRungs as never)}, 4,
      ${input.validUntilLedger}, 'armed', 0, NULL,
      NULL, NULL, now()
    )
    ON CONFLICT (user_address, position_id) DO UPDATE SET
      side = EXCLUDED.side,
      debt_token = EXCLUDED.debt_token,
      take_profit_usd = EXCLUDED.take_profit_usd,
      stop_loss_usd = EXCLUDED.stop_loss_usd,
      prepare_auth_entry = EXCLUDED.prepare_auth_entry,
      cancel_auth_entry = EXCLUDED.cancel_auth_entry,
      swap_rungs = EXCLUDED.swap_rungs,
      arm_version = 4,
      max_repay = NULL,
      signed_auth_entry = NULL,
      -- A re-arm must not leave the superseded legs behind: they authorize calls
      -- the keeper no longer makes, and a stale entry that merely *looks* present
      -- is what the version check below would otherwise have to guess about.
      begin_auth_entry = NULL,
      withdraw_auth_entry = NULL,
      valid_until_ledger = EXCLUDED.valid_until_ledger,
      status = 'armed',
      attempts = 0,
      last_error = NULL,
      fired_tx_hash = NULL,
      fired_kind = NULL,
      updated_at = now()
    RETURNING id::text
  `
  return { id: rows[0].id }
}

/**
 * The ladder as an array, whatever shape it came back in.
 *
 * `JSON.stringify(rungs)` into a jsonb parameter stores a JSON *string*, not an
 * array — postgres.js encodes the value a second time (jsonb_typeof said 'string').
 * Writes go through `sql.json` now, but rows written before that fix would make the
 * keeper think an armed position has no rungs and refuse to close it. Reading is
 * the wrong place to be strict.
 */
export function readSwapRungs(raw: KeeperArmRow["swap_rungs"] | string | null): KeeperSwapRung[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  try {
    const parsed = JSON.parse(String(raw))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** Cancel a user's arm for one position (idempotent). */
export async function cancelKeeperArm(userAddress: string, positionId: string): Promise<void> {
  await sql`
    UPDATE margin_keeper_arms
       SET status = 'cancelled', updated_at = now()
     WHERE user_address = ${userAddress} AND position_id = ${positionId}
       AND status = 'armed'
  `
}

/** A user's arms (any status), newest first — for the UI status surface. */
export async function listKeeperArms(userAddress: string): Promise<KeeperArmRow[]> {
  return await sql<KeeperArmRow[]>`
    SELECT id::text, user_address, position_id, side, debt_token,
           take_profit_usd, stop_loss_usd, max_repay, signed_auth_entry,
           prepare_auth_entry, cancel_auth_entry, swap_rungs, arm_version,
           valid_until_ledger, status, attempts, last_error, fired_tx_hash, fired_kind,
           created_at, updated_at
      FROM margin_keeper_arms
     WHERE user_address = ${userAddress}
     ORDER BY created_at DESC
     LIMIT 100
  `
}

/** All currently-armed rows — the keeper scan set. */
export async function listArmedRows(): Promise<KeeperArmRow[]> {
  return await sql<KeeperArmRow[]>`
    SELECT id::text, user_address, position_id, side, debt_token,
           take_profit_usd, stop_loss_usd, max_repay, signed_auth_entry,
           prepare_auth_entry, cancel_auth_entry, swap_rungs, arm_version,
           valid_until_ledger, status, attempts, last_error, fired_tx_hash, fired_kind,
           created_at, updated_at
      FROM margin_keeper_arms
     WHERE status = 'armed'
     ORDER BY created_at ASC
     LIMIT 500
  `
}

/** Mark rows whose signature has (nearly) expired so the keeper stops trying. */
export async function expireStaleArms(currentLedger: number, buffer = 50): Promise<number> {
  const rows = await sql<{ id: string }[]>`
    UPDATE margin_keeper_arms
       SET status = 'expired', updated_at = now()
     WHERE status = 'armed' AND valid_until_ledger <= ${currentLedger + buffer}
    RETURNING id::text
  `
  return rows.length
}

/** Expire a single arm with an explicit reason (e.g. its pre-signed auth entry
 *  is bound to a superseded controller after a contract migration). The reason
 *  lands in last_error so the UI/ops can see WHY the arm went away. */
export async function expireArmWithReason(id: string, reason: string): Promise<void> {
  await sql`
    UPDATE margin_keeper_arms
       SET status = 'expired', last_error = ${reason.slice(0, 500)}, updated_at = now()
     WHERE id = ${id} AND status = 'armed'
  `
}

export async function markArmFired(id: string, kind: "tp" | "sl", txHash: string): Promise<void> {
  await sql`
    UPDATE margin_keeper_arms
       SET status = 'fired', fired_kind = ${kind}, fired_tx_hash = ${txHash}, updated_at = now()
     WHERE id = ${id}
  `
}

/**
 * Record WHY an armed close didn't start, without counting it as an attempt.
 *
 * A deferral is not a failure: the trigger crossed, the keeper looked, and the
 * close couldn't complete yet (usually the pool below the oracle floor). The arm
 * stays armed and the next pass tries again. Until now this was only pushed into
 * the run summary, so it lived in a cron log the trader will never see — which
 * is precisely the case where they most need to be told something. Persisting it
 * is what lets the UI say "we tried, here's why, no action needed".
 */
export async function noteArmBlocked(id: string, reason: string): Promise<void> {
  await sql`
    UPDATE margin_keeper_arms
       SET last_error = ${reason.slice(0, 500)}, updated_at = now()
     WHERE id = ${id}
  `
}

/**
 * Drop a stored block reason once the arm is healthy again.
 *
 * Without this, a deferral is sticky: the price recovers, the arm is perfectly
 * fine, and the row still reads "we couldn't close this". The trader would be
 * chased to re-confirm something that never needed it.
 */
export async function clearArmBlocked(id: string): Promise<void> {
  await sql`
    UPDATE margin_keeper_arms
       SET last_error = NULL, updated_at = now()
     WHERE id = ${id} AND last_error IS NOT NULL AND status = 'armed'
  `
}

/** Record a failed close attempt; give up (status=failed) after `maxAttempts`. */
export async function markArmFailed(id: string, error: string, maxAttempts = 5): Promise<void> {
  await sql`
    UPDATE margin_keeper_arms
       SET attempts = attempts + 1,
           last_error = ${error.slice(0, 500)},
           status = CASE WHEN attempts + 1 >= ${maxAttempts} THEN 'failed' ELSE status END,
           updated_at = now()
     WHERE id = ${id}
  `
}

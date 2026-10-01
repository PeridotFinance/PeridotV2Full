// Persistence for Meld card on-ramp settlement events.
// Mirrors lib/bridge/store.ts conventions: `sql` tagged templates, table name
// from the resolver, idempotent upserts.

import { sql } from "@/lib/database"
import { getTableNames } from "@/lib/tableResolver"
import type { MeldAsset } from "@/lib/onramp/meld"

const t = getTableNames()

export type MeldOnrampStatus = "initiated" | "settled" | "expired"

export interface MeldOnrampEventRow {
  id: string
  idempotency_key: string
  privy_user_id: string
  address: string
  chain: string
  asset: string
  fiat_hint: string | null
  baseline_amount: string
  settled_amount: string | null
  status: MeldOnrampStatus
  settled_via: string | null
  initiated_at: string
  occurred_at: string | null
  created_at: string
  updated_at: string
}

export interface RecordInitiatedInput {
  idempotencyKey: string
  privyUserId: string
  address: string
  chain: string
  asset: MeldAsset
  fiatHint?: string | null
  baselineAmount: number
}

/**
 * Records (or no-ops on) a confirmed purchase awaiting settlement. Idempotent
 * on the client-generated key, so a retried POST won't duplicate or overwrite
 * an already-settled row.
 */
export async function recordInitiated(
  input: RecordInitiatedInput,
): Promise<MeldOnrampEventRow> {
  const rows = await sql`
    INSERT INTO ${sql(t.meldOnrampEvents)} (
      idempotency_key, privy_user_id, address, chain, asset, fiat_hint,
      baseline_amount, status
    ) VALUES (
      ${input.idempotencyKey}, ${input.privyUserId}, ${input.address.toLowerCase()},
      ${input.chain}, ${input.asset}, ${input.fiatHint ?? null},
      ${input.baselineAmount}, 'initiated'
    )
    ON CONFLICT (idempotency_key) DO UPDATE SET
      updated_at = NOW()
    RETURNING *
  `
  return rows[0] as MeldOnrampEventRow
}

/**
 * Marks an event settled with the detected delta. Only transitions rows still
 * in `initiated` (so a reconcile can't clobber a client-settled amount).
 * Returns the updated row, or null if it was already settled/expired/missing.
 */
export async function markSettled(input: {
  idempotencyKey: string
  privyUserId: string
  amount: number
  via: "client" | "reconcile"
}): Promise<MeldOnrampEventRow | null> {
  const rows = await sql`
    UPDATE ${sql(t.meldOnrampEvents)} SET
      status = 'settled',
      settled_amount = ${input.amount},
      settled_via = ${input.via},
      occurred_at = NOW(),
      updated_at = NOW()
    WHERE idempotency_key = ${input.idempotencyKey}
      AND privy_user_id = ${input.privyUserId}
      AND status = 'initiated'
    RETURNING *
  `
  return (rows[0] as MeldOnrampEventRow) ?? null
}

/** Open (initiated, unsettled) events for a user — the reconcile work-list. */
export async function listOpenEvents(
  privyUserId: string,
): Promise<MeldOnrampEventRow[]> {
  const rows = await sql`
    SELECT * FROM ${sql(t.meldOnrampEvents)}
    WHERE privy_user_id = ${privyUserId} AND status = 'initiated'
    ORDER BY initiated_at ASC
  `
  return rows as unknown as MeldOnrampEventRow[]
}

/** Recent settlement history for a user (UI list). */
export async function listRecentEvents(
  privyUserId: string,
  limit = 25,
): Promise<MeldOnrampEventRow[]> {
  const rows = await sql`
    SELECT * FROM ${sql(t.meldOnrampEvents)}
    WHERE privy_user_id = ${privyUserId}
    ORDER BY occurred_at DESC NULLS LAST, created_at DESC
    LIMIT ${limit}
  `
  return rows as unknown as MeldOnrampEventRow[]
}

/** Expires stale open events that never showed a delta (cleanup on reconcile). */
export async function expireStaleEvents(
  privyUserId: string,
  olderThanMinutes = 60,
): Promise<number> {
  const rows = await sql`
    UPDATE ${sql(t.meldOnrampEvents)} SET
      status = 'expired',
      updated_at = NOW()
    WHERE privy_user_id = ${privyUserId}
      AND status = 'initiated'
      AND initiated_at < NOW() - (${olderThanMinutes} * INTERVAL '1 minute')
    RETURNING id
  `
  return rows.length
}

/**
 * Retry queue for failed Action Timeline writes.
 *
 * Single-writer queue with at-most-linear growth: a failed write enqueues
 * one row; the poller drains the queue and deletes rows on success.
 *
 * Why it exists: `createTimelineForAction` / `transitionAction` were
 * best-effort try/catch consumers of transient DB failures. Silent loss
 * led to `agent_executed_actions` and `agent_actions` diverging — users
 * reported "Perry says no recent action" even though the on-chain tx
 * had landed. The queue re-applies the writes until they succeed.
 *
 * Idempotency: replay is safe because both timeline writes are idempotent
 * by construction (`transitionAction` no-ops on unchanged state;
 * `createAction` uses a unique confirmation_token that the DB rejects).
 */

import { sql } from '@/lib/database'
import { jsonbParam } from '@/lib/jsonb'
import { timelineLog } from '@/lib/agents/logger'
import {
  createAction,
  transitionAction,
  type CreateActionInput,
  type TransitionInput,
} from '@/lib/agents/action-timeline'

export type QueueOpType = 'create' | 'transition'

export interface QueuedCreatePayload extends CreateActionInput {}
export interface QueuedTransitionPayload extends TransitionInput {}

export interface QueueRow {
  id: string
  opType: QueueOpType
  confirmationToken: string
  payload: QueuedCreatePayload | QueuedTransitionPayload
  attempts: number
  lastError: string | null
  createdAt: Date
  lastAttemptAt: Date | null
}

/**
 * Enqueue a failed write for later retry. Best-effort: if even THIS fails
 * we log and give up — divergence is already happening, the queue just
 * gives us a chance to heal it. Never throws.
 */
export async function enqueueTimelineWrite(
  opType: QueueOpType,
  confirmationToken: string,
  payload: QueuedCreatePayload | QueuedTransitionPayload,
  error: string,
): Promise<void> {
  try {
    await sql`
      INSERT INTO agent_timeline_write_queue (
        op_type, confirmation_token, payload, last_error, last_attempt_at, attempts
      ) VALUES (
        ${opType}, ${confirmationToken}, ${jsonbParam(payload)},
        ${error.slice(0, 500)}, NOW(), 1
      )
    `
    timelineLog.warn('enqueued for retry', {
      opType,
      confirmationToken,
      error: error.slice(0, 200),
    })
  } catch (err) {
    timelineLog.error('enqueue ALSO failed — permanent divergence possible', {
      opType,
      confirmationToken,
      originalError: error.slice(0, 200),
      enqueueError: err instanceof Error ? err.message.slice(0, 200) : String(err),
    })
  }
}

/**
 * Drain up to `limit` queue rows. Rows attempted in the last 10 seconds
 * are skipped so a hot failure doesn't spin. Returns stats for telemetry.
 */
export async function drainTimelineWriteQueue(
  opts: { limit?: number } = {},
): Promise<{ attempted: number; succeeded: number; failed: number }> {
  const limit = opts.limit ?? 20
  // Atomically claim rows with `UPDATE … RETURNING` + `FOR UPDATE SKIP LOCKED`.
  // Without this, two concurrent drainers could SELECT the same row and both
  // call createAction / transitionAction with the same confirmationToken →
  // duplicate writes or swallowed errors on the losing side.
  // Bumping last_attempt_at here also keeps the 10-second backoff honest if
  // the subsequent work throws before we can update it in the catch branch.
  const rows = await sql`
    UPDATE agent_timeline_write_queue
    SET last_attempt_at = NOW()
    WHERE id IN (
      SELECT id FROM agent_timeline_write_queue
      WHERE last_attempt_at IS NULL
         OR last_attempt_at < NOW() - INTERVAL '10 seconds'
      ORDER BY last_attempt_at NULLS FIRST, created_at ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `

  let attempted = 0
  let succeeded = 0
  let failed = 0

  for (const raw of rows) {
    attempted++
    const row = mapRow(raw)
    try {
      if (row.opType === 'create') {
        await createAction(row.payload as QueuedCreatePayload)
      } else {
        await transitionAction(row.payload as QueuedTransitionPayload)
      }
      await sql`DELETE FROM agent_timeline_write_queue WHERE id = ${row.id}`
      succeeded++
      timelineLog.info('retry succeeded', {
        opType: row.opType,
        confirmationToken: row.confirmationToken,
        attempts: row.attempts + 1,
      })
    } catch (err) {
      failed++
      const message = err instanceof Error ? err.message : String(err)
      await sql`
        UPDATE agent_timeline_write_queue
        SET attempts = attempts + 1,
            last_error = ${message.slice(0, 500)},
            last_attempt_at = NOW()
        WHERE id = ${row.id}
      `
      timelineLog.warn('retry failed', {
        opType: row.opType,
        confirmationToken: row.confirmationToken,
        attempts: row.attempts + 1,
        error: message.slice(0, 200),
      })
    }
  }

  return { attempted, succeeded, failed }
}

function mapRow(row: any): QueueRow {
  return {
    id: row.id,
    opType: row.op_type,
    confirmationToken: row.confirmation_token,
    payload: row.payload ?? {},
    attempts: Number(row.attempts ?? 0),
    lastError: row.last_error ?? null,
    createdAt: new Date(row.created_at),
    lastAttemptAt: row.last_attempt_at ? new Date(row.last_attempt_at) : null,
  }
}

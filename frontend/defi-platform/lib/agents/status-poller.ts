/**
 * Status poller (P2).
 *
 * Walks the `agent_actions` ledger for non-terminal rows, dispatches each to
 * the matching `StatusChecker`, and persists the resulting state transition
 * + event. Idempotent and stateless — safe to invoke from a cron, a
 * serverless scheduled function, or an on-demand API route.
 */

import {
  listPollCandidates,
  transitionAction,
  appendEvent,
  type AgentAction,
} from '@/lib/agents/action-timeline'
import { getStatusChecker } from '@/lib/agents/status-checkers'

export interface PollerRunResult {
  processed: number
  transitions: number
  unchanged: number
  errors: number
  details: Array<{ actionId: string; from: string; to: string | 'unchanged'; error?: string }>
  /** Drain results for the timeline-write-queue retry lane (E-2). */
  queueDrain?: { attempted: number; succeeded: number; failed: number }
}

// Safety valve: an action that's been stuck in pending/bridging/executing
// beyond this window gets force-transitioned to 'timeout' so Perry can give
// the user an honest answer. Biconomy typically resolves within ~60s; 15min
// is very generous.
const ACTION_TTL_MS = 15 * 60 * 1000

export async function runStatusPollerTick(opts: { limit?: number } = {}): Promise<PollerRunResult> {
  const candidates = await listPollCandidates({ limit: opts.limit ?? 50 })
  const result: PollerRunResult = {
    processed: candidates.length,
    transitions: 0,
    unchanged: 0,
    errors: 0,
    details: [],
  }

  for (const action of candidates) {
    try {
      // TTL enforcement before backend lookup — saves an outbound call if
      // the action is already past the grace window.
      if (isExpired(action)) {
        await transitionAction({
          actionId: action.id,
          to: 'timeout',
          errorMessage: 'Status poller TTL exceeded — no terminal state reported by backend',
          eventType: 'status_change',
          eventPayload: { reason: 'ttl_expired' },
        })
        result.transitions++
        result.details.push({ actionId: action.id, from: action.status, to: 'timeout' })
        continue
      }

      const checker = getStatusChecker(action.backendType)
      if (!checker) {
        await appendEvent(action.id, 'error', {
          message: `No status checker registered for backend ${action.backendType}`,
        })
        result.errors++
        result.details.push({
          actionId: action.id,
          from: action.status,
          to: 'unchanged',
          error: 'no_checker',
        })
        continue
      }

      const update = await checker.check(action)

      if (update.to === 'unchanged') {
        // Still record the poll so diagnostics can see the cadence
        await appendEvent(action.id, 'progress', {
          backend: action.backendType,
          metadataPatch: update.metadataPatch ?? null,
        })
        result.unchanged++
        result.details.push({ actionId: action.id, from: action.status, to: 'unchanged' })
        continue
      }

      await transitionAction({
        actionId: action.id,
        to: update.to,
        primaryHash: update.primaryHash,
        errorMessage: update.errorMessage,
        metadataPatch: update.metadataPatch,
        eventType: 'status_change',
        eventPayload: { backend: action.backendType },
      })
      result.transitions++
      result.details.push({ actionId: action.id, from: action.status, to: update.to })
    } catch (err: any) {
      result.errors++
      result.details.push({
        actionId: action.id,
        from: action.status,
        to: 'unchanged',
        error: String(err?.message ?? err).slice(0, 200),
      })
      // Surface to event log so operators can spot repeated failures
      try {
        await appendEvent(action.id, 'error', {
          message: String(err?.message ?? err).slice(0, 500),
        })
      } catch {
        // swallow — poller must continue on the next action
      }
    }
  }

  // Drain the timeline-write retry queue. A failed client-side write earlier
  // landed a tombstone row here; we re-apply it now that the DB is
  // hopefully healthy again. Best-effort — this doesn't count toward the
  // main poller metrics.
  try {
    const { drainTimelineWriteQueue } = await import('@/lib/agents/timeline-write-queue')
    result.queueDrain = await drainTimelineWriteQueue({ limit: 20 })
  } catch {
    // The drain itself logs failures; don't let it hurt the rest of the tick.
  }

  return result
}

function isExpired(action: AgentAction): boolean {
  return Date.now() - action.createdAt.getTime() > ACTION_TTL_MS
}

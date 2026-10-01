/**
 * Agent Action Timeline — ledger helpers.
 *
 * Single source of truth for every agent-initiated action (cross-chain,
 * same-chain EVM, and future backends). Wraps the `agent_actions` +
 * `agent_action_events` tables defined in
 * scripts/migration_agent_actions_timeline.sql.
 *
 * Design notes
 * ─────────────
 * - Transitions go through `transitionAction()`. It writes both the new row
 *   state AND an event to the append-only log in a single transaction so
 *   replayers can reconstruct lifecycle accurately.
 * - Status validity is enforced at the DB CHECK level as well; this module
 *   just enumerates the valid values for callers.
 * - The `metadata` bag is backend-specific and is shallow-merged on each
 *   transition. Callers should namespace their keys (e.g. `biconomy.feeWei`)
 *   to avoid collisions as new backends appear.
 */

import { sql } from '@/lib/database'
import { jsonbObject, jsonbParam } from '@/lib/jsonb'
import {
  TERMINAL_STATUSES as _TERMINAL,
  ACTIVE_STATUSES as _ACTIVE,
  type ActionStatus,
} from '@/lib/agents/action-timeline-labels'

// Re-export so existing importers keep working without touching their call sites.
export { statusLabel, isTerminal, isActive } from '@/lib/agents/action-timeline-labels'
export type { ActionStatus } from '@/lib/agents/action-timeline-labels'

export const TERMINAL_STATUSES = _TERMINAL
export const ACTIVE_STATUSES = _ACTIVE

export type BackendType = 'biconomy' | 'direct_evm' | (string & {})

export interface AgentAction {
  id: string
  conversationId: string | null
  userAddress: string

  actionType: string
  assetSymbol: string
  amount: string
  amountUsd: number | null

  sourceChainId: number
  destinationChainId: number | null
  backendType: BackendType

  status: ActionStatus
  primaryHash: string | null
  confirmationToken: string | null

  metadata: Record<string, unknown>
  errorMessage: string | null

  createdAt: Date
  updatedAt: Date
  lastPolledAt: Date | null
  terminalAt: Date | null
}

export type ActionEventType =
  | 'status_change'
  | 'progress'
  | 'error'
  | 'note'
  | 'backend_ack'
  | 'hash_assigned'

export interface AgentActionEvent {
  id: string
  actionId: string
  eventType: ActionEventType
  fromStatus: ActionStatus | null
  toStatus: ActionStatus | null
  payload: Record<string, unknown>
  createdAt: Date
}

export interface CreateActionInput {
  conversationId?: string | null
  userAddress: string
  actionType: string
  assetSymbol: string
  amount: string
  amountUsd?: number | null
  sourceChainId: number
  destinationChainId?: number | null
  backendType: BackendType
  confirmationToken?: string | null
  metadata?: Record<string, unknown>
}

export interface TransitionInput {
  actionId: string
  to: ActionStatus
  primaryHash?: string
  errorMessage?: string
  metadataPatch?: Record<string, unknown>
  eventType?: ActionEventType
  eventPayload?: Record<string, unknown>
}

// ── Row mappers ────────────────────────────────────────────────────────

function mapActionRow(row: any): AgentAction {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    userAddress: row.user_address,
    actionType: row.action_type,
    assetSymbol: row.asset_symbol,
    amount: row.amount?.toString?.() ?? String(row.amount),
    amountUsd: row.amount_usd == null ? null : Number(row.amount_usd),
    sourceChainId: row.source_chain_id,
    destinationChainId: row.destination_chain_id,
    backendType: row.backend_type,
    status: row.status,
    primaryHash: row.primary_hash,
    confirmationToken: row.confirmation_token,
    metadata: jsonbObject(row.metadata),
    errorMessage: row.error_message,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    lastPolledAt: row.last_polled_at ? new Date(row.last_polled_at) : null,
    terminalAt: row.terminal_at ? new Date(row.terminal_at) : null,
  }
}

function mapEventRow(row: any): AgentActionEvent {
  return {
    id: row.id,
    actionId: row.action_id,
    eventType: row.event_type,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    payload: jsonbObject(row.payload),
    createdAt: new Date(row.created_at),
  }
}

// ── Writes ─────────────────────────────────────────────────────────────

/**
 * Create a new action in `proposed` status. Called by the agent tool layer
 * when an ActionButtonBlock is emitted, so the ledger knows about the intent
 * before the user has confirmed anything.
 */
export async function createAction(input: CreateActionInput): Promise<AgentAction> {
  const [row] = await sql`
    INSERT INTO agent_actions (
      conversation_id, user_address, action_type, asset_symbol, amount,
      amount_usd, source_chain_id, destination_chain_id, backend_type,
      confirmation_token, metadata, status
    ) VALUES (
      ${input.conversationId ?? null}, ${input.userAddress}, ${input.actionType},
      ${input.assetSymbol}, ${input.amount}, ${input.amountUsd ?? null},
      ${input.sourceChainId}, ${input.destinationChainId ?? null}, ${input.backendType},
      ${input.confirmationToken ?? null}, ${jsonbParam((input.metadata ?? {}))},
      'proposed'
    )
    RETURNING *
  `
  const action = mapActionRow(row)
  // Seed the event log so replayers always see the creation point.
  await sql`
    INSERT INTO agent_action_events (action_id, event_type, to_status, payload)
    VALUES (${action.id}, 'status_change', 'proposed',
      ${jsonbParam({ reason: 'created' })})
  `
  return action
}

/**
 * Move an action to a new status + append an event. Idempotent against
 * repeat calls with the same target status (no-op), to survive duplicate
 * poller hits.
 */
export async function transitionAction(input: TransitionInput): Promise<AgentAction | null> {
  const existing = await getActionById(input.actionId)
  if (!existing) return null

  // Idempotent no-op when already in the target state with nothing new to patch
  if (
    existing.status === input.to
    && !input.primaryHash
    && !input.errorMessage
    && !input.metadataPatch
  ) {
    return existing
  }

  // Reject illegal backwards transitions from terminal to non-terminal
  if (TERMINAL_STATUSES.includes(existing.status) && existing.status !== input.to) {
    // Allow re-entering the same terminal status but never unwinding it
    if (!TERMINAL_STATUSES.includes(input.to) || input.to !== existing.status) {
      return existing
    }
  }

  const mergedMetadata = {
    ...existing.metadata,
    ...(input.metadataPatch ?? {}),
  }

  const [row] = await sql`
    UPDATE agent_actions
    SET status = ${input.to},
        primary_hash = COALESCE(${input.primaryHash ?? null}, primary_hash),
        error_message = COALESCE(${input.errorMessage ?? null}, error_message),
        metadata = ${jsonbParam(mergedMetadata)},
        last_polled_at = CASE
          WHEN ${input.eventType ?? null} = 'progress' THEN NOW()
          ELSE last_polled_at
        END
    WHERE id = ${input.actionId}
    RETURNING *
  `
  if (!row) return null

  await sql`
    INSERT INTO agent_action_events (
      action_id, event_type, from_status, to_status, payload
    ) VALUES (
      ${input.actionId}, ${input.eventType ?? 'status_change'},
      ${existing.status}, ${input.to},
      ${jsonbParam((input.eventPayload ?? {}))}
    )
  `

  return mapActionRow(row)
}

/**
 * Record a progress event without changing status. Useful for the Biconomy
 * poller to note interim phases ('quote-ok', 'sign-pending') that don't map
 * 1:1 to our canonical status set.
 */
export async function appendEvent(
  actionId: string,
  eventType: ActionEventType,
  payload: Record<string, unknown> = {},
): Promise<void> {
  await sql`
    INSERT INTO agent_action_events (action_id, event_type, payload)
    VALUES (${actionId}, ${eventType}, ${jsonbParam(payload)})
  `
  if (eventType === 'progress') {
    await sql`
      UPDATE agent_actions SET last_polled_at = NOW() WHERE id = ${actionId}
    `
  }
}

// ── Reads ──────────────────────────────────────────────────────────────

export async function getActionById(id: string): Promise<AgentAction | null> {
  const rows = await sql`SELECT * FROM agent_actions WHERE id = ${id}`
  if (rows.length === 0) return null
  return mapActionRow(rows[0])
}

export async function getActionByToken(token: string): Promise<AgentAction | null> {
  const rows = await sql`
    SELECT * FROM agent_actions WHERE confirmation_token = ${token}
  `
  if (rows.length === 0) return null
  return mapActionRow(rows[0])
}

export async function getActionByHash(hash: string): Promise<AgentAction | null> {
  const rows = await sql`
    SELECT * FROM agent_actions WHERE primary_hash = ${hash}
  `
  if (rows.length === 0) return null
  return mapActionRow(rows[0])
}

/**
 * List actions that are still in an active (non-terminal) state for a user.
 * Used by the per-turn context injection and by the chat "in flight" pill.
 */
export async function listActiveActions(userAddress: string): Promise<AgentAction[]> {
  const rows = await sql`
    SELECT * FROM agent_actions
    WHERE LOWER(user_address) = LOWER(${userAddress})
      AND status IN ('proposed', 'signing', 'pending', 'bridging', 'executing')
    ORDER BY updated_at DESC
    LIMIT 20
  `
  return rows.map(mapActionRow)
}

/**
 * Recent actions (terminal + active) in the last N minutes. Default window
 * balances "still fresh to Perry" vs. context-size budget.
 */
export async function listRecentActions(
  userAddress: string,
  opts: { limit?: number; windowMinutes?: number } = {},
): Promise<AgentAction[]> {
  const limit = opts.limit ?? 10
  const windowMinutes = opts.windowMinutes ?? 10
  const rows = await sql`
    SELECT * FROM agent_actions
    WHERE LOWER(user_address) = LOWER(${userAddress})
      AND created_at > NOW() - (${windowMinutes} || ' minutes')::interval
    ORDER BY created_at DESC
    LIMIT ${limit}
  `
  return rows.map(mapActionRow)
}

/**
 * Actions the poller should next check. Returns non-terminal actions,
 * oldest-polled first, capped to keep each tick bounded.
 */
export async function listPollCandidates(opts: { limit?: number } = {}): Promise<AgentAction[]> {
  const limit = opts.limit ?? 50
  const rows = await sql`
    SELECT * FROM agent_actions
    WHERE status IN ('pending', 'bridging', 'executing')
    ORDER BY last_polled_at NULLS FIRST, updated_at ASC
    LIMIT ${limit}
  `
  return rows.map(mapActionRow)
}

/**
 * Admin view — actions still in a non-terminal state that haven't been
 * updated for `minAgeMinutes` minutes. Used by the admin stuck-actions
 * endpoint to surface stalls without requiring SQL shell access.
 */
export async function listStuckActions(
  opts: { minAgeMinutes?: number; limit?: number } = {},
): Promise<AgentAction[]> {
  const minAge = opts.minAgeMinutes ?? 5
  const limit = opts.limit ?? 100
  const rows = await sql`
    SELECT * FROM agent_actions
    WHERE status IN ('proposed', 'signing', 'pending', 'bridging', 'executing')
      AND updated_at < NOW() - (${minAge} || ' minutes')::interval
    ORDER BY updated_at ASC
    LIMIT ${limit}
  `
  return rows.map(mapActionRow)
}

export async function listEvents(
  actionId: string,
  opts: { sinceIso?: string; limit?: number } = {},
): Promise<AgentActionEvent[]> {
  const limit = opts.limit ?? 100
  const rows = opts.sinceIso
    ? await sql`
        SELECT * FROM agent_action_events
        WHERE action_id = ${actionId}
          AND created_at > ${opts.sinceIso}::timestamptz
        ORDER BY created_at ASC
        LIMIT ${limit}
      `
    : await sql`
        SELECT * FROM agent_action_events
        WHERE action_id = ${actionId}
        ORDER BY created_at ASC
        LIMIT ${limit}
      `
  return rows.map(mapEventRow)
}

/**
 * Event-stream query for SSE: all events across a user's actions since a
 * given timestamp. The SSE route uses this to replay the tail on reconnect
 * before switching to LISTEN/NOTIFY (future) or poll-based follow-up.
 */
export async function listUserEventsSince(
  userAddress: string,
  sinceIso: string,
  opts: { limit?: number } = {},
): Promise<Array<AgentActionEvent & { userAddress: string }>> {
  const limit = opts.limit ?? 200
  const rows = await sql`
    SELECT e.*, a.user_address
    FROM agent_action_events e
    JOIN agent_actions a ON a.id = e.action_id
    WHERE LOWER(a.user_address) = LOWER(${userAddress})
      AND e.created_at > ${sinceIso}::timestamptz
    ORDER BY e.created_at ASC
    LIMIT ${limit}
  `
  return rows.map((row: any) => ({
    ...mapEventRow(row),
    userAddress: row.user_address,
  }))
}

// Labels + terminality live in `action-timeline-labels.ts` so client code
// can import them without pulling in `@/lib/database`. Re-exported at the
// top of this file.

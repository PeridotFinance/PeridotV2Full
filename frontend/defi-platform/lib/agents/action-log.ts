/**
 * Write/query helpers for `agent_action_log` (Phase 7 — audit trail).
 *
 * Called from `/api/agents/execute` (PATCH step, after the tx hash is known)
 * and from the UI's Activity Panel.
 *
 * We don't create a strict typed shape for the SQL row — the `postgres` driver
 * returns `unknown[]` rows, and the caller maps to `AgentActionLogEntry` via
 * `mapActionLogRow`.
 */

export interface AgentActionLogEntry {
  id: string
  userAddress: string
  actionType: string
  assetSymbol: string
  amount: number
  amountUsd: number | null
  chainId: number
  txHash: string | null
  status: 'pending' | 'success' | 'failed'
  autoExecuted: boolean
  sourceId: string | null
  sourceType: 'proposal' | 'single_action' | null
  errorMessage: string | null
  createdAt: string
  updatedAt: string
}

export interface AgentActionLogInsert {
  userAddress: string
  actionType: string
  assetSymbol: string
  amount: number | string
  amountUsd?: number | null
  chainId: number
  txHash?: string | null
  status?: 'pending' | 'success' | 'failed'
  autoExecuted: boolean
  sourceId?: string | null
  sourceType?: 'proposal' | 'single_action' | null
  errorMessage?: string | null
}

/**
 * Pure row-to-entry mapper. Useful in tests and in API route handlers that
 * return rows over HTTP.
 */
export function mapActionLogRow(row: Record<string, unknown>): AgentActionLogEntry {
  return {
    id: row.id as string,
    userAddress: row.user_address as string,
    actionType: row.action_type as string,
    assetSymbol: row.asset_symbol as string,
    amount: Number(row.amount),
    amountUsd: row.amount_usd != null ? Number(row.amount_usd) : null,
    chainId: Number(row.chain_id),
    txHash: (row.tx_hash as string) ?? null,
    status: (row.status as AgentActionLogEntry['status']) ?? 'pending',
    autoExecuted: (row.auto_executed as boolean) ?? false,
    sourceId: (row.source_id as string) ?? null,
    sourceType: (row.source_type as AgentActionLogEntry['sourceType']) ?? null,
    errorMessage: (row.error_message as string) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

/**
 * Normalize a status transition so the caller doesn't accidentally overwrite
 * a `success` row with `pending` if events arrive out of order.
 */
export function resolveNextStatus(
  current: AgentActionLogEntry['status'] | undefined,
  incoming: AgentActionLogEntry['status'],
): AgentActionLogEntry['status'] {
  // Terminal states (success/failed) win over pending
  if (current === 'success') return 'success'
  if (current === 'failed' && incoming !== 'success') return 'failed'
  return incoming
}

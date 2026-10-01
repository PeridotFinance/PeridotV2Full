/**
 * POST /api/agents/timeline/transition
 *
 * Client-driven lifecycle updates. The browser-side AgentCrossChainListener
 * calls this to record transitions (signing / pending / succeeded / failed)
 * with the real superTxHash as soon as Biconomy returns it — the poller
 * can't discover the hash on its own, only the client knows.
 *
 * Body:
 *   {
 *     confirmationToken: string   // or actionId, either works
 *     actionId?: string
 *     to: ActionStatus
 *     primaryHash?: string
 *     errorMessage?: string
 *     metadataPatch?: Record<string, unknown>
 *     eventPayload?: Record<string, unknown>
 *   }
 *
 * Response: { action: AgentAction }
 *
 * Auth: Privy Bearer token (same as /api/agents/execute). User must own
 * the action or the route 403s — prevents cross-account poisoning.
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateAgentRequest } from '@/lib/agents/auth'
import {
  getActionById,
  getActionByToken,
  transitionAction,
  type ActionStatus,
} from '@/lib/agents/action-timeline'

const ALLOWED_STATUSES: ActionStatus[] = [
  'signing', 'pending', 'bridging', 'executing',
  'succeeded', 'failed', 'cancelled',
  // NOTE: 'timeout' is poller-only; clients cannot assert timeout.
  // 'proposed' is creation-only; cannot be re-entered.
]

export async function POST(request: NextRequest) {
  // ── Auth: E2E | Privy | Stellar-wallet session (Stufe 3) ───────────
  const auth = await authenticateAgentRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userAddress = auth.userAddress

  // ── Validate input ────────────────────────────────────────────────
  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const {
    confirmationToken,
    actionId,
    to,
    primaryHash,
    errorMessage,
    metadataPatch,
    eventPayload,
    heartbeat,
  } = body ?? {}

  // Heartbeat mode (E-3): client pings every 5s during biconomyAdapter flow
  // so `last_polled_at` shows "client is alive". No status change, no
  // primary hash — just a liveness marker. Accept either heartbeat=true OR
  // a regular transition; one of them must be present.
  const isHeartbeat = heartbeat === true
  if (!isHeartbeat && (!to || !ALLOWED_STATUSES.includes(to))) {
    return NextResponse.json({
      error: `'to' must be one of: ${ALLOWED_STATUSES.join(', ')}`,
    }, { status: 400 })
  }
  if (!actionId && !confirmationToken) {
    return NextResponse.json({
      error: 'Either actionId or confirmationToken is required',
    }, { status: 400 })
  }

  // ── Locate action + ownership check ──────────────────────────────
  const action = actionId
    ? await getActionById(actionId)
    : await getActionByToken(confirmationToken)

  if (!action) {
    return NextResponse.json({ error: 'Action not found' }, { status: 404 })
  }
  if (action.userAddress.toLowerCase() !== userAddress.toLowerCase()) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Heartbeat short-circuit: append a progress event (bumps last_polled_at
  // via the appendEvent helper) and return. No status transition, no
  // closure persistence.
  if (isHeartbeat) {
    const { appendEvent } = await import('@/lib/agents/action-timeline')
    await appendEvent(action.id, 'progress', { source: 'client-heartbeat' })
    return NextResponse.json({ ok: true, heartbeat: true })
  }

  // ── Apply transition ─────────────────────────────────────────────
  const updated = await transitionAction({
    actionId: action.id,
    to,
    primaryHash: typeof primaryHash === 'string' ? primaryHash : undefined,
    errorMessage: typeof errorMessage === 'string' ? errorMessage : undefined,
    metadataPatch: isPlainObject(metadataPatch) ? metadataPatch : undefined,
    eventType: 'status_change',
    eventPayload: {
      source: 'client',
      ...(isPlainObject(eventPayload) ? eventPayload : {}),
    },
  })

  // ── Persist success closure (cross-chain path) ─────────────────
  // Cross-chain deposits terminate here (AgentCrossChainListener drives it).
  // Write the same "Done — deposited X" message that the same-chain PATCH
  // writes, so the chat gets a reliable terminator regardless of path.
  if (to === 'succeeded' && action.conversationId) {
    try {
      const { persistClosureMessage } = await import('@/lib/agents/closure-message')
      await persistClosureMessage({
        conversationId: action.conversationId,
        actionType: action.actionType,
        assetSymbol: action.assetSymbol,
        amount: action.amount,
      })
    } catch (err) {
      const { closureLog } = await import('@/lib/agents/logger')
      closureLog.warn('timeline/transition closure skipped', {
        actionId: action.id,
        conversationId: action.conversationId,
        error: err instanceof Error ? err.message.slice(0, 300) : String(err),
      })
    }
  }

  return NextResponse.json({ action: updated })
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

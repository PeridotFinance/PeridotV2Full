/**
 * GET /api/agents/admin/actions
 *
 * Ops-read surface for inspecting the Action Timeline without SQL. Mutually
 * exclusive with the user-facing `/api/agents/activity` which scopes by the
 * authenticated wallet — this route is global and secret-auth'd.
 *
 * Query params:
 *   ?stuck=true&min_age_min=5   list actions in a non-terminal state whose
 *                                updated_at is older than the threshold.
 *   ?limit=N                    cap row count (default 100, hard cap 500).
 *
 * Auth: same shared secret as the poller (`AGENT_POLLER_SECRET`). We
 * deliberately don't gate on user auth — ops should be able to ping this
 * from a curl on a laptop without a Privy token.
 *
 * Response:
 *   {
 *     count: number,
 *     actions: [{
 *       id, userAddress, actionType, assetSymbol, amount,
 *       status, primaryHash, errorMessage,
 *       createdAt, updatedAt, lastPolledAt,
 *       ageSeconds, sinceUpdateSeconds,
 *     }, ...]
 *   }
 */

import { NextRequest } from 'next/server'
import { listStuckActions } from '@/lib/agents/action-timeline'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const secret = process.env.AGENT_POLLER_SECRET
  if (!secret) {
    return json(500, { error: 'AGENT_POLLER_SECRET not configured' })
  }
  // Header only — query-param secrets would land in nginx access logs
  const provided = request.headers.get('x-agent-poller-secret')
  if (provided !== secret) {
    return json(401, { error: 'Unauthorized' })
  }

  const url = request.nextUrl
  const stuck = url.searchParams.get('stuck') === 'true'
  if (!stuck) {
    // Only the `?stuck=true` view is wired so far — future views can branch
    // here without breaking existing callers.
    return json(400, { error: 'Only ?stuck=true is supported right now.' })
  }

  const minAge = Number(url.searchParams.get('min_age_min') ?? '5')
  const clampedMinAge = Number.isFinite(minAge) && minAge > 0 ? Math.min(minAge, 1440) : 5
  const limitRaw = Number(url.searchParams.get('limit') ?? '100')
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 100

  const actions = await listStuckActions({ minAgeMinutes: clampedMinAge, limit })
  const now = Date.now()

  return json(200, {
    count: actions.length,
    query: { stuck: true, minAgeMinutes: clampedMinAge, limit },
    actions: actions.map((a) => ({
      id: a.id,
      userAddress: a.userAddress,
      actionType: a.actionType,
      assetSymbol: a.assetSymbol,
      amount: a.amount,
      sourceChainId: a.sourceChainId,
      destinationChainId: a.destinationChainId,
      backendType: a.backendType,
      status: a.status,
      primaryHash: a.primaryHash,
      errorMessage: a.errorMessage,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
      lastPolledAt: a.lastPolledAt?.toISOString() ?? null,
      ageSeconds: Math.round((now - a.createdAt.getTime()) / 1000),
      sinceUpdateSeconds: Math.round((now - a.updatedAt.getTime()) / 1000),
    })),
  })
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

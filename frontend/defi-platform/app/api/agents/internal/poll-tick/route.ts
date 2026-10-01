/**
 * GET/POST /api/agents/internal/poll-tick
 *
 * Internal cron entrypoint for the Action Timeline status poller. This is
 * meant to be invoked by a scheduled runner — Vercel Cron, GitHub Actions,
 * an external cron calling us on a timer, or (during development) a
 * browser tab hitting this URL periodically.
 *
 * Parallel to /api/agents/timeline/poll: same underlying `runStatusPollerTick`,
 * different auth shape.
 *
 *  - /timeline/poll expects `X-Agent-Poller-Secret` (human-triggered / CI).
 *  - /internal/poll-tick expects Vercel Cron's `CRON_SECRET` header OR our
 *    shared secret as a fallback for non-Vercel deployments.
 *
 * Having both is intentional: the external secret path survives a Vercel
 * outage and lets operators run ad-hoc ticks from a laptop, while the
 * internal path plugs into the platform-native scheduler for routine use.
 *
 * Why no user auth: this runs unattended across all users' actions.
 * Ownership checks live one layer down inside the poller (each action's
 * `user_address` is what its StatusChecker uses to query, not this route).
 */

import { NextRequest } from 'next/server'
import { runStatusPollerTick } from '@/lib/agents/status-poller'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Accept either:
 *   - Vercel Cron's `Authorization: Bearer <CRON_SECRET>` convention, or
 *   - `x-agent-poller-secret: <AGENT_POLLER_SECRET>` for self-hosted setups.
 *
 * Failing both means unauthorized. Matching EITHER is sufficient so the
 * same route works on Vercel and on PM2 behind Nginx.
 */
function authorized(request: NextRequest): boolean {
  const vercelSecret = process.env.CRON_SECRET
  if (vercelSecret) {
    const bearer = request.headers.get('authorization')
    if (bearer === `Bearer ${vercelSecret}`) return true
  }
  const pollerSecret = process.env.AGENT_POLLER_SECRET
  if (pollerSecret) {
    // Header only — query-param secrets would land in nginx access logs
    const provided = request.headers.get('x-agent-poller-secret')
    if (provided === pollerSecret) return true
  }
  return false
}

async function handle(request: NextRequest) {
  if (!authorized(request)) {
    return json(401, { error: 'Unauthorized' })
  }

  const limitParam = request.nextUrl.searchParams.get('limit')
  const limit = limitParam
    ? Math.max(1, Math.min(200, Number(limitParam) || 0))
    : undefined

  try {
    const result = await runStatusPollerTick({ limit })
    return json(200, result)
  } catch (err: any) {
    return json(500, { error: String(err?.message ?? err).slice(0, 500) })
  }
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const GET = handle
export const POST = handle

/**
 * POST/GET /api/agents/internal/prune-tick
 *
 * Daily event-retention cron. Deletes `agent_action_events` rows older
 * than `?days=N` (default 90) by calling the `prune_agent_action_events`
 * SQL function from the retention migration.
 *
 * Scheduled in `vercel.json` at 03:00 UTC so it runs during low traffic.
 * On self-hosted deployments the same external cron that triggers
 * `/poll-tick` should also hit this once a day.
 *
 * Auth mirrors /internal/poll-tick — either Vercel Cron's `CRON_SECRET`
 * or the shared `AGENT_POLLER_SECRET`.
 */

import { NextRequest } from 'next/server'
import { sql } from '@/lib/database'

export const runtime = 'nodejs'
export const maxDuration = 60

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

  const daysRaw = Number(request.nextUrl.searchParams.get('days') ?? '90')
  const days = Number.isFinite(daysRaw) && daysRaw > 0
    ? Math.min(daysRaw, 365)
    : 90

  try {
    const rows = await sql`SELECT prune_agent_action_events(${days}) AS deleted`
    const deleted = Number((rows[0] as any)?.deleted ?? 0)
    return json(200, { deleted, days })
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

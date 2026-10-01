/**
 * POST /api/agents/timeline/poll
 *
 * Trigger a single status-poller tick. Designed to be called from an external
 * cron (e.g. a GitHub Action, Vercel cron, or the existing cron-*.sh scripts).
 * Protected by a shared secret so anonymous callers can't spam it.
 *
 * Response shape (see `PollerRunResult`):
 *   { processed, transitions, unchanged, errors, details: [...] }
 */

import { NextRequest } from 'next/server'
import { runStatusPollerTick } from '@/lib/agents/status-poller'

export const runtime = 'nodejs'
export const maxDuration = 60  // seconds — Vercel will cut us off before TTL fires

export async function POST(request: NextRequest) {
  const secret = process.env.AGENT_POLLER_SECRET
  if (!secret) {
    return jsonError(500, 'AGENT_POLLER_SECRET is not configured on this server')
  }
  // Header only — query-param secrets would land in nginx access logs
  const provided = request.headers.get('x-agent-poller-secret')
  if (provided !== secret) {
    return jsonError(401, 'Unauthorized')
  }

  const limitParam = request.nextUrl.searchParams.get('limit')
  const limit = limitParam ? Math.max(1, Math.min(200, Number(limitParam) || 0)) : undefined

  try {
    const result = await runStatusPollerTick({ limit })
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return jsonError(500, String(err?.message ?? err))
  }
}

// Also accept GET for easy curl-testing once authenticated
export async function GET(request: NextRequest) {
  return POST(request)
}

function jsonError(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

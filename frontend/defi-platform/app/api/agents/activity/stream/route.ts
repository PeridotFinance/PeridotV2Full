/**
 * GET /api/agents/activity/stream
 *
 * Server-Sent-Events feed of Agent Action Timeline events for the
 * authenticated user. Replays events since `?since=<iso>` (or defaults to
 * the last 5 minutes) and tails new events via a gentle polling loop.
 *
 * Wire protocol:
 *   event: action_event
 *   data: {"actionId":"…","eventType":"status_change","fromStatus":"bridging",
 *          "toStatus":"succeeded","createdAt":"…","payload":{…}}
 *
 *   event: snapshot
 *   data: {"actions": [...AgentActionSummary]}   // sent once on connect
 *
 *   event: ping
 *   data: {"ts":"…"}                              // every 20s keep-alive
 *
 * Auth is the same Privy Bearer token used by /api/agents/execute. Browsers
 * can't set custom headers on native EventSource — clients use fetch +
 * ReadableStream and parse SSE manually. See `use-agent-activity-stream.ts`.
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateAgentRequest } from '@/lib/agents/auth'
import {
  listActiveActions,
  listUserEventsSince,
  statusLabel,
} from '@/lib/agents/action-timeline'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Max stream duration. After this the client reconnects automatically with
// `?since=<lastEventIso>` and picks up where it left off. Vercel serverless
// caps at 60s; self-hosted PM2 has no ceiling but we still cap for sanity.
export const maxDuration = 55

const POLL_INTERVAL_MS = 2000
const KEEPALIVE_INTERVAL_MS = 20_000

export async function GET(request: NextRequest) {
  // ── Auth: E2E | Privy | Stellar-wallet session (Stufe 3) ───────────
  const auth = await authenticateAgentRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userAddress = auth.userAddress

  // ── Starting cursor ───────────────────────────────────────────────
  const sinceParam = request.nextUrl.searchParams.get('since')
  const defaultSince = new Date(Date.now() - 5 * 60_000).toISOString()
  let cursorIso = isValidIso(sinceParam) ? sinceParam! : defaultSince

  // ── Stream body ───────────────────────────────────────────────────
  const encoder = new TextEncoder()
  const abort = request.signal

  const stream = new ReadableStream({
    async start(controller) {
      const write = (event: string, data: unknown) => {
        if (abort.aborted) return false
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          )
          return true
        } catch {
          // Controller already closed (client disconnected)
          return false
        }
      }

      // 1. Initial snapshot of active actions so the client can paint
      //    current state instantly without waiting for a state change.
      try {
        const active = await listActiveActions(userAddress)
        write('snapshot', {
          actions: active.map((a) => ({
            id: a.id,
            actionType: a.actionType,
            assetSymbol: a.assetSymbol,
            amount: a.amount,
            sourceChainId: a.sourceChainId,
            destinationChainId: a.destinationChainId,
            status: a.status,
            statusLabel: statusLabel(a.status),
            primaryHash: a.primaryHash,
            confirmationToken: a.confirmationToken,
            createdAt: a.createdAt.toISOString(),
            updatedAt: a.updatedAt.toISOString(),
            errorMessage: a.errorMessage,
          })),
          cursor: cursorIso,
        })
      } catch (err) {
        write('error', { message: String((err as Error)?.message ?? err).slice(0, 200) })
      }

      let keepaliveTimer: ReturnType<typeof setInterval> | null = null
      let pollTimer: ReturnType<typeof setInterval> | null = null

      const cleanup = () => {
        if (keepaliveTimer) clearInterval(keepaliveTimer)
        if (pollTimer) clearInterval(pollTimer)
        try { controller.close() } catch {}
      }

      abort.addEventListener('abort', cleanup)

      // 2. Keep-alive pings so proxies don't close the connection.
      keepaliveTimer = setInterval(() => {
        if (!write('ping', { ts: new Date().toISOString() })) cleanup()
      }, KEEPALIVE_INTERVAL_MS)

      // 3. Poll the event log for new rows since the cursor. Simple and
      //    stateless — every tick queries, writes, advances cursor. If the
      //    app later wires Postgres LISTEN/NOTIFY, drop-in replace this.
      pollTimer = setInterval(async () => {
        if (abort.aborted) return
        try {
          const events = await listUserEventsSince(userAddress, cursorIso, { limit: 100 })
          if (events.length === 0) return
          for (const ev of events) {
            if (!write('action_event', {
              actionId: ev.actionId,
              eventType: ev.eventType,
              fromStatus: ev.fromStatus,
              toStatus: ev.toStatus,
              payload: ev.payload,
              createdAt: ev.createdAt.toISOString(),
            })) {
              cleanup()
              return
            }
          }
          cursorIso = events[events.length - 1].createdAt.toISOString()
        } catch (err) {
          // Don't kill the stream on a transient query error — just log it
          write('error', { message: String((err as Error)?.message ?? err).slice(0, 200) })
        }
      }, POLL_INTERVAL_MS)
    },
    cancel() {
      // Handled by the abort listener above. Defensive no-op here.
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',            // disable nginx buffering
    },
  })
}

function isValidIso(s: string | null): boolean {
  if (!s) return false
  const d = new Date(s)
  return !isNaN(d.getTime())
}

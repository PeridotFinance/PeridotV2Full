'use client'

/**
 * use-agent-activity-stream.ts
 *
 * Subscribes to `/api/agents/activity/stream` (Server-Sent-Events) and
 * re-dispatches every event as a typed window event:
 *
 *   peridot:action-snapshot   { actions: [...] }           // once per connect
 *   peridot:action-event      { actionId, eventType, toStatus, ... }
 *
 * Any component that cares about a specific actionId (e.g. ActionButtonBlock)
 * listens on `peridot:action-event` and filters by `actionId`.
 *
 * Why fetch + ReadableStream instead of EventSource:
 *   Browser-native EventSource cannot set custom headers, and our API uses
 *   the same Privy Bearer token as every other agent route. Fetch + manual
 *   SSE parsing keeps the auth path uniform and lets us surface network
 *   errors with context (versus EventSource's opaque onerror).
 *
 * Lifecycle:
 *   - Mounts once per authenticated session (see RootProviders).
 *   - Reconnects on drop / end with the last-seen timestamp so nothing is
 *     missed across the reconnect window.
 *   - Stops when the user signs out (address goes null).
 */

import { useEffect, useRef } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { useActiveWallet } from '@/hooks/use-active-wallet'
import { takeCompleteFrames } from '@/lib/agents/sse-parser'
export { parseFrame, takeCompleteFrames, type ParsedFrame } from '@/lib/agents/sse-parser'

export interface TimelineAction {
  id: string
  actionType: string
  assetSymbol: string
  amount: string
  sourceChainId: number
  destinationChainId: number | null
  status: string
  statusLabel: string
  primaryHash: string | null
  confirmationToken: string | null
  createdAt: string
  updatedAt: string
  errorMessage: string | null
}

export interface TimelineEvent {
  actionId: string
  eventType: string
  fromStatus: string | null
  toStatus: string | null
  payload: Record<string, unknown>
  createdAt: string
}

const SNAPSHOT_EVENT = 'peridot:action-snapshot'
const ACTION_EVENT = 'peridot:action-event'

// Exported so downstream listeners reference the same string constants.
export const ACTION_STREAM_EVENTS = {
  snapshot: SNAPSHOT_EVENT,
  event: ACTION_EVENT,
} as const

/**
 * localStorage-backed cursor so a page reload doesn't erase the stream's
 * position. sessionStorage would be tab-scoped — fine, but reloads also
 * clear sessionStorage in most browsers; localStorage survives both the
 * reload AND cross-tab context, matching the "Activity panel still shows
 * what happened 5 minutes ago" expectation.
 *
 * Scoped per user address so a wallet switch doesn't replay another
 * account's events (which the server would reject anyway, but we avoid the
 * wasted round-trip).
 *
 * Bounded staleness: a cursor older than 30 minutes is discarded — a
 * reload after hours of idle shouldn't try to backfill an enormous event
 * range. The SSE endpoint's own replay cap (5 minutes by default) is the
 * real guardrail, but this keeps the client polite.
 */
const CURSOR_STORAGE_PREFIX = 'peridot:agent:activity-cursor:'
const CURSOR_MAX_AGE_MS = 30 * 60 * 1000

function cursorKey(address: string): string {
  return `${CURSOR_STORAGE_PREFIX}${address.toLowerCase()}`
}

function readPersistedCursor(address: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(cursorKey(address))
    if (!raw) return null
    const parsed = JSON.parse(raw) as { iso: string; ts: number }
    if (!parsed?.iso) return null
    if (Date.now() - (parsed.ts ?? 0) > CURSOR_MAX_AGE_MS) return null
    return parsed.iso
  } catch {
    return null
  }
}

function writePersistedCursor(address: string, iso: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      cursorKey(address),
      JSON.stringify({ iso, ts: Date.now() }),
    )
  } catch {
    // localStorage may be disabled (private mode, quota) — silent degrade
  }
}

export function useAgentActivityStream(): void {
  const { getAccessToken } = usePrivy()
  const { address } = useActiveWallet()
  const runningRef = useRef(false)

  useEffect(() => {
    if (!address) return
    if (runningRef.current) return
    runningRef.current = true

    const controller = new AbortController()
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let cancelReconnect: (() => void) | null = null
    // Seed the cursor from localStorage so a reload picks up where the
    // previous session left off. Any new events advance it; we write back
    // on each advance.
    let cursor: string | null = readPersistedCursor(address)
    let stopped = false

    const run = async (): Promise<void> => {
      while (!stopped) {
        try {
          const token = await getAccessToken()
          if (!token) throw new Error('No auth token')

          const url = cursor
            ? `/api/agents/activity/stream?since=${encodeURIComponent(cursor)}`
            : `/api/agents/activity/stream`

          const res = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
            cache: 'no-store',
          })

          if (!res.ok || !res.body) {
            throw new Error(`Stream returned ${res.status}`)
          }

          const reader = res.body.getReader()
          const decoder = new TextDecoder('utf-8')
          let buf = ''

          while (!stopped) {
            const { value, done } = await reader.read()
            if (done) break
            buf += decoder.decode(value, { stream: true })

            const { frames, remainder } = takeCompleteFrames(buf)
            buf = remainder
            for (const parsed of frames) {
              handleFrame(parsed, (iso) => {
                cursor = iso
                // Persist immediately — a reload two seconds after an event
                // lands should still pick it up next run.
                writePersistedCursor(address, iso)
              })
            }
          }
        } catch (err) {
          if ((err as any)?.name === 'AbortError') return
          // Drop logs to console for debuggability, then back off before
          // reconnecting.
          // eslint-disable-next-line no-console
          console.warn('[activity-stream] disconnected, reconnecting…', err)
        }

        if (stopped) return
        // Exponential-ish backoff capped at 8s; aligns with the ping
        // cadence so we don't hammer the endpoint if it's degraded.
        await new Promise<void>((resolve) => {
          reconnectTimer = setTimeout(resolve, 2000)
          cancelReconnect = resolve
        })
        cancelReconnect = null
      }
    }

    run()

    return () => {
      stopped = true
      controller.abort()
      if (reconnectTimer) clearTimeout(reconnectTimer)
      // Resolve the pending backoff Promise so run() can exit cleanly
      // instead of hanging on an await that would never settle.
      cancelReconnect?.()
      runningRef.current = false
    }
  }, [address, getAccessToken])
}

// Parser helpers live in `lib/agents/sse-parser.ts` (pure functions, no
// DOM deps) so tests can import them without initialising wagmi. Re-exported
// above for backwards compat with earlier imports.

function handleFrame(parsed: ParsedFrame, setCursor: (iso: string) => void): void {
  if (typeof window === 'undefined') return
  switch (parsed.event) {
    case 'snapshot': {
      const detail = parsed.data as { actions: TimelineAction[]; cursor?: string }
      window.dispatchEvent(new CustomEvent(SNAPSHOT_EVENT, { detail }))
      if (detail?.cursor) setCursor(detail.cursor)
      break
    }
    case 'action_event': {
      const detail = parsed.data as TimelineEvent
      window.dispatchEvent(new CustomEvent(ACTION_EVENT, { detail }))
      if (detail?.createdAt) setCursor(detail.createdAt)
      break
    }
    case 'ping':
      // No-op — just keeps the connection warm
      break
    case 'error':
      // eslint-disable-next-line no-console
      console.warn('[activity-stream] server error:', parsed.data)
      break
  }
}

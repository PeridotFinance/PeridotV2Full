'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import type { AgentActionLogEntry } from '@/lib/agents/action-log'

interface UseAgentActivityOptions {
  /** If true, only auto-executed actions are fetched. */
  onlyAuto?: boolean
  /** Max rows (server caps at 100). Default 20. */
  limit?: number
  /** Poll interval in ms. 0 or negative disables polling. Default 15_000. */
  pollIntervalMs?: number
}

interface UseAgentActivityReturn {
  entries: AgentActionLogEntry[]
  isLoading: boolean
  error: string | null
  refresh: () => Promise<void>
}

/**
 * Fetch the authenticated user's agent activity log.
 *
 * Polls at a configurable interval so the Activity Panel stays fresh without
 * needing to listen for custom events from the execute hook. When Privy is not
 * ready we return an empty list rather than throwing — the Activity Panel
 * should degrade gracefully.
 */
export function useAgentActivity(
  options: UseAgentActivityOptions = {},
): UseAgentActivityReturn {
  const { onlyAuto = false, limit = 20, pollIntervalMs = 15_000 } = options
  const { getAccessToken, authenticated } = usePrivy()
  const [entries, setEntries] = useState<AgentActionLogEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Minimum gap between network fetches. Bursts of events (action-logged,
  // timeline transitions, tab focus) can easily queue 3-4 refreshes inside a
  // second; at 180/min for the AGENT_GET bucket we still don't want to burn
  // through our budget faster than necessary. 1500 ms is long enough to
  // coalesce adjacent events, short enough to feel live.
  const MIN_REFRESH_GAP_MS = 1500
  const lastFetchAtRef = useRef<number>(0)
  const pendingTrailingRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Core fetcher — always hits the network. Callers above use `refresh()`
  // which is the debounced wrapper.
  const fetchOnce = useCallback(async () => {
    if (!authenticated) {
      setEntries([])
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const token = await getAccessToken().catch(() => null)
      const params = new URLSearchParams()
      params.set('limit', String(limit))
      if (onlyAuto) params.set('auto', 'true')

      const res = await fetch(`/api/agents/activity?${params.toString()}`, {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      if (!res.ok) {
        throw new Error(`Failed to load activity (${res.status})`)
      }
      const data = (await res.json()) as { entries?: AgentActionLogEntry[] }
      setEntries(data.entries ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load activity')
    } finally {
      setIsLoading(false)
    }
  }, [authenticated, getAccessToken, limit, onlyAuto])

  /**
   * Public refresh: leading-edge execute (if outside the min-gap), trailing-
   * edge schedule for a rapid follow-up. This is important for the flow the
   * user reported — the event bus fires `peridot:agent-action-logged` once,
   * then timeline transitions fire a few times more while the tx settles,
   * and the SSE stream's own state sync lands on top. Without coalescing
   * that's 4-5 fetches in under a second.
   */
  const refresh = useCallback(async () => {
    const now = Date.now()
    const elapsed = now - lastFetchAtRef.current
    if (elapsed >= MIN_REFRESH_GAP_MS) {
      lastFetchAtRef.current = now
      await fetchOnce()
      return
    }
    // Inside the gap — schedule a trailing refresh (or let the existing one
    // run). Coalesces any further calls until the timer fires.
    if (pendingTrailingRef.current) return
    const delay = MIN_REFRESH_GAP_MS - elapsed
    pendingTrailingRef.current = setTimeout(() => {
      pendingTrailingRef.current = null
      lastFetchAtRef.current = Date.now()
      void fetchOnce()
    }, delay)
  }, [fetchOnce])

  // Initial fetch + polling
  useEffect(() => {
    void refresh()
    if (pollIntervalMs > 0) {
      const id = setInterval(() => { void refresh() }, pollIntervalMs)
      return () => clearInterval(id)
    }
  }, [refresh, pollIntervalMs])

  // Clean up the trailing timer on unmount so we don't trigger a stale fetch
  // after navigation.
  useEffect(() => () => {
    if (pendingTrailingRef.current) {
      clearTimeout(pendingTrailingRef.current)
      pendingTrailingRef.current = null
    }
  }, [])

  // Phase 7.1.1: listen for the custom event that `use-agent-execution`
  // dispatches after a successful PATCH. Immediate refresh so the sidebar
  // entry appears without waiting for the next poll tick.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const handler = () => {
      void refresh()
    }
    window.addEventListener('peridot:agent-action-logged', handler)
    return () => {
      window.removeEventListener('peridot:agent-action-logged', handler)
    }
  }, [refresh])

  return { entries, isLoading, error, refresh }
}

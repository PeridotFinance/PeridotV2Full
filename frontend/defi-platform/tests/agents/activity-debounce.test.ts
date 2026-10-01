/**
 * useAgentActivity coalesces rapid refresh calls so a storm of
 * peridot:agent-action-logged + timeline events during a tx flow doesn't
 * burn through the AGENT_GET budget.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// ── Mocks ────────────────────────────────────────────────────────────
const { mockGetAccessToken, mockFetch } = vi.hoisted(() => ({
  mockGetAccessToken: vi.fn().mockResolvedValue('t'),
  mockFetch: vi.fn(),
}))

vi.mock('@privy-io/react-auth', () => ({
  usePrivy: () => ({ authenticated: true, getAccessToken: mockGetAccessToken }),
}))

describe('useAgentActivity — refresh coalescing', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockFetch.mockReset()
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ entries: [] }),
    })
    globalThis.fetch = mockFetch as any
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('fires one network call on mount (leading edge)', async () => {
    const { useAgentActivity } = await import('@/hooks/use-agent-activity')
    renderHook(() => useAgentActivity({ pollIntervalMs: 0, limit: 20 }))
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('coalesces a burst of refreshes within the 1.5s gap into a single trailing call', async () => {
    const { useAgentActivity } = await import('@/hooks/use-agent-activity')
    const { result } = renderHook(() =>
      useAgentActivity({ pollIntervalMs: 0, limit: 20 }),
    )
    // Mount fetch settles
    await act(async () => { await vi.advanceTimersByTimeAsync(50) })
    expect(mockFetch).toHaveBeenCalledTimes(1)

    // Blast 5 refresh calls in ~300 ms total — all should coalesce
    await act(async () => {
      for (let i = 0; i < 5; i++) {
        void result.current.refresh()
        await vi.advanceTimersByTimeAsync(50)
      }
    })
    // Still only 1 request so far (inside the 1500 ms gap)
    expect(mockFetch).toHaveBeenCalledTimes(1)

    // Advance past the gap — the trailing refresh fires once
    await act(async () => { await vi.advanceTimersByTimeAsync(1500) })
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('allows a leading refresh again after the gap expires', async () => {
    const { useAgentActivity } = await import('@/hooks/use-agent-activity')
    const { result } = renderHook(() =>
      useAgentActivity({ pollIntervalMs: 0, limit: 20 }),
    )
    await act(async () => { await vi.advanceTimersByTimeAsync(50) })
    expect(mockFetch).toHaveBeenCalledTimes(1)

    // Wait past the gap
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })

    // Now a refresh is leading-edge again — immediate
    await act(async () => { void result.current.refresh() })
    await act(async () => { await vi.advanceTimersByTimeAsync(50) })
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('responds to peridot:agent-action-logged but still coalesces', async () => {
    const { useAgentActivity } = await import('@/hooks/use-agent-activity')
    renderHook(() => useAgentActivity({ pollIntervalMs: 0, limit: 20 }))
    await act(async () => { await vi.advanceTimersByTimeAsync(50) })
    expect(mockFetch).toHaveBeenCalledTimes(1)

    // Fire three events in quick succession — they should produce at most
    // one trailing fetch (same coalescing rule).
    await act(async () => {
      for (let i = 0; i < 3; i++) {
        window.dispatchEvent(new CustomEvent('peridot:agent-action-logged'))
        await vi.advanceTimersByTimeAsync(100)
      }
    })
    expect(mockFetch).toHaveBeenCalledTimes(1)

    await act(async () => { await vi.advanceTimersByTimeAsync(1500) })
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })
})

/**
 * Tests — useLiveEarnings.
 *
 * Drives requestAnimationFrame and performance.now() by hand so the accrual is
 * deterministic. Covers the three behaviours the counter depends on:
 * it climbs, a server correction snaps it, and a rate change (React Query
 * refetching the balance every 10-30s) does NOT yank it backwards.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { useLiveEarnings } from "@/components/shared/LiveEarnings"

let now = 0
let frames: Array<(t: number) => void> = []

/** Advance the clock and run one frame. */
function advance(ms: number) {
  now += ms
  const due = frames
  frames = []
  act(() => {
    due.forEach((cb) => cb(now))
  })
}

beforeEach(() => {
  now = 0
  frames = []
  vi.stubGlobal("requestAnimationFrame", (cb: (t: number) => void) => {
    frames.push(cb)
    return frames.length
  })
  vi.stubGlobal("cancelAnimationFrame", () => {})
  vi.spyOn(performance, "now").mockImplementation(() => now)
  // jsdom has no matchMedia; the hook must not assume one exists.
  vi.stubGlobal("matchMedia", undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("useLiveEarnings", () => {
  it("starts at the base and accrues at the given rate", () => {
    const { result } = renderHook(() => useLiveEarnings(10, 0.5))
    expect(result.current).toBe(10)

    advance(100) // first frame is throttled out (< 60ms gate is passed here)
    advance(1000)
    expect(result.current).toBeCloseTo(10 + 1.1 * 0.5, 6)
  })

  it("does not move when the rate is zero", () => {
    const { result } = renderHook(() => useLiveEarnings(7, 0))
    advance(5000)
    expect(result.current).toBe(7)
  })

  it("snaps to a corrected base from the server", () => {
    const { result, rerender } = renderHook(
      ({ base }) => useLiveEarnings(base, 0.5),
      { initialProps: { base: 10 } }
    )
    advance(1000)
    expect(result.current).toBeGreaterThan(10)

    rerender({ base: 20 })
    expect(result.current).toBe(20)
  })

  // The old 24h delta reset nothing, but a naive counter that re-anchors on
  // every input change would visibly jump backwards each time the balance
  // refetches — worse than the stuck zero it replaces.
  it("keeps what has accrued when only the rate changes", () => {
    const { result, rerender } = renderHook(
      ({ perSecond }) => useLiveEarnings(10, perSecond),
      { initialProps: { perSecond: 0.5 } }
    )
    advance(1000)
    const before = result.current
    expect(before).toBeGreaterThan(10)

    rerender({ perSecond: 1 })
    expect(result.current).toBe(before) // no jump on the switch itself

    advance(1000)
    expect(result.current).toBeGreaterThan(before) // and it keeps climbing
  })
})

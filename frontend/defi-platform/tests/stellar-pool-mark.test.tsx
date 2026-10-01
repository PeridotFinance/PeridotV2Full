/**
 * useStellarPoolMarks — the mark that keeps live PnL in the same price domain as
 * the entry. The pool quote is mocked; what's under test is the hook's contract:
 * quote per position at its real size, carry the feed's drift between quotes, and
 * never invent a mark it doesn't have.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"

const estimatePoolSwap = vi.fn()
vi.mock("@/lib/stellar-margin", () => ({ estimatePoolSwap: (...a: unknown[]) => estimatePoolSwap(...a) }))

import { useStellarPoolMarks } from "@/app/app/margin/hooks/use-stellar-pool-mark"

const LONG = { id: "42", side: "Long" as const, collateralAmount: 500 }

beforeEach(() => {
  estimatePoolSwap.mockReset()
})
afterEach(() => {
  vi.useRealTimers()
})

describe("useStellarPoolMarks", () => {
  it("prices a Long's exit from what the pool would pay for its actual size", async () => {
    // 500 XLM out → 82.5 USDT back = $0.165.
    estimatePoolSwap.mockResolvedValue(BigInt(825_000_000))
    const { result } = renderHook(() =>
      useStellarPoolMarks({ positions: [LONG], feedPrice: 0.18, enabled: true }),
    )
    await waitFor(() => expect(result.current["42"]).toBeDefined())
    expect(result.current["42"]).toBeCloseTo(0.165, 6)
    // Quoted at the position's own size, not some reference notional.
    expect(estimatePoolSwap).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), BigInt(5_000_000_000))
  })

  it("carries the feed's move between quotes so the ticker keeps ticking", async () => {
    estimatePoolSwap.mockResolvedValue(BigInt(825_000_000))
    const { result, rerender } = renderHook(
      ({ feed }) => useStellarPoolMarks({ positions: [LONG], feedPrice: feed, enabled: true }),
      { initialProps: { feed: 0.18 } },
    )
    await waitFor(() => expect(result.current["42"]).toBeDefined())
    const before = result.current["42"]

    // Feed ticks up a cent with no new quote: the mark moves by the same amount,
    // keeping the pool-vs-feed basis intact.
    rerender({ feed: 0.19 })
    expect(result.current["42"]).toBeCloseTo(before + 0.01, 6)
    // …and it did NOT re-quote just because the feed ticked.
    expect(estimatePoolSwap).toHaveBeenCalledTimes(1)
  })

  it("omits a position whose quote fails, so the caller falls back to the feed", async () => {
    estimatePoolSwap.mockRejectedValue(new Error("rpc down"))
    const { result } = renderHook(() =>
      useStellarPoolMarks({ positions: [LONG], feedPrice: 0.18, enabled: true }),
    )
    await waitFor(() => expect(estimatePoolSwap).toHaveBeenCalled())
    expect(result.current["42"]).toBeUndefined()
  })

  it("quotes nothing when disabled", async () => {
    estimatePoolSwap.mockResolvedValue(BigInt(825_000_000))
    renderHook(() => useStellarPoolMarks({ positions: [LONG], feedPrice: 0.18, enabled: false }))
    await new Promise((r) => setTimeout(r, 20))
    expect(estimatePoolSwap).not.toHaveBeenCalled()
  })

  it("drops marks for positions that are gone", async () => {
    estimatePoolSwap.mockResolvedValue(BigInt(825_000_000))
    const { result, rerender } = renderHook(
      ({ positions }) => useStellarPoolMarks({ positions, feedPrice: 0.18, enabled: true }),
      { initialProps: { positions: [LONG] } },
    )
    await waitFor(() => expect(result.current["42"]).toBeDefined())
    rerender({ positions: [] })
    await waitFor(() => expect(result.current["42"]).toBeUndefined())
  })
})

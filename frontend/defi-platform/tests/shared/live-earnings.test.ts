/**
 * Tests — live earnings accrual math.
 *
 * The point of the counter is that it always shows digits that actually move.
 * These lock in the two properties that guarantee it: the per-second rate, and
 * the adaptive decimal count that keeps the last digit changing ~1×/second
 * regardless of balance size.
 */

import { describe, it, expect } from "vitest"
import {
  earningsPerSecond,
  accrualDecimals,
  splitAccrual,
} from "@/components/shared/LiveEarnings"

describe("earningsPerSecond", () => {
  it("converts APY to a per-second rate", () => {
    // $100 at 5% → $5/year → $5 / 31,536,000s
    expect(earningsPerSecond(100, 5)).toBeCloseTo(5 / 31_536_000, 12)
  })

  it("is zero without a balance or a rate", () => {
    expect(earningsPerSecond(0, 5)).toBe(0)
    expect(earningsPerSecond(100, 0)).toBe(0)
    expect(earningsPerSecond(-100, 5)).toBe(0)
  })
})

describe("accrualDecimals", () => {
  it("gives small balances enough digits to visibly move", () => {
    // $50 at 5% → $0.0000068/s. Two decimals would never change.
    const d = accrualDecimals(earningsPerSecond(50, 5))
    expect(d).toBeGreaterThan(2)
    expect(10 ** -d).toBeLessThanOrEqual(earningsPerSecond(50, 5) * 10)
  })

  it("gives large balances fewer digits", () => {
    const small = accrualDecimals(earningsPerSecond(50, 5))
    const large = accrualDecimals(earningsPerSecond(500_000, 5))
    expect(large).toBeLessThan(small)
  })

  it("stays within the readable 2–8 range", () => {
    expect(accrualDecimals(0)).toBe(2)
    expect(accrualDecimals(1000)).toBe(2)
    expect(accrualDecimals(1e-30)).toBe(8)
  })
})

describe("splitAccrual", () => {
  it("keeps cents in the head and the fast digits in the tail", () => {
    expect(splitAccrual(46.951234, 6)).toEqual({ head: "46.95", tail: "1234" })
  })

  it("emits an empty tail at cents precision", () => {
    expect(splitAccrual(3.5, 2)).toEqual({ head: "3.50", tail: "" })
  })

  it("clamps negatives to zero rather than rendering '+$-0.01'", () => {
    expect(splitAccrual(-1, 2).head).toBe("0.00")
  })
})

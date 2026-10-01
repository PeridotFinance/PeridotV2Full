/**
 * Trade-journal math: realized PnL pairing + entry-domain liquidation direction.
 * Pure helpers only — no DB, no chain (the journal's SQL is integration-tested
 * against a live DATABASE_URL, not here).
 */
import { describe, it, expect } from "vitest"
import { computeRealizedPnl, liquidationPrice, evaluateTpSlTrigger } from "@/app/app/margin/lib/marginMath"

describe("computeRealizedPnl", () => {
  it("longs profit as price rises", () => {
    // bought 100 XLM exposure at $0.30, exit $0.40 → +$10
    expect(computeRealizedPnl({ side: "Long", entry: 0.3, exit: 0.4, xlmAmount: 100 })).toBeCloseTo(10, 6)
  })

  it("longs lose as price falls", () => {
    expect(computeRealizedPnl({ side: "Long", entry: 0.4, exit: 0.3, xlmAmount: 100 })).toBeCloseTo(-10, 6)
  })

  it("shorts profit as price falls", () => {
    // owe 100 XLM at $0.40, buy back at $0.30 → +$10
    expect(computeRealizedPnl({ side: "Short", entry: 0.4, exit: 0.3, xlmAmount: 100 })).toBeCloseTo(10, 6)
  })

  it("shorts lose as price rises", () => {
    expect(computeRealizedPnl({ side: "Short", entry: 0.3, exit: 0.4, xlmAmount: 100 })).toBeCloseTo(-10, 6)
  })

  it("returns null on any missing input", () => {
    expect(computeRealizedPnl({ side: "Long", entry: null, exit: 0.4, xlmAmount: 100 })).toBeNull()
    expect(computeRealizedPnl({ side: "Long", entry: 0.3, exit: null, xlmAmount: 100 })).toBeNull()
    expect(computeRealizedPnl({ side: "Long", entry: 0.3, exit: 0.4, xlmAmount: null })).toBeNull()
    expect(computeRealizedPnl({ side: null, entry: 0.3, exit: 0.4, xlmAmount: 100 })).toBeNull()
  })

  it("is symmetric: a long's gain equals the opposing short's loss", () => {
    const long = computeRealizedPnl({ side: "Long", entry: 0.35, exit: 0.5, xlmAmount: 250 })!
    const short = computeRealizedPnl({ side: "Short", entry: 0.35, exit: 0.5, xlmAmount: 250 })!
    expect(long).toBeCloseTo(-short, 6)
  })
})

describe("liquidationPrice anchored on the entry price (chart overlay domain)", () => {
  // The chart computes the liq line using the real-feed entry price as the anchor,
  // so the line must fall on the correct side of entry regardless of price scale.
  const base = { collateralUsd: 300, debtUsd: 200, maintenanceMargin: 0.05 }

  it("a long liquidates below its entry", () => {
    const entry = 0.32
    const liq = liquidationPrice({ side: "Long", ...base, price: entry })!
    expect(liq).toBeGreaterThan(0)
    expect(liq).toBeLessThan(entry)
  })

  it("a short liquidates above its entry", () => {
    const entry = 0.32
    const liq = liquidationPrice({ side: "Short", ...base, price: entry })!
    expect(liq).toBeGreaterThan(entry)
  })

  it("scales linearly with the anchor price (domain-invariant ratio)", () => {
    const a = liquidationPrice({ side: "Long", ...base, price: 0.3 })!
    const b = liquidationPrice({ side: "Long", ...base, price: 0.6 })!
    expect(b / a).toBeCloseTo(2, 6)
  })
})

describe("evaluateTpSlTrigger (client monitor crossing logic)", () => {
  it("long: TP fires at/above target, not below", () => {
    const t = { side: "Long" as const, takeProfit: 0.25, stopLoss: 0.18 }
    expect(evaluateTpSlTrigger({ ...t, price: 0.25 })).toBe("tp")
    expect(evaluateTpSlTrigger({ ...t, price: 0.26 })).toBe("tp")
    expect(evaluateTpSlTrigger({ ...t, price: 0.20 })).toBeNull()
  })

  it("long: SL fires at/below target", () => {
    const t = { side: "Long" as const, takeProfit: 0.25, stopLoss: 0.18 }
    expect(evaluateTpSlTrigger({ ...t, price: 0.18 })).toBe("sl")
    expect(evaluateTpSlTrigger({ ...t, price: 0.15 })).toBe("sl")
    expect(evaluateTpSlTrigger({ ...t, price: 0.19 })).toBeNull()
  })

  it("short: directions invert (TP below, SL above)", () => {
    const t = { side: "Short" as const, takeProfit: 0.15, stopLoss: 0.25 }
    expect(evaluateTpSlTrigger({ ...t, price: 0.15 })).toBe("tp")
    expect(evaluateTpSlTrigger({ ...t, price: 0.12 })).toBe("tp")
    expect(evaluateTpSlTrigger({ ...t, price: 0.25 })).toBe("sl")
    expect(evaluateTpSlTrigger({ ...t, price: 0.28 })).toBe("sl")
    expect(evaluateTpSlTrigger({ ...t, price: 0.20 })).toBeNull()
  })

  it("ignores unset triggers and non-positive prices", () => {
    expect(evaluateTpSlTrigger({ side: "Long", takeProfit: null, stopLoss: null, price: 0.2 })).toBeNull()
    expect(evaluateTpSlTrigger({ side: "Long", takeProfit: 0.25, stopLoss: 0.18, price: 0 })).toBeNull()
    // only one side set
    expect(evaluateTpSlTrigger({ side: "Long", takeProfit: 0.25, stopLoss: null, price: 0.26 })).toBe("tp")
    expect(evaluateTpSlTrigger({ side: "Long", takeProfit: null, stopLoss: 0.18, price: 0.10 })).toBe("sl")
  })
})

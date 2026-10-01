/**
 * How far a position is from being liquidated, expressed the way a trader
 * measures risk.
 *
 * The panel used to show the liquidation PRICE alone. On its own that number
 * says nothing: $0.0912 is only alarming next to the current price, and only
 * *urgent* next to how far XLM tends to move in a day. The health factor was
 * meant to answer this, but 1.34 is a lending-desk ratio with no unit anyone
 * trades in.
 *
 * The two things that make this safe to put on screen are the direction (a long
 * dies on the way down, a short on the way up — get that backwards and the panel
 * calls the safest position the most dangerous one) and the floor at zero (a
 * position already past its liquidation price has no room left, not negative
 * room).
 */
import { describe, it, expect } from "vitest"

import { liquidationDistancePct, computeUnrealizedPnl } from "@/app/app/margin/lib/marginMath"

describe("liquidationDistancePct", () => {
  it("measures a long's room as the fall it can still take", () => {
    // Liquidation 20% below the mark.
    const pct = liquidationDistancePct({ side: "Long", liqPrice: 0.08, price: 0.1 })
    expect(pct).toBeCloseTo(20, 6)
  })

  it("measures a short's room as the rise it can still take", () => {
    const pct = liquidationDistancePct({ side: "Short", liqPrice: 0.12, price: 0.1 })
    expect(pct).toBeCloseTo(20, 6)
  })

  it("does not report a long as safe when its liquidation sits ABOVE the price", () => {
    // The sign error this guards against would have printed "+20% away" on a
    // position that is already gone.
    expect(liquidationDistancePct({ side: "Long", liqPrice: 0.12, price: 0.1 })).toBe(0)
    expect(liquidationDistancePct({ side: "Short", liqPrice: 0.08, price: 0.1 })).toBe(0)
  })

  it("passes a missing liquidation price straight through as unknown", () => {
    expect(liquidationDistancePct({ side: "Long", liqPrice: null, price: 0.1 })).toBeNull()
    expect(liquidationDistancePct({ side: "Long", liqPrice: 0.08, price: 0 })).toBeNull()
  })

  it("scales with leverage the way the position does", () => {
    // Same 5% maintenance margin, more borrow → less room. The panel's colour
    // steps (8% / 15%) are calibrated on this being a real ordering.
    const wide = liquidationDistancePct({ side: "Long", liqPrice: 0.05, price: 0.1 })!
    const tight = liquidationDistancePct({ side: "Long", liqPrice: 0.095, price: 0.1 })!
    expect(wide).toBeGreaterThan(tight)
    expect(tight).toBeLessThan(8)
  })
})

/**
 * The figures the row now SHOWS rather than merely uses. `computeUnrealizedPnl`
 * always returned the gross leg, the interest leg and the price move; the panel
 * displayed the net number alone, which is why funding could be read as an
 * unapplied cost sitting in its own column.
 */
describe("PnL breakdown surfaced by the row", () => {
  const long = () =>
    computeUnrealizedPnl({
      side: "Long",
      entry: 0.1,
      current: 0.11,
      xlmAmount: 1000,
      leverage: 5,
      interestUsd: 1,
    })!

  it("nets funding out of the gross price move exactly once", () => {
    const r = long()
    expect(r.grossPnlUsd).toBeCloseTo(10, 6)
    expect(r.interestUsd).toBeCloseTo(1, 6)
    // What the cell prints, and what the tooltip's arithmetic has to add up to.
    expect(r.pnlUsd).toBeCloseTo(r.grossPnlUsd - r.interestUsd, 6)
  })

  it("reports the price move separately from the leveraged return", () => {
    const r = long()
    expect(r.pricePct).toBeCloseTo(10, 6)
    // Stake = 1000 XLM × $0.10 / 5× = $20; $9 net on $20.
    expect(r.roe).toBeCloseTo(45, 6)
    // The relationship the tooltip claims: ROE is the price move times leverage,
    // less funding's share. Gross-only it is exact.
    expect((r.grossPnlUsd / (1000 * 0.1)) * 100 * 5).toBeCloseTo(r.pricePct * 5, 6)
  })

  it("inverts the price move for a short", () => {
    const r = computeUnrealizedPnl({ side: "Short", entry: 0.1, current: 0.09, xlmAmount: 1000, leverage: 2 })!
    expect(r.pricePct).toBeCloseTo(10, 6)
    expect(r.pnlUsd).toBeCloseTo(10, 6)
  })
})

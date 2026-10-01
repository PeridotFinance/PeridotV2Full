/**
 * Which price the chart's entry line is drawn at.
 *
 * Two prices exist per position and they are not interchangeable:
 *
 *   fill  — what the opening swap got in the Aquarius pool (`entry_price_usd`).
 *           PnL is measured against a pool mark, so PnL must use this.
 *   feed  — where the real market was at that moment (`feed_price_usd`).
 *           The chart draws Binance candles, so the chart must use this.
 *
 * Mixing them is what put a Long's entry line at 0.1617 over candles trading at
 * 0.1608 (testnet 2026-08-11) — a position that looked opened above the market
 * when it had simply paid the pool's spread. The testnet pool has sat as much as
 * ~9% from spot, so this is not a rounding-scale problem.
 *
 * The gap is not correctable after the fact: the pool-vs-market basis drifts, so
 * no measurement taken today reconstructs where the market was at an older open.
 * That is why the anchor is recorded rather than derived, and why the fallback
 * below matters — a position without one has to keep SOME line.
 */
import { describe, it, expect } from "vitest"
import { resolveChartEntries } from "@/app/app/margin/lib/marginMath"

// The live figures from the report, in both domains.
const FILL = 0.1617
const FEED = 0.1608

describe("resolveChartEntries", () => {
  it("draws the market anchor, not the pool fill, when both exist", () => {
    const out = resolveChartEntries({ "41": FILL }, { "41": FEED })
    expect(out["41"]).toBe(FEED)
  })

  it("keeps the fill as the line when no anchor was recorded", () => {
    // Opens journalled before `feed_price_usd` existed. Losing
    // the correction is fine; losing the line is not.
    const out = resolveChartEntries({ "41": FILL }, {})
    expect(out["41"]).toBe(FILL)
  })

  it("resolves each position independently", () => {
    const out = resolveChartEntries(
      { "41": FILL, "42": 0.2 },
      { "41": FEED },
    )
    expect(out).toEqual({ "41": FEED, "42": 0.2 })
  })

  it("still yields a line for a position present only as an anchor", () => {
    // The bridge stamps the live feed for a just-opened position whose journal
    // row is in flight, so the anchor can land before the fill does.
    expect(resolveChartEntries({}, { "41": FEED })).toEqual({ "41": FEED })
  })

  it("mutates neither input", () => {
    const fills = { "41": FILL }
    const anchors = { "41": FEED }
    resolveChartEntries(fills, anchors)
    expect(fills).toEqual({ "41": FILL })
    expect(anchors).toEqual({ "41": FEED })
  })

  it("is empty when nothing is known — no line beats a fabricated one", () => {
    expect(resolveChartEntries({}, {})).toEqual({})
  })
})

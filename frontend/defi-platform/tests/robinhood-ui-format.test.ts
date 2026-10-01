import { describe, expect, it } from "vitest"
import {
  formatLeverage,
  formatNvda18Display,
  formatSharesAsUsdg,
  formatUsd18Display,
  formatUsdNumber,
  maxMarginSharesForFee,
  parseUsdgInput,
  sharesForUsd18,
  sharesForUsdg6,
} from "@/app/app/margin/robinhood/lib/format"
import { underlyingFromShares } from "@/lib/robinhood/units"

// Live pUSDG rate from 2026-09-21: 1 share (1e-8) redeems for 2.0000175e-4 USDG6.
const RATE = 200001750000000n

describe("robinhood UI formatting", () => {
  it("keeps cents readable on a $2-cap product", () => {
    expect(formatUsdNumber(0.0009)).toBe("$0.0009")
    expect(formatUsdNumber(1.5)).toBe("$1.50")
    expect(formatUsdNumber(0)).toBe("$0.00")
    expect(formatUsdNumber(-0.25)).toBe("-$0.2500")
    expect(formatUsd18Display(-(10n ** 17n))).toBe("-$0.1000")
    expect(formatUsd18Display(null)).toBe("n/a")
  })

  it("formats NVDA and leverage without inventing precision", () => {
    expect(formatNvda18Display(1_293_784_922_654_800n)).toBe("0.001294 NVDA")
    expect(formatNvda18Display(10n ** 18n)).toBe("1 NVDA")
    expect(formatLeverage(null)).toBe("n/a")
    expect(formatLeverage(2.987)).toBe("2.99x")
  })

  it("parses only plain positive decimals within USDG precision", () => {
    expect(parseUsdgInput("1.5")).toBe(1_500_000n)
    expect(parseUsdgInput("0,25")).toBe(250_000n)
    expect(parseUsdgInput(".5")).toBe(500_000n)
    expect(parseUsdgInput("0")).toBeNull()
    expect(parseUsdgInput("")).toBeNull()
    expect(parseUsdgInput("1e3")).toBeNull()
    expect(parseUsdgInput("-1")).toBeNull()
    expect(parseUsdgInput("1.0000001")).toBeNull()
  })

  it("converts USDG to shares rounding down, so the form never overshoots", () => {
    const shares = sharesForUsdg6(5_000_000n, RATE)
    expect(underlyingFromShares(shares, RATE)).toBeLessThanOrEqual(5_000_000n)
    expect(underlyingFromShares(shares + 1n, RATE)).toBeGreaterThan(4_999_999n)
    expect(sharesForUsdg6(1n, 0n)).toBe(0n)
    expect(formatSharesAsUsdg(shares, RATE)).toBe("$5.00")
    expect(formatSharesAsUsdg(shares, null)).toBe("n/a")
  })

  it("prices a USD18 cap hint into shares at the USDG price", () => {
    // $0.49 at USDG = $1.00
    const shares = sharesForUsd18(49n * 10n ** 16n, 10n ** 18n, RATE)
    expect(underlyingFromShares(shares, RATE)).toBeLessThanOrEqual(490_000n)
    expect(underlyingFromShares(shares, RATE)).toBeGreaterThan(489_990n)
  })

  it("leaves room for the fee ceiling when proposing Max", () => {
    expect(maxMarginSharesForFee(1_000_000n, 0, 500, 50)).toBe(1_000_000n)
    expect(maxMarginSharesForFee(0n, 10, 500, 50)).toBe(0n)
    const free = 100_000_000n
    const bps = 10
    const lev = 500
    const max = maxMarginSharesForFee(free, bps, lev, 50)
    // fee = margin * 5 * 0.001 = 0.5%, ceiling = fee * 1.005 + 1
    const fee = (max * BigInt(lev) * BigInt(bps) + 999_999n) / 1_000_000n
    const ceiling = fee + (fee * 50n + 9_999n) / 10_000n
    expect(max + ceiling).toBeLessThanOrEqual(free)
    expect(max).toBeGreaterThan((free * 99n) / 100n)
  })
})

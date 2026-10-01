import { describe, it, expect } from "vitest"
import { supplyMaxAmount } from "@/lib/supply-max"

describe("supplyMaxAmount", () => {
  it("keeps 10% back on native XLM", () => {
    expect(supplyMaxAmount(100, "xlm-stellar")).toBeCloseTo(90)
    expect(supplyMaxAmount(100, "xlm")).toBeCloseTo(90)
  })
  it("fills the full balance for stablecoins", () => {
    expect(supplyMaxAmount(100, "usdc-stellar")).toBe(100)
    expect(supplyMaxAmount(100, "eurc-stellar")).toBe(100)
    expect(supplyMaxAmount(100, "usdt")).toBe(100)
  })
  it("handles empty/invalid balances", () => {
    expect(supplyMaxAmount(0, "xlm-stellar")).toBe(0)
    expect(supplyMaxAmount(NaN, "usdc")).toBe(0)
  })
})

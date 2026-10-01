import { describe, expect, it } from "vitest"
import { exposureMultiple, liquidationMove, riskMood, scenarioAt } from "@/lib/robinhood/scenario"

const base = { marginUsd: 1, leverage: 5, maintenanceBps: 929, openFeeBps: 0, closeFeeBps: 0 }

describe("robinhood scenario", () => {
  it("counts the short's margin as part of the position", () => {
    expect(exposureMultiple("long", 3)).toBe(3)
    expect(exposureMultiple("short", 3)).toBe(2)
  })

  it("reproduces the guide's fork measurement for a 5x long", () => {
    expect(liquidationMove("long", 5, 929)!).toBeCloseTo(-0.1181, 3)
  })

  it("puts a short's liquidation above the price", () => {
    const m = liquidationMove("short", 5, 929)!
    expect(m).toBeGreaterThan(0.1)
    expect(m).toBeLessThan(0.15)
  })

  it("has no liquidation without debt or maintenance", () => {
    expect(liquidationMove("long", 1, 929)).toBeNull()
    expect(liquidationMove("long", 3, null)).toBeNull()
  })

  it("scales P&L by exposure and subtracts fees", () => {
    expect(scenarioAt({ ...base, direction: "long", leverage: 2 }, 0.1).pnlUsd).toBeCloseTo(0.2)
    expect(scenarioAt({ ...base, direction: "short", leverage: 2 }, 0.1).pnlUsd).toBeCloseTo(-0.1)
    const withFees = scenarioAt({ ...base, direction: "long", leverage: 2, openFeeBps: 10, closeFeeBps: 10 }, 0)
    expect(withFees.pnlUsd).toBeCloseTo(-0.004)
  })

  it("never loses more than the margin and flags liquidation", () => {
    const p = scenarioAt({ ...base, direction: "long" }, -0.5)
    expect(p.pnlUsd).toBe(-1)
    expect(p.liquidated).toBe(true)
    expect(scenarioAt({ ...base, direction: "long" }, -0.05).liquidated).toBe(false)
  })

  it("grades risk by the distance to liquidation", () => {
    expect(riskMood(null)).toBe("calm")
    expect(riskMood(-0.45)).toBe("calm")
    expect(riskMood(-0.2)).toBe("balanced")
    expect(riskMood(0.12)).toBe("bold")
    expect(riskMood(-0.05)).toBe("wild")
  })
})

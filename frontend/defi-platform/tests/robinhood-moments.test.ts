/**
 * The rules behind the Robinhood margin result moments: how loud a close is
 * celebrated (graded by return on margin, never by dollars), when a result is
 * break-even, and which single fix an error offers. A cancelled signature
 * must never read as an error.
 */
import { describe, expect, it } from "vitest"
import { closeVerdict, errorMoment, FLAT_EPSILON_USD, lowerLeverage, WIN_TIERS } from "@/lib/robinhood/moments"

describe("closeVerdict", () => {
  it("calls a result under the displayed precision break-even", () => {
    expect(closeVerdict(FLAT_EPSILON_USD / 2, 0.01)).toEqual({ tone: "flat", tier: null })
    expect(closeVerdict(-FLAT_EPSILON_USD / 2, -0.01)).toEqual({ tone: "flat", tier: null })
  })

  it("grades a win by return on margin, not by dollars", () => {
    expect(closeVerdict(0.02, 2).tier).toBe("small")
    expect(closeVerdict(0.02, WIN_TIERS.medium).tier).toBe("medium")
    expect(closeVerdict(0.02, WIN_TIERS.big).tier).toBe("big")
    // A large dollar win on a large stake is still a small return.
    expect(closeVerdict(500, 1).tier).toBe("small")
  })

  it("never celebrates a loss", () => {
    expect(closeVerdict(-0.3, -30)).toEqual({ tone: "loss", tier: null })
  })

  it("treats an unknown return as the smallest win", () => {
    expect(closeVerdict(0.5, null)).toEqual({ tone: "win", tier: "small" })
  })
})

describe("errorMoment", () => {
  it("keeps a cancelled signature quiet", () => {
    expect(errorMoment("rejected").quiet).toBe(true)
  })

  it("offers the fix that changes the outcome", () => {
    expect(errorMoment("fee").remedy).toBe("requote")
    expect(errorMoment("swap").remedy).toBe("requote")
    expect(errorMoment("cap").remedy).toBe("max")
    expect(errorMoment("margin").remedy).toBe("leverage")
    expect(errorMoment("opens-paused").remedy).toBe("none")
    expect(errorMoment("unknown").remedy).toBe("retry")
  })
})

describe("lowerLeverage", () => {
  it("steps down and stops at the floor", () => {
    expect(lowerLeverage(5)).toBe(4)
    expect(lowerLeverage(3)).toBe(2)
    expect(lowerLeverage(2)).toBe(1.5)
    expect(lowerLeverage(1.5)).toBe(1.1)
    expect(lowerLeverage(1.1)).toBe(1.1)
  })
})

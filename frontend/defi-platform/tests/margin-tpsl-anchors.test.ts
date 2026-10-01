/**
 * What a trigger is measured against, and how close it may sit.
 *
 * Two gaps left over from the first pass at `validateTpSlDraft`:
 *
 * 1. It compared triggers to the MARK. The trader doesn't get the mark — the pool
 *    fills the order at its own price, a percent or more away at size. A long
 *    take-profit set just above spot could therefore sit below what the trader
 *    actually paid: it passed validation, fired, and booked a loss under the
 *    label "take-profit".
 *
 * 2. It accepted any distance at all. A stop-loss a hundredth of a percent under
 *    spot is carried through by ordinary tick noise within seconds, so what the
 *    trader gets is an instant round trip and two sets of fees.
 *
 * The anchors are asymmetric on purpose — each row is measured against whichever
 * of mark/fill is the more demanding in that row's direction — so the cases below
 * check both sides for both rows rather than trusting the symmetry.
 */
import { describe, it, expect } from "vitest"
import {
  validateTpSlDraft,
  tpSlAnchors,
  formatTriggerPrice,
  MIN_TRIGGER_DISTANCE_PCT,
} from "../app/app/margin/lib/marginMath"

const MARK = 0.35

/** A long pays MORE than the mark; a short receives LESS. */
const LONG_FILL = 0.3535 // +1%
const SHORT_FILL = 0.3465 // −1%

describe("tpSlAnchors", () => {
  it("collapses onto the mark when there is no fill quote", () => {
    const a = tpSlAnchors({ side: "Long", mark: MARK })
    expect(a.tpAnchor).toBe(MARK)
    expect(a.slAnchor).toBe(MARK)
    expect(a.usesFill).toBe(false)
  })

  it("makes a long's take-profit clear the fill and its stop-loss clear the mark", () => {
    // Long fill is above the mark: the TP has more to beat, the SL does not.
    const a = tpSlAnchors({ side: "Long", mark: MARK, fillPrice: LONG_FILL })
    expect(a.tpAnchor).toBe(LONG_FILL)
    expect(a.slAnchor).toBe(MARK)
    expect(a.usesFill).toBe(true)
  })

  it("mirrors that for a short", () => {
    const a = tpSlAnchors({ side: "Short", mark: MARK, fillPrice: SHORT_FILL })
    expect(a.tpAnchor).toBe(SHORT_FILL) // must undercut what the sale actually got
    expect(a.slAnchor).toBe(MARK)
  })

  it("puts the safety band on the far side of the anchor", () => {
    const a = tpSlAnchors({ side: "Long", mark: MARK, minDistancePct: 10 })
    expect(a.tpFloor).toBeCloseTo(MARK * 1.1, 6)
    expect(a.slFloor).toBeCloseTo(MARK * 0.9, 6)
  })
})

describe("a trigger between the mark and the fill", () => {
  it("refuses a long take-profit that is above spot but below the fill", () => {
    // The exact loss-booking case: $0.3520 looks like profit against the chart and
    // is 0.4% BELOW the price the position actually opens at.
    const r = validateTpSlDraft({
      side: "Long",
      mark: MARK,
      fillPrice: LONG_FILL,
      draft: { tpEnabled: true, slEnabled: false, tpPrice: "0.3520", slPrice: "" },
    })
    expect(r.ok).toBe(false)
    expect(r.error).toContain("0.3535")
    // And it says why that number, not the one on the chart, is the one to beat.
    expect(r.error).toMatch(/fills at/i)
  })

  it("refuses a short take-profit that is below spot but above the fill", () => {
    const r = validateTpSlDraft({
      side: "Short",
      mark: MARK,
      fillPrice: SHORT_FILL,
      draft: { tpEnabled: true, slEnabled: false, tpPrice: "0.3480", slPrice: "" },
    })
    expect(r.ok).toBe(false)
    expect(r.error).toContain("0.3465")
  })

  it("takes a take-profit that clears the fill with room to spare", () => {
    const r = validateTpSlDraft({
      side: "Long",
      mark: MARK,
      fillPrice: LONG_FILL,
      draft: { tpEnabled: true, slEnabled: false, tpPrice: "0.40", slPrice: "" },
    })
    expect(r).toEqual({ ok: true, triggers: { takeProfit: 0.4, stopLoss: null } })
  })

  it("does not tighten a long's stop-loss just because the fill was worse", () => {
    // The SL is anchored on the lower of the two, which here is the mark. A fill
    // above spot must not start rejecting stop-losses that were always valid.
    const r = validateTpSlDraft({
      side: "Long",
      mark: MARK,
      fillPrice: LONG_FILL,
      draft: { tpEnabled: false, slEnabled: true, tpPrice: "", slPrice: "0.3400" },
    })
    expect(r.ok).toBe(true)
  })
})

describe("the minimum distance", () => {
  const justInside = (mark: number, up: boolean) =>
    mark * (1 + (up ? 1 : -1) * (MIN_TRIGGER_DISTANCE_PCT / 100) * 0.5)

  it("refuses a long stop-loss sitting a hair under spot", () => {
    const r = validateTpSlDraft({
      side: "Long",
      mark: MARK,
      draft: { tpEnabled: false, slEnabled: true, tpPrice: "", slPrice: String(justInside(MARK, false)) },
    })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/too close/i)
    // The message has to name the price that would work, not just the complaint.
    expect(r.error).toContain(formatTriggerPrice(MARK * (1 - MIN_TRIGGER_DISTANCE_PCT / 100)))
  })

  it("refuses a long take-profit sitting a hair over spot", () => {
    const r = validateTpSlDraft({
      side: "Long",
      mark: MARK,
      draft: { tpEnabled: true, slEnabled: false, tpPrice: String(justInside(MARK, true)), slPrice: "" },
    })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/too close/i)
  })

  it("refuses a short's triggers on the same footing", () => {
    const tooCloseTp = validateTpSlDraft({
      side: "Short",
      mark: MARK,
      draft: { tpEnabled: true, slEnabled: false, tpPrice: String(justInside(MARK, false)), slPrice: "" },
    })
    const tooCloseSl = validateTpSlDraft({
      side: "Short",
      mark: MARK,
      draft: { tpEnabled: false, slEnabled: true, tpPrice: "", slPrice: String(justInside(MARK, true)) },
    })
    expect(tooCloseTp.ok).toBe(false)
    expect(tooCloseSl.ok).toBe(false)
  })

  it("takes a trigger exactly on the band", () => {
    // The band is a floor, not a moat — a deliberate 0.5% stop is a real trade.
    const r = validateTpSlDraft({
      side: "Long",
      mark: MARK,
      draft: {
        tpEnabled: false,
        slEnabled: true,
        tpPrice: "",
        slPrice: String(MARK * (1 - MIN_TRIGGER_DISTANCE_PCT / 100)),
      },
    })
    expect(r.ok).toBe(true)
  })

  it("leaves every ordinary trigger alone", () => {
    // The band must not become a second opinion on trades people actually place.
    const r = validateTpSlDraft({
      side: "Long",
      mark: MARK,
      draft: { tpEnabled: true, slEnabled: true, tpPrice: "0.44", slPrice: "0.31" },
    })
    expect(r.ok).toBe(true)
  })

  it("can be widened by the caller", () => {
    const r = validateTpSlDraft({
      side: "Long",
      mark: MARK,
      minDistancePct: 20,
      draft: { tpEnabled: false, slEnabled: true, tpPrice: "", slPrice: "0.34" },
    })
    expect(r.ok).toBe(false)
    expect(r.error).toContain("20%")
  })
})

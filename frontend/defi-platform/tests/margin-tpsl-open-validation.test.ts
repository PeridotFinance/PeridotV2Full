/**
 * What happens to a take-profit / stop-loss that doesn't add up.
 *
 * There were two answers to that question, depending on where the trader set the
 * trigger. The edit popover refused to save and said why. The open panel dropped
 * it — `resolveTpSl` kept whatever validated and passed `null` for the rest — so
 * an enabled stop-loss that was empty, or that the live price had drifted past
 * while the user was still filling in the form, opened a leveraged position with
 * nothing watching it. No error, no toast, and a confetti burst on top.
 *
 * Both surfaces now share `validateTpSlDraft`, so these tests are the rule
 * itself: an enabled row either resolves to a trigger or refuses the order.
 *
 * The `markIsLive` cases are the second half of it. Without the feed the mark
 * falls back to the oracle — flat $1 on testnet against a market near $0.35 — and
 * a trigger measured against that is not merely imprecise: a long's +25% default
 * lands at $1.25, which the market cannot reach, so the "protection" is a
 * decoration. Refusing beats persisting one.
 */
import { describe, it, expect } from "vitest"
import { validateTpSlDraft } from "../app/app/margin/lib/marginMath"

const MARK = 0.35

describe("validateTpSlDraft — nothing switched on", () => {
  it("passes an order with no triggers through untouched", () => {
    const r = validateTpSlDraft({
      side: "Long",
      mark: MARK,
      draft: { tpEnabled: false, slEnabled: false, tpPrice: "", slPrice: "" },
    })
    expect(r.ok).toBe(true)
    expect(r.triggers).toEqual({ takeProfit: null, stopLoss: null })
  })

  it("does not block on a stale mark when there is nothing to validate", () => {
    // A trader who never touched TP/SL must not be held up by the price feed.
    const r = validateTpSlDraft({
      side: "Long",
      mark: 1,
      markIsLive: false,
      draft: { tpEnabled: false, slEnabled: false, tpPrice: "", slPrice: "" },
    })
    expect(r.ok).toBe(true)
  })

  it("ignores a price left behind in a switched-off row", () => {
    // Toggling a row off keeps what was typed in it, so the field is still full.
    // That must not travel into the order as a live trigger.
    const r = validateTpSlDraft({
      side: "Long",
      mark: MARK,
      draft: { tpEnabled: false, slEnabled: true, tpPrice: "0.44", slPrice: "0.30" },
    })
    expect(r.ok).toBe(true)
    expect(r.triggers).toEqual({ takeProfit: null, stopLoss: 0.3 })
  })
})

describe("validateTpSlDraft — an enabled row is a promise", () => {
  it("refuses an enabled take-profit with an empty field", () => {
    const r = validateTpSlDraft({
      side: "Long",
      mark: MARK,
      draft: { tpEnabled: true, slEnabled: false, tpPrice: "", slPrice: "" },
    })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/take-profit/i)
  })

  it("refuses an enabled stop-loss with an empty field", () => {
    const r = validateTpSlDraft({
      side: "Long",
      mark: MARK,
      draft: { tpEnabled: false, slEnabled: true, tpPrice: "", slPrice: "" },
    })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/stop-loss/i)
  })

  it("refuses garbage in the field rather than reading it as zero", () => {
    const r = validateTpSlDraft({
      side: "Long",
      mark: MARK,
      draft: { tpEnabled: true, slEnabled: false, tpPrice: "abc", slPrice: "" },
    })
    expect(r.ok).toBe(false)
  })
})

describe("validateTpSlDraft — the side of the mark", () => {
  it("takes a long's TP above and SL below the mark", () => {
    const r = validateTpSlDraft({
      side: "Long",
      mark: MARK,
      draft: { tpEnabled: true, slEnabled: true, tpPrice: "0.44", slPrice: "0.31" },
    })
    expect(r).toEqual({ ok: true, triggers: { takeProfit: 0.44, stopLoss: 0.31 } })
  })

  it("takes a short's TP below and SL above the mark", () => {
    const r = validateTpSlDraft({
      side: "Short",
      mark: MARK,
      draft: { tpEnabled: true, slEnabled: true, tpPrice: "0.28", slPrice: "0.39" },
    })
    expect(r).toEqual({ ok: true, triggers: { takeProfit: 0.28, stopLoss: 0.39 } })
  })

  it("refuses a long's take-profit that the price has already passed", () => {
    // The exact drift case: valid when typed, overtaken by the feed before the tap.
    const r = validateTpSlDraft({
      side: "Long",
      mark: 0.45,
      draft: { tpEnabled: true, slEnabled: false, tpPrice: "0.44", slPrice: "" },
    })
    expect(r.ok).toBe(false)
    expect(r.error).toContain("0.4500")
  })

  it("refuses a long's stop-loss sitting above the mark", () => {
    const r = validateTpSlDraft({
      side: "Long",
      mark: MARK,
      draft: { tpEnabled: false, slEnabled: true, tpPrice: "", slPrice: "0.40" },
    })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/stop-loss must be below/i)
  })

  it("refuses a short's stop-loss sitting below the mark", () => {
    const r = validateTpSlDraft({
      side: "Short",
      mark: MARK,
      draft: { tpEnabled: false, slEnabled: true, tpPrice: "", slPrice: "0.30" },
    })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/stop-loss must be above/i)
  })

  it("refuses a trigger sitting exactly on the mark", () => {
    // It would fire on the very next tick — an instant close, not protection.
    const r = validateTpSlDraft({
      side: "Long",
      mark: MARK,
      draft: { tpEnabled: true, slEnabled: false, tpPrice: String(MARK), slPrice: "" },
    })
    expect(r.ok).toBe(false)
  })
})

describe("validateTpSlDraft — no live mark, no triggers", () => {
  it("refuses while the price is still the oracle fallback", () => {
    const r = validateTpSlDraft({
      side: "Long",
      mark: 1,
      markIsLive: false,
      draft: { tpEnabled: true, slEnabled: false, tpPrice: "1.25", slPrice: "" },
    })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/live/i)
  })

  it("refuses a mark of zero even when it claims to be live", () => {
    const r = validateTpSlDraft({
      side: "Long",
      mark: 0,
      markIsLive: true,
      draft: { tpEnabled: false, slEnabled: true, tpPrice: "", slPrice: "0.31" },
    })
    expect(r.ok).toBe(false)
  })

  it("never resolves triggers on a refusal", () => {
    // The whole point: a refusal must not hand back a half-built set of triggers
    // that a caller could mistake for a validated one.
    const r = validateTpSlDraft({
      side: "Long",
      mark: MARK,
      draft: { tpEnabled: true, slEnabled: true, tpPrice: "0.44", slPrice: "0.40" },
    })
    expect(r.ok).toBe(false)
    expect(r.triggers).toBeUndefined()
  })
})

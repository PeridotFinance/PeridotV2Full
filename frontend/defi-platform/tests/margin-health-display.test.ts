/**
 * How a position's health renders — specifically, what happens when the chain
 * couldn't tell us.
 *
 * `get_health_factor` prices the position on-chain, so it traps whenever the
 * oracle can't quote the pair. That trap used to arrive as 0, and 0 is the
 * loudest value this badge has: red, pulsing, "0.00", plus a "near liquidation"
 * warning over the table. Position 35 wore all of it while sitting at 12.00
 * on-chain (testnet 2026-08-11) — a margin call for a position in no danger,
 * caused by a read that simply didn't answer.
 *
 * The dangerous direction is the other one, which is why these tests exist as a
 * pair: a position whose collateral really is gone reads 0 too, and hiding THAT
 * behind a dash would suppress the one warning that matters. So the distinction
 * has to come from whether the read answered, never from the value.
 */
import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/stellar-margin", () => ({}))
vi.mock("../app/app/margin/hooks/use-stellar-margin-close", () => ({ useStellarMarginClose: () => ({}) }))

import { hfView } from "@/app/app/margin/components/stellar/StellarPositionsPanel"

describe("hfView", () => {
  it("shows a dash, not 0.00, when the health read didn't answer", () => {
    const v = hfView({ healthFactor: 0, healthUnknown: true })
    expect(v.label).toBe("—")
    expect(v.className).not.toMatch(/red/)
  })

  it("raises no alarm on an unknown health — it is not a distressed position", () => {
    const v = hfView({ healthFactor: 0, healthUnknown: true })
    expect(v.critical).toBe(false)
    expect(v.caution).toBe(false)
  })

  it("STILL alarms on a real zero — collateral actually gone must not be hidden", () => {
    // The failure mode this guards: treating any 0 as "unknown" would have
    // silenced the one warning a trader cannot afford to miss.
    const v = hfView({ healthFactor: 0 })
    expect(v.label).toBe("0.00")
    expect(v.critical).toBe(true)
    expect(v.className).toMatch(/red/)
  })

  it("alarms below the critical threshold and calms above it", () => {
    expect(hfView({ healthFactor: 1.05 }).critical).toBe(true)
    expect(hfView({ healthFactor: 1.2 }).critical).toBe(false)
    expect(hfView({ healthFactor: 1.2 }).caution).toBe(true)
    expect(hfView({ healthFactor: 12 }).critical).toBe(false)
    expect(hfView({ healthFactor: 12 }).caution).toBe(false)
  })

  it("renders a debt-free position as ∞ rather than a two-decimal 99.00", () => {
    expect(hfView({ healthFactor: 99 }).label).toBe("∞")
    expect(hfView({ healthFactor: 150 }).label).toBe("∞")
  })

  it("formats an ordinary health to two decimals", () => {
    expect(hfView({ healthFactor: 12.0011 }).label).toBe("12.00")
  })
})

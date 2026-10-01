import { describe, it, expect } from "vitest"
import {
  describeKeeperArm,
  formatArmReason,
  parseArmReason,
  LEDGER_SECONDS,
  type KeeperArmSnapshot,
} from "@/app/app/margin/lib/keeperArmStatus"

const LEDGER_NOW = 3_848_640

function arm(over: Partial<KeeperArmSnapshot> = {}): KeeperArmSnapshot {
  return {
    position_id: "33",
    status: "armed",
    take_profit_usd: null,
    stop_loss_usd: 0.15327,
    // ~5.6 days of cover, matching the live arm this work came from.
    valid_until_ledger: LEDGER_NOW + 96_808,
    last_error: null,
    fired_kind: null,
    updated_at: "2026-07-28T13:45:17.541Z",
    ...over,
  }
}

describe("parseArmReason", () => {
  it("round-trips a coded reason", () => {
    const raw = formatArmReason("window_empty", "pool pays 185367373 against an oracle floor of 187320255")
    expect(parseArmReason(raw)).toEqual({
      code: "window_empty",
      detail: "pool pays 185367373 against an oracle floor of 187320255",
    })
  })

  it("treats an uncoded legacy reason as unknown, not as a diagnosis", () => {
    // Exactly what the live row carried before codes existed.
    const legacy = "no pre-signed rung in window [187320255, 185367373] — position needs re-arming"
    expect(parseArmReason(legacy).code).toBeNull()
  })

  it("does not accept an unknown code word", () => {
    expect(parseArmReason("something_else: detail").code).toBeNull()
  })
})

describe("describeKeeperArm", () => {
  it("an empty swap window asks the user for nothing", () => {
    const s = describeKeeperArm(
      arm({ last_error: formatArmReason("window_empty", "pool pays 185367373 vs floor 187320255") }),
      LEDGER_NOW,
    )
    expect(s.needsUser).toBe(false)
    expect(s.tone).toBe("warn")
    expect(s.detail).toMatch(/liquidity/i)
    // The old copy's instruction must not survive anywhere in this branch.
    expect(s.detail).not.toMatch(/re-?arm|confirm them again/i)
  })

  it("a ladder the price outran does ask the user to re-confirm", () => {
    const s = describeKeeperArm(arm({ last_error: formatArmReason("no_rung_in_window", "…") }), LEDGER_NOW)
    expect(s.needsUser).toBe(true)
    expect(s.tone).toBe("alert")
  })

  it("warns when cover runs out within a day", () => {
    const hoursLeft = 9
    const s = describeKeeperArm(
      arm({ valid_until_ledger: LEDGER_NOW + (hoursLeft * 3600) / LEDGER_SECONDS }),
      LEDGER_NOW,
    )
    expect(s.tone).toBe("warn")
    expect(s.label).toBe("Renew soon")
    expect(s.detail).toMatch(/9 hours/)
    expect(s.needsUser).toBe(true)
  })

  it("healthy cover reads as covered and says how long", () => {
    const s = describeKeeperArm(arm(), LEDGER_NOW)
    expect(s.tone).toBe("ok")
    expect(s.label).toBe("Always-on")
    expect(s.notable).toBe(false)
    expect(s.detail).toMatch(/6 days/)
  })

  it("an unknown ledger never renders as expired", () => {
    // The RPC read failed. Claiming "expired" here would tell someone their
    // stop-loss is dead while it is running — the one lie this must not tell.
    const s = describeKeeperArm(arm({ valid_until_ledger: 1 }), null)
    expect(s.label).toBe("Always-on")
    expect(s.expiresInHours).toBeNull()
    expect(s.detail).not.toMatch(/run out|expired/i)
  })

  it("past its ledger, cover is expired and actionable", () => {
    const s = describeKeeperArm(arm({ valid_until_ledger: LEDGER_NOW - 10 }), LEDGER_NOW)
    expect(s.label).toBe("Expired")
    expect(s.needsUser).toBe(true)
    expect(s.notable).toBe(true)
  })

  it("a fired arm reports which level closed it", () => {
    const s = describeKeeperArm(arm({ status: "fired", fired_kind: "sl" }), LEDGER_NOW)
    expect(s.tone).toBe("ok")
    expect(s.detail).toMatch(/stop-loss/)
    expect(s.notable).toBe(true)
  })

  it("a cancelled arm says nothing at all", () => {
    const s = describeKeeperArm(arm({ status: "cancelled" }), LEDGER_NOW)
    expect(s.label).toBe("")
    expect(s.notable).toBe(false)
  })
})

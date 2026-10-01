import { describe, expect, it } from "vitest"
import { validateHandle, fallbackHandle, isNameAllowed } from "@/lib/challenge/handles"

/**
 * The handle rule is shared with the leaderboard username
 * (app/api/user/profile/set-username): one Peridot name on both boards. These
 * tests pin the shape so the two ends can't drift apart silently.
 */
describe("validateHandle", () => {
  it("accepts the leaderboard username shape (3–32, letters/numbers/_/-)", () => {
    expect(validateHandle("bob").ok).toBe(true)
    expect(validateHandle("cool_kid-123").ok).toBe(true)
    expect(validateHandle("a".repeat(32)).ok).toBe(true)
  })

  it("rejects names outside the shared format", () => {
    expect(validateHandle("ab").ok).toBe(false)
    expect(validateHandle("a".repeat(33)).ok).toBe(false)
    expect(validateHandle("has space").ok).toBe(false)
    expect(validateHandle("umlaut_ä").ok).toBe(false)
    expect(validateHandle(42 as unknown as string).ok).toBe(false)
  })

  it("still applies the denylist, leet-normalized", () => {
    expect(validateHandle("sh1t_king").ok).toBe(false)
    expect(validateHandle("Peridot_Team").ok).toBe(false)
    expect(validateHandle("Peridot_Team").error).toBe("handle_not_allowed")
  })
})

describe("isNameAllowed", () => {
  it("is the denylist check alone — format is the caller's job", () => {
    expect(isNameAllowed("perfectly_fine")).toBe(true)
    expect(isNameAllowed("n4z1")).toBe(false)
    // No format opinion: a 40-char string with spaces passes if clean.
    expect(isNameAllowed("clean name that is not a valid handle")).toBe(true)
  })
})

describe("fallbackHandle", () => {
  it("truncates a G-address into a valid handle", () => {
    const h = fallbackHandle("GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW")
    expect(validateHandle(h).ok).toBe(true)
  })
})

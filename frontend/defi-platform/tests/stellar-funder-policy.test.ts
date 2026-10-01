import { describe, expect, it } from "vitest"
import {
  decideFunderAlert,
  decideFunding,
  funderConfigFromEnv,
  funderHealth,
  lockedRaw,
  spendableRaw,
  STROOPS_PER_XLM,
  type AccountSnapshot,
} from "@/lib/stellar-funder/policy"

const xlm = (n: number) => Math.round(n * STROOPS_PER_XLM)
const account = (balance: number, subentries = 0): AccountSnapshot => ({
  balanceRaw: xlm(balance),
  subentries,
  numSponsoring: 0,
  numSponsored: 0,
  sellingLiabilitiesRaw: 0,
})

const config = funderConfigFromEnv({})
const now = new Date("2026-09-28T12:00:00Z")
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000)

describe("reserves", () => {
  it("locks one XLM for the account and half for each subentry", () => {
    expect(lockedRaw(account(3))).toBe(xlm(1))
    expect(lockedRaw(account(3, 1))).toBe(xlm(1.5))
    expect(spendableRaw(account(3, 2))).toBe(xlm(1))
  })

  it("never reports a negative spendable balance", () => {
    expect(spendableRaw(account(0.4))).toBe(0)
  })
})

describe("funderConfigFromEnv", () => {
  it("starts a wallet with 3 XLM unless told otherwise", () => {
    expect(config.startingRaw).toBe(xlm(3))
    expect(funderConfigFromEnv({ STELLAR_FUNDER_STARTING_BALANCE: "2" }).startingRaw).toBe(xlm(2))
  })

  it("ignores values that are not a positive number", () => {
    expect(funderConfigFromEnv({ STELLAR_FUNDER_STARTING_BALANCE: "abc" }).startingRaw).toBe(xlm(3))
    expect(funderConfigFromEnv({ STELLAR_FUNDER_REFILL_TARGET: "-1" }).refillTargetRaw).toBe(xlm(1))
  })
})

describe("decideFunding", () => {
  const funder = account(200)

  it("creates a wallet that does not exist yet", () => {
    expect(decideFunding({ wallet: null, funder, lastRefillAt: null, now, config })).toEqual({
      action: "create",
      amountRaw: xlm(3),
    })
  })

  it("signs nothing when the funder cannot pay", () => {
    // 1.99 XLM on the funder: one XLM is its own reserve, the rest is under 3.
    expect(decideFunding({ wallet: null, funder: account(1.9937471), lastRefillAt: null, now, config })).toEqual({
      action: "none",
      reason: "funder_depleted",
    })
  })

  it("leaves a wallet alone that still has enough to spend", () => {
    expect(decideFunding({ wallet: account(2, 1), funder, lastRefillAt: null, now, config })).toEqual({
      action: "none",
      reason: "already_funded",
    })
  })

  it("tops a low wallet up to the target, not by a flat amount", () => {
    // 1.6 XLM with one trustline: 1.5 locked, 0.1 to spend.
    expect(decideFunding({ wallet: account(1.6, 1), funder, lastRefillAt: null, now, config })).toEqual({
      action: "refill",
      amountRaw: xlm(0.9),
    })
  })

  it("tops a wallet up once per window", () => {
    const wallet = account(1.6, 1)
    expect(decideFunding({ wallet, funder, lastRefillAt: daysAgo(2), now, config })).toEqual({
      action: "none",
      reason: "refill_too_soon",
    })
    expect(decideFunding({ wallet, funder, lastRefillAt: daysAgo(8), now, config }).action).toBe("refill")
  })

  it("does not take an unreadable history for no history", () => {
    expect(decideFunding({ wallet: account(1.6, 1), funder, lastRefillAt: "unknown", now, config })).toEqual({
      action: "none",
      reason: "refill_unknown",
    })
  })

  it("refuses a top-up the funder cannot pay", () => {
    expect(decideFunding({ wallet: account(1.6, 1), funder: account(1.5), lastRefillAt: null, now, config })).toEqual({
      action: "none",
      reason: "funder_depleted",
    })
  })
})

describe("funderHealth", () => {
  it("counts the wallets it can still pay for", () => {
    expect(funderHealth(account(200), config)).toMatchObject({ level: "ok", activationsLeft: 66 })
    expect(funderHealth(account(20), config)).toMatchObject({ level: "low", activationsLeft: 6 })
    expect(funderHealth(account(1.9937471), config)).toMatchObject({ level: "empty", activationsLeft: 0 })
  })
})

describe("decideFunderAlert", () => {
  it("stays silent about a funder that has always been fine", () => {
    expect(decideFunderAlert(null, "ok", now).send).toBeNull()
    expect(decideFunderAlert({ level: "ok", sentAt: null }, "ok", now).send).toBeNull()
  })

  it("speaks when the level gets worse", () => {
    expect(decideFunderAlert({ level: "ok", sentAt: null }, "low", now).send).toBe("alert")
    expect(decideFunderAlert({ level: "low", sentAt: daysAgo(0.1).toISOString() }, "empty", now).send).toBe("alert")
  })

  it("repeats once a day while it stays bad, not every pass", () => {
    expect(decideFunderAlert({ level: "empty", sentAt: daysAgo(0.5).toISOString() }, "empty", now).send).toBeNull()
    expect(decideFunderAlert({ level: "empty", sentAt: daysAgo(1.1).toISOString() }, "empty", now).send).toBe("alert")
  })

  it("does not repeat early when empty eases to low", () => {
    const prev = { level: "empty" as const, sentAt: daysAgo(0.2).toISOString() }
    const { send, next } = decideFunderAlert(prev, "low", now)
    expect(send).toBeNull()
    expect(next).toEqual({ level: "low", sentAt: prev.sentAt })
  })

  it("says once that the funder is back", () => {
    const back = decideFunderAlert({ level: "empty", sentAt: daysAgo(1).toISOString() }, "ok", now)
    expect(back.send).toBe("recovered")
    expect(decideFunderAlert(back.next, "ok", now).send).toBeNull()
  })
})

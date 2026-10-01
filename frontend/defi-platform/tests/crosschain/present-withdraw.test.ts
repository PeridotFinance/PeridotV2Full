import { describe, expect, it } from "vitest"
import { buildWithdrawProgress, type WithdrawProgressInput } from "@/lib/crosschain/present"

const base: WithdrawProgressInput = {
  withdraw: { phase: "running" },
  withdrawKnown: true,
  step: "idle",
  failedAt: null,
  errorMessage: null,
  stalled: false,
  sodaxStatus: null,
  marketSymbol: "USDC",
  amount: "25",
  dstChain: 8453,
  dstSymbol: "USDC",
  arrived: null,
  minOut: "24.7",
  silentStellar: true,
  sendWaiting: false,
}

const statuses = (input: Partial<WithdrawProgressInput>) =>
  Object.fromEntries(buildWithdrawProgress({ ...base, ...input }).steps.map((s) => [s.key, s.status]))

const done = { phase: "done" as const, amount: "25.0012", txHash: "abc" }

describe("buildWithdrawProgress", () => {
  it("starts with the pool withdrawal", () => {
    const m = buildWithdrawProgress(base)
    expect(m.steps.map((s) => s.key)).toEqual(["withdraw", "send", "convert", "arrive"])
    expect(m.tone).toBe("working")
    expect(m.headline).toBe("Withdrawing 25 USDC to Base")
    expect(m.steps[0]).toMatchObject({ status: "active", detail: "Withdrawing" })
    expect(buildWithdrawProgress({ ...base, silentStellar: false }).steps[0].detail).toBe("Confirm in your Stellar wallet")
  })

  it("says the money is still supplied when the withdrawal fails", () => {
    const m = buildWithdrawProgress({ ...base, withdraw: { phase: "failed", error: "Cancelled in the wallet." } })
    expect(m.tone).toBe("failed")
    expect(m.headline).toBe("Nothing was withdrawn")
    expect(m.note).toMatch(/still supplied/)
    expect(m.steps[0].status).toBe("failed")
  })

  it("walks send, convert and arrive after the withdrawal", () => {
    expect(statuses({ withdraw: done, step: "signing" })).toEqual({
      withdraw: "done",
      send: "active",
      convert: "pending",
      arrive: "pending",
    })
    expect(statuses({ withdraw: done, step: "converting" })).toMatchObject({ send: "done", convert: "active" })
    expect(statuses({ withdraw: done, step: "arriving" })).toMatchObject({ convert: "done", arrive: "active" })
  })

  it("lets the user leave only once the send is signed", () => {
    expect(buildWithdrawProgress({ ...base, withdraw: done, step: "signing" }).note).toMatch(/Keep this page open/)
    expect(buildWithdrawProgress({ ...base, withdraw: done, step: "converting" }).note).toMatch(/close this page/)
  })

  it("ends with what arrived", () => {
    const m = buildWithdrawProgress({ ...base, withdraw: done, step: "arrived", arrived: "24.96" })
    expect(m.tone).toBe("done")
    expect(m.headline).toBe("24.96 USDC arrived on Base")
    expect(m.steps.every((s) => s.status === "done")).toBe(true)
  })

  it("waits for a click when the money sits in the Stellar wallet", () => {
    const m = buildWithdrawProgress({ ...base, withdraw: done, sendWaiting: true })
    expect(m.tone).toBe("attention")
    expect(m.headline).toBe("25.0012 USDC is in your Stellar wallet")
    expect(m.steps.find((s) => s.key === "send")?.status).toBe("attention")
  })

  it("keeps the money on Stellar when the send is refused", () => {
    const m = buildWithdrawProgress({
      ...base,
      withdraw: done,
      step: "failed",
      failedAt: "signing",
      errorMessage: "Cancelled in the wallet. Nothing was sent.",
    })
    expect(m.tone).toBe("attention")
    expect(m.note).toMatch(/Send it again/)
    expect(m.steps.find((s) => s.key === "send")?.status).toBe("failed")
  })

  it("marks a failed conversion as a failure", () => {
    const m = buildWithdrawProgress({ ...base, withdraw: done, step: "failed", failedAt: "converting", errorMessage: "Refunded." })
    expect(m.tone).toBe("failed")
    expect(m.steps.find((s) => s.key === "convert")?.status).toBe("failed")
  })

  it("leaves out a withdrawal it cannot vouch for", () => {
    const m = buildWithdrawProgress({ ...base, withdrawKnown: false, withdraw: { phase: "idle" }, step: "converting" })
    expect(m.steps.map((s) => s.key)).toEqual(["send", "convert", "arrive"])
    expect(m.tone).toBe("working")
  })
})

describe("Stellar narration", () => {
  it("never asks an embedded wallet to confirm", () => {
    const silent = buildWithdrawProgress({ ...base, withdraw: { phase: "running", message: "Waiting for you to confirm in your wallet" } })
    expect(silent.steps[0].detail).toBe("Signing")
    const prompted = buildWithdrawProgress({
      ...base,
      silentStellar: false,
      withdraw: { phase: "running", message: "Waiting for you to confirm in your wallet" },
    })
    expect(prompted.steps[0].detail).toBe("Waiting for you to confirm in your wallet")
  })
})

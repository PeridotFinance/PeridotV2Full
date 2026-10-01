import { describe, expect, it } from "vitest"
import { buildSupplyProgress, formatTokenAmount, type ProgressInput } from "@/lib/crosschain/present"

const base: ProgressInput = {
  step: "idle",
  failedAt: null,
  errorMessage: null,
  approvalSeen: false,
  stalled: false,
  sodaxStatus: null,
  srcChain: 43114,
  srcSymbol: "USDC",
  srcAmount: "5",
  dstSymbol: "USDC",
  arrived: null,
  minOut: "4.94",
  silentStellar: true,
  supply: { phase: "idle" },
}

const statuses = (input: Partial<ProgressInput>) =>
  Object.fromEntries(buildSupplyProgress({ ...base, ...input }).steps.map((s) => [s.key, s.status]))

describe("buildSupplyProgress", () => {
  it("hides the approval unless the run went through one", () => {
    expect(buildSupplyProgress({ ...base, step: "signing" }).steps.map((s) => s.key)).toEqual([
      "send",
      "convert",
      "arrive",
      "supply",
    ])
    expect(buildSupplyProgress({ ...base, step: "signing", approvalSeen: true }).steps[0].key).toBe("approve")
  })

  it("walks the steps in order", () => {
    expect(statuses({ step: "approving", approvalSeen: true })).toEqual({
      approve: "active",
      send: "pending",
      convert: "pending",
      arrive: "pending",
      supply: "pending",
    })
    expect(statuses({ step: "confirming" })).toMatchObject({ send: "active", convert: "pending" })
    expect(statuses({ step: "converting" })).toMatchObject({ send: "done", convert: "active", arrive: "pending" })
    expect(statuses({ step: "arriving" })).toMatchObject({ convert: "done", arrive: "active" })
  })

  it("shows a wallet refusal as a calm cancel, and a real failure as an error", () => {
    const cancelled = buildSupplyProgress({
      ...base,
      step: "failed",
      failedAt: "signing",
      errorMessage: "Cancelled in the wallet. Nothing was sent.",
      cancelled: true,
      approvalSeen: true,
    })
    expect(cancelled).toMatchObject({ tone: "failed", quiet: true, headline: "Cancelled" })
    expect(cancelled.steps.find((s) => s.key === "approve")?.status).toBe("done")
    expect(cancelled.steps.find((s) => s.key === "send")?.detail).toBe("Cancelled in your wallet")

    const failed = buildSupplyProgress({ ...base, step: "failed", failedAt: "signing", errorMessage: "Not enough AVAX for the fee." })
    expect(failed.quiet).toBeFalsy()
    expect(failed.headline).toBe("Nothing was sent")
    expect(failed.steps.find((s) => s.key === "send")?.detail).toBe("Not enough AVAX for the fee.")
  })

  it("tells the user they may leave only once the money is sent", () => {
    expect(buildSupplyProgress({ ...base, step: "signing" }).note).toMatch(/Nothing has left/)
    expect(buildSupplyProgress({ ...base, step: "converting" }).note).toMatch(/close this page/)
  })

  it("names what arrived and the supply that follows", () => {
    const running = buildSupplyProgress({ ...base, step: "arrived", arrived: "4.99", supply: { phase: "running" } })
    expect(running.tone).toBe("working")
    expect(running.headline).toBe("Supplying 4.99 USDC")
    expect(running.steps.find((s) => s.key === "arrive")?.detail).toBe("4.99 USDC")

    const done = buildSupplyProgress({ ...base, step: "arrived", arrived: "4.99", supply: { phase: "done", amount: "4.99" } })
    expect(done.tone).toBe("done")
    expect(done.steps.every((s) => s.status === "done")).toBe(true)
  })

  it("waits for a click when the supply is not automatic", () => {
    const m = buildSupplyProgress({ ...base, step: "arrived", arrived: "4.99", supply: { phase: "waiting" } })
    expect(m.tone).toBe("attention")
    expect(m.steps.find((s) => s.key === "supply")?.status).toBe("attention")
    expect(m.headline).toMatch(/arrived in your Stellar wallet/)
  })

  it("says the money is safe when only the supply failed", () => {
    const m = buildSupplyProgress({
      ...base,
      step: "arrived",
      arrived: "4.99",
      supply: { phase: "failed", error: "Cancelled in the wallet." },
    })
    expect(m.tone).toBe("attention")
    expect(m.note).toMatch(/safe in your Stellar wallet/)
    expect(m.steps.find((s) => s.key === "supply")?.status).toBe("failed")
  })

  it("marks the step a failure happened in", () => {
    const rejected = buildSupplyProgress({
      ...base,
      step: "failed",
      failedAt: "signing",
      errorMessage: "Cancelled in the wallet. Nothing was sent.",
    })
    expect(rejected.headline).toBe("Nothing was sent")
    expect(rejected.steps.find((s) => s.key === "send")?.status).toBe("failed")

    const relay = buildSupplyProgress({ ...base, step: "failed", failedAt: "converting", errorMessage: "Refunded." })
    expect(relay.headline).toBe("The transfer did not go through")
    expect(Object.fromEntries(relay.steps.map((s) => [s.key, s.status]))).toMatchObject({ send: "done", convert: "failed" })
  })

  it("shows an intent that was never paid as not sent", () => {
    const m = buildSupplyProgress({ ...base, step: "unsent" })
    expect(m.tone).toBe("failed")
    expect(m.steps.find((s) => s.key === "send")?.status).toBe("failed")
  })

  it("says a slow conversion carries on without the page", () => {
    const m = buildSupplyProgress({ ...base, step: "converting", stalled: true })
    expect(m.steps.find((s) => s.key === "convert")?.detail).toMatch(/without this page/)
  })
})

describe("formatTokenAmount", () => {
  it("keeps small amounts readable and large ones short", () => {
    expect(formatTokenAmount(4.9930574)).toBe("4.9931")
    expect(formatTokenAmount(0.00012345)).toBe("0.000123")
    expect(formatTokenAmount(1234.5678)).toBe("1,234.57")
  })
})

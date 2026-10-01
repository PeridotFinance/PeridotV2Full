/**
 * The arithmetic behind the deposit sheet's primary button.
 *
 * Worth its own test because every one of these cases is a number the user
 * reads on a button before signing a transaction that moves real money, and
 * because two of the rules pull in opposite directions: round *up* to the
 * floor, but never above what one chain holds.
 */
import { describe, it, expect } from "vitest"
import { planTopUp } from "@/hooks/use-cross-chain-top-up"
import { CCTP_MIN_TRANSFER_USD } from "@/config/cctp"

const base = (balance: number) => ({ chainId: 8453, chainName: "Base", balance })

describe("planTopUp", () => {
  it("offers nothing when Stellar already covers the amount", () => {
    expect(planTopUp({ amount: 50, stellarBalance: 50, best: base(500) })).toEqual({
      moveAmount: 0,
      shouldOffer: false,
      belowMinimum: false,
    })
  })

  it("offers nothing when there is no source chain", () => {
    expect(planTopUp({ amount: 100, stellarBalance: 0, best: null }).shouldOffer).toBe(false)
  })

  it("moves only the shortfall, not the whole source balance", () => {
    const plan = planTopUp({ amount: 100, stellarBalance: 40, best: base(5_000) })
    expect(plan.moveAmount).toBe(60)
    expect(plan.shouldOffer).toBe(true)
  })

  it("rounds a small shortfall up to the floor rather than losing money on fees", () => {
    const plan = planTopUp({ amount: 3, stellarBalance: 0, best: base(500) })
    expect(plan.moveAmount).toBe(CCTP_MIN_TRANSFER_USD)
    expect(plan.shouldOffer).toBe(true)
  })

  it("never promises more than the one chain actually holds", () => {
    // $100 needed, but the largest chain has $60 — a burn draws from one chain,
    // so this is a $60 top-up and the user tops up again afterwards.
    const plan = planTopUp({ amount: 100, stellarBalance: 0, best: base(60) })
    expect(plan.moveAmount).toBe(60)
    expect(plan.shouldOffer).toBe(true)
  })

  it("reports belowMinimum when the source cannot clear the floor", () => {
    const plan = planTopUp({ amount: 100, stellarBalance: 0, best: base(4) })
    expect(plan.shouldOffer).toBe(false)
    expect(plan.belowMinimum).toBe(true)
  })

  it("treats a source sitting exactly on the floor as usable", () => {
    const plan = planTopUp({
      amount: 100,
      stellarBalance: 0,
      best: base(CCTP_MIN_TRANSFER_USD),
    })
    expect(plan.moveAmount).toBe(CCTP_MIN_TRANSFER_USD)
    expect(plan.shouldOffer).toBe(true)
  })

  it("does not offer a top-up for an amount of zero", () => {
    expect(planTopUp({ amount: 0, stellarBalance: 0, best: base(500) })).toEqual({
      moveAmount: 0,
      shouldOffer: false,
      belowMinimum: false,
    })
  })
})

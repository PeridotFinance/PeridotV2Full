/**
 * Short close — sizing the swap that buys the debt back.
 *
 * A Short does not close by selling its collateral. Its margin IS the quote
 * asset, so it buys back exactly the XLM it owes and keeps the rest as USDT;
 * `swap_close_short_position_v3` takes the input amount as well as the minimum.
 *
 * These are the two numbers the frontend has to get right before signing:
 *
 *   - the target — debt plus an interest buffer, since the debt accrues between
 *     reading it and settling;
 *   - the input — how much USDT buys that, interpolated from ONE quote of the
 *     full collateral and then verified against the pool.
 *
 * Worth pinning because both directions are asymmetric: overshooting the input
 * costs a few stroops of swap fee (the remainder is returned to free margin),
 * while undershooting reverts the swap and strands a pending close. Every
 * rounding in here has to lean the same way.
 */
import { describe, it, expect } from "vitest"
import {
  shortCloseDebtTarget,
  shortCloseSwapInput,
  bumpShortSwapInput,
  SHORT_CLOSE_DEBT_BUFFER_BPS,
} from "@/app/app/margin/lib/marginMath"

const XLM = (n: number) => BigInt(Math.round(n * 1e7))

describe("shortCloseDebtTarget", () => {
  it("adds the interest buffer on top of the debt", () => {
    // 0.10% of 100 XLM = 0.1 XLM
    expect(shortCloseDebtTarget(XLM(100))).toBe(XLM(100.1))
  })

  it("rounds the buffer UP — a target one stroop short is a failed settlement", () => {
    // 1 stroop of debt: 0.10% of it is a millionth of a stroop, which must not
    // round away to "no buffer at all".
    expect(shortCloseDebtTarget(BigInt(1))).toBe(BigInt(2))
  })

  it("stays at zero for a debt-free position rather than inventing a minimum", () => {
    expect(shortCloseDebtTarget(BigInt(0))).toBe(BigInt(0))
    expect(shortCloseDebtTarget(BigInt(-5))).toBe(BigInt(0))
  })

  it("uses the documented 0.10% buffer", () => {
    expect(SHORT_CLOSE_DEBT_BUFFER_BPS).toBe(10)
  })

  it("covers the real debts that were stuck (positions 32 and 35)", () => {
    // Measured on testnet: 116.1716278 XLM and 58.3411280 XLM.
    expect(shortCloseDebtTarget(BigInt(1_161_716_278))).toBe(BigInt(1_162_877_995))
    expect(shortCloseDebtTarget(BigInt(583_411_280))).toBe(BigInt(583_994_692))
  })
})

describe("shortCloseSwapInput", () => {
  it("interpolates the input from a single full-collateral quote", () => {
    // 100 USDT collateral quotes 500 XLM ⇒ 116.4 XLM costs 23.28 USDT.
    const input = shortCloseSwapInput({
      collateral: XLM(100),
      quoteAtCollateral: XLM(500),
      targetOut: XLM(116.4),
    })
    expect(input).toBe(XLM(23.28))
  })

  it("rounds the input UP — the safe direction", () => {
    // 3 in ⇒ 7 out. Target 5 needs 15/7 = 2.14… ⇒ 3, not 2: asking for 2 would
    // quote below the target and revert the swap.
    expect(shortCloseSwapInput({ collateral: BigInt(3), quoteAtCollateral: BigInt(7), targetOut: BigInt(5) }))
      .toBe(BigInt(3))
  })

  it("never asks to spend more collateral than the position holds", () => {
    // Ceil at the very top of the range can land one stroop past the collateral.
    const input = shortCloseSwapInput({
      collateral: BigInt(1_000),
      quoteAtCollateral: BigInt(3_333),
      targetOut: BigInt(3_333),
    })
    expect(input).toBe(BigInt(1_000))
  })

  it("returns null when the whole collateral can't reach the target — that's underwater", () => {
    expect(shortCloseSwapInput({ collateral: XLM(10), quoteAtCollateral: XLM(50), targetOut: XLM(60) })).toBeNull()
  })

  it("returns null on degenerate input instead of a number nobody can use", () => {
    expect(shortCloseSwapInput({ collateral: BigInt(0), quoteAtCollateral: XLM(50), targetOut: XLM(1) })).toBeNull()
    // A dead quote (the pool read failed and returned 0) must not become an input.
    expect(shortCloseSwapInput({ collateral: XLM(10), quoteAtCollateral: BigInt(0), targetOut: XLM(1) })).toBeNull()
    expect(shortCloseSwapInput({ collateral: XLM(10), quoteAtCollateral: XLM(50), targetOut: BigInt(0) })).toBeNull()
  })

  /**
   * The estimate leans on the pool curve being concave through the origin: the
   * chord from (0,0) to (collateral, quote) then sits at or below the curve, so
   * reading it backwards over-estimates the input rather than under-estimating
   * it. This checks the claim against actual constant-product arithmetic instead
   * of trusting the argument — if it ever fails, the first quote in the hook's
   * verify loop would come back short and the loop would have to bump.
   */
  it("over-estimates, never under-estimates, against a real constant-product pool", () => {
    const RX = XLM(2_000_000) // XLM reserve
    const RU = XLM(400_000)  // USDT reserve
    // 0.3% fee, USDT in → XLM out
    const quote = (usdtIn: bigint) => {
      const inAfterFee = (usdtIn * BigInt(997)) / BigInt(1000)
      return (RX * inAfterFee) / (RU + inAfterFee)
    }

    for (const collateral of [XLM(50), XLM(500), XLM(5_000), XLM(50_000)]) {
      const full = quote(collateral)
      for (const frac of [0.01, 0.1, 0.5, 0.9, 0.999]) {
        const targetOut = (full * BigInt(Math.round(frac * 1e6))) / BigInt(1e6)
        const input = shortCloseSwapInput({ collateral, quoteAtCollateral: full, targetOut })
        expect(input).not.toBeNull()
        expect(quote(input!)).toBeGreaterThanOrEqual(targetOut)
      }
    }
  })
})

describe("bumpShortSwapInput", () => {
  it("re-interpolates through the point the pool actually returned", () => {
    // 100 in gave 90 out, we need 100 ⇒ ceil(100 × 100/90) = 112, +1 = 113.
    expect(bumpShortSwapInput({
      input: BigInt(100), quotedOut: BigInt(90), targetOut: BigInt(100), collateral: BigInt(1_000),
    })).toBe(BigInt(113))
  })

  it("always moves forward, so a caller looping on it can't stall", () => {
    // Already at the target: plain interpolation would return the same input
    // forever. The +1 is what makes the retry loop terminate.
    const next = bumpShortSwapInput({
      input: BigInt(100), quotedOut: BigInt(100), targetOut: BigInt(100), collateral: BigInt(1_000),
    })
    expect(next).toBe(BigInt(101))
  })

  it("returns null once the bump would exceed the collateral — nothing left to try", () => {
    expect(bumpShortSwapInput({
      input: BigInt(990), quotedOut: BigInt(90), targetOut: BigInt(100), collateral: BigInt(1_000),
    })).toBeNull()
  })

  it("returns null on a dead quote rather than dividing by it", () => {
    expect(bumpShortSwapInput({
      input: BigInt(100), quotedOut: BigInt(0), targetOut: BigInt(100), collateral: BigInt(1_000),
    })).toBeNull()
    expect(bumpShortSwapInput({
      input: BigInt(0), quotedOut: BigInt(90), targetOut: BigInt(100), collateral: BigInt(1_000),
    })).toBeNull()
  })
})

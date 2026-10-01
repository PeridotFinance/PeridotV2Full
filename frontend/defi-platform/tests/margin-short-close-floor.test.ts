/**
 * The Short close's oracle floor — the guard whose absence trapped real money.
 *
 * `swap_close_short_position_v3` on the deployed controller measures the swap
 * against `oracle_min_out(collateral, debt, swap_amount_in)` and a miss is a bare
 * `panic!`, i.e. `Error(WasmVm, InvalidAction)` with no reason attached. The Long
 * path tested that before signing; the Short path did not, so oversized Shorts
 * signed, trapped, and left a pending behind (testnet positions 65 and 75, five
 * attempts between 14 and 19 Aug 2026).
 *
 * The pool here is not a hand-wave: `poolQuote` is a constant-product curve fitted
 * to the live testnet Aquarius pool on 19 Aug 2026, and it reproduces the measured
 * quotes to within 0.05 % (10 USDT → 59.9 XLM, 1 000 → 5 888, 4 000 → 22 353). The
 * position-65 numbers below are its real debt and collateral, read off chain.
 */
import { describe, it, expect } from "vitest"
import {
  shortCloseFloorVerdict,
  shortCloseDebtTarget,
  debtWithinQuote,
  solveShortCloseInput,
  maxClosableShortDebt,
} from "@/app/app/margin/lib/marginMath"

const UNIT = BigInt(10_000_000) // 7 decimals, both assets
const usdt = (n: number) => BigInt(Math.round(n * 10_000_000))
const xlm = (n: number) => BigInt(Math.round(n * 10_000_000))

/** Reflector's testnet prices, as `get_price_usd` returns them (num/den). */
const PRICES = {
  // XLM is the DEBT asset for a Short; USDT is the collateral it swaps in.
  positionPrice: { num: BigInt("999696600990500"), den: BigInt("1000000000000000") },
  debtPrice: { num: BigInt("16495010302961"), den: BigInt("100000000000000") },
}

/** Constant product fitted to the live pool: 55 023 USDT / 329 834 XLM. */
const RESERVE_IN = usdt(55_023)
const RESERVE_OUT = xlm(329_834)
const poolQuote = async (input: bigint): Promise<bigint> =>
  (RESERVE_OUT * input) / (RESERVE_IN + input)

// Position 65 as it stands on chain: a 4x Short opened 7 Aug.
const P65_COLLATERAL = usdt(4_997.17)
const P65_DEBT = xlm(25_021.6)

describe("poolQuote fixture", () => {
  it("reproduces the measured pool", async () => {
    expect(Number(await poolQuote(usdt(10))) / 1e7).toBeCloseTo(59.9, 0)
    expect(Number(await poolQuote(usdt(1_000))) / 1e7).toBeCloseTo(5_888, -1)
    expect(Number(await poolQuote(usdt(4_000))) / 1e7).toBeCloseTo(22_353, -2)
  })
})

describe("shortCloseFloorVerdict", () => {
  it("blocks position 65 — the close that trapped on chain", async () => {
    const targetOut = shortCloseDebtTarget(P65_DEBT)
    const sizing = await solveShortCloseInput({
      collateral: P65_COLLATERAL,
      quoteAtCollateral: await poolQuote(P65_COLLATERAL),
      targetOut,
      quote: poolQuote,
    })
    expect(sizing.status).toBe('ok')
    if (sizing.status !== 'ok') return

    const verdict = shortCloseFloorVerdict({ swapInput: sizing.input, targetOut, ...PRICES })
    expect(verdict.blocked).toBe(true)
    // Named in the copy the trader reads, so it must be a real percentage.
    expect(verdict.shortfall).toBeGreaterThan(0.02)
    expect(verdict.shortfall).toBeLessThan(0.1)
  })

  it("lets a small Short through — the closes that did work", async () => {
    // Position 66's size: 1 738 XLM, closed inside the band all along.
    const debt = xlm(1_737.82)
    const collateral = usdt(339.08)
    const targetOut = shortCloseDebtTarget(debt)
    const sizing = await solveShortCloseInput({
      collateral,
      quoteAtCollateral: await poolQuote(collateral),
      targetOut,
      quote: poolQuote,
    })
    expect(sizing.status).toBe('ok')
    if (sizing.status !== 'ok') return
    expect(shortCloseFloorVerdict({ swapInput: sizing.input, targetOut, ...PRICES }).blocked).toBe(false)
  })

  it("stops applying the floor once the contract stops enforcing it", async () => {
    const targetOut = shortCloseDebtTarget(P65_DEBT)
    const sizing = await solveShortCloseInput({
      collateral: P65_COLLATERAL,
      quoteAtCollateral: await poolQuote(P65_COLLATERAL),
      targetOut,
      quote: poolQuote,
    })
    if (sizing.status !== 'ok') throw new Error('sizing failed')
    const verdict = shortCloseFloorVerdict({
      swapInput: sizing.input,
      targetOut,
      ...PRICES,
      oracleFloorActive: false,
    })
    expect(verdict.blocked).toBe(false)
  })

  it("never blocks on a zero-sized swap", () => {
    expect(shortCloseFloorVerdict({ swapInput: BigInt(0), targetOut: xlm(1), ...PRICES }).blocked).toBe(false)
    expect(shortCloseFloorVerdict({ swapInput: usdt(1), targetOut: BigInt(0), ...PRICES }).blocked).toBe(false)
  })
})

describe("debtWithinQuote", () => {
  it("inverts shortCloseDebtTarget without overshooting the quote", () => {
    for (const q of [xlm(1), xlm(1_000), xlm(25_000), xlm(999_999)]) {
      expect(shortCloseDebtTarget(debtWithinQuote(q))).toBeLessThanOrEqual(q)
    }
  })

  it("is zero for a quote of nothing", () => {
    expect(debtWithinQuote(BigInt(0))).toBe(BigInt(0))
  })
})

describe("solveShortCloseInput", () => {
  it("finds an input the pool really covers, within the collateral", async () => {
    const targetOut = shortCloseDebtTarget(P65_DEBT)
    const sizing = await solveShortCloseInput({
      collateral: P65_COLLATERAL,
      quoteAtCollateral: await poolQuote(P65_COLLATERAL),
      targetOut,
      quote: poolQuote,
    })
    expect(sizing.status).toBe('ok')
    if (sizing.status !== 'ok') return
    expect(sizing.input).toBeLessThanOrEqual(P65_COLLATERAL)
    expect(await poolQuote(sizing.input)).toBeGreaterThanOrEqual(targetOut)
  })

  it("reports underwater when the whole collateral can't buy the debt back", async () => {
    const debt = xlm(100_000)
    const collateral = usdt(500)
    const sizing = await solveShortCloseInput({
      collateral,
      quoteAtCollateral: await poolQuote(collateral),
      targetOut: shortCloseDebtTarget(debt),
      quote: poolQuote,
    })
    expect(sizing).toEqual({ status: 'underwater' })
  })

  it("gives up as 'unstable' rather than looping when the pool keeps moving", async () => {
    // A pool that always comes back one stroop short, however the input is
    // bumped — the shape of "the quote moved again" rather than "too small".
    const target = xlm(1_000)
    const movingPool = async () => target - BigInt(1)
    const sizing = await solveShortCloseInput({
      collateral: usdt(1_000_000),
      quoteAtCollateral: xlm(6_000_000),
      targetOut: target,
      quote: movingPool,
      maxAttempts: 3,
    })
    expect(sizing).toEqual({ status: 'unstable' })
  })
})

describe("maxClosableShortDebt", () => {
  it("names a debt that actually clears the floor — the repay hint must work", async () => {
    const maxDebt = await maxClosableShortDebt({
      collateral: P65_COLLATERAL,
      quote: poolQuote,
      ...PRICES,
    })
    expect(maxDebt).toBeGreaterThan(BigInt(0))
    expect(maxDebt).toBeLessThan(P65_DEBT) // otherwise there would be nothing to repay

    // Round trip: at that debt the close is no longer blocked.
    const targetOut = shortCloseDebtTarget(maxDebt)
    const sizing = await solveShortCloseInput({
      collateral: P65_COLLATERAL,
      quoteAtCollateral: await poolQuote(P65_COLLATERAL),
      targetOut,
      quote: poolQuote,
    })
    expect(sizing.status).toBe('ok')
    if (sizing.status !== 'ok') return
    expect(shortCloseFloorVerdict({ swapInput: sizing.input, targetOut, ...PRICES }).blocked).toBe(false)
  })

  it("returns zero when the whole pool sits outside the band", async () => {
    // Every size quotes 20 % under the oracle — repaying wouldn't help.
    const badPool = async (input: bigint) => (input * BigInt(48)) / BigInt(10)
    const maxDebt = await maxClosableShortDebt({
      collateral: P65_COLLATERAL,
      quote: badPool,
      ...PRICES,
    })
    expect(maxDebt).toBe(BigInt(0))
  })

  it("costs a bounded number of quotes", async () => {
    let calls = 0
    await maxClosableShortDebt({
      collateral: P65_COLLATERAL,
      quote: async (i) => { calls++; return poolQuote(i) },
      ...PRICES,
      steps: 7,
    })
    expect(calls).toBeLessThanOrEqual(9)
  })
})

describe("UNIT sanity", () => {
  it("keeps both assets on 7 decimals", () => {
    expect(usdt(1)).toBe(UNIT)
    expect(xlm(1)).toBe(UNIT)
  })
})

/**
 * The size you can open is not always the size you can close.
 *
 * Opening pushes the Aquarius pool one way and closing pushes it back, both at a
 * price, while the contract's close floor is priced off the oracle and ignores
 * what happened in between. Past a crossover the round trip costs more than the
 * 5 % band allows — and until now nothing said so before the trade was placed.
 *
 * Measured against the chain on 20 Aug 2026 with
 * scripts/margin-probe-exit-capacity.ts: a Long 5× on 250 USDT opens and closes,
 * one on 500 USDT opens and cannot be closed. The pool below is a constant
 * product fitted to those same quotes — see the note on the reserves.
 */
import { describe, it, expect } from "vitest"
import {
  computeBorrowAndFloor,
  longCloseFloorVerdict,
  largestFeasibleSize,
} from "@/app/app/margin/lib/marginMath"

const usdt = (n: number) => BigInt(Math.round(n * 10_000_000))
const xlm = (n: number) => BigInt(Math.round(n * 10_000_000))

/** Reflector's testnet prices, as `get_price_usd` returns them (num/den). */
const USDT_PRICE = { num: BigInt("99942052443542"), den: BigInt("100000000000000") }
const XLM_PRICE = { num: BigInt("17263419954738"), den: BigInt("100000000000000") }
const RATE = BigInt(1_000_022) // vault exchange rate, scaled 1e6

/**
 * Constant product fitted to the live pool on 20 Aug 2026 — it reproduces the
 * measured USDT→XLM quotes to within 0.04 % (20 → 116.12 vs 116.16, 1 250 →
 * 7 102 vs 7 103.5, 2 500 → 13 902.34 vs 13 902.21).
 *
 * Fee-free, and only the buy leg was fitted, so the sell leg back is a touch
 * generous: the chain's Long 5× crossover sits at ~500 USDT and this curve's at
 * ~550. The exact chain number is the probe script's job
 * (scripts/margin-probe-exit-capacity.ts); what is asserted here is the SHAPE —
 * that a crossover exists, that it is found, and that sizes either side of it are
 * judged the way the contract judges them.
 */
const RESERVE_USDT = usdt(56_268)
const RESERVE_XLM = xlm(326_805)
const buyXlm = (usdtIn: bigint) => (RESERVE_XLM * usdtIn) / (RESERVE_USDT + usdtIn)
const sellXlm = (xlmIn: bigint) => (RESERVE_USDT * xlmIn) / (RESERVE_XLM + xlmIn)

/**
 * Open a Long of `collateral` USDT at `leverage`, then immediately try to close
 * it — the round trip the panel's warning is about.
 */
function longRoundTrip(collateral: number, leverage: number) {
  const collateralUnderlying = usdt(collateral)
  const collateralPtokens = (collateralUnderlying * BigInt(1_000_000)) / RATE
  const sizing = computeBorrowAndFloor({
    collateralPtokens,
    exchangeRate: RATE,
    leverage,
    side: "Long",
    collateralPrice: USDT_PRICE,
    debtPrice: USDT_PRICE,
    positionPrice: XLM_PRICE,
  })
  const position = buyXlm(sizing.collateralUnderlying + sizing.borrowAmount)
  return {
    openBlocked: position < sizing.oracleMinOut,
    verdict: longCloseFloorVerdict({
      positionUnderlying: position,
      quotedOut: sellXlm(position),
      positionPrice: XLM_PRICE,
      debtPrice: USDT_PRICE,
    }),
  }
}

describe("long close floor", () => {
  it("clears on a size the pool comfortably absorbs", () => {
    const { openBlocked, verdict } = longRoundTrip(250, 5)
    expect(openBlocked).toBe(false)
    expect(verdict.blocked).toBe(false)
  })

  it("catches a trade that opens and cannot be closed", () => {
    // The case this whole feature exists for, and the reason it can't be
    // inferred from the open check: the oracle band lets the order through and
    // the same band refuses the way out.
    const { openBlocked, verdict } = longRoundTrip(600, 5)
    expect(openBlocked).toBe(false)
    expect(verdict.blocked).toBe(true)
    expect(verdict.shortfall).toBeGreaterThan(0)
  })

  it("gets worse with size, never better", () => {
    const shortfalls = [600, 800, 1000, 1500].map((c) => longRoundTrip(c, 5).verdict.shortfall)
    for (let i = 1; i < shortfalls.length; i++) {
      expect(shortfalls[i]).toBeGreaterThan(shortfalls[i - 1])
    }
  })

  it("says nothing once the contract prices closes off the pool", () => {
    const { verdict } = longRoundTrip(600, 5)
    expect(verdict.blocked).toBe(true)
    const verdictNewContract = longCloseFloorVerdict({
      positionUnderlying: usdt(1),
      quotedOut: BigInt(1),
      positionPrice: XLM_PRICE,
      debtPrice: USDT_PRICE,
      oracleFloorActive: false,
    })
    expect(verdictNewContract.blocked).toBe(false)
  })

  it("treats a missing quote as no opinion, not as blocked", () => {
    const verdict = longCloseFloorVerdict({
      positionUnderlying: xlm(1000),
      quotedOut: BigInt(0),
      positionPrice: XLM_PRICE,
      debtPrice: USDT_PRICE,
    })
    expect(verdict.blocked).toBe(false)
  })
})

describe("largestFeasibleSize", () => {
  const feasibleBelow = (limit: number) => async (size: bigint) => size <= usdt(limit)

  it("lands just under the crossover", async () => {
    const max = await largestFeasibleSize({ hi: usdt(1000), feasible: feasibleBelow(400) })
    expect(max).toBeLessThanOrEqual(usdt(400))
    // 5 bisection steps from [31.25, 1000] leave at most ~30 USDT of slack.
    expect(max).toBeGreaterThan(usdt(370))
  })

  it("returns zero when even the smallest probe fails", async () => {
    const max = await largestFeasibleSize({ hi: usdt(1000), feasible: async () => false })
    expect(max).toBe(BigInt(0))
  })

  it("never proposes a size at or above the one that failed", async () => {
    // Everything is feasible except the asked-for size itself — the search must
    // still come back below it rather than handing back `hi`.
    const max = await largestFeasibleSize({ hi: usdt(1000), feasible: async (s) => s < usdt(1000) })
    expect(max).toBeLessThan(usdt(1000))
    expect(max).toBeGreaterThan(BigInt(0))
  })

  it("names a Long size that actually round-trips", async () => {
    const roundTrips = (size: bigint) => {
      const { openBlocked, verdict } = longRoundTrip(Number(size) / 10 ** 7, 5)
      return !openBlocked && !verdict.blocked
    }
    const asked = usdt(1500)
    expect(roundTrips(asked)).toBe(false)

    const max = await largestFeasibleSize({ hi: asked, feasible: async (s) => roundTrips(s) })
    // Whatever it names must survive the very test that refused the ask — the
    // one promise the panel makes when it offers "use this instead".
    expect(max).toBeGreaterThan(BigInt(0))
    expect(roundTrips(max)).toBe(true)
    expect(max).toBeLessThan(asked)
  })
})

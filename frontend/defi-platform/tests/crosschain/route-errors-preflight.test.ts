import { describe, expect, it } from "vitest"
import {
  chooseRail,
  directionOf,
  isOfferedToken,
  minOutFor,
  parseXcChain,
  sodaxKeyFor,
  XC_STELLAR_MARKET_SYMBOL,
} from "@/lib/crosschain/route"
import { classifyXcError, describeSodaxFailure, isUserRejection } from "@/lib/crosschain/errors"
import { checkAmountUsd, maxSpendable, preflight, stableSideUsd } from "@/lib/crosschain/preflight"
import { SodaxApiError } from "@/lib/crosschain/sodax"

describe("route", () => {
  it("names the direction by the Stellar side", () => {
    expect(directionOf(8453, "stellar")).toBe("in")
    expect(directionOf("stellar", 56)).toBe("out")
    expect(directionOf(8453, 4663)).toBeNull()
    expect(directionOf(10, "stellar")).toBeNull()
  })

  it("parses chains from query strings and bodies", () => {
    expect(parseXcChain("stellar")).toBe("stellar")
    expect(parseXcChain("56")).toBe(56)
    expect(parseXcChain(4663)).toBe(4663)
    expect(parseXcChain("10")).toBeNull()
    expect(parseXcChain("0x38")).toBeNull()
    expect(sodaxKeyFor(56)).toBe("0x38.bsc")
    expect(sodaxKeyFor("stellar")).toBe("stellar")
  })

  it("routes USDC and XLM on Stellar through SODAX, and nothing for EURC", () => {
    expect(chooseRail({ src: 8453, dst: "stellar", srcSymbol: "USDC", dstSymbol: "USDC" })).toEqual({ rail: "sodax" })
    expect(chooseRail({ src: "stellar", dst: 56, srcSymbol: "XLM", dstSymbol: "USDT" })).toEqual({ rail: "sodax" })
    expect(chooseRail({ src: 8453, dst: "stellar", srcSymbol: "USDC", dstSymbol: "EURC" }).rail).toBeNull()
    expect(chooseRail({ src: 8453, dst: 4663, srcSymbol: "USDC", dstSymbol: "USDG" }).rail).toBeNull()
    expect(XC_STELLAR_MARKET_SYMBOL["eurc-stellar"]).toBeUndefined()
  })

  it("offers only the stables and native coins, and only USDC/XLM on Stellar", () => {
    expect(isOfferedToken(56, { symbol: "USDT" })).toBe(true)
    expect(isOfferedToken(56, { symbol: "BTCB" })).toBe(false)
    expect(isOfferedToken("stellar", { symbol: "USDC" })).toBe(true)
    expect(isOfferedToken("stellar", { symbol: "bnUSD" })).toBe(false)
  })

  it("rounds the minimum down and clamps slippage", () => {
    expect(minOutFor(BigInt(1_000_000), 100)).toBe(BigInt(990_000))
    expect(minOutFor(BigInt(999), 100)).toBe(BigInt(989))
    expect(minOutFor(BigInt(1_000_000), 5_000)).toBe(BigInt(950_000))
  })
})

describe("errors", () => {
  it("maps SODAX quote refusals to the limits the user can act on", () => {
    const low = new SodaxApiError("SODAX /quote: getQuote failed: Input amount too low", 400, { code: -23 })
    expect(classifyXcError(low)).toMatchObject({ code: "amount_too_low", message: "Minimum is $5." })
    const big = new SodaxApiError("SODAX /quote: getQuote failed: No path was found between 0x72 and 0x34", 400, {})
    expect(classifyXcError(big).code).toBe("no_path")
  })

  it("recognises a closed wallet on every wallet we use", () => {
    expect(isUserRejection({ code: 4001, message: "x" })).toBe(true)
    expect(isUserRejection(new Error("User rejected the request."))).toBe(true)
    expect(isUserRejection(new Error("The user declined the transaction"))).toBe(true)
    expect(isUserRejection(new Error("intent cancelled by solver"))).toBe(false)
  })

  it("tells transport trouble apart from the unknown", () => {
    expect(classifyXcError(new SodaxApiError("x", 429, null)).code).toBe("rate_limited")
    expect(classifyXcError(new SodaxApiError("x", 503, null))).toMatchObject({ code: "unavailable", retryable: true })
    expect(classifyXcError(new TypeError("fetch failed")).code).toBe("unavailable")
    expect(classifyXcError(new Error("weird")).code).toBe("unknown")
  })

  it("says where the money is when SODAX cancelled the intent", () => {
    expect(describeSodaxFailure({ intentCancelled: true, failureReason: "no solver" }, "your Stellar wallet")).toBe(
      "This didn't go through. Your money is back in your Stellar wallet. (no solver)",
    )
    expect(describeSodaxFailure({}, "x")).toBe("This didn't go through. Support is looking at it.")
  })
})

describe("preflight", () => {
  it("keeps gas behind for native coins and the reserve for XLM", () => {
    expect(maxSpendable(8453, "ETH", 0.01, true)).toBeCloseTo(0.0097)
    expect(maxSpendable(8453, "USDC", 10, false)).toBe(10)
    expect(maxSpendable("stellar", "XLM", 10, false)).toBe(7)
    expect(maxSpendable("stellar", "XLM", 2, false)).toBe(0)
  })

  it("keeps less behind for a wallet that sends once, where that is measured", () => {
    expect(maxSpendable(8453, "ETH", 0.01, true, { singleSend: true })).toBeCloseTo(0.00995)
    // Not measured: the general reserve stays.
    expect(maxSpendable(1, "ETH", 0.01, true, { singleSend: true })).toBeCloseTo(0.007)
    expect(maxSpendable(8453, "USDC", 10, false, { singleSend: true })).toBe(10)
    expect(
      preflight({
        direction: "in",
        src: 8453,
        srcSymbol: "ETH",
        dstSymbol: "USDC",
        srcIsNative: true,
        amount: 0.0099,
        srcBalance: 0.01,
        usd: 26,
        stellarHasUsdcTrustline: true,
        singleSend: true,
      }),
    ).toEqual([])
  })

  it("values a leg from its stable side only", () => {
    expect(stableSideUsd({ srcSymbol: "USDT", srcAmount: 12, dstSymbol: "XLM", quotedOut: 40 })).toBe(12)
    expect(stableSideUsd({ srcSymbol: "ETH", srcAmount: 0.01, dstSymbol: "USDC", quotedOut: 25 })).toBe(25)
    expect(stableSideUsd({ srcSymbol: "ETH", srcAmount: 0.01, dstSymbol: "XLM", quotedOut: 80 })).toBeNull()
  })

  it("applies the $5 floor and the roll-out cap, and not an unknown value", () => {
    expect(checkAmountUsd(4.99)?.code).toBe("amount_too_low")
    expect(checkAmountUsd(5)).toBeNull()
    expect(checkAmountUsd(500)).toBeNull()
    expect(checkAmountUsd(500.01)?.code).toBe("over_cap")
    expect(checkAmountUsd(null)).toBeNull()
  })

  it("blocks a USDC deposit into a wallet without a trustline, and a balance too small", () => {
    const base = {
      direction: "in" as const,
      src: 8453 as const,
      srcSymbol: "USDC",
      dstSymbol: "USDC",
      srcIsNative: false,
      amount: 20,
      srcBalance: 50,
      usd: 20,
      stellarHasUsdcTrustline: true,
    }
    expect(preflight(base)).toEqual([])
    expect(preflight({ ...base, stellarHasUsdcTrustline: false }).map((p) => p.code)).toEqual(["no_trustline"])
    expect(preflight({ ...base, srcBalance: 10 }).map((p) => p.code)).toEqual(["insufficient_funds"])
    // Unknown balance and unknown trustline never block.
    expect(preflight({ ...base, srcBalance: null, stellarHasUsdcTrustline: null })).toEqual([])
    // XLM has no trustline to check.
    expect(preflight({ ...base, dstSymbol: "XLM", stellarHasUsdcTrustline: false })).toEqual([])
  })
})

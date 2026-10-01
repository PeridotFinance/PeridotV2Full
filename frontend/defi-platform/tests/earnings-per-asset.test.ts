import { describe, it, expect } from "vitest"
import {
  earningsByAssetId,
  sumEarningsForAssets,
  formatEarnedUsd,
  MIN_DISPLAYABLE_EARNINGS,
} from "@/lib/earnings/per-asset"
import { CHAIN_IDS } from "@/config/contracts"

const STELLAR = CHAIN_IDS.STELLAR_MAINNET
const BSC = 56

describe("earningsByAssetId", () => {
  it("suffixes Stellar markets so they match the app's asset ids", () => {
    // The whole point of the helper: the API reports a bare "USDC" plus the
    // Stellar chain id, while every table row is keyed "usdc-stellar". A miss
    // here is silent and shows a funded position as having earned nothing.
    const map = earningsByAssetId([
      { tokenSymbol: "USDC", chainId: STELLAR, earnings: 3.12 },
    ])
    expect(map).toEqual({ "usdc-stellar": 3.12 })
  })

  it("leaves EVM markets unsuffixed", () => {
    const map = earningsByAssetId([
      { tokenSymbol: "USDC", chainId: BSC, earnings: 0.44 },
    ])
    expect(map).toEqual({ usdc: 0.44 })
  })

  it("keeps the same symbol on two chains apart", () => {
    const map = earningsByAssetId([
      { tokenSymbol: "USDC", chainId: STELLAR, earnings: 3.12 },
      { tokenSymbol: "USDC", chainId: BSC, earnings: 0.44 },
    ])
    expect(map["usdc-stellar"]).toBe(3.12)
    expect(map.usdc).toBe(0.44)
  })

  it("adds up several entries for one market", () => {
    const map = earningsByAssetId([
      { tokenSymbol: "XLM", chainId: STELLAR, earnings: 1 },
      { tokenSymbol: "xlm", chainId: STELLAR, earnings: 2 },
    ])
    expect(map["xlm-stellar"]).toBe(3)
  })

  it("drops entries that cannot be placed instead of guessing", () => {
    const map = earningsByAssetId([
      { tokenSymbol: "", chainId: STELLAR, earnings: 5 },
      { tokenSymbol: "USDC", chainId: STELLAR, earnings: Number.NaN },
      { tokenSymbol: "EURC", chainId: STELLAR, earnings: -1 },
    ])
    expect(map).toEqual({})
  })

  it("returns an empty map for a missing breakdown", () => {
    expect(earningsByAssetId(undefined)).toEqual({})
    expect(earningsByAssetId(null)).toEqual({})
    expect(earningsByAssetId([])).toEqual({})
  })
})

describe("sumEarningsForAssets", () => {
  const map = { "usdc-stellar": 3.12, usdc: 0.44, usdt: 0.1 }

  it("sums exactly the markets a row aggregates", () => {
    expect(sumEarningsForAssets(map, ["usdc-stellar", "usdc", "usdt"])).toBeCloseTo(3.66)
  })

  it("covers only Stellar when the host hides the EVM pools", () => {
    expect(sumEarningsForAssets(map, ["usdc-stellar"])).toBe(3.12)
  })

  it("reports unknown rather than zero when no market has a trail", () => {
    // A verified-transaction trail missing this market is not proof the
    // position earned nothing, so callers must be able to tell the two apart
    // and render no line at all.
    expect(sumEarningsForAssets(map, ["eurc-stellar"])).toBeNull()
  })

  it("still sums when only some of the ids are known", () => {
    expect(sumEarningsForAssets(map, ["usdc-stellar", "eurc-stellar"])).toBe(3.12)
  })
})

describe("display threshold", () => {
  it("treats a fraction of a cent as not worth showing", () => {
    // It would render as "+$0.00", which reads as "earned nothing".
    expect(0.004 >= MIN_DISPLAYABLE_EARNINGS).toBe(false)
    expect(0.006 >= MIN_DISPLAYABLE_EARNINGS).toBe(true)
  })

  it("formats to cents", () => {
    expect(formatEarnedUsd(3.126)).toBe("$3.13")
    expect(formatEarnedUsd(1200)).toBe("$1200.00")
  })
})

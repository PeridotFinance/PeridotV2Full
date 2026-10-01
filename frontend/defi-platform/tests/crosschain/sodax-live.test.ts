// @vitest-environment node
/**
 * The engine's server half against the real SODAX API, read-only: token lists,
 * quotes, prices, the limits and the intent parameters. Nothing is created or
 * signed. Opt-in, because it needs the network:
 *
 *   RUN_SODAX_LIVE=1 npx vitest run tests/crosschain/sodax-live.test.ts
 */
import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/cctp/store", () => ({}))

import { offeredTokens, prepareLeg, quoteLeg, usdPrice, XcRequestError } from "@/lib/crosschain/server"
import { classifyXcError } from "@/lib/crosschain/errors"
import { sodaxAllowanceValid } from "@/lib/crosschain/sodax"

const G = "GDFC54XDONDU7QX7ZOWCHOJ3ZILLGNHVNSQLBXMC3JNAQGCAQFJ6HSEW"
const EVM = "0x000000000000000000000000000000000000dEaD"

describe.skipIf(!process.env.RUN_SODAX_LIVE)("SODAX live", { timeout: 60_000 }, () => {
  it("lists only the offered tokens, with the decimals SODAX reports", async () => {
    const bsc = await offeredTokens(56)
    expect(bsc.map((t) => t.symbol).sort()).toEqual(["BNB", "USDC", "USDT"])
    expect(bsc.find((t) => t.symbol === "USDT")?.decimals).toBe(18)
    const stellar = await offeredTokens("stellar")
    expect(stellar.map((t) => t.symbol).sort()).toEqual(["USDC", "XLM"])
  })

  it("quotes Base USDC into Stellar USDC and values it at the input", async () => {
    const base = await offeredTokens(8453)
    const stellar = await offeredTokens("stellar")
    const leg = await quoteLeg({
      src: 8453,
      dst: "stellar",
      srcToken: base.find((t) => t.symbol === "USDC")!.address,
      dstToken: stellar.find((t) => t.symbol === "USDC")!.address,
      amount: "10000000",
    })
    expect(leg.direction).toBe("in")
    expect(leg.usd).toBe(10)
    expect(leg.limit).toBeNull()
    expect(Number(leg.quotedOut) / 1e7).toBeGreaterThan(9.9)
    expect(leg.minOut < leg.quotedOut).toBe(true)
  })

  it("prices native coins and flags the roll-out cap", async () => {
    const eth = (await offeredTokens(8453)).find((t) => t.symbol === "ETH")!
    const price = await usdPrice(8453, eth)
    expect(price).toBeGreaterThan(100)
    const stellar = await offeredTokens("stellar")
    const leg = await quoteLeg({
      src: 8453,
      dst: "stellar",
      srcToken: eth.address,
      dstToken: stellar.find((t) => t.symbol === "XLM")!.address,
      amount: "1000000000000000000",
    })
    expect(leg.usd).toBeGreaterThan(500)
    expect(leg.limit?.code).toBe("over_cap")
    await expect(
      prepareLeg({ src: 8453, dst: "stellar", srcToken: eth.address, dstToken: stellar.find((t) => t.symbol === "XLM")!.address, amount: "1000000000000000000", stellarAddress: G, evmAddress: EVM }),
    ).rejects.toBeInstanceOf(XcRequestError)
  })

  it("turns SODAX's floor into the $5 message", async () => {
    const base = await offeredTokens(8453)
    const stellar = await offeredTokens("stellar")
    const err = await quoteLeg({
      src: 8453,
      dst: "stellar",
      srcToken: base.find((t) => t.symbol === "USDC")!.address,
      dstToken: stellar.find((t) => t.symbol === "USDC")!.address,
      amount: "1000000",
    }).catch((e) => e)
    expect(classifyXcError(err).code).toBe("amount_too_low")
  })

  it("builds withdrawal params with the Stellar wallet as sender", async () => {
    const stellar = await offeredTokens("stellar")
    const bsc = await offeredTokens(56)
    const leg = await prepareLeg({
      src: "stellar",
      dst: 56,
      srcToken: stellar.find((t) => t.symbol === "USDC")!.address,
      dstToken: bsc.find((t) => t.symbol === "USDT")!.address,
      amount: "100000000",
      stellarAddress: G,
      evmAddress: EVM,
    })
    expect(leg.params.srcAddress).toBe(G)
    expect(leg.params.dstAddress).toBe(EVM)
    expect(leg.deadlineAt!.getTime()).toBeGreaterThan(Date.now())
  })

  it("builds deposit params SODAX's allowance check accepts", async () => {
    const stellar = await offeredTokens("stellar")
    const base = await offeredTokens(8453)
    const leg = await prepareLeg({
      src: 8453,
      dst: "stellar",
      srcToken: base.find((t) => t.symbol === "USDC")!.address,
      dstToken: stellar.find((t) => t.symbol === "USDC")!.address,
      amount: "10000000",
      stellarAddress: G,
      evmAddress: EVM.toLowerCase(),
    })
    expect(leg.params.srcAddress).toBe(EVM)
    // A burn address has approved nothing.
    expect(await sodaxAllowanceValid(leg.params)).toBe(false)
  })
})

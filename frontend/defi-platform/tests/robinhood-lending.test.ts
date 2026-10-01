/**
 * Robinhood Chain lending (USDG / NVDA): the math, the limits and the flows.
 *
 * The fixture is the mainnet state measured on 2026-09-25: the controller
 * oracle answered 1e18 for USDG (a 6-decimal token), which Compound math reads
 * as a trillionth of a dollar, and 225.66e18 for NVDA (18 decimals), which is
 * right. What these guard:
 *   - a mispriced market is detected, and a fixed oracle (1e30) is not flagged;
 *   - the borrow and withdraw MAX are the controller's own limits, bounded by
 *     cash and cap; on a mispriced market the reference-priced capacity bar is
 *     what shows the over-borrow (above 100%), the form does not narrow it;
 *   - an NVDA borrow against USDG-only collateral offers nothing, with a reason;
 *   - a nonzero Compound code never reaches the wallet;
 *   - a receipt without the market's event is not a success;
 *   - "repay all" sends uint256.max with a buffered approval.
 */
import { describe, expect, it, vi } from "vitest"
import { encodeAbiParameters, encodeEventTopics, getAbiItem, maxUint256, type Abi } from "viem"

import { ROBINHOOD_ABIS } from "@/app/abis/robinhood"
import { ROBINHOOD_MARGIN, ROBINHOOD_TOKENS } from "@/config/robinhood"
import {
  ROBINHOOD_CONTROLLER,
  ROBINHOOD_LENDING_MARKETS,
  isMispriced,
  projectedLimitUsedPct,
  ratePerBlockToApy,
  readRobinhoodLendingAccount,
  readRobinhoodLendingMarkets,
  resetRobinhoodLendingCaches,
  robinhoodLendingLimit,
  summarizeRobinhoodLending,
} from "@/lib/robinhood/lending"
import {
  checkLendingCode,
  runRobinhoodLendingCollateral,
  runRobinhoodLendingRepay,
  runRobinhoodLendingSupply,
} from "@/lib/robinhood/lending-flows"
import { decodeRobinhoodError } from "@/lib/robinhood/errors"
import { RobinhoodTxError } from "@/lib/robinhood/tx"

const USER = "0x1111111111111111111111111111111111111111" as const
const ORACLE = "0x266F014d1325774F1190f963Df4369E07dDA1d33" as const
const IRM = "0x0987154fB5676a8Ea545AAf41F8ef2492F785d22" as const
const T = ROBINHOOD_TOKENS
const [USDG_MARKET, NVDA_MARKET] = ROBINHOOD_LENDING_MARKETS
const WAD = 10n ** 18n
const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

// ---------------------------------------------------------------------------
// A tiny chain
// ---------------------------------------------------------------------------

interface ChainState {
  usdgControllerPrice: bigint
  /** pToken shares held by USER. */
  shares: { usdg: bigint; nvda: bigint }
  borrowed: { usdg: bigint; nvda: bigint }
  wallet: { usdg: bigint; nvda: bigint }
  allowance: { usdg: bigint; nvda: bigint }
  entered: { usdg: boolean; nvda: boolean }
  /** Controller liquidity, computed like the contract (with its own prices). */
  liquidity?: bigint
}

const RATE_USDG = 200_001_750_000_000n // exchangeRateStored, 8-dec shares -> 6-dec USDG
const RATE_NVDA = 200_000_896_690_404_640_000_000_000n // 8-dec shares -> 18-dec NVDA
const NVDA_PRICE = 225_660_187_070_000_000_000n
const CF = 800_000_000_000_000_000n

function underlying(state: ChainState, which: "usdg" | "nvda") {
  return (state.shares[which] * (which === "usdg" ? RATE_USDG : RATE_NVDA)) / WAD
}

/** The controller's own liquidity, exactly as Compound computes it. */
function contractLiquidity(state: ChainState): [bigint, bigint] {
  const priceU = state.usdgControllerPrice
  let collateral = 0n
  if (state.entered.usdg) collateral += (((underlying(state, "usdg") * priceU) / WAD) * CF) / WAD
  if (state.entered.nvda) collateral += (((underlying(state, "nvda") * NVDA_PRICE) / WAD) * CF) / WAD
  const debt = (state.borrowed.usdg * priceU) / WAD + (state.borrowed.nvda * NVDA_PRICE) / WAD
  return collateral >= debt ? [collateral - debt, 0n] : [0n, debt - collateral]
}

function makeClient(state: ChainState, opts: { codes?: Record<string, bigint | bigint[]>; dropEvent?: boolean } = {}) {
  const which = (addr: string) => (eq(addr, T.pUSDG) || eq(addr, T.USDG) ? "usdg" : "nvda")
  const read = ({ address, functionName, args = [] }: any): unknown => {
    const isP = eq(address, T.pUSDG) || eq(address, T.pNVDA)
    if (isP) {
      const w = which(address)
      switch (functionName) {
        case "totalSupply": return w === "usdg" ? 20_000_000_000n : 100_000_000n
        case "totalBorrows": return 0n
        case "getCash": return w === "usdg" ? 4_000_035n : 19_983_457_829_087_898n
        case "totalReserves": return 0n
        case "exchangeRateStored": return w === "usdg" ? RATE_USDG : RATE_NVDA
        case "supplyRatePerBlock": return 0n
        case "borrowRatePerBlock": return 7_610_350_076n
        case "vaultAccountedAssets": return w === "usdg" ? 2_000_035n : 16_631_839_952_566n
        case "vaultPaused": return false
        case "interestRateModel": return IRM
        case "balanceOf": return state.shares[w]
        case "borrowBalanceStored": return state.borrowed[w]
      }
    }
    if (eq(address, T.USDG) || eq(address, T.NVDA)) {
      const w = which(address)
      if (functionName === "balanceOf") return state.wallet[w]
      if (functionName === "allowance") return state.allowance[w]
    }
    if (eq(address, IRM) && functionName === "blocksPerYear") return 2_628_000n
    if (eq(address, ORACLE) && functionName === "getUnderlyingPrice") {
      return which(args[0]) === "usdg" ? state.usdgControllerPrice : NVDA_PRICE
    }
    if (eq(address, ROBINHOOD_MARGIN.oracle)) {
      if (functionName === "getPrice") return eq(args[0], T.USDG) ? WAD : NVDA_PRICE
      if (functionName === "marketPriceable") return true
    }
    if (eq(address, ROBINHOOD_CONTROLLER)) {
      switch (functionName) {
        case "oracle": return ORACLE
        case "markets": return [true, CF, false]
        case "mintGuardianPaused": return false
        case "borrowGuardianPaused": return false
        case "borrowCaps": return which(args[0]) === "usdg" ? 1_000_000_000n : 4_350_000_000_000_000_000n
        case "checkMembership": return state.entered[which(args[1])]
        case "getAccountLiquidity": {
          const [liq, short] = state.liquidity !== undefined ? [state.liquidity, 0n] : contractLiquidity(state)
          return [0n, liq, short]
        }
      }
    }
    throw new Error(`unexpected read ${functionName} @ ${address}`)
  }

  const sent: { functionName: string; args: readonly unknown[]; address: string }[] = []
  let lastCall: any = null

  const client = {
    readContract: vi.fn(async (a: any) => read(a)),
    getBlockNumber: vi.fn(async () => 72_500_000n),
    getBalance: vi.fn(async () => 10n ** 16n),
    getGasPrice: vi.fn(async () => 20_000_000n),
    simulateContract: vi.fn(async (a: any) => {
      const code = opts.codes?.[a.functionName]
      if (code !== undefined) return { result: code }
      if (a.functionName === "approve") return { result: true }
      if (a.functionName === "enterMarkets") return { result: [0n] }
      return { result: 0n }
    }),
    waitForTransactionReceipt: vi.fn(async () => {
      const c = lastCall
      const logs: any[] = []
      const ev: Record<string, [string, Record<string, unknown>]> = {
        mint: ["Mint", { minter: USER, mintAmount: c.args[0], mintTokens: 1n }],
        repayBorrow: ["RepayBorrow", { payer: USER, borrower: USER, repayAmount: 1n, accountBorrows: 0n, totalBorrows: 0n }],
        borrow: ["Borrow", { borrower: USER, borrowAmount: c.args[0], accountBorrows: c.args[0], totalBorrows: c.args[0] }],
      }
      const hit = ev[c.functionName]
      if (hit && !opts.dropEvent) logs.push(makeLog(ROBINHOOD_ABIS.pToken as Abi, hit[0], c.address, hit[1]))
      if (c.functionName === "enterMarkets") state.entered[which(c.args[0][0])] = true
      if (c.functionName === "exitMarket") state.entered[which(c.args[0])] = false
      return { status: "success", logs, blockNumber: 1n, blockHash: "0x" + "ab".repeat(32) } as any
    }),
  }

  const deps = {
    client: client as any,
    ensureChain: vi.fn(async () => {}),
    send: vi.fn(async (tx: any) => {
      // Decode which call was sent so the receipt can emit its event.
      const abi = eq(tx.to, ROBINHOOD_CONTROLLER)
        ? (await import("@/lib/robinhood/lending")).ROBINHOOD_CONTROLLER_ABI
        : eq(tx.to, T.USDG) || eq(tx.to, T.NVDA)
          ? ROBINHOOD_ABIS.erc20
          : ROBINHOOD_ABIS.pToken
      const { decodeFunctionData } = await import("viem")
      const decoded = decodeFunctionData({ abi: abi as Abi, data: tx.data })
      lastCall = { functionName: decoded.functionName, args: decoded.args ?? [], address: tx.to }
      sent.push(lastCall)
      return ("0x" + "ef".repeat(32)) as `0x${string}`
    }),
  }
  return { client, deps, sent }
}

function makeLog(abi: Abi, eventName: string, address: string, args: Record<string, unknown>) {
  const item = getAbiItem({ abi, name: eventName }) as any
  const plain = item.inputs.filter((i: any) => !i.indexed)
  return {
    address,
    topics: encodeEventTopics({ abi, eventName } as any),
    data: encodeAbiParameters(plain, plain.map((i: any) => args[i.name])),
    blockNumber: 1n,
    blockHash: "0x" + "ab".repeat(32),
    logIndex: 0,
    transactionIndex: 0,
    transactionHash: "0x" + "cd".repeat(32),
    removed: false,
  }
}

const baseState = (over: Partial<ChainState> = {}): ChainState => ({
  usdgControllerPrice: WAD, // the measured misconfiguration
  shares: { usdg: 0n, nvda: 0n },
  borrowed: { usdg: 0n, nvda: 0n },
  wallet: { usdg: 10_000_000n, nvda: 10n ** 17n },
  allowance: { usdg: 0n, nvda: 0n },
  entered: { usdg: false, nvda: false },
  ...over,
})

async function load(state: ChainState) {
  resetRobinhoodLendingCaches()
  const { client } = makeClient(state)
  const markets = await readRobinhoodLendingMarkets(client as any)
  const account = await readRobinhoodLendingAccount(client as any, USER)
  return { markets, account }
}

// ---------------------------------------------------------------------------
// Math and reads
// ---------------------------------------------------------------------------

describe("Robinhood lending math", () => {
  it("turns the per-block rate into an APY with the model's blocks per year", () => {
    // 7.61e9 per block x 2,628,000 blocks is the model's 2% base borrow rate.
    const apy = ratePerBlockToApy(7_610_350_076n, 2_628_000n)!
    expect(apy).toBeGreaterThan(2.0)
    expect(apy).toBeLessThan(2.03)
    expect(ratePerBlockToApy(0n, 2_628_000n)).toBe(0)
    expect(ratePerBlockToApy(null, 2_628_000n)).toBeNull()
  })

  it("flags the USDG controller price of 1e18 and accepts the Compound 1e30", () => {
    expect(isMispriced(WAD, WAD, 6)).toBe(true)
    expect(isMispriced(10n ** 30n, WAD, 6)).toBe(false)
    expect(isMispriced(NVDA_PRICE, NVDA_PRICE, 18)).toBe(false)
    expect(isMispriced(null, WAD, 6)).toBeNull()
  })

  it("reads both markets live: TVL, utilization, vault share, APYs", async () => {
    const { markets } = await load(baseState())
    const usdg = markets.markets.find((m) => m.market.id === "usdg-robinhood")!
    const nvda = markets.markets.find((m) => m.market.id === "nvda-robinhood")!
    expect(markets.blocksPerYear).toBe(2_628_000n)
    expect(usdg.tvlUsd).toBeCloseTo(4.000035, 5)
    expect(usdg.priceUsd).toBe(1)
    expect(usdg.mispriced).toBe(true)
    expect(nvda.mispriced).toBe(false)
    expect(nvda.tvlUsd).toBeCloseTo(0.02 * 225.66, 2)
    expect(usdg.vaultShare).toBeCloseTo(0.5, 2)
    expect(usdg.supplyApy).toBe(0)
    expect(usdg.borrowApy).toBeGreaterThan(2)
    expect(usdg.utilizationPct).toBe(0)
  })

  it("leaves the net APY unknown when a held market's rate could not be read", async () => {
    const state = baseState({ shares: { usdg: 15_000_000_000n, nvda: 0n }, entered: { usdg: true, nvda: false } })
    const { markets, account } = await load(state)
    expect(summarizeRobinhoodLending(markets, account).netApy).toBe(0)
    const unread = {
      ...markets,
      markets: markets.markets.map((m) => (m.market.id === "usdg-robinhood" ? { ...m, supplyApy: null } : m)),
    }
    expect(summarizeRobinhoodLending(unread, account).netApy).toBeNull()
    // A rate on a side the user does not hold does not matter.
    const unreadBorrow = {
      ...markets,
      markets: markets.markets.map((m) => (m.market.id === "usdg-robinhood" ? { ...m, borrowApy: null } : m)),
    }
    expect(summarizeRobinhoodLending(unreadBorrow, account).netApy).toBe(0)
  })
})

describe("Robinhood lending limits", () => {
  it("offers the controller's USDG borrow limit, bounded by the market's cash", async () => {
    // 1 pNVDA share = 0.02 NVDA = $4.51; 80% => $3.61 of real cover.
    const state = baseState({ shares: { usdg: 0n, nvda: 100_000_000n }, entered: { usdg: false, nvda: true } })
    const { markets, account } = await load(state)
    const limit = robinhoodLendingLimit("borrow", "usdg-robinhood", markets, account)
    expect(limit.blocked).toBe(false)
    // The controller would lend 3.61e18 raw USDG (3.6 trillion) at its 1e18
    // price, so the market's 4 USDG of cash is what binds.
    expect(limit.max).toBe(4_000_035n)
    expect(limit.boundBy).toBe("liquidity")
    // The reference-priced bar shows that this is more than the $3.61 of cover.
    expect(projectedLimitUsedPct("borrow", "usdg-robinhood", limit.max, markets, account)!).toBeGreaterThan(100)
  })

  it("borrows up to the cover once the oracle is fixed", async () => {
    const state = baseState({
      usdgControllerPrice: 10n ** 30n,
      shares: { usdg: 0n, nvda: 100_000_000n },
      entered: { usdg: false, nvda: true },
    })
    const { markets, account } = await load(state)
    const limit = robinhoodLendingLimit("borrow", "usdg-robinhood", markets, account)
    // $3.61 of cover less the interest headroom, below the 4 USDG of cash.
    expect(limit.boundBy).toBe("collateral")
    expect(limit.max).toBeGreaterThan(3_580_000n)
    expect(limit.max).toBeLessThan(3_611_000n)
    expect(projectedLimitUsedPct("borrow", "usdg-robinhood", limit.max, markets, account)!).toBeLessThanOrEqual(100)
  })

  it("offers no NVDA borrow against USDG-only collateral and says why", async () => {
    const state = baseState({ shares: { usdg: 15_000_000_000n, nvda: 0n }, entered: { usdg: true, nvda: false } })
    const { markets, account } = await load(state)
    const summary = summarizeRobinhoodLending(markets, account)
    expect(summary.undercreditedMarkets).toEqual(["usdg-robinhood"])
    const limit = robinhoodLendingLimit("borrow", "nvda-robinhood", markets, account)
    expect(limit.max).toBe(0n)
    expect(limit.reason).toMatch(/not counted/i)
  })

  it("keeps borrowing normal once the oracle is fixed", async () => {
    const state = baseState({
      usdgControllerPrice: 10n ** 30n,
      shares: { usdg: 15_000_000_000n, nvda: 0n },
      entered: { usdg: true, nvda: false },
    })
    const { markets, account } = await load(state)
    // 150 pUSDG = 3.00 USDG, 80% => $2.40 of cover => ~0.0106 NVDA
    const limit = robinhoodLendingLimit("borrow", "nvda-robinhood", markets, account)
    expect(limit.reason).toBeNull()
    const nvda = Number(limit.max) / 1e18
    expect(nvda).toBeGreaterThan(0.0105)
    expect(nvda).toBeLessThan(0.01064)
  })

  it("offers the controller's withdrawal limit, which ignores weightless USDG debt", async () => {
    const state = baseState({
      shares: { usdg: 0n, nvda: 100_000_000n },
      entered: { usdg: false, nvda: true },
      borrowed: { usdg: 1_000_000n, nvda: 0n },
    })
    const { markets, account } = await load(state)
    const limit = robinhoodLendingLimit("withdraw", "nvda-robinhood", markets, account)
    // At 1e18 the controller values the $1 of USDG debt at a trillionth of a
    // dollar, so all 0.02 NVDA is free to it; the headroom keeps 0.5% back.
    const nvda = Number(limit.max) / 1e18
    expect(limit.boundBy).toBe("collateral")
    expect(nvda).toBeGreaterThan(0.0198)
    expect(nvda).toBeLessThan(0.02)
    // The reference-priced bar shows the loan left without cover.
    expect(projectedLimitUsedPct("withdraw", "nvda-robinhood", limit.max, markets, account)!).toBeGreaterThan(100)
  })

  it("limits a collateral withdrawal to what the loan leaves free once the oracle is fixed", async () => {
    const state = baseState({
      usdgControllerPrice: 10n ** 30n,
      shares: { usdg: 0n, nvda: 100_000_000n },
      entered: { usdg: false, nvda: true },
      borrowed: { usdg: 1_000_000n, nvda: 0n },
    })
    const { markets, account } = await load(state)
    const limit = robinhoodLendingLimit("withdraw", "nvda-robinhood", markets, account)
    // Cover $3.61, debt $1 => $2.61 spare => /0.8 => $3.26 of NVDA => ~0.01446 NVDA.
    const nvda = Number(limit.max) / 1e18
    expect(limit.boundBy).toBe("collateral")
    expect(nvda).toBeGreaterThan(0.0143)
    expect(nvda).toBeLessThan(0.01447)
    expect(projectedLimitUsedPct("withdraw", "nvda-robinhood", limit.max, markets, account)!).toBeLessThanOrEqual(100)
  })

  it("repays at most the debt, or the wallet when it holds less", async () => {
    const { markets, account } = await load(baseState({ borrowed: { usdg: 2_000_000n, nvda: 0n }, wallet: { usdg: 1_000_000n, nvda: 0n } }))
    const limit = robinhoodLendingLimit("repay", "usdg-robinhood", markets, account)
    expect(limit.max).toBe(1_000_000n)
    expect(limit.boundBy).toBe("wallet")
  })
})

// ---------------------------------------------------------------------------
// Flows
// ---------------------------------------------------------------------------

describe("Robinhood lending flows", () => {
  it("checks Compound codes and custom rejections", () => {
    expect(checkLendingCode(0n)).toBeNull()
    expect(checkLendingCode([0n])).toBeNull()
    expect(checkLendingCode(12n)).toMatch(/Repay the debt/)
    expect(checkLendingCode([0n, 14n])).toMatch(/still needs this collateral/)
  })

  it("supplies with a bounded approval, then enables collateral", async () => {
    resetRobinhoodLendingCaches()
    const state = baseState()
    const { deps, sent } = makeClient(state)
    await runRobinhoodLendingSupply(deps as any, USER, { market: USDG_MARKET, amount: 2_000_000n, enableCollateral: true })
    expect(sent.map((s) => s.functionName)).toEqual(["approve", "mint", "enterMarkets"])
    expect((sent[0].args[0] as string).toLowerCase()).toBe(T.pUSDG.toLowerCase())
    expect(sent[0].args[1]).toBe(2_000_000n)
  })

  it("never signs a call whose simulation answered a nonzero code", async () => {
    resetRobinhoodLendingCaches()
    const state = baseState({ shares: { usdg: 100n, nvda: 0n }, entered: { usdg: true, nvda: false } })
    const { deps, sent } = makeClient(state, { codes: { exitMarket: 12n } })
    await expect(
      runRobinhoodLendingCollateral(deps as any, USER, { market: USDG_MARKET, enable: false }),
    ).rejects.toBeInstanceOf(RobinhoodTxError)
    expect(sent).toHaveLength(0)
  })

  it("treats a receipt without the market's event as a failure", async () => {
    resetRobinhoodLendingCaches()
    const state = baseState({ allowance: { usdg: 10n ** 12n, nvda: 0n } })
    const { deps } = makeClient(state, { dropEvent: true })
    await expect(
      runRobinhoodLendingSupply(deps as any, USER, { market: USDG_MARKET, amount: 1_000_000n }),
    ).rejects.toThrow(/did not record it/)
  })

  it("repays everything with uint256.max and a buffered approval", async () => {
    resetRobinhoodLendingCaches()
    const state = baseState({ borrowed: { usdg: 0n, nvda: 10n ** 15n }, wallet: { usdg: 0n, nvda: 10n ** 17n } })
    const { deps, sent } = makeClient(state)
    await runRobinhoodLendingRepay(deps as any, USER, { market: NVDA_MARKET, amount: 10n ** 15n, all: true })
    expect(sent.map((s) => s.functionName)).toEqual(["approve", "repayBorrow"])
    expect(sent[0].args[1]).toBe(10n ** 15n + 10n ** 12n + 1n)
    expect(sent[1].args[0]).toBe(maxUint256)
  })

  it("decodes a controller rejection wrapped by the pToken", () => {
    const err = { data: { errorName: "BorrowPeridottrollerRejection", args: [4n] } }
    const decoded = decodeRobinhoodError(err)
    expect(decoded.kind).toBe("margin")
    expect(decoded.message).toMatch(/Not enough collateral/)
  })
})

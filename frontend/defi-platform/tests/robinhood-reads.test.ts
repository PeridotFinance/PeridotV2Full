/**
 * The Robinhood read layer against a stubbed client.
 *
 * What these guard: a failed oracle read must surface as `null`, never as a
 * zero price or a zero health (guide section 4); position discovery must pick
 * enumeration for a small deployment and logs for a large one; a position
 * whose risk engine call fails must be flagged unavailable, not healthy.
 */
import { describe, expect, it, vi } from "vitest"

import { ROBINHOOD_MARGIN, ROBINHOOD_PAIRS, ROBINHOOD_TOKENS } from "@/config/robinhood"
import {
  discoverRobinhoodPositionIds,
  readRobinhoodAccountState,
  readRobinhoodMarketState,
  readRobinhoodPositions,
  ROBINHOOD_ENUMERATION_LIMIT,
  ROBINHOOD_LOG_PAGE_BLOCKS,
} from "@/lib/robinhood/reads"
import { healthFromBps, leverageFromX100, sharesFromUnderlying, UINT256_MAX, underlyingFromShares, WAD } from "@/lib/robinhood/units"
import { deriveRobinhoodAvailability } from "@/hooks/use-robinhood-margin-market"

const USER = "0x1111111111111111111111111111111111111111" as const
const OTHER = "0x2222222222222222222222222222222222222222" as const
const ACCOUNT = "0x3333333333333333333333333333333333333333" as const

type Call = { address: string; functionName: string; args?: unknown[] }
type Answer = (call: Call) => unknown

/** A client whose multicall answers each contract call through `answer`; a thrown value becomes a failure entry. */
function stubClient(answer: Answer, extra: Partial<Record<"getLogs" | "getBlockNumber", any>> = {}) {
  const multicall = vi.fn(async ({ contracts }: { contracts: Call[] }) =>
    contracts.map((c) => {
      try {
        return { status: "success", result: answer(c) }
      } catch (error) {
        return { status: "failure", error }
      }
    }),
  )
  return {
    multicall,
    getBlockNumber: extra.getBlockNumber ?? vi.fn(async () => 68_000_000n),
    getLogs: extra.getLogs ?? vi.fn(async () => []),
    simulateContract: vi.fn(),
    getGasPrice: vi.fn(async () => 49_862_000n),
  } as any
}

const pairRisk = (enabled = true) => ({
  enabled,
  maxLeverageX100: 500,
  initialMarginBps: 2000,
  maintenanceMarginBps: 1000,
  liquidationTargetBps: 12500,
  fullLiquidationHealthBps: 5000,
  maxLiquidationBps: 5000,
  liquidationBonusBps: 500,
  maxSlippageBps: 100,
  oracleDeviationBps: 100,
  maxPositionValueUsd: 2n * WAD,
  maxDebtValueUsd: 1n * WAD,
})

function healthyMarket(overrides: Partial<Record<string, Answer>> = {}): Answer {
  return (c) => {
    const key = c.functionName
    if (overrides[key]) return overrides[key]!(c)
    switch (key) {
      case "opensPaused": return false
      case "openFeeBps": return 0
      case "closeFeeBps": return 0
      case "getPairRisk": return pairRisk()
      case "allowedPTokens": return true
      case "marketPriceable": return true
      case "getPrice": return c.args?.[0] === ROBINHOOD_TOKENS.NVDA ? 225n * WAD : 1n * WAD
      case "paused": return false
      case "maxFlashLoan": return c.args?.[0] === ROBINHOOD_TOKENS.NVDA ? 10n ** 16n : 2_000_000n
      case "getCash": return 4_000_000n
      case "exchangeRateStored": return 2n * 10n ** 16n
      case "DUST_DEBT_VALUE_USD": return 10n * WAD
      case "nextPositionId": return 1n
      default: throw new Error(`unexpected ${key}`)
    }
  }
}

describe("readRobinhoodMarketState", () => {
  it("reads the whole picture in one multicall at one block", async () => {
    const client = stubClient(healthyMarket())
    const state = await readRobinhoodMarketState(client)
    expect(client.multicall).toHaveBeenCalledTimes(1)
    expect(client.multicall.mock.calls[0][0].blockNumber).toBe(68_000_000n)
    expect(state.opensPaused).toBe(false)
    expect(state.pairRisk.long?.maxLeverageX100).toBe(500)
    expect(state.pairRisk.short?.maxDebtValueUsd18).toBe(WAD)
    expect(state.prices.nvda.priceUsd18).toBe(225n * WAD)
    expect(state.flash.maxNvda).toBe(10n ** 16n)
    expect(state.nextPositionId).toBe(1n)
    expect(state.failures).toEqual([])
  })

  it("turns an unpriceable market into a null price, never zero", async () => {
    const client = stubClient(
      healthyMarket({
        marketPriceable: (c) => c.args?.[0] !== ROBINHOOD_TOKENS.pNVDA,
        getPrice: (c) => {
          if (c.args?.[0] === ROBINHOOD_TOKENS.NVDA) throw new Error("PriceUnavailable")
          return WAD
        },
      }),
    )
    const state = await readRobinhoodMarketState(client)
    expect(state.prices.nvda.priceable).toBe(false)
    expect(state.prices.nvda.priceUsd18).toBeNull()
    expect(state.prices.usdg.priceUsd18).toBe(WAD)
    expect(state.failures).toContain("getPrice(NVDA)")
    const availability = deriveRobinhoodAvailability(state)
    expect(availability.pricesAvailable).toBe(false)
    expect(availability.canOpenLong).toBe(false)
    expect(availability.canClose).toBe(false)
    expect(availability.canRepay).toBe(true)
  })

  it("treats a priceable market that answers zero as unavailable too", async () => {
    const client = stubClient(healthyMarket({ getPrice: () => 0n }))
    const state = await readRobinhoodMarketState(client)
    expect(state.prices.nvda.priceable).toBe(true)
    expect(state.prices.nvda.priceUsd18).toBeNull()
  })

  it("accepts a pair-risk tuple returned as an array", async () => {
    const client = stubClient(healthyMarket({ getPairRisk: () => Object.values(pairRisk()) }))
    const state = await readRobinhoodMarketState(client)
    expect(state.pairRisk.long?.maintenanceMarginBps).toBe(1000)
    expect(state.pairRisk.long?.maxPositionValueUsd18).toBe(2n * WAD)
  })

  it("gates opening per direction on the flash leg of that direction", async () => {
    const client = stubClient(
      healthyMarket({ maxFlashLoan: (c) => (c.args?.[0] === ROBINHOOD_TOKENS.NVDA ? 0n : 2_000_000n) }),
    )
    const availability = deriveRobinhoodAvailability(await readRobinhoodMarketState(client))
    expect(availability.canOpenLong).toBe(true)
    expect(availability.canOpenShort).toBe(false)
  })
})

describe("readRobinhoodAccountState", () => {
  it("keys allowances by the spender the flow needs", async () => {
    const client = stubClient((c) => {
      if (c.functionName === "allowance") {
        const [owner, spender] = c.args as [string, string]
        expect(owner).toBe(USER)
        if (c.address === ROBINHOOD_TOKENS.USDG && spender === ROBINHOOD_TOKENS.pUSDG) return 11n
        if (c.address === ROBINHOOD_TOKENS.pUSDG && spender === ROBINHOOD_MARGIN.marginVault) return 22n
        if (c.address === ROBINHOOD_TOKENS.USDG && spender === ROBINHOOD_MARGIN.executor) return 33n
        if (c.address === ROBINHOOD_TOKENS.NVDA && spender === ROBINHOOD_MARGIN.executor) return 44n
        if (c.address === ROBINHOOD_TOKENS.pUSDG && spender === ROBINHOOD_MARGIN.executor) return 55n
        if (c.address === ROBINHOOD_TOKENS.pNVDA && spender === ROBINHOOD_MARGIN.executor) return 66n
        throw new Error("unexpected allowance")
      }
      if (c.functionName === "balanceOf") return 7n
      if (c.functionName === "freeBalance") return 100n
      if (c.functionName === "lockedBalance") return 40n
      if (c.functionName === "pendingRewards") return 3n
      if (c.functionName === "getEthBalance") return 5_000_000_000_000_000n
      throw new Error(`unexpected ${c.functionName}`)
    })
    const state = await readRobinhoodAccountState(client, USER)
    expect(state.allowances).toEqual({
      usdgForMint: 11n,
      pUsdgForVaultDeposit: 22n,
      usdgForRepay: 33n,
      nvdaForRepay: 44n,
      pUsdgForRepayWithPToken: 55n,
      pNvdaForRepayWithPToken: 66n,
    })
    expect(state.vault).toEqual({ freeShares: 100n, lockedShares: 40n, pendingRewardShares: 3n })
    expect(state.gas).toEqual({ balanceWei: 5_000_000_000_000_000n, gasPriceWei: 49_862_000n })
    expect(state.failures).toEqual([])
  })
})

const positionStruct = (id: bigint, owner: string, status: number, side = 0) => ({
  id,
  owner,
  account: ACCOUNT,
  marginPToken: ROBINHOOD_PAIRS.long.marginPToken,
  positionPToken: side === 0 ? ROBINHOOD_PAIRS.long.positionPToken : ROBINHOOD_PAIRS.short.positionPToken,
  debtPToken: side === 0 ? ROBINHOOD_PAIRS.long.debtPToken : ROBINHOOD_PAIRS.short.debtPToken,
  lockedMarginPTokens: 10_000_000n,
  initialNotionalUsd: WAD,
  borrowedPrincipal: 800_000n,
  requestedLeverageX100: 500,
  side,
  status,
})

describe("discoverRobinhoodPositionIds", () => {
  it("returns nothing without touching logs when no position was ever opened", async () => {
    const client = stubClient(() => 1n)
    const found = await discoverRobinhoodPositionIds(client, USER)
    expect(found).toEqual({ ids: [], discovery: "none" })
    expect(client.getLogs).not.toHaveBeenCalled()
  })

  it("enumerates and filters by owner for a small deployment", async () => {
    const client = stubClient((c) => {
      if (c.functionName === "nextPositionId") return 4n
      if (c.functionName === "positions") {
        const id = c.args![0] as bigint
        return positionStruct(id, id === 2n ? OTHER : USER, 2)
      }
      throw new Error("unexpected")
    })
    const found = await discoverRobinhoodPositionIds(client, USER)
    expect(found.discovery).toBe("enumeration")
    expect(found.ids).toEqual([1n, 3n])
    expect(client.getLogs).not.toHaveBeenCalled()
  })

  it("matches the owner case-insensitively", async () => {
    const client = stubClient((c) =>
      c.functionName === "nextPositionId" ? 2n : positionStruct(1n, USER.toUpperCase().replace("0X", "0x"), 2),
    )
    const found = await discoverRobinhoodPositionIds(client, USER)
    expect(found.ids).toEqual([1n])
  })

  it("scans PositionOpened logs page by page for a large deployment", async () => {
    const getLogs = vi.fn(async ({ fromBlock, toBlock }: any) => {
      expect(BigInt(toBlock) - BigInt(fromBlock) + 1n).toBeLessThanOrEqual(ROBINHOOD_LOG_PAGE_BLOCKS)
      return fromBlock === 66_431_911n ? [{ args: { positionId: 9n } }, { args: { positionId: 9n } }] : [{ args: { positionId: 300n } }]
    })
    const client = stubClient(() => ROBINHOOD_ENUMERATION_LIMIT + 100n, { getLogs })
    const found = await discoverRobinhoodPositionIds(client, USER, { toBlock: 67_500_000n })
    expect(found.discovery).toBe("logs")
    expect(found.ids).toEqual([9n, 300n])
    expect(getLogs).toHaveBeenCalledTimes(3)
    expect(getLogs.mock.calls[0][0].args).toEqual({ user: USER })
    expect(getLogs.mock.calls[0][0].address).toBe(ROBINHOOD_MARGIN.executor)
  })
})

describe("readRobinhoodPositions", () => {
  const metrics = {
    grossAssetValueUsd: WAD,
    debtValueUsd: WAD / 2n,
    equityUsd: WAD / 2n,
    initialRequirementUsd: WAD / 5n,
    maintenanceRequirementUsd: WAD / 10n,
    healthFactorBps: 50_000n,
    leverageX100: 200n,
  }

  it("hydrates an active position with metrics, debt and position shares", async () => {
    const client = stubClient((c) => {
      switch (c.functionName) {
        case "positions": return positionStruct(1n, USER, 2)
        case "getMetrics": return metrics
        case "isLiquidatable": return false
        case "borrowBalanceStored": return 810_000n
        case "balanceOf": return 5_000_000n
        default: throw new Error(`unexpected ${c.functionName}`)
      }
    })
    const result = await readRobinhoodPositions(client, USER, {
      ids: [1n],
      exchangeRates: { pUSDG: 2n * 10n ** 16n, pNVDA: 4n * 10n ** 26n },
    })
    expect(result.positions).toHaveLength(1)
    const p = result.positions[0]
    expect(p.direction).toBe("long")
    expect(p.isActive).toBe(true)
    expect(p.statusLabel).toBe("ACTIVE")
    expect(p.health).toBe(5)
    expect(p.leverage).toBe(2)
    expect(p.liquidatable).toBe(false)
    expect(p.debtStored).toBe(810_000n)
    expect(p.positionShares).toBe(5_000_000n)
    expect(p.positionUnderlying).toBe(underlyingFromShares(5_000_000n, 4n * 10n ** 26n))
    expect(p.riskUnavailable).toBe(false)
    expect(result.failures).toEqual([])
    // one multicall for the structs, one for the per-account reads
    expect(client.multicall).toHaveBeenCalledTimes(2)
  })

  it("flags risk unavailable when the engine reverts, instead of health 0", async () => {
    const client = stubClient((c) => {
      switch (c.functionName) {
        case "positions": return positionStruct(1n, USER, 2, 1)
        case "getMetrics": throw new Error("PriceUnavailable")
        case "isLiquidatable": throw new Error("PriceUnavailable")
        case "borrowBalanceStored": return 3n * 10n ** 15n
        case "balanceOf": return 1n
        case "exchangeRateStored": return WAD
        default: throw new Error(`unexpected ${c.functionName}`)
      }
    })
    const result = await readRobinhoodPositions(client, USER, { ids: [1n] })
    const p = result.positions[0]
    expect(p.direction).toBe("short")
    expect(p.metrics).toBeNull()
    expect(p.health).toBeNull()
    expect(p.liquidatable).toBeNull()
    expect(p.riskUnavailable).toBe(true)
    expect(p.debtStored).toBe(3n * 10n ** 15n)
    expect(result.failures).toEqual(["getMetrics(1)", "isLiquidatable(1)"])
  })

  it("does not read risk for a closed position", async () => {
    const seen: string[] = []
    const client = stubClient((c) => {
      seen.push(c.functionName)
      if (c.functionName === "positions") return Object.values(positionStruct(c.args![0] as bigint, USER, (c.args![0] as bigint) === 1n ? 5 : 2))
      if (c.functionName === "getMetrics") return Object.values(metrics)
      if (c.functionName === "isLiquidatable") return true
      if (c.functionName === "borrowBalanceStored") return 1n
      if (c.functionName === "balanceOf") return 1n
      if (c.functionName === "exchangeRateStored") return WAD
      throw new Error("unexpected")
    })
    const result = await readRobinhoodPositions(client, USER, { ids: [1n, 2n] })
    expect(seen.filter((n) => n === "getMetrics")).toHaveLength(1)
    expect(result.positions[0].statusLabel).toBe("CLOSED")
    expect(result.positions[0].metrics).toBeNull()
    expect(result.positions[0].riskUnavailable).toBe(false)
    expect(result.positions[1].liquidatable).toBe(true)
    expect(result.positions[1].health).toBe(5)
  })
})

describe("units", () => {
  it("maps the risk engine's uint256.max sentinel to null", () => {
    expect(healthFromBps(UINT256_MAX)).toBeNull()
    expect(leverageFromX100(UINT256_MAX)).toBeNull()
    expect(healthFromBps(10_000n)).toBe(1)
    expect(leverageFromX100(500)).toBe(5)
  })

  it("round-trips shares and underlying through a raw exchange rate", () => {
    // At this rate one underlying unit is 50 shares, so a share count is not
    // recoverable from its underlying. What must hold: the shares quoted for
    // an underlying amount redeem to at least that amount, and one share
    // fewer does not.
    const rate = 2n * 10n ** 16n
    const underlying = underlyingFromShares(12_345_678n, rate)
    const shares = sharesFromUnderlying(underlying, rate)
    expect(underlyingFromShares(shares, rate)).toBeGreaterThanOrEqual(underlying)
    expect(underlyingFromShares(shares - 1n, rate)).toBeLessThan(underlying)
  })
})

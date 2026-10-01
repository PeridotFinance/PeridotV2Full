/**
 * Step 6 of the Robinhood integration: close quote, repay planning, the
 * recovery exit, withdraw and receipt decoding, against stubs.
 *
 * What these guard: the closing fee follows the guide's rounding and is
 * converted to shares, never assumed zero; each close path puts its swap
 * floor in the field the guide's table names and zero in the unused one; a
 * floor under the protocol's own falls back to the protocol floor, never to a
 * looser value; missing prices block the close and point at recovery; a
 * repayment approval is bounded by the debt and by the wallet; a withdrawal
 * whose conversion fails still reports the shares that reached the wallet.
 */
import { describe, expect, it, vi } from "vitest"
import { encodeAbiParameters, encodeErrorResult, encodeEventTopics, getAbiItem, type Abi } from "viem"

import { ROBINHOOD_ABIS } from "@/app/abis/robinhood"
import { ROBINHOOD_MARGIN, ROBINHOOD_PAIRS, ROBINHOOD_TOKENS } from "@/config/robinhood"
import {
  findDebtRepaidEvent,
  findPositionClosedEvent,
  findRedeemEvent,
  findVaultEvent,
} from "@/lib/robinhood/calls"
import {
  closingFeeUsd18,
  debtSlice,
  planRobinhoodRepay,
  quoteRobinhoodClose,
  runRobinhoodDebtFreeExit,
  runRobinhoodWithdraw,
  shareSlice,
  slippageFloor,
} from "@/lib/robinhood/manage"
import { WAD } from "@/lib/robinhood/units"

const USER = "0x1111111111111111111111111111111111111111" as const
const ACCOUNT = "0x3333333333333333333333333333333333333333" as const
const M = ROBINHOOD_MARGIN
const T = ROBINHOOD_TOKENS
const A = ROBINHOOD_ABIS

function makeLog(abi: Abi, eventName: string, address: string, args: Record<string, unknown>) {
  const item = getAbiItem({ abi, name: eventName }) as any
  const indexedArgs = Object.fromEntries(item.inputs.filter((i: any) => i.indexed).map((i: any) => [i.name, args[i.name]]))
  const plain = item.inputs.filter((i: any) => !i.indexed)
  return {
    address,
    topics: encodeEventTopics({ abi, eventName, args: indexedArgs } as any),
    data: encodeAbiParameters(plain, plain.map((i: any) => args[i.name])),
    blockNumber: 1n,
    blockHash: "0x" + "ab".repeat(32),
    logIndex: 0,
    transactionIndex: 0,
    transactionHash: "0x" + "cd".repeat(32),
    removed: false,
  }
}

const position = (direction: "long" | "short", isActive = true) => ({
  id: 7n,
  account: ACCOUNT,
  direction,
  isActive,
  positionPToken: ROBINHOOD_PAIRS[direction].positionPToken,
  debtPToken: ROBINHOOD_PAIRS[direction].debtPToken,
})

type Call = { address: string; functionName: string; args?: readonly unknown[] }

/**
 * A $1.50 gross position, close fee 20 bps, 1% slippage bound, 1 pUSDG share
 * = $0.0001. `debt` is the accrued debt; `priceable` flips the oracle gate.
 */
function closeChain(opts: { debt?: bigint; priceable?: boolean; closeFee?: number; swapError5Once?: boolean; closeReverts?: Error } = {}) {
  let swap5 = opts.swapError5Once ?? false
  const answer = (c: Call): unknown => {
    switch (c.functionName) {
      case "closeFeeBps": return opts.closeFee ?? 20
      case "getPairRisk": return [true, 500, 2000, 1000, 12500, 0, 5000, 500, 100, 100, 2n * WAD, 1n * WAD]
      case "getMetrics": if (opts.priceable === false) throw new Error("price unavailable"); return [15n * 10n ** 17n, 6n * 10n ** 17n, 9n * 10n ** 17n, 0n, 0n, 15_000n, 166n]
      case "marketPriceable": return opts.priceable ?? true
      case "balanceOf": return 1_000_000n // position shares
      case "borrowBalanceStored": return opts.debt ?? 600_000n
      case "feePToken": return ((c.args![1] as bigint) + 10n ** 14n - 1n) / 10n ** 14n
      case "expectedOut": return 1_500_000n // NVDA leg worth 1.5 USDG at oracle parity
      case "flashFee": return ((c.args![1] as bigint) * 5n) / 10_000n
      default: throw new Error(`unexpected ${c.functionName}`)
    }
  }
  const client = {
    getBlockNumber: vi.fn(async () => 68_000_000n),
    multicall: vi.fn(async ({ contracts }: { contracts: Call[] }) =>
      contracts.map((c) => {
        try {
          return { status: "success", result: answer(c) }
        } catch (error) {
          return { status: "failure", error }
        }
      }),
    ),
    simulateContract: vi.fn(async ({ functionName, args }: any) => {
      if (functionName === "borrowBalanceCurrent") return { result: opts.debt ?? 600_000n }
      if (functionName === "exchangeRateCurrent") return { result: 10n ** 14n }
      if (functionName === "closePosition") {
        if (opts.closeReverts) throw opts.closeReverts
        const p = args[0]
        if (swap5 && (p.minDebtUnderlying > 0n || p.minMarginUnderlying > 0n)) {
          swap5 = false
          throw { message: "revert", cause: { data: encodeErrorResult({ abi: A.swapModule as Abi, errorName: "SwapError", args: [5] }) } }
        }
        return { result: 89_000_000n }
      }
      throw new Error(`not stubbed ${functionName}`)
    }),
    getLogs: vi.fn(),
  }
  return client as any
}

describe("close arithmetic", () => {
  it("floors the closed notional and rounds the fee up", () => {
    // 1.5 USD * 50% = 0.75 USD; 20 bps of that = 0.0015 USD exactly.
    expect(closingFeeUsd18(15n * 10n ** 17n, 5000, 20)).toBe(15n * 10n ** 14n)
    // One wei of notional above a clean fee still costs one more wei of fee.
    expect(closingFeeUsd18(10_001n, 10_000, 1)).toBe(2n)
    expect(closingFeeUsd18(10n ** 18n, 10_000, 0)).toBe(0n)
  })

  it("rounds debt up and shares down on a partial close, like the executor", () => {
    expect(debtSlice(3n, 5000)).toBe(2n)
    expect(shareSlice(3n, 5000)).toBe(1n)
    expect(debtSlice(600_000n, 10_000)).toBe(600_000n)
  })

  it("puts the slippage floor at or above the protocol's, never below", () => {
    expect(slippageFloor(1_500_000n, 100)).toBe(1_485_000n)
    expect(slippageFloor(101n, 100)).toBe(100n) // 99.99 rounds up
  })
})

describe("quoteRobinhoodClose", () => {
  it("long with debt: floor on the USDG sale, margin floor unused, payout from the simulation", async () => {
    const client = closeChain()
    const q = await quoteRobinhoodClose(client, { position: position("long"), closeBps: 10_000 }, USER)
    expect(q.issues).toEqual([])
    expect(q.debtToRepay).toBe(600_000n)
    expect(q.positionUnderlyingClosed).toBe(100n) // 1e6 shares * 1e14 / 1e18
    expect(q.minDebtUnderlying).toBe(1_485_000n)
    expect(q.minMarginUnderlying).toBe(0n)
    // 1.5 USD gross, 20 bps -> 0.003 USD -> 30 shares at $0.0001, ceiling 30 + 1.
    expect(q.closingFeeShares).toBe(30n)
    expect(q.maxClosingFeePToken).toBe(31n)
    expect(q.params?.maxClosingFeePToken).toBe(31n)
    expect(q.returnedMarginShares).toBe(89_000_000n)
    expect(q.returnedMarginUsdg).toBe(8_900n) // 89e6 shares * 1e14 / 1e18
    expect(q.params?.positionToDebtSwapData).toBe("0x")
  })

  it("debt-free long moves the floor to the margin field", async () => {
    const q = await quoteRobinhoodClose(closeChain({ debt: 0n }), { position: position("long"), closeBps: 10_000 }, USER)
    expect(q.minDebtUnderlying).toBe(0n)
    expect(q.minMarginUnderlying).toBe(1_485_000n)
  })

  it("short with debt: the NVDA leg must cover the repayment plus the flash fee", async () => {
    const q = await quoteRobinhoodClose(closeChain({ debt: 4_000_000_000_000_000n }), { position: position("short"), closeBps: 5000 }, USER)
    expect(q.debtToRepay).toBe(2_000_000_000_000_000n)
    expect(q.minDebtUnderlying).toBe(2_000_000_000_000_000n + 1_000_000_000_000n)
    expect(q.minMarginUnderlying).toBe(0n)
  })

  it("a floor under the protocol's falls back to the protocol floor and says so", async () => {
    const client = closeChain({ swapError5Once: true })
    const q = await quoteRobinhoodClose(client, { position: position("long"), closeBps: 10_000 }, USER)
    expect(q.minimaSource).toBe("protocol")
    expect(q.params?.minDebtUnderlying).toBe(0n)
    expect(q.returnedMarginShares).toBe(89_000_000n)
  })

  it("missing prices block the close and point at recovery, without simulating", async () => {
    const client = closeChain({ priceable: false })
    const q = await quoteRobinhoodClose(client, { position: position("long"), closeBps: 10_000 }, USER)
    expect(q.params).toBeNull()
    expect(q.issues[0].code).toBe("price-unavailable")
    expect(q.issues[0].message).toMatch(/exit without prices/)
    expect(client.simulateContract.mock.calls.some((c: any) => c[0].functionName === "closePosition")).toBe(false)
  })

  it("a reverting simulation blocks with the decoded reason", async () => {
    const revert = { message: "revert", cause: { data: encodeErrorResult({ abi: A.executor as Abi, errorName: "ExecutorError", args: [37] }) } } as any
    const q = await quoteRobinhoodClose(closeChain({ closeReverts: revert }), { position: position("long"), closeBps: 10_000 }, USER)
    expect(q.params).toBeNull()
    expect(q.simulationError?.errorName).toBe("ExecutorError(37)")
  })

  it("refuses an inactive position and an out-of-range fraction", async () => {
    expect((await quoteRobinhoodClose(closeChain(), { position: position("long", false), closeBps: 10_000 }, USER)).issues[0].code).toBe("not-active")
    expect((await quoteRobinhoodClose(closeChain(), { position: position("long"), closeBps: 0 }, USER)).issues[0].code).toBe("amount")
    expect((await quoteRobinhoodClose(closeChain(), { position: position("long"), closeBps: 10_001 }, USER)).issues[0].code).toBe("amount")
  })
})

describe("planRobinhoodRepay", () => {
  it("approves the debt plus a small accrual room, bounded by the wallet", () => {
    const plan = planRobinhoodRepay("long", 600_000n, 5_000_000n)
    expect(plan.symbol).toBe("USDG")
    expect(plan.asset).toBe(T.USDG)
    expect(plan.maxAmount).toBe(600_000n + 600n + 1n)
    expect(plan.full).toBe(true)
  })

  it("repays what the wallet holds when it is short of the debt", () => {
    const plan = planRobinhoodRepay("short", 10n ** 15n, 4n * 10n ** 14n)
    expect(plan.asset).toBe(T.NVDA)
    expect(plan.maxAmount).toBe(4n * 10n ** 14n)
    expect(plan.full).toBe(false)
  })

  it("blocks on no debt, an empty wallet or unreadable values", () => {
    expect(planRobinhoodRepay("long", 0n, 1n).blockers[0]).toMatch(/no debt/)
    expect(planRobinhoodRepay("long", 5n, 0n).blockers[0]).toMatch(/no USDG/)
    expect(planRobinhoodRepay("long", null, 5n).blockers[0]).toMatch(/could not be read/)
  })
})

describe("step 6 receipts", () => {
  it("decodes PositionClosed for this position only", () => {
    const args = { positionId: 7n, closeBps: 10_000, debtRepaid: 600_000n, returnedMarginPTokens: 8_900n, closingFeePTokens: 30n, healthFactorBps: 0n, fullyClosed: true }
    const log = makeLog(A.executor as Abi, "PositionClosed", M.executor, args)
    const ev = findPositionClosedEvent({ logs: [log] as any }, 7n)
    expect(ev).toMatchObject({ returnedMarginShares: 8_900n, closingFeeShares: 30n, fullyClosed: true })
    expect(findPositionClosedEvent({ logs: [log] as any }, 8n)).toBeNull()
    expect(findPositionClosedEvent({ logs: [{ ...log, address: USER }] as any }, 7n)).toBeNull()
  })

  it("decodes DebtRepaid, Withdrawn and Redeem", () => {
    const repaid = makeLog(A.executor as Abi, "DebtRepaid", M.executor, { positionId: 7n, underlyingAmount: 600_100n, remainingDebt: 0n })
    expect(findDebtRepaidEvent({ logs: [repaid] as any }, 7n)).toEqual({ positionId: 7n, repaid: 600_100n, remainingDebt: 0n })
    const withdrawn = makeLog(A.marginVault as Abi, "Withdrawn", M.marginVault, { user: USER, pToken: T.pUSDG, amount: 9_000n })
    expect(findVaultEvent({ logs: [withdrawn] as any }, "Withdrawn", USER)).toEqual({ amount: 9_000n })
    const redeem = makeLog(A.pToken as Abi, "Redeem", T.pUSDG, { redeemer: USER, redeemAmount: 900n, redeemTokens: 9_000n })
    expect(findRedeemEvent({ logs: [redeem] as any }, USER)?.redeemAmount).toBe(900n)
  })
})

// ---------------------------------------------------------------------------
// Flows over a toy wallet
// ---------------------------------------------------------------------------

function flowDeps(opts: { free?: bigint; debt?: bigint; redeemCode?: bigint } = {}) {
  const receipts = new Map<string, any>()
  let n = 0
  const accountReads = (c: Call): unknown => {
    switch (c.functionName) {
      case "freeBalance": return opts.free ?? 9_000n
      case "closeFeeBps": return 20
      default: return 0n
    }
  }
  const client = {
    getBlockNumber: vi.fn(async () => 1n),
    multicall: vi.fn(async ({ contracts }: { contracts: Call[] }) => contracts.map((c) => ({ status: "success", result: accountReads(c) }))),
    simulateContract: vi.fn(async ({ functionName }: any) => {
      if (functionName === "borrowBalanceCurrent") return { result: opts.debt ?? 0n }
      if (functionName === "redeem") return { result: opts.redeemCode ?? 0n }
      return { result: 0n }
    }),
    getLogs: vi.fn(),
    waitForTransactionReceipt: vi.fn(async ({ hash }: any) => receipts.get(hash)),
  }
  const sent: string[] = []
  const deps = {
    client,
    ensureChain: vi.fn(async () => {}),
    send: vi.fn(async (tx: any) => {
      const hash = ("0x" + (++n).toString(16).padStart(64, "0")) as `0x${string}`
      const selector = tx.data.slice(0, 10)
      sent.push(selector)
      const logs: any[] = []
      if (tx.to === M.marginVault) logs.push(makeLog(A.marginVault as Abi, "Withdrawn", M.marginVault, { user: USER, pToken: T.pUSDG, amount: 9_000n }))
      if (tx.to === T.pUSDG) logs.push(makeLog(A.pToken as Abi, "Redeem", T.pUSDG, { redeemer: USER, redeemAmount: 900n, redeemTokens: 9_000n }))
      if (tx.to === M.executor)
        logs.push(makeLog(A.executor as Abi, "DebtFreePTokenExit", M.executor, {
          positionId: 7n, returnedMarginPTokens: 5_000n, returnedPositionPTokens: 4_000n, returnedDebtPTokens: 0n,
          marginFeePTokens: 10n, positionFeePTokens: 8n, debtFeePTokens: 0n,
        }))
      receipts.set(hash, { status: "success", logs, blockNumber: 2n, blockHash: "0x" + "ee".repeat(32) })
      return hash
    }),
  }
  return { deps: deps as any, client, sent }
}

describe("withdraw and recovery flows", () => {
  it("withdraws then converts, reporting the USDG that arrived", async () => {
    const { deps, sent } = flowDeps()
    const res = await runRobinhoodWithdraw(deps, USER, 9_000n, { redeem: true })
    expect(sent).toHaveLength(2)
    expect(res.withdrawnShares).toBe(9_000n)
    expect(res.redeem?.redeemAmount).toBe(900n)
    expect(res.redeemError).toBeNull()
  })

  it("keeps the confirmed withdrawal when the conversion is refused", async () => {
    const { deps, sent } = flowDeps({ redeemCode: 14n })
    const res = await runRobinhoodWithdraw(deps, USER, 9_000n, { redeem: true })
    expect(sent).toHaveLength(1)
    expect(res.withdrawnShares).toBe(9_000n)
    expect(res.redeem).toBeNull()
    expect(res.redeemError?.message).toMatch(/refused the conversion/)
  })

  it("refuses to withdraw more than the free margin before asking the wallet", async () => {
    const { deps, sent } = flowDeps({ free: 10n })
    await expect(runRobinhoodWithdraw(deps, USER, 9_000n, { redeem: false })).rejects.toThrow(/more than the free margin/)
    expect(sent).toHaveLength(0)
  })

  it("the exit without prices waits for zero debt and caps the fee at today's rate", async () => {
    const blocked = flowDeps({ debt: 1n })
    await expect(runRobinhoodDebtFreeExit(blocked.deps, USER, position("long"))).rejects.toThrow(/Repay it in full/)
    expect(blocked.sent).toHaveLength(0)

    const { deps, client } = flowDeps({ debt: 0n })
    const ev = await runRobinhoodDebtFreeExit(deps, USER, position("long"))
    expect(ev.returnedPositionShares).toBe(4_000n)
    const exitSim = client.simulateContract.mock.calls.find((c: any) => c[0].functionName === "exitDebtFreeToPTokens")
    expect(exitSim?.[0].args).toEqual([7n, 20])
  })
})

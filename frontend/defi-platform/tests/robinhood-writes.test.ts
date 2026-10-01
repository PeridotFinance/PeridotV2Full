/**
 * Step 4 of the Robinhood integration: deposit planning, the open quote, the
 * transaction runner and receipt decoding, against stubs.
 *
 * What these guard: the fee is computed with the executor's rounding and
 * never assumed zero; the quoted minimum reaches OpenParams unchanged; a
 * failed simulation never reaches the wallet; a missing receipt keeps the
 * hash for reconciliation instead of reporting failure; the ids of a new
 * position come from PositionOpened, and only the executor's log counts.
 */
import { describe, expect, it, vi } from "vitest"
import {
  decodeFunctionData,
  encodeAbiParameters,
  encodeErrorResult,
  encodeEventTopics,
  getAbiItem,
  type Abi,
  type Hex,
} from "viem"

import { ROBINHOOD_ABIS } from "@/app/abis/robinhood"
import { ROBINHOOD_MARGIN, ROBINHOOD_PAIRS, ROBINHOOD_TOKENS } from "@/config/robinhood"
import {
  approveUsdgForMint,
  findMintEvent,
  findPositionOpenedEvent,
  mintPUsdg,
} from "@/lib/robinhood/calls"
import { planRobinhoodMarginDeposit, planRobinhoodSupply } from "@/lib/robinhood/deposit"
import { decodeRobinhoodError } from "@/lib/robinhood/errors"
import { RobinhoodRequoteError, runRobinhoodDeposit, runRobinhoodOpen } from "@/lib/robinhood/flows"
import {
  feeCeiling,
  maxMarginValueForCapsUsd18,
  openingFeeUsd18,
  quoteRobinhoodOpen,
  requestedNotionalUsd18,
} from "@/lib/robinhood/open"
import type { RobinhoodAccountState } from "@/lib/robinhood/reads"
import { RobinhoodTxError, runRobinhoodCall, type RobinhoodTxUpdate } from "@/lib/robinhood/tx"
import { WAD } from "@/lib/robinhood/units"

const USER = "0x1111111111111111111111111111111111111111" as const
const OTHER = "0x2222222222222222222222222222222222222222" as const
const ACCOUNT = "0x3333333333333333333333333333333333333333" as const
const M = ROBINHOOD_MARGIN
const T = ROBINHOOD_TOKENS
const A = ROBINHOOD_ABIS

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function account(overrides: Partial<{ usdg: bigint | null; pUSDG: bigint | null; allowMint: bigint | null; allowVault: bigint | null; free: bigint | null }> = {}): RobinhoodAccountState {
  return {
    blockNumber: 1n,
    readAt: 0,
    user: USER,
    wallet: { usdg: overrides.usdg === undefined ? 5_000_000n : overrides.usdg, nvda: 0n, pUSDG: overrides.pUSDG === undefined ? 0n : overrides.pUSDG, pNVDA: 0n },
    allowances: {
      usdgForMint: overrides.allowMint === undefined ? 0n : overrides.allowMint,
      pUsdgForVaultDeposit: overrides.allowVault === undefined ? 0n : overrides.allowVault,
      usdgForRepay: 0n,
      nvdaForRepay: 0n,
      pUsdgForRepayWithPToken: 0n,
      pNvdaForRepayWithPToken: 0n,
    },
    vault: { freeShares: overrides.free === undefined ? 0n : overrides.free, lockedShares: 0n, pendingRewardShares: 0n },
    failures: [],
  }
}

const RISK = {
  enabled: true,
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
}

type Call = { address: string; functionName: string; args?: readonly unknown[] }

/**
 * A market where 1 share is worth $0.0001 (rate 1e14 with 8/6 dec scaling), the
 * user holds `free` shares in the vault and the flash fee is 5 bps.
 */
function quoteChain(opts: { openFeeBps?: number | Error; free?: bigint; quoteFails?: boolean; debtUsd?: bigint } = {}) {
  const answer = (c: Call): unknown => {
    switch (c.functionName) {
      case "opensPaused": return false
      case "openFeeBps": if (opts.openFeeBps instanceof Error) throw opts.openFeeBps; return opts.openFeeBps ?? 30
      case "getPairRisk": return RISK
      case "pTokenValueUsd": return (c.args![1] as bigint) * 10n ** 14n // 1 share = $0.0001
      case "marketPriceable": return true
      case "paused": return false
      case "maxFlashLoan": return 2_000_000n
      case "exchangeRateStored": return 10n ** 14n
      case "freeBalance": return opts.free ?? 10_000_000n
      case "quoteOpen": if (opts.quoteFails) throw new Error("MarginQuoter: price unavailable"); return [400_000n, 1_700_000_000_000_000n]
      case "feePToken": return ((c.args![1] as bigint) + 10n ** 14n - 1n) / 10n ** 14n
      case "flashFee": return ((c.args![1] as bigint) * 5n) / 10_000n
      case "underlyingValueUsd": return opts.debtUsd ?? (c.args![1] as bigint) * 10n ** 12n
      default: throw new Error(`unexpected ${c.functionName}`)
    }
  }
  return {
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
    simulateContract: vi.fn(async ({ functionName }: any) => {
      if (functionName === "exchangeRateCurrent") return { result: 10n ** 14n + 7n }
      throw new Error("not stubbed")
    }),
    getLogs: vi.fn(),
  } as any
}

// ---------------------------------------------------------------------------
// Deposit planning
// ---------------------------------------------------------------------------

describe("deposit planning", () => {
  it("approves exactly the supply amount, then mints", () => {
    const plan = planRobinhoodSupply(account({ allowMint: 1n }), 2_000_000n)
    expect(plan.blockers).toEqual([])
    expect(plan.calls.map((c) => c.id)).toEqual(["approve-usdg-mint", "mint-pusdg"])
    expect(plan.calls[0].args).toEqual([T.pUSDG, 2_000_000n])
    expect(plan.calls[0].address).toBe(T.USDG)
  })

  it("skips the approval when the allowance already covers it", () => {
    const plan = planRobinhoodSupply(account({ allowMint: 3_000_000n }), 2_000_000n)
    expect(plan.calls.map((c) => c.id)).toEqual(["mint-pusdg"])
  })

  it("blocks on a short or unreadable balance instead of guessing", () => {
    expect(planRobinhoodSupply(account({ usdg: 1n }), 2n).blockers[0]).toMatch(/Not enough USDG/)
    expect(planRobinhoodSupply(account({ usdg: null }), 2n).blockers[0]).toMatch(/could not be read/)
    expect(planRobinhoodSupply(account(), 0n).calls).toEqual([])
  })

  it("deposits shares into the vault with a share-denominated approval", () => {
    const plan = planRobinhoodMarginDeposit(account({ pUSDG: 900n }), 900n, { marginAccepted: true })
    expect(plan.calls.map((c) => c.id)).toEqual(["approve-pusdg-vault", "deposit-margin"])
    expect(plan.calls[0].args).toEqual([M.marginVault, 900n])
    expect(plan.calls[1].args).toEqual([T.pUSDG, 900n])
  })

  it("refuses when the vault does not accept pUSDG", () => {
    const plan = planRobinhoodMarginDeposit(account({ pUSDG: 900n }), 900n, { marginAccepted: false })
    expect(plan.blockers[0]).toMatch(/not accepting/)
  })
})

// ---------------------------------------------------------------------------
// Fee arithmetic and quote
// ---------------------------------------------------------------------------

describe("open fee arithmetic", () => {
  it("floors the notional and ceils the fee like the executor", () => {
    expect(requestedNotionalUsd18(999n, 333)).toBe(3326n) // 999 * 3.33 = 3326.67 -> 3326
    expect(openingFeeUsd18(3326n, 30)).toBe(10n) // 9.978 -> 10
    expect(openingFeeUsd18(3326n, 0)).toBe(0n)
  })

  it("gives a nonzero fee at least one share of room and a zero fee none", () => {
    expect(feeCeiling(0n, 50)).toBe(0n)
    expect(feeCeiling(10n, 50)).toBe(11n)
    expect(feeCeiling(100_000n, 50)).toBe(100_500n)
  })

  it("sizes margin inside both dollar caps", () => {
    const risk = { ...RISK, maxPositionValueUsd18: 2n * WAD, maxDebtValueUsd18: 1n * WAD } as any
    // 5x: position cap allows $0.40, debt cap allows $0.25 -> $0.25 minus 2% headroom
    expect(maxMarginValueForCapsUsd18(risk, 500)).toBe((WAD / 4n) * 98n / 100n)
    expect(maxMarginValueForCapsUsd18(risk, 100)).toBe(0n)
  })
})

describe("quoteRobinhoodOpen", () => {
  it("builds OpenParams from live reads with the quoted minimum unchanged", async () => {
    const client = quoteChain()
    const q = await quoteRobinhoodOpen(client, { direction: "long", marginShares: 2_000n, leverageX100: 300 }, USER)
    expect(q.issues).toEqual([])
    expect(q.exchangeRateSource).toBe("current")
    expect(q.marginUnderlying).toBe((2_000n * (10n ** 14n + 7n)) / WAD)
    expect(q.marginValueUsd18).toBe(2n * 10n ** 17n) // $0.20
    expect(q.requestedNotionalUsd18).toBe(6n * 10n ** 17n) // $0.60, inside the $2 cap
    expect(q.openingFeeUsd18).toBe(18n * 10n ** 14n)
    expect(q.openingFeeShares).toBe(18n)
    expect(q.maxOpeningFeePToken).toBe(19n)
    expect(q.flashFee).toBe(200n)
    expect(q.params).toMatchObject({
      marginPToken: ROBINHOOD_PAIRS.long.marginPToken,
      positionPToken: ROBINHOOD_PAIRS.long.positionPToken,
      debtPToken: ROBINHOOD_PAIRS.long.debtPToken,
      marginPTokenAmount: 2_000n,
      leverageX100: 300,
      maxOpeningFeePToken: 19n,
      minPositionUnderlying: 1_700_000_000_000_000n,
      side: 0,
      swapData: "0x",
    })
  })

  it("does not assume a zero fee when the fee cannot be read", async () => {
    const q = await quoteRobinhoodOpen(quoteChain({ openFeeBps: new Error("rpc") }), { direction: "long", marginShares: 2_000n, leverageX100: 300 }, USER)
    expect(q.params).toBeNull()
    expect(q.issues.map((i) => i.code)).toContain("fee-unavailable")
  })

  it("blocks on the debt cap, including the flash fee", async () => {
    const q = await quoteRobinhoodOpen(quoteChain({ debtUsd: 2n * WAD }), { direction: "short", marginShares: 20n, leverageX100: 300 }, USER)
    expect(q.params).toBeNull()
    expect(q.issues.map((i) => i.code)).toContain("debt-cap")
  })

  it("requires free margin for the amount plus the fee ceiling", async () => {
    const q = await quoteRobinhoodOpen(quoteChain({ free: 2_000n }), { direction: "long", marginShares: 2_000n, leverageX100: 200 }, USER)
    expect(q.issues.map((i) => i.code)).toEqual(["insufficient-margin"])
  })

  it("reports a failed quoter as unavailable rather than a zero minimum", async () => {
    const q = await quoteRobinhoodOpen(quoteChain({ quoteFails: true }), { direction: "long", marginShares: 20n, leverageX100: 300 }, USER)
    expect(q.minPositionUnderlying).toBeNull()
    expect(q.issues.map((i) => i.code)).toEqual(["quote-failed"])
  })

  it("rejects leverage above the pair maximum before any quoter call", async () => {
    const client = quoteChain()
    const q = await quoteRobinhoodOpen(client, { direction: "long", marginShares: 20n, leverageX100: 600 }, USER)
    expect(q.issues.map((i) => i.code)).toEqual(["leverage"])
    expect(client.multicall).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// Errors and events
// ---------------------------------------------------------------------------

describe("decodeRobinhoodError", () => {
  it("maps nested custom errors from any bundled ABI", () => {
    const data = encodeErrorResult({ abi: A.executor as Abi, errorName: "ExecutorError", args: [17] })
    const decoded = decodeRobinhoodError({ message: "reverted", cause: { data } })
    expect(decoded.errorName).toBe("ExecutorError(17)")
    expect(decoded.kind).toBe("fee")

    const cap = encodeErrorResult({ abi: A.riskEngine as Abi, errorName: "DebtCapExceeded" })
    expect(decodeRobinhoodError({ cause: { cause: { data: cap } } }).kind).toBe("cap")
  })

  it("recognises a wallet rejection and a require string", () => {
    expect(decodeRobinhoodError({ code: 4001, message: "User rejected the request." }).kind).toBe("rejected")
    const data = encodeErrorResult({
      abi: [{ type: "error", name: "Error", inputs: [{ name: "message", type: "string" }] }],
      errorName: "Error",
      args: ["MarginVault: insufficient free balance"],
    })
    expect(decodeRobinhoodError({ cause: { data } }).kind).toBe("margin")
  })

  it("decodes the USDG token's own allowance error (selector seen on mainnet)", () => {
    const decoded = decodeRobinhoodError({ cause: { data: "0x13be252b" } })
    expect(decoded.errorName).toBe("InsufficientAllowance")
    expect(decoded.kind).toBe("margin")
  })
})

describe("receipt decoding", () => {
  const opened = {
    positionId: 7n,
    user: USER,
    account: ACCOUNT,
    side: 1,
    marginPToken: T.pUSDG,
    positionPToken: T.pUSDG,
    debtPToken: T.pNVDA,
    marginPTokenAmount: 2_000n,
    borrowedAmount: 5n,
    grossAssetValueUsd: 3n * WAD,
    leverageX100: 287n,
    healthFactorBps: 14_000n,
  }

  it("takes the id and account from the executor's PositionOpened", () => {
    const log = makeLog(A.executor as Abi, "PositionOpened", M.executor, opened)
    const ev = findPositionOpenedEvent({ logs: [log] as any }, USER)
    expect(ev).toMatchObject({ positionId: 7n, account: ACCOUNT, side: 1, leverageX100: 287n, grossAssetValueUsd18: 3n * WAD })
  })

  it("ignores the same event from another address or for another user", () => {
    const forged = makeLog(A.executor as Abi, "PositionOpened", OTHER, opened)
    const other = makeLog(A.executor as Abi, "PositionOpened", M.executor, { ...opened, user: OTHER })
    expect(findPositionOpenedEvent({ logs: [forged, other] as any }, USER)).toBeNull()
  })

  it("reads the minted shares from Mint", () => {
    const log = makeLog(A.pToken as Abi, "Mint", T.pUSDG, { minter: USER, mintAmount: 1_000_000n, mintTokens: 4_999n })
    expect(findMintEvent({ logs: [log] as any }, USER)?.mintTokens).toBe(4_999n)
  })
})

// ---------------------------------------------------------------------------
// Runner and flows over a small chain simulator
// ---------------------------------------------------------------------------

/**
 * A toy chain: sending a call mutates balances like the contracts would and
 * produces a receipt with the matching events. `mintTokens` = amount / 100.
 */
function toyChain(init: { usdg?: bigint; pUSDG?: bigint; allowMint?: bigint; allowVault?: bigint; free?: bigint } = {}) {
  const s = {
    usdg: init.usdg ?? 5_000_000n,
    pUSDG: init.pUSDG ?? 0n,
    allowMint: init.allowMint ?? 0n,
    allowVault: init.allowVault ?? 0n,
    free: init.free ?? 0n,
  }
  const receipts = new Map<string, any>()
  let n = 0
  const sent: string[] = []

  const read = (c: Call): unknown => {
    const f = c.functionName
    if (f === "balanceOf") return c.address === T.USDG ? s.usdg : c.address === T.pUSDG ? s.pUSDG : 0n
    if (f === "allowance") {
      if (c.address === T.USDG && c.args![1] === T.pUSDG) return s.allowMint
      if (c.address === T.pUSDG && c.args![1] === M.marginVault) return s.allowVault
      return 0n
    }
    if (f === "freeBalance") return s.free
    if (f === "lockedBalance" || f === "pendingRewards") return 0n
    if (f === "allowedPTokens") return true
    if (f === "opensPaused" || f === "paused") return false
    if (f === "marketPriceable") return true
    if (f === "getPrice") return WAD
    return 0n
  }

  const client = {
    getBlockNumber: vi.fn(async () => 1n),
    multicall: vi.fn(async ({ contracts }: { contracts: Call[] }) => contracts.map((c) => ({ status: "success", result: read(c) }))),
    simulateContract: vi.fn(async ({ functionName }: any) => ({ result: functionName === "mint" ? 0n : true })),
    getLogs: vi.fn(),
    waitForTransactionReceipt: vi.fn(async ({ hash }: { hash: Hex }) => receipts.get(hash)),
  } as any

  const send = vi.fn(async ({ to, data }: { to: string; data: Hex }) => {
    const abi = (to === M.marginVault ? A.marginVault : to === T.USDG ? A.erc20 : A.pToken) as Abi
    const { functionName, args } = decodeFunctionData({ abi, data }) as any
    const logs: any[] = []
    if (functionName === "approve") {
      if (to === T.USDG) s.allowMint = args[1]
      else s.allowVault = args[1]
    } else if (functionName === "mint") {
      const tokens = args[0] / 100n
      s.usdg -= args[0]
      s.allowMint -= args[0]
      s.pUSDG += tokens
      logs.push(makeLog(A.pToken as Abi, "Mint", T.pUSDG, { minter: USER, mintAmount: args[0], mintTokens: tokens }))
    } else if (functionName === "deposit") {
      s.pUSDG -= args[1]
      s.allowVault -= args[1]
      s.free += args[1]
      logs.push(makeLog(A.marginVault as Abi, "Deposited", M.marginVault, { user: USER, pToken: T.pUSDG, amount: args[1] }))
    }
    const hash = ("0x" + (++n).toString(16).padStart(64, "0")) as Hex
    sent.push(functionName)
    receipts.set(hash, { status: "success", logs, blockNumber: BigInt(n), blockHash: hash })
    return hash
  })

  const deps = { client, ensureChain: vi.fn(async () => {}), send, remember: vi.fn(), forget: vi.fn() }
  return { s, deps, sent, client }
}

describe("runRobinhoodCall", () => {
  it("never reaches the wallet when the simulation fails", async () => {
    const { deps, client } = toyChain()
    client.simulateContract.mockRejectedValueOnce({ message: "revert", cause: { data: encodeErrorResult({ abi: A.executor as Abi, errorName: "ExecutorError", args: [8] }) } })
    const updates: RobinhoodTxUpdate[] = []
    await expect(runRobinhoodCall(deps, USER, mintPUsdg(1n), { onUpdate: (u) => updates.push(u) })).rejects.toMatchObject({
      phase: "simulating",
      decoded: { kind: "opens-paused" },
    })
    expect(deps.send).not.toHaveBeenCalled()
    expect(updates.map((u) => u.phase)).toEqual(["switching", "simulating", "failed"])
  })

  it("blocks a mint whose simulated error code is nonzero", async () => {
    const { deps } = toyChain()
    await expect(
      runRobinhoodCall(deps, USER, mintPUsdg(1n), { checkSimulation: (r) => (r !== true ? "refused" : null) }),
    ).rejects.toBeInstanceOf(RobinhoodTxError)
    expect(deps.send).not.toHaveBeenCalled()
  })

  it("keeps the hash on a receipt timeout and reports unconfirmed, not failed", async () => {
    const { deps, client } = toyChain()
    client.waitForTransactionReceipt.mockRejectedValueOnce(new Error("Timed out while waiting for transaction"))
    const err = await runRobinhoodCall(deps, USER, approveUsdgForMint(5n)).catch((e) => e)
    expect(err.phase).toBe("unconfirmed")
    expect(err.hash).toMatch(/^0x/)
    expect(deps.remember).toHaveBeenCalledTimes(1)
    expect(deps.forget).not.toHaveBeenCalled()
  })

  it("fails a reverted receipt and a cancelled replacement", async () => {
    const { deps, client } = toyChain()
    client.waitForTransactionReceipt.mockResolvedValueOnce({ status: "reverted", logs: [] })
    await expect(runRobinhoodCall(deps, USER, approveUsdgForMint(5n))).rejects.toMatchObject({ phase: "submitted" })

    client.waitForTransactionReceipt.mockImplementationOnce(async ({ onReplaced }: any) => {
      onReplaced({ reason: "cancelled", transaction: { hash: "0x01" } })
      return { status: "success", logs: [] }
    })
    await expect(runRobinhoodCall(deps, USER, approveUsdgForMint(5n))).rejects.toThrow(/replaced or cancelled/)
  })
})

describe("runRobinhoodDeposit", () => {
  it("runs approve, mint, approve, deposit and deposits exactly the minted shares", async () => {
    const { deps, s, sent } = toyChain()
    const res = await runRobinhoodDeposit(deps, USER, { usdgAmount6: 1_000_000n })
    expect(sent).toEqual(["approve", "mint", "approve", "deposit"])
    expect(res.mint?.mintTokens).toBe(10_000n)
    expect(res.deposited.amount).toBe(10_000n)
    expect(res.freeSharesAfter).toBe(10_000n)
    expect(s.pUSDG).toBe(0n)
  })

  it("resumes at the vault step for shares already in the wallet", async () => {
    const { deps, sent } = toyChain({ pUSDG: 700n, allowVault: 700n })
    const res = await runRobinhoodDeposit(deps, USER, { shares: 700n })
    expect(sent).toEqual(["deposit"])
    expect(res.mint).toBeNull()
  })

  it("stops when a confirmed mint carries no Mint event", async () => {
    const { deps, client, sent } = toyChain({ allowMint: 10n ** 12n })
    client.waitForTransactionReceipt.mockResolvedValueOnce({ status: "success", logs: [], blockNumber: 1n, blockHash: "0x" })
    await expect(runRobinhoodDeposit(deps, USER, { usdgAmount6: 1_000_000n })).rejects.toThrow(/without a Mint event/)
    expect(sent).toEqual(["mint"])
  })
})

describe("runRobinhoodOpen", () => {
  it("returns the fresh quote instead of raising the fee ceiling", async () => {
    const accepted = await quoteRobinhoodOpen(quoteChain({ openFeeBps: 30 }), { direction: "long", marginShares: 2_000n, leverageX100: 300 }, USER)
    const deps = { client: quoteChain({ openFeeBps: 100 }), ensureChain: vi.fn(), send: vi.fn() } as any
    const err = await runRobinhoodOpen(deps, USER, accepted).catch((e) => e)
    expect(err).toBeInstanceOf(RobinhoodRequoteError)
    expect(err.quote.openingFeeShares).toBeGreaterThan(accepted.maxOpeningFeePToken!)
    expect(deps.send).not.toHaveBeenCalled()
  })

  it("signs with the accepted ceiling and reports the executor's event", async () => {
    const accepted = await quoteRobinhoodOpen(quoteChain(), { direction: "long", marginShares: 2_000n, leverageX100: 300 }, USER)
    const client = quoteChain()
    const log = makeLog(A.executor as Abi, "PositionOpened", M.executor, {
      positionId: 3n, user: USER, account: ACCOUNT, side: 0, marginPToken: T.pUSDG, positionPToken: T.pNVDA,
      debtPToken: T.pUSDG, marginPTokenAmount: 2_000n, borrowedAmount: 400_200n, grossAssetValueUsd: 59n * WAD,
      leverageX100: 295n, healthFactorBps: 16_000n,
    })
    client.simulateContract.mockImplementation(async ({ functionName }: any) =>
      functionName === "exchangeRateCurrent" ? { result: 10n ** 14n + 7n } : { result: 3n },
    )
    client.waitForTransactionReceipt = vi.fn(async () => ({ status: "success", logs: [log], blockNumber: 9n, blockHash: "0x" }))
    const send = vi.fn(async ({ data }: { data: Hex }) => {
      const { args } = decodeFunctionData({ abi: A.executor as Abi, data }) as any
      expect(args[0].maxOpeningFeePToken).toBe(accepted.maxOpeningFeePToken)
      expect(args[0].minPositionUnderlying).toBe(1_700_000_000_000_000n)
      return ("0x" + "11".repeat(32)) as Hex
    })
    const res = await runRobinhoodOpen({ client, ensureChain: vi.fn(async () => {}), send } as any, USER, accepted)
    expect(send).toHaveBeenCalledTimes(1)
    expect(res.event.positionId).toBe(3n)
    expect(res.event.leverageX100).toBe(295n)
  })
})

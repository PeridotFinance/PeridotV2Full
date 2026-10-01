/**
 * Read layer for the Robinhood NVDA/USDG isolated-margin product.
 *
 * Three pure functions over a viem public client (injected, so tests stub it
 * and server jobs bring their own):
 *
 *   readRobinhoodMarketState   the shared, wallet-independent picture: gates,
 *                              fees, pair risk, prices, flash capacity, cash
 *   readRobinhoodAccountState  one wallet's balances, allowances and vault margin
 *   readRobinhoodPositions     the wallet's positions with live risk metrics
 *
 * Every batch is one Multicall3 round-trip with `allowFailure`, and every
 * field that can fail on its own is nullable. The rule from the guide,
 * section 4: a price that cannot be read is `null`, never `0`; a health
 * that cannot be read is `null`, never `0`. A reader that turned an oracle
 * outage into a crash or a liquidation warning would be worse than no reader.
 */
import { getAbiItem, type Address, type Hex, type PublicClient } from "viem"
import { ROBINHOOD_ABIS } from "@/app/abis/robinhood"
import {
  ROBINHOOD_EXECUTOR_DEPLOY_BLOCK,
  ROBINHOOD_MARGIN,
  ROBINHOOD_MULTICALL3,
  ROBINHOOD_PAIRS,
  ROBINHOOD_POSITION_STATUS,
  ROBINHOOD_TOKENS,
  type RobinhoodMarginSide,
} from "@/config/robinhood"
import { healthFromBps, leverageFromX100, underlyingFromShares } from "./units"

/** The slice of a viem PublicClient the reads need. Tests stub exactly this. */
export type RobinhoodReader = Pick<
  PublicClient,
  "multicall" | "getBlockNumber" | "getLogs" | "simulateContract"
> &
  /** Optional: only the gas reading uses it, and a missing one is null, not a failure. */
  Partial<Pick<PublicClient, "getGasPrice">>

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RobinhoodPairRisk {
  enabled: boolean
  maxLeverageX100: number
  initialMarginBps: number
  maintenanceMarginBps: number
  liquidationTargetBps: number
  fullLiquidationHealthBps: number
  maxLiquidationBps: number
  liquidationBonusBps: number
  maxSlippageBps: number
  oracleDeviationBps: number
  maxPositionValueUsd18: bigint
  maxDebtValueUsd18: bigint
}

export interface RobinhoodPriceState {
  /** `oracle.marketPriceable(pToken)`. False means every price-dependent action is off. */
  priceable: boolean | null
  /** `oracle.getPrice(underlying)`, USD 18 dec. Null when not priceable, reverted or zero. */
  priceUsd18: bigint | null
}

export interface RobinhoodMarketState {
  blockNumber: bigint
  readAt: number
  opensPaused: boolean | null
  openFeeBps: number | null
  closeFeeBps: number | null
  pairRisk: { long: RobinhoodPairRisk | null; short: RobinhoodPairRisk | null }
  /** `marginVault.allowedPTokens(pUSDG)`; false means deposits are refused. */
  marginAccepted: boolean | null
  prices: { usdg: RobinhoodPriceState; nvda: RobinhoodPriceState }
  flash: {
    paused: boolean | null
    /** Raw USDG6, the long side's flash leg. */
    maxUsdg: bigint | null
    /** Raw NVDA18, the short side's flash leg. */
    maxNvda: bigint | null
  }
  markets: {
    pUSDG: { cash: bigint | null; exchangeRate: bigint | null }
    pNVDA: { cash: bigint | null; exchangeRate: bigint | null }
  }
  dustDebtValueUsd18: bigint | null
  nextPositionId: bigint | null
  /** Names of the reads that failed, for a diagnostics line. Empty on a clean pass. */
  failures: string[]
}

export interface RobinhoodAccountState {
  blockNumber: bigint
  readAt: number
  user: Address
  wallet: {
    usdg: bigint | null
    nvda: bigint | null
    pUSDG: bigint | null
    pNVDA: bigint | null
  }
  /** Allowances keyed by the action they unlock (guide section 5). */
  allowances: {
    usdgForMint: bigint | null
    pUsdgForVaultDeposit: bigint | null
    usdgForRepay: bigint | null
    nvdaForRepay: bigint | null
    pUsdgForRepayWithPToken: bigint | null
    pNvdaForRepayWithPToken: bigint | null
  }
  /**
   * The gas token, which nothing else on this product mentions. Read here so
   * the page can say "no ETH" before a signature fails; see lib/robinhood/gas.ts.
   */
  gas: {
    /** Native ETH balance, wei. */
    balanceWei: bigint | null
    /**
     * Gas price, wei, for turning a gas budget into an ETH amount. From
     * `eth_gasPrice`, not Multicall3's `getBasefee`: that opcode answers 0 on
     * chain 4663 (measured 2026-09-21), which would make every threshold zero
     * and the warning unreachable.
     */
    gasPriceWei: bigint | null
  }
  vault: {
    /** pUSDG shares available to open with or withdraw. */
    freeShares: bigint | null
    /** pUSDG shares allocated to open positions. */
    lockedShares: bigint | null
    /** Fee rewards (pUSDG shares) waiting for `marginVault.settle`. */
    pendingRewardShares: bigint | null
  }
  failures: string[]
}

export type RobinhoodPositionStatusCode = 0 | 1 | 2 | 3 | 4 | 5 | 6

export interface RobinhoodPositionMetrics {
  grossAssetValueUsd18: bigint
  debtValueUsd18: bigint
  /** Signed. */
  equityUsd18: bigint
  initialRequirementUsd18: bigint
  maintenanceRequirementUsd18: bigint
  healthFactorBps: bigint
  leverageX100: bigint
}

export interface RobinhoodPosition {
  id: bigint
  owner: Address
  /** The isolated account holding the position. Metrics and debt are read against it. */
  account: Address
  side: RobinhoodMarginSide
  direction: "long" | "short"
  marginPToken: Address
  positionPToken: Address
  debtPToken: Address
  status: RobinhoodPositionStatusCode
  statusLabel: string
  isActive: boolean
  /** Bookkeeping from the executor, not current equity. */
  lockedMarginShares: bigint
  initialNotionalUsd18: bigint
  /** Updated by operations only; the live debt is `debtStored`. */
  borrowedPrincipal: bigint
  requestedLeverageX100: number
  /** `debtPToken.borrowBalanceStored(account)`, raw debt underlying. May lag accrual. */
  debtStored: bigint | null
  /** `positionPToken.balanceOf(account)`, raw shares. */
  positionShares: bigint | null
  /** Position shares through the position market's stored exchange rate. */
  positionUnderlying: bigint | null
  /** Null when the risk engine could not price the account. */
  metrics: RobinhoodPositionMetrics | null
  /** Derived from metrics; null means unknown, not healthy. */
  health: number | null
  leverage: number | null
  /** `riskEngine.isLiquidatable(account)`; null when unreadable. */
  liquidatable: boolean | null
  /** True when metrics or liquidatable could not be read. Show "unavailable", not 0. */
  riskUnavailable: boolean
}

export interface RobinhoodPositionsResult {
  blockNumber: bigint
  readAt: number
  positions: RobinhoodPosition[]
  /** How the ids were found; surfaces in diagnostics only. */
  discovery: "enumeration" | "logs" | "none"
  failures: string[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type MulticallEntry = { status: "success"; result: unknown } | { status: "failure"; error: unknown }

function pick<T>(entries: readonly MulticallEntry[], index: number, label: string, failures: string[]): T | null {
  const entry = entries[index]
  if (!entry || entry.status !== "success") {
    failures.push(label)
    return null
  }
  return entry.result as T
}

const toBigint = (v: unknown): bigint | null =>
  typeof v === "bigint" ? v : typeof v === "number" ? BigInt(v) : null
const toNumber = (v: unknown): number | null =>
  typeof v === "number" ? v : typeof v === "bigint" ? Number(v) : null
const toBool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null)

/** viem returns a named struct as an object and an unnamed tuple as an array; accept both. */
function structField<T>(value: unknown, name: string, index: number): T | undefined {
  if (Array.isArray(value)) return value[index] as T
  if (value && typeof value === "object") return (value as Record<string, T>)[name]
  return undefined
}

function parsePairRisk(value: unknown): RobinhoodPairRisk | null {
  if (value === null || value === undefined) return null
  const f = <T>(name: string, index: number) => structField<T>(value, name, index)
  const enabled = f<boolean>("enabled", 0)
  if (typeof enabled !== "boolean") return null
  return {
    enabled,
    maxLeverageX100: Number(f<number | bigint>("maxLeverageX100", 1) ?? 0),
    initialMarginBps: Number(f<number | bigint>("initialMarginBps", 2) ?? 0),
    maintenanceMarginBps: Number(f<number | bigint>("maintenanceMarginBps", 3) ?? 0),
    liquidationTargetBps: Number(f<number | bigint>("liquidationTargetBps", 4) ?? 0),
    fullLiquidationHealthBps: Number(f<number | bigint>("fullLiquidationHealthBps", 5) ?? 0),
    maxLiquidationBps: Number(f<number | bigint>("maxLiquidationBps", 6) ?? 0),
    liquidationBonusBps: Number(f<number | bigint>("liquidationBonusBps", 7) ?? 0),
    maxSlippageBps: Number(f<number | bigint>("maxSlippageBps", 8) ?? 0),
    oracleDeviationBps: Number(f<number | bigint>("oracleDeviationBps", 9) ?? 0),
    maxPositionValueUsd18: BigInt(f<bigint>("maxPositionValueUsd", 10) ?? 0n),
    maxDebtValueUsd18: BigInt(f<bigint>("maxDebtValueUsd", 11) ?? 0n),
  }
}

function parseMetrics(value: unknown): RobinhoodPositionMetrics | null {
  if (value === null || value === undefined) return null
  const f = (name: string, index: number) => structField<bigint>(value, name, index)
  const gross = f("grossAssetValueUsd", 0)
  if (typeof gross !== "bigint") return null
  return {
    grossAssetValueUsd18: gross,
    debtValueUsd18: f("debtValueUsd", 1) ?? 0n,
    equityUsd18: f("equityUsd", 2) ?? 0n,
    initialRequirementUsd18: f("initialRequirementUsd", 3) ?? 0n,
    maintenanceRequirementUsd18: f("maintenanceRequirementUsd", 4) ?? 0n,
    healthFactorBps: f("healthFactorBps", 5) ?? 0n,
    leverageX100: f("leverageX100", 6) ?? 0n,
  }
}

const STATUS_LABELS: Record<number, string> = Object.fromEntries(
  Object.entries(ROBINHOOD_POSITION_STATUS).map(([label, code]) => [code as number, label]),
)

export function positionStatusLabel(code: number): string {
  return STATUS_LABELS[code] ?? `UNKNOWN(${code})`
}

function priceState(priceable: boolean | null, price: bigint | null): RobinhoodPriceState {
  // A price only counts when the market says it is priceable and the read
  // returned something positive. Anything else is "unavailable".
  const usable = priceable === true && price !== null && price > 0n
  return { priceable, priceUsd18: usable ? price : null }
}

const A = ROBINHOOD_ABIS
const M = ROBINHOOD_MARGIN
const T = ROBINHOOD_TOKENS

// ---------------------------------------------------------------------------
// Market state
// ---------------------------------------------------------------------------

export async function readRobinhoodMarketState(client: RobinhoodReader): Promise<RobinhoodMarketState> {
  const blockNumber = await client.getBlockNumber()
  const { long, short } = ROBINHOOD_PAIRS
  const entries = (await client.multicall({
    blockNumber,
    allowFailure: true,
    contracts: [
      { address: M.config, abi: A.config, functionName: "opensPaused" },
      { address: M.config, abi: A.config, functionName: "openFeeBps" },
      { address: M.config, abi: A.config, functionName: "closeFeeBps" },
      { address: M.config, abi: A.config, functionName: "getPairRisk", args: [long.marginPToken, long.positionPToken, long.debtPToken] },
      { address: M.config, abi: A.config, functionName: "getPairRisk", args: [short.marginPToken, short.positionPToken, short.debtPToken] },
      { address: M.marginVault, abi: A.marginVault, functionName: "allowedPTokens", args: [T.pUSDG] },
      { address: M.oracle, abi: A.oracle, functionName: "marketPriceable", args: [T.pUSDG] },
      { address: M.oracle, abi: A.oracle, functionName: "marketPriceable", args: [T.pNVDA] },
      { address: M.oracle, abi: A.oracle, functionName: "getPrice", args: [T.USDG] },
      { address: M.oracle, abi: A.oracle, functionName: "getPrice", args: [T.NVDA] },
      { address: M.flashVault, abi: A.flashVault, functionName: "paused" },
      { address: M.flashVault, abi: A.flashVault, functionName: "maxFlashLoan", args: [T.USDG] },
      { address: M.flashVault, abi: A.flashVault, functionName: "maxFlashLoan", args: [T.NVDA] },
      { address: T.pUSDG, abi: A.pToken, functionName: "getCash" },
      { address: T.pNVDA, abi: A.pToken, functionName: "getCash" },
      { address: T.pUSDG, abi: A.pToken, functionName: "exchangeRateStored" },
      { address: T.pNVDA, abi: A.pToken, functionName: "exchangeRateStored" },
      { address: M.riskEngine, abi: A.riskEngine, functionName: "DUST_DEBT_VALUE_USD" },
      { address: M.executor, abi: A.executor, functionName: "nextPositionId" },
    ] as any,
  })) as MulticallEntry[]

  const failures: string[] = []
  const p = <T>(i: number, label: string) => pick<T>(entries, i, label, failures)

  const usdgPriceable = toBool(p(6, "marketPriceable(pUSDG)"))
  const nvdaPriceable = toBool(p(7, "marketPriceable(pNVDA)"))
  const usdgPrice = toBigint(p(8, "getPrice(USDG)"))
  const nvdaPrice = toBigint(p(9, "getPrice(NVDA)"))

  return {
    blockNumber,
    readAt: Date.now(),
    opensPaused: toBool(p(0, "opensPaused")),
    openFeeBps: toNumber(p(1, "openFeeBps")),
    closeFeeBps: toNumber(p(2, "closeFeeBps")),
    pairRisk: {
      long: parsePairRisk(p(3, "getPairRisk(long)")),
      short: parsePairRisk(p(4, "getPairRisk(short)")),
    },
    marginAccepted: toBool(p(5, "allowedPTokens(pUSDG)")),
    prices: {
      usdg: priceState(usdgPriceable, usdgPrice),
      nvda: priceState(nvdaPriceable, nvdaPrice),
    },
    flash: {
      paused: toBool(p(10, "flash.paused")),
      maxUsdg: toBigint(p(11, "maxFlashLoan(USDG)")),
      maxNvda: toBigint(p(12, "maxFlashLoan(NVDA)")),
    },
    markets: {
      pUSDG: { cash: toBigint(p(13, "pUSDG.getCash")), exchangeRate: toBigint(p(15, "pUSDG.exchangeRateStored")) },
      pNVDA: { cash: toBigint(p(14, "pNVDA.getCash")), exchangeRate: toBigint(p(16, "pNVDA.exchangeRateStored")) },
    },
    dustDebtValueUsd18: toBigint(p(17, "DUST_DEBT_VALUE_USD")),
    nextPositionId: toBigint(p(18, "nextPositionId")),
    failures,
  }
}

// ---------------------------------------------------------------------------
// Account state
// ---------------------------------------------------------------------------

/**
 * The one Multicall3 helper the account read uses. Not part of the handout
 * bundle, and deliberately not added to it: the bundle is replaced wholesale
 * from a new handout, and this is canonical Multicall3, not a Peridot contract.
 */
const MULTICALL3_HELPERS = [
  {
    type: "function",
    name: "getEthBalance",
    stateMutability: "view",
    inputs: [{ name: "addr", type: "address" }],
    outputs: [{ name: "balance", type: "uint256" }],
  },
] as const

export async function readRobinhoodAccountState(
  client: RobinhoodReader,
  user: Address,
): Promise<RobinhoodAccountState> {
  const blockNumber = await client.getBlockNumber()
  // The gas price is its own JSON-RPC method, so it rides beside the batch
  // rather than in it. A failure here is null, never a zero: gas.ts then
  // assumes an expensive block instead of a free one. It is also the one
  // optional method on the reader, so a caller with a narrower client keeps
  // its balances instead of losing the whole read.
  const gasPrice: Promise<bigint | null> =
    typeof client.getGasPrice === "function" ? client.getGasPrice().catch(() => null) : Promise.resolve(null)
  const entries = (await client.multicall({
    blockNumber,
    allowFailure: true,
    contracts: [
      { address: T.USDG, abi: A.erc20, functionName: "balanceOf", args: [user] },
      { address: T.NVDA, abi: A.erc20, functionName: "balanceOf", args: [user] },
      { address: T.pUSDG, abi: A.pToken, functionName: "balanceOf", args: [user] },
      { address: T.pNVDA, abi: A.pToken, functionName: "balanceOf", args: [user] },
      { address: T.USDG, abi: A.erc20, functionName: "allowance", args: [user, T.pUSDG] },
      { address: T.pUSDG, abi: A.pToken, functionName: "allowance", args: [user, M.marginVault] },
      { address: T.USDG, abi: A.erc20, functionName: "allowance", args: [user, M.executor] },
      { address: T.NVDA, abi: A.erc20, functionName: "allowance", args: [user, M.executor] },
      { address: T.pUSDG, abi: A.pToken, functionName: "allowance", args: [user, M.executor] },
      { address: T.pNVDA, abi: A.pToken, functionName: "allowance", args: [user, M.executor] },
      { address: M.marginVault, abi: A.marginVault, functionName: "freeBalance", args: [user, T.pUSDG] },
      { address: M.marginVault, abi: A.marginVault, functionName: "lockedBalance", args: [user, T.pUSDG] },
      { address: M.feeDistributor, abi: A.feeDistributor, functionName: "pendingRewards", args: [user, T.pUSDG] },
      // The gas token rides along in the same batch, so the balance and the
      // base fee come from the same block as everything else.
      { address: ROBINHOOD_MULTICALL3, abi: MULTICALL3_HELPERS, functionName: "getEthBalance", args: [user] },
    ] as any,
  })) as MulticallEntry[]

  const failures: string[] = []
  const b = (i: number, label: string) => toBigint(pick(entries, i, label, failures))

  return {
    blockNumber,
    readAt: Date.now(),
    user,
    wallet: {
      usdg: b(0, "USDG.balanceOf"),
      nvda: b(1, "NVDA.balanceOf"),
      pUSDG: b(2, "pUSDG.balanceOf"),
      pNVDA: b(3, "pNVDA.balanceOf"),
    },
    allowances: {
      usdgForMint: b(4, "USDG.allowance(pUSDG)"),
      pUsdgForVaultDeposit: b(5, "pUSDG.allowance(marginVault)"),
      usdgForRepay: b(6, "USDG.allowance(executor)"),
      nvdaForRepay: b(7, "NVDA.allowance(executor)"),
      pUsdgForRepayWithPToken: b(8, "pUSDG.allowance(executor)"),
      pNvdaForRepayWithPToken: b(9, "pNVDA.allowance(executor)"),
    },
    gas: {
      balanceWei: b(13, "multicall3.getEthBalance"),
      gasPriceWei: await gasPrice,
    },
    vault: {
      freeShares: b(10, "freeBalance"),
      lockedShares: b(11, "lockedBalance"),
      pendingRewardShares: b(12, "pendingRewards"),
    },
    failures,
  }
}

// ---------------------------------------------------------------------------
// Position discovery
// ---------------------------------------------------------------------------

/**
 * Below this many positions in total, `positions(id)` for every id in one
 * multicall is cheaper and simpler than a log scan over two million blocks.
 * Above it, PositionOpened logs filtered by the indexed `user` are the index.
 */
export const ROBINHOOD_ENUMERATION_LIMIT = 256n

/** Block span per eth_getLogs request. The public RPC accepted 1,000,000 on 2026-09-21; stay under it. */
export const ROBINHOOD_LOG_PAGE_BLOCKS = 500_000n

const POSITION_OPENED_EVENT = getAbiItem({ abi: A.executor as any, name: "PositionOpened" }) as any

export interface DiscoverOptions {
  /** Skip the nextPositionId read when the caller already has it. */
  nextPositionId?: bigint
  fromBlock?: bigint
  toBlock?: bigint
}

/**
 * Ids of every position the wallet has ever opened (any status). Closed and
 * liquidated ones are included on purpose: the caller decides what to show.
 */
export async function discoverRobinhoodPositionIds(
  client: RobinhoodReader,
  user: Address,
  options: DiscoverOptions = {},
): Promise<{ ids: bigint[]; discovery: RobinhoodPositionsResult["discovery"] }> {
  let next = options.nextPositionId
  if (next === undefined) {
    const [entry] = (await client.multicall({
      allowFailure: true,
      contracts: [{ address: M.executor, abi: A.executor, functionName: "nextPositionId" }] as any,
    })) as MulticallEntry[]
    next = entry?.status === "success" ? (entry.result as bigint) : undefined
  }

  if (next !== undefined && next <= 1n) return { ids: [], discovery: "none" }

  if (next !== undefined && next <= ROBINHOOD_ENUMERATION_LIMIT) {
    const ids: bigint[] = []
    for (let id = 1n; id < next; id++) ids.push(id)
    const entries = (await client.multicall({
      allowFailure: true,
      contracts: ids.map((id) => ({ address: M.executor, abi: A.executor, functionName: "positions", args: [id] })) as any,
    })) as MulticallEntry[]
    const owned = ids.filter((_, i) => {
      const entry = entries[i]
      if (!entry || entry.status !== "success") return false
      const owner = structField<string>(entry.result, "owner", 1)
      return typeof owner === "string" && owner.toLowerCase() === user.toLowerCase()
    })
    return { ids: owned, discovery: "enumeration" }
  }

  const fromBlock = options.fromBlock ?? ROBINHOOD_EXECUTOR_DEPLOY_BLOCK
  const toBlock = options.toBlock ?? (await client.getBlockNumber())
  const ids = new Set<bigint>()
  for (let start = fromBlock; start <= toBlock; start += ROBINHOOD_LOG_PAGE_BLOCKS) {
    const end = start + ROBINHOOD_LOG_PAGE_BLOCKS - 1n < toBlock ? start + ROBINHOOD_LOG_PAGE_BLOCKS - 1n : toBlock
    const logs = await client.getLogs({
      address: M.executor,
      event: POSITION_OPENED_EVENT,
      args: { user },
      fromBlock: start,
      toBlock: end,
    } as any)
    for (const log of logs as Array<{ args?: { positionId?: bigint } }>) {
      const id = log.args?.positionId
      if (typeof id === "bigint") ids.add(id)
    }
  }
  return { ids: [...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)), discovery: "logs" }
}

// ---------------------------------------------------------------------------
// Position hydration
// ---------------------------------------------------------------------------

export interface ReadPositionsOptions extends DiscoverOptions {
  /** Explicit ids skip discovery entirely. */
  ids?: bigint[]
  /** Stored exchange rates from a market read, to avoid re-reading them. */
  exchangeRates?: { pUSDG: bigint | null; pNVDA: bigint | null }
}

const ACTIVE_STATUSES = new Set<number>([
  ROBINHOOD_POSITION_STATUS.OPENING,
  ROBINHOOD_POSITION_STATUS.ACTIVE,
  ROBINHOOD_POSITION_STATUS.CLOSING,
  ROBINHOOD_POSITION_STATUS.LIQUIDATING,
])

export async function readRobinhoodPositions(
  client: RobinhoodReader,
  user: Address,
  options: ReadPositionsOptions = {},
): Promise<RobinhoodPositionsResult> {
  const failures: string[] = []
  let ids = options.ids
  let discovery: RobinhoodPositionsResult["discovery"] = "none"
  if (!ids) {
    const found = await discoverRobinhoodPositionIds(client, user, options)
    ids = found.ids
    discovery = found.discovery
  }

  const blockNumber = await client.getBlockNumber()
  if (ids.length === 0) {
    return { blockNumber, readAt: Date.now(), positions: [], discovery, failures }
  }

  // Pass 1: the position structs. Everything else keys off `account`.
  const structEntries = (await client.multicall({
    blockNumber,
    allowFailure: true,
    contracts: ids.map((id) => ({ address: M.executor, abi: A.executor, functionName: "positions", args: [id] })) as any,
  })) as MulticallEntry[]

  type Raw = {
    id: bigint
    owner: Address
    account: Address
    marginPToken: Address
    positionPToken: Address
    debtPToken: Address
    lockedMarginPTokens: bigint
    initialNotionalUsd: bigint
    borrowedPrincipal: bigint
    requestedLeverageX100: number
    side: number
    status: number
  }
  const raws: Raw[] = []
  structEntries.forEach((entry, i) => {
    if (entry.status !== "success") {
      failures.push(`positions(${ids![i]})`)
      return
    }
    const v = entry.result
    const f = <T>(name: string, index: number) => structField<T>(v, name, index)
    raws.push({
      id: f<bigint>("id", 0) ?? ids![i],
      owner: f<Address>("owner", 1)!,
      account: f<Address>("account", 2)!,
      marginPToken: f<Address>("marginPToken", 3)!,
      positionPToken: f<Address>("positionPToken", 4)!,
      debtPToken: f<Address>("debtPToken", 5)!,
      lockedMarginPTokens: f<bigint>("lockedMarginPTokens", 6) ?? 0n,
      initialNotionalUsd: f<bigint>("initialNotionalUsd", 7) ?? 0n,
      borrowedPrincipal: f<bigint>("borrowedPrincipal", 8) ?? 0n,
      requestedLeverageX100: Number(f<number | bigint>("requestedLeverageX100", 9) ?? 0),
      side: Number(f<number | bigint>("side", 10) ?? 0),
      status: Number(f<number | bigint>("status", 11) ?? 0),
    })
  })

  // Pass 2: per-account risk, debt and share balance. Four reads per position.
  // Only positions the protocol still holds get them; a closed one has an
  // emptied account and its metrics would be noise.
  const live = raws.filter((r) => ACTIVE_STATUSES.has(r.status))
  const needRates = !options.exchangeRates
  const contracts: any[] = []
  for (const r of live) {
    contracts.push(
      { address: M.riskEngine, abi: A.riskEngine, functionName: "getMetrics", args: [r.account] },
      { address: M.riskEngine, abi: A.riskEngine, functionName: "isLiquidatable", args: [r.account] },
      { address: r.debtPToken, abi: A.pToken, functionName: "borrowBalanceStored", args: [r.account] },
      { address: r.positionPToken, abi: A.pToken, functionName: "balanceOf", args: [r.account] },
    )
  }
  if (needRates) {
    contracts.push(
      { address: T.pUSDG, abi: A.pToken, functionName: "exchangeRateStored" },
      { address: T.pNVDA, abi: A.pToken, functionName: "exchangeRateStored" },
    )
  }
  const liveEntries =
    contracts.length > 0
      ? ((await client.multicall({ blockNumber, allowFailure: true, contracts })) as MulticallEntry[])
      : []

  let rates = options.exchangeRates ?? { pUSDG: null, pNVDA: null }
  if (needRates) {
    const base = live.length * 4
    rates = {
      pUSDG: toBigint(pick(liveEntries, base, "pUSDG.exchangeRateStored", failures)),
      pNVDA: toBigint(pick(liveEntries, base + 1, "pNVDA.exchangeRateStored", failures)),
    }
  }
  const rateFor = (pToken: Address): bigint | null =>
    pToken.toLowerCase() === T.pNVDA.toLowerCase() ? rates.pNVDA : rates.pUSDG

  const liveIndex = new Map<bigint, number>()
  live.forEach((r, i) => liveIndex.set(r.id, i))

  const positions: RobinhoodPosition[] = raws.map((r) => {
    const idx = liveIndex.get(r.id)
    let metrics: RobinhoodPositionMetrics | null = null
    let liquidatable: boolean | null = null
    let debtStored: bigint | null = null
    let positionShares: bigint | null = null
    let riskUnavailable = false
    if (idx !== undefined) {
      const base = idx * 4
      metrics = parseMetrics(pick(liveEntries, base, `getMetrics(${r.id})`, failures))
      liquidatable = toBool(pick(liveEntries, base + 1, `isLiquidatable(${r.id})`, failures))
      debtStored = toBigint(pick(liveEntries, base + 2, `borrowBalanceStored(${r.id})`, failures))
      positionShares = toBigint(pick(liveEntries, base + 3, `positionShares(${r.id})`, failures))
      riskUnavailable = metrics === null || liquidatable === null
    }
    const rate = rateFor(r.positionPToken)
    const positionUnderlying =
      positionShares !== null && rate !== null ? underlyingFromShares(positionShares, rate) : null
    const side = (r.side === 1 ? 1 : 0) as RobinhoodMarginSide
    return {
      id: r.id,
      owner: r.owner,
      account: r.account,
      side,
      direction: side === 1 ? "short" : "long",
      marginPToken: r.marginPToken,
      positionPToken: r.positionPToken,
      debtPToken: r.debtPToken,
      status: r.status as RobinhoodPositionStatusCode,
      statusLabel: positionStatusLabel(r.status),
      isActive: r.status === ROBINHOOD_POSITION_STATUS.ACTIVE,
      lockedMarginShares: r.lockedMarginPTokens,
      initialNotionalUsd18: r.initialNotionalUsd,
      borrowedPrincipal: r.borrowedPrincipal,
      requestedLeverageX100: r.requestedLeverageX100,
      debtStored,
      positionShares,
      positionUnderlying,
      metrics,
      health: metrics ? healthFromBps(metrics.healthFactorBps) : null,
      leverage: metrics ? leverageFromX100(metrics.leverageX100) : null,
      liquidatable,
      riskUnavailable,
    }
  })

  return { blockNumber, readAt: Date.now(), positions, discovery, failures }
}

// ---------------------------------------------------------------------------
// Accrued debt (simulation)
// ---------------------------------------------------------------------------

/**
 * `borrowBalanceCurrent` is state-changing, so it is simulated with eth_call
 * rather than signed. Returns null when the simulation fails (stale price,
 * paused market); callers fall back to `debtStored` with a "may lag" label.
 */
export async function simulateRobinhoodDebtCurrent(
  client: RobinhoodReader,
  debtPToken: Address,
  account: Address,
): Promise<bigint | null> {
  try {
    const { result } = await client.simulateContract({
      address: debtPToken,
      abi: A.pToken as any,
      functionName: "borrowBalanceCurrent",
      args: [account],
    } as any)
    return typeof result === "bigint" ? result : null
  } catch {
    return null
  }
}

export { POSITION_OPENED_EVENT }
export type { Hex }

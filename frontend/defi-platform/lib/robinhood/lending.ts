/**
 * The two boosted lending markets on Robinhood Chain (4663), as a plain
 * supply/borrow market: USDG and NVDA, behind the Peridottroller at
 * ROBINHOOD_TOKENS.controller.
 *
 * These are the same pUSDG / pNVDA markets the margin product builds on
 * (FRONTEND_IMPLEMENTATION_GUIDE.md section 1, layer 1). They are Compound
 * style: mint / redeem / borrow / repayBorrow on the pToken, enterMarkets /
 * exitMarket on the controller, and every one of those returns an error code
 * (0 = success) as well as possibly reverting.
 *
 * Three things here are specific to this deployment and are the reason this
 * module exists instead of registering 4663 as another hub chain:
 *
 * 1. Interest accrues per L1 block. `block.number` on this chain is the
 *    Ethereum block number (about 12s), not the 0.1s L2 block, so APYs use
 *    the interest-rate model's own `blocksPerYear()` (2,628,000 when this was
 *    written), never a block time measured from the L2.
 *
 * 2. Two price sources. The controller values collateral and debt with its
 *    own oracle in Compound units (USD * 1e18 per smallest token unit, i.e.
 *    1e30 for a 6-decimal $1 token). The margin oracle reports USD with 18
 *    decimals per whole token. On 2026-09-25 the controller oracle answered
 *    1e18 for USDG, which Compound math reads as $0.000000000001: supplied
 *    USDG adds no borrowing power and borrowed USDG weighs nothing against
 *    it. We value everything the user sees with the reference price, but
 *    the borrow and withdraw limits are the controller's own: the form
 *    offers what the contract would accept and the user decides what to
 *    enter. The capacity bar stays reference-priced, so an over-borrow on a
 *    mispriced market shows as above 100%.
 *
 * 3. Boosted markets. Part of each market sits in the paired liquidity
 *    vault; its results show up in the exchange rate, not in the supply rate.
 *    `getCash()` is local liquidity, not a promise that a redemption clears.
 *
 * Every read degrades to null rather than to zero: an unreadable price or
 * balance must never render as "$0" or "0 available".
 */
import { parseAbi, type Address } from "viem"
import { ROBINHOOD_ABIS } from "@/app/abis/robinhood"
import { ROBINHOOD_DECIMALS, ROBINHOOD_MARGIN, ROBINHOOD_TOKENS } from "@/config/robinhood"
import type { RobinhoodReadClient } from "./client"
import { WAD } from "./units"

type Hex = `0x${string}`

// ---------------------------------------------------------------------------
// Markets
// ---------------------------------------------------------------------------

export type RobinhoodLendingMarketId = "usdg-robinhood" | "nvda-robinhood"

export interface RobinhoodLendingMarket {
  id: RobinhoodLendingMarketId
  symbol: "USDG" | "NVDA"
  name: string
  /** What the row calls the asset class, shown under the symbol. */
  kind: string
  pToken: Address
  underlying: Address
  decimals: number
  icon: string
}

export const ROBINHOOD_LENDING_MARKETS: readonly RobinhoodLendingMarket[] = [
  {
    id: "usdg-robinhood",
    symbol: "USDG",
    name: "Global Dollar",
    kind: "Stablecoin",
    pToken: ROBINHOOD_TOKENS.pUSDG,
    underlying: ROBINHOOD_TOKENS.USDG,
    decimals: ROBINHOOD_DECIMALS.USDG,
    icon: "/tokenimages/robinhood/usdg.png",
  },
  {
    id: "nvda-robinhood",
    symbol: "NVDA",
    name: "NVIDIA",
    kind: "Tokenized stock",
    pToken: ROBINHOOD_TOKENS.pNVDA,
    underlying: ROBINHOOD_TOKENS.NVDA,
    decimals: ROBINHOOD_DECIMALS.NVDA,
    icon: "/stockimages/nvidia.svg",
  },
] as const

export function getRobinhoodLendingMarket(id: string): RobinhoodLendingMarket | null {
  return ROBINHOOD_LENDING_MARKETS.find((m) => m.id === id) ?? null
}

export const ROBINHOOD_CONTROLLER: Address = ROBINHOOD_TOKENS.controller

/** Only the controller calls the lending UI needs; its full ABI is not in the handout. */
export const ROBINHOOD_CONTROLLER_ABI = parseAbi([
  "function oracle() view returns (address)",
  "function markets(address) view returns (bool isListed, uint256 collateralFactorMantissa, bool isComped)",
  "function mintGuardianPaused(address) view returns (bool)",
  "function borrowGuardianPaused(address) view returns (bool)",
  "function borrowCaps(address) view returns (uint256)",
  "function checkMembership(address account, address pToken) view returns (bool)",
  "function getAccountLiquidity(address account) view returns (uint256 err, uint256 liquidity, uint256 shortfall)",
  "function enterMarkets(address[] pTokens) returns (uint256[])",
  "function exitMarket(address pToken) returns (uint256)",
])

export const ROBINHOOD_LENDING_ORACLE_ABI = parseAbi(["function getUnderlyingPrice(address pToken) view returns (uint256)"])

const IRM_ABI = parseAbi(["function blocksPerYear() view returns (uint256)"])

const PTOKEN = ROBINHOOD_ABIS.pToken as any
const ERC20 = ROBINHOOD_ABIS.erc20 as any
const MARGIN_ORACLE = ROBINHOOD_ABIS.oracle as any

/** The value the interest-rate model was deployed with, used only if its read fails. */
export const ROBINHOOD_FALLBACK_BLOCKS_PER_YEAR = 2_628_000n

/**
 * How far the controller's price may sit from the reference before the market
 * is treated as mispriced. Two independent feeds of one asset normally agree
 * to well under a percent; the observed USDG gap is twelve orders of magnitude.
 */
export const ROBINHOOD_PRICE_AGREEMENT_BPS = 500n

/** Below this, a computed borrow limit is rounding and is offered as zero. $0.001. */
export const ROBINHOOD_DUST_USD18 = 10n ** 15n

/**
 * Headroom kept under every computed maximum. Interest accrues between the
 * read and the signature and exchange rates round down, so a MAX that is
 * exactly the limit fails its own simulation.
 */
export const ROBINHOOD_MAX_HEADROOM_BPS = 50n

// ---------------------------------------------------------------------------
// State shapes
// ---------------------------------------------------------------------------

export interface RobinhoodLendingMarketState {
  market: RobinhoodLendingMarket
  /** Underlying units supplied in total (shares x exchange rate). */
  totalSupplyUnderlying: bigint | null
  totalBorrows: bigint | null
  cash: bigint | null
  totalReserves: bigint | null
  exchangeRate: bigint | null
  supplyRatePerBlock: bigint | null
  borrowRatePerBlock: bigint | null
  /** Share of the market held in the paired liquidity vault, 0..1. */
  vaultShare: number | null
  collateralFactor: bigint | null
  isListed: boolean | null
  mintPaused: boolean | null
  borrowPaused: boolean | null
  vaultPaused: boolean | null
  /** 0 means no cap. */
  borrowCap: bigint | null
  /** Controller oracle, Compound units: USD * 1e18 per smallest token unit. */
  controllerPrice: bigint | null
  /** Reference price, USD with 18 decimals per whole token. Null when unavailable. */
  referencePriceUsd18: bigint | null
  /** False when the margin oracle says this market cannot be priced right now. */
  priceable: boolean | null
  /**
   * True when the controller values this asset far from its reference price.
   * Null when either price is missing, so the question cannot be answered.
   */
  mispriced: boolean | null
  supplyApy: number | null
  borrowApy: number | null
  tvlUsd: number | null
  utilizationPct: number | null
  priceUsd: number | null
}

export interface RobinhoodLendingMarkets {
  markets: RobinhoodLendingMarketState[]
  blocksPerYear: bigint
  blockNumber: bigint | null
  readAt: number
}

export interface RobinhoodLendingPosition {
  market: RobinhoodLendingMarket
  shares: bigint | null
  supplied: bigint | null
  borrowed: bigint | null
  walletBalance: bigint | null
  allowance: bigint | null
  isCollateral: boolean | null
}

export interface RobinhoodLendingAccount {
  user: Address
  positions: RobinhoodLendingPosition[]
  /** Controller view, USD18 in its own units. */
  contractLiquidity: bigint | null
  contractShortfall: bigint | null
  nativeBalanceWei: bigint | null
  gasPriceWei: bigint | null
  readAt: number
}

// ---------------------------------------------------------------------------
// Pure math
// ---------------------------------------------------------------------------

/** Compound's APY: compound the per-block rate daily for a year. Percent, e.g. 4.2. */
export function ratePerBlockToApy(ratePerBlock: bigint | null, blocksPerYear: bigint): number | null {
  if (ratePerBlock === null) return null
  if (ratePerBlock <= 0n) return 0
  const perDay = (Number(ratePerBlock) / 1e18) * (Number(blocksPerYear) / 365)
  const apy = (Math.pow(1 + perDay, 365) - 1) * 100
  return Number.isFinite(apy) ? apy : null
}

/** Underlying units -> USD18 at a reference price (USD18 per whole token). */
export function usd18(amount: bigint, referencePriceUsd18: bigint, decimals: number): bigint {
  return (amount * referencePriceUsd18) / 10n ** BigInt(decimals)
}

/** USD18 -> underlying units at a reference price, rounded down. */
export function fromUsd18(valueUsd18: bigint, referencePriceUsd18: bigint, decimals: number): bigint {
  if (referencePriceUsd18 <= 0n) return 0n
  return (valueUsd18 * 10n ** BigInt(decimals)) / referencePriceUsd18
}

/** USD value of `amount` the way the controller sees it (Compound: amount * price / 1e18). */
export function controllerUsd18(amount: bigint, controllerPrice: bigint): bigint {
  return (amount * controllerPrice) / WAD
}

/** The controller's price expressed like the reference one (USD18 per whole token). */
export function controllerPriceAsUsd18(controllerPrice: bigint, decimals: number): bigint {
  return (controllerPrice * 10n ** BigInt(decimals)) / WAD
}

export function isMispriced(controllerPrice: bigint | null, referencePriceUsd18: bigint | null, decimals: number): boolean | null {
  if (controllerPrice === null || referencePriceUsd18 === null || referencePriceUsd18 <= 0n) return null
  const asUsd18 = controllerPriceAsUsd18(controllerPrice, decimals)
  const diff = asUsd18 > referencePriceUsd18 ? asUsd18 - referencePriceUsd18 : referencePriceUsd18 - asUsd18
  return diff * 10_000n > referencePriceUsd18 * ROBINHOOD_PRICE_AGREEMENT_BPS
}

const toNumber = (amount: bigint, decimals: number): number => Number(amount) / 10 ** decimals
const usd18ToNumber = (value: bigint): number => Number(value) / 1e18
const withHeadroom = (amount: bigint): bigint => (amount * (10_000n - ROBINHOOD_MAX_HEADROOM_BPS)) / 10_000n

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

type Settled<T> = T | null

async function settle<T>(p: Promise<T>): Promise<Settled<T>> {
  try {
    return await p
  } catch {
    return null
  }
}

function read<T>(client: RobinhoodReadClient, address: Address, abi: any, functionName: string, args: readonly unknown[] = []) {
  return settle(client.readContract({ address, abi, functionName, args } as any) as Promise<T>)
}

let cachedControllerOracle: Address | null = null
let cachedBlocksPerYear: bigint | null = null

/** The controller's oracle address, read once per process (it is admin-set and rarely moves). */
async function controllerOracle(client: RobinhoodReadClient): Promise<Address | null> {
  if (cachedControllerOracle) return cachedControllerOracle
  const addr = await read<Address>(client, ROBINHOOD_CONTROLLER, ROBINHOOD_CONTROLLER_ABI, "oracle")
  if (addr) cachedControllerOracle = addr
  return addr
}

async function blocksPerYear(client: RobinhoodReadClient): Promise<bigint> {
  if (cachedBlocksPerYear) return cachedBlocksPerYear
  const irm = await read<Address>(client, ROBINHOOD_LENDING_MARKETS[0].pToken, PTOKEN, "interestRateModel")
  const value = irm ? await read<bigint>(client, irm, IRM_ABI, "blocksPerYear") : null
  if (value && value > 0n) {
    cachedBlocksPerYear = value
    return value
  }
  return ROBINHOOD_FALLBACK_BLOCKS_PER_YEAR
}

/** Tests only. */
export function resetRobinhoodLendingCaches(): void {
  cachedControllerOracle = null
  cachedBlocksPerYear = null
}

async function readMarket(
  client: RobinhoodReadClient,
  market: RobinhoodLendingMarket,
  oracle: Address | null,
  perYear: bigint,
): Promise<RobinhoodLendingMarketState> {
  const p = market.pToken
  const [
    totalSupply,
    totalBorrows,
    cash,
    totalReserves,
    exchangeRate,
    supplyRate,
    borrowRate,
    vaultAccounted,
    vaultPaused,
    marketInfo,
    mintPaused,
    borrowPaused,
    borrowCap,
    controllerPrice,
    referencePrice,
    priceable,
  ] = await Promise.all([
    read<bigint>(client, p, PTOKEN, "totalSupply"),
    read<bigint>(client, p, PTOKEN, "totalBorrows"),
    read<bigint>(client, p, PTOKEN, "getCash"),
    read<bigint>(client, p, PTOKEN, "totalReserves"),
    read<bigint>(client, p, PTOKEN, "exchangeRateStored"),
    read<bigint>(client, p, PTOKEN, "supplyRatePerBlock"),
    read<bigint>(client, p, PTOKEN, "borrowRatePerBlock"),
    read<bigint>(client, p, PTOKEN, "vaultAccountedAssets"),
    read<boolean>(client, p, PTOKEN, "vaultPaused"),
    read<readonly [boolean, bigint, boolean]>(client, ROBINHOOD_CONTROLLER, ROBINHOOD_CONTROLLER_ABI, "markets", [p]),
    read<boolean>(client, ROBINHOOD_CONTROLLER, ROBINHOOD_CONTROLLER_ABI, "mintGuardianPaused", [p]),
    read<boolean>(client, ROBINHOOD_CONTROLLER, ROBINHOOD_CONTROLLER_ABI, "borrowGuardianPaused", [p]),
    read<bigint>(client, ROBINHOOD_CONTROLLER, ROBINHOOD_CONTROLLER_ABI, "borrowCaps", [p]),
    oracle ? read<bigint>(client, oracle, ROBINHOOD_LENDING_ORACLE_ABI, "getUnderlyingPrice", [p]) : Promise.resolve(null),
    // The margin oracle reverts with PriceUnavailable instead of answering 0.
    read<bigint>(client, ROBINHOOD_MARGIN.oracle, MARGIN_ORACLE, "getPrice", [market.underlying]),
    read<boolean>(client, ROBINHOOD_MARGIN.oracle, MARGIN_ORACLE, "marketPriceable", [p]),
  ])

  const totalSupplyUnderlying = totalSupply !== null && exchangeRate !== null ? (totalSupply * exchangeRate) / WAD : null
  const referencePriceUsd18 = referencePrice && referencePrice > 0n ? referencePrice : null
  const priceUsd = referencePriceUsd18 !== null ? usd18ToNumber(referencePriceUsd18) : null
  const tvlUsd =
    totalSupplyUnderlying !== null && referencePriceUsd18 !== null
      ? usd18ToNumber(usd18(totalSupplyUnderlying, referencePriceUsd18, market.decimals))
      : null

  let utilizationPct: number | null = null
  if (cash !== null && totalBorrows !== null) {
    const base = cash + totalBorrows - (totalReserves ?? 0n)
    utilizationPct = base > 0n ? (Number(totalBorrows) / Number(base)) * 100 : 0
  }

  let vaultShare: number | null = null
  if (vaultAccounted !== null && totalSupplyUnderlying !== null && totalSupplyUnderlying > 0n) {
    vaultShare = Math.min(1, Number(vaultAccounted) / Number(totalSupplyUnderlying))
  }

  return {
    market,
    totalSupplyUnderlying,
    totalBorrows,
    cash,
    totalReserves,
    exchangeRate,
    supplyRatePerBlock: supplyRate,
    borrowRatePerBlock: borrowRate,
    vaultShare,
    collateralFactor: marketInfo ? marketInfo[1] : null,
    isListed: marketInfo ? marketInfo[0] : null,
    mintPaused,
    borrowPaused,
    vaultPaused,
    borrowCap,
    controllerPrice,
    referencePriceUsd18,
    priceable,
    mispriced: isMispriced(controllerPrice, referencePriceUsd18, market.decimals),
    supplyApy: ratePerBlockToApy(supplyRate, perYear),
    borrowApy: ratePerBlockToApy(borrowRate, perYear),
    tvlUsd,
    utilizationPct,
    priceUsd,
  }
}

export async function readRobinhoodLendingMarkets(client: RobinhoodReadClient): Promise<RobinhoodLendingMarkets> {
  const [oracle, perYear, blockNumber] = await Promise.all([
    controllerOracle(client),
    blocksPerYear(client),
    settle(client.getBlockNumber()),
  ])
  const markets = await Promise.all(ROBINHOOD_LENDING_MARKETS.map((m) => readMarket(client, m, oracle, perYear)))
  return { markets, blocksPerYear: perYear, blockNumber, readAt: Date.now() }
}

export async function readRobinhoodLendingAccount(client: RobinhoodReadClient, user: Address): Promise<RobinhoodLendingAccount> {
  const positionsP = Promise.all(
    ROBINHOOD_LENDING_MARKETS.map(async (market) => {
      const [shares, borrowed, exchangeRate, walletBalance, allowance, isCollateral] = await Promise.all([
        read<bigint>(client, market.pToken, PTOKEN, "balanceOf", [user]),
        read<bigint>(client, market.pToken, PTOKEN, "borrowBalanceStored", [user]),
        read<bigint>(client, market.pToken, PTOKEN, "exchangeRateStored"),
        read<bigint>(client, market.underlying, ERC20, "balanceOf", [user]),
        read<bigint>(client, market.underlying, ERC20, "allowance", [user, market.pToken]),
        read<boolean>(client, ROBINHOOD_CONTROLLER, ROBINHOOD_CONTROLLER_ABI, "checkMembership", [user, market.pToken]),
      ])
      const supplied = shares !== null && exchangeRate !== null ? (shares * exchangeRate) / WAD : null
      return { market, shares, supplied, borrowed, walletBalance, allowance, isCollateral } satisfies RobinhoodLendingPosition
    }),
  )
  const [positions, liquidity, nativeBalanceWei, gasPriceWei] = await Promise.all([
    positionsP,
    read<readonly [bigint, bigint, bigint]>(client, ROBINHOOD_CONTROLLER, ROBINHOOD_CONTROLLER_ABI, "getAccountLiquidity", [user]),
    settle(client.getBalance({ address: user })),
    settle(client.getGasPrice()),
  ])
  const liquidityOk = liquidity !== null && liquidity[0] === 0n
  return {
    user,
    positions,
    contractLiquidity: liquidityOk ? liquidity![1] : null,
    contractShortfall: liquidityOk ? liquidity![2] : null,
    nativeBalanceWei,
    gasPriceWei,
    readAt: Date.now(),
  }
}

// ---------------------------------------------------------------------------
// Derived account view
// ---------------------------------------------------------------------------

export interface RobinhoodLendingSummary {
  /** Reference-priced USD18 totals. Null when any needed price is missing. */
  suppliedUsd18: bigint | null
  borrowedUsd18: bigint | null
  /** Collateral that actually covers debt: entered supply x collateral factor. */
  borrowLimitUsd18: bigint | null
  /** What the controller will still lend, in its own units (can exceed the real cover). */
  contractLiquidityUsd18: bigint | null
  /** 0..100+, debt over borrow limit. Null when there is no limit or it cannot be read. */
  limitUsedPct: number | null
  /** True when the controller reports a shortfall: the account can be liquidated. */
  liquidatable: boolean
  /** Some entered market has no usable price; limits are unknown. */
  pricesMissing: boolean
  /** Entered collateral the controller credits less than it is worth. */
  undercreditedMarkets: RobinhoodLendingMarketId[]
  netApy: number | null
}

export function summarizeRobinhoodLending(
  markets: RobinhoodLendingMarkets | null | undefined,
  account: RobinhoodLendingAccount | null | undefined,
): RobinhoodLendingSummary {
  const empty: RobinhoodLendingSummary = {
    suppliedUsd18: null,
    borrowedUsd18: null,
    borrowLimitUsd18: null,
    contractLiquidityUsd18: account?.contractLiquidity ?? null,
    limitUsedPct: null,
    liquidatable: (account?.contractShortfall ?? 0n) > 0n,
    pricesMissing: false,
    undercreditedMarkets: [],
    netApy: null,
  }
  if (!markets || !account) return empty

  let supplied = 0n
  let borrowed = 0n
  let limit = 0n
  let pricesMissing = false
  let ratesMissing = false
  let supplyYield = 0
  let borrowCost = 0
  const undercredited: RobinhoodLendingMarketId[] = []

  for (const pos of account.positions) {
    const state = markets.markets.find((m) => m.market.id === pos.market.id)
    const price = state?.referencePriceUsd18 ?? null
    const hasSupply = (pos.supplied ?? 0n) > 0n
    const hasDebt = (pos.borrowed ?? 0n) > 0n
    if (!hasSupply && !hasDebt) continue
    if (price === null || pos.supplied === null || pos.borrowed === null) {
      pricesMissing = true
      continue
    }
    const s = usd18(pos.supplied, price, pos.market.decimals)
    const b = usd18(pos.borrowed, price, pos.market.decimals)
    supplied += s
    borrowed += b
    // An unreadable rate on a held side makes the net unknown, not that side 0%.
    const supplyApy = hasSupply ? state?.supplyApy ?? null : 0
    const borrowApy = hasDebt ? state?.borrowApy ?? null : 0
    if (supplyApy === null || borrowApy === null) ratesMissing = true
    supplyYield += usd18ToNumber(s) * ((supplyApy ?? 0) / 100)
    borrowCost += usd18ToNumber(b) * ((borrowApy ?? 0) / 100)
    if (pos.isCollateral && hasSupply) {
      limit += (s * (state?.collateralFactor ?? 0n)) / WAD
      if (state?.mispriced && state.controllerPrice !== null) {
        const credited = controllerUsd18(pos.supplied, state.controllerPrice)
        if (credited < s) undercredited.push(pos.market.id)
      }
    }
  }

  const limitUsedPct = pricesMissing ? null : limit > 0n ? (Number(borrowed) / Number(limit)) * 100 : borrowed > 0n ? 100 : null
  const net = supplied > 0n && !ratesMissing ? ((supplyYield - borrowCost) / usd18ToNumber(supplied)) * 100 : null

  return {
    ...empty,
    suppliedUsd18: pricesMissing ? null : supplied,
    borrowedUsd18: pricesMissing ? null : borrowed,
    borrowLimitUsd18: pricesMissing ? null : limit,
    limitUsedPct,
    pricesMissing,
    undercreditedMarkets: undercredited,
    netApy: net,
  }
}

// ---------------------------------------------------------------------------
// Per-action limits
// ---------------------------------------------------------------------------

export type RobinhoodLendingAction = "supply" | "withdraw" | "borrow" | "repay"

export interface RobinhoodLendingLimit {
  /** Largest amount the form offers, underlying units. */
  max: bigint
  /** Why `max` is what it is, or why the action is unavailable. */
  reason: string | null
  /** The action cannot run at all right now. */
  blocked: boolean
  /** Which limit bound `max`, for the hint under the field. */
  boundBy: "wallet" | "supplied" | "debt" | "collateral" | "liquidity" | "cap" | "none"
}

const blockedLimit = (reason: string): RobinhoodLendingLimit => ({ max: 0n, reason, blocked: true, boundBy: "none" })

/**
 * The borrow and withdraw limits are the controller's: what the contract
 * would accept right now, less a small headroom for interest accruing
 * between the read and the signature, and never more than the market's cash
 * or borrow cap. Reference prices do not narrow them; on a mispriced market
 * that is the user's call.
 */
export function robinhoodLendingLimit(
  action: RobinhoodLendingAction,
  marketId: RobinhoodLendingMarketId,
  markets: RobinhoodLendingMarkets | null | undefined,
  account: RobinhoodLendingAccount | null | undefined,
): RobinhoodLendingLimit {
  const state = markets?.markets.find((m) => m.market.id === marketId)
  const pos = account?.positions.find((p) => p.market.id === marketId)
  if (!state || !pos) return blockedLimit("Market data is still loading.")
  const { decimals } = state.market

  if (action === "supply") {
    if (state.mintPaused) return blockedLimit("Supplying is paused in this market.")
    if (pos.walletBalance === null) return blockedLimit("The wallet balance could not be read.")
    if (pos.walletBalance === 0n) return { max: 0n, reason: `No ${state.market.symbol} in this wallet on Robinhood Chain.`, blocked: false, boundBy: "wallet" }
    return { max: pos.walletBalance, reason: null, blocked: false, boundBy: "wallet" }
  }

  if (action === "repay") {
    if (pos.borrowed === null) return blockedLimit("The debt could not be read.")
    if (pos.borrowed === 0n) return { max: 0n, reason: "Nothing to repay in this market.", blocked: false, boundBy: "debt" }
    if (pos.walletBalance === null) return blockedLimit("The wallet balance could not be read.")
    const max = pos.walletBalance < pos.borrowed ? pos.walletBalance : pos.borrowed
    return {
      max,
      reason: pos.walletBalance < pos.borrowed ? `The wallet holds less ${state.market.symbol} than the debt.` : null,
      blocked: false,
      boundBy: pos.walletBalance < pos.borrowed ? "wallet" : "debt",
    }
  }

  const summary = summarizeRobinhoodLending(markets, account)
  const price = state.referencePriceUsd18

  if (action === "withdraw") {
    if (pos.supplied === null) return blockedLimit("The supplied balance could not be read.")
    if (pos.supplied === 0n) return { max: 0n, reason: "Nothing supplied in this market.", blocked: false, boundBy: "supplied" }
    let max = pos.supplied
    let boundBy: RobinhoodLendingLimit["boundBy"] = "supplied"
    let reason: string | null = null
    const hasDebt = (summary.borrowedUsd18 ?? 0n) > 0n || account!.positions.some((p) => (p.borrowed ?? 0n) > 0n)

    // Collateral backing a loan can only leave as far as the controller allows.
    if (pos.isCollateral && hasDebt) {
      const cf = state.collateralFactor ?? 0n
      if (cf > 0n) {
        if (summary.contractLiquidityUsd18 === null || !state.controllerPrice || state.controllerPrice <= 0n) {
          return blockedLimit("The withdrawal limit could not be read from the market. Repaying still works.")
        }
        const contractMax = withHeadroom((((summary.contractLiquidityUsd18 * WAD) / cf) * WAD) / state.controllerPrice)
        if (contractMax < max) {
          max = contractMax
          boundBy = "collateral"
          reason = "The rest backs your loan. Repay first to withdraw more."
        }
      }
    }
    if (state.cash !== null && state.cash < max) {
      max = state.cash
      boundBy = "liquidity"
      reason = "The market cannot pay out more right now; the rest is lent out or in the paired vault."
    }
    return { max: max < 0n ? 0n : max, reason, blocked: false, boundBy }
  }

  // borrow
  if (state.borrowPaused) return blockedLimit("Borrowing is paused in this market.")
  if (summary.liquidatable) return blockedLimit("This account is below its collateral requirement. Repay or add collateral first.")
  if (summary.contractLiquidityUsd18 === null) return blockedLimit("The borrow limit could not be read from the market.")
  if (!state.controllerPrice || state.controllerPrice <= 0n || state.priceable === false) {
    return blockedLimit("Prices are unavailable right now. Borrowing waits for a fresh price; repaying still works.")
  }

  let max = withHeadroom((summary.contractLiquidityUsd18 * WAD) / state.controllerPrice)
  let boundBy: RobinhoodLendingLimit["boundBy"] = "collateral"
  let reason: string | null = null
  // A limit worth less than a tenth of a cent is rounding, not capacity: an
  // uncounted collateral still leaves a few wei of controller headroom.
  if (controllerUsd18(max, state.controllerPrice) < ROBINHOOD_DUST_USD18) max = 0n
  if (max === 0n) {
    reason = summary.undercreditedMarkets.length
      ? "Your collateral is not counted by the market right now, so it lends nothing against it."
      : "Supply an asset and turn it on as collateral to borrow."
  }

  if (state.cash !== null && state.cash < max) {
    max = state.cash
    boundBy = "liquidity"
    reason = "The market has no more to lend right now."
  }
  if (state.borrowCap !== null && state.borrowCap > 0n && state.totalBorrows !== null) {
    const room = state.borrowCap > state.totalBorrows ? state.borrowCap - state.totalBorrows : 0n
    if (room < max) {
      max = room
      boundBy = "cap"
      reason = room === 0n ? "The market's borrow cap is reached." : "Limited by the market's borrow cap."
    }
  }
  return { max: max < 0n ? 0n : max, reason, blocked: false, boundBy }
}

/**
 * Borrow-limit usage after a proposed action, for the capacity bar preview.
 * Null when there is nothing to preview or prices are missing.
 */
export function projectedLimitUsedPct(
  action: RobinhoodLendingAction,
  marketId: RobinhoodLendingMarketId,
  amount: bigint,
  markets: RobinhoodLendingMarkets | null | undefined,
  account: RobinhoodLendingAccount | null | undefined,
): number | null {
  if (amount <= 0n) return null
  const summary = summarizeRobinhoodLending(markets, account)
  const state = markets?.markets.find((m) => m.market.id === marketId)
  const pos = account?.positions.find((p) => p.market.id === marketId)
  if (!state?.referencePriceUsd18 || !pos || summary.borrowLimitUsd18 === null || summary.borrowedUsd18 === null) return null
  const value = usd18(amount, state.referencePriceUsd18, state.market.decimals)
  const cfValue = (value * (state.collateralFactor ?? 0n)) / WAD
  let limit = summary.borrowLimitUsd18
  let debt = summary.borrowedUsd18
  if (action === "borrow") debt += value
  if (action === "repay") debt = debt > value ? debt - value : 0n
  if (action === "supply" && pos.isCollateral) limit += cfValue
  if (action === "withdraw" && pos.isCollateral) limit = limit > cfValue ? limit - cfValue : 0n
  if (limit === 0n) return debt > 0n ? 100 : 0
  return (Number(debt) / Number(limit)) * 100
}

export const robinhoodAmountToNumber = toNumber
export const robinhoodUsd18ToNumber = usd18ToNumber

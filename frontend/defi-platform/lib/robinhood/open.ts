/**
 * Open quote for the Robinhood margin executor (guide 6B and 6C).
 *
 * `quoteRobinhoodOpen` reproduces the executor's own arithmetic from live
 * reads, all at one block:
 *
 *   marginUnderlying      = shares * exchangeRate / 1e18      (USDG6, both directions)
 *   quoteOpen             -> flashAmount, minPositionUnderlying
 *   marginValueUsd18      = riskEngine.pTokenValueUsd(pUSDG, shares)
 *   requestedNotionalUsd  = floor(marginValue * leverageX100 / 100)
 *   openingFeeUsd18       = ceil(requestedNotional * openFeeBps / 10000)
 *   openingFeeShares      = quoter.feePToken(pUSDG, openingFeeUsd18)
 *   debt for the cap      = flashAmount + flashFee, valued in USD18
 *
 * The result carries the finished OpenParams only when nothing blocks. The
 * quoted minimum goes in unchanged: the guide forbids an extra slippage
 * discount, the protocol floor would reject it anyway. Fees are never
 * assumed zero; an unreadable fee blocks the quote.
 */
import type { Address, Hex } from "viem"
import { ROBINHOOD_ABIS } from "@/app/abis/robinhood"
import { ROBINHOOD_MARGIN, ROBINHOOD_PAIRS, ROBINHOOD_TOKENS, type RobinhoodPair } from "@/config/robinhood"
import type { RobinhoodOpenParams } from "./calls"
import type { RobinhoodPairRisk, RobinhoodReader } from "./reads"
import { BPS, ceilDiv, underlyingFromShares } from "./units"

const A = ROBINHOOD_ABIS
const M = ROBINHOOD_MARGIN
const T = ROBINHOOD_TOKENS

export type RobinhoodDirection = "long" | "short"

export interface RobinhoodOpenQuoteInput {
  direction: RobinhoodDirection
  /** Raw pUSDG shares (8 dec) committed as margin, excluding the fee. */
  marginShares: bigint
  /** 500 = 5x gross. Must be above 100 and at most the pair's live maximum. */
  leverageX100: number
  /**
   * Headroom on the fee ceiling, in bps of the quoted fee, for accrual between
   * quote and inclusion. The user accepts the resulting ceiling, not the fee.
   */
  feeToleranceBps?: number
}

export type RobinhoodQuoteIssueCode =
  | "opens-paused"
  | "pair-disabled"
  | "leverage"
  | "price-unavailable"
  | "flash-paused"
  | "flash-capacity"
  | "quote-failed"
  | "zero-minimum"
  | "fee-unavailable"
  | "debt-cap"
  | "position-cap"
  | "insufficient-margin"
  | "amount"
  | "read-failed"

export interface RobinhoodQuoteIssue {
  code: RobinhoodQuoteIssueCode
  message: string
}

export interface RobinhoodOpenQuote {
  input: Required<RobinhoodOpenQuoteInput>
  pair: RobinhoodPair
  blockNumber: bigint
  quotedAt: number
  pairRisk: RobinhoodPairRisk | null
  openFeeBps: number | null
  /** pUSDG rate used for the margin conversion; `current` is a simulated accrual. */
  exchangeRate: bigint | null
  exchangeRateSource: "current" | "stored" | null
  marginUnderlying: bigint | null
  marginValueUsd18: bigint | null
  requestedNotionalUsd18: bigint | null
  openingFeeUsd18: bigint | null
  openingFeeShares: bigint | null
  /** The ceiling that goes on chain as `maxOpeningFeePToken`. */
  maxOpeningFeePToken: bigint | null
  /** USDG for long, NVDA for short. */
  flashAsset: Address
  flashAmount: bigint | null
  flashFee: bigint | null
  maxFlashLoan: bigint | null
  /** USD18 of flashAmount + flashFee, compared against the pair debt cap. */
  estimatedDebtUsd18: bigint | null
  /** NVDA for long, USDG for short (short includes the unswapped margin). */
  minPositionAsset: Address
  minPositionUnderlying: bigint | null
  /** Free vault shares when a user was given, else null. */
  freeShares: bigint | null
  /** margin + fee ceiling; what the vault must hold free. */
  requiredFreeShares: bigint | null
  issues: RobinhoodQuoteIssue[]
  /** Ready for simulation when no issue blocks. */
  params: RobinhoodOpenParams | null
}

export const ROBINHOOD_DEFAULT_FEE_TOLERANCE_BPS = 50

type Entry = { status: "success"; result: unknown } | { status: "failure"; error: unknown }

/** The contracts are heterogeneous; viem's generic inference over them hits TS2589. */
const multicall = (client: RobinhoodReader, blockNumber: bigint, contracts: unknown[]): Promise<Entry[]> =>
  (client.multicall as unknown as (args: unknown) => Promise<Entry[]>)({ blockNumber, allowFailure: true, contracts })
const ok = (e: Entry | undefined) => (e && e.status === "success" ? e.result : null)
const big = (v: unknown): bigint | null => (typeof v === "bigint" ? v : typeof v === "number" ? BigInt(v) : null)

function field(value: unknown, name: string, index: number): unknown {
  if (Array.isArray(value)) return value[index]
  if (value && typeof value === "object") return (value as Record<string, unknown>)[name]
  return undefined
}

function parsePairRisk(value: unknown): RobinhoodPairRisk | null {
  const enabled = field(value, "enabled", 0)
  if (typeof enabled !== "boolean") return null
  const n = (name: string, i: number) => Number(field(value, name, i) ?? 0)
  return {
    enabled,
    maxLeverageX100: n("maxLeverageX100", 1),
    initialMarginBps: n("initialMarginBps", 2),
    maintenanceMarginBps: n("maintenanceMarginBps", 3),
    liquidationTargetBps: n("liquidationTargetBps", 4),
    fullLiquidationHealthBps: n("fullLiquidationHealthBps", 5),
    maxLiquidationBps: n("maxLiquidationBps", 6),
    liquidationBonusBps: n("liquidationBonusBps", 7),
    maxSlippageBps: n("maxSlippageBps", 8),
    oracleDeviationBps: n("oracleDeviationBps", 9),
    maxPositionValueUsd18: BigInt((field(value, "maxPositionValueUsd", 10) as bigint) ?? 0n),
    maxDebtValueUsd18: BigInt((field(value, "maxDebtValueUsd", 11) as bigint) ?? 0n),
  }
}

/** Underlying of the debt market, i.e. what the flash loan lends. */
export const flashAssetFor = (direction: RobinhoodDirection): Address => (direction === "long" ? T.USDG : T.NVDA)
/** Underlying of the position market, the unit of `minPositionUnderlying`. */
export const positionAssetFor = (direction: RobinhoodDirection): Address => (direction === "long" ? T.NVDA : T.USDG)

/** Requested notional exactly as the executor rounds it. */
export const requestedNotionalUsd18 = (marginValueUsd18: bigint, leverageX100: number): bigint =>
  (marginValueUsd18 * BigInt(leverageX100)) / 100n

/** Opening fee in USD18, rounded up like the executor. */
export const openingFeeUsd18 = (notionalUsd18: bigint, openFeeBps: number): bigint =>
  ceilDiv(notionalUsd18 * BigInt(openFeeBps), BPS)

/** Fee ceiling with headroom; a nonzero fee always gets at least one share of room. */
export function feeCeiling(feeShares: bigint, toleranceBps: number): bigint {
  if (feeShares === 0n) return 0n
  const room = ceilDiv(feeShares * BigInt(toleranceBps), BPS)
  return feeShares + (room > 0n ? room : 1n)
}

/**
 * The largest margin value (USD18) whose frictionless 5x-style fill stays
 * inside both dollar caps: gross = m * L, debt = m * (L - 1). `headroomBps`
 * leaves room for flash fees, swap loss and share rounding. A sizing hint for
 * the form, not a guarantee; the simulation decides.
 */
export function maxMarginValueForCapsUsd18(risk: RobinhoodPairRisk, leverageX100: number, headroomBps = 200): bigint {
  if (leverageX100 <= 100) return 0n
  const L = BigInt(leverageX100)
  const byPosition = (risk.maxPositionValueUsd18 * 100n) / L
  const byDebt = (risk.maxDebtValueUsd18 * 100n) / (L - 100n)
  const bound = byPosition < byDebt ? byPosition : byDebt
  return (bound * (BPS - BigInt(headroomBps))) / BPS
}

export async function quoteRobinhoodOpen(
  client: RobinhoodReader,
  rawInput: RobinhoodOpenQuoteInput,
  user?: Address | null,
): Promise<RobinhoodOpenQuote> {
  const input: Required<RobinhoodOpenQuoteInput> = {
    feeToleranceBps: ROBINHOOD_DEFAULT_FEE_TOLERANCE_BPS,
    ...rawInput,
  }
  const pair = ROBINHOOD_PAIRS[input.direction]
  const flashAsset = flashAssetFor(input.direction)
  const positionAsset = positionAssetFor(input.direction)
  const issues: RobinhoodQuoteIssue[] = []
  const issue = (code: RobinhoodQuoteIssueCode, message: string) => issues.push({ code, message })

  const blockNumber = await client.getBlockNumber()

  const base: RobinhoodOpenQuote = {
    input,
    pair,
    blockNumber,
    quotedAt: Date.now(),
    pairRisk: null,
    openFeeBps: null,
    exchangeRate: null,
    exchangeRateSource: null,
    marginUnderlying: null,
    marginValueUsd18: null,
    requestedNotionalUsd18: null,
    openingFeeUsd18: null,
    openingFeeShares: null,
    maxOpeningFeePToken: null,
    flashAsset,
    flashAmount: null,
    flashFee: null,
    maxFlashLoan: null,
    estimatedDebtUsd18: null,
    minPositionAsset: positionAsset,
    minPositionUnderlying: null,
    freeShares: null,
    requiredFreeShares: null,
    issues,
    params: null,
  }

  if (input.marginShares <= 0n) {
    issue("amount", "Enter a margin amount greater than zero.")
    return base
  }
  if (!Number.isInteger(input.leverageX100) || input.leverageX100 <= 100) {
    issue("leverage", "Leverage must be above 1x.")
    return base
  }

  // Pass 1: gates, risk tuple, margin value, capacity, free margin.
  const pass1Contracts: any[] = [
    { address: M.config, abi: A.config, functionName: "opensPaused" },
    { address: M.config, abi: A.config, functionName: "openFeeBps" },
    { address: M.config, abi: A.config, functionName: "getPairRisk", args: [pair.marginPToken, pair.positionPToken, pair.debtPToken] },
    { address: M.riskEngine, abi: A.riskEngine, functionName: "pTokenValueUsd", args: [pair.marginPToken, input.marginShares] },
    { address: M.oracle, abi: A.oracle, functionName: "marketPriceable", args: [T.pUSDG] },
    { address: M.oracle, abi: A.oracle, functionName: "marketPriceable", args: [T.pNVDA] },
    { address: M.flashVault, abi: A.flashVault, functionName: "paused" },
    { address: M.flashVault, abi: A.flashVault, functionName: "maxFlashLoan", args: [flashAsset] },
    { address: pair.marginPToken, abi: A.pToken, functionName: "exchangeRateStored" },
  ]
  if (user) pass1Contracts.push({ address: M.marginVault, abi: A.marginVault, functionName: "freeBalance", args: [user, pair.marginPToken] })

  const [pass1, currentRate] = await Promise.all([
    multicall(client, blockNumber, pass1Contracts),
    // exchangeRateCurrent accrues, so it is simulated rather than read. The
    // executor accrues inside the open; the stored rate may lag slightly.
    client
      .simulateContract({ address: pair.marginPToken, abi: A.pToken as any, functionName: "exchangeRateCurrent" } as any)
      .then((r: any) => big(r?.result))
      .catch(() => null),
  ])

  const opensPaused = ok(pass1[0])
  const openFeeBps = ok(pass1[1])
  const pairRisk = parsePairRisk(ok(pass1[2]))
  const marginValueUsd18 = big(ok(pass1[3]))
  const priceableMargin = ok(pass1[4])
  const priceableNvda = ok(pass1[5])
  const flashPaused = ok(pass1[6])
  const maxFlashLoan = big(ok(pass1[7]))
  const storedRate = big(ok(pass1[8]))
  const freeShares = user ? big(ok(pass1[9])) : null

  base.pairRisk = pairRisk
  base.openFeeBps = typeof openFeeBps === "number" ? openFeeBps : typeof openFeeBps === "bigint" ? Number(openFeeBps) : null
  base.marginValueUsd18 = marginValueUsd18
  base.maxFlashLoan = maxFlashLoan
  base.freeShares = freeShares
  base.exchangeRate = currentRate ?? storedRate
  base.exchangeRateSource = currentRate !== null ? "current" : storedRate !== null ? "stored" : null

  if (opensPaused === true) issue("opens-paused", "Opening new positions is paused right now.")
  else if (opensPaused === null) issue("read-failed", "Could not confirm that opens are enabled.")

  if (!pairRisk) issue("read-failed", "The risk limits for this direction could not be read.")
  else if (!pairRisk.enabled) issue("pair-disabled", `${input.direction === "long" ? "Long" : "Short"} positions are disabled right now.`)
  else if (input.leverageX100 > pairRisk.maxLeverageX100) {
    issue("leverage", `Leverage is limited to ${(pairRisk.maxLeverageX100 / 100).toFixed(2)}x.`)
  }

  if (priceableMargin !== true || priceableNvda !== true || marginValueUsd18 === null || marginValueUsd18 === 0n) {
    issue("price-unavailable", "Prices are unavailable right now, so a position cannot be opened.")
  }
  if (flashPaused === true) issue("flash-paused", "Opening liquidity is paused right now.")
  if (base.openFeeBps === null) issue("fee-unavailable", "The opening fee could not be read.")
  if (base.exchangeRate === null) issue("read-failed", "The margin exchange rate could not be read.")

  if (issues.length) return base

  // Pass 2: quoter output and the fee in shares.
  const marginUnderlying = underlyingFromShares(input.marginShares, base.exchangeRate!)
  const notional = requestedNotionalUsd18(marginValueUsd18!, input.leverageX100)
  const feeUsd = openingFeeUsd18(notional, base.openFeeBps!)
  base.marginUnderlying = marginUnderlying
  base.requestedNotionalUsd18 = notional
  base.openingFeeUsd18 = feeUsd

  const pass2 = await multicall(client, blockNumber, [
      {
        address: M.quoter,
        abi: A.quoter,
        functionName: "quoteOpen",
        args: [pair.marginPToken, pair.positionPToken, pair.debtPToken, marginUnderlying, input.leverageX100],
      },
      { address: M.quoter, abi: A.quoter, functionName: "feePToken", args: [pair.marginPToken, feeUsd] },
    ])

  const quoted = ok(pass2[0])
  const flashAmount = big(field(quoted, "flashAmount", 0))
  const minPosition = big(field(quoted, "minPositionUnderlying", 1))
  const feeShares = feeUsd === 0n ? 0n : big(ok(pass2[1]))
  base.flashAmount = flashAmount
  base.minPositionUnderlying = minPosition
  base.openingFeeShares = feeShares

  if (flashAmount === null || minPosition === null) {
    issue("quote-failed", "The quote could not be computed. Prices may be unavailable.")
    return base
  }
  if (minPosition === 0n) issue("zero-minimum", "The quote returned a zero minimum output. Adjust the size.")
  if (feeShares === null) {
    issue("fee-unavailable", "The opening fee could not be converted into margin shares.")
    return base
  }
  base.maxOpeningFeePToken = feeCeiling(feeShares, input.feeToleranceBps)
  base.requiredFreeShares = input.marginShares + base.maxOpeningFeePToken

  // Pass 3: flash fee and the debt value the cap is checked against.
  const flashFeeEntry = await multicall(client, blockNumber, [{ address: M.flashVault, abi: A.flashVault, functionName: "flashFee", args: [flashAsset, flashAmount] }])
  const flashFee = big(ok(flashFeeEntry[0]))
  base.flashFee = flashFee
  if (flashFee !== null) {
    const debtEntry = await multicall(client, blockNumber, [{ address: M.quoter, abi: A.quoter, functionName: "underlyingValueUsd", args: [flashAsset, flashAmount + flashFee] }])
    base.estimatedDebtUsd18 = big(ok(debtEntry[0]))
  }

  if (maxFlashLoan !== null && flashAmount > maxFlashLoan) {
    issue("flash-capacity", "Not enough opening liquidity for this size. Reduce the size.")
  }
  if (pairRisk && base.estimatedDebtUsd18 !== null && base.estimatedDebtUsd18 > pairRisk.maxDebtValueUsd18) {
    issue("debt-cap", "This size exceeds the debt limit per position. Reduce the size.")
  }
  if (pairRisk && notional > pairRisk.maxPositionValueUsd18) {
    issue("position-cap", "This size exceeds the position limit. Reduce the size.")
  }
  if (user && freeShares === null) issue("read-failed", "The free margin balance could not be read.")
  else if (freeShares !== null && freeShares < base.requiredFreeShares) {
    issue("insufficient-margin", "Not enough free margin for this amount plus the opening fee.")
  }

  if (issues.length === 0) {
    base.params = {
      marginPToken: pair.marginPToken,
      positionPToken: pair.positionPToken,
      debtPToken: pair.debtPToken,
      marginPTokenAmount: input.marginShares,
      leverageX100: input.leverageX100,
      maxOpeningFeePToken: base.maxOpeningFeePToken,
      minPositionUnderlying: minPosition,
      side: pair.side,
      swapData: "0x" as Hex,
    }
  }
  return base
}

/**
 * Unit helpers for the Robinhood NVDA/USDG margin product.
 *
 * Every conversion here mirrors section 3 of docs/robinhood-margin/GUIDE.md.
 * Raw amounts stay bigint through every calculation; only the `format*`
 * helpers hand out strings for display. Nothing in this file talks to the
 * chain.
 */
import { formatUnits } from "viem"
import { ROBINHOOD_DECIMALS } from "@/config/robinhood"

export const WAD = 10n ** 18n
export const BPS = 10_000n
export const UINT256_MAX = 2n ** 256n - 1n

export const ceilDiv = (a: bigint, b: bigint): bigint => (a + b - 1n) / b

/**
 * Raw pToken shares to raw underlying units. The exchange-rate mantissa
 * already folds the 8-decimal share scale against the underlying's own
 * decimals, so this is the whole conversion.
 */
export const underlyingFromShares = (shares: bigint, exchangeRate: bigint): bigint =>
  (shares * exchangeRate) / WAD

/** Raw underlying units to raw pToken shares, rounded up so a redeem never asks for less than it needs. */
export const sharesFromUnderlying = (underlying: bigint, exchangeRate: bigint): bigint =>
  exchangeRate === 0n ? 0n : ceilDiv(underlying * WAD, exchangeRate)

/** Raw underlying units to USD with 18 decimals, given an 18-decimal oracle price. */
export const valueUsd18 = (amount: bigint, priceUsd18: bigint, decimals: number): bigint =>
  (amount * priceUsd18) / 10n ** BigInt(decimals)

/**
 * Health as a plain number, or null where the engine returned a sentinel.
 * The risk engine answers `uint256.max` for zero-denominator cases (no debt,
 * no maintenance requirement); that is "no risk", not an enormous number.
 */
export function healthFromBps(healthFactorBps: bigint | undefined | null): number | null {
  if (healthFactorBps === undefined || healthFactorBps === null) return null
  if (healthFactorBps >= UINT256_MAX / 2n) return null
  return Number(healthFactorBps) / Number(BPS)
}

/** Leverage x100 to a plain multiple, or null for the same sentinel. */
export function leverageFromX100(leverageX100: bigint | number | undefined | null): number | null {
  if (leverageX100 === undefined || leverageX100 === null) return null
  const raw = typeof leverageX100 === "number" ? BigInt(leverageX100) : leverageX100
  if (raw >= UINT256_MAX / 2n) return null
  return Number(raw) / 100
}

export const bpsToFraction = (bps: bigint | number): number => Number(bps) / Number(BPS)

/** USD with 18 decimals to a display string. Not for math. */
export const formatUsd18 = (value: bigint, digits = 2): string =>
  Number(formatUnits(value, ROBINHOOD_DECIMALS.usd18)).toFixed(digits)

/** Signed USD18 (risk-engine equity) to a display string. Not for math. */
export const formatSignedUsd18 = (value: bigint, digits = 2): string => {
  const sign = value < 0n ? "-" : ""
  return `${sign}${formatUsd18(value < 0n ? -value : value, digits)}`
}

export const formatUsdg = (raw: bigint): string => formatUnits(raw, ROBINHOOD_DECIMALS.USDG)
export const formatNvda = (raw: bigint): string => formatUnits(raw, ROBINHOOD_DECIMALS.NVDA)
export const formatPToken = (raw: bigint): string => formatUnits(raw, ROBINHOOD_DECIMALS.pToken)

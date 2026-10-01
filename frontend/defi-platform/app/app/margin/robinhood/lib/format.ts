/**
 * Display and input helpers for the Robinhood margin page.
 *
 * Math stays bigint (lib/robinhood/units.ts); these only turn raw values into
 * strings and user input into raw values. Amounts on this product are cents
 * (caps of $2 gross, $1 debt), so small values keep four decimals instead of
 * rounding a $0.0009 fee to $0.00.
 */
import { formatUnits, parseUnits } from "viem"
import { ROBINHOOD_DECIMALS } from "@/config/robinhood"
import { UINT256_MAX, WAD, underlyingFromShares } from "@/lib/robinhood/units"

export function formatUsdNumber(value: number): string {
  if (!Number.isFinite(value)) return "n/a"
  const abs = Math.abs(value)
  const digits = abs === 0 || abs >= 1 ? 2 : 4
  const sign = value < 0 ? "-" : ""
  return `${sign}$${abs.toFixed(digits)}`
}

/** USD with 18 decimals, signed allowed. */
export function formatUsd18Display(value: bigint | null | undefined): string {
  if (value === null || value === undefined) return "n/a"
  return formatUsdNumber(Number(formatUnits(value, ROBINHOOD_DECIMALS.usd18)))
}

/** Raw USDG6 as "$1.2345"-style dollars; USDG is a dollar token. */
export function formatUsdg6Display(raw: bigint | null | undefined): string {
  if (raw === null || raw === undefined) return "n/a"
  return formatUsdNumber(Number(formatUnits(raw, ROBINHOOD_DECIMALS.USDG)))
}

/**
 * Wei as ETH, the gas token. Fees here are fractions of a cent, so the value
 * keeps enough places to stay a number instead of collapsing to "0 ETH".
 */
export function formatEthDisplay(wei: bigint | null | undefined): string {
  if (wei === null || wei === undefined) return "n/a"
  if (wei === 0n) return "0 ETH"
  const n = Number(formatUnits(wei, 18))
  if (n < 0.000001) return "<0.000001 ETH"
  const digits = n >= 1 ? 4 : 6
  return `${n.toFixed(digits).replace(/\.?0+$/, "")} ETH`
}

/** Raw NVDA18 as a share count, up to six decimals, trailing zeros trimmed. */
export function formatNvda18Display(raw: bigint | null | undefined): string {
  if (raw === null || raw === undefined) return "n/a"
  const n = Number(formatUnits(raw, ROBINHOOD_DECIMALS.NVDA))
  return `${n.toFixed(6).replace(/\.?0+$/, "")} NVDA`
}

/** pUSDG shares shown as the USDG they redeem for at `exchangeRate`. */
export function formatSharesAsUsdg(shares: bigint | null | undefined, exchangeRate: bigint | null | undefined): string {
  if (shares === null || shares === undefined || !exchangeRate) return "n/a"
  return formatUsdg6Display(underlyingFromShares(shares, exchangeRate))
}

/** "3.00x", or null-safe "n/a" for the engine's uint256.max sentinel. */
export function formatLeverage(x: number | null | undefined): string {
  return x === null || x === undefined ? "n/a" : `${x.toFixed(2)}x`
}

/**
 * User-typed USDG to raw USDG6. Null for anything that is not a plain positive
 * decimal with at most six places; the form shows nothing rather than a guess.
 */
export function parseUsdgInput(text: string): bigint | null {
  const t = text.trim().replace(",", ".")
  if (!/^\d*\.?\d*$/.test(t) || t === "" || t === ".") return null
  const [, frac = ""] = t.split(".")
  if (frac.length > ROBINHOOD_DECIMALS.USDG) return null
  try {
    const v = parseUnits(t, ROBINHOOD_DECIMALS.USDG)
    return v > 0n ? v : null
  } catch {
    return null
  }
}

/** Raw USDG6 to pUSDG shares, rounded down so the form never asks for more than the vault holds. */
export function sharesForUsdg6(usdg6: bigint, exchangeRate: bigint): bigint {
  if (exchangeRate <= 0n) return 0n
  return (usdg6 * WAD) / exchangeRate
}

/** USD18 to pUSDG shares at a USDG price (USD18) and exchange rate, rounded down. */
export function sharesForUsd18(usd18: bigint, usdgPriceUsd18: bigint, exchangeRate: bigint): bigint {
  if (usdgPriceUsd18 <= 0n || exchangeRate <= 0n) return 0n
  const usdg6 = (usd18 * 10n ** BigInt(ROBINHOOD_DECIMALS.USDG)) / usdgPriceUsd18
  return sharesForUsdg6(usdg6, exchangeRate)
}

/**
 * The most margin (shares) that leaves room for the opening fee ceiling out of
 * `freeShares`. The fee is a fraction of notional: margin * L/100 * bps/1e4,
 * plus the quote's tolerance and its one-share minimum. The quote remains the
 * authority; this only keeps "Max" from proposing an amount it would reject.
 */
export function maxMarginSharesForFee(
  freeShares: bigint,
  openFeeBps: number,
  leverageX100: number,
  toleranceBps: number,
): bigint {
  if (freeShares <= 0n) return 0n
  if (openFeeBps <= 0) return freeShares
  const denom = 10n ** 10n + BigInt(leverageX100) * BigInt(openFeeBps) * (10_000n + BigInt(toleranceBps))
  const room = freeShares - 2n
  return room > 0n ? (room * 10n ** 10n) / denom : 0n
}

/** Raw bigint as an input string, for "Max" buttons. */
export function usdg6ToInput(raw: bigint): string {
  return formatUnits(raw, ROBINHOOD_DECIMALS.USDG)
}

export const isSentinel = (v: bigint) => v >= UINT256_MAX / 2n

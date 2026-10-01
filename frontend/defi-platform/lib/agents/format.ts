/**
 * Shared display formatters for agent chat surfaces.
 *
 * Convention (fintech, not crypto): consumer-banking USD vocabulary, rounded
 * to the fewest meaningful digits. Sub-dollar values keep 2 decimals so a
 * $0.42 fee still reads correctly; everything ≥ $1 drops fractional cents
 * by default (use `formatUsdPrecise` when cents matter).
 */

const NULLISH = '—'

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n)
}

/**
 * Standard USD format for chat amounts.
 *
 *   formatUsd(1234.56)  → "$1,235"
 *   formatUsd(99.87)    → "$99.87"
 *   formatUsd(4.917)    → "$4.92"
 *   formatUsd(0.4232)   → "$0.42"
 *   formatUsd(0)        → "$0"
 *   formatUsd(null)     → "—"
 *
 * Rounding threshold is $100: below that we keep cents, above we round to
 * integers (banking-UX compression for big balances). Earlier the threshold
 * was $1, which caused a reported bug — a $4.92 idle-wallet total rendered
 * as "$5", misleading users into asking for $4 deposits they couldn't fund.
 */
export function formatUsd(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) return NULLISH
  const sign = value < 0 ? '-' : ''
  const abs = Math.abs(value)
  if (abs === 0) return '$0'
  if (abs < 100) {
    return `${sign}$${abs.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`
  }
  return `${sign}$${Math.round(abs).toLocaleString()}`
}

/**
 * Cents-precise USD format. Use when the user is signing for an exact amount
 * (action-button confirmation, fee breakdown).
 *
 *   formatUsdPrecise(12.34)   → "$12.34"
 *   formatUsdPrecise(1234.56) → "$1,234.56"
 */
export function formatUsdPrecise(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) return NULLISH
  const sign = value < 0 ? '-' : ''
  const abs = Math.abs(value)
  return `${sign}$${abs.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

/**
 * Compact USD format for heroes and totals.
 *
 *   formatUsdCompact(1_234_567) → "$1.2M"
 *   formatUsdCompact(12_345)    → "$12K"
 *   formatUsdCompact(1_234)     → "$1.2K"
 *   formatUsdCompact(123)       → "$123"
 *   formatUsdCompact(0.42)      → "$0.42"
 */
export function formatUsdCompact(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) return NULLISH
  const sign = value < 0 ? '-' : ''
  const abs = Math.abs(value)
  if (abs === 0) return '$0'
  if (abs < 1) return `${sign}$${abs.toFixed(2)}`
  if (abs < 1_000) return `${sign}$${Math.round(abs)}`
  if (abs < 10_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`
  if (abs < 1_000_000) return `${sign}$${Math.round(abs / 1_000)}K`
  if (abs < 10_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`
  return `${sign}$${Math.round(abs / 1_000_000)}M`
}

/**
 * Annual rate / APY display. One decimal place is enough resolution for
 * consumer framing ("8.5% per year").
 *
 *   formatRate(8.523) → "8.5%"
 *   formatRate(0)     → "0%"
 *   formatRate(null)  → "—"
 */
export function formatRate(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) return NULLISH
  if (value === 0) return '0%'
  return `${value.toFixed(1)}%`
}

/**
 * Signed delta for change indicators. Always carries a sign so the direction
 * is unambiguous when paired with an arrow icon.
 *
 *   formatDelta(1.2)  → "+1.2%"
 *   formatDelta(-3.5) → "-3.5%"
 *   formatDelta(0)    → "0%"
 */
export function formatDelta(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) return NULLISH
  if (value === 0) return '0%'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(1)}%`
}

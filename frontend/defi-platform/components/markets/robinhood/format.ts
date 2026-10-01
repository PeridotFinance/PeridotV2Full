/**
 * Display formatting for the Robinhood lending table. Amounts stay bigint
 * until the last step; these helpers only turn a finished value into text.
 */
import { fromBaseUnits } from '@/lib/token-units'

export function fmtUsd(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '--'
  if (n === 0) return '$0.00'
  if (n < 0.01) return '<$0.01'
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 10_000) return `$${(n / 1_000).toFixed(1)}K`
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function fmtPrice(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n) || n <= 0) return '--'
  if (n >= 1) return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  return `$${n.toFixed(4)}`
}

export function fmtPct(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '--'
  if (n > 0 && n < 0.005) return '<0.01%'
  return `${n.toFixed(digits)}%`
}

/**
 * A token amount with precision that fits the asset: dollars to cents,
 * a $200 stock to six places so a small position does not read as zero.
 */
export function fmtAmount(raw: bigint | null | undefined, decimals: number, symbol?: string): string {
  if (raw === null || raw === undefined) return '--'
  const n = Number(fromBaseUnits(raw, decimals))
  const places = decimals <= 6 ? 2 : 6
  let body: string
  if (raw === 0n) body = '0'
  else if (n > 0 && n < 10 ** -places) body = `<${(10 ** -places).toFixed(places)}`
  else body = n.toLocaleString('en-US', { maximumFractionDigits: places })
  return symbol ? `${body} ${symbol}` : body
}

/**
 * Part of a boosted market works in the paired liquidity vault. Its result
 * reaches suppliers through the share price, not the supply rate, and it is
 * a result rather than a rate: it can be negative. So it gets a hint next to
 * the APY instead of a number in it. Below half a percent the market is
 * treated as not boosted, same as the panel chip.
 */
export function isBoostedShare(vaultShare: number | null | undefined): vaultShare is number {
  return vaultShare !== null && vaultShare !== undefined && Number.isFinite(vaultShare) && vaultShare > 0.005
}

export function boostedHint(vaultShare: number, vaultPaused: boolean | null | undefined): string {
  const pct = Math.round(vaultShare * 100)
  const base =
    `About ${pct}% of this market works in Peridot's paired liquidity vault. ` +
    'What the vault earns raises the value of your deposit directly, so it is not part of the supply APY shown here. ' +
    'Vault results are not guaranteed and can also be negative.'
  return vaultPaused ? `${base} The vault is paused right now, so no new funds go into it.` : base
}

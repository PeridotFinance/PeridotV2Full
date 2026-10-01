/**
 * Utility functions for formatting large numbers in a user-friendly way
 */

/**
 * Decimals needed to show `digits` significant figures of a sub-cent amount.
 * 0.0042 → 4, 0.00007 → 6. Capped so the string stays readable.
 */
const subCentDecimals = (absValue: number, digits = 2): number => {
  const magnitude = Math.floor(Math.log10(absValue)) // -3 for 0.004
  return Math.min(8, Math.max(2, digits - 1 - magnitude))
}

export const formatCurrency = (value: number, hideBalances = false): string => {
  if (hideBalances) return '••••••'
  if (value === undefined || value === null || isNaN(value)) return '$0.00'

  const numValue = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(numValue)) return '$0.00'

  // Handle large numbers with appropriate formatting
  const absValue = Math.abs(numValue)
  if (absValue >= 1e9) {
    return `$${(numValue / 1e9).toFixed(1)}B`
  } else if (absValue >= 1e6) {
    return `$${(numValue / 1e6).toFixed(1)}M`
  } else if (absValue >= 1e3) {
    return `$${(numValue / 1e3).toFixed(1)}K`
  } else if (absValue > 0 && absValue < 0.01) {
    // Interest on a small deposit is genuinely sub-cent for weeks. Rounding it
    // to "$0" is what users read as "the app shows nothing" — extend the
    // precision instead so a real, tiny number stays visible.
    const decimals = subCentDecimals(absValue)
    return `$${numValue.toFixed(decimals)}`
  } else {
    return `$${numValue.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`
  }
}

/**
 * Currency without the K/M/B abbreviation — for detail views where the exact
 * figure matters more than compactness (the portfolio tabs). Shares the
 * sub-cent precision rule with `formatCurrency`: four tabs each carried their
 * own copy of this that rounded a real 0.004 down to "$0".
 */
export const formatCurrencyPrecise = (value: number, hideBalances = false): string => {
  if (hideBalances) return '••••••'
  if (value === undefined || value === null || isNaN(value)) return '$0.00'

  const numValue = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(numValue)) return '$0.00'

  const absValue = Math.abs(numValue)
  if (absValue > 0 && absValue < 0.01) {
    return `$${numValue.toFixed(subCentDecimals(absValue))}`
  }
  return `$${numValue.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export const formatPercent = (value: number, hideBalances = false): string => {
  if (hideBalances) return '•••'
  if (value === undefined || value === null || isNaN(value)) return '0.00%'
  
  const numValue = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(numValue)) return '0.00%'

  const abs = Math.abs(numValue)
  // Same reasoning as formatCurrency: a real 0.004% is not 0.00%.
  const decimals = abs > 0 && abs < 0.01 ? subCentDecimals(abs) : 2
  return `${numValue > 0 ? '+' : ''}${numValue.toFixed(decimals)}%`
}

export const formatNumber = (value: number, hideBalances = false): string => {
  if (hideBalances) return '••••••'
  if (value === undefined || value === null || isNaN(value)) return '0'
  
  const numValue = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(numValue)) return '0'
  
  // Handle large numbers with appropriate formatting
  const absValue = Math.abs(numValue)
  if (absValue >= 1e9) {
    return `${(numValue / 1e9).toFixed(1)}B`
  } else if (absValue >= 1e6) {
    return `${(numValue / 1e6).toFixed(1)}M`
  } else if (absValue >= 1e3) {
    return `${(numValue / 1e3).toFixed(1)}K`
  } else {
    return numValue.toLocaleString(undefined, { maximumFractionDigits: 2 })
  }
}

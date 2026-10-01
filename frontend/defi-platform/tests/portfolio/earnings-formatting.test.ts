import { describe, it, expect } from 'vitest'
import { formatCurrency, formatPercent } from '@/lib/number-formatting'
import { availablePeriods, defaultPeriodId } from '@/components/portfolio/chart-periods'

describe('formatCurrency — sub-cent amounts', () => {
  it('keeps a real sub-cent amount visible instead of collapsing it to $0', () => {
    // The reported bug: a few days of interest on a small deposit rounded away.
    expect(formatCurrency(0.0042)).toBe('$0.0042')
    expect(formatCurrency(0.00007)).toBe('$0.000070')
  })

  it('renders exact zero as $0.00, not as extended precision', () => {
    expect(formatCurrency(0)).toBe('$0.00')
  })

  it('keeps two decimals for ordinary amounts', () => {
    expect(formatCurrency(5)).toBe('$5.00')
    expect(formatCurrency(46.9)).toBe('$46.90')
  })

  it('leaves the large-number abbreviations alone', () => {
    expect(formatCurrency(1500)).toBe('$1.5K')
    expect(formatCurrency(2_500_000)).toBe('$2.5M')
  })

  it('handles negatives below a cent', () => {
    expect(formatCurrency(-0.0042)).toBe('$-0.0042')
  })

  it('still masks when balances are hidden', () => {
    expect(formatCurrency(0.0042, true)).toBe('••••••')
  })
})

describe('formatPercent — sub-cent percentages', () => {
  it('does not flatten a real 0.004% to 0.00%', () => {
    expect(formatPercent(0.004)).toBe('+0.0040%')
  })

  it('keeps two decimals otherwise', () => {
    expect(formatPercent(4.82)).toBe('+4.82%')
    expect(formatPercent(-1.5)).toBe('-1.50%')
  })
})

describe('availablePeriods', () => {
  it('offers only windows the history actually covers', () => {
    // The API returns 30 days; "1 Year" used to render the same 30 points.
    const periods = availablePeriods(30)
    expect(periods.map((p) => p.id)).toEqual(['7d', '30d'])
  })

  it('labels a short history with its real length', () => {
    expect(availablePeriods(4)).toEqual([{ id: 'all', label: '4 Days', days: 4 }])
  })

  it('adds an explicit all-time bucket when history exceeds the named ones', () => {
    const periods = availablePeriods(45)
    expect(periods.map((p) => p.id)).toEqual(['7d', '30d', 'all'])
    expect(periods[2].label).toBe('All (45d)')
    expect(periods[2].days).toBe(45)
  })

  it('returns nothing for an empty history', () => {
    expect(availablePeriods(0)).toEqual([])
  })
})

describe('defaultPeriodId', () => {
  it('prefers the 30-day window when available', () => {
    expect(defaultPeriodId(availablePeriods(45))).toBe('30d')
  })

  it('falls back to the widest window we have', () => {
    expect(defaultPeriodId(availablePeriods(4))).toBe('all')
  })
})

/**
 * The portfolio charts used to offer 7d / 30d / 90d / 1y / All unconditionally,
 * while `/api/user/earnings` returns a fixed 30-day window. `slice(-365)` on a
 * 30-point array silently returns the same 30 points, so "1 Year" and "All
 * Time" drew an identical curve to "30 Days" — the chart looked broken because
 * it was claiming a range it never had.
 *
 * Offer only the windows the data actually covers, and label the widest one
 * with its real length.
 */
export interface ChartPeriod {
  id: string
  label: string
  days: number
}

const CANDIDATES: Array<{ id: string; label: string; days: number }> = [
  { id: '7d', label: '7 Days', days: 7 },
  { id: '30d', label: '30 Days', days: 30 },
  { id: '90d', label: '90 Days', days: 90 },
  { id: '1y', label: '1 Year', days: 365 },
]

export function availablePeriods(historyLength: number): ChartPeriod[] {
  if (historyLength <= 0) return []
  // A window counts as available once we hold its full span. The widest one is
  // always present so there is something to select, labelled with the real
  // number of days when it falls short of a named bucket.
  const covered = CANDIDATES.filter((c) => c.days <= historyLength)
  if (covered.length === 0) {
    return [{ id: 'all', label: `${historyLength} Days`, days: historyLength }]
  }
  const widest = covered[covered.length - 1]
  if (historyLength > widest.days) {
    covered.push({ id: 'all', label: `All (${historyLength}d)`, days: historyLength })
  }
  return covered
}

/** The default selection: the widest window we can honestly show, capped at 30d. */
export function defaultPeriodId(periods: ChartPeriod[]): string {
  if (periods.length === 0) return 'all'
  const preferred = periods.find((p) => p.id === '30d')
  return preferred ? preferred.id : periods[periods.length - 1].id
}

/**
 * Per-market split of a user's accrued supply interest.
 *
 * `/api/user/earnings` used to return a fixed 70/15/10/5 fan-out of the single
 * lifetime figure into "Supply Interest", "Liquidation Rewards", "Trading
 * Fees" and "Other Rewards" — three of which Peridot suppliers never receive,
 * and all four identical in shape for every wallet. This derives the split
 * from the user's own per-token earnings instead.
 */

// Cycled by index so a wallet with more markets than colours still renders
// distinctly enough.
export const BREAKDOWN_COLORS = ['#10B981', '#3B82F6', '#F59E0B', '#8B5CF6', '#EC4899', '#14B8A6']

export interface EarningsBreakdownEntry {
  source: string
  amount: number
  percentage: number
  color: string
}

export function buildEarningsBreakdown(
  perToken: Array<{ tokenSymbol: string; earnings: number }>,
  total: number,
): EarningsBreakdownEntry[] {
  if (!(total > 0)) return []
  return (perToken || [])
    .filter((entry) => entry && entry.earnings > 0)
    .sort((a, b) => b.earnings - a.earnings)
    .map((entry, i) => ({
      source: `${entry.tokenSymbol} Supply Interest`,
      amount: entry.earnings,
      percentage: (entry.earnings / total) * 100,
      color: BREAKDOWN_COLORS[i % BREAKDOWN_COLORS.length],
    }))
}

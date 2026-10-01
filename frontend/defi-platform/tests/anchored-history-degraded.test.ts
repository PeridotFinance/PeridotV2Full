import { describe, it, expect, vi, beforeEach } from 'vitest'

// When the live on-chain read times out, the anchored-history helper used to
// return `history: []` — the client then drew a flat 24h line and every real
// stored day was invisible. These tests pin the fallback: stored per-day
// snapshots are served on their own, still flagged `degraded`.

const MS_PER_DAY = 86_400_000

/** Rows the mocked snapshot SELECT returns. Set per test. */
let snapshotRows: Array<{
  day: string
  portfolio_usd: string
  supplied_usd: string
  borrowed_usd: string
}> = []

vi.mock('@/lib/database', () => {
  // `sql` is used both as a tagged template and as an identifier helper
  // (`sql(tableName)`), so the mock has to accept both call shapes.
  const sql: any = (strings: any, ..._values: any[]) => {
    if (!Array.isArray(strings)) return { __ident: String(strings) }
    const text = strings.join('?')
    if (text.includes('portfolio_usd') && text.includes('SELECT')) {
      return Promise.resolve(snapshotRows)
    }
    // INSERT … ON CONFLICT (snapshot upsert) and every other query.
    return Promise.resolve([])
  }
  return { sql }
})

vi.mock('@/lib/agents/portfolio-reader', () => ({
  readMultiChainPortfolio: vi.fn(),
  readStellarPortfolio: vi.fn(),
}))

import { buildAnchoredPortfolioHistory } from '@/lib/agents/anchored-history'
import { readMultiChainPortfolio } from '@/lib/agents/portfolio-reader'

const readPortfolio = readMultiChainPortfolio as unknown as ReturnType<typeof vi.fn>

const TABLES = {
  portfolioValueSnapshots: 'portfolio_value_snapshots',
  apyTimeSeries: 'apy_time_series',
  verifiedTransactions: 'verified_transactions',
} as any

const ADDRESS = '0x1111111111111111111111111111111111111111'

function dayKey(offsetDays: number): string {
  const d = new Date(Date.now() - offsetDays * MS_PER_DAY)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

function snapshot(offsetDays: number, net: number) {
  return {
    day: dayKey(offsetDays),
    portfolio_usd: String(net),
    supplied_usd: String(net),
    borrowed_usd: '0',
  }
}

beforeEach(() => {
  readPortfolio.mockReset()
  snapshotRows = []
})

describe('buildAnchoredPortfolioHistory — degraded (live read failed)', () => {
  it('serves stored snapshot days instead of an empty chart', async () => {
    readPortfolio.mockRejectedValue(new Error('rpc timed out'))
    snapshotRows = [snapshot(3, 100), snapshot(1, 120)]

    const result = await buildAnchoredPortfolioHistory({
      userAddress: ADDRESS,
      walletAddresses: [ADDRESS],
      t: TABLES,
      days: 7,
    })

    expect(result.degraded).toBe(true)
    expect(result.history.length).toBeGreaterThan(0)
    // History starts at the first stored day (-3), not at the window edge:
    // we don't invent values for days before the user's first snapshot.
    expect(result.history[0].portfolioValue).toBe(100)
    expect(result.diagnostics.snapshotDaysUsed).toBe(2)
    // Gaps forward-fill, so -2 keeps the -3 value and today keeps -1's.
    expect(result.history.map((p) => p.portfolioValue)).toEqual([100, 100, 120, 120])
  })

  it('anchors currentValue to the newest snapshot so headline matches the chart', async () => {
    readPortfolio.mockRejectedValue(new Error('rpc timed out'))
    snapshotRows = [snapshot(2, 50), { ...snapshot(1, 75), supplied_usd: '90', borrowed_usd: '15' }]

    const result = await buildAnchoredPortfolioHistory({
      userAddress: ADDRESS,
      walletAddresses: [ADDRESS],
      t: TABLES,
      days: 7,
    })

    expect(result.currentValue).toBe(75)
    expect(result.totalSuppliedUsd).toBe(90)
    expect(result.totalBorrowedUsd).toBe(15)
    expect(result.history[result.history.length - 1].portfolioValue).toBe(75)
  })

  it('reports no earnings from snapshot deltas (a deposit is not a gain)', async () => {
    readPortfolio.mockRejectedValue(new Error('rpc timed out'))
    snapshotRows = [snapshot(2, 10), snapshot(1, 1000)]

    const result = await buildAnchoredPortfolioHistory({
      userAddress: ADDRESS,
      walletAddresses: [ADDRESS],
      t: TABLES,
      days: 7,
    })

    expect(result.history.every((p) => p.earnings === 0 && p.cumulativeEarnings === 0)).toBe(true)
  })

  it('still returns an empty history when nothing was ever stored', async () => {
    readPortfolio.mockRejectedValue(new Error('rpc timed out'))
    snapshotRows = []

    const result = await buildAnchoredPortfolioHistory({
      userAddress: ADDRESS,
      walletAddresses: [ADDRESS],
      t: TABLES,
      days: 7,
    })

    expect(result.degraded).toBe(true)
    expect(result.history).toEqual([])
    expect(result.currentValue).toBe(0)
  })
})

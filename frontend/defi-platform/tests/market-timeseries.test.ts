import { describe, it, expect, vi, beforeEach } from 'vitest'

// The Expert charts tab reads three independent feeds and must never turn a
// missing day into a zero (that would draw invented history). These tests pin
// the join keys and the gap handling.

type Row = Record<string, unknown>

let metricRows: Row[] = []
let apyRows: Row[] = []
let flowRows: Row[] = []
/** Query texts the mock saw, so we can assert on the join keys used. */
let seenQueries: Array<{ text: string; values: unknown[] }> = []

vi.mock('@/lib/database', () => {
  const sql: any = (strings: any, ...values: any[]) => {
    if (!Array.isArray(strings)) return { __ident: String(strings) }
    const text = strings.join(' ? ')
    seenQueries.push({ text, values })
    if (text.includes('tvl_usd')) return Promise.resolve(metricRows)
    if (text.includes('supply_apy')) return Promise.resolve(apyRows)
    if (text.includes('token_symbol')) return Promise.resolve(flowRows)
    return Promise.resolve([])
  }
  return { sql }
})

vi.mock('@/lib/tableResolver', () => ({
  getTableNames: () => ({
    assetMetrics: 'asset_metrics_mainnet',
    apyTimeSeries: 'apy_time_series_mainnet',
    verifiedTransactions: 'verified_transactions_mainnet',
  }),
}))

const priceSeries = new Map<string, number>()
vi.mock('@/lib/markets/priceHistory', () => ({
  fetchDailyPriceSeries: vi.fn(async () => priceSeries),
}))

import {
  buildMarketSeries,
  seriesToCsv,
  flowSymbol,
  canonicalDbAssetId,
} from '@/lib/markets/timeseries'

const MS_PER_DAY = 86_400_000

function dayKey(offset: number): string {
  const d = new Date(Date.now() - offset * MS_PER_DAY)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

beforeEach(() => {
  metricRows = []
  apyRows = []
  flowRows = []
  seenQueries = []
  priceSeries.clear()
})

describe('market id mapping', () => {
  it('maps the Pancake LP alias to the id the indexer writes', () => {
    expect(canonicalDbAssetId('pancake-boosted-LP-ausd-usdc')).toBe('pancake-ausd-usdc')
  })

  it('strips the -stellar suffix for the verified-transaction join', () => {
    // The metrics feed keys Stellar as `xlm-stellar`, the transaction trail as
    // a bare `xlm` — joining on the wrong one silently zeroes Stellar flow.
    expect(flowSymbol('xlm-stellar')).toBe('xlm')
    expect(flowSymbol('usdc')).toBe('usdc')
  })
})

describe('buildMarketSeries', () => {
  it('emits one point per day of the window, oldest first', async () => {
    const result = await buildMarketSeries({ assetId: 'xlm-stellar', chainId: 56457, days: 7 })
    expect(result.points).toHaveLength(7)
    expect(result.points[0].day).toBe(dayKey(6))
    expect(result.points[6].day).toBe(dayKey(0))
  })

  it('leaves days without a stored reading null, never zero', async () => {
    metricRows = [{ day: dayKey(2), tvl_usd: 1234.5, utilization_pct: 42 }]
    const result = await buildMarketSeries({ assetId: 'xlm-stellar', chainId: 56457, days: 7 })

    const recorded = result.points.find((p) => p.day === dayKey(2))!
    expect(recorded.tvlUsd).toBe(1234.5)
    expect(recorded.utilizationPct).toBe(42)

    const missing = result.points.find((p) => p.day === dayKey(3))!
    expect(missing.tvlUsd).toBeNull()
    expect(missing.utilizationPct).toBeNull()
  })

  it('falls back to the base supply APY when no boosted total was written', async () => {
    apyRows = [
      { day: dayKey(1), supply_apy: 3.5, total_supply_apy: null, borrow_apy: 7 },
      { day: dayKey(0), supply_apy: 3.5, total_supply_apy: 5.25, borrow_apy: 7 },
    ]
    const result = await buildMarketSeries({ assetId: 'xlm-stellar', chainId: 56457, days: 3 })
    expect(result.points.find((p) => p.day === dayKey(1))!.totalSupplyApy).toBe(3.5)
    expect(result.points.find((p) => p.day === dayKey(0))!.totalSupplyApy).toBe(5.25)
  })

  it('buckets verified transactions into flow directions', async () => {
    flowRows = [
      { day: dayKey(1), action_type: 'supply', tx_count: 2, usd_value: 100 },
      { day: dayKey(1), action_type: 'cross-chain_supply', tx_count: 1, usd_value: 50 },
      { day: dayKey(1), action_type: 'redeem', tx_count: 1, usd_value: 20 },
      { day: dayKey(1), action_type: 'borrow', tx_count: 1, usd_value: 10 },
      { day: dayKey(1), action_type: 'repay', tx_count: 1, usd_value: 5 },
    ]
    const result = await buildMarketSeries({ assetId: 'xlm-stellar', chainId: 56457, days: 3 })
    const day = result.points.find((p) => p.day === dayKey(1))!
    expect(day.suppliedUsd).toBe(150)
    expect(day.withdrawnUsd).toBe(20)
    expect(day.borrowedUsd).toBe(10)
    expect(day.repaidUsd).toBe(5)
    expect(day.volumeUsd).toBe(185)
    expect(day.txCount).toBe(6)
  })

  it('treats a day with no transactions as real zero flow, not a gap', async () => {
    const result = await buildMarketSeries({ assetId: 'usdc', chainId: 56, days: 3 })
    expect(result.points.every((p) => p.volumeUsd === 0)).toBe(true)
  })

  it('overlays the external price feed by day', async () => {
    priceSeries.set(dayKey(1), 0.42)
    const result = await buildMarketSeries({ assetId: 'xlm-stellar', chainId: 56457, days: 3 })
    expect(result.points.find((p) => p.day === dayKey(1))!.priceUsd).toBe(0.42)
    expect(result.points.find((p) => p.day === dayKey(2))!.priceUsd).toBeNull()
  })

  it('reports per-feed coverage so the UI can explain a thin chart', async () => {
    metricRows = [{ day: dayKey(1), tvl_usd: 10, utilization_pct: 1 }]
    apyRows = [{ day: dayKey(1), supply_apy: 1, total_supply_apy: 1, borrow_apy: 1 }]
    const result = await buildMarketSeries({ assetId: 'xlm-stellar', chainId: 56457, days: 30 })
    expect(result.coverage).toEqual({ metrics: 1, apy: 1, price: 0, flow: 0 })
  })

  it('clamps an absurd range instead of scanning the whole table', async () => {
    const result = await buildMarketSeries({ assetId: 'usdc', chainId: 56, days: 9999 })
    expect(result.days).toBe(365)
    expect(result.points).toHaveLength(365)
  })
})

describe('seriesToCsv', () => {
  it('writes empty cells for gaps and keeps the header stable', async () => {
    metricRows = [{ day: dayKey(1), tvl_usd: 1000, utilization_pct: 25 }]
    const result = await buildMarketSeries({ assetId: 'xlm-stellar', chainId: 56457, days: 2 })
    const csv = seriesToCsv(result, 'XLM')

    const lines = csv.split('\r\n')
    expect(lines[0]).toContain('Date,Market,Chain ID,TVL (USD)')
    // BOM so Excel picks up UTF-8 rather than mangling the first header cell.
    expect(csv.startsWith('﻿')).toBe(true)

    const rowWithData = lines.find((l) => l.startsWith(dayKey(1)))!
    expect(rowWithData).toContain('XLM,56457,1000,25')
    const rowWithGap = lines.find((l) => l.startsWith(dayKey(0)))!
    expect(rowWithGap).toContain('XLM,56457,,,')
  })
})

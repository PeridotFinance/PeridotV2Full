/**
 * Per-market historical series for the Expert-mode charts tab.
 *
 * Why this exists
 * ────────────────
 * Expert mode showed only "now": one APY, one TVL number, one utilization bar.
 * The goal is that Expert be expert-grade: every metric readable over time,
 * and exportable. The data was already there, it just had no reader: three
 * separate feeds the python indexer has been writing since Oct 2025.
 *
 * Sources (all daily-bucketed here; the indexer writes every ~5 min):
 *   • asset_metrics(_mainnet)         → tvl_usd, utilization_pct
 *   • apy_time_series(_mainnet)       → supply / total-supply / borrow APY
 *   • verified_transactions(_mainnet) → per-day flow (supply/withdraw/borrow/repay)
 *   • external price feed             → price_usd (see priceHistory.ts)
 *
 * Honesty rules — the point of the tab is transparency, so:
 *   • A day with no stored row is `null`, never zero and never interpolated.
 *     The chart draws a gap; the CSV writes an empty cell.
 *   • TVL/utilization take the *last* reading of each UTC day (an end-of-day
 *     value), while APYs take the day's average (a rate the user actually
 *     earned across the day, not the instant it was last sampled).
 *   • Flow is labelled as *verified* transaction volume, because that trail is
 *     known to be incomplete for wallets that bypass the leaderboard verifier.
 *     It is not presented as protocol-wide volume.
 */

import { sql } from '@/lib/database'
import { getTableNames } from '@/lib/tableResolver'
import { fetchDailyPriceSeries } from '@/lib/markets/priceHistory'

export interface MarketSeriesPoint {
  /** UTC day, `YYYY-MM-DD`. */
  day: string
  tvlUsd: number | null
  utilizationPct: number | null
  /** Base supply APY as written by the indexer (excludes boost). */
  supplyApy: number | null
  /** Supply APY including boost sources (DeFindex/Blend, Morpho, …). */
  totalSupplyApy: number | null
  borrowApy: number | null
  priceUsd: number | null
  /** Verified transaction flow for this market on this day, in USD. */
  volumeUsd: number | null
  suppliedUsd: number | null
  withdrawnUsd: number | null
  borrowedUsd: number | null
  repaidUsd: number | null
  txCount: number | null
}

export interface MarketSeriesResult {
  assetId: string
  chainId: number
  days: number
  points: MarketSeriesPoint[]
  /** Which feeds actually returned rows — surfaced so the UI can say so. */
  coverage: {
    metrics: number
    apy: number
    price: number
    flow: number
  }
}

/** The metrics a caller can chart/export, in display order. */
export const MARKET_METRICS = [
  { key: 'tvlUsd', label: 'TVL', unit: 'usd' },
  { key: 'utilizationPct', label: 'Utilization', unit: 'percent' },
  { key: 'totalSupplyApy', label: 'Supply APY', unit: 'percent' },
  { key: 'borrowApy', label: 'Borrow APY', unit: 'percent' },
  { key: 'priceUsd', label: 'Price', unit: 'usd' },
  { key: 'volumeUsd', label: 'Volume', unit: 'usd' },
] as const

export type MarketMetricKey = (typeof MARKET_METRICS)[number]['key']

const MS_PER_DAY = 86_400_000
export const MAX_DAYS = 365

/**
 * Frontend asset IDs and DB asset IDs mostly agree (`usdc`, `xlm-stellar`);
 * these are the pairs that don't. Mirrors the map in /api/markets/details.
 */
const ASSET_ID_ALIASES: Record<string, string> = {
  'pancake-boosted-lp-ausd-usdc': 'pancake-ausd-usdc',
}

export function canonicalDbAssetId(rawId: string): string {
  const lower = (rawId || '').toLowerCase().replace(/[_\\/]/g, '-')
  return ASSET_ID_ALIASES[lower] || lower
}

/**
 * `verified_transactions.token_symbol` carries the bare symbol even for
 * Stellar markets, where the metrics feed uses a `-stellar` suffix. Without
 * this the flow series silently reads zero for every Stellar market — the same
 * join miss that once zeroed Stellar earnings.
 */
export function flowSymbol(assetId: string): string {
  return canonicalDbAssetId(assetId).replace(/-stellar$/, '')
}

function dayKey(ms: number): string {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

function toDayKey(value: string | Date): string {
  return typeof value === 'string' ? value.slice(0, 10) : dayKey(value.getTime())
}

function num(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const n = typeof value === 'number' ? value : parseFloat(String(value))
  return Number.isFinite(n) ? n : null
}

/** Classify an action_type into the flow bucket it belongs to. */
function flowBucket(actionType: string): 'supplied' | 'withdrawn' | 'borrowed' | 'repaid' | null {
  const a = (actionType || '').toLowerCase()
  if (a.includes('repay')) return 'repaid'
  if (a.includes('borrow')) return 'borrowed'
  if (a.includes('redeem') || a.includes('withdraw')) return 'withdrawn'
  if (a.includes('supply') || a.includes('deposit')) return 'supplied'
  return null
}

export async function buildMarketSeries(args: {
  assetId: string
  chainId: number
  days: number
  /** Skip the external price call (CSV export of on-chain metrics only). */
  includePrice?: boolean
}): Promise<MarketSeriesResult> {
  const days = Math.min(Math.max(Math.floor(args.days) || 30, 1), MAX_DAYS)
  const assetId = canonicalDbAssetId(args.assetId)
  const chainId = Number(args.chainId)
  const since = new Date(Date.now() - days * MS_PER_DAY)
  const t = getTableNames()

  // Every feed is best-effort: one missing table must not blank the whole tab,
  // it should just leave that series empty (the UI greys the metric out).
  const [metricRows, apyRows, flowRows, priceByDay] = await Promise.all([
    sql`
      SELECT DISTINCT ON (date_trunc('day', created_at))
        date_trunc('day', created_at) AS day,
        tvl_usd::float          AS tvl_usd,
        utilization_pct::float  AS utilization_pct
      FROM ${sql(t.assetMetrics)}
      WHERE asset_id = ${assetId}
        AND chain_id = ${chainId}
        AND created_at >= ${since}
      ORDER BY date_trunc('day', created_at) DESC, created_at DESC
    `.catch((err: unknown) => {
      console.warn(`[market-series] asset_metrics read failed: ${String(err)}`)
      return [] as any[]
    }),
    sql`
      SELECT
        date_trunc('day', timestamp)   AS day,
        AVG(supply_apy)::float         AS supply_apy,
        AVG(total_supply_apy)::float   AS total_supply_apy,
        AVG(borrow_apy)::float         AS borrow_apy
      FROM ${sql(t.apyTimeSeries)}
      WHERE asset_id = ${assetId}
        AND chain_id = ${chainId}
        AND timestamp >= ${since}
      GROUP BY date_trunc('day', timestamp)
    `.catch((err: unknown) => {
      console.warn(`[market-series] apy_time_series read failed: ${String(err)}`)
      return [] as any[]
    }),
    sql`
      SELECT
        date_trunc('day', verified_at) AS day,
        action_type,
        COUNT(*)::int                  AS tx_count,
        SUM(usd_value::numeric)::float AS usd_value
      FROM ${sql(t.verifiedTransactions)}
      WHERE LOWER(token_symbol) = ${flowSymbol(args.assetId)}
        AND chain_id = ${chainId}
        AND is_valid = true
        AND verified_at >= ${since}
      GROUP BY date_trunc('day', verified_at), action_type
    `.catch((err: unknown) => {
      console.warn(`[market-series] verified_transactions read failed: ${String(err)}`)
      return [] as any[]
    }),
    args.includePrice === false
      ? Promise.resolve(new Map<string, number>())
      : fetchDailyPriceSeries(args.assetId, days),
  ])

  const metricsByDay = new Map<string, { tvl: number | null; util: number | null }>()
  for (const row of metricRows as any[]) {
    metricsByDay.set(toDayKey(row.day), {
      tvl: num(row.tvl_usd),
      util: num(row.utilization_pct),
    })
  }

  const apyByDay = new Map<string, { supply: number | null; total: number | null; borrow: number | null }>()
  for (const row of apyRows as any[]) {
    apyByDay.set(toDayKey(row.day), {
      supply: num(row.supply_apy),
      total: num(row.total_supply_apy),
      borrow: num(row.borrow_apy),
    })
  }

  type Flow = { supplied: number; withdrawn: number; borrowed: number; repaid: number; txCount: number }
  const flowByDay = new Map<string, Flow>()
  for (const row of flowRows as any[]) {
    const key = toDayKey(row.day)
    const bucket = flowBucket(String(row.action_type))
    if (!bucket) continue
    const current =
      flowByDay.get(key) || { supplied: 0, withdrawn: 0, borrowed: 0, repaid: 0, txCount: 0 }
    current[bucket] += num(row.usd_value) ?? 0
    current.txCount += Number(row.tx_count) || 0
    flowByDay.set(key, current)
  }

  const todayMs = Date.UTC(
    new Date().getUTCFullYear(),
    new Date().getUTCMonth(),
    new Date().getUTCDate(),
  )
  const points: MarketSeriesPoint[] = []
  // Coverage counts days that actually made it into the output — the SQL window
  // is `days` × 24h from now, which straddles one extra calendar day.
  const coverage = { metrics: 0, apy: 0, price: 0, flow: 0 }
  for (let i = days - 1; i >= 0; i--) {
    const key = dayKey(todayMs - i * MS_PER_DAY)
    const m = metricsByDay.get(key)
    const a = apyByDay.get(key)
    const f = flowByDay.get(key)
    if (m) coverage.metrics++
    if (a) coverage.apy++
    if (f) coverage.flow++
    if (priceByDay.has(key)) coverage.price++
    points.push({
      day: key,
      tvlUsd: m?.tvl ?? null,
      utilizationPct: m?.util ?? null,
      supplyApy: a?.supply ?? null,
      totalSupplyApy: a?.total ?? a?.supply ?? null,
      borrowApy: a?.borrow ?? null,
      priceUsd: priceByDay.get(key) ?? null,
      // A day with no verified transaction really did see no verified flow —
      // that's a genuine zero, not a gap, so the volume series stays readable
      // instead of dissolving into holes.
      volumeUsd: f ? f.supplied + f.withdrawn + f.borrowed + f.repaid : 0,
      suppliedUsd: f?.supplied ?? 0,
      withdrawnUsd: f?.withdrawn ?? 0,
      borrowedUsd: f?.borrowed ?? 0,
      repaidUsd: f?.repaid ?? 0,
      txCount: f?.txCount ?? 0,
    })
  }

  return {
    assetId,
    chainId,
    days,
    points,
    coverage,
  }
}

/**
 * Excel-friendly CSV. Empty cells for gaps (Excel reads those as blank, not 0),
 * a UTF-8 BOM so Excel picks the encoding up, and CRLF line endings.
 */
export function seriesToCsv(result: MarketSeriesResult, label: string): string {
  const header = [
    'Date',
    'Market',
    'Chain ID',
    'TVL (USD)',
    'Utilization (%)',
    'Supply APY (%)',
    'Supply APY incl. boost (%)',
    'Borrow APY (%)',
    'Price (USD)',
    'Verified volume (USD)',
    'Supplied (USD)',
    'Withdrawn (USD)',
    'Borrowed (USD)',
    'Repaid (USD)',
    'Verified transactions',
  ]
  const cell = (v: number | null) => (v == null ? '' : String(v))
  const rows = result.points.map((p) =>
    [
      p.day,
      label,
      String(result.chainId),
      cell(p.tvlUsd),
      cell(p.utilizationPct),
      cell(p.supplyApy),
      cell(p.totalSupplyApy),
      cell(p.borrowApy),
      cell(p.priceUsd),
      cell(p.volumeUsd),
      cell(p.suppliedUsd),
      cell(p.withdrawnUsd),
      cell(p.borrowedUsd),
      cell(p.repaidUsd),
      cell(p.txCount),
    ].join(','),
  )
  return '﻿' + [header.join(','), ...rows].join('\r\n') + '\r\n'
}

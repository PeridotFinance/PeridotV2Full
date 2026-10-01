import { NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { getTableNames } from '@/lib/tableResolver'

// Cache the results for 30 seconds to avoid repeated DB queries
let cachedData: Record<string, {
  utilizationPct: number;
  tvlUsd: number;
  liquidityUnderlying: number;
  liquidityUsd: number;
  priceUsd: number;
  updatedAt: string;
  chainId: number
}> | null = null
let cacheTimestamp: number = 0
let refreshPromise: Promise<any> | null = null // Promise Coalescing to handle thundering herd
const CACHE_DURATION_MS = 30_000 // 30 seconds

// Frontend‑canonical asset ID normalization.
function canonicalizeAssetId(rawId: string): string {
  const lower = rawId.toLowerCase().replace(/_/g, '-').replace(/\\/g, '-').replace(/\//g, '-')
  const aliasMap: Record<string, string> = {
    'pancake-ausd-usdc': 'pancake-boosted-lp-ausd-usdc',
  }
  return aliasMap[lower] || lower
}

export async function GET() {
  try {
    const now = Date.now()
    
    // 1. Return cached data if still fresh
    if (cachedData && (now - cacheTimestamp) < CACHE_DURATION_MS) {
      // If cache is about to expire, trigger background refresh
      if ((now - cacheTimestamp) > (CACHE_DURATION_MS * 0.7) && !refreshPromise) {
        refreshPromise = fetchAndCacheMetrics()
        // We don't await it here, so we still return cached data immediately
        refreshPromise.catch(e => console.error('Background refresh failed:', e))
      }
      return NextResponse.json({ ok: true, data: cachedData, cached: true })
    }

    if (!refreshPromise) {
      refreshPromise = fetchAndCacheMetrics()
    }

    try {
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Request Timeout')), 25000)
      );
      const data = await Promise.race([refreshPromise, timeoutPromise]);
      return NextResponse.json({ ok: true, data }, {
        headers: {
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
        }
      })
    } catch (e: any) {
      if (e.message === 'Request Timeout') {
        refreshPromise = null; // Clear if timed out to allow retry
      }
      throw e;
    }
  } catch (e: any) {
    console.error('Error fetching market metrics:', e)
    return NextResponse.json({ ok: false, error: 'failed_to_fetch_metrics' }, { status: 500 })
  }
}

async function fetchAndCacheMetrics() {
  try {
    const data: Record<string, any> = {}

    const t = getTableNames()

    // Query the environment-appropriate asset_metrics_latest table
    const tables = [t.assetMetricsLatest]

    for (const tableName of tables) {
      try {
        const rows = await sql`
          SELECT
            asset_id,
            chain_id,
            utilization_pct::float AS utilization_pct,
            tvl_usd::float AS tvl_usd,
            updated_at AS created_at,
            liquidity_underlying::float AS liquidity_underlying,
            liquidity_usd::float AS liquidity_usd,
            price_usd::float AS price_usd,
            collateral_factor_pct::float AS collateral_factor_pct
          FROM ${sql(tableName)}
        `
        
        for (const r of rows as any[]) {
          const canonicalId = canonicalizeAssetId(String(r.asset_id || ''))
          const standardizedAssetId = canonicalId.replace(/_/g, '-').toUpperCase()
          const key = `${standardizedAssetId}:${Number(r.chain_id)}`
          
          data[key] = {
            utilizationPct: Number(r.utilization_pct || 0),
            tvlUsd: Number(r.tvl_usd || 0),
            liquidityUnderlying: Number(r.liquidity_underlying || 0),
            liquidityUsd: Number(r.liquidity_usd || 0),
            priceUsd: Number(r.price_usd || 0),
            collateral_factor_pct: Number(r.collateral_factor_pct || 0),
            updatedAt: new Date(r.created_at).toISOString(),
            chainId: Number(r.chain_id || 0),
          }
        }
      } catch (e: any) {
        console.log(`Note: ${tableName} table not available or empty:`, e.message)
      }
    }

    if (Object.keys(data).length > 0) {
      cachedData = data
      cacheTimestamp = Date.now()
    }
    return data
  } finally {
    refreshPromise = null // Clear promise so the next cycle can start
  }
}

export const dynamic = 'force-dynamic'
export const revalidate = 30

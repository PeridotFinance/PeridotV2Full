import { NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { getTableNames } from '@/lib/tableResolver'

// Cache the results for 30 seconds to avoid repeated DB queries
let cachedData: Record<string, {
  liquidityUsd: number;
  liquidityUnderlying: number;
  updatedAt: string;
  chainId: number;
  timestamp: number;
}> = {}

// Request coalescing map to prevent "Thundering Herd"
const pendingRequests = new Map<string, Promise<any>>();
const CACHE_DURATION_MS = 30_000 // 30 seconds

// Normalize asset IDs to the same canonical form used by the frontend
// (lowercase, hyphen‑separated slugs based on market-data.ts IDs).
function canonicalizeAssetId(rawId: string): string {
  const lower = rawId.toLowerCase().replace(/_/g, '-').replace(/\\/g, '-').replace(/\//g, '-')

  const aliasMap: Record<string, string> = {
    // Pancake boosted LP: DB / scripts use "pancake-ausd-usdc",
    // frontend asset id is "pancake-boosted-lp-ausd-usdc".
    'pancake-ausd-usdc': 'pancake-boosted-lp-ausd-usdc',
  }

  return aliasMap[lower] || lower
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const assetId = searchParams.get('assetId')
    const chainId = searchParams.get('chainId')

    if (!assetId || !chainId) {
      return NextResponse.json({ ok: false, error: 'assetId and chainId required' }, { status: 400 })
    }

    // Normalize assetId for DB matching
    const normalizedAssetIdUpper = assetId.toUpperCase()
    const canonicalMetricsId = canonicalizeAssetId(assetId)
    const cacheKey = `${normalizedAssetIdUpper}:${chainId}`

    // 1. Check if we have a fresh in-memory cache
    const now = Date.now()
    if (cachedData[cacheKey]) {
      const entry = cachedData[cacheKey]
      if ((now - entry.timestamp) < CACHE_DURATION_MS) {
        return NextResponse.json({ ok: true, data: entry, cached: true }, {
          headers: {
            'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
            'X-Cache': 'HIT'
          }
        })
      }
    }

    // 2. Request Coalescing
    if (pendingRequests.has(cacheKey)) {
      const coalescedData = await pendingRequests.get(cacheKey);
      return NextResponse.json({ ok: true, data: coalescedData, cached: true }, {
        headers: {
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
          'X-Cache': 'COALESCED'
        }
      });
    }

    const fetchPromise = (async () => {
      const t = getTableNames()
      const rows = await sql`
        SELECT * FROM ${sql(t.marketDetailsSnapshots)}
        WHERE UPPER(symbol) = ${normalizedAssetIdUpper} AND chain_id = ${chainId}
        ORDER BY created_at DESC
        LIMIT 1
      `

      if (rows.length === 0) {
        const altRows = await sql`
          SELECT
            asset_id,
            chain_id,
            tvl_usd::float AS liquidity_usd,
            utilization_pct::float AS utilization_pct,
            created_at
          FROM ${sql(t.assetMetrics)}
          WHERE asset_id = ${canonicalMetricsId} AND chain_id = ${chainId}
          ORDER BY created_at DESC
          LIMIT 1
        `

        if (altRows.length === 0) {
          throw new Error('no_data_found_in_either_table');
        }

        const row = altRows[0]
        const data = {
          liquidityUsd: Number(row.liquidity_usd || 0),
          liquidityUnderlying: 0, // Not available in this table
          utilizationPct: Number(row.utilization_pct || 0),
          updatedAt: new Date(row.created_at).toISOString(),
          chainId: Number(row.chain_id || 0),
          timestamp: Date.now(),
        }

        cachedData[cacheKey] = data
        return data;
      }

      const row = rows[0]
      const data = {
        liquidityUsd: Number(row.liquidity_usd || 0),
        liquidityUnderlying: Number(row.liquidity_underlying || 0),
        priceUsd: Number(row.price_usd || 0),
        updatedAt: new Date(row.created_at).toISOString(),
        chainId: Number(row.chain_id || 0),
        timestamp: Date.now(),
      }

      cachedData[cacheKey] = data
      return data;
    })();

    pendingRequests.set(cacheKey, fetchPromise);

    try {
      const resultData = await fetchPromise;
      return NextResponse.json({ ok: true, data: resultData }, {
        headers: {
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
          'X-Cache': 'MISS'
        }
      })
    } finally {
      pendingRequests.delete(cacheKey);
    }

  } catch (error: any) {
    if (error.message === 'no_data_found_in_either_table') {
      return NextResponse.json({ ok: false, error: error.message }, { status: 404 });
    }
    console.error('Error fetching market details:', error)
    return NextResponse.json({ ok: false, error: 'failed_to_fetch_details', details: error.message }, { status: 500 })
  }
}

// Force dynamic rendering to avoid static optimization issues
export const dynamic = 'force-dynamic'
export const revalidate = 30 // Revalidate every 30 seconds

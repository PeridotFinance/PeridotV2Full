import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/database';
import { getTableNames } from '@/lib/tableResolver';
import { fetchStellarTvlSummary } from '@/lib/stellar-tvl';
import { CHAIN_IDS } from '@/config/contracts';

// Server-side cache for stats to prevent DoS
const statsCache = new Map<string, { data: any, timestamp: number }>();
const pendingRequests = new Map<string, Promise<any>>();
const CACHE_TTL = 30000; // 30 seconds

/**
 * Get the start date for protocol data queries.
 * Uses MAINNET_LAUNCH_DATE environment variable (defaults to 2024-10-06).
 * Returns the launch date so the chart shows the full protocol history.
 */
const getMainnetStartDate = () => {
  const mainnetLaunch = process.env.MAINNET_LAUNCH_DATE || '2024-10-06'
  return new Date(mainnetLaunch)
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const compare = searchParams.get('compare') === '1'
    const assets = searchParams.get('assets') === '1'
    const includeStellar = searchParams.get('stellar') === '1'

    // Check cache first
    const cacheKey = `stats:${compare}:${assets}:${includeStellar ? 's1' : 's0'}`;
    const cached = statsCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      return NextResponse.json(cached.data, {
        headers: { 
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
          'X-Cache': 'HIT'
        }
      });
    }

    // Coalesce concurrent requests
    if (pendingRequests.has(cacheKey)) {
      const coalescedData = await pendingRequests.get(cacheKey);
      return NextResponse.json(coalescedData, {
        headers: { 
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
          'X-Cache': 'COALESCED'
        }
      });
    }

    const fetchPromise = (async () => {
      const t = getTableNames()
      const startDate = getMainnetStartDate()

      const result = await sql`
        SELECT 
          stats_data, 
          last_updated 
        FROM ${sql(t.dashboardStatsCache)}
        WHERE id = 1;
      `;

      // Prepare optional live datasets if requested
      let liveVolumeTimeSeries: any[] | null = null
      let actionAssetDaily: any[] | null = null

      if (compare) {
        const live = await sql`
          SELECT 
            DATE(verified_at) as date,
            COALESCE(SUM(CASE WHEN action_type IN ('supply', 'cross-chain_supply') THEN usd_value ELSE 0 END), 0) as supply,
            COALESCE(SUM(CASE WHEN action_type IN ('borrow', 'cross-chain_borrow') THEN usd_value ELSE 0 END), 0) as borrow,
            COALESCE(SUM(CASE WHEN action_type IN ('repay', 'cross-chain_repay') THEN usd_value ELSE 0 END), 0) as repay,
            COALESCE(SUM(CASE WHEN action_type IN ('redeem', 'cross-chain_redeem') THEN usd_value ELSE 0 END), 0) as redeem
          FROM ${sql(t.verifiedTransactions)}
          WHERE is_valid = true AND verified_at >= ${startDate}
          GROUP BY DATE(verified_at)
          ORDER BY date ASC
        `
        liveVolumeTimeSeries = (live as any[]).map((row: any) => ({
          date: (row.date instanceof Date) ? row.date.toISOString().slice(0, 10) : String(row.date),
          supply: Number(row.supply) || 0,
          borrow: Number(row.borrow) || 0,
          repay: Number(row.repay) || 0,
          redeem: Number(row.redeem) || 0,
        }))
      }

      if (assets) {
        const rows = await sql`
          SELECT 
            DATE(verified_at) as date,
            action_type,
            COALESCE(token_symbol, 'Unknown') as token_symbol,
            COALESCE(SUM(usd_value), 0) as volume
          FROM ${sql(t.verifiedTransactions)}
          WHERE is_valid = true AND verified_at >= ${startDate}
          GROUP BY DATE(verified_at), action_type, COALESCE(token_symbol, 'Unknown')
          ORDER BY date ASC
        `
        actionAssetDaily = (rows as any[]).map((r: any) => ({
          date: (r.date instanceof Date) ? r.date.toISOString().slice(0, 10) : String(r.date),
          action_type: String(r.action_type),
          token_symbol: String(r.token_symbol),
          volume: Number(r.volume) || 0,
        }))
      }

      // Live Stellar TVL — opt-in via ?stellar=1 so legacy callers stay
      // on the cached EVM-only payload. The stats page passes the flag.
      let stellarSummary: Awaited<ReturnType<typeof fetchStellarTvlSummary>> | null = null
      if (includeStellar) {
        try {
          stellarSummary = await fetchStellarTvlSummary()
        } catch (err) {
          console.warn('[stats] Stellar TVL fetch failed:', err)
        }
      }

      let responseData;
      if (result.length === 0) {
        const emptyData = {
          tvl: '0',
          totalBorrowed: '0',
          activeUsers: 0,
          totalTransactions: 0,
          volume24h: '0',
          volume7d: '0',
          totalVolume: '0',
          topSuppliers: [],
          actionDistribution: [],
          volumeTimeSeries: [],
          assetDistribution: [],
        }
        responseData = {
          data: emptyData,
          cached: false,
          timestamp: new Date().toISOString(),
          liveVolumeTimeSeries: liveVolumeTimeSeries || undefined,
          actionAssetDaily: actionAssetDaily || undefined,
          stellar: stellarSummary
            ? {
                chainId: CHAIN_IDS.STELLAR_MAINNET,
                ...stellarSummary,
              }
            : undefined,
        }
      } else {
        const data = result[0].stats_data;
        const lastUpdated = result[0].last_updated;
        responseData = {
          data,
          cached: true,
          timestamp: lastUpdated.toISOString(),
          liveVolumeTimeSeries: liveVolumeTimeSeries || undefined,
          actionAssetDaily: actionAssetDaily || undefined,
          stellar: stellarSummary
            ? {
                chainId: CHAIN_IDS.STELLAR_MAINNET,
                ...stellarSummary,
              }
            : undefined,
        }
      }

      // Update cache
      statsCache.set(cacheKey, { data: responseData, timestamp: Date.now() });
      return responseData;
    })();

    pendingRequests.set(cacheKey, fetchPromise);

    try {
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Request Timeout')), 25000)
      );
      const responseData = await Promise.race([fetchPromise, timeoutPromise]);
      return NextResponse.json(responseData, {
        headers: { 
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
          'X-Cache': 'MISS'
        }
      });
    } finally {
      pendingRequests.delete(cacheKey);
    }

  } catch (error) {
    console.error('Error fetching from stats cache:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch stats data.',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  return NextResponse.json({ message: 'Cache invalidation endpoint hit. Note: This does not trigger the Python script automatically.' });
}

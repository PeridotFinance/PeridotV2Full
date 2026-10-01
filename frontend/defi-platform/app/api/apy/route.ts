import { NextResponse, NextRequest } from 'next/server'
import { query } from '@/lib/database'
import { getTableNames } from '@/lib/tableResolver'

// Request coalescing map to prevent "Thundering Herd"
const apyCache = new Map<string, { data: any, timestamp: number }>();
const pendingRequests = new Map<string, Promise<any>>();
const CACHE_TTL = 300000; // 30 seconds

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const chainId = searchParams.get('chainId')
    const assetId = searchParams.get('assetId')
    const windowParam = searchParams.get('window') // e.g., 7d,30d,90d

    // Create a unique cache key for this specific query
    const cacheKey = `apy:${chainId || 'all'}:${assetId || 'none'}:${windowParam || 'latest'}`;

    // 1. Check in-memory cache
    const cached = apyCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      return NextResponse.json(cached.data, {
        headers: { 
          'X-Cache': 'HIT',
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60'
        }
      });
    }

    // 2. Request Coalescing: If a request for this data is already in progress, wait for it
    if (pendingRequests.has(cacheKey)) {
      const coalescedData = await pendingRequests.get(cacheKey);
      return NextResponse.json(coalescedData, {
        headers: {
          'X-Cache': 'COALESCED',
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60'
        }
      });
    }

    const fetchPromise = (async () => {
      // Timeseries mode if assetId + window provided
      if (assetId && chainId && windowParam) {
        const t = getTableNames()
        const windowToInterval: Record<string, string> = {
          '7d': '7 days',
          '30d': '30 days',
          '90d': '90 days',
          '180d': '180 days',
        }
        const interval = windowToInterval[windowParam] || '30 days'

        const timeseries = await query(
          `SELECT timestamp, supply_apy, borrow_apy,
                  peridot_supply_apy, peridot_borrow_apy,
                  boost_source_supply_apy, boost_rewards_supply_apy
           FROM ${t.apyTimeSeries}
           WHERE asset_id = $1 AND chain_id = $2 AND timestamp >= NOW() - INTERVAL '${interval}'
           ORDER BY timestamp ASC`,
          [assetId, chainId]
        )

        return {
          success: true,
          series: timeseries.rows.map(r => ({
            timestamp: r.timestamp,
            supplyApy: parseFloat(r.supply_apy) || 0,
            borrowApy: parseFloat(r.borrow_apy) || 0,
            peridotSupplyApy: parseFloat(r.peridot_supply_apy) || 0,
            peridotBorrowApy: parseFloat(r.peridot_borrow_apy) || 0,
            boostSourceSupplyApy: parseFloat(r.boost_source_supply_apy) || 0,
            boostRewardsSupplyApy: parseFloat(r.boost_rewards_supply_apy) || 0,
          })),
        }
      }

      const t = getTableNames()
      let sqlQuery = `
        SELECT 
          asset_id,
          chain_id,
          supply_apy,
          borrow_apy,
          peridot_supply_apy,
          peridot_borrow_apy,
          boost_source_supply_apy,
          boost_rewards_supply_apy,
          total_supply_apy,
          net_borrow_apy,
          timestamp
        FROM ${t.apyLatest}
      `
      const queryParams: any[] = []

      if (chainId) {
        sqlQuery += ' WHERE chain_id = $1'
        queryParams.push(chainId)
      }
      
      const result = await query(sqlQuery, queryParams)

      const apyData: Record<string, Record<number, any>> = {}
      
      for (const row of result.rows) {
        const aId = row.asset_id
        const cId = row.chain_id
        if (!apyData[aId]) apyData[aId] = {}
        apyData[aId][cId] = {
          supplyApy: parseFloat(row.supply_apy) || 0,
          borrowApy: parseFloat(row.borrow_apy) || 0,
          peridotSupplyApy: parseFloat(row.peridot_supply_apy) || 0,
          peridotBorrowApy: parseFloat(row.peridot_borrow_apy) || 0,
          boostSourceSupplyApy: parseFloat(row.boost_source_supply_apy) || 0,
          boostRewardsSupplyApy: parseFloat(row.boost_rewards_supply_apy) || 0,
          totalSupplyApy: parseFloat(row.total_supply_apy) || 0,
          netBorrowApy: parseFloat(row.net_borrow_apy) || 0,
          timestamp: row.timestamp
        }
      }

      const response = { success: true, data: apyData, timestamp: new Date().toISOString() }
      apyCache.set(cacheKey, { data: response, timestamp: Date.now() });
      return response
    })();

    pendingRequests.set(cacheKey, fetchPromise);

    try {
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Request Timeout')), 25000)
      );
      const resultData = await Promise.race([fetchPromise, timeoutPromise]);
      return NextResponse.json(resultData, {
        headers: {
          'X-Cache': 'MISS',
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60'
        }
      })
    } finally {
      pendingRequests.delete(cacheKey);
    }

  } catch (error) {
    console.error('Error fetching APY data:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch APY data',
        data: {} 
      },
      { status: 500 }
    )
  }
}


// Add cache headers for performance
export const dynamic = 'force-dynamic'
export const revalidate = 60 // Cache for 1 minute (APY data changes frequently) 
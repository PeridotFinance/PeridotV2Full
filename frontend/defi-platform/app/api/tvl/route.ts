import { NextRequest, NextResponse } from 'next/server'
import { LeaderboardDB } from '@/lib/database'
import { CHAIN_IDS } from '@/config/contracts'
import { fetchStellarTvlSummary } from '@/lib/stellar-tvl'

// Add server-side cache to prevent DoS
let cachedTvlResponse: any = null
let lastCacheTime = 0
const CACHE_DURATION = 60000 // 60 seconds

// Request coalescing map to prevent "Thundering Herd"
const pendingRequests = new Map<string, Promise<any>>();

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const chainIdParam = searchParams.get('chainId')
    
    // Normalize cache key
    const cacheKey = chainIdParam ? `chain:${chainIdParam}` : 'global'

    // 1. Check if we have a fresh in-memory cache
    const now = Date.now()
    if (!chainIdParam && cachedTvlResponse && (now - lastCacheTime < CACHE_DURATION)) {
      return NextResponse.json(cachedTvlResponse, {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
          'X-Cache': 'HIT'
        }
      })
    }

    // 2. Request Coalescing: If a request for this data is already in progress, wait for it
    if (pendingRequests.has(cacheKey)) {
      const coalescedData = await pendingRequests.get(cacheKey);
      return NextResponse.json(coalescedData, {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
          'X-Cache': 'COALESCED'
        }
      });
    }

    const fetchPromise = (async () => {
      if (chainIdParam) {
        // Get TVL for specific chain
        const chainId = parseInt(chainIdParam)
        if (isNaN(chainId)) {
          throw new Error('Invalid chain ID')
        }

        // Stellar mainnet has no row in cached_tvl — its TVL is computed
        // live from Soroban reads. EVM chains continue to use the cached
        // snapshot the cron writes.
        if (chainId === CHAIN_IDS.STELLAR_MAINNET) {
          const stellar = await fetchStellarTvlSummary()
          return {
            totalTVL: stellar.totalTVL,
            totalMarketSize: stellar.totalMarketSize,
            lastUpdated: stellar.lastUpdated,
            chainId,
          }
        }

        const cachedTVL = await LeaderboardDB.getCachedTVL(chainId)

        if (!cachedTVL) {
          return {
            totalTVL: 0,
            totalMarketSize: 0,
            lastUpdated: null,
            chainId
          }
        }

        return {
          totalTVL: parseFloat(cachedTVL.total_tvl.toString()),
          totalMarketSize: parseFloat(cachedTVL.total_market_size?.toString() || cachedTVL.total_tvl.toString()),
          lastUpdated: cachedTVL.last_updated,
          chainId: cachedTVL.chain_id
        }
      } else {
        // Get TVL for all chains. Resolve EVM cached snapshot and live
        // Stellar reads in parallel — Stellar adds ~1-2s latency on a
        // cold call, but the route's 60s in-memory cache amortises it.
        const [allCachedTVL, stellar] = await Promise.all([
          LeaderboardDB.getAllCachedTVL(),
          fetchStellarTvlSummary().catch((err) => {
            console.warn('[tvl] Stellar TVL fetch failed:', err)
            return null
          }),
        ])

        const evmTotalTVL = allCachedTVL.reduce((sum, tvl) =>
          sum + parseFloat(tvl.total_tvl.toString()), 0
        )
        const evmTotalMarketSize = allCachedTVL.reduce((sum, tvl) =>
          sum + parseFloat((tvl.total_market_size || tvl.total_tvl).toString()), 0
        )

        const evmChainData = allCachedTVL.map(tvl => ({
          chainId: tvl.chain_id,
          totalTVL: parseFloat(tvl.total_tvl.toString()),
          totalMarketSize: parseFloat((tvl.total_market_size || tvl.total_tvl).toString()),
          lastUpdated: tvl.last_updated
        }))

        const stellarChain = stellar
          ? [{
              chainId: CHAIN_IDS.STELLAR_MAINNET,
              totalTVL: stellar.totalTVL,
              totalMarketSize: stellar.totalMarketSize,
              lastUpdated: stellar.lastUpdated,
            }]
          : []

        const totalTVL = evmTotalTVL + (stellar?.totalTVL ?? 0)
        const totalMarketSize = evmTotalMarketSize + (stellar?.totalMarketSize ?? 0)

        const response = {
          totalTVL,
          totalMarketSize,
          chains: [...evmChainData, ...stellarChain],
          lastUpdated: allCachedTVL.length > 0
            ? allCachedTVL.reduce((latest, tvl) =>
                tvl.last_updated > latest ? tvl.last_updated : latest,
                allCachedTVL[0].last_updated
              )
            : (stellar?.lastUpdated ?? null)
        }

        // Update global cache
        cachedTvlResponse = response
        lastCacheTime = Date.now()

        return response
      }
    })();

    pendingRequests.set(cacheKey, fetchPromise);

    try {
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Request Timeout')), 25000)
      );
      const resultData = await Promise.race([fetchPromise, timeoutPromise]);
      return NextResponse.json(resultData, {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
          'X-Cache': 'MISS'
        }
      })
    } finally {
      pendingRequests.delete(cacheKey);
    }

  } catch (error: any) {
    console.error('Error fetching cached TVL:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch TVL data' }, 
      { status: 500 }
    )
  }
}

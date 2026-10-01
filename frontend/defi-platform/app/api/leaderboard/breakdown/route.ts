import { NextRequest, NextResponse } from 'next/server'
import { LeaderboardDB, normalizeWalletAddress, isSupportedWallet } from '@/lib/database'

// Server-side cache for breakdown data to prevent DoS
const breakdownCache = new Map<string, { data: any, timestamp: number }>();
const pendingRequests = new Map<string, Promise<any>>();
const CACHE_TTL = 30000; // 30 seconds
const MAX_CACHE_ENTRIES = 500; // bound memory: ~100 KB max (each entry ~200 bytes)

/** Evict all stale entries; if still over cap, remove oldest by insertion order. */
function evictBreakdownCache() {
  const now = Date.now();
  for (const [key, val] of breakdownCache) {
    if (now - val.timestamp >= CACHE_TTL) breakdownCache.delete(key);
  }
  while (breakdownCache.size > MAX_CACHE_ENTRIES) {
    const firstKey = breakdownCache.keys().next().value;
    if (firstKey !== undefined) breakdownCache.delete(firstKey);
    else break;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const walletAddress = normalizeWalletAddress(searchParams.get('wallet') || '')
    
    // EVM or Stellar — the breakdown reads the same chain-natively keyed
    // points tables, so a G-address is a valid subject here too.
    if (!isSupportedWallet(walletAddress)) {
      return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 })
    }

    // 1. Check if we have a fresh in-memory cache
    const cached = breakdownCache.get(walletAddress);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      return NextResponse.json(cached.data, {
        headers: { 
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
          'X-Cache': 'HIT'
        }
      });
    }

    // 2. Request Coalescing
    if (pendingRequests.has(walletAddress)) {
      const coalescedData = await pendingRequests.get(walletAddress);
      return NextResponse.json(coalescedData, {
        headers: { 
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
          'X-Cache': 'COALESCED'
        }
      });
    }

    const fetchPromise = (async () => {
      const [breakdown, globalRow] = await Promise.all([
        LeaderboardDB.getPointsBreakdown(walletAddress),
        LeaderboardDB.getAllTimePointsAndRanks([walletAddress])
      ])
      const global = globalRow[0] || { all_time_points: breakdown.all_time_points, global_rank: null }

      const resultData = {
        wallet: walletAddress,
        breakdown,
        global_rank: global.global_rank ?? null,
      };

      // Update cache (evict stale/excess entries first to bound memory)
      evictBreakdownCache();
      breakdownCache.set(walletAddress, { data: resultData, timestamp: Date.now() });
      return resultData;
    })();

    pendingRequests.set(walletAddress, fetchPromise);

    try {
      const resultData = await fetchPromise;
      return NextResponse.json(resultData, {
        headers: { 
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
          'X-Cache': 'MISS'
        }
      });
    } finally {
      pendingRequests.delete(walletAddress);
    }

  } catch (error) {
    console.error('Points breakdown API error:', error)
    return NextResponse.json({ error: 'Failed to fetch breakdown' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { sql, profileKey, isSupportedWallet } from '@/lib/database'
import { getTableNames } from '@/lib/tableResolver'

// Server-side cache for profiles to prevent DoS
const profileCache = new Map<string, { data: any, timestamp: number }>();
const pendingRequests = new Map<string, Promise<any>>();
const CACHE_TTL = 30000; // 30 seconds

// GET /api/user/profile?wallet=0x... or ?username=foo
export async function GET(request: NextRequest) {
  try {
    const t = getTableNames()
    const searchParams = request.nextUrl.searchParams
    const wallet = searchParams.get('wallet')
    const username = searchParams.get('username')

    if (!wallet && !username) {
      return NextResponse.json({ success: false, error: 'wallet or username required' }, { status: 400 })
    }

    const cacheKey = wallet ? `w:${wallet.toLowerCase()}` : `u:${username?.toLowerCase()}`;
    
    // Check cache
    const cached = profileCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      return NextResponse.json(cached.data, {
        headers: { 
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
          'X-Cache': 'HIT'
        }
      });
    }

    // Coalesce requests
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
      let row: any | null = null
      if (wallet) {
        // EVM 0x… or Stellar G… — profiles are keyed by lowercased address for both.
        if (!isSupportedWallet(wallet)) {
          throw new Error('Invalid wallet address');
        }
        const res = await sql`
          SELECT wallet_address, username, xp, badges, stats, created_at, updated_at
          FROM ${sql(t.userProfiles)}
          WHERE wallet_address = ${profileKey(wallet)}
          LIMIT 1
        `
        row = (res as any[])[0] || null
      } else if (username) {
        const res = await sql`
          SELECT wallet_address, username, xp, badges, stats, created_at, updated_at
          FROM ${sql(t.userProfiles)}
          WHERE LOWER(username) = ${username.toLowerCase()}
          LIMIT 1
        `
        row = (res as any[])[0] || null
      }

      const resultData = { success: true, data: row };
      profileCache.set(cacheKey, { data: resultData, timestamp: Date.now() });
      return resultData;
    })();

    pendingRequests.set(cacheKey, fetchPromise);

    try {
      const resultData = await fetchPromise;
      return NextResponse.json(resultData, {
        headers: { 
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
          'X-Cache': 'MISS'
        }
      });
    } finally {
      pendingRequests.delete(cacheKey);
    }

  } catch (error: any) {
    console.error('GET /api/user/profile error:', error)
    return NextResponse.json({ success: false, error: error.message || 'Failed to fetch profile' }, { status: 500 })
  }
}

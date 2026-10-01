import { NextRequest, NextResponse } from 'next/server'
import { authenticateUserScope, ensureScopeOwnsAddress } from '@/lib/auth/userScope'
import { query } from '@/lib/database'
import { getTableNames } from '@/lib/tableResolver'
import { resolveLinkedWallets } from '@/lib/linkedAccountResolver'
import { createUserApiAccountScope } from '@/lib/userApiAccountScope'

// Server-side cache for transactions to prevent DoS
const transactionCache = new Map<string, { data: any, timestamp: number }>();
const pendingRequests = new Map<string, Promise<any>>();
const CACHE_TTL = 30000; // 30 seconds

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const address = searchParams.get('address')
    const limitParam = searchParams.get('limit')
    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 500) : 100 // Max 500 for performance

    if (!address) {
      return NextResponse.json({ success: false, error: 'Missing address' }, { status: 400 })
    }

    // Private data — gate to the authenticated owner (no cross-account/IDOR reads).
    const scope = await authenticateUserScope(request)
    if (!scope) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }
    if (!(await ensureScopeOwnsAddress(scope, address))) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { accountId, walletAddresses, cacheScopeKey } = await resolveLinkedWallets(address)
    const accountScope = createUserApiAccountScope({
      accountId,
      requestedAddress: address,
      resolvedWallets: walletAddresses,
    })
    const cacheKey = `${cacheScopeKey}:limit:${limit}`;
    
    // 1. Check cache
    const cached = transactionCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      const cachedPayload = cached.data as Record<string, unknown> & { account?: unknown }
      const normalizedCached = {
        ...cachedPayload,
        account: cachedPayload.account ?? accountScope,
      }
      return NextResponse.json(normalizedCached, {
        headers: { 
          'Cache-Control': 'private, s-maxage=30, stale-while-revalidate=60',
          'X-Cache': 'HIT'
        }
      });
    }

    // 2. Coalesce concurrent requests
    if (pendingRequests.has(cacheKey)) {
      const coalescedData = await pendingRequests.get(cacheKey);
      const coalescedPayload = coalescedData as Record<string, unknown> & { account?: unknown }
      const normalizedCoalesced = {
        ...coalescedPayload,
        account: coalescedPayload.account ?? accountScope,
      }
      return NextResponse.json(normalizedCoalesced, {
        headers: { 
          'Cache-Control': 'private, s-maxage=30, stale-while-revalidate=60',
          'X-Cache': 'COALESCED'
        }
      });
    }

    const fetchPromise = (async () => {
      const t = getTableNames()

      // Fetch transactions with all necessary fields
      const transactionData = await query(
        `SELECT 
          tx_hash,
          action_type,
          token_symbol,
          amount,
          usd_value,
          points_awarded,
          verified_at,
          chain_id
        FROM ${t.verifiedTransactions}
        WHERE wallet_address = ANY($1::text[]) 
          AND is_valid = true 
          AND usd_value > 0
          AND action_type IN ('supply', 'borrow', 'repay', 'redeem', 'cross-chain_supply', 'cross-chain_borrow', 'cross-chain_repay', 'cross-chain_redeem')
        ORDER BY verified_at DESC
        LIMIT $2`,
        [walletAddresses, limit]
      )

      const transactions = transactionData.rows || []
      const resultData = { 
        success: true, 
        account: accountScope,
        transactions,
        count: transactions.length
      };

      transactionCache.set(cacheKey, { data: resultData, timestamp: Date.now() });
      return resultData;
    })();

    pendingRequests.set(cacheKey, fetchPromise);

    try {
      const resultData = await fetchPromise;
      return NextResponse.json(resultData, {
        headers: { 
          'Cache-Control': 'private, s-maxage=30, stale-while-revalidate=60',
          'X-Cache': 'MISS'
        }
      });
    } finally {
      pendingRequests.delete(cacheKey);
    }

  } catch (error) {
    console.error('GET /api/user/transactions error:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to fetch transactions' 
    }, { status: 500 })
  }
}

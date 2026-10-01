import { NextRequest, NextResponse } from 'next/server'
import { authenticateUserScope, ensureScopeOwnsAddress } from '@/lib/auth/userScope'
import { query } from '@/lib/database'
import { getTableNames } from '@/lib/tableResolver'

// Server-side cache for asset earnings to prevent DoS
const earningsCache = new Map<string, { data: any, timestamp: number }>();
const pendingRequests = new Map<string, Promise<any>>();
const CACHE_TTL = 30000; // 30 seconds

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const address = searchParams.get('address')
    const chainId = searchParams.get('chainId')
    const tokenSymbol = searchParams.get('tokenSymbol')
    const contractAddress = searchParams.get('contractAddress')

    if (!address || !chainId || (!tokenSymbol && !contractAddress)) {
      return NextResponse.json({ success: false, error: 'Missing parameters' }, { status: 400 })
    }

    // Private data — gate to the authenticated owner (no cross-account/IDOR reads).
    const scope = await authenticateUserScope(request)
    if (!scope) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }
    if (!(await ensureScopeOwnsAddress(scope, address))) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const walletAddress = address.toLowerCase()
    const cacheKey = `${walletAddress}:${chainId}:${tokenSymbol || ''}:${contractAddress || ''}`;
    
    // 1. Check cache
    const cached = earningsCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      return NextResponse.json(cached.data, {
        headers: { 
          'Cache-Control': 'private, s-maxage=30, stale-while-revalidate=60',
          'X-Cache': 'HIT'
        }
      });
    }

    // 2. Coalesce concurrent requests
    if (pendingRequests.has(cacheKey)) {
      const coalescedData = await pendingRequests.get(cacheKey);
      return NextResponse.json(coalescedData, {
        headers: { 
          'Cache-Control': 'private, s-maxage=30, stale-while-revalidate=60',
          'X-Cache': 'COALESCED'
        }
      });
    }

    const fetchPromise = (async () => {
      const t = getTableNames()
      
      // Query transactions for this specific asset
      const transactionData = await query(
        `SELECT 
          action_type,
          amount,
          token_symbol
        FROM ${t.verifiedTransactions}
        WHERE wallet_address = $1 
          AND chain_id = $2
          AND is_valid = true 
          AND (
            -- Match by contract address if provided
            ($4::text IS NOT NULL AND LOWER(contract_address) = LOWER($4))
            OR
            -- OR match by symbol
            (
              LOWER(token_symbol) = LOWER($3) 
              OR 
              -- Handle common wrapped variations
              (LOWER($3) = 'weth' AND LOWER(token_symbol) = 'eth')
              OR
              (LOWER($3) = 'eth' AND LOWER(token_symbol) = 'weth')
              OR
              (LOWER($3) = 'wbnb' AND LOWER(token_symbol) = 'bnb')
              OR
              (LOWER($3) = 'bnb' AND LOWER(token_symbol) = 'wbnb')
            )
          )
          AND action_type IN ('supply', 'borrow', 'repay', 'redeem', 'cross-chain_supply', 'cross-chain_borrow', 'cross-chain_repay', 'cross-chain_redeem')`,
        [walletAddress, chainId, tokenSymbol, contractAddress]
      )

      const transactions = transactionData.rows || []

      let netSuppliedTokens = 0
      let netBorrowedTokens = 0

      for (const tx of transactions) {
        const amount = parseFloat(tx.amount) || 0
        const type = tx.action_type

        if (type.includes('supply')) {
          netSuppliedTokens += amount
        } else if (type.includes('redeem')) {
          netSuppliedTokens -= amount
        } else if (type.includes('borrow')) {
          netBorrowedTokens += amount
        } else if (type.includes('repay')) {
          netBorrowedTokens -= amount
        }
      }

      const resultData = { 
        success: true, 
        netSuppliedTokens,
        netBorrowedTokens
      };

      earningsCache.set(cacheKey, { data: resultData, timestamp: Date.now() });
      return resultData;
    })();

    pendingRequests.set(cacheKey, fetchPromise);

    try {
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Request Timeout')), 25000)
      );
      const resultData = await Promise.race([fetchPromise, timeoutPromise]);
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
    console.error('GET /api/user/asset-earnings error:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to fetch asset earnings' 
    }, { status: 500 })
  }
}

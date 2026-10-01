import { NextRequest, NextResponse } from 'next/server'
import { authenticateUserScope, ensureScopeOwnsAddress } from '@/lib/auth/userScope'
import { query } from '@/lib/database'
import { getTableNames } from '@/lib/tableResolver'
import { resolveLinkedEvmWallets } from '@/lib/linkedAccountResolver'
import { createUserApiAccountScope } from '@/lib/userApiAccountScope'

// Server-side cache for portfolio data to prevent DoS
const portfolioCache = new Map<string, { data: unknown, timestamp: number }>();
const pendingRequests = new Map<string, Promise<unknown>>();
const CACHE_TTL = 30000; // 30 seconds

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const address = searchParams.get('address')

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

    const { accountId, walletAddresses, cacheScopeKey } = await resolveLinkedEvmWallets(address)
    const accountScope = createUserApiAccountScope({
      accountId,
      requestedAddress: address,
      resolvedWallets: walletAddresses,
    })
    const cacheKey = cacheScopeKey
    
    // 1. Check cache
    const cached = portfolioCache.get(cacheKey);
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

      // Get comprehensive user data
      const [transactionData, balanceSnapshots, portfolioApy, userStats] = await Promise.all([
        // Transaction data (including cross-chain)
        query(
          `SELECT 
            action_type,
            usd_value,
            verified_at,
            token_symbol,
            chain_id
          FROM ${t.verifiedTransactions}
          WHERE wallet_address = ANY($1::text[]) 
            AND is_valid = true 
            AND usd_value > 0
            AND action_type IN ('supply', 'borrow', 'repay', 'redeem', 'cross-chain_supply', 'cross-chain_borrow', 'cross-chain_repay', 'cross-chain_redeem')
          ORDER BY verified_at DESC
          LIMIT 100`,
          [walletAddresses]
        ),
        
        // Balance snapshots
        query(
          `SELECT 
            supplied_usd,
            borrowed_usd,
            observed_at,
            chain_id,
            asset_id
          FROM ${t.userBalanceSnapshots}
          WHERE address = ANY($1::text[])
          ORDER BY observed_at DESC
          LIMIT 200`,
          [walletAddresses]
        ),
        
        // Portfolio APY
        query(
          `SELECT 
            AVG(net_apy_pct) AS net_apy_pct,
            SUM(total_supply_usd) AS total_supply_usd,
            SUM(total_borrow_usd) AS total_borrow_usd,
            MAX(updated_at) AS updated_at
          FROM ${t.userPortfolioApySnapshots}
          WHERE address = ANY($1::text[])`,
          [walletAddresses]
        ),
        
        // User stats
        query(
          `SELECT 
            SUM(total_points) AS total_points,
            SUM(supply_count) AS supply_count,
            SUM(borrow_count) AS borrow_count,
            SUM(repay_count) AS repay_count,
            SUM(redeem_count) AS redeem_count,
            MAX(last_updated) AS last_updated
          FROM ${t.leaderboardUsers}
          WHERE wallet_address = ANY($1::text[])`,
          [walletAddresses]
        )
      ])

      const transactions = transactionData.rows || []
      const balanceHistory = balanceSnapshots.rows || []
      const currentPortfolio = portfolioApy.rows?.[0]
      const userStatsData = userStats.rows?.[0]

      // Calculate meaningful metrics
      const now = new Date()
      
      // Portfolio metrics
      const currentValue = (currentPortfolio?.total_supply_usd || 0) - (currentPortfolio?.total_borrow_usd || 0)
      const totalSupplied = currentPortfolio?.total_supply_usd || 0
      const totalBorrowed = currentPortfolio?.total_borrow_usd || 0
      const currentApy = currentPortfolio?.net_apy_pct || 0

      // Transaction metrics (including cross-chain)
      const supplyTransactions = transactions.filter(tx => 
        tx.action_type === 'supply' || tx.action_type === 'cross-chain_supply'
      )
      const borrowTransactions = transactions.filter(tx => 
        tx.action_type === 'borrow' || tx.action_type === 'cross-chain_borrow'
      )
      const repayTransactions = transactions.filter(tx => 
        tx.action_type === 'repay' || tx.action_type === 'cross-chain_repay'
      )
      const redeemTransactions = transactions.filter(tx => 
        tx.action_type === 'redeem' || tx.action_type === 'cross-chain_redeem'
      )

      const totalSupplyValue = supplyTransactions.reduce((sum, tx) => sum + (parseFloat(tx.usd_value) || 0), 0)
      const totalBorrowValue = borrowTransactions.reduce((sum, tx) => sum + (parseFloat(tx.usd_value) || 0), 0)

      // Calculate earnings based on supply duration
      let totalLifetimeEarnings = 0
      if (supplyTransactions.length > 0) {
        const sortedSupplies = supplyTransactions.sort((a, b) => 
          new Date(a.verified_at).getTime() - new Date(b.verified_at).getTime()
        )
        
        for (const supply of sortedSupplies) {
          const supplyDate = new Date(supply.verified_at)
          const supplyValue = parseFloat(supply.usd_value) || 0
          const daysEarning = Math.max(1, Math.floor((now.getTime() - supplyDate.getTime()) / (1000 * 60 * 60 * 24)))
          const periodEarnings = supplyValue * (currentApy / 100) * (daysEarning / 365)
          totalLifetimeEarnings += periodEarnings
        }
      }

      // Calculate portfolio growth
      const findHistoricalValue = (daysAgo: number) => {
        const targetDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000)
        const timeWindow = 2 * 24 * 60 * 60 * 1000
        
        const relevantSnapshots = balanceHistory.filter(snapshot => {
          const snapshotTime = new Date(snapshot.observed_at).getTime()
          return Math.abs(snapshotTime - targetDate.getTime()) <= timeWindow
        })
        
        if (relevantSnapshots.length > 0) {
          const closestSnapshot = relevantSnapshots.sort((a, b) => 
            Math.abs(new Date(a.observed_at).getTime() - targetDate.getTime()) - 
            Math.abs(new Date(b.observed_at).getTime() - targetDate.getTime())
          )[0]
          
          return (parseFloat(closestSnapshot.supplied_usd) || 0) - (parseFloat(closestSnapshot.borrowed_usd) || 0)
        }
        
        return currentValue * Math.max(0.8, 1 - (daysAgo * 0.01))
      }

      const value24hAgo = findHistoricalValue(1)
      const value7dAgo = findHistoricalValue(7)
      const value30dAgo = findHistoricalValue(30)

      // Asset breakdown from balance snapshots
      const assetBreakdown = balanceHistory.reduce((acc, snapshot) => {
        const assetId = snapshot.asset_id
        const supplied = parseFloat(snapshot.supplied_usd) || 0
        const borrowed = parseFloat(snapshot.borrowed_usd) || 0
        
        if (!acc[assetId]) {
          acc[assetId] = { supplied: 0, borrowed: 0, net: 0 }
        }
        
        acc[assetId].supplied = Math.max(acc[assetId].supplied, supplied)
        acc[assetId].borrowed = Math.max(acc[assetId].borrowed, borrowed)
        acc[assetId].net = acc[assetId].supplied - acc[assetId].borrowed
        
        return acc
      }, {} as Record<string, { supplied: number, borrowed: number, net: number }>)

      // Asset breakdown
      const assetList = Object.entries(assetBreakdown as Record<string, { supplied: number, borrowed: number, net: number }>).map(([assetId, data]) => ({
        assetId,
        supplied: data.supplied,
        borrowed: data.borrowed,
        net: data.net,
        percentage: currentValue > 0 ? (data.net / currentValue) * 100 : 0
      }));

      const response = {
        account: accountScope,
        portfolio: {
          currentValue,
          totalSupplied,
          totalBorrowed,
          netApy: currentApy,
          healthFactor: totalBorrowed > 0 ? totalSupplied / totalBorrowed : 0
        },
        growth: {
          portfolio24h: currentValue - value24hAgo,
          portfolio7d: currentValue - value7dAgo,
          portfolio30d: currentValue - value30dAgo,
          portfolio24hPercent: value24hAgo > 0 ? ((currentValue - value24hAgo) / value24hAgo) * 100 : 0,
          portfolio7dPercent: value7dAgo > 0 ? ((currentValue - value7dAgo) / value7dAgo) * 100 : 0,
          portfolio30dPercent: value30dAgo > 0 ? ((currentValue - value30dAgo) / value30dAgo) * 100 : 0
        },
        earnings: {
          totalLifetimeEarnings,
          monthlyEarnings: totalLifetimeEarnings * (30 / Math.max(1, Math.floor((now.getTime() - new Date(supplyTransactions[0]?.verified_at || now).getTime()) / (1000 * 60 * 60 * 24)))),
          dailyAverageEarnings: totalLifetimeEarnings / Math.max(1, Math.floor((now.getTime() - new Date(supplyTransactions[0]?.verified_at || now).getTime()) / (1000 * 60 * 60 * 24))),
          effectiveApy: currentApy
        },
        transactions: {
          totalCount: transactions.length,
          supplyCount: supplyTransactions.length,
          borrowCount: borrowTransactions.length,
          repayCount: repayTransactions.length,
          redeemCount: redeemTransactions.length,
          totalSupplyValue,
          totalBorrowValue,
          netTransactionValue: totalSupplyValue - totalBorrowValue
        },
        assets: assetList.sort((a, b) => b.net - a.net),
        userStats: {
          totalPoints: userStatsData?.total_points || 0,
          supplyCount: userStatsData?.supply_count || 0,
          borrowCount: userStatsData?.borrow_count || 0,
          lastUpdated: userStatsData?.last_updated
        },
        dataQuality: {
          hasTransactions: transactions.length > 0,
          hasBalanceHistory: balanceHistory.length > 0,
          hasPortfolioApy: !!currentPortfolio,
          lastTransactionDate: transactions[0]?.verified_at,
          lastBalanceSnapshot: balanceHistory[0]?.observed_at
        }
      }

      const resultData = { success: true, account: accountScope, data: response };
      portfolioCache.set(cacheKey, { data: resultData, timestamp: Date.now() });
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
    console.error('GET /api/user/portfolio-data error:', error)
    return NextResponse.json({ success: false, error: 'Failed to fetch portfolio data' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/database';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const wallet = searchParams.get('wallet')?.trim() || '';
    const TOKEN_MINT = process.env.SOLANA_TOKEN_MINT || 'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE';

    if (!wallet || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet)) {
      return NextResponse.json({ success: false, error: 'Invalid wallet address' }, { status: 400 });
    }

    // Fetch user's stats
    const userStats = await sql`
      SELECT 
        wallet_address,
        total_volume_usd,
        buy_volume_usd,
        sell_volume_usd,
        eligible_volume_usd,
        pending_rewards,
        current_balance,
        last_trade_at,
        last_synced_at
      FROM solana_trading_stats
      WHERE wallet_address = ${wallet} AND token_mint = ${TOKEN_MINT}
      LIMIT 1
    `;

    if (!userStats || userStats.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          wallet,
          totalVolume: 0,
          buyVolume: 0,
          sellVolume: 0,
          eligibleVolume: 0,
          pendingRewards: 0,
          currentBalance: 0,
          lastTradeAt: null,
          lastSyncedAt: null,
          rank: null,
        }
      });
    }

    const stats = userStats[0];

    // Calculate rank
    const rankResult = await sql`
      SELECT COUNT(*) + 1 as rank
      FROM solana_trading_stats
      WHERE token_mint = ${TOKEN_MINT}
        AND eligible_volume_usd > ${stats.eligible_volume_usd || 0}
    `;

    const rank = rankResult[0]?.rank || null;

    return NextResponse.json({
      success: true,
      data: {
        wallet: stats.wallet_address,
        totalVolume: Number(stats.total_volume_usd || 0),
        buyVolume: Number(stats.buy_volume_usd || 0),
        sellVolume: Number(stats.sell_volume_usd || 0),
        eligibleVolume: Number(stats.eligible_volume_usd || 0),
        pendingRewards: Number(stats.pending_rewards || 0),
        currentBalance: Number(stats.current_balance || 0),
        lastTradeAt: stats.last_trade_at,
        lastSyncedAt: stats.last_synced_at,
        rank: Number(rank),
      }
    });
  } catch (error) {
    console.error('Error fetching user stats:', error);
    return NextResponse.json({ success: false, error: 'Database error' }, { status: 500 });
  }
}




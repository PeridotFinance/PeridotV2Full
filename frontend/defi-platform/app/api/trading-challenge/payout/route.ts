import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/database';
import { applyPayoutCap, getRegisteredPayoutWallets } from '@/lib/solana-tracker';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limitParam = Number(searchParams.get('limit') || 500);
    const limit = Number.isFinite(limitParam)
      ? Math.max(1, Math.min(Math.floor(limitParam), 5000))
      : 500;

    const TOKEN_MINT = process.env.SOLANA_TOKEN_MINT || '8y45AJzCUBSZL1UDFQRzCKovQBLQFudBrpPeg5yNpump';
    const PAYOUT_CAP_USD = 10000;

    const wallets = await getRegisteredPayoutWallets(TOKEN_MINT, limit);
    const cappedPayout = applyPayoutCap(wallets, PAYOUT_CAP_USD);

    const totals = await sql`
      SELECT
        COUNT(*) AS wallet_count,
        COALESCE(SUM(COALESCE(pending_rewards, 0)), 0) AS total_pending_rewards
      FROM solana_trading_stats
      WHERE token_mint = ${TOKEN_MINT}
        AND COALESCE(is_registered, FALSE) = TRUE
        AND COALESCE(pending_rewards, 0) > 0
    `;

    return NextResponse.json({
      success: true,
      data: {
        wallets: cappedPayout.wallets,
        summary: {
          walletCount: cappedPayout.wallets.length,
          registeredWalletCount: Number(totals[0]?.wallet_count || 0),
          totalPendingRewards: Number(totals[0]?.total_pending_rewards || 0),
          uncappedTotalPending: cappedPayout.uncappedTotalPending,
          totalPayoutCapped: cappedPayout.cappedTotalPayout,
          remainingCap: cappedPayout.remainingCap,
          capAmount: cappedPayout.capAmount,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching payout-eligible wallets:', error);
    return NextResponse.json({ success: false, error: 'Database error' }, { status: 500 });
  }
}

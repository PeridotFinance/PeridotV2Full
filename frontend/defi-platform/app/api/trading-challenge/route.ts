import { NextResponse } from 'next/server';
import { sql } from '@/lib/database';
import { unstable_cache } from 'next/cache';

// Cache the heavy global leaderboard and aggregation queries
// This prevents the database from being hit more than once every 60 seconds
// globally, regardless of how many concurrent users are hitting the API.
const getGlobalChallengeData = unstable_cache(
  async (tokenMint: string) => {
    // 1. Fetch Top Traders
    // avg_hold_hours is pre-computed by the cron script — no expensive lateral join needed.
    const traders = await sql`
      SELECT
        wallet_address AS address,
        CASE
          WHEN COALESCE(eligible_volume_usd, 0) > 0 THEN eligible_volume_usd
          ELSE COALESCE(total_volume_usd, 0)
        END AS volume,
        COALESCE(pending_rewards, 0) AS reward,
        CASE
          WHEN avg_hold_hours IS NULL    THEN 'N/A'
          WHEN avg_hold_hours < 0.1     THEN '< 0.1h'
          ELSE CONCAT(ROUND(avg_hold_hours::numeric, 1)::text, 'h')
        END AS "holdTime",
        COALESCE(rank, 999) AS rank
      FROM solana_trading_stats
      WHERE token_mint = ${tokenMint}
        AND (COALESCE(eligible_volume_usd, 0) > 0 OR COALESCE(total_volume_usd, 0) > 0)
      ORDER BY
        CASE
          WHEN COALESCE(eligible_volume_usd, 0) > 0 THEN eligible_volume_usd
          ELSE COALESCE(total_volume_usd, 0)
        END DESC,
        wallet_address ASC
      LIMIT 10
    `;

    // 2. Fetch Global Challenge Stats Config
    const configResult = await sql`
      SELECT 
        total_volume_usd as "totalVolume",
        total_rewards_paid as "totalPayout",
        participant_count as "participantCount",
        reward_rate as "rewardRate",
        volume_threshold as "volumeThreshold",
        hold_threshold_hours as "holdThreshold"
      FROM solana_trading_challenge_config
      WHERE token_mint = ${tokenMint}
      LIMIT 1
    `;

    const config = configResult[0] || {
      totalVolume: 0,
      totalPayout: 0,
      participantCount: 0,
      rewardRate: 1,
      volumeThreshold: 500,
      holdThreshold: 3
    };

    // 3. Aggregate totals from individual stats for real-time display
    // Registered-wallets-only aggregate: drives payout progress bar and participant count.
    // totalVolume comes from config (cron-written from /tokens/{mint} API) — not here.
    const aggregatedStats = await sql`
      SELECT
        COUNT(DISTINCT wallet_address) as current_participant_count,
        SUM(COALESCE(pending_rewards, 0)) as current_total_payout
      FROM solana_trading_stats
      WHERE token_mint = ${tokenMint}
        AND COALESCE(is_registered, FALSE) = TRUE
        AND (COALESCE(eligible_volume_usd, 0) > 0 OR COALESCE(total_volume_usd, 0) > 0)
    `;

    const capAmount = 10000;
    const rawTotalPayout = Number(aggregatedStats[0]?.current_total_payout || config.totalPayout || 0);
    const cappedTotalPayout = Math.min(rawTotalPayout, capAmount);

    const stats = {
      // totalVolume = authoritative token volume written by the cron from /tokens/{mint}
      // Do NOT use aggregatedStats here — that query is registered-wallets-only.
      totalVolume: Number(config.totalVolume),
      totalPayout: cappedTotalPayout,
      remainingPayout: Math.max(0, capAmount - cappedTotalPayout),
      participantCount: Number(aggregatedStats[0]?.current_participant_count || config.participantCount),
      capAmount,
      rewardRate: config.rewardRate,
      volumeThreshold: config.volumeThreshold,
      holdThreshold: config.holdThreshold,
    };

    return { traders, stats };
  },
  ['global-trading-challenge-v1'], // Cache key
  { revalidate: 60, tags: ['trading-challenge'] } // Revalidate every 60 seconds
);

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userAddress = searchParams.get('address');

    // Current target token mint
    const TOKEN_MINT = process.env.SOLANA_TOKEN_MINT || '8y45AJzCUBSZL1UDFQRzCKovQBLQFudBrpPeg5yNpump';

    // 1. Get cached global data
    // This function result is cached by Next.js across requests for 60 seconds.
    // It shields the DB from the heavy Top 10 and aggregate SUM() queries.
    const { traders, stats } = await getGlobalChallengeData(TOKEN_MINT);

    // 2. Fetch user-specific stats directly
    // This is not globally cached because it's unique per user, BUT it is extremely fast 
    // because it uses a direct indexed point lookup (LIMIT 1 on wallet_address).
    let userStats = null;
    if (userAddress) {
      const userResult = await sql`
        SELECT 
          CASE
            WHEN COALESCE(eligible_volume_usd, 0) > 0 THEN eligible_volume_usd
            ELSE COALESCE(total_volume_usd, 0)
          END AS user_volume,
          COALESCE(pending_rewards, 0) AS user_reward
        FROM solana_trading_stats
        WHERE token_mint = ${TOKEN_MINT}
          AND wallet_address = ${userAddress}
        LIMIT 1
      `;
      if (userResult && userResult.length > 0) {
        userStats = {
          volume: Number(userResult[0].user_volume),
          reward: Number(userResult[0].user_reward),
        };
      }
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          traders: traders || [],
          stats: stats,
          userStats: userStats,
        },
      },
      {
        headers: {
          // Tell CDN/Edge network to cache the exact URL (including ?address=)
          // for 10 seconds locally, and serve stale content while refetching in the background.
          // This absorbs sudden bursts of refresh spam from a single user.
          'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=59',
        },
      }
    );
  } catch (error) {
    console.error('Error fetching trading challenge data:', error);
    return NextResponse.json({ success: false, error: 'Database error' }, { status: 500 });
  }
}

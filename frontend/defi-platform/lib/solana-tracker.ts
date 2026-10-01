import { sql } from './database';

const BASE_URL = 'https://data.solanatracker.io';
const API_KEY = process.env.SOLANATRACKER_API_KEY;

export async function syncWalletTrades(wallet: string, tokenMint: string) {
  if (!API_KEY) {
    throw new Error('SOLANATRACKER_API_KEY is not set');
  }

  let page = 1;
  let hasMore = true;
  let newTradesCount = 0;

  while (hasMore) {
    const url = `${BASE_URL}/wallet/${wallet}/trades${page > 1 ? `?page=${page}` : ''}`;
    const response = await fetch(url, {
      headers: { 'x-api-key': API_KEY },
    });

    if (!response.ok) {
      console.error(`Solana Tracker API error: ${response.statusText}`);
      break;
    }

    const data = await response.json();
    const trades = data.trades || [];

    if (trades.length === 0) {
      break;
    }

    for (const trade of trades) {
      const fromToken = trade.from?.address;
      const toToken = trade.to?.address;

      if (fromToken !== tokenMint && toToken !== tokenMint) {
        continue;
      }

      const txType = fromToken === tokenMint ? 'sell' : 'buy';
      const amount = txType === 'sell' ? trade.from?.amount : trade.to?.amount;

      await sql`
        INSERT INTO solana_trading_trades (
          signature, wallet_address, token_mint, transaction_type, 
          amount, usd_value, block_time
        ) VALUES (
          ${trade.tx},
          ${wallet},
          ${tokenMint},
          ${txType},
          ${amount},
          ${trade.volume?.usd || 0},
          ${trade.time}
        )
        ON CONFLICT (signature) DO NOTHING
      `;
      newTradesCount++;
    }

    // Smart pagination: if we got a full page (usually 50-100), try next page
    hasMore = trades.length >= 50;
    page++;
    
    // Safety break to prevent infinite loops
    if (page > 10) break; 
  }

  return newTradesCount;
}

export async function calculateEligibility(wallet: string, tokenMint: string) {
  const trades = await sql`
    SELECT signature, transaction_type, usd_value, block_time 
    FROM solana_trading_trades 
    WHERE wallet_address = ${wallet} AND token_mint = ${tokenMint}
    ORDER BY block_time ASC
  `;

  if (!trades || trades.length === 0) return 0;

  const holdThresholdMs = 3 * 3600 * 1000; // 3 hours
  let eligibleVol = 0;
  let totalBuy = 0;
  let totalSell = 0;

  const buys = trades.filter(t => t.transaction_type === 'buy');
  const sells = trades.filter(t => t.transaction_type === 'sell');

  for (const buy of buys) {
    totalBuy += Number(buy.usd_value);
    let isEligible = true;
    for (const sell of sells) {
      const timeDiff = Number(sell.block_time) - Number(buy.block_time);
      if (timeDiff > 0 && timeDiff < holdThresholdMs) {
        isEligible = false;
        break;
      }
    }
    if (isEligible) {
      eligibleVol += Number(buy.usd_value);
    }
  }

  for (const sell of sells) {
    totalSell += Number(sell.usd_value);
    eligibleVol += Number(sell.usd_value);
  }

  const pendingRewards = (eligibleVol / 500) * 1;

  await sql`
    INSERT INTO solana_trading_stats (
      wallet_address, token_mint, total_volume_usd, eligible_volume_usd, 
      buy_volume_usd, sell_volume_usd, pending_rewards, last_synced_at
    ) VALUES (
      ${wallet}, ${tokenMint}, ${totalBuy + totalSell}, ${eligibleVol},
      ${totalBuy}, ${totalSell}, ${pendingRewards}, NOW()
    )
    ON CONFLICT (wallet_address) DO UPDATE SET
      total_volume_usd = EXCLUDED.total_volume_usd,
      eligible_volume_usd = EXCLUDED.eligible_volume_usd,
      buy_volume_usd = EXCLUDED.buy_volume_usd,
      sell_volume_usd = EXCLUDED.sell_volume_usd,
      pending_rewards = EXCLUDED.pending_rewards,
      last_synced_at = NOW()
  `;

  return eligibleVol;
}

export async function aggregateGlobalStats(tokenMint: string) {
  const aggregated = await sql`
    SELECT
      SUM(eligible_volume_usd) as total_vol,
      COUNT(DISTINCT wallet_address) as participants,
      SUM(pending_rewards) as total_payout
    FROM solana_trading_stats
    WHERE token_mint = ${tokenMint}
      AND COALESCE(is_registered, FALSE) = TRUE
  `;

  const { total_vol, participants, total_payout } = aggregated[0];
  const cappedTotalPayout = Math.min(Number(total_payout || 0), 10000);
  const totalVolume = Number(total_vol || 0);

  await sql`
    INSERT INTO solana_trading_challenge_config (
      token_mint, total_volume_usd, total_rewards_paid, participant_count, last_updated_at
    ) VALUES (
      ${tokenMint},
      ${totalVolume},
      ${cappedTotalPayout},
      ${participants || 0},
      NOW()
    )
    ON CONFLICT (token_mint) DO UPDATE SET
      total_volume_usd = EXCLUDED.total_volume_usd,
      total_rewards_paid = EXCLUDED.total_rewards_paid,
      participant_count = EXCLUDED.participant_count,
      last_updated_at = NOW()
  `;
}

export interface RegisteredPayoutWallet {
  walletAddress: string;
  pendingRewards: number;
  eligibleVolumeUsd: number;
  joinedAt: string | null;
}

export interface CappedPayoutWallet extends RegisteredPayoutWallet {
  payoutAmount: number;
}

export interface CappedPayoutResult {
  wallets: CappedPayoutWallet[];
  uncappedTotalPending: number;
  cappedTotalPayout: number;
  remainingCap: number;
  capAmount: number;
}

export async function getRegisteredPayoutWallets(
  tokenMint: string,
  limit = 500
): Promise<RegisteredPayoutWallet[]> {
  const safeLimit = Number.isFinite(limit)
    ? Math.max(1, Math.min(Math.floor(limit), 5000))
    : 500;

  const rows = await sql`
    SELECT
      wallet_address AS "walletAddress",
      COALESCE(pending_rewards, 0) AS "pendingRewards",
      COALESCE(eligible_volume_usd, 0) AS "eligibleVolumeUsd",
      joined_at AS "joinedAt"
    FROM solana_trading_stats
    WHERE token_mint = ${tokenMint}
      AND COALESCE(is_registered, FALSE) = TRUE
      AND COALESCE(pending_rewards, 0) > 0
    ORDER BY COALESCE(pending_rewards, 0) DESC, wallet_address ASC
    LIMIT ${safeLimit}
  `;

  return rows.map((row: Record<string, unknown>) => ({
    walletAddress: String(row.walletAddress || ''),
    pendingRewards: Number(row.pendingRewards || 0),
    eligibleVolumeUsd: Number(row.eligibleVolumeUsd || 0),
    joinedAt: row.joinedAt ? String(row.joinedAt) : null,
  }));
}

export function applyPayoutCap(
  wallets: RegisteredPayoutWallet[],
  capAmount = 10000
): CappedPayoutResult {
  const normalizedCap = Number.isFinite(capAmount) ? Math.max(0, capAmount) : 10000;
  const uncappedTotalPending = wallets.reduce((sum, wallet) => sum + Number(wallet.pendingRewards || 0), 0);

  let remaining = normalizedCap;
  const cappedWallets: CappedPayoutWallet[] = [];

  for (const wallet of wallets) {
    const pending = Math.max(0, Number(wallet.pendingRewards || 0));
    const payoutAmount = remaining > 0 ? Math.min(pending, remaining) : 0;
    remaining -= payoutAmount;

    if (payoutAmount > 0) {
      cappedWallets.push({
        ...wallet,
        payoutAmount,
      });
    }

    if (remaining <= 0) break;
  }

  return {
    wallets: cappedWallets,
    uncappedTotalPending,
    cappedTotalPayout: normalizedCap - Math.max(0, remaining),
    remainingCap: Math.max(0, remaining),
    capAmount: normalizedCap,
  };
}

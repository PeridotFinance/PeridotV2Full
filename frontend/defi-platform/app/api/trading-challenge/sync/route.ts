import { NextRequest, NextResponse } from 'next/server';
import { syncWalletTrades, calculateEligibility, aggregateGlobalStats } from '@/lib/solana-tracker';
import { sql } from '@/lib/database';

// Request coalescing: prevent thundering herd
const pendingSyncs = new Map<string, Promise<any>>();

// Rate limiting: track last sync time per wallet
const lastSyncTime = new Map<string, number>();
const MIN_SYNC_INTERVAL_MS = 60000; // 1 minute minimum between syncs

// DOS protection: track sync attempts per IP
const syncAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_SYNCS_PER_HOUR = 10;

function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIP = request.headers.get('x-real-ip');
  return forwarded?.split(',')[0] || realIP || 'unknown';
}

const SOLANA_ADDRESS_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export async function POST(request: NextRequest) {
  try {
    const { wallet } = await request.json();
    const TOKEN_MINT = process.env.SOLANA_TOKEN_MINT || 'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE';
    const walletAddress = typeof wallet === 'string' ? wallet.trim() : '';

    // Validate address format before touching the DB or external API
    if (!walletAddress || !SOLANA_ADDRESS_REGEX.test(walletAddress)) {
      return NextResponse.json({ success: false, error: 'Invalid wallet address' }, { status: 400 });
    }

    const clientIP = getClientIP(request);
    const now = Date.now();

    // DOS Protection: Rate limit by IP
    const ipKey = `ip:${clientIP}`;
    const ipAttempts = syncAttempts.get(ipKey);
    if (ipAttempts && ipAttempts.resetAt > now) {
      if (ipAttempts.count >= MAX_SYNCS_PER_HOUR) {
        return NextResponse.json(
          { success: false, error: 'Rate limit exceeded. Please try again later.' },
          { status: 429 }
        );
      }
      ipAttempts.count++;
    } else {
      syncAttempts.set(ipKey, { count: 1, resetAt: now + 3600000 }); // 1 hour window
    }

    // Rate limiting: Check if wallet was synced recently
    const lastSync = lastSyncTime.get(walletAddress);
    if (lastSync && (now - lastSync) < MIN_SYNC_INTERVAL_MS) {
      // Return cached data instead of error
      const cached = await sql`
        SELECT eligible_volume_usd, pending_rewards, last_synced_at
        FROM solana_trading_stats
        WHERE wallet_address = ${walletAddress} AND token_mint = ${TOKEN_MINT}
        LIMIT 1
      `;
      
      if (cached && cached.length > 0) {
        return NextResponse.json(
          {
            success: true,
            data: {
              eligibleVolume: Number(cached[0].eligible_volume_usd || 0),
              pendingRewards: Number(cached[0].pending_rewards || 0),
              lastSyncedAt: cached[0].last_synced_at,
              message: 'Using cached data (recently synced)',
              cached: true
            }
          },
          {
            headers: {
              'X-Rate-Limit-Remaining': '0',
              'X-Rate-Limit-Reset': new Date(lastSync + MIN_SYNC_INTERVAL_MS).toISOString()
            }
          }
        );
      }
    }

    // Gate: only registered wallets may trigger an on-demand sync.
    // This prevents arbitrary wallet scanning and protects the Solana Tracker API quota.
    const registration = await sql`
      SELECT is_registered
      FROM solana_trading_stats
      WHERE wallet_address = ${walletAddress} AND token_mint = ${TOKEN_MINT}
      LIMIT 1
    `;
    if (!registration[0]?.is_registered) {
      return NextResponse.json(
        { success: false, error: 'Wallet has not joined the challenge' },
        { status: 403 }
      );
    }

    // Request coalescing: If a sync is already in progress for this wallet, wait for it
    const syncKey = `wallet:${walletAddress}`;
    if (pendingSyncs.has(syncKey)) {
      const existingSync = await pendingSyncs.get(syncKey);
      return NextResponse.json(existingSync);
    }

    // Start new sync
    const syncPromise = (async () => {
      try {
        // 1. Sync new trades
        await syncWalletTrades(walletAddress, TOKEN_MINT);

        // 2. Re-calculate eligibility and rewards
        const eligibleVolume = await calculateEligibility(walletAddress, TOKEN_MINT);

        // 3. Update global stats (fire and forget to speed up response)
        aggregateGlobalStats(TOKEN_MINT).catch(err => 
          console.error(`[Sync] Background global stats update failed:`, err)
        );

        lastSyncTime.set(walletAddress, now);

        return {
          success: true,
          data: {
            eligibleVolume,
            message: 'Sync completed'
          }
        };
      } catch (error) {
        console.error('Sync error:', error);
        throw error;
      } finally {
        // Clean up after 5 seconds to allow coalescing window
        setTimeout(() => pendingSyncs.delete(syncKey), 5000);
      }
    })();

    pendingSyncs.set(syncKey, syncPromise);
    const result = await syncPromise;
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Sync error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

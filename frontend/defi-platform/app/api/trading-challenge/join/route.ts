import { NextResponse } from 'next/server';
import { sql } from '@/lib/database';
import { syncWalletTrades, calculateEligibility } from '@/lib/solana-tracker';

// In-flight sync tracker — prevents duplicate syncs for the same wallet
const syncInFlight = new Set<string>();

function triggerBackgroundSync(walletAddress: string, tokenMint: string) {
  if (syncInFlight.has(walletAddress)) return;
  syncInFlight.add(walletAddress);

  syncWalletTrades(walletAddress, tokenMint)
    .then(() => calculateEligibility(walletAddress, tokenMint))
    .catch(err => console.error(`[Join] Background sync failed for ${walletAddress}:`, err))
    .finally(() => syncInFlight.delete(walletAddress));
}

// In-memory lock to prevent thundering herd / double clicks for the same wallet
const joinLocks = new Set<string>();

export async function POST(req: Request) {
  try {
    const { walletAddress } = await req.json();
    
    if (!walletAddress || typeof walletAddress !== 'string') {
      return NextResponse.json({ success: false, error: 'Valid wallet address is required' }, { status: 400 });
    }

    // Basic Solana address validation (base58, 32-44 chars)
    // For EVM it would be /^0x[a-fA-F0-9]{40}$/ but since this is Solana, we use length and chars
    const solanaAddressRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    if (!solanaAddressRegex.test(walletAddress)) {
      return NextResponse.json({ success: false, error: 'Invalid wallet address format' }, { status: 400 });
    }

    // Thundering herd / debounce protection
    if (joinLocks.has(walletAddress)) {
      return NextResponse.json({ success: false, error: 'Registration already in progress' }, { status: 429 });
    }
    joinLocks.add(walletAddress);

    try {
      // Current target token mint (e.g., from env or config)
      const TOKEN_MINT = process.env.SOLANA_TOKEN_MINT || '8y45AJzCUBSZL1UDFQRzCKovQBLQFudBrpPeg5yNpump';

      const existing = await sql`
        SELECT COALESCE(is_registered, FALSE) AS is_registered
        FROM solana_trading_stats
        WHERE wallet_address = ${walletAddress}
        LIMIT 1
      `;

      if (existing[0]?.is_registered) {
        return NextResponse.json(
          {
            success: false,
            code: 'ALREADY_JOINED',
            error: 'Wallet already joined the challenge',
          },
          { status: 409 }
        );
      }

      // Insert user into stats table if they don't exist.
      // If they already exist (e.g., auto-synced top trader), mark them as registered.
      // By setting last_synced_at to NULL for new rows, the python sync script will pick them up
      // as "needing a sync" on its next run.
      await sql`
        INSERT INTO solana_trading_stats (
          wallet_address, token_mint, total_volume_usd, buy_volume_usd, sell_volume_usd, 
          eligible_volume_usd, pending_rewards, current_balance, last_synced_at,
          is_registered, joined_at
        )
        VALUES (
          ${walletAddress}, ${TOKEN_MINT}, 0, 0, 0, 0, 0, 0, NULL, TRUE, NOW()
        )
        ON CONFLICT (wallet_address) DO UPDATE SET
          is_registered = TRUE,
          joined_at = NOW()
      `;

      // Kick off a trade sync in the background so the user sees their stats
      // without waiting for the next cron run. Non-blocking — response returns immediately.
      triggerBackgroundSync(walletAddress, TOKEN_MINT);

      return NextResponse.json({ success: true, message: 'Joined challenge successfully', alreadyJoined: false, syncing: true });
    } finally {
      // Always release the lock after operation completes (success or fail)
      // Use setTimeout to create a small debounce window preventing rapid repetitive successes
      setTimeout(() => {
        joinLocks.delete(walletAddress);
      }, 2000);
    }
  } catch (error) {
    console.error('Error joining trading challenge:', error);
    return NextResponse.json({ success: false, error: 'Database error' }, { status: 500 });
  }
}

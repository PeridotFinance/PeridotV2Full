import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/database'
import { getTableNames } from '@/lib/tableResolver'
import { resolveReferralScope } from '@/lib/referral/scope'
import { normalizeWalletAddress, isSupportedWallet } from '@/lib/walletKeys'
import { REFERRAL_TABLES as T } from '@/lib/referral/ambassador'

/**
 * GET /api/referral/referred-transactions?referred=0x…&limit=20
 *
 * Returns a REDUCED transaction list for a wallet the authenticated caller
 * provably referred. Replaces the old invite-page pattern of hitting
 * /api/user/transactions with an arbitrary address — which let anyone read
 * anyone's full history.
 *
 * Two guards:
 *  1. The caller must be authenticated (Privy token → owned addresses).
 *  2. The `referred` address must appear in `referrals` with one of the
 *     caller's own addresses as the referrer. No relationship → 403.
 *
 * Privacy minimisation vs /api/user/transactions:
 *  - We query ONLY the exact referred address, never its linked-wallet graph,
 *    so the referrer can't enumerate the referred user's other wallets.
 *  - We omit tx_hash and usd_value — the referrer sees activity type/amount to
 *    confirm the referral is active, not a full financial dossier.
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const referredRaw = searchParams.get('referred')
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10) || 20, 50)

    if (!referredRaw || !isSupportedWallet(referredRaw)) {
      return NextResponse.json({ success: false, error: 'Invalid referred address' }, { status: 400 })
    }
    // Chain-native: a Stellar G-address must not be lowercased (lib/walletKeys).
    const referred = normalizeWalletAddress(referredRaw.trim())

    const { scope } = await resolveReferralScope(request)
    if (!scope) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }
    // The referrer may hold the referral under an EVM wallet while browsing
    // with their Stellar one (or the other way round) — prove the relationship
    // against every address the session owns.
    const owned = scope.owned
    if (owned.length === 0) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    // Prove the caller actually referred this wallet. Mirrors the table the
    // invite page's stats endpoint reads (plain `referrals`).
    const rel = await query(
      `SELECT 1 FROM ${T.referrals}
       WHERE referred_wallet_address = $1
         AND referrer_wallet_address = ANY($2::text[])
       LIMIT 1`,
      [referred, owned]
    )
    if (!rel.rows?.length) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const t = getTableNames()
    const txData = await query(
      `SELECT action_type, token_symbol, amount, verified_at, chain_id
       FROM ${t.verifiedTransactions}
       WHERE wallet_address = $1
         AND is_valid = true
       ORDER BY verified_at DESC
       LIMIT $2`,
      [referred, limit]
    )

    return NextResponse.json(
      { success: true, transactions: txData.rows || [] },
      { headers: { 'Cache-Control': 'private, no-store' } }
    )
  } catch (err) {
    console.error('[referral/referred-transactions]', err)
    return NextResponse.json({ success: false, error: 'Failed to load transactions' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { sql, normalizeWalletAddress, profileKey } from '@/lib/database'
import { getTableNames } from '@/lib/tableResolver'
import { ethers } from 'ethers'
import { authorizeStellarAddress } from '@/lib/stellar/wallet-auth'
import { isNameAllowed } from '@/lib/challenge/handles'
import {
  getAccountIdForEvmAddress,
  getAccountIdForParticipantAddress,
  getAccountIdForStellarAddress,
  syncHandleForAccount,
} from '@/lib/challenge/db'

const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,32}$/
const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/
const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/
const RESERVED = new Set([
  'app','api','invite','leaderboard','stats','bridge','admin','privacy','terms','support','login','signup','settings','user','users'
])

function isReservedUsername(name: string): boolean {
  return RESERVED.has(name.toLowerCase())
}

// Message template for the EVM signature
function buildMessage(username: string, wallet: string, timestamp: number) {
  return `Peridot: set username ${username} for ${wallet} at ${timestamp}`
}

export async function POST(request: NextRequest) {
  try {
    const t = getTableNames()
    const { walletAddress, username, signature, timestamp } = await request.json()

    if (!walletAddress || !username) {
      return NextResponse.json({ success: false, error: 'Missing fields' }, { status: 400 })
    }

    const isEvm = EVM_ADDRESS_RE.test(walletAddress)
    const isStellar = !isEvm && STELLAR_ADDRESS_RE.test(String(walletAddress).toUpperCase())
    if (!isEvm && !isStellar) {
      return NextResponse.json({ success: false, error: 'Invalid wallet address' }, { status: 400 })
    }

    if (!USERNAME_REGEX.test(username)) {
      return NextResponse.json({ success: false, error: 'Invalid username format' }, { status: 400 })
    }

    if (isReservedUsername(username)) {
      return NextResponse.json({ success: false, error: 'Username is reserved' }, { status: 400 })
    }

    // Same denylist the trading-challenge handles go through: the name lands on
    // public boards (leaderboard AND challenge, since they now share it).
    if (!isNameAllowed(username)) {
      return NextResponse.json({ success: false, error: 'That name is not allowed' }, { status: 400 })
    }

    if (isEvm) {
      // EVM proof: a personal_sign over the canonical message.
      if (!signature || !timestamp) {
        return NextResponse.json({ success: false, error: 'Missing fields' }, { status: 400 })
      }
      const now = Date.now()
      if (Math.abs(now - Number(timestamp)) > 5 * 60 * 1000) {
        return NextResponse.json({ success: false, error: 'Timestamp too old' }, { status: 400 })
      }

      const message = buildMessage(username, walletAddress.toLowerCase(), Number(timestamp))
      let recovered: string
      try {
        recovered = ethers.verifyMessage(message, signature)
      } catch (e) {
        return NextResponse.json({ success: false, error: 'Invalid signature' }, { status: 400 })
      }

      if (recovered.toLowerCase() !== walletAddress.toLowerCase()) {
        return NextResponse.json({ success: false, error: 'Signature does not match wallet' }, { status: 400 })
      }
    } else {
      // Stellar proof: ed25519 message signing isn't uniform across wallets, so
      // instead of a per-request signature we accept the two credentials that
      // each already required one — the wallet-session cookie (minted after the
      // user signed the sign-in challenge) or a Privy bearer whose linked
      // accounts contain this G-address. Same rule as the margin journal and
      // the challenge join route.
      const auth = await authorizeStellarAddress(request, String(walletAddress).toUpperCase())
      if (!auth.ok) {
        return NextResponse.json({ success: false, error: 'Wallet not verified — sign in with this wallet first' }, { status: auth.status ?? 401 })
      }
    }

    // Two different keys on purpose: the season archive / tx / login tables are
    // wallet-identity tables and keep chain-native casing (a G-address stays
    // uppercase), while user_profiles is lowercase-keyed on every chain.
    const wallet = normalizeWalletAddress(walletAddress)
    const profileWallet = profileKey(walletAddress)

    // Ensure uniqueness (case-insensitive)
    const existing = await sql`
      SELECT wallet_address FROM ${sql(t.userProfiles)} WHERE LOWER(username) = ${username.toLowerCase()} LIMIT 1
    `
    if ((existing as any[]).length > 0) {
      const owner = (existing as any[])[0].wallet_address as string
      if (owner.toLowerCase() !== profileWallet) {
        return NextResponse.json({ success: false, error: 'Username already taken' }, { status: 409 })
      }
    }

    // Look up any S1 badges earned in the season archive so they survive into the new profile
    const archiveTable = t.userProfiles === 'user_profiles' ? 'leaderboard_season_archive' : 'leaderboard_season_archive_mainnet'
    const txTable = t.userProfiles === 'user_profiles' ? 'verified_transactions' : 'verified_transactions_mainnet'
    const loginsTable = t.userProfiles === 'user_profiles' ? 'daily_logins' : 'daily_logins_mainnet'
    const S1_END = '2026-03-17T00:00:00Z'

    let s1BadgeIds: string[] = []
    try {
      const { getEarnedBadges } = await import('@/lib/achievements')
      const [archiveRows, txRows, streakRows] = await Promise.all([
        sql.unsafe(`SELECT final_points, total_login_days, supply_count, borrow_count, repay_count, redeem_count FROM ${archiveTable} WHERE season_id = 's1' AND wallet_address = $1`, [wallet]) as Promise<any[]>,
        sql.unsafe(`SELECT COALESCE(SUM(usd_value),0)::float AS total_usd, COUNT(*) FILTER (WHERE action_type='supply')::int AS supply_cnt, COUNT(*) FILTER (WHERE action_type='borrow')::int AS borrow_cnt, COUNT(*) FILTER (WHERE action_type='repay')::int AS repay_cnt, COUNT(*) FILTER (WHERE action_type='redeem')::int AS redeem_cnt FROM ${txTable} WHERE wallet_address=$1 AND is_valid=true AND verified_at<$2::timestamptz`, [wallet, S1_END]) as Promise<any[]>,
        sql.unsafe(`WITH days AS (SELECT DISTINCT login_date FROM ${loginsTable} WHERE wallet_address=$1 AND login_date<$2::date), grp AS (SELECT login_date, login_date-(ROW_NUMBER() OVER (ORDER BY login_date))::int AS g FROM days), streaks AS (SELECT COUNT(*)::int AS len FROM grp GROUP BY g) SELECT COALESCE(MAX(len),0)::int AS max_streak FROM streaks`, [wallet, S1_END]) as Promise<any[]>,
      ])
      if (archiveRows.length > 0) {
        const row = archiveRows[0]
        const tx = txRows[0]
        const streak = streakRows[0]?.max_streak ?? 0
        const totalTx = (row.supply_count ?? 0) + (row.borrow_count ?? 0) + (row.repay_count ?? 0) + (row.redeem_count ?? 0)
        const ctx = {
          userXp: Number(row.final_points ?? 0),
          seasonId: 's1' as const,
          totalTransactions: totalTx,
          transactionsByType: { supply: Number(tx?.supply_cnt ?? 0), borrow: Number(tx?.borrow_cnt ?? 0), repay: Number(tx?.repay_cnt ?? 0), redeem: Number(tx?.redeem_cnt ?? 0) },
          totalUsdVolume: Number(tx?.total_usd ?? 0),
          totalLoginDays: Number(row.total_login_days ?? 0),
          loginStreak: streak,
          maxLoginStreak: streak,
          supplyPositionDays: 0,
          completedAchievementsCount: 0,
        }
        s1BadgeIds = getEarnedBadges(ctx, 's1').map((b: any) => b.id)
      }
    } catch { /* non-fatal: profile still created without S1 badges */ }

    const initialBadges = s1BadgeIds.length > 0
      ? JSON.stringify({ earned: s1BadgeIds })
      : '[]'

    // Upsert profile — merge S1 badges into earned on conflict
    await sql.unsafe(`
      INSERT INTO ${t.userProfiles} (wallet_address, username, badges)
      VALUES ($1, $2, $3::jsonb)
      ON CONFLICT (wallet_address) DO UPDATE SET
        username = EXCLUDED.username,
        badges = CASE
          WHEN ${t.userProfiles}.badges IS NULL OR jsonb_typeof(${t.userProfiles}.badges) <> 'object'
          THEN EXCLUDED.badges
          ELSE jsonb_set(
            ${t.userProfiles}.badges,
            '{earned}',
            (
              SELECT COALESCE(jsonb_agg(DISTINCT elem), '[]'::jsonb)
              FROM (
                SELECT jsonb_array_elements_text(COALESCE(${t.userProfiles}.badges->'earned','[]'::jsonb)) AS elem
                UNION
                SELECT jsonb_array_elements_text(COALESCE(EXCLUDED.badges->'earned','[]'::jsonb)) AS elem
              ) combined
            )
          )
        END,
        updated_at = NOW()
    `, [profileWallet, username, initialBadges])

    // One name everywhere: carry the change onto any trading challenge this
    // wallet's account is entered in. Best-effort — a deployment without the
    // challenge tables must not fail the rename itself.
    try {
      let accountId = isStellar
        ? await getAccountIdForStellarAddress(String(walletAddress).toUpperCase())
        : await getAccountIdForEvmAddress(wallet)
      // No verified link row yet? A live participant row for this address is
      // proof enough — the join route verified ownership before writing it.
      if (!accountId && isStellar) {
        accountId = await getAccountIdForParticipantAddress(String(walletAddress).toUpperCase())
      }
      if (accountId) await syncHandleForAccount(accountId, username)
    } catch (e) {
      console.warn('set-username: challenge handle sync skipped:', e)
    }

    const res = await sql`
      SELECT wallet_address, username, xp, badges, created_at, updated_at
      FROM ${sql(t.userProfiles)}
      WHERE wallet_address = ${profileWallet}
      LIMIT 1
    `

    return NextResponse.json({ success: true, data: (res as any[])[0] })
  } catch (error) {
    console.error('POST /api/user/profile/set-username error:', error)
    return NextResponse.json({ success: false, error: 'Failed to set username' }, { status: 500 })
  }
}

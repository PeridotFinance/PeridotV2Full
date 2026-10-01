import { NextRequest, NextResponse } from 'next/server'
import { query, sql } from '@/lib/database'
import { getTableNames } from '@/lib/tableResolver'
import { normalizeWalletAddress, isSupportedWallet } from '@/lib/walletKeys'
import { resolveAccountIdentity } from '@/lib/accountIdentity'
import { REFERRAL_TABLES as T } from '@/lib/referral/ambassador'

export async function POST(request: NextRequest) {
  try {
    const { referralCode, referredWalletAddress } = await request.json()

    if (!referralCode || !referredWalletAddress) {
      return NextResponse.json(
        { error: 'Referral code and referred wallet address are required' },
        { status: 400 }
      )
    }

    // Stellar G-addresses are case-significant and 56 characters long — they
    // must not be lowercased on the way in (see lib/walletKeys).
    if (!isSupportedWallet(referredWalletAddress)) {
      return NextResponse.json({ error: 'Unsupported wallet address' }, { status: 400 })
    }
    const referred = normalizeWalletAddress(String(referredWalletAddress).trim())

    // Resolve referrer by code OR username
    let referrerAddress: string | null = null
    {
      const codeResult = await query(
        `SELECT user_wallet_address FROM ${T.referralCodes} WHERE referral_code = $1`,
        [String(referralCode).toUpperCase()]
      )
      if (codeResult.rows.length > 0) {
        referrerAddress = codeResult.rows[0].user_wallet_address
      }
    }

    if (!referrerAddress) {
      const t = getTableNames()
      const rows = await sql`
        SELECT wallet_address FROM ${sql(t.userProfiles)}
        WHERE LOWER(username) = ${String(referralCode).toLowerCase()}
        LIMIT 1
      `
      if ((rows as any[]).length > 0) {
        // `user_profiles` is lowercase-keyed on every chain, so a Stellar
        // referrer comes back as an invalid lowercased G-address. Canonicalise
        // through referral_codes — which stores addresses chain-natively —
        // before it reaches the foreign key.
        const fromProfile = (rows as any[])[0].wallet_address as string
        const canonical = await query(
          `SELECT user_wallet_address FROM ${T.referralCodes}
            WHERE LOWER(user_wallet_address) = LOWER($1) LIMIT 1`,
          [fromProfile]
        )
        referrerAddress = canonical.rows[0]?.user_wallet_address ?? null
      }
    }

    if (!referrerAddress) {
      return NextResponse.json(
        { error: 'Invalid referral code or username' },
        { status: 404 }
      )
    }

    // Check if user is trying to refer themselves
    if (referrerAddress.toLowerCase() === referred.toLowerCase()) {
      return NextResponse.json(
        { error: 'Cannot refer yourself' },
        { status: 400 }
      )
    }

    // …including with a second wallet. The Ambassador Program pays real money
    // per qualifying invitee, so one person holding both ends of a referral is
    // worth catching here rather than at payout time.
    try {
      const [referrerIdentity, referredIdentity] = await Promise.all([
        resolveAccountIdentity(referrerAddress),
        resolveAccountIdentity(referred),
      ])
      if (
        referrerIdentity.accountId != null &&
        referrerIdentity.accountId === referredIdentity.accountId
      ) {
        return NextResponse.json({ error: 'Cannot refer yourself' }, { status: 400 })
      }
    } catch {
      // Identity resolution is a guard, not a gate — a lookup failure must not
      // drop a legitimate referral. The sweep re-checks before booking rewards.
    }

    // Check if user has already been referred
    const existingReferral = await query(
      `SELECT id FROM ${T.referrals} WHERE referred_wallet_address = $1`,
      [referred]
    )

    if (existingReferral.rows.length > 0) {
      return NextResponse.json(
        { error: 'User has already been referred' },
        { status: 400 }
      )
    }

    // Track the referral
    await query(
      `INSERT INTO ${T.referrals} (referrer_wallet_address, referred_wallet_address, referral_code) VALUES ($1, $2, $3)`,
      [referrerAddress, referred, referralCode.toUpperCase()]
    )

    return NextResponse.json({
      success: true,
      message: 'Referral tracked successfully',
      referrer: referrerAddress
    })

  } catch (error) {
    console.error('Error tracking referral:', error)
    return NextResponse.json(
      { error: 'Failed to track referral' },
      { status: 500 }
    )
  }
}

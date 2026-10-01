import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/database'
import { resolveReferralScope } from '@/lib/referral/scope'
import { normalizeWalletAddress, isSupportedWallet } from '@/lib/walletKeys'
import { REFERRAL_TABLES as T } from '@/lib/referral/ambassador'
import crypto from 'crypto'

// Generate a unique referral code
function generateReferralCode(walletAddress: string): string {
  // Take last 6 characters of wallet address
  const suffix = walletAddress.slice(-6).toUpperCase()
  
  // Generate 4 random characters
  const randomChars = crypto.randomBytes(2).toString('hex').toUpperCase()
  
  return suffix + randomChars
}

export async function POST(request: NextRequest) {
  try {
    const { walletAddress } = await request.json()

    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Wallet address is required' },
        { status: 400 }
      )
    }

    // Only generate a referral code for the caller's own wallet — proven by a
    // Privy bearer or the Stellar wallet-session cookie.
    const { scope, denied } = await resolveReferralScope(request, walletAddress)
    if (!scope) {
      return NextResponse.json(
        { error: denied ? 'Forbidden' : 'Unauthorized' },
        { status: denied ? 403 : 401 }
      )
    }

    if (!isSupportedWallet(walletAddress)) {
      return NextResponse.json({ error: 'Unsupported wallet address' }, { status: 400 })
    }
    // Chain-native key: EVM lowercased, Stellar preserved (see lib/walletKeys).
    const wallet = normalizeWalletAddress(String(walletAddress).trim())

    // Check if user already has a referral code
    const existingCode = await query(
      `SELECT referral_code FROM ${T.referralCodes} WHERE user_wallet_address = $1`,
      [wallet]
    )

    if (existingCode.rows.length > 0) {
      return NextResponse.json({
        success: true,
        referralCode: existingCode.rows[0].referral_code,
        message: 'Existing referral code retrieved'
      })
    }

    // Generate new referral code with collision checking
    let newCode: string
    let attempts = 0
    const maxAttempts = 10

    do {
      newCode = generateReferralCode(wallet)

      // Check if code already exists
      const codeExists = await query(
        `SELECT referral_code FROM ${T.referralCodes} WHERE referral_code = $1`,
        [newCode]
      )
      
      if (codeExists.rows.length === 0) {
        break // Code is unique
      }
      
      attempts++
      if (attempts >= maxAttempts) {
        throw new Error('Unable to generate unique referral code')
      }
    } while (attempts < maxAttempts)

    // Insert new referral code
    await query(
      `INSERT INTO ${T.referralCodes} (user_wallet_address, referral_code) VALUES ($1, $2)`,
      [wallet, newCode]
    )

    // Initialize stats entry
    await query(
      `INSERT INTO ${T.referralStats} (user_wallet_address) VALUES ($1) ON CONFLICT DO NOTHING`,
      [wallet]
    )

    return NextResponse.json({
      success: true,
      referralCode: newCode,
      message: 'Referral code generated successfully'
    })

  } catch (error) {
    console.error('Error generating referral code:', error)
    return NextResponse.json(
      { error: 'Failed to generate referral code' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const walletAddress = searchParams.get('walletAddress')

    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Wallet address is required' },
        { status: 400 }
      )
    }

    // Get existing referral code
    const result = await query(
      `SELECT referral_code, created_at FROM ${T.referralCodes} WHERE user_wallet_address = $1`,
      [normalizeWalletAddress(walletAddress.trim())]
    )

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'No referral code found for this wallet' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      referralCode: result.rows[0].referral_code,
      createdAt: result.rows[0].created_at
    })

  } catch (error) {
    console.error('Error fetching referral code:', error)
    return NextResponse.json(
      { error: 'Failed to fetch referral code' },
      { status: 500 }
    )
  }
} 
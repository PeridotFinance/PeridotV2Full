import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { getTableNames } from '@/lib/tableResolver'
import { ethers } from 'ethers'

// Configuration: active codes and their point values
const ACTIVE_CODES: Record<string, number> = {
  'LAUNCH2025': 300,
  'SECRET_EVENT_1': 500,
  // You can also load these from process.env if you prefer
}

function buildMessage(code: string, wallet: string, timestamp: number) {
  return `I am redeeming code "${code}" for wallet ${wallet.toLowerCase()} at timestamp ${timestamp}`
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { walletAddress, signature, timestamp, code, type } = body || {}

    if (!walletAddress || !signature || !timestamp || !code) {
      return NextResponse.json({ success: false, error: 'Missing fields' }, { status: 400 })
    }

    // 1. Validate Code
    const upperCode = code.toUpperCase().trim()
    const pointsToAward = ACTIVE_CODES[upperCode]

    if (!pointsToAward) {
      return NextResponse.json({ success: false, error: 'Invalid or expired code' }, { status: 400 })
    }

    // 2. Security: Verify Timestamp (prevent replay attacks > 5 mins)
    const now = Date.now()
    if (Math.abs(now - Number(timestamp)) > 5 * 60 * 1000) {
      return NextResponse.json({ success: false, error: 'Timestamp too old' }, { status: 400 })
    }

    // 3. Security: Verify Signature
    const msg = buildMessage(upperCode, walletAddress, Number(timestamp))
    let recovered: string
    try {
      recovered = ethers.verifyMessage(msg, signature)
    } catch (err) {
      console.error('Signature verification failed:', err)
      return NextResponse.json({ success: false, error: 'Invalid signature' }, { status: 400 })
    }

    if (recovered.toLowerCase() !== walletAddress.toLowerCase()) {
      return NextResponse.json({ success: false, error: 'Signature does not match wallet' }, { status: 400 })
    }

    const t = getTableNames()

    // 4. Check if already redeemed
    const existing = await sql`
      SELECT id FROM ${sql(t.userSecretRedemptions)}
      WHERE wallet_address = ${walletAddress.toLowerCase()}
      AND code = ${upperCode}
      LIMIT 1
    `

    if ((existing as any[]).length > 0) {
      return NextResponse.json({ success: false, error: 'Code already redeemed' }, { status: 400 })
    }

    // 5. Execute Redemption (Record Log + Award Points)
    try {
      // A. Insert Log
      await sql`
        INSERT INTO ${sql(t.userSecretRedemptions)} (wallet_address, code, points_awarded)
        VALUES (${walletAddress.toLowerCase()}, ${upperCode}, ${pointsToAward})
      `

      // B. Update Profile (Upsert to ensure row exists)
      // If user doesn't exist, create them. If they do, add points.
      await sql`
        INSERT INTO ${sql(t.userProfiles)} (wallet_address, username, secret_points)
        VALUES (${walletAddress.toLowerCase()}, 'User', ${pointsToAward})
        ON CONFLICT (wallet_address) 
        DO UPDATE SET secret_points = COALESCE(${sql(t.userProfiles)}.secret_points, 0) + ${pointsToAward}
      `

      return NextResponse.json({ 
        success: true, 
        data: { 
          pointsAwarded: pointsToAward,
          code: upperCode
        } 
      })
    } catch (dbError) {
      console.error('Database error during redemption:', dbError)
      // If insert fails (e.g. concurrent race condition on unique constraint), treat as already redeemed or error
      return NextResponse.json({ success: false, error: 'Failed to process redemption' }, { status: 500 })
    }

  } catch (error) {
    console.error('Redeem error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}


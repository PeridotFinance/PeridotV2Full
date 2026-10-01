import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { ephemeralShareStore, SharePayload } from '@/lib/ephemeralShareStore'

export async function POST(req: NextRequest) {
  try {
    const { walletAddress, usernameOrAddr, points, rank, tierLabel, medals, referralUrl } = await req.json()

    if (!walletAddress || typeof points !== 'number' || !referralUrl) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    const origin = req.nextUrl?.origin || process.env.NEXT_PUBLIC_APP_BASE_URL || 'https://live.peridot.finance'

    // Normalize referral URL to the current origin so no 'localhost' leaks from the client
    let normalizedReferralUrl = `${origin}/app`
    let refValue: string | null = null
    try {
      const ru = new URL(String(referralUrl))
      refValue = ru.searchParams.get('ref')
      if (refValue) {
        normalizedReferralUrl = `${origin}/app?ref=${encodeURIComponent(refValue)}`
      }
    } catch {}

    const payload: SharePayload = {
      walletAddress: String(walletAddress),
      usernameOrAddr: String(usernameOrAddr || walletAddress),
      points: Number(points),
      rank: typeof rank === 'number' || typeof rank === 'string' ? rank : '?',
      tierLabel: String(tierLabel || ''),
      medals: Array.isArray(medals) ? medals.slice(0, 24) : [],
      referralUrl: normalizedReferralUrl,
    }

    // Shorter token to keep the share URL cleaner (12 hex chars)
    const token = crypto.randomBytes(6).toString('hex')
    const ttlMs = 60_000
    ephemeralShareStore.set(token, payload, ttlMs)

    // We create a short-lived share URL that binds OG meta to the referral URL for 60s
    // Example A: /app/share/[token] (legacy)
    const shareUrl = `${origin}/app/share/${token}`

    // Example B: referral-friendly share URL at /app/ref/[ref]/[token]
    let referralShareUrl = shareUrl
    if (refValue) {
      referralShareUrl = `${origin}/app/ref/${encodeURIComponent(refValue)}/${token}`
    }

    return NextResponse.json({ success: true, token, shareUrl, referralShareUrl, expiresInMs: ttlMs })
  } catch (e) {
    return NextResponse.json({ error: 'Failed to create share link' }, { status: 500 })
  }
}



import { Buffer } from 'buffer'
import { NextRequest, NextResponse } from 'next/server'
import {
  isStellarAuthEnabled,
  verifyChallenge,
  issueStellarSession,
  STELLAR_SESSION_COOKIE,
  STELLAR_SESSION_MAX_AGE_SECONDS,
} from '@/lib/agents/stellar-session'

const STELLAR_RE = /^G[A-Z2-7]{55}$/

/** Freighter returns base64; also accept hex / 0x-hex (mirrors wallet-links). */
function decodeStellarSignature(signature: string): Uint8Array | null {
  const trimmed = signature.trim()
  if (!trimmed) return null
  try {
    const b64 = Buffer.from(trimmed, 'base64')
    if (b64.length > 0) return new Uint8Array(b64)
  } catch {
    /* no-op */
  }
  const hex = trimmed.startsWith('0x') ? trimmed.slice(2) : trimmed
  if (/^[a-fA-F0-9]+$/.test(hex) && hex.length % 2 === 0) {
    try {
      const decoded = Buffer.from(hex, 'hex')
      if (decoded.length > 0) return new Uint8Array(decoded)
    } catch {
      /* no-op */
    }
  }
  return null
}

async function verifyStellarSignature(
  message: string,
  signature: string,
  address: string,
): Promise<boolean> {
  try {
    const decoded = decodeStellarSignature(signature)
    if (!decoded) return false
    const { Keypair } = await import('@stellar/stellar-sdk')
    const kp = Keypair.fromPublicKey(address)
    return kp.verify(Buffer.from(message, 'utf8'), Buffer.from(decoded))
  } catch {
    return false
  }
}

/**
 * POST /api/agents/stellar-auth/verify
 *
 * Verify a signed challenge and mint an agent session cookie for the Stellar
 * wallet. Body: { address, message, signature, challengeToken }.
 */
export async function POST(request: NextRequest) {
  if (!isStellarAuthEnabled()) {
    return NextResponse.json(
      { error: 'Stellar wallet sign-in is not enabled.' },
      { status: 503 },
    )
  }

  const body = (await request.json().catch(() => null)) as {
    address?: unknown
    message?: unknown
    signature?: unknown
    challengeToken?: unknown
  } | null

  const address = typeof body?.address === 'string' ? body.address.trim() : ''
  const message = typeof body?.message === 'string' ? body.message : ''
  const signature = typeof body?.signature === 'string' ? body.signature : ''
  const challengeToken = typeof body?.challengeToken === 'string' ? body.challengeToken : ''

  if (!STELLAR_RE.test(address) || !message || !signature || !challengeToken) {
    return NextResponse.json({ error: 'Missing or invalid fields.' }, { status: 400 })
  }

  // 1. The message must be a fresh, unexpired challenge WE issued for this address.
  if (!verifyChallenge(challengeToken, address, message)) {
    return NextResponse.json(
      { error: 'Challenge expired or invalid — request a new one.' },
      { status: 400 },
    )
  }

  // 2. The signature must prove control of the Stellar key.
  if (!(await verifyStellarSignature(message, signature, address))) {
    return NextResponse.json({ error: 'Signature verification failed.' }, { status: 400 })
  }

  // 3. Mint the session cookie.
  const token = issueStellarSession(address)
  if (!token) {
    return NextResponse.json({ error: 'Could not issue session.' }, { status: 500 })
  }

  const res = NextResponse.json({ ok: true, address })
  res.cookies.set(STELLAR_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: STELLAR_SESSION_MAX_AGE_SECONDS,
    path: '/',
  })
  return res
}

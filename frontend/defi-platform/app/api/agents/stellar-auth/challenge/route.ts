import { NextRequest, NextResponse } from 'next/server'
import { issueChallenge, isStellarAuthEnabled } from '@/lib/agents/stellar-session'

/**
 * POST /api/agents/stellar-auth/challenge
 *
 * Issue a stateless sign-in challenge for a Stellar wallet (no Privy needed).
 * Body: { address: "G..." }
 * Returns: { message, challengeToken }
 *
 * Public by design — issuing a challenge reveals nothing and mints no session.
 */
export async function POST(request: NextRequest) {
  if (!isStellarAuthEnabled()) {
    return NextResponse.json(
      { error: 'Stellar wallet sign-in is not enabled.' },
      { status: 503 },
    )
  }

  const body = (await request.json().catch(() => null)) as { address?: unknown } | null
  const address = typeof body?.address === 'string' ? body.address.trim() : ''

  const challenge = issueChallenge(address)
  if (!challenge) {
    return NextResponse.json({ error: 'Invalid Stellar address.' }, { status: 400 })
  }

  return NextResponse.json(challenge)
}

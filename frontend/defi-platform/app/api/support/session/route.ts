import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { PrivyClient } from '@privy-io/server-auth'
import { resolveEvmAddress } from '@/lib/agents/resolve-wallet'

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET;
const privy = new PrivyClient(PRIVY_APP_ID!, PRIVY_APP_SECRET!);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { localSessionId, walletAddress, hubChainId } = body

    if (!localSessionId || typeof localSessionId !== 'string' || localSessionId.length > 255) {
      return NextResponse.json({ error: 'Invalid localSessionId' }, { status: 400 })
    }

    if (walletAddress && (typeof walletAddress !== 'string' || walletAddress.length > 42)) {
      return NextResponse.json({ error: 'Invalid walletAddress' }, { status: 400 })
    }

    // Soft-verify Privy token if present
    const authHeader = req.headers.get('authorization')
    let verifiedAddress = null

    if (authHeader?.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7)
        const verifiedClaims = await privy.verifyAuthToken(token)
        // resolveEvmAddress for social-login users (userId is a DID CUID, not
        // the embedded wallet address).
        const resolved = await resolveEvmAddress(privy, verifiedClaims.userId)
        verifiedAddress = resolved?.toLowerCase() ?? null
      } catch (e) {
        console.warn('[Support Session] Privy verification failed (continuing as anonymous):', e)
      }
    }

    // Only associate wallet if it matches the verified token
    // If not verified, we just don't store the wallet address (or keep existing)
    const finalWalletAddress = (walletAddress?.toLowerCase() === verifiedAddress) 
      ? verifiedAddress 
      : null;

    // Upsert session
    const existing = await sql`
      SELECT id, is_active FROM support_sessions WHERE local_session_id = ${localSessionId} LIMIT 1
    `

    let sessionId: string
    let isNew = false
    let isActive = true

    if (existing && existing.length > 0) {
      sessionId = existing[0].id
      isActive = existing[0].is_active
      // Update info if changed
      if (finalWalletAddress || hubChainId) {
        await sql`
          UPDATE support_sessions 
          SET 
            wallet_address = COALESCE(${finalWalletAddress}, wallet_address),
            hub_chain_id = COALESCE(${hubChainId}, hub_chain_id),
            updated_at = NOW()
          WHERE id = ${sessionId}
        `
      }
    } else {
      isNew = true
      const result = await sql`
        INSERT INTO support_sessions (local_session_id, wallet_address, hub_chain_id)
        VALUES (${localSessionId}, ${finalWalletAddress || null}, ${hubChainId || null})
        RETURNING id
      `
      sessionId = result[0].id
    }

    return NextResponse.json({ sessionId, isNew, isActive })
  } catch (error) {
    console.error('[Support Session] Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

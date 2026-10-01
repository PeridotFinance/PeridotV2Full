import { NextRequest, NextResponse } from 'next/server'
import { ethers } from 'ethers'
import { sql } from '@/lib/database'

// Session-based auth: user signs once, votes freely for SESSION_WINDOW
// Must match buildVoteSessionMessage on the client
function buildVoteSessionMessage(wallet: string, timestamp: number) {
  return `Peridot: meme voting session for ${wallet} at ${timestamp}`
}

const SESSION_WINDOW = 8 * 60 * 60 * 1000  // 8 hours

export async function POST(req: NextRequest) {
  try {
    const { memeId, walletAddress, sessionSignature, sessionTimestamp } = await req.json()

    if (!memeId || !walletAddress || !sessionSignature || sessionTimestamp === undefined) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    if (typeof walletAddress !== 'string' || typeof sessionSignature !== 'string' || typeof sessionTimestamp !== 'number') {
      return NextResponse.json({ error: 'Invalid field types' }, { status: 400 })
    }

    if (!/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) {
      return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 })
    }

    // NaN guard
    const id = parseInt(memeId)
    if (isNaN(id) || id <= 0) {
      return NextResponse.json({ error: 'Invalid meme ID' }, { status: 400 })
    }

    // Session expiry check (8 hours)
    const now = Date.now()
    if (now - sessionTimestamp > SESSION_WINDOW || sessionTimestamp > now + 60_000) {
      return NextResponse.json({ error: 'Session expired — please re-authenticate', code: 'SESSION_EXPIRED' }, { status: 401 })
    }

    const wallet = walletAddress.toLowerCase()

    // Verify session signature (proves wallet ownership once per session)
    const message = buildVoteSessionMessage(wallet, sessionTimestamp)
    let recovered: string
    try {
      recovered = ethers.verifyMessage(message, sessionSignature)
    } catch {
      return NextResponse.json({ error: 'Invalid session signature' }, { status: 400 })
    }
    if (recovered.toLowerCase() !== wallet) {
      return NextResponse.json({ error: 'Session signature does not match wallet' }, { status: 401 })
    }

    // Atomic transaction with row lock — prevents race condition on concurrent votes
    const voted = await sql.begin(async tx => {
      const existing = await tx`
        SELECT 1 FROM meme_votes
        WHERE meme_id = ${id} AND wallet_address = ${wallet}
        FOR UPDATE
      `
      if (existing.length > 0) {
        await tx`DELETE FROM meme_votes WHERE meme_id = ${id} AND wallet_address = ${wallet}`
        await tx`UPDATE memes SET votes = GREATEST(votes - 1, 0) WHERE id = ${id}`
        return false
      } else {
        await tx`INSERT INTO meme_votes (meme_id, wallet_address) VALUES (${id}, ${wallet})`
        await tx`UPDATE memes SET votes = votes + 1 WHERE id = ${id}`
        return true
      }
    })

    return NextResponse.json({ voted })
  } catch (err) {
    console.error('[memes/vote]', err)
    return NextResponse.json({ error: 'Vote failed' }, { status: 500 })
  }
}

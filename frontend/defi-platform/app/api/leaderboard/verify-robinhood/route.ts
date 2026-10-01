import { NextRequest, NextResponse } from 'next/server'
import { awardRobinhoodPointsForTx } from '@/lib/robinhood/points-server'

// Leaderboard points for Robinhood margin positions (rules in
// lib/rewards/policy.ts, MARGIN_POINTS). The page reports the hash of every
// confirmed open, full close and in-kind exit; the server reads the receipt
// and pays the position's owner, never whoever posted. No auth for the same
// reason as /api/leaderboard/verify: the chain decides who is paid, and a
// repeated report books nothing.

const TX_HASH = /^0x[0-9a-fA-F]{64}$/

// Per-hash throttle. The on-chain read is the cost; the middleware's per-IP
// POST bucket already bounds a single client.
const recent = new Map<string, number>()
const HASH_COOLDOWN_MS = 5_000

export async function POST(request: NextRequest) {
  let body: { txHash?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const txHash = String(body?.txHash ?? '')
  if (!TX_HASH.test(txHash)) {
    return NextResponse.json({ error: 'Invalid transaction hash' }, { status: 400 })
  }
  const key = txHash.toLowerCase()
  const now = Date.now()
  if (now - (recent.get(key) ?? 0) < HASH_COOLDOWN_MS) {
    return NextResponse.json({ error: 'Already being processed' }, { status: 429 })
  }
  recent.set(key, now)
  if (recent.size > 5_000) {
    for (const [k, at] of recent) if (now - at >= HASH_COOLDOWN_MS) recent.delete(k)
  }

  try {
    const outcome = await awardRobinhoodPointsForTx(key as `0x${string}`)
    if (outcome.status === 'pending') {
      return NextResponse.json({ error: 'Transaction not found yet' }, { status: 404 })
    }
    if (outcome.status === 'rejected') {
      return NextResponse.json({ error: outcome.reason }, { status: 400 })
    }
    return NextResponse.json({
      success: true,
      points_awarded: outcome.awards.filter((a) => a.booked).reduce((s, a) => s + a.points, 0),
      awards: outcome.awards,
    })
  } catch (err) {
    console.error('[verify-robinhood] failed:', err)
    return NextResponse.json({ error: 'Failed to record margin points' }, { status: 500 })
  }
}

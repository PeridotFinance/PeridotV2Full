import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'

// Deterministic escalation signal for the support chat.
//
// The "Get Human" button hits this directly instead of relying on the LLM
// reply happening to contain an escalation phrase (see support-reply.ts — that
// heuristic stays as a fallback for organic hand-offs). Flipping
// `needs_human` here is the hard signal the Telegram bot reads to decide
// whether to PING the team vs. keep the thread in silent "AI handling" mode.
//
// Idempotent: flipping an already-escalated session is a no-op.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { sessionId } = body

    if (!sessionId || typeof sessionId !== 'string') {
      return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 })
    }

    // Only escalate sessions that exist and are still active.
    const rows = await sql`
      UPDATE support_sessions
      SET needs_human = true, updated_at = NOW()
      WHERE id = ${sessionId} AND is_active = true
      RETURNING id
    `

    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'Invalid or inactive session' }, { status: 403 })
    }

    return NextResponse.json({ success: true, needsHuman: true })
  } catch (error) {
    console.error('[Support Escalate] Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

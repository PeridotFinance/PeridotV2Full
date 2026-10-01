import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'

// Auth handled by middleware (admin_blog_session cookie).

interface SessionRow {
  id: string
  wallet_address: string | null
  hub_chain_id: number | null
  is_active: boolean
  needs_human: boolean | null
  created_at: string
  updated_at: string
}

interface MessageRow {
  id: number
  sender_type: 'user' | 'team' | 'agent'
  content: string
  created_at: string
}

const UUID_RE = /^[0-9a-fA-F-]{36}$/

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params
    if (!id || !UUID_RE.test(id)) {
      return NextResponse.json({ error: 'Invalid session id' }, { status: 400 })
    }

    const sessionRows = (await sql`
      SELECT id, wallet_address, hub_chain_id, is_active, needs_human, created_at, updated_at
      FROM support_sessions
      WHERE id = ${id}
      LIMIT 1
    `) as unknown as SessionRow[]
    const session = sessionRows[0]
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const messages = (await sql`
      SELECT id, sender_type, content, created_at
      FROM support_messages
      WHERE session_id = ${id}
      ORDER BY created_at ASC
      LIMIT 500
    `) as unknown as MessageRow[]

    return NextResponse.json({
      session: {
        id: session.id,
        walletAddress: session.wallet_address,
        hubChainId: session.hub_chain_id,
        isActive: session.is_active,
        needsHuman: !!session.needs_human,
        createdAt: session.created_at,
        updatedAt: session.updated_at,
        messages: messages.map((m) => ({
          id: m.id,
          senderType: m.sender_type,
          content: m.content,
          createdAt: m.created_at,
        })),
      },
    })
  } catch (error) {
    console.error('[admin/ugamau/sessions/:id] GET error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

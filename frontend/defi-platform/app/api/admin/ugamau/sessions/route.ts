import { NextResponse } from 'next/server'
import { sql } from '@/lib/database'

// Auth is handled by middleware (admin_blog_session cookie). If we reach this
// handler the caller is authenticated.

const LIST_LIMIT = 200

interface SessionListRow {
  id: string
  wallet_address: string | null
  hub_chain_id: number | null
  is_active: boolean
  needs_human: boolean | null
  created_at: string
  updated_at: string
  message_count: number
  last_sender_type: string | null
  last_message_preview: string | null
  last_message_at: string | null
}

export async function GET() {
  try {
    // Aggregate stats per session in one round-trip. The covering index on
    // support_messages(session_id, created_at ASC) keeps the LATERAL fast.
    const rows = (await sql`
      SELECT
        s.id,
        s.wallet_address,
        s.hub_chain_id,
        s.is_active,
        s.needs_human,
        s.created_at,
        s.updated_at,
        COALESCE(stats.message_count, 0)::int AS message_count,
        last_msg.sender_type AS last_sender_type,
        last_msg.content AS last_message_preview,
        last_msg.created_at AS last_message_at
      FROM support_sessions s
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS message_count
        FROM support_messages m
        WHERE m.session_id = s.id
      ) stats ON TRUE
      LEFT JOIN LATERAL (
        SELECT sender_type, content, created_at
        FROM support_messages m
        WHERE m.session_id = s.id
        ORDER BY m.created_at DESC
        LIMIT 1
      ) last_msg ON TRUE
      ORDER BY COALESCE(last_msg.created_at, s.updated_at) DESC
      LIMIT ${LIST_LIMIT}
    `) as unknown as SessionListRow[]

    const sessions = rows.map((r) => ({
      id: r.id,
      walletAddress: r.wallet_address,
      hubChainId: r.hub_chain_id,
      isActive: r.is_active,
      needsHuman: !!r.needs_human,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      messageCount: r.message_count,
      lastSenderType: r.last_sender_type,
      lastMessagePreview: r.last_message_preview
        ? r.last_message_preview.slice(0, 200)
        : null,
      lastMessageAt: r.last_message_at,
    }))

    return NextResponse.json({ sessions })
  } catch (error) {
    console.error('[admin/ugamau/sessions] GET error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

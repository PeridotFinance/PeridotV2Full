import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { authenticateAgentRequest } from '@/lib/agents/auth'

async function getVerifiedAddress(req: NextRequest): Promise<string | null> {
  // E2E | Privy | Stellar-wallet session (Stufe 3).
  const auth = await authenticateAgentRequest(req)
  return auth?.userAddress ?? null
}

/** GET — List conversations for the authenticated user */
export async function GET(req: NextRequest) {
  const address = await getVerifiedAddress(req)
  if (!address) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check if client wants archived conversations
  const showArchived = req.nextUrl.searchParams.get('archived') === 'true'

  const rows = await sql`
    SELECT
      c.id,
      c.title,
      c.is_archived,
      c.created_at,
      c.updated_at,
      (
        SELECT content FROM agent_messages
        WHERE conversation_id = c.id
        ORDER BY created_at DESC LIMIT 1
      ) AS last_message
    FROM agent_conversations c
    WHERE LOWER(c.user_address) = ${address}
      AND COALESCE(c.is_archived, false) = ${showArchived}
    ORDER BY c.updated_at DESC
    LIMIT 50
  `

  const conversations = rows.map((r) => ({
    id: r.id,
    title: r.title,
    isArchived: r.is_archived ?? false,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    lastMessage: r.last_message
      ? String(r.last_message).slice(0, 100)
      : undefined,
  }))

  return NextResponse.json({ conversations })
}

/** POST — Create a new conversation */
export async function POST(req: NextRequest) {
  const address = await getVerifiedAddress(req)
  if (!address) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let title = 'New Conversation'
  try {
    const body = await req.json()
    if (body.title && typeof body.title === 'string') {
      title = body.title.slice(0, 200)
    }
  } catch {
    // empty body is fine
  }

  const rows = await sql`
    INSERT INTO agent_conversations (user_address, title)
    VALUES (${address}, ${title})
    RETURNING id, title, created_at, updated_at
  `

  const conv = rows[0]
  return NextResponse.json(
    {
      id: conv.id,
      title: conv.title,
      isArchived: false,
      createdAt: conv.created_at,
      updatedAt: conv.updated_at,
    },
    { status: 201 },
  )
}

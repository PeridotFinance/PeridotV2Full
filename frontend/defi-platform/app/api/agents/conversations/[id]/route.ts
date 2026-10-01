import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { authenticateAgentRequest } from '@/lib/agents/auth'

async function getVerifiedAddress(req: NextRequest): Promise<string | null> {
  // E2E | Privy | Stellar-wallet session (Stufe 3).
  const auth = await authenticateAgentRequest(req)
  return auth?.userAddress ?? null
}

/** GET — Fetch messages for a conversation */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const address = await getVerifiedAddress(req)
  if (!address) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  // Verify ownership
  const conv = await sql`
    SELECT id FROM agent_conversations
    WHERE id = ${id} AND LOWER(user_address) = ${address}
    LIMIT 1
  `
  if (conv.length === 0) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  }

  const messages = await sql`
    SELECT id, conversation_id, role, content, blocks, created_at
    FROM agent_messages
    WHERE conversation_id = ${id}
    ORDER BY created_at ASC
    LIMIT 200
  `

  return NextResponse.json({
    messages: messages.map((m) => ({
      id: m.id,
      conversationId: m.conversation_id,
      role: m.role,
      content: m.content,
      blocks: normalizeBlocks(m.blocks),
      createdAt: m.created_at,
    })),
  })
}

/**
 * The `blocks` JSONB column can come back from the driver as a parsed array,
 * a JSON string, or null/undefined. The UI expects an array (or undefined).
 */
function normalizeBlocks(raw: unknown): unknown[] | undefined {
  if (raw == null) return undefined
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : undefined
    } catch {
      return undefined
    }
  }
  return undefined
}

/** PATCH — Update conversation (archive/unarchive, rename) */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const address = await getVerifiedAddress(req)
  if (!address) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Verify ownership
  const conv = await sql`
    SELECT id FROM agent_conversations
    WHERE id = ${id} AND LOWER(user_address) = ${address}
    LIMIT 1
  `
  if (conv.length === 0) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  }

  // Apply updates
  if (typeof body.isArchived === 'boolean') {
    await sql`
      UPDATE agent_conversations
      SET is_archived = ${body.isArchived as boolean}
      WHERE id = ${id}
    `
  }

  if (typeof body.title === 'string' && body.title) {
    await sql`
      UPDATE agent_conversations
      SET title = ${(body.title as string).slice(0, 200)}
      WHERE id = ${id}
    `
  }

  return NextResponse.json({ ok: true })
}

/** DELETE — Delete a conversation and its messages (cascade) */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const address = await getVerifiedAddress(req)
  if (!address) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const result = await sql`
    DELETE FROM agent_conversations
    WHERE id = ${id} AND LOWER(user_address) = ${address}
    RETURNING id
  `

  if (result.length === 0) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  }

  return NextResponse.json({ deleted: true })
}

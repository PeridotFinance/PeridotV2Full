import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { runSupportAgentReply } from '@/lib/agents/support-reply'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const sessionId = searchParams.get('sessionId')

    if (!sessionId) {
      return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 })
    }

    // Check if session exists and is active
    const sessionCheck = await sql`
      SELECT id FROM support_sessions WHERE id = ${sessionId} AND is_active = true LIMIT 1
    `
    if (!sessionCheck || sessionCheck.length === 0) {
      return NextResponse.json({ error: 'Invalid or inactive session' }, { status: 403 })
    }

    const messages = await sql`
      SELECT
        id,
        sender_type as "senderType",
        content,
        is_streaming as "isStreaming",
        created_at as "createdAt"
      FROM support_messages
      WHERE session_id = ${sessionId}
        AND sender_type IN ('user', 'team', 'agent')
      ORDER BY created_at DESC
      LIMIT 100
    `

    // Reverse to show in chronological order
    return NextResponse.json({ messages: messages.reverse() })
  } catch (error) {
    console.error('[Support Messages GET] Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { sessionId, content, currentPath } = body

    if (!sessionId || !content) {
      return NextResponse.json({ error: 'Missing sessionId or content' }, { status: 400 })
    }

    if (content.length > 2000) {
      return NextResponse.json({ error: 'Message too long' }, { status: 400 })
    }

    // Validate currentPath defensively — accept only same-origin pathnames.
    // Reject anything that isn't a leading-slash relative path or is too long.
    const safePath: string | undefined =
      typeof currentPath === 'string' &&
      currentPath.startsWith('/') &&
      currentPath.length <= 256 &&
      !currentPath.includes('\n')
        ? currentPath
        : undefined

    // Check if session exists and is active
    const sessionCheck = await sql`
      SELECT id FROM support_sessions WHERE id = ${sessionId} AND is_active = true LIMIT 1
    `
    if (!sessionCheck || sessionCheck.length === 0) {
      return NextResponse.json({ error: 'Invalid or inactive session' }, { status: 403 })
    }

    // 1. Save user message to DB
    // The separate Python bot will pick this up (messages with telegram_message_id = NULL)
    await sql`
      INSERT INTO support_messages (session_id, sender_type, content)
      VALUES (${sessionId}, 'user', ${content})
    `

    // 2. Kick off the AI assistant reply in parallel — does not block the
    //    HTTP response. The team's Telegram bot still picks up the user
    //    message via the same INSERT, so the agent acts as a *first
    //    responder* alongside the human team.
    //    `.catch` is required: an unhandled rejection on the fire-and-forget
    //    promise would otherwise bubble up to the Node process and (in some
    //    Next runtime configs) terminate the worker. Logging keeps the bot
    //    path alive even when the LLM call blows up.
    runSupportAgentReply({
      sessionId,
      latestUserMessage: content,
      currentPath: safePath,
    }).catch((err) => {
      console.error('[Support Messages POST] agent reply failed:', err)
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Support Messages POST] Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}


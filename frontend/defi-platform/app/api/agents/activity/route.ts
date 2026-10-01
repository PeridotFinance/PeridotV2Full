import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { authenticateAgentRequest } from '@/lib/agents/auth'
import { mapActionLogRow } from '@/lib/agents/action-log'

async function getVerifiedAddress(req: NextRequest): Promise<string | null> {
  // E2E | Privy | Stellar-wallet session (Stufe 3).
  const auth = await authenticateAgentRequest(req)
  return auth?.userAddress ?? null
}

/**
 * GET /api/agents/activity — recent agent-initiated tx log
 *
 * Query params:
 *   ?limit=N        max rows (default 20, cap 100)
 *   ?auto=true      only auto-executed actions
 */
export async function GET(req: NextRequest) {
  const address = await getVerifiedAddress(req)
  if (!address) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const limitRaw = Number(url.searchParams.get('limit') ?? '20')
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 20, 1), 100)
  const onlyAuto = url.searchParams.get('auto') === 'true'

  const rows = onlyAuto
    ? await sql`
        SELECT * FROM agent_action_log
        WHERE LOWER(user_address) = ${address.toLowerCase()}
          AND auto_executed = true
        ORDER BY created_at DESC
        LIMIT ${limit}
      `
    : await sql`
        SELECT * FROM agent_action_log
        WHERE LOWER(user_address) = ${address.toLowerCase()}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `

  return NextResponse.json({
    entries: rows.map((r) => mapActionLogRow(r as Record<string, unknown>)),
  })
}

/**
 * Success-closure message builder + persister.
 *
 * When an agent-initiated action reaches a terminal state we want a short
 * "Done — withdrew 2 USDT." line in the chat to close the loop for the
 * user. Previously this was an ephemeral `peridot:agent-action-succeeded`
 * window event rendered by ChatMessageList — worked during the live
 * session but vanished on reload, leaving Perry's in-flight text
 * (e.g. "On it — usually a few seconds.") as the last persisted message.
 *
 * This module writes the closure as a real `assistant` row into
 * `agent_messages` so it survives reloads and conversation switches.
 * Callers are the two terminal-state writers:
 *   - PATCH /api/agents/execute  (same-chain)
 *   - POST  /api/agents/timeline/transition  (cross-chain, via listener)
 *
 * Best-effort: failure to persist must NEVER block the action itself.
 * Callers wrap this in a try/catch and log — the ephemeral advisory path
 * still covers the live session.
 */

import { sql } from '@/lib/database'

/** Map a raw action verb to past-tense for consumer-banking display. */
export const CLOSURE_VERB_MAP: Readonly<Record<string, string>> = {
  supply: 'deposited',
  deposit: 'deposited',
  'cross-chain_supply': 'deposited',
  withdraw: 'withdrew',
  borrow: 'borrowed',
  repay: 'paid back',
  pay_back: 'paid back',
  swap: 'converted',
  convert: 'converted',
  rebalance: 'adjusted the strategy',
  adjust_strategy: 'adjusted the strategy',
}

export interface BuildClosureInput {
  actionType: string
  assetSymbol?: string | null
  amount?: string | number | null
}

/**
 * Build the short past-tense line. Returns a safe default if the action
 * data is incomplete — we'd rather say "Done." than nothing.
 */
export function buildClosureContent(input: BuildClosureInput): string {
  const verb = CLOSURE_VERB_MAP[input.actionType] ?? input.actionType
  const amount = input.amount != null ? String(input.amount).trim() : ''
  const symbol = input.assetSymbol ? input.assetSymbol.toUpperCase() : ''
  const amountLabel = amount && symbol ? `${amount} ${symbol}` : ''
  if (!amountLabel) return `Done.`
  return `Done — ${verb} ${amountLabel}.`
}

/**
 * Insert the closure into the chat. Idempotent via a short lookback —
 * if an identical closure landed in the same conversation within the
 * last 30 seconds we skip. Prevents double-bubbles when both the PATCH
 * execute path AND the timeline transition path fire for the same action
 * (which can happen on auto-retry flows).
 */
export async function persistClosureMessage(params: {
  conversationId: string
  actionType: string
  assetSymbol?: string | null
  amount?: string | number | null
}): Promise<{ ok: boolean; skipped?: 'duplicate' | 'missing_conversation' } & { error?: string }> {
  const { conversationId } = params
  if (!conversationId) {
    return { ok: false, skipped: 'missing_conversation' }
  }

  const content = buildClosureContent(params)

  try {
    // Skip if the same content already landed in this conversation within
    // the last 30 seconds. Cheap check; the index on
    // agent_messages(conversation_id, created_at) makes this fast.
    const recent = await sql`
      SELECT id FROM agent_messages
      WHERE conversation_id = ${conversationId}
        AND role = 'assistant'
        AND content = ${content}
        AND created_at > NOW() - INTERVAL '30 seconds'
      LIMIT 1
    `
    if (recent.length > 0) {
      return { ok: true, skipped: 'duplicate' }
    }

    await sql`
      INSERT INTO agent_messages (conversation_id, role, content)
      VALUES (${conversationId}, 'assistant', ${content})
    `
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: message }
  }
}

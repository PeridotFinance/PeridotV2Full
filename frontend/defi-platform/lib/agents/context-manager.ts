/**
 * Smart context-window management for agent conversations.
 *
 * Three mechanisms work together:
 *
 *  1. **Token budget, not message count** — we fill from newest messages
 *     backwards until we hit an input-token budget (default ~60k). Short chit-
 *     chat gets more preserved; long tool-heavy transcripts get trimmed sooner.
 *
 *  2. **Tool-result compression** — when the same tool is called multiple times
 *     in the kept window, older outputs are collapsed to one-liners since a
 *     newer call has superseded them.
 *
 *  3. **Structured summary with fact promotion** — the small-model summary
 *     extracts stable user facts (preferences, constraints) into a typed array.
 *     The caller can persist those via `persistExtractedUserFacts` so cross-
 *     session memory builds up automatically.
 */

import { z } from 'zod'
import { getSmallProvider, generateZodStructured } from './providers'
import { estimateMessageTokens, estimateMessagesTokens } from './token-estimator'

const DEFAULT_BUDGET_TOKENS = 60_000
const KEEP_RECENT_FLOOR = 8
const SUMMARY_MAX_MESSAGES = 30
const RESUMMARIZE_AFTER = 10 // re-run the summary once this many new messages have aged out

// ── Types ────────────────────────────────────────────────────────────

interface ConversationMessage {
  role: string
  content: string
  blocks?: unknown
}

export interface PrepareContextOptions {
  /** Token budget for the returned messages. Default 60000. */
  budgetTokens?: number
  /** Minimum number of most-recent messages to always keep. Default 8. */
  keepRecentFloor?: number
}

export interface PrepareContextResult {
  messages: Array<{ role: string; content: string }>
  needsSummaryUpdate: boolean
  summarySourceCount: number
  /** Approximate tokens in the returned messages. */
  estimatedTokens: number
}

export interface ExtractedUserFact {
  key: string
  value: string
}

// ── Summary schema ────────────────────────────────────────────────────

const SummarySchema = z.object({
  overview: z
    .string()
    .describe('One-paragraph factual summary of the earlier conversation.'),
  keyFacts: z
    .array(z.string())
    .max(8)
    .describe('Bullet-point facts worth preserving: decisions, actions taken or proposed.'),
  userFacts: z
    .array(
      z.object({
        key: z
          .string()
          .describe('Short snake_case key, e.g. "risk_tolerance", "excluded_assets".'),
        value: z
          .string()
          .describe('The fact value (short phrase, list, or sentence).'),
      }),
    )
    .max(5)
    .describe(
      'Durable user-specific facts — preferences, constraints, goals — worth remembering across conversations. Empty if none surfaced.',
    ),
  openItems: z
    .array(z.string())
    .max(5)
    .describe('Still-unresolved tasks, questions, or pending approvals. Empty if none.'),
})

const TitleSchema = z.object({
  title: z
    .string()
    .describe('A very short conversation title, max 6 words, no quotes.'),
})

// ── Public API ────────────────────────────────────────────────────────

/**
 * Build the message window that will be sent to the LLM.
 * Fills from newest backwards until the token budget is exhausted; older
 * messages are left out and — if a summary exists — represented by it.
 */
export async function prepareContextMessages(
  allMessages: ConversationMessage[],
  existingSummary?: string | null,
  opts: PrepareContextOptions = {},
): Promise<PrepareContextResult> {
  const budget = opts.budgetTokens ?? DEFAULT_BUDGET_TOKENS
  const floor = opts.keepRecentFloor ?? KEEP_RECENT_FLOOR

  const summaryMsg = existingSummary
    ? {
        role: 'system',
        content: `[Conversation Summary - Earlier messages condensed]\n${existingSummary}`,
      }
    : null

  // Start accounting with the summary so it counts against the budget.
  let tokensSoFar = summaryMsg ? estimateMessageTokens(summaryMsg) : 0

  // Walk backwards, greedily including messages that fit.
  const kept: ConversationMessage[] = []
  for (let i = allMessages.length - 1; i >= 0; i--) {
    const msg = allMessages[i]
    if (!msg) continue
    const cost = estimateMessageTokens({ role: msg.role, content: msg.content })

    if (kept.length < floor) {
      kept.unshift(msg)
      tokensSoFar += cost
      continue
    }
    if (tokensSoFar + cost > budget) break
    kept.unshift(msg)
    tokensSoFar += cost
  }

  const compressed = compressStaleToolResults(kept)

  const droppedCount = allMessages.length - kept.length
  const needsSummaryUpdate =
    droppedCount > 0 && (!existingSummary || droppedCount >= RESUMMARIZE_AFTER)

  const output = summaryMsg ? [summaryMsg, ...compressed] : compressed
  return {
    messages: output.map((m) => ({ role: m.role, content: m.content })),
    needsSummaryUpdate,
    summarySourceCount: droppedCount,
    estimatedTokens: estimateMessagesTokens(output),
  }
}

/**
 * Generate a structured conversation summary. Returns both a rendered string
 * (suitable for prepending as a system message) and the extracted user facts
 * so the caller can decide whether to persist them.
 */
export async function generateConversationSummary(
  messages: ConversationMessage[],
): Promise<{ summary: string; userFacts: ExtractedUserFact[] }> {
  const toSummarize = messages.slice(-SUMMARY_MAX_MESSAGES)
  const conversationText = toSummarize
    .map((m) => `${m.role}: ${m.content.slice(0, 300)}`)
    .join('\n')

  try {
    const provider = getSmallProvider()
    const result = await generateZodStructured(provider, {
      schema: SummarySchema,
      schemaName: 'conversation_summary',
      maxTokens: 800,
      prompt:
        'Summarize this conversation. Identify durable user preferences (riskTolerance, excluded assets, investment goals) into userFacts; keep the overview factual.\n\n' +
        conversationText,
    })

    const sections: string[] = [result.overview.trim()]
    if (result.keyFacts.length > 0) {
      sections.push('Key points:\n- ' + result.keyFacts.join('\n- '))
    }
    if (result.openItems.length > 0) {
      sections.push('Open items:\n- ' + result.openItems.join('\n- '))
    }

    const userFacts: ExtractedUserFact[] = result.userFacts
      .filter((f): f is { key: string; value: string } => !!f.key && !!f.value)
      .map((f) => ({ key: f.key, value: f.value }))

    return {
      summary: sections.join('\n\n'),
      userFacts,
    }
  } catch {
    return {
      summary: buildFallbackSummary(messages),
      userFacts: [],
    }
  }
}

/**
 * Persist user facts extracted by the summarizer into `agent_knowledge` so
 * future conversations start with them in context. Upserts by (user_address,
 * key). Safe to call with an empty array.
 */
export async function persistExtractedUserFacts(
  userAddress: string,
  facts: ExtractedUserFact[],
  conversationId?: string | null,
): Promise<void> {
  if (!facts.length || !userAddress) return
  try {
    const { sql } = await import('@/lib/database')
    for (const fact of facts) {
      const key = fact.key.toLowerCase().trim()
      const valueJson = JSON.stringify(fact.value)
      await sql`
        INSERT INTO agent_knowledge (user_address, key, value, source)
        VALUES (${userAddress.toLowerCase()}, ${key}, ${valueJson}, ${conversationId ?? null})
        ON CONFLICT (user_address, key) DO UPDATE SET
          value = ${valueJson},
          source = ${conversationId ?? null}
      `
    }
  } catch {
    // Non-critical — knowledge table may not exist yet in this environment.
  }
}

/**
 * Generate a short conversation title. Structured output so the response is
 * always a clean title string.
 */
export async function generateConversationTitle(
  userMessage: string,
  assistantReply: string,
): Promise<string | null> {
  try {
    const provider = getSmallProvider()
    const result = await generateZodStructured(provider, {
      schema: TitleSchema,
      schemaName: 'conversation_title',
      maxTokens: 60,
      prompt: `Produce a very short title (max 6 words, no quotes) for this exchange:\n\nUser: ${userMessage.slice(0, 200)}\nAssistant: ${assistantReply.slice(0, 300)}`,
    })
    const title = result.title.trim().slice(0, 100)
    return title || null
  } catch {
    return null
  }
}

// ── Internals ─────────────────────────────────────────────────────────

/**
 * Collapse older tool_result payloads that have been superseded by a newer
 * call of the same tool in the same window. Greatly reduces context use when
 * the agent is iterating on a query (e.g. "show USDC pools → now sort by TVL").
 */
function compressStaleToolResults(msgs: ConversationMessage[]): ConversationMessage[] {
  // Strategy: within the kept slice, count occurrences of each tool name;
  // every occurrence of a tool except the most-recent gets content replaced
  // with a short placeholder.
  const toolOccurrences = new Map<string, number[]>()
  const TOOL_MARKER = /^\s*\[tool:([a-zA-Z0-9_\-.]+)]/

  msgs.forEach((m, i) => {
    if (m.role !== 'tool') return
    const match = TOOL_MARKER.exec(m.content)
    if (!match) return
    const name = match[1]
    if (!name) return
    const arr = toolOccurrences.get(name) ?? []
    arr.push(i)
    toolOccurrences.set(name, arr)
  })

  if (toolOccurrences.size === 0) return msgs

  const staleIndices = new Set<number>()
  for (const indices of toolOccurrences.values()) {
    if (indices.length < 2) continue
    // keep the last, mark the rest stale
    for (const idx of indices.slice(0, -1)) staleIndices.add(idx)
  }

  if (staleIndices.size === 0) return msgs

  return msgs.map((m, i) => {
    if (!staleIndices.has(i)) return m
    const match = TOOL_MARKER.exec(m.content)
    const name = match ? match[1] : 'unknown'
    return {
      ...m,
      content: `[tool:${name}] (earlier result superseded by a newer call; omitted to save context)`,
    }
  })
}

function buildFallbackSummary(messages: ConversationMessage[]): string {
  const userMessages = messages.filter((m) => m.role === 'user')
  const topics = userMessages
    .slice(-5)
    .map((m) => m.content.slice(0, 100))
    .join('; ')
  return `Earlier conversation covered ${messages.length} messages. Recent user topics: ${topics}`
}

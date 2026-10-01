/**
 * Support-modal agent reply.
 *
 * Pulled out of the /api/support/messages POST handler so it can be invoked
 * fire-and-forget (`void runSupportAgentReply(...)`) — the user's message is
 * persisted immediately, the agent's reply lands seconds later via the
 * polling UI.
 *
 * Important differences vs. /api/agents/chat:
 *   - Wallet is OPTIONAL. With wallet → read-only portfolio tools too.
 *   - No execute_*, no remember_fact, no profile mutations, no MCP tools.
 *   - DB-side streaming: an empty `agent` row is inserted up-front and
 *     UPDATEd as text deltas arrive. The polling UI sees the reply grow
 *     in near-real-time instead of waiting for the full generation.
 *   - No conversation table; history comes from `support_messages`.
 *   - The Peridot human team also reads the session via Telegram, so the
 *     agent's role is *first responder*, not the only responder.
 */

import { sql } from '@/lib/database'
import { buildSystemPrompt } from '@/lib/agents/system-prompt'
import { getSupportTools, type AgentToolName } from '@/lib/agents/tool-definitions'
import { executeTool } from '@/lib/agents/tool-executor'
import { resolveStellarForUser, loadStellarSnapshot } from '@/lib/agents/stellar-snapshot'
import { getSmallProvider, toProviderTools } from '@/lib/agents/providers'
import type {
  ChatMessage,
  ProviderToolDefinition,
  ToolExecutor,
  ToolExecutorResult,
} from '@/lib/agents/providers'
import type { ContentBlock } from '@/types/agents'

// Recent messages from the support session that we feed back as context.
// Telegram-team replies are fed back as 'assistant' so the agent picks up
// where the team left off; user messages are 'user'. Older agent replies
// are also 'assistant'. Cap to keep latency bounded.
const HISTORY_LIMIT = 20

// Hard cap on the agent's reply length (chars) to keep persistence + UI safe.
// The provider also has a maxTokens cap, this is just the safety floor on
// whatever the provider returns.
const MAX_REPLY_CHARS = 2000

// Streaming flush cadence. We want the UI poll (2s when waiting) to see fresh
// content roughly every cycle, but we don't want to hammer Postgres on every
// 5-char delta. ~300ms or +40 chars triggers a flush — whichever comes first.
const FLUSH_INTERVAL_MS = 300
const FLUSH_CHARS = 40

interface SupportSessionRow {
  id: string
  wallet_address: string | null
  hub_chain_id: number | null
  needs_human: boolean | null
}

interface SupportMessageRow {
  sender_type: 'user' | 'team' | 'agent'
  content: string
}

interface AgentMessageInsertRow {
  id: number | string
}

export interface RunSupportAgentReplyArgs {
  sessionId: string
  /** The just-inserted user message — included in the LLM prompt. */
  latestUserMessage: string
  /**
   * The page path the user was on when they sent the message (e.g.
   * '/app/easy', '/faq'). Used to ground the agent's references — if the user
   * says "this page" the agent knows what they mean. Optional.
   */
  currentPath?: string
}

/**
 * Generate and persist an agent reply for a support session. Best-effort:
 * any failure is logged and swallowed — the human team still has the
 * Telegram-side fallback so the user is never left dangling.
 */
export async function runSupportAgentReply(args: RunSupportAgentReplyArgs): Promise<void> {
  const { sessionId, latestUserMessage, currentPath } = args
  const startedAt = Date.now()

  // Telemetry: collected throughout the run, persisted at the end. Lets us
  // grafana p50/p95 latency without re-grepping PM2 logs.
  let walletAvailable = false
  let historyCount = 0
  let promptChars = 0
  let toolCalls = 0
  let firstTokenMs: number | null = null
  let genStartedAt: number | null = null
  let totalGenMs: number | null = null
  let messageId: number | string | null = null
  let modelId = ''
  let reply = ''
  let needsHuman = false
  let errorMessage: string | null = null

  console.log(
    `[support-agent] start session=${sessionId} path=${currentPath ?? '(none)'} ` +
      `msgChars=${latestUserMessage?.length ?? 0}`,
  )

  try {
    // 1. Load session metadata. Bail if it doesn't exist or is closed —
    //    those cases happen when a user closes the chat between sending and
    //    the fire-and-forget continuation running.
    const sessionRows = (await sql`
      SELECT id, wallet_address, hub_chain_id, needs_human
      FROM support_sessions
      WHERE id = ${sessionId} AND is_active = true
      LIMIT 1
    `) as unknown as SupportSessionRow[]
    const session = sessionRows[0]
    if (!session) {
      console.warn(`[support-agent] session ${sessionId} not active — skipping reply`)
      return
    }

    // 2. Load recent message history (chronological). We include the just-
    //    inserted user message so the LLM sees the full picture.
    const historyRows = (await sql`
      SELECT sender_type, content
      FROM support_messages
      WHERE session_id = ${sessionId}
      ORDER BY created_at DESC
      LIMIT ${HISTORY_LIMIT}
    `) as unknown as SupportMessageRow[]
    const ordered = historyRows.slice().reverse()

    const messages: ChatMessage[] = ordered.map((row) => ({
      role: row.sender_type === 'user' ? 'user' : 'assistant',
      content: row.content,
    }))

    // Defensive: guarantee the latest user message is present as the last
    // turn even if the history read raced behind the INSERT. Avoid
    // duplicating it if the history read already saw it.
    const last = messages[messages.length - 1]
    if (!last || last.role !== 'user' || last.content !== latestUserMessage) {
      messages.push({ role: 'user', content: latestUserMessage })
    }
    historyCount = messages.length

    // 3. Build the prompt + tools. Wallet-optional: the support tool subset
    //    excludes execute_*, remember_*, and (when no wallet) all
    //    portfolio tools.
    walletAvailable = !!session.wallet_address

    // Stellar awareness (read-only): mirror the in-app Perry path so the support
    // agent sees the same XLM/USDC/EURC + lending position. The support session
    // only stores the EVM address (no Privy DID), so we resolve via the unified
    // account-identity graph — established users with an embedded/linked Stellar
    // wallet resolve fine. Best-effort: a failed read just omits the section.
    let stellarSnapshot: Awaited<ReturnType<typeof loadStellarSnapshot>>
    if (session.wallet_address) {
      const stellarAddress = await resolveStellarForUser(session.wallet_address, null).catch(
        () => null,
      )
      stellarSnapshot = await loadStellarSnapshot(stellarAddress).catch(() => undefined)
    }
    // Support never reads EVM idle balances (no loadWalletSnapshot here), so the
    // snapshot is a Stellar-only shell — the EVM arrays stay empty and the
    // prompt builder renders just the Stellar section.
    const walletSnapshot = stellarSnapshot
      ? { hubBalances: [], spokeBalances: [], readMs: 0, stellar: stellarSnapshot }
      : undefined

    const systemPrompt = buildSystemPrompt({
      mode: 'support',
      userAddress: session.wallet_address ?? undefined,
      chainId: session.hub_chain_id ?? undefined,
      currentPath,
      walletSnapshot,
    })
    promptChars = systemPrompt.length
    const supportTools = getSupportTools(walletAvailable)
    const providerTools: ProviderToolDefinition[] = toProviderTools(supportTools)
    const allowedNames = new Set<string>(supportTools.map((t) => t.name))

    // 4. Tool executor — only routes to the support-allowed tools. No
    //    blocks are emitted to the UI (the support modal renders text only),
    //    we keep the tool's text payload as context for the LLM.
    const toolExecutor: ToolExecutor = async (call): Promise<ToolExecutorResult> => {
      toolCalls += 1
      if (!allowedNames.has(call.name)) {
        return {
          content: `Tool ${call.name} is not available in support mode.`,
          blocks: [],
        }
      }
      const result = await executeTool(
        // The executor is typed against AgentToolName — we know the tool is
        // in AGENT_TOOLS because we filtered from there above.
        { id: call.id, name: call.name as AgentToolName, input: call.input },
        {
          // Wallet-less runs pass an empty string; only public info tools
          // are exposed in that case so the address is never read.
          userAddress: session.wallet_address ?? '',
          // Lets get_user_portfolio merge Stellar positions for users with a
          // Stellar wallet — same context key the in-app chat passes.
          stellarAddress: stellarSnapshot?.address,
        },
      )
      return {
        content: result.content,
        // Discard structured blocks — the support modal renders text only.
        blocks: [] as ContentBlock[],
      }
    }

    // 5. Insert the empty agent row up-front. Polling UI sees this immediately
    //    (with is_streaming=true), so the "thinking" indicator can yield to a
    //    real bubble that grows as deltas arrive.
    const insertRows = (await sql`
      INSERT INTO support_messages (session_id, sender_type, content, is_streaming)
      VALUES (${sessionId}, 'agent', '', true)
      RETURNING id
    `) as unknown as AgentMessageInsertRow[]
    messageId = insertRows[0]?.id ?? null
    if (messageId === null) {
      throw new Error('Failed to insert agent message row')
    }

    // 6. Stream the chat with intra-stream DB flushes.
    //    First-responder uses the small model (Haiku/Nano): typical support
    //    questions are short and factual, full Sonnet/mini was 2–3× slower
    //    for indistinguishable quality.
    const provider = getSmallProvider()
    modelId = provider.modelId

    let lastFlushedLen = 0
    let lastFlushMs = 0
    let flushChain: Promise<void> = Promise.resolve()

    // Serialised flush — chained onto the previous so writes can't race or
    // arrive out of order. Caller doesn't await individual flushes; the chain
    // is awaited once after the stream ends.
    const queueFlush = (force: boolean) => {
      const now = Date.now()
      const delta = reply.length - lastFlushedLen
      if (delta <= 0) return
      if (!force && now - lastFlushMs < FLUSH_INTERVAL_MS && delta < FLUSH_CHARS) return
      lastFlushedLen = reply.length
      lastFlushMs = now
      const snapshot = reply
      const id = messageId
      flushChain = flushChain.then(async () => {
        try {
          await sql`
            UPDATE support_messages
            SET content = ${snapshot}, updated_at = NOW()
            WHERE id = ${id as number}
          `
        } catch (e) {
          console.warn(
            `[support-agent] streaming flush failed for msg ${id}: ${
              e instanceof Error ? e.message : String(e)
            }`,
          )
        }
      })
    }

    genStartedAt = Date.now()
    for await (const event of provider.streamChat({
      systemPrompt,
      messages,
      tools: providerTools,
      toolExecutor,
      maxTokens: 350,
      maxToolRounds: 2,
    })) {
      if (event.type === 'text_delta') {
        if (firstTokenMs === null) firstTokenMs = Date.now() - genStartedAt
        reply += event.delta
        queueFlush(false)
      }
      // We deliberately drop 'block' events — the modal can't render them.
    }
    totalGenMs = Date.now() - genStartedAt

    // Flush any tail content before the final commit.
    queueFlush(true)
    await flushChain

    reply = reply.trim()
    if (reply.length > MAX_REPLY_CHARS) {
      reply = reply.slice(0, MAX_REPLY_CHARS).trim()
    }

    // 7. Heuristic: if the reply explicitly hands off to the team, flag the
    //    session for human follow-up so it surfaces in the admin filter.
    needsHuman = /flag this for the team|team will follow up|team will look at|team will reach out/i.test(
      reply,
    )

    // 8. Final commit — close out streaming + persist trimmed content.
    if (!reply) {
      // Empty reply: remove the placeholder row entirely so the UI doesn't
      // render an empty agent bubble. Telegram-team path still picks up the
      // user message (it queries sender_type='user' only).
      await sql`DELETE FROM support_messages WHERE id = ${messageId as number}`
      messageId = null
      console.warn(
        `[support-agent] empty reply for session ${sessionId} after ${Date.now() - startedAt}ms — placeholder removed`,
      )
    } else {
      await sql`
        UPDATE support_messages
        SET content = ${reply}, is_streaming = false, updated_at = NOW()
        WHERE id = ${messageId as number}
      `
      if (needsHuman && !session.needs_human) {
        await sql`
          UPDATE support_sessions
          SET needs_human = true, updated_at = NOW()
          WHERE id = ${sessionId}
        `
      }
    }

    console.log(
      `[support-agent] session=${sessionId} model=${modelId} wallet=${walletAvailable} ` +
        `tools=${toolCalls} replyChars=${reply.length} needsHuman=${needsHuman} ` +
        `firstToken=${firstTokenMs ?? 'n/a'}ms gen=${totalGenMs ?? 'n/a'}ms ` +
        `total=${Date.now() - startedAt}ms`,
    )
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err)
    console.error(
      `[support-agent] session=${sessionId} failed after ${Date.now() - startedAt}ms: ${errorMessage}`,
    )
    // Best-effort: clear the streaming flag on the placeholder so the UI
    // doesn't fast-poll forever. If we never INSERTed (early failure), nothing
    // to do.
    if (messageId !== null) {
      try {
        await sql`
          UPDATE support_messages
          SET is_streaming = false, content = COALESCE(NULLIF(content, ''), 'Sorry — something went wrong on our side. The team has been notified and will reply shortly.')
          WHERE id = ${messageId as number}
        `
      } catch (e) {
        console.warn(
          `[support-agent] failed to clear streaming flag on err: ${
            e instanceof Error ? e.message : String(e)
          }`,
        )
      }
    }
  } finally {
    // Persist metrics — best effort, never throw. We do this for every
    // attempt so failure rates are visible too.
    try {
      const totalMs = Date.now() - startedAt
      await sql`
        INSERT INTO support_agent_metrics (
          session_id, message_id, model_id, wallet_attached, history_count,
          prompt_chars, tool_calls, first_token_ms, total_gen_ms, total_ms,
          reply_chars, needs_human, error
        ) VALUES (
          ${sessionId},
          ${(messageId as number | null) ?? null},
          ${modelId || null},
          ${walletAvailable},
          ${historyCount},
          ${promptChars},
          ${toolCalls},
          ${firstTokenMs},
          ${totalGenMs},
          ${totalMs},
          ${reply.length},
          ${needsHuman},
          ${errorMessage}
        )
      `
    } catch (e) {
      console.warn(
        `[support-agent] metrics insert failed: ${
          e instanceof Error ? e.message : String(e)
        }`,
      )
    }
  }
}

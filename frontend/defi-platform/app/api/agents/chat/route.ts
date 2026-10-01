import { NextRequest } from 'next/server'
import { sql } from '@/lib/database'
import { jsonbParam } from '@/lib/jsonb'
import { buildSystemPrompt } from '@/lib/agents/system-prompt'
import { AGENT_TOOLS } from '@/lib/agents/tool-definitions'
import { executeTool } from '@/lib/agents/tool-executor'
import { MessageBlockAccumulator, formatSSEEvent } from '@/lib/agents/message-parser'
import {
  prepareContextMessages,
  generateConversationSummary,
  generateConversationTitle,
  persistExtractedUserFacts,
} from '@/lib/agents/context-manager'
import { getProvider, toProviderTools } from '@/lib/agents/providers'
import type { ToolExecutor, ProviderToolDefinition } from '@/lib/agents/providers'
import { getMcpRegistry, injectWalletAddress } from '@/lib/agents/mcp'
import { buildBlocksFromMcpResult } from '@/lib/agents/mcp/result-to-blocks'
import { authenticateAgentRequest } from '@/lib/agents/auth'
import { resolveStellarForUser, loadStellarSnapshot } from '@/lib/agents/stellar-snapshot'
import { readHubWalletBalances } from '@/lib/agents/hub-wallet-reader'
import { readSpokeWalletBalances } from '@/lib/agents/spoke-balance-reader'
import { readMultiChainPortfolio } from '@/lib/agents/portfolio-reader'
import { fetchAllActivePeridotPools } from '@/lib/agents/markets-reader'
import { classifyPrefetchIntent } from '@/lib/agents/intent-classifier'
import type { LivePortfolio, PoolInfo, StreamEvent, WalletBalance } from '@/types/agents'

const MAX_MESSAGE_LENGTH = 4000

const PROVIDER_TOOLS = toProviderTools(AGENT_TOOLS)

/**
 * Pre-load idle wallet balances (hub + spokes) so Perry can resolve a plain
 * "supply $X" without the `get_user_portfolio` round-trip. Positions still
 * require the full portfolio tool on demand.
 *
 * Wall-clock-bounded — each reader has its own per-chain 4s race, and we
 * run hub + spokes in parallel, so the outer Promise.all in the request
 * path never blocks the stream on a slow RPC. On failure of one side we
 * return whatever the other produced; on total failure returns undefined
 * and the snapshot section is omitted (falling back to the "always check
 * portfolio" rule).
 */
async function loadWalletSnapshot(userAddress: string) {
  const started = Date.now()
  const toSummary = (b: { chainId: number; assetSymbol: string; amount: string; amountUsd?: number }) => ({
    chainId: b.chainId,
    assetSymbol: b.assetSymbol,
    amount: b.amount,
    amountUsd: b.amountUsd,
  })
  const [hubResult, spokeResult] = await Promise.allSettled([
    readHubWalletBalances(userAddress),
    readSpokeWalletBalances(userAddress),
  ])
  const hubOk = hubResult.status === 'fulfilled'
  const spokeOk = spokeResult.status === 'fulfilled'
  if (!hubOk && !spokeOk) {
    console.warn(
      `[agent-snapshot] addr=${userAddress} both readers failed — snapshot omitted`,
    )
    return undefined
  }
  const snapshot = {
    hubBalances: hubOk ? hubResult.value.map(toSummary) : [],
    spokeBalances: spokeOk ? spokeResult.value.map(toSummary) : [],
    readMs: Date.now() - started,
  }
  // One-line diagnostic — lets us see, per turn, whether the right wallet is
  // being read and whether spoke RPCs are actually returning balances. Stays
  // cheap (single line, no per-token spam).
  const summarize = (arr: typeof snapshot.hubBalances) =>
    arr.length === 0
      ? '∅'
      : arr.map((b) => `${b.assetSymbol}@${b.chainId}=${b.amount}`).join(',')
  console.log(
    `[agent-snapshot] addr=${userAddress} ${snapshot.readMs}ms ` +
      `hub=[${summarize(snapshot.hubBalances)}] ` +
      `spokes=[${summarize(snapshot.spokeBalances)}]` +
      (hubOk ? '' : ' (hub-failed)') +
      (spokeOk ? '' : ' (spokes-failed)'),
  )
  return snapshot
}

/**
 * Build the activeActions + recentActions summary fed into the system
 * prompt. Kept in this route (not in system-prompt.ts) so the prompt
 * builder stays side-effect free and testable.
 */
async function loadActionSummaries(userAddress: string) {
  const { listActiveActions, listRecentActions, statusLabel, isTerminal } =
    await import('@/lib/agents/action-timeline')
  const now = Date.now()
  const [active, recent] = await Promise.all([
    listActiveActions(userAddress),
    listRecentActions(userAddress, { windowMinutes: 10, limit: 10 }),
  ])

  const toSummary = (a: Awaited<ReturnType<typeof listActiveActions>>[number]) => ({
    id: a.id,
    actionType: a.actionType,
    assetSymbol: a.assetSymbol,
    amount: a.amount,
    sourceChainId: a.sourceChainId,
    destinationChainId: a.destinationChainId,
    status: a.status,
    statusLabel: statusLabel(a.status),
    startedSecondsAgo: Math.max(0, Math.round((now - a.createdAt.getTime()) / 1000)),
    primaryHash: a.primaryHash,
  })

  // Dedupe: anything showing up in `active` shouldn't ALSO appear in `recent`
  const activeIds = new Set(active.map((a) => a.id))
  return {
    active: active.map(toSummary),
    recent: recent.filter((r) => !activeIds.has(r.id) && isTerminal(r.status)).map(toSummary),
  }
}

/**
 * POST /api/agents/chat
 *
 * Streams an AI response via SSE. The provider abstraction handles model selection
 * (OpenAI / Anthropic) via env vars — this route only coordinates auth, DB, and SSE.
 */
export async function POST(req: NextRequest) {
  // ── Auth ───────────────────────────────────────────────────────
  // Check the e2e bypass first (only active in non-prod + with matching secret).
  // Auth: E2E | Privy | Stellar-wallet session (Stufe 3). `userAddress` is the
  // primary identity key (EVM when present, else a Stellar G-address). `evmAddress`
  // is set ONLY when a real EVM wallet is linked; downstream EVM reads/tools key
  // off it so a Stellar-only user never drives an EVM RPC with a G-address.
  const auth = await authenticateAgentRequest(req)
  if (!auth) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const userAddress = auth.userAddress
  const evmAddress = auth.evmAddress
  // Used by the Stellar snapshot resolver below as a fallback lookup; null for
  // e2e + Stellar-session auth (no Privy DID).
  const privyUserId = auth.privyUserId

  // ── Parse body ─────────────────────────────────────────────────
  let conversationId: string
  let content: string
  let chainId: number | undefined
  // The wallet the user actually has connected client-side (useStellarWallet).
  // Server-side resolution only sees Privy-embedded / account-linked wallets, so
  // a user who supplied via an unlinked external Freighter would otherwise be
  // invisible. Read-only context (public on-chain data); execution still needs a
  // per-tx signature, so trusting the client's own address here is safe.
  let clientStellarAddress: string | null = null

  try {
    const body = await req.json()
    conversationId = body.conversationId
    content = body.content
    chainId = body.chainId
    if (typeof body.stellarAddress === 'string' && /^G[A-Z2-7]{55}$/.test(body.stellarAddress)) {
      clientStellarAddress = body.stellarAddress
    }

    if (!conversationId || typeof conversationId !== 'string') {
      throw new Error('conversationId required')
    }
    if (!content || typeof content !== 'string') {
      throw new Error('content required')
    }
    content = content.slice(0, MAX_MESSAGE_LENGTH)
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Invalid request body'
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // ── Speculative prefetch ───────────────────────────────────────
  // Kick off the portfolio reads NOW (fire-and-forget) if the message
  // looks like a portfolio query. They run in parallel with everything
  // that follows — conversation-ownership SQL, message persist, history
  // load, pre-stream context, AND LLM round 1 — so by the time the LLM
  // decides to call `get_user_portfolio`, the data is already in memory.
  //
  // Catch here (not in the tool) so a failed prefetch NEVER propagates
  // as an unhandled rejection — the tool falls back to fresh reads.
  let prefetchedPortfolio:
    | Promise<{ portfolio: LivePortfolio; walletBalances: WalletBalance[] }>
    | undefined
  let prefetchedMarkets: Promise<PoolInfo[]> | undefined
  const prefetchIntent = classifyPrefetchIntent(content)
  if (prefetchIntent === 'portfolio') {
    const prefetchStarted = Date.now()
    prefetchedPortfolio = Promise.all([
      readMultiChainPortfolio(userAddress, [56, 143]),
      readHubWalletBalances(userAddress).catch(() => [] as WalletBalance[]),
      readSpokeWalletBalances(userAddress).catch(() => [] as WalletBalance[]),
    ])
      .then(([portfolio, hub, spokes]) => {
        const walletBalances = [...hub, ...spokes]
        console.log(
          `[agent-prefetch] addr=${userAddress} portfolio ${Date.now() - prefetchStarted}ms ` +
            `positions=${portfolio.positions.length} idle=${walletBalances.length}`,
        )
        return { portfolio, walletBalances }
      })
      .catch((err) => {
        console.warn(
          `[agent-prefetch] addr=${userAddress} portfolio failed after ` +
            `${Date.now() - prefetchStarted}ms: ${err instanceof Error ? err.message : String(err)}`,
        )
        throw err
      })
    // Attach a no-op handler so the catch above doesn't register as
    // "unhandled rejection" if the tool never awaits the promise (e.g.
    // LLM decides NOT to call get_user_portfolio after all).
    prefetchedPortfolio.catch(() => {})
  } else if (prefetchIntent === 'markets') {
    const prefetchStarted = Date.now()
    prefetchedMarkets = fetchAllActivePeridotPools()
      .then((pools) => {
        console.log(
          `[agent-prefetch] addr=${userAddress} markets ${Date.now() - prefetchStarted}ms ` +
            `pools=${pools.length}`,
        )
        return pools
      })
      .catch((err) => {
        console.warn(
          `[agent-prefetch] addr=${userAddress} markets failed after ` +
            `${Date.now() - prefetchStarted}ms: ${err instanceof Error ? err.message : String(err)}`,
        )
        throw err
      })
    prefetchedMarkets.catch(() => {})
  }

  // ── Verify conversation ownership ──────────────────────────────
  const conv = await sql`
    SELECT id FROM agent_conversations
    WHERE id = ${conversationId} AND LOWER(user_address) = ${userAddress}
    LIMIT 1
  `
  if (conv.length === 0) {
    return new Response(JSON.stringify({ error: 'Conversation not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // ── Persist user message ───────────────────────────────────────
  await sql`
    INSERT INTO agent_messages (conversation_id, role, content)
    VALUES (${conversationId}, 'user', ${content})
  `

  // ── Load conversation history ──────────────────────────────────
  const history = await sql`
    SELECT role, content, blocks FROM agent_messages
    WHERE conversation_id = ${conversationId}
    ORDER BY created_at ASC
  `

  const allMessages = history.map((m) => ({
    role: m.role as string,
    content: m.content as string,
  }))

  // Load existing summary if any
  const summaryRows = await sql`
    SELECT content FROM agent_messages
    WHERE conversation_id = ${conversationId} AND role = 'system'
    ORDER BY created_at DESC LIMIT 1
  `
  const existingSummary = summaryRows.length > 0 ? (summaryRows[0].content as string) : null

  // Context window management: summarize if conversation is long
  const { messages, needsSummaryUpdate, summarySourceCount } =
    await prepareContextMessages(allMessages, existingSummary)

  if (needsSummaryUpdate && summarySourceCount > 0) {
    // Summarize the messages that were dropped from the context window.
    const olderMessages = allMessages.slice(0, summarySourceCount)
    generateConversationSummary(olderMessages)
      .then(async ({ summary, userFacts }) => {
        try {
          await sql`
            DELETE FROM agent_messages
            WHERE conversation_id = ${conversationId} AND role = 'system'
          `
          await sql`
            INSERT INTO agent_messages (conversation_id, role, content)
            VALUES (${conversationId}, 'system', ${summary})
          `
          // Promote extracted user-facts to the cross-session knowledge store.
          await persistExtractedUserFacts(userAddress, userFacts, conversationId)
        } catch {
          // Non-critical
        }
      })
      .catch(() => {
        // Summary generation itself failed — non-critical, keep silent
      })
  }

  // ── Pre-stream context load (parallel) ──────────────────────────
  // All of these are independent reads that feed into the system prompt.
  // Running them serially pushed TTFB to 3-5s before streaming even began,
  // which ate into Cloudflare's 100s origin-response budget. Promise.all
  // with individual try/catches keeps each best-effort without letting a
  // slow MCP or RPC block the whole turn.
  const mcpRegistry = getMcpRegistry()

  const [
    profileResult,
    userFactsResult,
    mcpToolsResult,
    actionsResult,
    walletSnapshotResult,
    stellarSnapshotResult,
  ] = await Promise.all([
    (async () => {
      try {
        const profileRows = await sql`
          SELECT * FROM agent_profiles
          WHERE LOWER(user_address) = ${userAddress}
          LIMIT 1
        `
        if (profileRows.length > 0) {
          const p = profileRows[0]
          const profileContext: import('@/lib/agents/system-prompt').AgentProfileContext = {
            riskLevel: (p.risk_level as 'low' | 'medium' | 'high') ?? 'medium',
            investmentGoal: p.investment_goal as string | null,
            timeHorizon: p.time_horizon as string | null,
            capitalUsd: p.capital_usd != null ? Number(p.capital_usd) : null,
            preferredAssets: (p.preferred_assets as string[]) ?? [],
            preferredChains: (p.preferred_chains as number[]) ?? [],
            onboardingComplete: (p.onboarding_complete as boolean) ?? false,
          }
          let autoExec: import('@/lib/agents/system-prompt').AutoExecuteContext | undefined
          if (p.auto_execute_enabled === true) {
            autoExec = {
              enabled: true,
              limitUsd: p.auto_execute_limit_usd != null ? Number(p.auto_execute_limit_usd) : 2,
              actions: (p.auto_execute_actions as string[]) ?? ['deposit', 'withdraw', 'pay_back'],
            }
          }
          return { profile: profileContext, autoExec }
        }
        return {
          profile: {
            riskLevel: 'medium' as const,
            investmentGoal: null,
            timeHorizon: null,
            capitalUsd: null,
            preferredAssets: [],
            preferredChains: [],
            onboardingComplete: false,
          },
          autoExec: undefined,
        }
      } catch {
        return { profile: undefined, autoExec: undefined }
      }
    })(),
    (async () => {
      try {
        const { loadUserFacts } = await import('@/lib/agents/tools-extended')
        return (await loadUserFacts(userAddress)) || undefined
      } catch {
        return undefined
      }
    })(),
    (async () => {
      if (!mcpRegistry.enabled) return [] as ProviderToolDefinition[]
      try {
        return await mcpRegistry.asProviderTools()
      } catch {
        return [] as ProviderToolDefinition[]
      }
    })(),
    (async () => {
      try {
        return await loadActionSummaries(userAddress)
      } catch {
        return {
          active: [] as Awaited<ReturnType<typeof loadActionSummaries>>['active'],
          recent: [] as Awaited<ReturnType<typeof loadActionSummaries>>['recent'],
        }
      }
    })(),
    // EVM snapshot only when an EVM wallet is actually linked — a Stellar-only
    // user has no EVM balances and we must not drive RPC reads with a G-address.
    evmAddress ? loadWalletSnapshot(evmAddress) : Promise.resolve(undefined),
    (async () => {
      // Prefer the client's connected Stellar wallet (what the user is actually
      // looking at); fall back to server-side resolution (embedded / linked).
      const stellarAddress = clientStellarAddress ?? (await resolveStellarForUser(userAddress, privyUserId))
      return loadStellarSnapshot(stellarAddress)
    })(),
  ])

  const profileContext = profileResult.profile
  const autoExecuteContext = profileResult.autoExec
  const userFacts = userFactsResult
  const mcpTools: ProviderToolDefinition[] = mcpToolsResult
  const activeActions = actionsResult.active
  const recentActions = actionsResult.recent
  // Compose EVM + Stellar into a single snapshot. The Stellar block must still
  // render when the EVM readers come back empty/undefined (Stellar-funded user
  // with nothing on EVM), so we synthesize an empty EVM shell in that case.
  const walletSnapshot =
    walletSnapshotResult || stellarSnapshotResult
      ? {
          ...(walletSnapshotResult ?? { hubBalances: [], spokeBalances: [], readMs: 0 }),
          stellar: stellarSnapshotResult,
        }
      : undefined

  // ── Build system prompt ────────────────────────────────────────
  const systemPrompt = buildSystemPrompt({
    userAddress,
    evmAddress,
    chainId,
    profile: profileContext,
    userFacts,
    mcpToolNames: mcpTools.map((t) => t.name),
    activeActions,
    recentActions,
    autoExecute: autoExecuteContext,
    walletSnapshot,
  })

  const tools: ProviderToolDefinition[] = [...PROVIDER_TOOLS, ...mcpTools]

  // ── Stream response via provider ───────────────────────────────
  const encoder = new TextEncoder()
  const accumulator = new MessageBlockAccumulator()
  // A client that leaves is not an error. Tab switch, navigation or the stop
  // button closes the channel, and every write after that throws
  // ERR_INVALID_STATE. The heartbeat timer raised it with no caller left to
  // catch it, so it surfaced as an uncaughtException in the worker. Same guard
  // as /api/agents/activity/stream. The reply is still persisted: the work
  // continues, only the wire is gone.
  const abort = req.signal

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false
      /** False once the channel is gone, so callers can stop pushing. */
      const send = (event: StreamEvent) => {
        if (closed || abort.aborted) return false
        try {
          controller.enqueue(encoder.encode(formatSSEEvent(event)))
          return true
        } catch {
          closed = true
          return false
        }
      }

      try {
        const provider = getProvider()

        /**
         * Heartbeat-wrapped tool executor. Each tool call emits:
         *   - `tool_start` immediately (client can show "Perry is checking…"),
         *   - `heartbeat` every 15s while the tool is still running, and
         *   - `tool_end` with elapsed ms + ok flag once settled.
         *
         * Reason: before this, long tools (multi-chain balance reads, MCP
         * round-trips) held the SSE channel silent for 30–60s. Cloudflare
         * drops origin requests at 100s of silence with a 524. The heartbeat
         * resets that timer without polluting the text/block stream —
         * unknown event types are ignored by existing clients.
         */
        const toolExecutor: ToolExecutor = async (call) => {
          const name = call.name
          const startedAt = Date.now()
          send({ type: 'tool_start', name })
          const heartbeat = setInterval(() => {
            // Stop ticking once nobody is listening. The tool itself runs on,
            // so its result is still persisted.
            const delivered = send({
              type: 'heartbeat',
              tool: name,
              elapsedMs: Date.now() - startedAt,
            })
            if (!delivered) clearInterval(heartbeat)
          }, 15_000)
          let ok = true
          try {
            if (mcpRegistry.handles(name)) {
              // Auto-inject the connected wallet into wallet-aware MCP tools so
              // portfolio calls always hit the right address even if the LLM
              // forgets to pass it.
              const safeInput = injectWalletAddress(name, call.input, userAddress)
              const mcpResult = await mcpRegistry.executeTool(name, safeInput)
              const blocks = buildBlocksFromMcpResult(name, mcpResult.data, userAddress)
              return { content: mcpResult.content, blocks }
            }
            // Progressive-rendering hook: tools that implement it push
            // ContentBlocks to the SSE stream *during* execution. Refactored
            // tools return `blocks: []` afterwards to avoid double-render;
            // legacy tools still return `blocks` in the result and that path
            // works unchanged (we never call emitBlock on their behalf).
            const emitBlock = (block: import('@/types/agents').ContentBlock) => {
              accumulator.addBlock(block)
              send({ type: 'block', block })
            }
            const result = await executeTool(
              { id: call.id, name: name as never, input: call.input },
              {
                userAddress,
                // Resolved alongside the wallet snapshot; lets get_user_portfolio
                // include Stellar positions for users with a Stellar wallet.
                stellarAddress: stellarSnapshotResult?.address,
                chainId,
                conversationId,
                emitBlock,
                prefetchedPortfolio,
                prefetchedMarkets,
              },
            )
            const blocks = result.blocks ?? (result.block ? [result.block] : [])
            return { content: result.content, blocks }
          } catch (err) {
            ok = false
            throw err
          } finally {
            clearInterval(heartbeat)
            send({ type: 'tool_end', name, ms: Date.now() - startedAt, ok })
          }
        }

        // Normalize message roles: drop 'system' wrappers (they live in systemPrompt)
        // by merging them into the first user turn if present.
        const chatMessages = messages
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          }))

        // Prepend any summary-system messages as user-context preamble (Anthropic + OpenAI agnostic).
        const summaryMsg = messages.find((m) => m.role === 'system')
        const finalMessages = summaryMsg
          ? [{ role: 'user' as const, content: `[Earlier context]\n${summaryMsg.content}` }, ...chatMessages]
          : chatMessages

        for await (const event of provider.streamChat({
          systemPrompt,
          messages: finalMessages,
          tools,
          toolExecutor,
        })) {
          if (event.type === 'text_delta') {
            accumulator.appendText(event.delta)
            send({ type: 'text_delta', delta: event.delta })
          } else if (event.type === 'block') {
            // Freeze any pending streamed text into a TextBlock and push it
            // to the wire BEFORE the structured block. The client uses this
            // to move the text from `streamingText` into `blocks[]` so the
            // optimistic post-`done` render still has it. Without this step
            // the text appears mid-stream then vanishes when the card lands.
            const flushed = accumulator.flushTextAsBlock()
            if (flushed) send({ type: 'block', block: flushed })

            accumulator.addBlock(event.block)
            send({ type: 'block', block: event.block })
          }
        }

        // Same flush for any text after the final structured block.
        const trailing = accumulator.flushTextAsBlock()
        if (trailing) send({ type: 'block', block: trailing })

        // Persist assistant message
        const blocks = accumulator.finalize()
        const plainContent = accumulator.getPlainContent()

        const inserted = await sql`
          INSERT INTO agent_messages (conversation_id, role, content, blocks)
          VALUES (${conversationId}, 'assistant', ${plainContent}, ${jsonbParam(blocks)})
          RETURNING id
        `

        await sql`
          UPDATE agent_conversations SET updated_at = NOW()
          WHERE id = ${conversationId}
        `

        // Auto-generate title for the first assistant reply
        try {
          const msgCount = await sql`
            SELECT COUNT(*)::int AS count FROM agent_messages
            WHERE conversation_id = ${conversationId} AND role = 'assistant'
          `
          if (msgCount[0]?.count <= 1) {
            const convRow = await sql`
              SELECT title FROM agent_conversations WHERE id = ${conversationId}
            `
            if (convRow[0]?.title === 'New Conversation') {
              const title = await generateConversationTitle(content, plainContent)
              if (title) {
                await sql`
                  UPDATE agent_conversations SET title = ${title}
                  WHERE id = ${conversationId}
                `
              }
            }
          }
        } catch {
          // Non-critical
        }

        send({ type: 'done', messageId: inserted[0].id })
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Stream failed'
        send({ type: 'error', message })
      } finally {
        if (!closed) {
          closed = true
          try {
            controller.close()
          } catch {
            // Already closed by the client leaving; nothing to do.
          }
        }
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

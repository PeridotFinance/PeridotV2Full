/**
 * Server-side execution of tool calls from the LLM agent.
 * Each tool fetches real data and returns structured ContentBlocks.
 */

import { randomUUID } from 'crypto'
import type {
  ChartBlock,
  ContentBlock,
  LivePortfolio,
  PoolTableBlock,
  AllocationBlock,
  AllocationEntry,
  ActionButtonBlock,
  AlertBlock,
  PoolInfo,
  PortfolioOverviewBlock,
  PositionCardBlock,
  QuickReplyBlock,
  ToolResult,
  WalletBalance,
} from '@/types/agents'
import { sql } from '@/lib/database'
import { jsonbObject, jsonbParam } from '@/lib/jsonb'
import type { AgentToolName } from './tool-definitions'
import { toolExecutorLog, timelineLog } from '@/lib/agents/logger'
import { enrichPoolsWithLiveApy } from '@/lib/agents/markets-reader'
import { resolveNetworkPresetChainIds, isTestnetChain, isStellarChain } from '@/lib/agents/network-preset'

/** Stablecoins pegged 1:1 to USD — we can safely display their token amount as USD. */
const STABLECOINS_EXEC = new Set(['USDC', 'USDT', 'DAI', 'AUSD', 'BUSD', 'USDD'])

/**
 * Mirror an agent-emitted action into the Agent Action Timeline ledger so
 * `check_action_status` / `list_recent_actions` / the SSE stream all see it.
 *
 * Same-chain actions use backend_type='direct_evm'; cross-chain has its own
 * writer in `tools-extended.ts` (different payload shape).
 *
 * Best-effort: a timeline write failure must never block the user flow, so
 * exceptions are swallowed with a warn log. Without the write, the user just
 * loses live lifecycle visibility for that one action — nothing is broken.
 */
/**
 * Returns the error when the timeline write fails, so callers can append a
 * hint to their tool-result content. A silent `console.warn` here left Perry
 * believing the ledger was populated — his `check_action_status` would then
 * return 404 and he'd tell the user "I don't see any recent action".
 */
async function createTimelineForAction(params: {
  conversationId?: string | null
  userAddress: string
  actionType: string
  assetSymbol: string
  amount: string | number
  sourceChainId: number
  destinationChainId?: number | null
  confirmationToken: string
  metadata?: Record<string, unknown>
  /** Execution backend — 'direct_evm' (default), 'biconomy', or 'stellar'. */
  backendType?: string
}): Promise<{ ok: boolean; error?: string }> {
  const backendType = params.backendType ?? 'direct_evm'
  try {
    const { createAction } = await import('@/lib/agents/action-timeline')
    const normalizedSymbol = params.assetSymbol.toUpperCase()
    const numericAmount = Number(params.amount)
    await createAction({
      conversationId: params.conversationId ?? null,
      userAddress: params.userAddress,
      actionType: params.actionType,
      assetSymbol: normalizedSymbol,
      amount: String(params.amount),
      amountUsd: STABLECOINS_EXEC.has(normalizedSymbol) && Number.isFinite(numericAmount)
        ? numericAmount
        : null,
      sourceChainId: params.sourceChainId,
      destinationChainId: params.destinationChainId ?? null,
      backendType,
      confirmationToken: params.confirmationToken,
      metadata: params.metadata ?? {},
    })
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    timelineLog.warn('createAction failed', {
      userAddress: params.userAddress,
      actionType: params.actionType,
      confirmationToken: params.confirmationToken,
      error: message.slice(0, 300),
    })
    // Enqueue for retry — the poller's drain pass will re-apply this
    // create so `agent_actions` eventually catches up with
    // `agent_executed_actions`. Best-effort: if enqueue itself fails the
    // helper just logs (see enqueueTimelineWrite).
    try {
      const { enqueueTimelineWrite } = await import('@/lib/agents/timeline-write-queue')
      const normalizedSymbol = params.assetSymbol.toUpperCase()
      const numericAmount = Number(params.amount)
      await enqueueTimelineWrite(
        'create',
        params.confirmationToken,
        {
          conversationId: params.conversationId ?? null,
          userAddress: params.userAddress,
          actionType: params.actionType,
          assetSymbol: normalizedSymbol,
          amount: String(params.amount),
          amountUsd: STABLECOINS_EXEC.has(normalizedSymbol) && Number.isFinite(numericAmount)
            ? numericAmount
            : null,
          sourceChainId: params.sourceChainId,
          destinationChainId: params.destinationChainId ?? null,
          backendType,
          confirmationToken: params.confirmationToken,
          metadata: params.metadata ?? {},
        },
        message,
      )
    } catch {
      // queue write failure already logged inside enqueueTimelineWrite
    }
    return { ok: false, error: message }
  }
}

interface ToolCallInput {
  id: string
  name: AgentToolName
  input: Record<string, unknown>
}

interface ToolContext {
  userAddress: string
  /**
   * The user's Stellar wallet address, when they have one (embedded or external
   * Freighter). Lets read tools (e.g. get_user_portfolio) include Stellar
   * Soroban positions alongside EVM. Undefined for EVM-only users.
   */
  stellarAddress?: string
  chainId?: number
  conversationId?: string
  /**
   * Optional progressive-rendering hook. When the caller (chat route) wires
   * this up, tools can push ContentBlocks to the UI *during* execution
   * rather than waiting to return the full block list at the end. The goal
   * is perceived latency: a portfolio read that takes 2s end-to-end can
   * land its first position card in ~400ms, while the LLM's final prose
   * catches up afterwards.
   *
   * Contract:
   *  - Blocks emitted here go straight to the SSE stream + message
   *    accumulator. They are NOT fed back to the LLM as tool output.
   *  - The tool's returned `content` string must still describe the same
   *    data so the LLM can reason about it in round 2.
   *  - To avoid duplicates, a refactored tool should emit ALL its blocks
   *    via this callback and return `blocks: []`. Non-refactored tools
   *    simply ignore `emitBlock` and return their blocks in the result as
   *    before — the route handles both paths transparently.
   */
  emitBlock?: (block: ContentBlock) => void
  /**
   * Speculative prefetch handle. When the route's intent classifier flags a
   * message as portfolio-related, it kicks off the same reads this tool
   * would do and parks the Promise here. The tool awaits it instead of
   * starting fresh — if the prefetch was launched in parallel with LLM
   * round 1, the data is ready by the time round 1 resolves and the tool
   * returns near-instantly, saving ~1-2 s of serial read time.
   *
   * Always-resolved with either real data or an error; callers treat a
   * rejection as "prefetch failed, fall back to fresh reads".
   */
  prefetchedPortfolio?: Promise<{
    portfolio: LivePortfolio
    walletBalances: WalletBalance[]
  }>
  /**
   * Speculative prefetch for `get_peridot_markets`. Same mechanic as the
   * portfolio prefetch: when the classifier flags a "what are the best
   * rates" / "show me markets" question, the route fires the unfiltered
   * pool-registry + live-APY read in parallel with LLM round 1. The tool
   * filters in memory when filters are present.
   */
  prefetchedMarkets?: Promise<PoolInfo[]>
}

/**
 * Execute a tool call and return a ToolResult with optional ContentBlock.
 */
export async function executeTool(
  toolCall: ToolCallInput,
  context: ToolContext,
): Promise<ToolResult> {
  try {
    switch (toolCall.name) {
      case 'get_peridot_markets':
        return await executeGetPeridotMarkets(toolCall, context)
      case 'get_user_portfolio':
        return await executeGetUserPortfolio(toolCall, context)
      case 'get_user_earnings':
        return await executeGetUserEarnings(toolCall, context)
      case 'project_my_earnings':
        return await executeProjectMyEarnings(toolCall, context)
      case 'compare_my_rate':
        return await executeCompareMyRate(toolCall, context)
      case 'get_pool_registry':
        return await executeGetPoolRegistry(toolCall)
      case 'build_strategy_proposal':
        return await executeBuildStrategyProposal(toolCall, context)
      case 'update_user_profile':
        return await executeUpdateUserProfile(toolCall, context)
      case 'remember_fact':
        return await (await import('./tools-extended')).executeRememberFact(toolCall, context)
      case 'recall_facts':
        return await (await import('./tools-extended')).executeRecallFacts(toolCall, context)
      case 'analyze_rebalance':
        return await (await import('./tools-extended')).executeAnalyzeRebalance(toolCall, context)
      case 'check_liquidation_risk':
        return await (await import('./tools-extended')).executeCheckLiquidationRisk(toolCall, context)
      case 'get_market_conditions':
        return await (await import('./tools-extended')).executeGetMarketConditions(toolCall)
      case 'get_transaction_history':
        return await (await import('./tools-extended')).executeGetTransactionHistory(toolCall, context)
      case 'compare_pools':
        return await (await import('./tools-extended')).executeComparePools(toolCall)
      case 'calculate_earnings':
        return await (await import('./tools-extended')).executeCalculateEarnings(toolCall)
      case 'execute_cross_chain_supply':
        return await (await import('./tools-extended')).executeCrossChainSupply(toolCall, context)
      case 'execute_deposit':
        return await executeSingleAction(toolCall, context, 'deposit')
      case 'execute_withdraw':
        return await executeSingleAction(toolCall, context, 'withdraw')
      case 'execute_pay_back':
        return await executeSingleAction(toolCall, context, 'pay_back')
      case 'execute_stellar_deposit':
        return await executeStellarAction(toolCall, context, 'deposit')
      case 'execute_stellar_withdraw':
        return await executeStellarAction(toolCall, context, 'withdraw')
      case 'execute_stellar_pay_back':
        return await executeStellarAction(toolCall, context, 'pay_back')
      case 'execute_swap':
        return await executeSwap(toolCall, context)
      case 'execute_rebalance':
        return await executeRebalance(toolCall, context)
      case 'verify_for_leaderboard':
        return await (await import('./tools-extended')).executeVerifyForLeaderboard(toolCall, context)
      case 'check_action_status':
        return await (await import('./tools-extended')).executeCheckActionStatus(toolCall, context)
      case 'list_recent_actions':
        return await (await import('./tools-extended')).executeListRecentActions(toolCall, context)
      default:
        return {
          toolCallId: toolCall.id,
          content: `Unknown tool: ${toolCall.name}`,
        }
    }
  } catch (error) {
    // Preserve typed errors so Perry gets actionable context instead of a
    // flattened "Error: …" string. Named error classes (BiconomyBuildError,
    // TxBuildError) map to specific structured codes below; anything else
    // falls back to INTERNAL with the raw message in the Details field.
    const name = (error as any)?.name as string | undefined
    const message = error instanceof Error ? error.message : String(error)

    let code: string = 'INTERNAL'
    if (name === 'BiconomyBuildError') code = 'QUOTE_FAILED'
    else if (name === 'TxBuildError') code = 'INVALID_AMOUNT'
    else if (/insufficient/i.test(message)) code = 'INSUFFICIENT_BALANCE'
    else if (/invalid.*address|must be.*hex/i.test(message)) code = 'INVALID_ADDRESS'

    toolExecutorLog.warn('tool threw', {
      tool: toolCall.name,
      userAddress: context.userAddress,
      conversationId: context.conversationId,
      errorName: name,
      code,
      errorMessage: message.slice(0, 300),
    })

    return {
      toolCallId: toolCall.id,
      content: `The ${toolCall.name} tool couldn't complete. See structuredError for the reason.`,
      structuredError: {
        code,
        message:
          code === 'INSUFFICIENT_BALANCE' ? 'Not enough balance for this action.'
          : code === 'INVALID_ADDRESS' ? 'The wallet address looks wrong — ask the user to reconnect.'
          : code === 'INVALID_AMOUNT' ? 'The amount isn\'t valid for this action.'
          : code === 'QUOTE_FAILED' ? 'Couldn\'t get a quote for this transfer right now.'
          : 'Something went wrong running that action.',
        raw: message.slice(0, 500),
      },
    }
  }
}

// ── Tool Implementations ────────────────────────────────────────────

async function executeGetPeridotMarkets(
  toolCall: ToolCallInput,
  context: ToolContext,
): Promise<ToolResult> {
  const { chainId, assetSymbol } = toolCall.input as {
    chainId?: number
    assetSymbol?: string
  }

  let pools: PoolInfo[] | null = null

  // Speculative prefetch fast-path: the route kicked off the full pool fetch
  // in parallel with LLM round 1. If it's ready we filter in-memory instead
  // of hitting Postgres again (pool list is ~30 rows, trivial to filter).
  if (context.prefetchedMarkets) {
    try {
      const all = await context.prefetchedMarkets
      pools = all.filter(
        (p) =>
          (chainId == null || p.chainId === chainId) &&
          (assetSymbol == null ||
            p.assetSymbol.toLowerCase() === assetSymbol.toLowerCase()),
      )
    } catch {
      // Prefetch failed — fall through to fresh SQL path below.
      pools = null
    }
  }

  if (pools === null) {
    // No prefetch (or it failed) — existing filter-at-SQL path.
    if (chainId && assetSymbol) {
      const rows = await sql`
        SELECT * FROM agent_pool_registry
        WHERE is_peridot = true AND is_active = true
          AND chain_id = ${chainId}
          AND LOWER(asset_symbol) = ${assetSymbol.toLowerCase()}
        ORDER BY asset_symbol
      `
      pools = rows.map(mapPoolRow)
    } else if (chainId) {
      const rows = await sql`
        SELECT * FROM agent_pool_registry
        WHERE is_peridot = true AND is_active = true AND chain_id = ${chainId}
        ORDER BY asset_symbol
      `
      pools = rows.map(mapPoolRow)
    } else if (assetSymbol) {
      const rows = await sql`
        SELECT * FROM agent_pool_registry
        WHERE is_peridot = true AND is_active = true
          AND LOWER(asset_symbol) = ${assetSymbol.toLowerCase()}
        ORDER BY chain_id, asset_symbol
      `
      pools = rows.map(mapPoolRow)
    } else {
      const rows = await sql`
        SELECT * FROM agent_pool_registry
        WHERE is_peridot = true AND is_active = true
        ORDER BY chain_id, asset_symbol
      `
      pools = rows.map(mapPoolRow)
    }

    // Live APY enrichment — the pool registry seed carries only static
    // metadata; the actual rates live in `apy_latest`. Extracted into
    // markets-reader.ts so the prefetch path and this fallback share code.
    const { enrichPoolsWithLiveApy } = await import('@/lib/agents/markets-reader')
    await enrichPoolsWithLiveApy(pools)
  }

  const block: PoolTableBlock = {
    type: 'pool_table',
    pools,
    title: chainId
      ? `Peridot Markets (Chain ${chainId})`
      : 'Peridot Markets (All Chains)',
  }

  return {
    toolCallId: toolCall.id,
    content: `Found ${pools.length} Peridot pool(s). ${pools.map((p) => `${p.assetSymbol} on chain ${p.chainId}: ${p.liveApy?.toFixed(2) ?? '?'}% APY`).join('; ')}`,
    block,
  }
}

async function executeGetUserPortfolio(
  toolCall: ToolCallInput,
  context: ToolContext,
): Promise<ToolResult> {
  const emit = context.emitBlock ?? (() => {})
  const progressive = Boolean(context.emitBlock)
  try {
    const { readMultiChainPortfolio, formatPortfolioSummary } = await import(
      '@/lib/agents/portfolio-reader'
    )
    const { readSpokeWalletBalances } = await import(
      '@/lib/agents/spoke-balance-reader'
    )
    const { readHubWalletBalances } = await import(
      '@/lib/agents/hub-wallet-reader'
    )

    // Fire all three reads without gating. Peridot positions on hubs is one
    // dependency group; idle wallet balances (hub + spokes) is the other.
    // When progressive rendering is wired up we emit each group's cards the
    // moment it resolves, so the user sees the data land instead of staring
    // at a `tool_start` spinner for 1–2 s.
    //
    // Speculative prefetch path: when the route classified the user's
    // message as a portfolio query, it launched these exact reads in
    // parallel with LLM round 1. Reusing them means the `await` below
    // resolves near-instantly instead of kicking off fresh 1-2 s RPCs —
    // the route already absorbed that time behind the LLM's thinking.
    const chainIds = [56, 143]
    const evmPortfolioP: Promise<LivePortfolio> = context.prefetchedPortfolio
      ? context.prefetchedPortfolio.then((p) => p.portfolio)
      : readMultiChainPortfolio(context.userAddress, chainIds)
    // Merge Stellar Soroban positions when the user has a Stellar wallet, so
    // "what's my portfolio" covers both chains (not EVM-only). Best-effort:
    // a failed Stellar read leaves the EVM portfolio untouched.
    const stellarForPortfolio = context.stellarAddress
    const portfolioP: Promise<LivePortfolio> = stellarForPortfolio
      ? (async () => {
          const [evm, stellar] = await Promise.all([
            evmPortfolioP,
            import('@/lib/agents/portfolio-reader')
              .then((m) => m.readStellarPortfolio(stellarForPortfolio))
              .catch(() => null),
          ])
          if (!stellar || stellar.positions.length === 0) return evm
          const positions = [...evm.positions, ...stellar.positions]
          const totalSuppliedUsd = evm.totalSuppliedUsd + stellar.totalSuppliedUsd
          const totalBorrowedUsd = evm.totalBorrowedUsd + stellar.totalBorrowedUsd
          const netApy =
            totalSuppliedUsd > 0
              ? positions.reduce((s, p) => s + p.apy * (p.suppliedUsd / totalSuppliedUsd), 0)
              : 0
          return { ...evm, positions, totalSuppliedUsd, totalBorrowedUsd, netApy, timestamp: Date.now() }
        })()
      : evmPortfolioP
    const walletP: Promise<[WalletBalance[], WalletBalance[]]> = context.prefetchedPortfolio
      ? context.prefetchedPortfolio.then((p) => {
          // Partition back into hub/spoke for the existing .then() shape —
          // hub chainIds are Peridot's deployment set (56 = BSC).
          const hub = p.walletBalances.filter((b) => b.chainId === 56)
          const spokes = p.walletBalances.filter((b) => b.chainId !== 56)
          return [hub, spokes]
        })
      : Promise.all([
          readHubWalletBalances(context.userAddress).catch(() => []),
          readSpokeWalletBalances(context.userAddress).catch(() => []),
        ])
    // Idle (un-deposited) Stellar wallet balances — XLM/USDC/EURC. Kept separate
    // from the EVM walletBalances so the EVM routing hints + cross-chain copy
    // don't wrongly apply to Stellar assets.
    const stellarIdleP: Promise<WalletBalance[]> = stellarForPortfolio
      ? import('@/lib/agents/portfolio-reader')
          .then((m) => m.readStellarWalletBalances(stellarForPortfolio))
          .catch(() => [])
      : Promise.resolve([])

    // Skip dust ($< 0.50) to avoid card spam.
    const depositCards: PositionCardBlock[] = []
    const loanCards: PositionCardBlock[] = []
    const idleCards: PositionCardBlock[] = []

    const portfolioTask = portfolioP.then((portfolio) => {
      // Aggregate across chains by symbol — user never sees "USDC" twice
      // (chains hidden from consumer UI). Earn rate is value-weighted.
      const depositAgg = new Map<string, { valueUsd: number; weightedRate: number }>()
      const loanAgg = new Map<string, number>()
      for (const p of portfolio.positions) {
        const key = p.assetSymbol.toUpperCase()
        if (p.suppliedUsd > 0) {
          const prev = depositAgg.get(key) ?? { valueUsd: 0, weightedRate: 0 }
          prev.valueUsd += p.suppliedUsd
          prev.weightedRate += p.suppliedUsd * p.apy
          depositAgg.set(key, prev)
        }
        if (p.borrowedUsd > 0) {
          loanAgg.set(key, (loanAgg.get(key) ?? 0) + p.borrowedUsd)
        }
      }
      for (const [symbol, { valueUsd, weightedRate }] of [...depositAgg.entries()].sort(
        (a, b) => b[1].valueUsd - a[1].valueUsd,
      )) {
        const card: PositionCardBlock = {
          type: 'position_card',
          assetSymbol: symbol,
          kind: 'deposit',
          valueUsd,
          earnRate: valueUsd > 0 ? weightedRate / valueUsd : 0,
        }
        depositCards.push(card)
        emit(card)
      }
      for (const [symbol, valueUsd] of [...loanAgg.entries()].sort((a, b) => b[1] - a[1])) {
        const card: PositionCardBlock = {
          type: 'position_card',
          assetSymbol: symbol,
          kind: 'loan',
          valueUsd,
        }
        loanCards.push(card)
        emit(card)
      }
      return portfolio
    })

    const walletTask = walletP.then(([hub, spokes]) => {
      const walletBalances = [...hub, ...spokes]
      const idleAgg = new Map<string, number>()
      for (const b of walletBalances) {
        const usd = b.amountUsd ?? 0
        if (usd < 0.5) continue
        const key = b.assetSymbol.toUpperCase()
        idleAgg.set(key, (idleAgg.get(key) ?? 0) + usd)
      }
      for (const [symbol, valueUsd] of [...idleAgg.entries()].sort((a, b) => b[1] - a[1])) {
        const card: PositionCardBlock = {
          type: 'position_card',
          assetSymbol: symbol,
          kind: 'idle',
          valueUsd,
        }
        idleCards.push(card)
        emit(card)
      }
      return walletBalances
    })

    const [portfolio, walletBalances, stellarIdle] = await Promise.all([
      portfolioTask,
      walletTask,
      stellarIdleP,
    ])

    if (portfolio.positions.length === 0 && walletBalances.length === 0 && stellarIdle.length === 0) {
      return {
        toolCallId: toolCall.id,
        content:
          'No active positions and no bridgeable wallet balances found. The user may not have any funds yet.',
      }
    }

    const sections: string[] = []
    if (portfolio.positions.length > 0) {
      sections.push(
        `## Active positions (Peridot pools)\n${formatPortfolioSummary(portfolio)}`,
      )

      // Concentration insight — surface single-asset dominance so Perry can
      // proactively raise diversification when one asset carries most of the
      // book. Pure derivation from depositCards (already aggregated by symbol);
      // no extra reads. The card visualization already shows a breakdown bar
      // — this just gives Perry the language to comment on it.
      if (portfolio.totalSuppliedUsd > 0 && depositCards.length > 0) {
        const top = depositCards.reduce((a, b) => (a.valueUsd >= b.valueUsd ? a : b))
        const topPct = (top.valueUsd / portfolio.totalSuppliedUsd) * 100
        let level: 'low' | 'moderate' | 'high' | null = null
        if (topPct >= 80) level = 'high'
        else if (topPct >= 60) level = 'moderate'
        else if (depositCards.length === 1) level = 'high'
        if (level) {
          sections.push(
            `## Concentration\n` +
              `${top.assetSymbol} = ${topPct.toFixed(0)}% of deposits (${level} concentration). ` +
              (level === 'high'
                ? 'Flag this in your reply — single-asset risk worth mentioning, briefly.'
                : 'Mention only if the user asks about diversification or risk.'),
          )
        }
      }
    }
    if (walletBalances.length > 0) {
      const formatted = walletBalances
        .map((b) => {
          const chainLabel = {
            1: 'Ethereum', 42161: 'Arbitrum', 10: 'Optimism',
            137: 'Polygon', 8453: 'Base', 43114: 'Avalanche',
          }[b.chainId] ?? `chain ${b.chainId}`
          const usd = b.amountUsd != null ? ` (~$${b.amountUsd.toFixed(2)})` : ''
          return `- **${b.amount} ${b.assetSymbol}** on ${chainLabel}${usd}`
        })
        .join('\n')
      sections.push(
        `## Idle wallet balances (not yet deposited)\nThese tokens are in the user's wallet on other chains. To move them into a Peridot pool on BSC, call \`execute_cross_chain_supply\` with the matching sourceChainId.\n${formatted}`,
      )
    }

    // Stellar idle balances — separate section so chain attribution is exact and
    // the agent is steered to the Stellar tool (NOT EVM cross-chain supply).
    if (stellarIdle.length > 0) {
      const formatted = stellarIdle
        .map((b) => {
          const usd = b.amountUsd != null ? ` (~$${b.amountUsd.toFixed(2)})` : ''
          return `- **${b.amount} ${b.assetSymbol}** on Stellar${usd}`
        })
        .join('\n')
      sections.push(
        `## Stellar wallet balances (idle, not deposited)\nThese are in the user's Stellar wallet. To put them to work, use \`execute_stellar_deposit\` (assetSymbol + amount) — NOT the EVM tools.\n${formatted}`,
      )
    }

    // ── Routing Hints ──────────────────────────────────────────────
    // Pre-compute the optimal source chain + tool for each wallet-held
    // asset so Perry can act without knowing chain economics. Perry is
    // instructed in the system prompt to follow the `recommended` and only
    // act on confidence='high' without asking.
    if (walletBalances.length > 0) {
      try {
        const { planDepositRoute, formatRouteHint } = await import('@/lib/agents/routing')
        const uniqueSymbols = Array.from(
          new Set(walletBalances.map((b) => b.assetSymbol.toUpperCase())),
        )
        const hintLines = uniqueSymbols.map((sym) => {
          const route = planDepositRoute({
            assetSymbol: sym,
            portfolio: { walletBalances },
          })
          return formatRouteHint(sym, route)
        })
        sections.push(
          `## Routing Hints (pre-computed — follow these)\n`
          + `When the user says "deposit my X" without specifying a chain, use the recommended tool + chain below. Only ask which source to use when Confidence is explicitly LOW.\n`
          + hintLines.join('\n'),
        )
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[portfolio] routing hints skipped:', err)
      }
    }

    // Overview is computed after both reads finish (it needs totals) and
    // emitted last. Visually this lands at the bottom of the streamed
    // blocks — the cards the user cares about are already on screen by
    // the time the overview joins them.
    const breakdown =
      portfolio.totalSuppliedUsd > 0
        ? depositCards.map((c) => ({
            assetSymbol: c.assetSymbol,
            valueUsd: c.valueUsd,
            percentage: (c.valueUsd / portfolio.totalSuppliedUsd) * 100,
          }))
        : []
    const stellarIdleUsd = stellarIdle.reduce((sum, b) => sum + (b.amountUsd ?? 0), 0)
    const idleUsd = idleCards.reduce((sum, c) => sum + c.valueUsd, 0) + stellarIdleUsd
    const idleAssetCount = idleCards.length + stellarIdle.length
    const overview: PortfolioOverviewBlock = {
      type: 'portfolio_overview',
      totalDepositedUsd: portfolio.totalSuppliedUsd,
      totalBorrowedUsd: portfolio.totalBorrowedUsd,
      netEarnRate: portfolio.netApy,
      positionCount: depositCards.length,
      breakdown,
      idleUsd: idleUsd > 0 ? idleUsd : undefined,
      idleAssetCount: idleAssetCount > 0 ? idleAssetCount : undefined,
    }
    emit(overview)

    return {
      toolCallId: toolCall.id,
      content: `User portfolio (live on-chain):\n\n${sections.join('\n\n')}`,
      // When the route wired up emitBlock we already streamed every block;
      // returning them again would duplicate in the persisted message.
      // Legacy callers (no emitBlock) get the full list as before.
      blocks: progressive ? [] : [overview, ...depositCards, ...loanCards, ...idleCards],
    }
  } catch (error) {
    // Fallback to DB snapshot if multicall fails
    const snapshots = await sql`
      SELECT * FROM user_portfolio_snapshots
      WHERE LOWER(wallet_address) = ${context.userAddress.toLowerCase()}
      ORDER BY created_at DESC
      LIMIT 1
    `

    if (snapshots.length === 0) {
      return {
        toolCallId: toolCall.id,
        content:
          'No portfolio data found. The user may not have any active positions, or their wallet is not connected.',
      }
    }

    const snapshot = snapshots[0]
    let data: any
    try {
      data = typeof snapshot.data === 'string'
        ? JSON.parse(snapshot.data)
        : snapshot.data
    } catch {
      return {
        toolCallId: toolCall.id,
        content: 'Cached portfolio data is corrupted — please refresh to fetch fresh data.',
      }
    }

    return {
      toolCallId: toolCall.id,
      content: `User portfolio (cached): Total supplied $${data?.totalSupplied?.toFixed(2) ?? '0'}, Total borrowed $${data?.totalBorrowed?.toFixed(2) ?? '0'}, Net APY ${data?.netApy?.toFixed(2) ?? '0'}%`,
    }
  }
}

// ── get_user_earnings ────────────────────────────────────────────────
// Wraps /api/user/earnings (cached 60s memory + DB). The endpoint already
// runs the time-weighted APY calculation per token; we re-shape its output
// into the AssetEarningsBlock the chat can render directly.

interface EarningsTokenEntry {
  tokenSymbol: string
  earnings: number
  totalSupplied: number
  totalRedeemed: number
  firstSupplyDate: string
  chainId: number
}

interface EarningsApiData {
  totalLifetimeEarnings: number
  effectiveApy: number
  perTokenBreakdown?: EarningsTokenEntry[]
}

const STABLE_ALIASES: Record<string, string[]> = {
  USDC: ['USDC', 'USD'],
  USDT: ['USDT'],
  DAI: ['DAI'],
  ETH: ['ETH', 'WETH'],
  WETH: ['WETH', 'ETH'],
  BTC: ['BTC', 'WBTC', 'BTCB'],
  WBTC: ['WBTC', 'BTC', 'BTCB'],
  BNB: ['BNB', 'WBNB'],
}

function daysSince(iso: string | undefined): number {
  if (!iso) return 0
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return 0
  return Math.max(1, Math.floor((Date.now() - t) / 86400000))
}

async function executeGetUserEarnings(
  toolCall: ToolCallInput,
  context: ToolContext,
): Promise<ToolResult> {
  const { assetSymbol } = (toolCall.input ?? {}) as { assetSymbol?: string }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

  let payload: { success?: boolean; data?: EarningsApiData } | null = null
  try {
    const res = await fetch(
      `${baseUrl}/api/user/earnings?address=${encodeURIComponent(context.userAddress)}`,
      { cache: 'no-store' },
    )
    if (!res.ok) {
      return {
        toolCallId: toolCall.id,
        content: 'Could not load earnings right now — try again in a moment.',
      }
    }
    payload = await res.json()
  } catch {
    return {
      toolCallId: toolCall.id,
      content: 'Could not load earnings right now — try again in a moment.',
    }
  }

  const data = payload?.data
  if (!data || !Array.isArray(data.perTokenBreakdown) || data.perTokenBreakdown.length === 0) {
    return {
      toolCallId: toolCall.id,
      content:
        "You haven't earned anything yet — make a deposit and I'll start tracking returns.",
    }
  }

  // Aggregate per-token across chains. The upstream endpoint returns one row
  // per (token, chain); collapsing by symbol matches the consumer-no-chains
  // rule. We pick the earliest firstSupplyDate so daysActive reflects the
  // user's actual time in that asset, not just the most recent chain.
  type AggToken = {
    earnings: number
    totalSupplied: number
    firstSupplyDate?: string
  }
  const agg = new Map<string, AggToken>()
  for (const t of data.perTokenBreakdown) {
    const sym = (t.tokenSymbol || '').toUpperCase()
    if (!sym) continue
    const prev = agg.get(sym) ?? { earnings: 0, totalSupplied: 0 }
    prev.earnings += t.earnings || 0
    prev.totalSupplied += t.totalSupplied || 0
    if (t.firstSupplyDate) {
      if (!prev.firstSupplyDate || new Date(t.firstSupplyDate) < new Date(prev.firstSupplyDate)) {
        prev.firstSupplyDate = t.firstSupplyDate
      }
    }
    agg.set(sym, prev)
  }

  const entries = [...agg.entries()]
    .map(([tokenSymbol, v]) => ({
      tokenSymbol,
      earnedUsd: v.earnings,
      totalSuppliedUsd: v.totalSupplied,
      daysActive: daysSince(v.firstSupplyDate),
    }))
    .filter((e) => e.earnedUsd > 0.001 || e.totalSuppliedUsd > 0)
    .sort((a, b) => b.earnedUsd - a.earnedUsd)

  // Aggregate-wide days — earliest first-supply across the whole portfolio.
  const earliestIso = data.perTokenBreakdown
    .map((t) => t.firstSupplyDate)
    .filter((d): d is string => Boolean(d))
    .sort()[0]
  const totalDaysActive = daysSince(earliestIso)

  // Focused single-asset path — match by symbol + common aliases (USD ↔ USDC,
  // ETH ↔ WETH) so a user typing "USD" or "ETH" still finds the canonical row.
  if (assetSymbol) {
    const upper = assetSymbol.toUpperCase()
    const aliases = STABLE_ALIASES[upper] ?? [upper]
    const focused = entries.find((e) => aliases.includes(e.tokenSymbol))
    if (!focused) {
      return {
        toolCallId: toolCall.id,
        content: `No earnings data for ${upper} yet — you haven't deposited any.`,
      }
    }
    const focusedApy =
      focused.totalSuppliedUsd > 0 && focused.daysActive > 0
        ? (focused.earnedUsd / focused.totalSuppliedUsd) * (365 / focused.daysActive) * 100
        : 0
    return {
      toolCallId: toolCall.id,
      content: `On your ${focused.tokenSymbol}: $${focused.earnedUsd.toFixed(2)} earned over ${focused.daysActive}d (${focusedApy.toFixed(1)}% effective).`,
      block: {
        type: 'asset_earnings',
        focusSymbol: focused.tokenSymbol,
        totalEarnedUsd: focused.earnedUsd,
        effectiveApy: focusedApy,
        daysActive: focused.daysActive,
        breakdown: [focused],
      },
    }
  }

  return {
    toolCallId: toolCall.id,
    content: `$${data.totalLifetimeEarnings.toFixed(2)} earned across ${entries.length} asset${entries.length === 1 ? '' : 's'} over ${totalDaysActive}d.`,
    block: {
      type: 'asset_earnings',
      totalEarnedUsd: data.totalLifetimeEarnings,
      effectiveApy: data.effectiveApy ?? 0,
      daysActive: totalDaysActive,
      breakdown: entries,
    },
  }
}

// ── project_my_earnings ──────────────────────────────────────────────
// Forward projection on the user's ACTUAL deposit (not a hypothetical).
// Uses live portfolio + current APY with daily compounding so the curve
// matches what they'd see in the app's earn-projection charts.

function projectionStep(days: number): number {
  if (days <= 30) return 1
  if (days <= 90) return 3
  if (days <= 365) return 7
  return Math.max(14, Math.floor(days / 60))
}

async function executeProjectMyEarnings(
  toolCall: ToolCallInput,
  context: ToolContext,
): Promise<ToolResult> {
  const { assetSymbol, days = 365 } = (toolCall.input ?? {}) as {
    assetSymbol?: string
    days?: number
  }
  const window = Math.min(Math.max(1, Math.floor(days)), 1825)

  const { readMultiChainPortfolio } = await import('@/lib/agents/portfolio-reader')
  const portfolio = context.prefetchedPortfolio
    ? (await context.prefetchedPortfolio).portfolio
    : await readMultiChainPortfolio(context.userAddress, [56, 143])

  if (portfolio.positions.length === 0 || portfolio.totalSuppliedUsd <= 0) {
    return {
      toolCallId: toolCall.id,
      content:
        'No active deposits to project — make a deposit first and I can show you the curve.',
    }
  }

  // Aggregate by symbol so cross-chain dupes collapse into one entry.
  const agg = new Map<string, { valueUsd: number; weightedRate: number }>()
  for (const p of portfolio.positions) {
    if (p.suppliedUsd <= 0) continue
    const sym = p.assetSymbol.toUpperCase()
    const prev = agg.get(sym) ?? { valueUsd: 0, weightedRate: 0 }
    prev.valueUsd += p.suppliedUsd
    prev.weightedRate += p.suppliedUsd * p.apy
    agg.set(sym, prev)
  }

  let principalUsd: number
  let apy: number
  let label: string

  if (assetSymbol) {
    const upper = assetSymbol.toUpperCase()
    const aliases =
      upper === 'USD' ? ['USDC', 'USDT'] : upper === 'ETH' ? ['ETH', 'WETH'] : [upper]
    const matched = [...agg.entries()].filter(([sym]) => aliases.includes(sym))
    if (matched.length === 0) {
      return {
        toolCallId: toolCall.id,
        content: `No ${upper} deposits to project — try without specifying an asset.`,
      }
    }
    principalUsd = matched.reduce((s, [, v]) => s + v.valueUsd, 0)
    const weightedRateSum = matched.reduce((s, [, v]) => s + v.weightedRate, 0)
    apy = principalUsd > 0 ? weightedRateSum / principalUsd : 0
    label = matched.length === 1 ? matched[0][0] : aliases.join('/')
  } else {
    principalUsd = portfolio.totalSuppliedUsd
    apy = portfolio.netApy
    label = 'all deposits'
  }

  if (apy <= 0) {
    return {
      toolCallId: toolCall.id,
      content: `Couldn't read a current rate for ${label} — try again in a moment.`,
    }
  }

  const dailyRate = apy / 100 / 365
  const finalValue = principalUsd * Math.pow(1 + dailyRate, window)
  const earned = finalValue - principalUsd

  const step = projectionStep(window)
  const series: Array<{ day: string; value: number }> = []
  for (let d = 0; d <= window; d += step) {
    series.push({
      day: String(d),
      value: Math.round(principalUsd * Math.pow(1 + dailyRate, d) * 100) / 100,
    })
  }
  if (series[series.length - 1]?.day !== String(window)) {
    series.push({ day: String(window), value: Math.round(finalValue * 100) / 100 })
  }

  const horizonLabel =
    window >= 365
      ? `${(window / 365).toFixed(window % 365 === 0 ? 0 : 1)}y`
      : window >= 30
        ? `${Math.round(window / 30)}mo`
        : `${window}d`

  const chart: ChartBlock = {
    type: 'chart',
    chartType: 'area',
    title: `Projected value of your ${label} (${horizonLabel} at ${apy.toFixed(1)}%)`,
    data: series,
    xKey: 'day',
    yKeys: ['value'],
    colors: ['#10b981'],
  }

  return {
    toolCallId: toolCall.id,
    content: `On your $${principalUsd.toFixed(2)} ${label} at ${apy.toFixed(1)}%, in ${horizonLabel} you'd have about $${finalValue.toFixed(2)} (+$${earned.toFixed(2)} earned).`,
    block: chart,
  }
}

// ── compare_my_rate ──────────────────────────────────────────────────
// "You earn X% on $Y; the best is Z% — switching would add ~$N/yr."
// Reuses agent_pool_registry + apy_latest enrichment via markets-reader so
// we always pull the freshest live rate, not a stale snapshot.

async function executeCompareMyRate(
  toolCall: ToolCallInput,
  context: ToolContext,
): Promise<ToolResult> {
  const { assetSymbol } = (toolCall.input ?? {}) as { assetSymbol?: string }
  if (!assetSymbol || typeof assetSymbol !== 'string') {
    return {
      toolCallId: toolCall.id,
      content:
        'Need an asset to compare — pass `assetSymbol` (e.g. "USDC", "USDT").',
    }
  }
  const upper = assetSymbol.toUpperCase()
  const aliases =
    upper === 'USD' ? ['USDC', 'USDT'] : upper === 'ETH' ? ['ETH', 'WETH'] : [upper]

  const { readMultiChainPortfolio } = await import('@/lib/agents/portfolio-reader')
  const portfolio = context.prefetchedPortfolio
    ? (await context.prefetchedPortfolio).portfolio
    : await readMultiChainPortfolio(context.userAddress, [56, 143])

  // User's current weighted rate for this asset (group across chains).
  let principalUsd = 0
  let weightedRateSum = 0
  for (const p of portfolio.positions) {
    if (p.suppliedUsd <= 0) continue
    if (!aliases.includes(p.assetSymbol.toUpperCase())) continue
    principalUsd += p.suppliedUsd
    weightedRateSum += p.suppliedUsd * p.apy
  }

  if (principalUsd <= 0) {
    return {
      toolCallId: toolCall.id,
      content: `You don't have any ${upper} deposited yet — nothing to compare against.`,
    }
  }
  const currentRate = weightedRateSum / principalUsd

  // Best Peridot rate for this asset across chains.
  const rows = await sql`
    SELECT asset_symbol, chain_id FROM agent_pool_registry
    WHERE is_peridot = true AND is_active = true
      AND UPPER(asset_symbol) = ANY(${aliases})
  `
  const candidates: PoolInfo[] = rows.map((r) => ({
    id: `${(r.asset_symbol as string).toLowerCase()}-${r.chain_id}`,
    protocol: 'peridot',
    poolName: `Peridot ${r.asset_symbol}`,
    assetSymbol: (r.asset_symbol as string).toUpperCase(),
    chainId: Number(r.chain_id),
    riskTier: 'low',
    isPeridot: true,
    isActive: true,
  }))
  if (candidates.length === 0) {
    return {
      toolCallId: toolCall.id,
      content: `No live ${upper} pools to compare with right now.`,
    }
  }
  const { enrichPoolsWithLiveApy } = await import('@/lib/agents/markets-reader')
  await enrichPoolsWithLiveApy(candidates)

  const bestRate = candidates.reduce(
    (m, p) => Math.max(m, p.liveApy ?? 0),
    0,
  )
  if (bestRate <= 0) {
    return {
      toolCallId: toolCall.id,
      content: `Couldn't read a current ${upper} rate — try again in a moment.`,
    }
  }

  const deltaPct = bestRate - currentRate
  const annualDelta = (deltaPct / 100) * principalUsd

  // Break-even rule of thumb: only worth surfacing as "switch" if delta is
  // both meaningful relative size (>= 0.3 pp) AND > $1/yr in absolute terms.
  // Below that, the answer is "you're already on the best rate or close to it".
  const meaningfulDelta = deltaPct >= 0.3 && annualDelta >= 1
  if (!meaningfulDelta) {
    return {
      toolCallId: toolCall.id,
      content: `You're earning ${currentRate.toFixed(1)}% on $${principalUsd.toFixed(2)} ${upper} — already at or near the best available rate (${bestRate.toFixed(1)}%).`,
      block: {
        type: 'alert',
        severity: 'success',
        title: `You're on the best ${upper} rate`,
        body: `${currentRate.toFixed(1)}% on $${principalUsd.toFixed(2)} — within striking distance of the top (${bestRate.toFixed(1)}%).`,
      } satisfies AlertBlock,
    }
  }

  const alert: AlertBlock = {
    type: 'alert',
    severity: 'info',
    title: `Better ${upper} rate available`,
    body: `You're earning ${currentRate.toFixed(1)}% on $${principalUsd.toFixed(2)}. Best available: ${bestRate.toFixed(1)}% — about $${annualDelta.toFixed(2)} more per year.`,
  }
  const quickReply: QuickReplyBlock = {
    type: 'quick_reply',
    replies: [
      {
        label: `Move my ${upper} to the better rate`,
        prompt: `Move my ${upper} to the highest-paying pool.`,
      },
      {
        label: 'Show me the alternatives',
        prompt: `Compare the top ${upper} pools side by side.`,
      },
    ],
  }

  return {
    toolCallId: toolCall.id,
    content: `On $${principalUsd.toFixed(2)} ${upper}: you earn ${currentRate.toFixed(1)}%, best is ${bestRate.toFixed(1)}% (≈$${annualDelta.toFixed(2)}/yr more).`,
    blocks: [alert, quickReply],
  }
}

async function executeGetPoolRegistry(
  toolCall: ToolCallInput,
): Promise<ToolResult> {
  const { protocol, riskTier, chainId } = toolCall.input as {
    protocol?: string
    riskTier?: string
    chainId?: number
  }

  const conditions: string[] = ['is_active = true']
  const params: unknown[] = []

  // Build dynamic query with parameterized conditions
  let query = `SELECT * FROM agent_pool_registry WHERE is_active = true`
  if (protocol) {
    query += ` AND LOWER(protocol) = LOWER($1)`
  }

  // Use the simpler approach with tagged template for safety
  let rows
  if (protocol && riskTier && chainId) {
    rows = await sql`
      SELECT * FROM agent_pool_registry
      WHERE is_active = true AND LOWER(protocol) = ${protocol.toLowerCase()}
        AND risk_tier = ${riskTier} AND chain_id = ${chainId}
      ORDER BY asset_symbol
    `
  } else if (protocol && riskTier) {
    rows = await sql`
      SELECT * FROM agent_pool_registry
      WHERE is_active = true AND LOWER(protocol) = ${protocol.toLowerCase()}
        AND risk_tier = ${riskTier}
      ORDER BY chain_id, asset_symbol
    `
  } else if (protocol) {
    rows = await sql`
      SELECT * FROM agent_pool_registry
      WHERE is_active = true AND LOWER(protocol) = ${protocol.toLowerCase()}
      ORDER BY chain_id, asset_symbol
    `
  } else if (riskTier) {
    rows = await sql`
      SELECT * FROM agent_pool_registry
      WHERE is_active = true AND risk_tier = ${riskTier}
      ORDER BY protocol, chain_id, asset_symbol
    `
  } else if (chainId) {
    rows = await sql`
      SELECT * FROM agent_pool_registry
      WHERE is_active = true AND chain_id = ${chainId}
      ORDER BY protocol, asset_symbol
    `
  } else {
    rows = await sql`
      SELECT * FROM agent_pool_registry
      WHERE is_active = true
      ORDER BY protocol, chain_id, asset_symbol
    `
  }

  const pools = rows.map(mapPoolRow)

  const block: PoolTableBlock = {
    type: 'pool_table',
    pools,
    title: 'Pool Registry',
  }

  return {
    toolCallId: toolCall.id,
    content: `Pool registry: ${pools.length} active pool(s) found across ${new Set(pools.map((p) => p.protocol)).size} protocol(s).`,
    block,
  }
}

async function executeBuildStrategyProposal(
  toolCall: ToolCallInput,
  context?: ToolContext,
): Promise<ToolResult> {
  const { riskLevel, capitalUsd, preferredAssets, preferredChains } =
    toolCall.input as {
      riskLevel: 'low' | 'medium' | 'high'
      capitalUsd: number
      preferredAssets?: string[]
      preferredChains?: number[]
    }

  // Fetch available pools, filtered to the current deployment's chains so
  // a mainnet user never gets a testnet pool slipped into their strategy.
  // Stellar pools are further gated on the user actually having a Stellar
  // wallet — otherwise the resulting action button would be unsignable.
  const allowedChains = resolveNetworkPresetChainIds()
  const rows = allowedChains
    ? await sql`
        SELECT * FROM agent_pool_registry
        WHERE is_active = true AND chain_id = ANY(${allowedChains}::int[])
        ORDER BY is_peridot DESC, asset_symbol
      `
    : await sql`
        SELECT * FROM agent_pool_registry
        WHERE is_active = true
        ORDER BY is_peridot DESC, asset_symbol
      `
  let pools = rows.map(mapPoolRow)
  if (!context?.stellarAddress) {
    pools = pools.filter((p) => !isStellarChain(p.chainId))
  }

  if (pools.length === 0) {
    return {
      toolCallId: toolCall.id,
      content: 'No active pools available to build a strategy.',
    }
  }

  // Enrich with live APY from apy_latest — without this every position would
  // surface as 0% and the strategy card would be unusable.
  await enrichPoolsWithLiveApy(pools)

  // Disqualify pools that genuinely have no yield right now (0% / negative).
  // This is real-world signal, not a data bug: e.g. the Stellar XLM market
  // currently returns -0.01% from DeFindex because lending demand is flat.
  // Drop those candidates so the strategy can still be built from the pools
  // that DO pay something, instead of refusing the whole proposal.
  const yieldingPools = pools.filter((p) => (p.liveApy ?? 0) > 0)

  // Strategy Engine: deterministic, rules-based allocation
  const allocations = buildAllocations(yieldingPools, {
    riskLevel,
    capitalUsd,
    preferredAssets,
    preferredChains,
  })

  const blendedApy = allocations.reduce(
    (sum, a) => sum + a.apy * (a.percentage / 100),
    0,
  )

  // Guard at the tool boundary — only refuse when there's *nothing* to
  // propose. If a single pool slipped through with 0% post-dedup (race
  // between enrichment and allocation), drop it; only if the whole basket
  // is empty do we fail loud. Defense-in-depth for the system-prompt rule.
  if (allocations.length === 0 || blendedApy <= 0) {
    return {
      toolCallId: toolCall.id,
      content:
        'Strategy proposal blocked: no Peridot pools are paying meaningful yield right now. Do NOT present a strategy — tell the user rates are flat across the board and offer to check back later or look at their current positions instead.',
    }
  }

  const reasoning = generateReasoning(allocations, riskLevel, capitalUsd)

  // Generate confirmation token and persist proposal
  const confirmationToken = randomUUID()

  // Build allocation details with USD amounts for each position
  const allocationsWithAmounts = allocations.map((a) => ({
    ...a,
    assetId: a.asset.toLowerCase().replace('$', ''),
    amount: ((a.percentage / 100) * capitalUsd).toFixed(2),
    actionType: 'supply',
  }))

  // Persist proposal to DB if we have context
  if (context?.userAddress && context?.conversationId) {
    await sql`
      INSERT INTO agent_proposals (
        conversation_id, user_address, allocations, blended_apy,
        risk_level, reasoning, status, confirmation_token
      ) VALUES (
        ${context.conversationId}, ${context.userAddress},
        ${jsonbParam(allocationsWithAmounts)}, ${blendedApy},
        ${riskLevel}, ${reasoning}, 'proposed', ${confirmationToken}
      )
    `
  }

  // Build blocks: AllocationBlock + ActionButtonBlock
  const allocationBlock: AllocationBlock = {
    type: 'allocation',
    allocations,
    blendedApy,
    riskLevel,
    reasoning,
  }

  // Only add action button if proposal was persisted
  const blocks: ContentBlock[] = [allocationBlock]

  if (context?.userAddress && context?.conversationId) {
    const actionBlock: ActionButtonBlock = {
      type: 'action_button',
      actionType: 'deposit',
      label: `Start earning $${capitalUsd.toLocaleString()}`,
      params: {
        assetSymbol: allocations.map((a) => a.asset).join('+'),
        amount: capitalUsd.toString(),
        poolId: 'strategy',
        chainId: allocations[0]?.chainId ?? 56,
      },
      confirmationToken,
      earnRate: blendedApy,
    }
    blocks.push(actionBlock)
  }

  return {
    toolCallId: toolCall.id,
    content: `Strategy proposal: ${allocations.length} position(s), blended APY ${blendedApy.toFixed(2)}%, risk level ${riskLevel}. ${reasoning}`,
    blocks,
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

function mapPoolRow(row: Record<string, unknown>): PoolInfo {
  return {
    id: row.id as string,
    protocol: row.protocol as string,
    poolName: row.pool_name as string,
    assetSymbol: row.asset_symbol as string,
    chainId: row.chain_id as number,
    riskTier: row.risk_tier as 'low' | 'medium' | 'high',
    isPeridot: row.is_peridot as boolean,
    isActive: row.is_active as boolean,
    contractAddress: row.contract_address as string | undefined,
    metadata: jsonbObject(row.metadata),
    // liveApy will be enriched by the pool registry API
    liveApy: jsonbObject(row.metadata).liveApy as number | undefined,
  }
}

interface AllocationParams {
  riskLevel: 'low' | 'medium' | 'high'
  capitalUsd: number
  preferredAssets?: string[]
  preferredChains?: number[]
}

function buildAllocations(
  pools: PoolInfo[],
  params: AllocationParams,
): AllocationEntry[] {
  const { riskLevel, preferredAssets, preferredChains } = params

  // Filter pools by risk level constraints
  let eligible = pools.filter((p) => {
    if (riskLevel === 'low') return p.riskTier === 'low'
    if (riskLevel === 'medium') return p.riskTier !== 'high'
    return true // high risk: all pools eligible
  })

  // Prefer user's asset and chain selections
  if (preferredAssets?.length) {
    const preferred = eligible.filter((p) =>
      preferredAssets.some((a) => a.toLowerCase() === p.assetSymbol.toLowerCase()),
    )
    if (preferred.length > 0) eligible = preferred
  }

  if (preferredChains?.length) {
    const preferred = eligible.filter((p) => preferredChains.includes(p.chainId))
    if (preferred.length > 0) eligible = preferred
  }

  // Sort: Peridot first, then by APY descending
  eligible.sort((a, b) => {
    if (a.isPeridot !== b.isPeridot) return a.isPeridot ? -1 : 1
    return (b.liveApy ?? 0) - (a.liveApy ?? 0)
  })

  // Dedup per asset symbol — keep the highest-APY pool per asset so a
  // strategy never lists "USDC" four times across four chains. The user
  // sees one entry per asset, on the chain that pays the most.
  const bestPerAsset = new Map<string, PoolInfo>()
  for (const p of eligible) {
    const key = p.assetSymbol.toUpperCase()
    const cur = bestPerAsset.get(key)
    if (!cur || (p.liveApy ?? 0) > (cur.liveApy ?? 0)) bestPerAsset.set(key, p)
  }
  eligible = Array.from(bestPerAsset.values())

  // Allocate: Peridot gets 50-70%, rest to externals
  const maxPositions = riskLevel === 'low' ? 3 : riskLevel === 'medium' ? 5 : 7
  const selected = eligible.slice(0, maxPositions)

  if (selected.length === 0) return []

  const peridotPools = selected.filter((p) => p.isPeridot)
  const externalPools = selected.filter((p) => !p.isPeridot)

  const peridotShare = externalPools.length > 0 ? 65 : 100
  const externalShare = 100 - peridotShare

  const allocations: AllocationEntry[] = []

  // Distribute peridot share equally among peridot pools
  if (peridotPools.length > 0) {
    const perPool = peridotShare / peridotPools.length
    for (const pool of peridotPools) {
      allocations.push({
        protocol: pool.protocol,
        asset: pool.assetSymbol,
        chainId: pool.chainId,
        percentage: Math.round(perPool * 10) / 10,
        apy: pool.liveApy ?? 0,
        isPeridot: true,
        poolId: pool.id,
      })
    }
  }

  // Distribute external share
  if (externalPools.length > 0) {
    const perPool = externalShare / externalPools.length
    for (const pool of externalPools) {
      allocations.push({
        protocol: pool.protocol,
        asset: pool.assetSymbol,
        chainId: pool.chainId,
        percentage: Math.round(perPool * 10) / 10,
        apy: pool.liveApy ?? 0,
        isPeridot: false,
        poolId: pool.id,
      })
    }
  }

  return allocations
}

async function executeUpdateUserProfile(
  toolCall: ToolCallInput,
  context: ToolContext,
): Promise<ToolResult> {
  if (!context.userAddress) {
    return {
      toolCallId: toolCall.id,
      content: 'Error: No user address available to update profile.',
    }
  }

  const {
    riskLevel,
    investmentGoal,
    timeHorizon,
    capitalUsd,
    preferredAssets,
    preferredChains,
  } = toolCall.input as {
    riskLevel: string
    investmentGoal?: string
    timeHorizon?: string
    capitalUsd?: number
    preferredAssets?: string[]
    preferredChains?: number[]
  }

  await sql`
    INSERT INTO agent_profiles (
      user_address, risk_level, investment_goal, time_horizon,
      capital_usd, preferred_assets, preferred_chains, onboarding_complete
    ) VALUES (
      ${context.userAddress}, ${riskLevel}, ${investmentGoal ?? null},
      ${timeHorizon ?? null}, ${capitalUsd ?? null},
      ${preferredAssets ?? []}, ${preferredChains ?? []}, true
    )
    ON CONFLICT (user_address) DO UPDATE SET
      risk_level = ${riskLevel},
      investment_goal = COALESCE(${investmentGoal ?? null}, agent_profiles.investment_goal),
      time_horizon = COALESCE(${timeHorizon ?? null}, agent_profiles.time_horizon),
      capital_usd = COALESCE(${capitalUsd ?? null}, agent_profiles.capital_usd),
      preferred_assets = CASE WHEN ${(preferredAssets ?? []).length > 0} THEN ${preferredAssets ?? []}::text[] ELSE agent_profiles.preferred_assets END,
      preferred_chains = CASE WHEN ${(preferredChains ?? []).length > 0} THEN ${preferredChains ?? []}::int[] ELSE agent_profiles.preferred_chains END,
      onboarding_complete = true
  `

  const parts = [`Risk level: ${riskLevel}`]
  if (investmentGoal) parts.push(`Goal: ${investmentGoal}`)
  if (timeHorizon) parts.push(`Time horizon: ${timeHorizon}`)
  if (capitalUsd) parts.push(`Capital: $${capitalUsd.toLocaleString()}`)
  if (preferredAssets?.length) parts.push(`Assets: ${preferredAssets.join(', ')}`)
  if (preferredChains?.length) parts.push(`Chains: ${preferredChains.join(', ')}`)

  return {
    toolCallId: toolCall.id,
    content: `Profile updated successfully. ${parts.join('. ')}.`,
  }
}

function generateReasoning(
  allocations: AllocationEntry[],
  riskLevel: string,
  capitalUsd: number,
): string {
  const peridotCount = allocations.filter((a) => a.isPeridot).length
  const externalCount = allocations.length - peridotCount
  const peridotPct = allocations
    .filter((a) => a.isPeridot)
    .reduce((sum, a) => sum + a.percentage, 0)

  const parts: string[] = []
  parts.push(
    `${riskLevel.charAt(0).toUpperCase() + riskLevel.slice(1)} risk strategy for $${capitalUsd.toLocaleString()}.`,
  )
  parts.push(
    `${peridotCount} Peridot pool(s) receiving ${peridotPct.toFixed(0)}% of capital.`,
  )
  if (externalCount > 0) {
    parts.push(
      `${externalCount} external pool(s) for diversification at ${(100 - peridotPct).toFixed(0)}%.`,
    )
  }

  return parts.join(' ')
}

// ─── Single-action executors (deposit / withdraw / pay_back) ──────
// These cover the happy path for a hub-chain single-asset action. Perry
// should prefer them over `execute_rebalance` when the user only wants to
// move one asset in one direction. Auto-Execute eligibility is evaluated by
// the ActionButtonBlock based on the resulting actionType + amountUsd.

type SingleActionType = 'deposit' | 'withdraw' | 'pay_back'

const ACTION_VERB: Record<SingleActionType, string> = {
  deposit: 'Deposit',
  withdraw: 'Withdraw',
  pay_back: 'Pay back',
}

async function executeSingleAction(
  toolCall: ToolCallInput,
  context: ToolContext,
  actionType: SingleActionType,
): Promise<ToolResult> {
  const { assetSymbol, amount, chainId } = toolCall.input as {
    assetSymbol?: string
    amount?: string
    chainId?: number
  }

  if (!assetSymbol || !amount || !chainId) {
    return {
      toolCallId: toolCall.id,
      content: `execute_${actionType} requires assetSymbol, amount, and chainId.`,
    }
  }

  const originalNumAmount = Number(amount)
  if (!Number.isFinite(originalNumAmount) || originalNumAmount <= 0) {
    return {
      toolCallId: toolCall.id,
      content: `Amount must be a positive number. Got "${amount}".`,
    }
  }

  // ── Balance-aware clamp (P9) ────────────────────────────────────
  // For deposit + pay_back the ask is funded from the wallet. If UI rounding
  // led the user to ask for slightly more than they actually hold (e.g. user
  // sees "$5 total" across chains but BSC balance is 3.997), the literal
  // 402 "insufficient balance" path surfaces a cryptic error.
  //
  // Instead: read the on-chain balance, clamp silently when the ask is within
  // 2% of available, or hand control back to Perry when it's further off so
  // he can ask the user what to do. Withdraws skip this — buildWithdrawTx
  // already has its own tolerance-redeem logic.
  let effectiveAmount = amount
  let clampedTo: string | null = null
  if (actionType === 'deposit' || actionType === 'pay_back') {
    try {
      const { fetchUserBalance } = await import('@/lib/agents/balance-fetcher')
      const { parseUnits, formatUnits } = await import('viem')
      const assetId = assetSymbol.toLowerCase()
      const b = await fetchUserBalance({
        userAddress: context.userAddress,
        assetId,
        chainId,
      })
      if (b.balance != null && b.decimals != null) {
        const askedWei = parseUnits(String(amount), b.decimals)
        if (askedWei > b.balance) {
          const balWei = b.balance
          const overByPct =
            balWei === BigInt(0)
              ? Infinity
              : Number(askedWei - balWei) / Number(balWei)
          if (overByPct <= 0.02) {
            // Silent clamp — UI and tx use the exact wallet balance
            effectiveAmount = formatUnits(balWei, b.decimals)
            clampedTo = effectiveAmount
          } else {
            // Meaningfully less than asked — bounce control back to Perry
            // rather than emit an ActionButtonBlock that will 402 later.
            const availableLabel = formatUnits(balWei, b.decimals)
            return {
              toolCallId: toolCall.id,
              content:
                `The user asked to ${actionType.replace('_', ' ')} ${amount} ${assetSymbol.toUpperCase()} on chain ${chainId}, `
                + `but the live wallet balance is only ${availableLabel} ${assetSymbol.toUpperCase()}. `
                + `Do NOT call execute_${actionType} with the original amount — it will fail. `
                + `Ask the user whether they want to ${actionType.replace('_', ' ')} the full ${availableLabel} instead, `
                + `or whether they want to top up the wallet first. `
                + `Mention the specific number to the user in consumer-banking language.`,
            }
          }
        }
      }
    } catch {
      // Balance fetch is best-effort — on error fall through with the
      // original ask and let the downstream preflight surface any issue.
    }
  }

  const numAmount = Number(effectiveAmount)
  const confirmationToken = randomUUID()
  await sql`
    INSERT INTO agent_executed_actions (
      conversation_id, user_address, action_type, asset_symbol,
      amount, chain_id, status, confirmation_token
    ) VALUES (
      ${context.conversationId ?? null}, ${context.userAddress},
      ${actionType}, ${assetSymbol.toUpperCase()},
      ${numAmount}, ${chainId}, 'pending', ${confirmationToken}
    )
  `

  // Mirror into the Action Timeline so Perry's status tools + the SSE stream
  // see same-chain actions. Same confirmation_token ties the two records.
  const timelineWrite = await createTimelineForAction({
    conversationId: context.conversationId,
    userAddress: context.userAddress,
    actionType,
    assetSymbol,
    amount: effectiveAmount,
    sourceChainId: chainId,
    destinationChainId: chainId, // same-chain: dest = source
    confirmationToken,
  })

  const verb = ACTION_VERB[actionType]
  const displayAmount = numAmount >= 1
    ? `$${numAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
    : `${numAmount} ${assetSymbol.toUpperCase()}`

  const block: ActionButtonBlock = {
    type: 'action_button',
    actionType,
    label: `${verb} ${displayAmount}`,
    params: {
      assetSymbol: assetSymbol.toUpperCase(),
      amount: effectiveAmount,
      poolId: `peridot-${assetSymbol.toLowerCase()}-${chainId}`,
      chainId,
    },
    confirmationToken,
    estimatedSeconds: 5,
  }

  // Tool content is what Perry sees in his context. It MUST reflect the real
  // state: the block is *ready* but nothing has been dispatched yet. If we
  // silently clamped to match the live balance, note it so Perry can mention
  // it ("rounded to your actual $3.99 balance") instead of claiming the
  // original number.
  const preparedLine = clampedTo
    ? `Prepared a ${actionType.replace('_', ' ')} of ${clampedTo} ${assetSymbol.toUpperCase()} (adjusted down from ${amount} to match the live wallet balance). Mention the rounded number casually; the user asked for slightly more than they hold.`
    : `Prepared a ${actionType.replace('_', ' ')} of ${amount} ${assetSymbol.toUpperCase()}.`
  // If the timeline write failed, tell Perry — otherwise check_action_status
  // will later 404 and he'll tell the user "I don't see any recent action"
  // for an action that IS in flight. Better to surface it now.
  const timelineNote = timelineWrite.ok
    ? ''
    : ` (Note: the action ledger couldn't be written — live status queries may return empty. The user's ActionButtonBlock will still work.)`

  // Per-call auto-execute phrasing instruction. The decision used to live
  // in the system prompt as a conditional Perry had to evaluate; he got
  // it wrong. Now we compute it deterministically here and tell him
  // exactly what to say for THIS specific action.
  const { buildAutoExecuteHint } = await import('@/lib/agents/auto-execute-hint')
  const autoHint = await buildAutoExecuteHint({
    userAddress: context.userAddress,
    actionType,
    amountUsd: STABLECOINS_EXEC.has(assetSymbol.toUpperCase()) && Number.isFinite(numAmount)
      ? numAmount
      : null,
  })

  // Attach the server-authoritative decision so the client doesn't re-evaluate
  // against a potentially-unhydrated React-Query profile. See the `autoExecute`
  // field docs on ActionButtonBlock for why this moved server-side.
  block.autoExecute = {
    willFire: autoHint.decision.willAutoExecute,
    reason: autoHint.decision.reason,
  }

  return {
    toolCallId: toolCall.id,
    content: `${preparedLine} Nothing has been sent to the chain yet — the action button shown to the user is now waiting for them to confirm (or will auto-confirm if within their limit and consent).${timelineNote}${autoHint.instruction}`,
    block,
  }
}

// ─── Stellar (Soroban) lending executor ────────────────────────────
// Stellar txs are built + signed + submitted client-side (the Stellar wallet
// can't sign server-side), so unlike the EVM path there is no server tx-plan.
// This proposer mirrors executeSingleAction's bookkeeping: it writes the
// agent_executed_actions row (chain_id = Stellar sentinel) + the timeline
// entry, then returns an ActionButtonBlock. On confirm, /api/agents/execute
// echoes the action back as `type: 'stellar'` and the frontend calls the
// stellar builders directly. No auto-execute — Stellar always needs a user sign.
const STELLAR_ASSET_SYMBOLS = new Set(['USDC', 'XLM', 'EURC'])

async function executeStellarAction(
  toolCall: ToolCallInput,
  context: ToolContext,
  actionType: SingleActionType,
): Promise<ToolResult> {
  const { assetSymbol, amount } = toolCall.input as {
    assetSymbol?: string
    amount?: string
  }

  if (!assetSymbol || !amount) {
    return {
      toolCallId: toolCall.id,
      content: `execute_stellar_${actionType} requires assetSymbol and amount.`,
    }
  }

  const symbol = assetSymbol.toUpperCase()
  if (!STELLAR_ASSET_SYMBOLS.has(symbol)) {
    return {
      toolCallId: toolCall.id,
      content: `Stellar markets only support USDC, XLM, and EURC. Got "${assetSymbol}".`,
    }
  }

  const numAmount = Number(amount)
  if (!Number.isFinite(numAmount) || numAmount <= 0) {
    return {
      toolCallId: toolCall.id,
      content: `Amount must be a positive number. Got "${amount}".`,
    }
  }

  // Validate the asset maps to a real Stellar vault before proposing.
  const { getStellarVaultConfig } = await import('@/lib/stellar-soroban-lending')
  const assetId = `${symbol.toLowerCase()}-stellar`
  if (!getStellarVaultConfig(assetId)) {
    return {
      toolCallId: toolCall.id,
      content: `No Stellar market configured for ${symbol}.`,
    }
  }

  const { CHAIN_IDS } = await import('@/config/contracts')
  const stellarChainId = CHAIN_IDS.STELLAR_MAINNET

  const confirmationToken = randomUUID()
  await sql`
    INSERT INTO agent_executed_actions (
      conversation_id, user_address, action_type, asset_symbol,
      amount, chain_id, status, confirmation_token
    ) VALUES (
      ${context.conversationId ?? null}, ${context.userAddress},
      ${actionType}, ${symbol},
      ${numAmount}, ${stellarChainId}, 'pending', ${confirmationToken}
    )
  `

  const timelineWrite = await createTimelineForAction({
    conversationId: context.conversationId,
    userAddress: context.userAddress,
    actionType,
    assetSymbol: symbol,
    amount,
    sourceChainId: stellarChainId,
    destinationChainId: stellarChainId,
    confirmationToken,
    backendType: 'stellar',
  })

  const verb = ACTION_VERB[actionType]
  const displayAmount = numAmount >= 1
    ? `$${numAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
    : `${numAmount} ${symbol}`

  const block: ActionButtonBlock = {
    type: 'action_button',
    actionType,
    label: `${verb} ${displayAmount}`,
    params: {
      assetSymbol: symbol,
      amount: String(amount),
      poolId: `peridot-${symbol.toLowerCase()}-stellar`,
      chainId: stellarChainId,
    },
    confirmationToken,
    estimatedSeconds: 8,
    // Stellar never auto-executes: signing needs the user's Stellar wallet.
    autoExecute: { willFire: false, reason: 'Stellar actions require a manual signature.' },
  }

  const timelineNote = timelineWrite.ok
    ? ''
    : ` (Note: the action ledger couldn't be written — live status queries may return empty. The button still works.)`

  return {
    toolCallId: toolCall.id,
    content:
      `Prepared a Stellar ${actionType.replace('_', ' ')} of ${amount} ${symbol}. `
      + `Nothing has been sent yet — the action button is waiting for the user to confirm and sign with their Stellar wallet. `
      + `This will NOT auto-execute.${timelineNote}`,
    block,
  }
}

// ─── Phase 6.1: swap / rebalance executors ─────────────────────────
// These produce an ActionButtonBlock the user (or Perry, via auto-execute)
// can confirm. The actual router quote / tx-plan build happens server-side
// inside `/api/agents/execute` when the token is redeemed — not here.

async function executeSwap(
  toolCall: ToolCallInput,
  context: ToolContext,
): Promise<ToolResult> {
  const {
    fromAssetSymbol,
    toAssetSymbol,
    amount,
    chainId,
    slippageBps,
  } = toolCall.input as {
    fromAssetSymbol?: string
    toAssetSymbol?: string
    amount?: string
    chainId?: number
    slippageBps?: number
  }

  if (!fromAssetSymbol || !toAssetSymbol || !amount || !chainId) {
    return {
      toolCallId: toolCall.id,
      content: 'execute_swap requires fromAssetSymbol, toAssetSymbol, amount and chainId.',
    }
  }

  // Persist a pending action row; the real router quote is fetched lazily
  // inside /api/agents/execute because the quote's lifetime is <1 minute and
  // we don't want to freeze it at tool-call time. Swap-specific params
  // (target asset, slippage) live in metadata so the execute route can
  // reconstruct the Bitget request.
  const confirmationToken = randomUUID()
  const metadata = {
    targetAsset: toAssetSymbol.toUpperCase(),
    slippageBps: slippageBps ?? 50,
  }
  await sql`
    INSERT INTO agent_executed_actions (
      conversation_id, user_address, action_type, asset_symbol,
      amount, chain_id, status, confirmation_token, metadata
    ) VALUES (
      ${context.conversationId ?? null}, ${context.userAddress},
      'swap', ${fromAssetSymbol.toUpperCase()},
      ${Number(amount)}, ${chainId}, 'pending', ${confirmationToken},
      ${jsonbParam(metadata)}
    )
  `

  await createTimelineForAction({
    conversationId: context.conversationId,
    userAddress: context.userAddress,
    actionType: 'swap',
    assetSymbol: fromAssetSymbol,
    amount,
    sourceChainId: chainId,
    destinationChainId: chainId,
    confirmationToken,
    metadata: { targetAsset: toAssetSymbol.toUpperCase(), slippageBps: slippageBps ?? 50 },
  })

  const block: ActionButtonBlock = {
    type: 'action_button',
    actionType: 'convert',
    label: `Convert ${amount} ${fromAssetSymbol.toUpperCase()} → ${toAssetSymbol.toUpperCase()}`,
    params: {
      assetSymbol: fromAssetSymbol.toUpperCase(),
      amount: String(amount),
      poolId: 'swap',
      chainId,
      targetAsset: toAssetSymbol.toUpperCase(),
      slippageBps: slippageBps ?? 50,
    } as any,
    confirmationToken,
    estimatedSeconds: 10,
  }

  // Auto-execute hint for swap. Amount isn't USD-priced here (it's the
  // from-asset amount). Use numeric amount directly for stablecoins only,
  // otherwise default to manual-tap.
  const { buildAutoExecuteHint: buildSwapHint } = await import('@/lib/agents/auto-execute-hint')
  const swapAmountUsd = STABLECOINS_EXEC.has(fromAssetSymbol.toUpperCase()) && Number.isFinite(Number(amount))
    ? Number(amount)
    : null
  const swapHint = await buildSwapHint({
    userAddress: context.userAddress,
    actionType: 'swap',
    amountUsd: swapAmountUsd,
  })

  return {
    toolCallId: toolCall.id,
    content: `Prepared a conversion of ${amount} ${fromAssetSymbol.toUpperCase()} into ${toAssetSymbol.toUpperCase()}. Nothing has been sent on-chain yet — the block is now waiting for the user to confirm.${swapHint.instruction}`,
    block,
  }
}

async function executeRebalance(
  toolCall: ToolCallInput,
  context: ToolContext,
): Promise<ToolResult> {
  const { chainId, withdrawFrom, depositInto } = toolCall.input as {
    chainId?: number
    withdrawFrom?: Array<{ assetSymbol?: string; amount?: string }>
    depositInto?: Array<{ assetSymbol?: string; amount?: string }>
  }

  if (
    !chainId ||
    !Array.isArray(withdrawFrom) ||
    !Array.isArray(depositInto) ||
    (withdrawFrom.length === 0 && depositInto.length === 0)
  ) {
    return {
      toolCallId: toolCall.id,
      content:
        'execute_rebalance requires chainId plus at least one withdrawFrom or depositInto leg.',
    }
  }

  // Normalize + sanity-check legs
  const norm = (leg: { assetSymbol?: string; amount?: string }) => ({
    assetSymbol: (leg.assetSymbol ?? '').toUpperCase(),
    amount: String(leg.amount ?? ''),
  })
  const legsIn = withdrawFrom.map(norm).filter((l) => l.assetSymbol && Number(l.amount) > 0)
  const legsOut = depositInto.map(norm).filter((l) => l.assetSymbol && Number(l.amount) > 0)

  if (legsIn.length === 0 && legsOut.length === 0) {
    return {
      toolCallId: toolCall.id,
      content: 'Rebalance needs at least one leg with a positive amount.',
    }
  }

  // Use the first deposit leg (or first withdraw leg) as the "display" asset.
  const primary = legsOut[0] ?? legsIn[0]
  const totalUsd = [...legsIn, ...legsOut].reduce((s, l) => s + Number(l.amount), 0)

  const confirmationToken = randomUUID()
  const metadata = {
    withdrawFrom: legsIn,
    depositInto: legsOut,
  }
  await sql`
    INSERT INTO agent_executed_actions (
      conversation_id, user_address, action_type, asset_symbol,
      amount, chain_id, status, confirmation_token, metadata
    ) VALUES (
      ${context.conversationId ?? null}, ${context.userAddress},
      'rebalance', ${primary.assetSymbol},
      ${totalUsd}, ${chainId}, 'pending', ${confirmationToken},
      ${jsonbParam(metadata)}
    )
  `

  await createTimelineForAction({
    conversationId: context.conversationId,
    userAddress: context.userAddress,
    actionType: 'rebalance',
    assetSymbol: primary.assetSymbol,
    amount: String(totalUsd),
    sourceChainId: chainId,
    destinationChainId: chainId,
    confirmationToken,
    metadata: { withdrawFrom: legsIn, depositInto: legsOut },
  })

  const summary = [
    ...legsIn.map((l) => `withdraw ${l.amount} ${l.assetSymbol}`),
    ...legsOut.map((l) => `deposit ${l.amount} ${l.assetSymbol}`),
  ].join(' → ')

  const block: ActionButtonBlock = {
    type: 'action_button',
    actionType: 'adjust_strategy',
    label: `Adjust strategy: ${summary}`,
    params: {
      assetSymbol: primary.assetSymbol,
      amount: String(totalUsd),
      poolId: 'rebalance',
      chainId,
      withdrawFrom: legsIn,
      depositInto: legsOut,
    } as any,
    confirmationToken,
    estimatedSeconds: 15,
  }

  // Rebalance auto-execute eligibility uses the totalUsd sum of the legs.
  // auto-execute-consent.ts rejects rebalance via its NEVER_AUTO_ALLOWED
  // set (since multi-leg + router-quote are too novel for silent firing),
  // so this almost always resolves to "tap required" — good.
  const { buildAutoExecuteHint: buildRebalanceHint } = await import('@/lib/agents/auto-execute-hint')
  const rebalanceHint = await buildRebalanceHint({
    userAddress: context.userAddress,
    actionType: 'rebalance',
    amountUsd: Number.isFinite(totalUsd) ? totalUsd : null,
  })

  return {
    toolCallId: toolCall.id,
    content: `Prepared a rebalance: ${summary}. Nothing sent yet — waiting on the user to confirm in the action block.${rebalanceHint.instruction}`,
    block,
  }
}

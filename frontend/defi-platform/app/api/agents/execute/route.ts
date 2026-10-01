import { NextResponse, NextRequest } from 'next/server'
import { sql } from '@/lib/database'
import { jsonbObject, jsonbParam } from '@/lib/jsonb'
import {
  buildTxPlan,
  buildSwapTx,
  buildRebalanceTx,
  TxBuildError,
} from '@/lib/agents/tx-builder'
import type { TxPlan, SwapRoute } from '@/lib/agents/tx-builder'
import { BiconomyBuildError } from '@/lib/agents/biconomy-builder'
import { validateTokenRow } from '@/lib/agents/token-validator'
import { preflightCheck } from '@/lib/agents/preflight'
import { fetchUserBalance } from '@/lib/agents/balance-fetcher'
import { authenticateAgentRequest } from '@/lib/agents/auth'
import { CHAIN_IDS } from '@/config/contracts'
import { parseUnits, type Address } from 'viem'

/**
 * POST /api/agents/execute
 *
 * Validates a confirmation token, builds transaction parameters,
 * and returns them for the frontend to execute via wallet signature.
 *
 * Body: { confirmationToken: string }
 * Returns: TxPlan (calls[], description, chainId, etc.)
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Auth — E2E | Privy | Stellar-wallet session. Resolves the SAME
    // identity the chat route used to write the action row (EVM when linked,
    // else the Stellar G-address) so the confirmation-token lookup matches.
    const auth = await authenticateAgentRequest(request)
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const walletAddress = auth.userAddress

    // 2. Parse body
    const body = await request.json()
    const { confirmationToken } = body as { confirmationToken?: string }

    if (!confirmationToken) {
      return NextResponse.json(
        { error: 'confirmationToken is required' },
        { status: 400 },
      )
    }

    // 3. Try proposals table first, then fall back to executed_actions.
    //    Both tables carry TTL + replay-protection columns from
    //    migration_agent_actions_ttl.sql (expires_at, consumed_at, idempotency_key).
    //
    //    We DON'T filter by status here — the row is our source of truth for
    //    consumed_at / expires_at; validateTokenRow() decides the right error.
    //    Filtering by `status = 'proposed'` would mask 'already executed' as
    //    'not found' (404 instead of 409).
    const proposals = await sql`
      SELECT * FROM agent_proposals
      WHERE confirmation_token = ${confirmationToken}
        AND LOWER(user_address) = ${walletAddress.toLowerCase()}
      LIMIT 1
    `

    if (proposals.length > 0) {
      const validation = validateTokenRow(
        proposals[0] as unknown as Parameters<typeof validateTokenRow>[0],
      )
      if (!validation.valid) {
        return NextResponse.json(
          { error: validation.message ?? 'Invalid token' },
          { status: validation.status ?? 400 },
        )
      }

      // Atomically claim the proposal to prevent replay. A concurrent request
      // that lost the race will hit the `consumed_at IS NULL` guard and get 0 rows.
      const claim = await sql`
        UPDATE agent_proposals
        SET consumed_at = NOW()
        WHERE id = ${proposals[0].id as string} AND consumed_at IS NULL
        RETURNING id
      `
      if (claim.length === 0) {
        return NextResponse.json(
          { error: 'This action has already been executed.' },
          { status: 409 },
        )
      }

      return await handleProposalExecution(proposals[0], walletAddress)
    }

    // Fall back to single-action execution (legacy). Same reasoning as above:
    // no status filter → validator surfaces the right 409/410/404 distinction.
    const actions = await sql`
      SELECT ea.*, pr.contract_address, pr.metadata AS pool_metadata
      FROM agent_executed_actions ea
      LEFT JOIN agent_pool_registry pr ON ea.pool_id = pr.id
      WHERE ea.confirmation_token = ${confirmationToken}
        AND LOWER(ea.user_address) = ${walletAddress.toLowerCase()}
      LIMIT 1
    `

    const actionValidation = validateTokenRow(
      (actions[0] as unknown as Parameters<typeof validateTokenRow>[0]) ?? null,
    )
    if (!actionValidation.valid) {
      return NextResponse.json(
        { error: actionValidation.message ?? 'Invalid token' },
        { status: actionValidation.status ?? 400 },
      )
    }

    // Atomically claim the action
    const actionClaim = await sql`
      UPDATE agent_executed_actions
      SET consumed_at = NOW()
      WHERE id = ${actions[0].id as string} AND consumed_at IS NULL
      RETURNING id
    `
    if (actionClaim.length === 0) {
      return NextResponse.json(
        { error: 'This action has already been executed.' },
        { status: 409 },
      )
    }

    return await handleSingleAction(actions[0])
  } catch (error) {
    console.error('[agents/execute] Error:', error)
    if (error instanceof TxBuildError || error instanceof BiconomyBuildError) {
      return NextResponse.json({ error: error.message }, { status: 422 })
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}

/**
 * Handle proposal-based execution (multi-position strategy).
 * Detects cross-chain allocations and returns Biconomy compose payload instead.
 */
async function handleProposalExecution(
  proposal: Record<string, unknown>,
  walletAddress: string,
) {
  type Allocation = {
    assetId: string
    protocol: string
    chainId: number
    sourceChainId?: number
    amount: string
    actionType?: string
  }

  let allocations: Allocation[]
  try {
    allocations = (
      typeof proposal.allocations === 'string'
        ? JSON.parse(proposal.allocations as string)
        : proposal.allocations
    ) as Allocation[]
  } catch {
    throw new TxBuildError('Proposal allocations are corrupted — please regenerate the strategy.')
  }
  if (!Array.isArray(allocations)) {
    throw new TxBuildError('Proposal allocations are malformed — please regenerate the strategy.')
  }

  // Check if any allocation is cross-chain
  const hasCrossChain = allocations.some(
    (a) => a.actionType === 'cross-chain_supply' || (a.sourceChainId && a.sourceChainId !== 56),
  )

  if (hasCrossChain) {
    return await handleCrossChainProposal(proposal, allocations, walletAddress)
  }

  // Split by signing stack: EVM legs need server-built tx plans, Stellar legs
  // are echoed back so the client can sign via Freighter / embedded Stellar
  // wallet (mirrors handleSingleAction's Stellar branch).
  const STELLAR_CHAIN_ID = CHAIN_IDS.STELLAR_MAINNET
  const evmAllocs = allocations.filter((a) => a.chainId !== STELLAR_CHAIN_ID)
  const stellarAllocs = allocations.filter((a) => a.chainId === STELLAR_CHAIN_ID)

  const txPlans: TxPlan[] = []
  for (const alloc of evmAllocs) {
    if (!alloc.amount || Number(alloc.amount) <= 0) continue
    const plan = await buildTxPlan(
      alloc.actionType || 'supply',
      alloc.assetId,
      alloc.amount,
      alloc.chainId,
      walletAddress as Address,
    )
    txPlans.push(plan)
  }

  const stellarLegs = stellarAllocs
    .filter((a) => a.amount && Number(a.amount) > 0)
    .map((a) => ({
      actionType: a.actionType || 'deposit',
      // Allocations carry the symbol-shaped assetId (e.g. 'usdc'); the
      // Stellar lending lib expects the chain-suffixed id ('usdc-stellar').
      assetId: a.assetId.endsWith('-stellar') ? a.assetId : `${a.assetId.toLowerCase()}-stellar`,
      assetSymbol: a.assetId.replace(/-stellar$/, '').toUpperCase(),
      amount: String(a.amount),
      chainId: STELLAR_CHAIN_ID,
    }))

  // Mark proposal as approved + cache TX plans
  await sql`
    UPDATE agent_proposals
    SET status = 'approved', tx_plans = ${jsonbParam(txPlans)}
    WHERE id = ${proposal.id as string}
  `

  // Also create individual executed_actions rows for each allocation
  for (const alloc of allocations) {
    if (!alloc.amount || Number(alloc.amount) <= 0) continue
    await sql`
      INSERT INTO agent_executed_actions (
        conversation_id, user_address, action_type, asset_symbol,
        amount, chain_id, status
      ) VALUES (
        ${proposal.conversation_id as string}, ${walletAddress},
        ${alloc.actionType || 'supply'}, ${alloc.assetId},
        ${Number(alloc.amount)}, ${alloc.chainId},
        ${alloc.chainId === STELLAR_CHAIN_ID ? 'pending' : 'confirmed'}
      )
    `
  }

  return NextResponse.json({
    type: 'proposal',
    proposalId: proposal.id,
    txPlans,
    stellarLegs,
    description: `Execute ${txPlans.length + stellarLegs.length} position(s)`,
  })
}

/**
 * Handle cross-chain proposal execution via Biconomy.
 * Returns compose payload for the frontend to send through Biconomy flow.
 */
async function handleCrossChainProposal(
  proposal: Record<string, unknown>,
  allocations: Array<{
    assetId: string
    protocol: string
    chainId: number
    sourceChainId?: number
    amount: string
    actionType?: string
  }>,
  walletAddress: string,
) {
  const { buildCrossChainSupplyPayload } = await import('@/lib/agents/biconomy-builder')

  const crossChainPayloads = []

  for (const alloc of allocations) {
    if (!alloc.amount || Number(alloc.amount) <= 0) continue

    const sourceChainId = alloc.sourceChainId ?? alloc.chainId
    const payload = buildCrossChainSupplyPayload({
      userAddress: walletAddress,
      sourceChainId,
      assetSymbol: alloc.assetId,
      amount: alloc.amount,
    })

    crossChainPayloads.push(payload)

    // Track as executed action
    await sql`
      INSERT INTO agent_executed_actions (
        conversation_id, user_address, action_type, asset_symbol,
        amount, chain_id, status
      ) VALUES (
        ${proposal.conversation_id as string}, ${walletAddress},
        ${'cross-chain_supply'}, ${alloc.assetId},
        ${Number(alloc.amount)}, ${sourceChainId}, 'pending'
      )
    `
  }

  // Mark proposal as approved
  await sql`
    UPDATE agent_proposals
    SET status = 'approved'
    WHERE id = ${proposal.id as string}
  `

  return NextResponse.json({
    type: 'cross-chain',
    proposalId: proposal.id,
    payloads: crossChainPayloads,
    description: `Cross-chain supply via Biconomy (${crossChainPayloads.length} operation(s))`,
  })
}

/**
 * Handle single-action execution (legacy flow).
 */
async function handleSingleAction(action: Record<string, unknown>) {
  const actionType = action.action_type as string
  const assetSymbol = action.asset_symbol as string
  let amount = String(action.amount)
  const chainId = action.chain_id as number

  // ── Stellar (Soroban) actions ───────────────────────────────────
  // There is no server-side tx-plan: the Stellar wallet builds+signs+submits
  // client-side. Echo the action back so the frontend can call the stellar
  // builders. Skip all EVM preflight/balance/tx-build below.
  if (chainId === CHAIN_IDS.STELLAR_MAINNET) {
    await sql`
      UPDATE agent_executed_actions
      SET status = 'confirmed'
      WHERE id = ${action.id as string}
    `
    return NextResponse.json({
      type: 'stellar',
      actionId: action.id,
      actionType,
      assetSymbol,
      assetId: `${assetSymbol.toLowerCase()}-stellar`,
      amount,
      chainId,
    })
  }

  // Resolve assetId from symbol (lowercase, common mappings)
  const assetId = assetSymbol.toLowerCase().replace('$', '')

  // Phase-5 preflight: surface typed errors (POOL_INACTIVE, WRONG_CHAIN, etc.)
  // before we call the tx-builder. The `pool` field is the joined pool registry
  // row from the SELECT query; we pass it through so preflight can validate
  // is_active + chain match.
  const pool =
    action.pool_id != null
      ? {
          is_active: (action as any).is_active as boolean | null | undefined,
          chain_id: (action as any).pool_chain_id as number | null | undefined,
        }
      : undefined

  // Phase-5.1 balance check: fetch the user's on-chain balance and pass it in.
  // Only meaningful for deposit-style actions — the preflight itself skips the
  // check for borrow / cross-chain_supply.
  const userAddress = action.user_address as string
  let userBalanceBaseUnits: bigint | undefined
  let amountBaseUnits: bigint | undefined
  let fetchedDecimals: number | null = null
  try {
    const balance = await fetchUserBalance({
      userAddress,
      assetId,
      chainId,
    })
    if (balance.balance != null && balance.decimals != null) {
      userBalanceBaseUnits = balance.balance
      amountBaseUnits = parseUnits(amount, balance.decimals)
      fetchedDecimals = balance.decimals
    }
  } catch {
    // Balance fetch is best-effort — on failure we fall through without the check
  }

  // ── Defense-in-depth clamp (P9 safety net) ─────────────────────────
  // The tool-call layer already clamps to the wallet balance when the ask is
  // within 2%, but actions that were persisted BEFORE the clamp shipped —
  // or flowed through a path that bypassed the clamp — still arrive here
  // with a slightly-over-balance amount and would 402. Fix it at the last
  // possible moment: if the ask is ≤ 2% over the live balance, silently
  // rewrite the amount to match exactly.
  //
  // This is NOT a cap — it only ever reduces the asked amount. Legitimate
  // INSUFFICIENT_BALANCE errors (ask ≫ balance) still surface the 402.
  if (
    (actionType === 'deposit' || actionType === 'supply' || actionType === 'pay_back' || actionType === 'repay')
    && userBalanceBaseUnits != null
    && amountBaseUnits != null
    && fetchedDecimals != null
    && amountBaseUnits > userBalanceBaseUnits
  ) {
    const diff = amountBaseUnits - userBalanceBaseUnits
    const within2pct = userBalanceBaseUnits > BigInt(0)
      && diff * BigInt(100) <= userBalanceBaseUnits * BigInt(2)
    if (within2pct) {
      // Rewrite amount to the exact available balance. formatUnits gives a
      // clean decimal string with no trailing zeros.
      const { formatUnits } = await import('viem')
      amount = formatUnits(userBalanceBaseUnits, fetchedDecimals)
      amountBaseUnits = userBalanceBaseUnits
      // eslint-disable-next-line no-console
      console.info('[execute] clamped deposit amount to live balance', {
        actionType, assetSymbol, chainId,
        newAmount: amount,
        wasOverByWei: diff.toString(),
      })
    }
  }

  const pre = preflightCheck({
    actionType,
    amount,
    assetSymbol,
    chainId,
    pool,
    userBalanceBaseUnits,
    amountBaseUnits,
  })
  if (!pre.ok) {
    return NextResponse.json(
      { error: pre.message ?? 'Request failed preflight', code: pre.code },
      { status: pre.status ?? 400 },
    )
  }

  // ── Dispatch to the right builder ───────────────────────────
  // Swap + rebalance need metadata carried from the tool-call step
  // (router slippage, leg arrays). Everything else uses the plain builder.
  let txPlan: TxPlan
  try {
    if (actionType === 'swap' || actionType === 'convert') {
      txPlan = await buildSwapTxFromAction(action, assetId, amount, chainId)
    } else if (actionType === 'rebalance' || actionType === 'adjust_strategy') {
      txPlan = await buildRebalanceTxFromAction(action, chainId)
    } else {
      txPlan = await buildTxPlan(actionType, assetId, amount, chainId, userAddress as Address)
    }
  } catch (err) {
    if (err instanceof TxBuildError) {
      return NextResponse.json({ error: err.message }, { status: 422 })
    }
    throw err
  }

  // Mark as confirmed
  await sql`
    UPDATE agent_executed_actions
    SET status = 'confirmed'
    WHERE id = ${action.id as string}
  `

  return NextResponse.json({
    type: 'single',
    actionId: action.id,
    ...txPlan,
  })
}

/**
 * Build a swap TxPlan by fetching a fresh Bitget quote at execute-time.
 * Falls back to TxBuildError if the router rejects the request; the caller
 * surfaces that as a 422.
 */
async function buildSwapTxFromAction(
  action: Record<string, unknown>,
  fromAssetId: string,
  amount: string,
  chainId: number,
): Promise<TxPlan> {
  const meta = jsonbObject(action.metadata)
  const targetAsset = String(meta.targetAsset ?? '').toLowerCase()
  if (!targetAsset) {
    throw new TxBuildError('Swap action is missing a target asset.')
  }

  // Build a minimal SwapRoute from the existing Bitget adapter. We call the
  // internal /api/swap/quote route directly so we reuse whatever server-side
  // Bitget plumbing is already in place.
  const { getAssetContractAddresses } = await import('@/data/market-data')
  const fromContracts = getAssetContractAddresses(fromAssetId, chainId)
  const toContracts = getAssetContractAddresses(targetAsset, chainId)
  if (!fromContracts || !toContracts) {
    throw new TxBuildError(
      `No contract addresses for swap ${fromAssetId} → ${targetAsset} on chain ${chainId}`,
    )
  }

  // NOTE: The actual quote fetch is deliberately minimal here — full Bitget
  // integration requires the /api/swap/quote POST + the adapter's response
  // shape. For Phase 6.1 we surface a clear error if the route isn't wired,
  // so the UI gets a typed 422 rather than a silent failure.
  const quoteBase =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ??
    'http://localhost:3000'

  const quoteCtrl = new AbortController()
  const quoteTimeout = setTimeout(() => quoteCtrl.abort(), 30_000)
  const res = await fetch(`${quoteBase}/api/swap/quote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fromChain: String(chainId),
      toChain: String(chainId),
      fromContract: fromContracts.underlyingAddress,
      toContract: toContracts.underlyingAddress,
      fromAmount: amount, // adapter will parseUnits
      fromAddress: action.user_address,
      toAddress: action.user_address,
      slippage: String(((meta.slippageBps as number) ?? 50) / 10_000),
    }),
    signal: quoteCtrl.signal,
  })
    .catch(() => null)
    .finally(() => clearTimeout(quoteTimeout))

  if (!res || !res.ok) {
    throw new TxBuildError(
      'Unable to fetch a swap quote right now. Try again in a moment.',
    )
  }
  const data = (await res.json().catch(() => null)) as any
  const quote = data?.data ?? data
  if (!quote?.to || !quote?.data) {
    throw new TxBuildError('Swap router returned an incomplete quote.')
  }

  const route: SwapRoute = {
    to: quote.to as `0x${string}`,
    data: quote.data as `0x${string}`,
    value: quote.value ? BigInt(quote.value) : undefined,
    approvalSpender: quote.approvalSpender ?? quote.allowanceTarget,
  }

  return buildSwapTx(fromAssetId, targetAsset.toUpperCase(), amount, chainId, route)
}

async function buildRebalanceTxFromAction(
  action: Record<string, unknown>,
  chainId: number,
): Promise<TxPlan> {
  const meta = jsonbObject(action.metadata)
  const withdrawFrom = ((meta.withdrawFrom ?? []) as Array<{
    assetSymbol?: string
    amount?: string
  }>)
    .map((l) => ({
      assetId: (l.assetSymbol ?? '').toLowerCase(),
      amount: String(l.amount ?? ''),
    }))
    .filter((l) => l.assetId && Number(l.amount) > 0)
  const depositInto = ((meta.depositInto ?? []) as Array<{
    assetSymbol?: string
    amount?: string
  }>)
    .map((l) => ({
      assetId: (l.assetSymbol ?? '').toLowerCase(),
      amount: String(l.amount ?? ''),
    }))
    .filter((l) => l.assetId && Number(l.amount) > 0)

  if (withdrawFrom.length === 0 && depositInto.length === 0) {
    throw new TxBuildError('Rebalance plan has no legs to execute.')
  }
  return await buildRebalanceTx(withdrawFrom, depositInto, chainId)
}

/**
 * PATCH /api/agents/execute
 *
 * Report transaction hash after on-chain execution.
 * Body: { actionId?: string, proposalId?: string, txHash: string, status: 'success' | 'failed' }
 */
export async function PATCH(request: NextRequest) {
  try {
    // Accept Privy bearer OR a Stellar-wallet session (Stufe 3) so Freighter-only
    // users can report their tx result back.
    const auth = await authenticateAgentRequest(request)
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      actionId,
      proposalId,
      txHash,
      status,
      chainId: txChainId,
      autoExecuted,
      errorMessage,
    } = body as {
      actionId?: string
      proposalId?: string
      txHash?: string
      status?: 'success' | 'failed'
      chainId?: number
      autoExecuted?: boolean
      errorMessage?: string
    }

    let walletAddress: string | undefined
    let loggedAction: {
      actionType: string
      assetSymbol: string
      amount: number
      chainId: number
    } | null = null

    if (proposalId) {
      const newStatus = status === 'success' ? 'completed' : 'failed'
      const rows = await sql`
        UPDATE agent_proposals
        SET status = ${newStatus}, executed_at = NOW()
        WHERE id = ${proposalId}
        RETURNING user_address
      `
      walletAddress = rows[0]?.user_address as string | undefined
    }

    let confirmationTokenForTimeline: string | null = null
    let conversationIdForClosure: string | null = null
    if (actionId && txHash) {
      const newStatus = status === 'success' ? 'confirmed' : 'failed'
      const rows = await sql`
        UPDATE agent_executed_actions
        SET tx_hash = ${txHash}, status = ${newStatus}
        WHERE id = ${actionId}
        RETURNING user_address, chain_id, action_type, asset_symbol, amount,
                  confirmation_token, conversation_id
      `
      if (rows[0]) {
        walletAddress = rows[0].user_address as string
        confirmationTokenForTimeline = (rows[0].confirmation_token as string) ?? null
        conversationIdForClosure = (rows[0].conversation_id as string) ?? null
        loggedAction = {
          actionType: rows[0].action_type as string,
          assetSymbol: rows[0].asset_symbol as string,
          amount: Number(rows[0].amount),
          chainId: Number(rows[0].chain_id),
        }
      }
    }

    // ── Agent Action Timeline: close the lifecycle (P7-2) ──────────
    // Mirror the same-chain completion into `agent_actions` so Perry's
    // status tools + the SSE stream see the succeeded/failed transition.
    // Cross-chain flows PATCH the timeline directly (via the client-side
    // AgentCrossChainListener), so we only touch it here when the legacy
    // proposal/action path is in use. Best-effort — never block the PATCH.
    if ((confirmationTokenForTimeline || proposalId) && (status === 'success' || status === 'failed')) {
      try {
        const { getActionByToken, transitionAction } = await import('@/lib/agents/action-timeline')
        let timelineAction = null
        if (confirmationTokenForTimeline) {
          timelineAction = await getActionByToken(confirmationTokenForTimeline)
        }
        if (timelineAction) {
          await transitionAction({
            actionId: timelineAction.id,
            to: status === 'success' ? 'succeeded' : 'failed',
            primaryHash: typeof txHash === 'string' ? txHash : undefined,
            errorMessage: typeof errorMessage === 'string' ? errorMessage : undefined,
            eventType: 'status_change',
            eventPayload: { source: 'patch_execute', autoExecuted: autoExecuted === true },
          })
        }
      } catch (err) {
        const { executeRouteLog } = await import('@/lib/agents/logger')
        executeRouteLog.warn('PATCH timeline transition skipped', {
          actionId, proposalId,
          error: err instanceof Error ? err.message.slice(0, 300) : String(err),
        })
      }
    }

    // Phase 7: audit log — best-effort, don't fail the PATCH if insert fails
    if (walletAddress && loggedAction && (status === 'success' || status === 'failed')) {
      try {
        await sql`
          INSERT INTO agent_action_log (
            user_address, action_type, asset_symbol, amount, chain_id,
            tx_hash, status, auto_executed, source_id, source_type, error_message
          ) VALUES (
            ${walletAddress},
            ${loggedAction.actionType},
            ${loggedAction.assetSymbol},
            ${loggedAction.amount},
            ${loggedAction.chainId},
            ${txHash ?? null},
            ${status === 'success' ? 'success' : 'failed'},
            ${autoExecuted === true},
            ${actionId ?? proposalId ?? null},
            ${actionId ? 'single_action' : proposalId ? 'proposal' : null},
            ${errorMessage ?? null}
          )
        `
      } catch {
        // Table may not exist yet on older deployments; do not block the PATCH.
      }
    }

    // Auto-verify for leaderboard on success (non-blocking). Stellar actions
    // skip this EVM pre-verify — the frontend calls /api/leaderboard/verify-stellar
    // (postStellarVerify) with the G-address + Soroban tx proof instead.
    if (
      status === 'success' &&
      txHash &&
      walletAddress &&
      txChainId !== CHAIN_IDS.STELLAR_MAINNET
    ) {
      triggerLeaderboardVerification(txHash, walletAddress, txChainId).catch(() => {
        // Non-critical
      })
    }

    // ── Persist success closure as a real assistant message ─────────
    // Previously the closure was only an ephemeral window event rendered
    // by ChatMessageList — vanished on reload, leaving Perry's pre-action
    // text as the last persisted line. Writing it to agent_messages here
    // gives the conversation a proper terminator that survives reloads.
    // Best-effort: a failure here must NEVER break the PATCH.
    if (status === 'success' && loggedAction && conversationIdForClosure) {
      try {
        const { persistClosureMessage } = await import('@/lib/agents/closure-message')
        await persistClosureMessage({
          conversationId: conversationIdForClosure,
          actionType: loggedAction.actionType,
          assetSymbol: loggedAction.assetSymbol,
          amount: loggedAction.amount,
        })
      } catch (err) {
        const { closureLog } = await import('@/lib/agents/logger')
        closureLog.warn('PATCH execute closure skipped', {
          conversationId: conversationIdForClosure,
          actionId,
          error: err instanceof Error ? err.message.slice(0, 300) : String(err),
        })
      }
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[agents/execute PATCH] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}

// ── Leaderboard auto-verification ────────────────────────────────────

/**
 * Fire-and-forget leaderboard verification for agent-executed transactions.
 * Calls pre-verify with isAgent flag so the system knows it came from Perry.
 */
async function triggerLeaderboardVerification(
  txHash: string,
  walletAddress: string,
  chainId?: number,
): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
    || 'http://localhost:3000'

  await fetch(`${baseUrl}/api/leaderboard/pre-verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      txHash,
      walletAddress,
      chainId: chainId ?? 56,
      isAgent: true,
    }),
  })
}

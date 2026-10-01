/**
 * Extended tool implementations for Phase 3.3 + 4.4-4.6 + 4.3 + 5.4.
 * Separated from tool-executor.ts to keep file size manageable.
 */

import { sql } from '@/lib/database'
import { jsonbParam } from '@/lib/jsonb'
import type { ToolResult, ChartBlock, PoolTableBlock, PoolInfo, ActionButtonBlock, ContentBlock, RebalanceBlock, RebalanceEntry, AlertBlock, QuickReplyBlock } from '@/types/agents'
import { getAssetById, getMarketsForChain } from '@/data/market-data'

interface ToolCallInput {
  id: string
  name: string
  input: Record<string, unknown>
}

/** Stablecoins pegged 1:1 to USD — we can safely display their token amount as USD. */
const STABLECOINS = new Set(['USDC', 'USDT', 'DAI', 'AUSD', 'BUSD', 'USDD'])
function isStablecoin(symbol: string): boolean {
  return STABLECOINS.has(symbol.toUpperCase())
}

interface ToolContext {
  userAddress: string
  chainId?: number
  conversationId?: string
}

// ── 3.3 Cross-Session Knowledge ──────────────────────────────────────

export async function executeRememberFact(
  toolCall: ToolCallInput,
  context: ToolContext,
): Promise<ToolResult> {
  if (!context.userAddress) {
    return { toolCallId: toolCall.id, content: 'Error: No user address available.' }
  }

  const { key, value } = toolCall.input as { key: string; value: string }

  if (!key || !value) {
    return { toolCallId: toolCall.id, content: 'Error: Both key and value are required.' }
  }

  await sql`
    INSERT INTO agent_knowledge (user_address, key, value, source)
    VALUES (
      ${context.userAddress},
      ${key.toLowerCase().trim()},
      ${jsonbParam(value)},
      ${context.conversationId ?? null}
    )
    ON CONFLICT (user_address, key) DO UPDATE SET
      value = ${jsonbParam(value)},
      source = ${context.conversationId ?? null}
  `

  return {
    toolCallId: toolCall.id,
    content: `Remembered: "${key}" = "${value}". I'll use this in future conversations.`,
  }
}

export async function executeRecallFacts(
  toolCall: ToolCallInput,
  context: ToolContext,
): Promise<ToolResult> {
  if (!context.userAddress) {
    return { toolCallId: toolCall.id, content: 'Error: No user address available.' }
  }

  const { keyFilter } = toolCall.input as { keyFilter?: string }

  let rows
  if (keyFilter) {
    rows = await sql`
      SELECT key, value, created_at FROM agent_knowledge
      WHERE LOWER(user_address) = ${context.userAddress.toLowerCase()}
        AND key LIKE ${keyFilter.toLowerCase() + '%'}
      ORDER BY created_at DESC
      LIMIT 20
    `
  } else {
    rows = await sql`
      SELECT key, value, created_at FROM agent_knowledge
      WHERE LOWER(user_address) = ${context.userAddress.toLowerCase()}
      ORDER BY created_at DESC
      LIMIT 20
    `
  }

  if (rows.length === 0) {
    return {
      toolCallId: toolCall.id,
      content: keyFilter
        ? `No stored facts found matching "${keyFilter}".`
        : 'No stored facts found for this user.',
    }
  }

  const facts = rows.map((r) => {
    const val = typeof r.value === 'string' ? JSON.parse(r.value) : r.value
    return `- ${r.key}: ${typeof val === 'string' ? val : JSON.stringify(val)}`
  })

  return {
    toolCallId: toolCall.id,
    content: `User facts (${rows.length}):\n${facts.join('\n')}`,
  }
}

/**
 * Load top facts for system prompt injection.
 */
export async function loadUserFacts(userAddress: string): Promise<string | null> {
  try {
    const rows = await sql`
      SELECT key, value FROM agent_knowledge
      WHERE LOWER(user_address) = ${userAddress.toLowerCase()}
      ORDER BY created_at DESC
      LIMIT 10
    `

    if (rows.length === 0) return null

    const facts = rows.map((r) => {
      const val = typeof r.value === 'string' ? JSON.parse(r.value) : r.value
      return `- ${r.key}: ${typeof val === 'string' ? val : JSON.stringify(val)}`
    })

    return facts.join('\n')
  } catch {
    return null
  }
}

// ── 4.4 Rebalancing ──────────────────────────────────────────────────

export async function executeAnalyzeRebalance(
  toolCall: ToolCallInput,
  context: ToolContext,
): Promise<ToolResult> {
  const { targetAllocations, driftThreshold = 5 } = toolCall.input as {
    targetAllocations?: Array<{ assetSymbol: string; targetPercentage: number; chainId?: number }>
    driftThreshold?: number
  }

  // Get current portfolio
  let portfolio
  try {
    const { readMultiChainPortfolio } = await import('@/lib/agents/portfolio-reader')
    const chainIds = context.chainId ? [context.chainId] : [56, 97]
    portfolio = await readMultiChainPortfolio(context.userAddress, chainIds)
  } catch {
    return { toolCallId: toolCall.id, content: 'Error: Could not read portfolio data.' }
  }

  if (portfolio.positions.length === 0) {
    return { toolCallId: toolCall.id, content: 'No active positions found to rebalance.' }
  }

  // If no target provided, try to load last approved proposal
  let targets = targetAllocations
  if (!targets || targets.length === 0) {
    const proposals = await sql`
      SELECT allocations FROM agent_proposals
      WHERE LOWER(user_address) = ${context.userAddress.toLowerCase()}
        AND status IN ('approved', 'completed')
      ORDER BY created_at DESC LIMIT 1
    `
    if (proposals.length > 0) {
      let allocs: any[] | null = null
      try {
        allocs = typeof proposals[0].allocations === 'string'
          ? JSON.parse(proposals[0].allocations)
          : proposals[0].allocations
      } catch {
        allocs = null
      }
      if (Array.isArray(allocs)) {
        targets = allocs.map((a: any) => ({
          assetSymbol: a.asset || a.assetSymbol,
          targetPercentage: a.percentage,
          chainId: a.chainId,
        }))
      }
    }
  }

  if (!targets || targets.length === 0) {
    return {
      toolCallId: toolCall.id,
      content: 'No target allocations provided and no previous strategy found. Please specify target allocations or create a strategy first.',
    }
  }

  const totalValue = portfolio.totalSuppliedUsd
  if (totalValue === 0) {
    return { toolCallId: toolCall.id, content: 'Portfolio has zero value. Nothing to rebalance.' }
  }

  // Calculate drift
  const analysis: Array<{
    asset: string
    currentPct: number
    targetPct: number
    driftPct: number
    action: string
    amountUsd: number
  }> = []

  for (const target of targets) {
    const position = portfolio.positions.find(
      (p) => p.assetSymbol.toUpperCase() === target.assetSymbol.toUpperCase(),
    )
    const currentPct = position ? (position.suppliedUsd / totalValue) * 100 : 0
    const drift = currentPct - target.targetPercentage

    if (Math.abs(drift) >= driftThreshold) {
      analysis.push({
        asset: target.assetSymbol,
        currentPct: Math.round(currentPct * 10) / 10,
        targetPct: target.targetPercentage,
        driftPct: Math.round(drift * 10) / 10,
        action: drift > 0 ? 'withdraw' : 'supply',
        amountUsd: Math.round(Math.abs(drift / 100) * totalValue * 100) / 100,
      })
    }
  }

  if (analysis.length === 0) {
    return {
      toolCallId: toolCall.id,
      content: `Portfolio is well-balanced. All positions are within ${driftThreshold}% of targets. No rebalancing needed.`,
    }
  }

  const lines = analysis.map((a) =>
    `- ${a.asset}: ${a.currentPct}% → ${a.targetPct}% (drift: ${a.driftPct > 0 ? '+' : ''}${a.driftPct}%) → ${a.action} ~$${a.amountUsd.toFixed(2)}`,
  )

  const rebalanceBlock: RebalanceBlock = {
    type: 'rebalance',
    entries: analysis.map((a) => ({
      asset: a.asset,
      currentPct: a.currentPct,
      targetPct: a.targetPct,
      driftPct: a.driftPct,
      action: a.action as 'withdraw' | 'supply',
      amountUsd: a.amountUsd,
    })),
    totalValueUsd: totalValue,
    driftThreshold,
  }

  // Maximum drift across positions drives the headline alert severity.
  const maxDrift = analysis.reduce((m, a) => Math.max(m, Math.abs(a.driftPct)), 0)
  const alert: AlertBlock = {
    type: 'alert',
    severity: maxDrift >= 15 ? 'warn' : 'info',
    title: `Your portfolio drifted from target`,
    body: `${analysis.length} ${analysis.length === 1 ? 'position is' : 'positions are'} off by more than ${driftThreshold}%. The plan below brings you back in line.`,
  }

  return {
    toolCallId: toolCall.id,
    content: `Rebalance analysis (threshold: ${driftThreshold}%):\nPortfolio value: $${totalValue.toFixed(2)}\n\n${lines.join('\n')}\n\n${analysis.length} position(s) need rebalancing.`,
    blocks: [alert, rebalanceBlock],
  }
}

// ── 4.5 Risk Monitoring ──────────────────────────────────────────────

export async function executeCheckLiquidationRisk(
  toolCall: ToolCallInput,
  context: ToolContext,
): Promise<ToolResult> {
  let portfolio
  try {
    const { readMultiChainPortfolio } = await import('@/lib/agents/portfolio-reader')
    const chainIds = context.chainId ? [context.chainId] : [56, 97]
    portfolio = await readMultiChainPortfolio(context.userAddress, chainIds)
  } catch {
    return { toolCallId: toolCall.id, content: 'Error: Could not read portfolio data.' }
  }

  if (portfolio.totalBorrowedUsd === 0) {
    return {
      toolCallId: toolCall.id,
      content: 'No active borrow positions. No liquidation risk.',
    }
  }

  // Check each asset's LTV against liquidation threshold
  const risks: Array<{
    asset: string
    suppliedUsd: number
    borrowedUsd: number
    currentLtv: number
    maxLtv: number
    liquidationThreshold: number
    riskLevel: string
  }> = []

  for (const pos of portfolio.positions) {
    if (pos.borrowedUsd <= 0) continue

    // Get asset metadata for thresholds
    const assetData = getAssetById(pos.assetSymbol.toLowerCase())
    const maxLtv = assetData?.maxLTV ?? 80
    const liqThreshold = assetData?.liquidationThreshold ?? 85

    const currentLtv = pos.suppliedUsd > 0
      ? (pos.borrowedUsd / pos.suppliedUsd) * 100
      : 100

    const ratio = currentLtv / liqThreshold
    let riskLevel = 'safe'
    if (ratio >= 0.9) riskLevel = 'critical'
    else if (ratio >= 0.75) riskLevel = 'warning'
    else if (ratio >= 0.5) riskLevel = 'moderate'

    risks.push({
      asset: pos.assetSymbol,
      suppliedUsd: pos.suppliedUsd,
      borrowedUsd: pos.borrowedUsd,
      currentLtv: Math.round(currentLtv * 10) / 10,
      maxLtv,
      liquidationThreshold: liqThreshold,
      riskLevel,
    })
  }

  if (risks.length === 0) {
    return {
      toolCallId: toolCall.id,
      content: 'No borrow positions with supply collateral found.',
    }
  }

  const critical = risks.filter((r) => r.riskLevel === 'critical')
  const warning = risks.filter((r) => r.riskLevel === 'warning')

  const lines = risks.map((r) => {
    const icon = r.riskLevel === 'critical' ? '🔴' : r.riskLevel === 'warning' ? '🟡' : r.riskLevel === 'moderate' ? '🟠' : '🟢'
    return `- ${icon} ${r.asset}: LTV ${r.currentLtv}% (max ${r.maxLtv}%, liquidation at ${r.liquidationThreshold}%) — ${r.riskLevel.toUpperCase()}`
  })

  let summary = `Liquidation risk check:\nTotal borrowed: $${portfolio.totalBorrowedUsd.toFixed(2)}\n\n${lines.join('\n')}`

  if (critical.length > 0) {
    summary += `\n\n⚠️ CRITICAL: ${critical.length} position(s) near liquidation! Consider repaying debt or adding collateral immediately.`
  } else if (warning.length > 0) {
    summary += `\n\n⚠️ WARNING: ${warning.length} position(s) approaching liquidation threshold. Monitor closely.`
  }

  // ── Visual blocks ────────────────────────────────────────────────
  // Headline alert — severity tracks the worst position. Worst-case
  // body so the user sees the actual at-risk asset, not generic copy.
  const blocks: ContentBlock[] = []
  const moderate = risks.filter((r) => r.riskLevel === 'moderate')

  if (critical.length > 0) {
    const worst = critical[0]
    const headroomDrop = Math.max(0, worst.liquidationThreshold - worst.currentLtv)
    blocks.push({
      type: 'alert',
      severity: 'danger',
      title: `Your ${worst.asset} loan is close to being closed out`,
      body: `Backing has thinned to ${headroomDrop.toFixed(0)}% above the cut-off. Pay back some debt or add backing now to keep the position safe.`,
    })
    blocks.push({
      type: 'quick_reply',
      replies: [
        { label: `Pay back part of my ${worst.asset} loan`, prompt: `Help me pay back part of my ${worst.asset} loan to reduce risk.` },
        { label: 'Add more backing', prompt: `I want to add more backing to make my loans safer. What do you suggest?` },
        { label: 'What if my collateral drops 10%?', prompt: `Run a stress test — what happens to my loans if my collateral drops 10%?` },
      ],
    } satisfies QuickReplyBlock)
  } else if (warning.length > 0) {
    const worst = warning[0]
    blocks.push({
      type: 'alert',
      severity: 'warn',
      title: `Heads-up on your ${worst.asset} loan`,
      body: `It's not at risk yet, but worth keeping an eye on. A small payback gives you breathing room.`,
    })
    blocks.push({
      type: 'quick_reply',
      replies: [
        { label: `Pay back a bit of my ${worst.asset}`, prompt: `Help me pay back a small part of my ${worst.asset} loan.` },
        { label: 'Show all my loans', prompt: `Show me all my current loans with their risk levels.` },
      ],
    } satisfies QuickReplyBlock)
  } else if (moderate.length > 0) {
    blocks.push({
      type: 'alert',
      severity: 'info',
      title: 'Loans look healthy',
      body: 'You have some borrowing, but everything is well within safe limits.',
    })
  } else {
    blocks.push({
      type: 'alert',
      severity: 'success',
      title: 'No liquidation risk',
      body: 'All your loans are well-backed.',
    })
  }

  return { toolCallId: toolCall.id, content: summary, blocks }
}

export async function executeGetMarketConditions(
  toolCall: ToolCallInput,
): Promise<ToolResult> {
  const { assetSymbol, chainId = 56, days = 7 } = toolCall.input as {
    assetSymbol: string
    chainId?: number
    days?: number
  }

  const limitDays = Math.min(days, 30)

  // Try to get APY time series data
  try {
    const rows = await sql`
      SELECT recorded_at, supply_apy, borrow_apy
      FROM apy_time_series
      WHERE LOWER(asset_id) = ${assetSymbol.toLowerCase()}
        AND chain_id = ${chainId}
        AND recorded_at >= NOW() - ${limitDays + ' days'}::interval
      ORDER BY recorded_at ASC
    `

    if (rows.length === 0) {
      // Fallback: return current data from static markets
      const markets = getMarketsForChain(chainId)
      const market = markets.find((m) => m.symbol.toUpperCase() === assetSymbol.toUpperCase())

      if (!market) {
        return {
          toolCallId: toolCall.id,
          content: `No market data found for ${assetSymbol} on chain ${chainId}.`,
        }
      }

      return {
        toolCallId: toolCall.id,
        content: `Current conditions for ${assetSymbol} (chain ${chainId}):\n- Supply APY: ${market.supplyApy}%\n- Borrow APY: ${market.borrowApy}%\n- Utilization: ${market.utilizationRate ?? 'N/A'}%\n\nNote: Historical trend data is not available.`,
      }
    }

    // Build chart data
    const chartData = rows.map((r) => ({
      date: new Date(r.recorded_at as string).toLocaleDateString(),
      supplyApy: Number(r.supply_apy) || 0,
      borrowApy: Number(r.borrow_apy) || 0,
    }))

    const latestSupply = chartData[chartData.length - 1]?.supplyApy ?? 0
    const earliestSupply = chartData[0]?.supplyApy ?? 0
    const trend = latestSupply - earliestSupply

    const chart: ChartBlock = {
      type: 'chart',
      chartType: 'line',
      title: `${assetSymbol} APY Trend (${limitDays}d)`,
      data: chartData,
      xKey: 'date',
      yKeys: ['supplyApy', 'borrowApy'],
      colors: ['#22c55e', '#ef4444'],
    }

    return {
      toolCallId: toolCall.id,
      content: `${assetSymbol} market conditions (${limitDays}d, chain ${chainId}):\n- Current Supply APY: ${latestSupply.toFixed(2)}%\n- Trend: ${trend >= 0 ? '+' : ''}${trend.toFixed(2)}% over ${limitDays} days\n- Data points: ${rows.length}`,
      block: chart,
    }
  } catch {
    return {
      toolCallId: toolCall.id,
      content: `Error fetching market conditions for ${assetSymbol}. The time series data may not be available.`,
    }
  }
}

// ── 4.6 Utility Tools ────────────────────────────────────────────────

export async function executeGetTransactionHistory(
  toolCall: ToolCallInput,
  context: ToolContext,
): Promise<ToolResult> {
  const { limit = 10, actionType } = toolCall.input as {
    limit?: number
    actionType?: string
  }

  const maxLimit = Math.min(limit, 50)

  try {
    let rows
    if (actionType) {
      rows = await sql`
        SELECT tx_hash, chain_id, action_type, token_symbol, amount, usd_value,
               points_awarded, verified_at
        FROM verified_transactions
        WHERE LOWER(wallet_address) = ${context.userAddress.toLowerCase()}
          AND is_valid = true
          AND action_type = ${actionType}
        ORDER BY verified_at DESC
        LIMIT ${maxLimit}
      `
    } else {
      rows = await sql`
        SELECT tx_hash, chain_id, action_type, token_symbol, amount, usd_value,
               points_awarded, verified_at
        FROM verified_transactions
        WHERE LOWER(wallet_address) = ${context.userAddress.toLowerCase()}
          AND is_valid = true
        ORDER BY verified_at DESC
        LIMIT ${maxLimit}
      `
    }

    if (rows.length === 0) {
      return {
        toolCallId: toolCall.id,
        content: actionType
          ? `No verified ${actionType} transactions found.`
          : 'No verified transactions found for this user.',
      }
    }

    const txLines = rows.map((r) => {
      const date = r.verified_at ? new Date(r.verified_at as string).toLocaleDateString() : 'N/A'
      const usd = r.usd_value ? `$${Number(r.usd_value).toFixed(2)}` : 'N/A'
      return `- ${date}: ${r.action_type} ${r.amount ?? ''} ${r.token_symbol ?? ''} (${usd}) on chain ${r.chain_id} [${(r.tx_hash as string).slice(0, 10)}...]`
    })

    return {
      toolCallId: toolCall.id,
      content: `Transaction history (${rows.length} recent):\n${txLines.join('\n')}`,
    }
  } catch {
    return {
      toolCallId: toolCall.id,
      content: 'Error fetching transaction history.',
    }
  }
}

export async function executeComparePools(
  toolCall: ToolCallInput,
): Promise<ToolResult> {
  const { poolA, poolB } = toolCall.input as { poolA: string; poolB: string }

  function parsePoolId(id: string) {
    const parts = id.split(':')
    return {
      protocol: parts[0]?.toLowerCase(),
      asset: parts[1]?.toUpperCase(),
      chainId: parts[2] ? parseInt(parts[2]) : undefined,
    }
  }

  const a = parsePoolId(poolA)
  const b = parsePoolId(poolB)

  // Query both pools
  let rowsA, rowsB

  if (a.chainId) {
    rowsA = await sql`
      SELECT * FROM agent_pool_registry
      WHERE is_active = true AND LOWER(protocol) = ${a.protocol ?? ''}
        AND UPPER(asset_symbol) = ${a.asset ?? ''} AND chain_id = ${a.chainId}
      LIMIT 1
    `
  } else {
    rowsA = await sql`
      SELECT * FROM agent_pool_registry
      WHERE is_active = true AND LOWER(protocol) = ${a.protocol ?? ''}
        AND UPPER(asset_symbol) = ${a.asset ?? ''}
      LIMIT 1
    `
  }

  if (b.chainId) {
    rowsB = await sql`
      SELECT * FROM agent_pool_registry
      WHERE is_active = true AND LOWER(protocol) = ${b.protocol ?? ''}
        AND UPPER(asset_symbol) = ${b.asset ?? ''} AND chain_id = ${b.chainId}
      LIMIT 1
    `
  } else {
    rowsB = await sql`
      SELECT * FROM agent_pool_registry
      WHERE is_active = true AND LOWER(protocol) = ${b.protocol ?? ''}
        AND UPPER(asset_symbol) = ${b.asset ?? ''}
      LIMIT 1
    `
  }

  if (rowsA.length === 0 && rowsB.length === 0) {
    return { toolCallId: toolCall.id, content: `Neither pool found: "${poolA}" and "${poolB}".` }
  }
  if (rowsA.length === 0) {
    return { toolCallId: toolCall.id, content: `Pool not found: "${poolA}".` }
  }
  if (rowsB.length === 0) {
    return { toolCallId: toolCall.id, content: `Pool not found: "${poolB}".` }
  }

  function formatPool(r: Record<string, unknown>) {
    const meta = (r.metadata as Record<string, unknown>) ?? {}
    return {
      protocol: r.protocol as string,
      asset: r.asset_symbol as string,
      chainId: r.chain_id as number,
      riskTier: r.risk_tier as string,
      isPeridot: r.is_peridot as boolean,
      apy: (meta.liveApy as number) ?? 0,
    }
  }

  const pA = formatPool(rowsA[0])
  const pB = formatPool(rowsB[0])

  const comparison = [
    `| Metric | ${pA.protocol} ${pA.asset} | ${pB.protocol} ${pB.asset} |`,
    `|--------|---|---|`,
    `| Chain | ${pA.chainId} | ${pB.chainId} |`,
    `| APY | ${pA.apy.toFixed(2)}% | ${pB.apy.toFixed(2)}% |`,
    `| Risk | ${pA.riskTier} | ${pB.riskTier} |`,
    `| Peridot | ${pA.isPeridot ? 'Yes' : 'No'} | ${pB.isPeridot ? 'Yes' : 'No'} |`,
  ]

  const winner = pA.apy > pB.apy ? pA : pB
  const summary = `${winner.protocol} ${winner.asset} has the higher APY at ${winner.apy.toFixed(2)}%.`

  return {
    toolCallId: toolCall.id,
    content: `Pool comparison:\n\n${comparison.join('\n')}\n\n${summary}`,
  }
}

export async function executeCalculateEarnings(
  toolCall: ToolCallInput,
): Promise<ToolResult> {
  const { capitalUsd, apy, days = 30, compounding = true } = toolCall.input as {
    capitalUsd: number
    apy: number
    days?: number
    compounding?: boolean
  }

  if (capitalUsd <= 0 || apy < 0) {
    return { toolCallId: toolCall.id, content: 'Error: Capital must be positive and APY must be non-negative.' }
  }

  const limitDays = Math.min(days, 365)
  const dailyRate = apy / 100 / 365

  let finalValue: number
  if (compounding) {
    finalValue = capitalUsd * Math.pow(1 + dailyRate, limitDays)
  } else {
    finalValue = capitalUsd * (1 + dailyRate * limitDays)
  }

  const earnings = finalValue - capitalUsd
  const effectiveApy = ((finalValue / capitalUsd) ** (365 / limitDays) - 1) * 100

  // Build projection data for chart
  const chartData: Array<{ day: number; value: number }> = []
  const step = Math.max(1, Math.floor(limitDays / 20))
  for (let d = 0; d <= limitDays; d += step) {
    const v = compounding
      ? capitalUsd * Math.pow(1 + dailyRate, d)
      : capitalUsd * (1 + dailyRate * d)
    chartData.push({ day: d, value: Math.round(v * 100) / 100 })
  }
  // Ensure last day is included
  if (chartData[chartData.length - 1]?.day !== limitDays) {
    chartData.push({ day: limitDays, value: Math.round(finalValue * 100) / 100 })
  }

  const chart: ChartBlock = {
    type: 'chart',
    chartType: 'area',
    title: `Earnings Projection (${limitDays}d at ${apy}% APY)`,
    data: chartData.map((d) => ({ day: String(d.day), value: d.value })),
    xKey: 'day',
    yKeys: ['value'],
    colors: ['#22c55e'],
  }

  return {
    toolCallId: toolCall.id,
    content: `Earnings projection:\n- Capital: $${capitalUsd.toLocaleString()}\n- APY: ${apy}%\n- Period: ${limitDays} days\n- Compounding: ${compounding ? 'daily' : 'simple'}\n- Projected earnings: $${earnings.toFixed(2)}\n- Final value: $${finalValue.toFixed(2)}\n- Effective APY: ${effectiveApy.toFixed(2)}%`,
    block: chart,
  }
}

// ── 4.3 Cross-Chain Biconomy ────────────────────────────────────────

export async function executeCrossChainSupply(
  toolCall: ToolCallInput,
  context: ToolContext,
): Promise<ToolResult> {
  const { sourceChainId, assetSymbol, amount } = toolCall.input as {
    sourceChainId: number
    assetSymbol: string
    amount: string
    enableCollateral?: boolean
  }

  if (!context.userAddress) {
    return { toolCallId: toolCall.id, content: 'Error: No user address available.' }
  }

  if (!sourceChainId || !assetSymbol || !amount) {
    return {
      toolCallId: toolCall.id,
      content: 'Error: sourceChainId, assetSymbol, and amount are all required.',
    }
  }

  try {
    const { buildCrossChainSupplyPayload, getSupportedSourceChains } = await import(
      '@/lib/agents/biconomy-builder'
    )

    // Validate chain support
    const supportedChains = getSupportedSourceChains(assetSymbol)
    if (!supportedChains.includes(sourceChainId)) {
      return {
        toolCallId: toolCall.id,
        content: `Chain ${sourceChainId} does not support ${assetSymbol} for cross-chain supply. Supported chains: ${supportedChains.join(', ')}`,
        structuredError: {
          code: 'UNSUPPORTED_CHAIN',
          message: `${assetSymbol.toUpperCase()} isn't available for cross-chain transfers from that network.`,
          raw: `sourceChainId=${sourceChainId} not in [${supportedChains.join(',')}]`,
        },
      }
    }

    // ── Feasibility guard (P8-3) ──────────────────────────────────
    // If the amount is below the cross-chain MEE fee floor, the tx will
    // burn more in fees than it moves. Reject here with a structured
    // suggestion so Perry can pivot to execute_deposit on the hub chain
    // without making the user retry.
    const MIN_CROSS_CHAIN_USD = 1.0
    const numericAmount = Number(amount)
    const amountUsd = isStablecoin(assetSymbol) && Number.isFinite(numericAmount)
      ? numericAmount
      : null
    if (amountUsd !== null && amountUsd < MIN_CROSS_CHAIN_USD) {
      // Hub chains Perry can fall back to when cross-chain isn't viable.
      // Default to BSC (56) — the primary Peridot hub. Perry's system
      // prompt routes the Monad alternative when the portfolio shows one.
      return {
        toolCallId: toolCall.id,
        content:
          `Cross-chain supply is not feasible for ${amount} ${assetSymbol.toUpperCase()} `
          + `(below $${MIN_CROSS_CHAIN_USD.toFixed(2)} — fees would exceed the transfer). `
          + `Follow the structuredError.suggestion below.`,
        structuredError: {
          code: 'BELOW_MIN_AMOUNT',
          message: `Below the $${MIN_CROSS_CHAIN_USD.toFixed(2)} cross-chain minimum.`,
          suggestion: {
            tool: 'execute_deposit',
            input: {
              assetSymbol: assetSymbol.toUpperCase(),
              amount,
              chainId: 56,
            },
            reason: `Hub-chain deposit has no bridge fee so this amount is viable there.`,
          },
        },
      }
    }

    const payload = buildCrossChainSupplyPayload({
      userAddress: context.userAddress,
      sourceChainId,
      assetSymbol,
      amount,
      enableCollateral: true,
    })

    // Persist as a cross-chain proposal (legacy execute route + agent_proposals)
    // AND as a first-class Action Timeline row (P1/P3). Both writes share the
    // same confirmation token so downstream callers can look it up either way.
    const { randomUUID } = await import('crypto')
    const confirmationToken = randomUUID()

    if (context.conversationId) {
      await sql`
        INSERT INTO agent_proposals (
          conversation_id, user_address, allocations, blended_apy,
          risk_level, reasoning, status, confirmation_token
        ) VALUES (
          ${context.conversationId}, ${context.userAddress},
          ${jsonbParam([{
            assetId: assetSymbol.toLowerCase(),
            protocol: 'peridot',
            chainId: 56,
            sourceChainId,
            amount,
            actionType: 'cross-chain_supply',
          }])},
          ${0},
          ${'medium'},
          ${payload.description},
          ${'proposed'},
          ${confirmationToken}
        )
      `
    }

    // Timeline ledger row — best-effort. Failure here (e.g. migration not yet
    // run in a local env) must not block the user's flow, so we swallow.
    try {
      const { createAction } = await import('@/lib/agents/action-timeline')
      await createAction({
        conversationId: context.conversationId ?? null,
        userAddress: context.userAddress,
        actionType: sourceChainId === 56 ? 'deposit' : 'cross-chain_supply',
        assetSymbol: assetSymbol.toUpperCase(),
        amount,
        amountUsd: isStablecoin(assetSymbol) && !isNaN(Number(amount))
          ? Number(amount)
          : null,
        sourceChainId,
        destinationChainId: 56,
        backendType: sourceChainId === 56 ? 'direct_evm' : 'biconomy',
        confirmationToken,
        metadata: {
          'biconomy.mode': payload.mode,
          'biconomy.feeToken': payload.feeToken,
        },
      })
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[action-timeline] createAction skipped:', err)
    }

    const isCrossChain = sourceChainId !== 56
    const amountNum = Number(amount)
    const amountDisplay = !isNaN(amountNum)
      ? (amountNum >= 1 ? `$${amountNum.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : `$${amountNum.toFixed(2)}`)
      : `$${amount}`

    // Pre-fetch a Biconomy quote so we can show the user what they actually
    // get after the MEE fee. Best-effort — if the quote endpoint is down we
    // still hand the block off without the breakdown and the client fetches
    // its own quote at execute-time.
    let fee: ActionButtonBlock['fee'] | undefined
    let netAmount: string | undefined
    try {
      const { estimateCrossChainFee } = await import('@/lib/agents/biconomy-fee-estimator')
      const estimate = await estimateCrossChainFee({
        ownerAddress: payload.ownerAddress,
        composeFlows: payload.composeFlows,
        feeToken: payload.feeToken,
        fundingTokens: payload.fundingTokens,
        mode: payload.mode,
      })
      if (estimate && estimate.feeAmount && !isNaN(amountNum)) {
        fee = {
          amount: estimate.feeAmount,
          usdValue: isStablecoin(assetSymbol) ? Number(estimate.feeAmount) : undefined,
        }
        const net = amountNum - Number(estimate.feeAmount)
        if (net > 0) {
          netAmount = isStablecoin(assetSymbol)
            ? `$${net.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
            : `${net} ${assetSymbol.toUpperCase()}`
        }
      }
    } catch {
      // Fee pre-fetch is best-effort
    }

    const actionBlock: ActionButtonBlock = {
      type: 'action_button',
      // Use the distinctive actionType for cross-chain so downstream can
      // route to the Biconomy MEE flow instead of the single-chain pToken
      // path, and so the consent-gate excludes it from silent auto-execute
      // (no MEE handoff exists from the agent route yet — Phase F6).
      actionType: isCrossChain ? 'cross-chain_supply' : 'deposit',
      label: `Deposit ${amountDisplay}`,
      params: {
        assetSymbol: assetSymbol.toUpperCase(),
        amount,
        poolId: isCrossChain ? 'cross-chain' : `peridot-${assetSymbol.toLowerCase()}-56`,
        chainId: sourceChainId,
        destinationChainId: 56,
        sourceChainId,
        isCrossChain,
        composeFlows: payload.composeFlows,
        ownerAddress: payload.ownerAddress,
        mode: payload.mode,
        // Forward fee/funding for the client-side MEE submit
        feeToken: payload.feeToken,
        fundingTokens: payload.fundingTokens,
      } as any,
      confirmationToken,
      estimatedSeconds: isCrossChain ? 30 : 5,
      fee,
      netAmount,
    }

    const blocks: ContentBlock[] = [actionBlock]

    // Per-call auto-execute hint — keeps Perry's phrasing consistent with
    // whatever the block will actually do. Cross-chain today is NEVER
    // auto-executed (the consent helper excludes it), so this almost
    // always emits the tap instruction — but threading it through keeps
    // the pattern uniform across all execute_* tools.
    const { buildAutoExecuteHint } = await import('@/lib/agents/auto-execute-hint')
    const autoHint = await buildAutoExecuteHint({
      userAddress: context.userAddress,
      actionType: isCrossChain ? 'cross-chain_supply' : 'deposit',
      amountUsd: isStablecoin(assetSymbol) && !isNaN(amountNum) ? amountNum : null,
    })

    const baseContent = isCrossChain
      ? `Prepared a deposit of ${amountDisplay} ${assetSymbol.toUpperCase()} from a different chain. Nothing has been sent yet — the action block is waiting for the user to confirm. The transfer takes ~30s once confirmed.`
      : `Prepared a deposit of ${amountDisplay} ${assetSymbol.toUpperCase()}. Nothing has been sent yet — the action block is waiting for the user to confirm.`

    return {
      toolCallId: toolCall.id,
      // Intentionally worded as "prepared / waiting on user" so Perry's echo
      // doesn't claim the deposit is done. The action block is rendered above
      // this message; the user still needs to confirm it (or auto-execute
      // will, if eligible). Cross-chain takes ~30s AFTER the user confirms.
      content: `${baseContent}${autoHint.instruction}`,
      blocks,
    }
  } catch (error) {
    // Re-throw so the outer tool-executor catch produces a structuredError
    // with the right code for this error type (BiconomyBuildError →
    // QUOTE_FAILED, "insufficient" → INSUFFICIENT_BALANCE, …). Preserves the
    // classification work done there instead of flattening to plain text.
    throw error
  }
}

// ── 5.4 Leaderboard Integration ─────────────────────────────────────

export async function executeVerifyForLeaderboard(
  toolCall: ToolCallInput,
  context: ToolContext,
): Promise<ToolResult> {
  const { txHash, chainId, actionType } = toolCall.input as {
    txHash: string
    chainId: number
    actionType?: string
  }

  if (!context.userAddress) {
    return { toolCallId: toolCall.id, content: 'Error: No user address available.' }
  }

  if (!txHash || !txHash.match(/^0x[a-fA-F0-9]{64}$/)) {
    return {
      toolCallId: toolCall.id,
      content: 'Error: Invalid transaction hash. Must be a 66-character hex string starting with 0x.',
    }
  }

  if (!chainId) {
    return { toolCallId: toolCall.id, content: 'Error: chainId is required.' }
  }

  try {
    // Check for duplicate — don't double-verify
    const existing = await sql`
      SELECT id, points_awarded, action_type FROM verified_transactions
      WHERE LOWER(tx_hash) = ${txHash.toLowerCase()}
      LIMIT 1
    `

    if (existing.length > 0) {
      const pts = existing[0].points_awarded ?? 0
      return {
        toolCallId: toolCall.id,
        content: `Transaction already verified! ${pts} point(s) were awarded for this ${existing[0].action_type} transaction.`,
      }
    }

    // Call the pre-verify endpoint for immediate points (non-blocking)
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

    const verifyRes = await fetch(`${baseUrl}/api/leaderboard/pre-verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        txHash,
        walletAddress: context.userAddress,
        chainId,
        actionType: actionType || 'supply',
        isAgent: true,
      }),
    })

    if (!verifyRes.ok) {
      const errData = await verifyRes.json().catch(() => ({}))
      const errMsg = (errData as Record<string, unknown>).error || `Verification failed (${verifyRes.status})`
      return {
        toolCallId: toolCall.id,
        content: `Leaderboard verification failed: ${errMsg}. The transaction may need to be confirmed on-chain first.`,
      }
    }

    const result = await verifyRes.json() as Record<string, unknown>
    const points = (result.points as number) ?? (result.pointsAwarded as number) ?? 0

    // Also mark the agent_executed_actions row if it exists
    await sql`
      UPDATE agent_executed_actions
      SET status = 'confirmed', tx_hash = ${txHash}
      WHERE id = (
        SELECT id FROM agent_executed_actions
        WHERE LOWER(user_address) = ${context.userAddress.toLowerCase()}
          AND tx_hash IS NULL
          AND status = 'pending'
        ORDER BY created_at DESC
        LIMIT 1
      )
    `.catch(() => {
      // Non-critical — the action row may not exist
    })

    return {
      toolCallId: toolCall.id,
      content: `Transaction verified for leaderboard! ${points} point(s) awarded for this ${actionType || 'supply'} transaction (tx: ${txHash.slice(0, 10)}...). Points will appear on the leaderboard shortly.`,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Verification failed'
    return {
      toolCallId: toolCall.id,
      content: `Error verifying transaction: ${message}`,
    }
  }
}

// ── Agent Action Timeline tools (P3) ───────────────────────────────────
//
// Give Perry a window into his own lifecycle state. These replace the
// hand-waving "I can't confirm yet" pattern — when the user asks "did my
// deposit arrive?", Perry calls list_recent_actions → check_action_status
// and reports the real lifecycle state.

export async function executeCheckActionStatus(
  toolCall: ToolCallInput,
  context: ToolContext,
): Promise<ToolResult> {
  const { id } = toolCall.input as { id: string }
  if (!id || typeof id !== 'string') {
    return { toolCallId: toolCall.id, content: 'Error: action id is required' }
  }
  if (!context.userAddress) {
    return { toolCallId: toolCall.id, content: 'Error: no user address available' }
  }

  try {
    const { getActionById, statusLabel, isTerminal } = await import('@/lib/agents/action-timeline')
    const action = await getActionById(id)
    if (!action) {
      return {
        toolCallId: toolCall.id,
        content: `No action found with id ${id}. It may have been cleaned up or you may have the wrong id — try list_recent_actions to see what's available.`,
      }
    }
    // Guard: only let Perry see the caller's own actions
    if (action.userAddress.toLowerCase() !== context.userAddress.toLowerCase()) {
      return {
        toolCallId: toolCall.id,
        content: `Action ${id} does not belong to the current user.`,
      }
    }

    const elapsedS = Math.round((Date.now() - action.createdAt.getTime()) / 1000)
    const sinceUpdateS = Math.round((Date.now() - action.updatedAt.getTime()) / 1000)
    const summary = formatActionSummary(action, statusLabel, { elapsedS, sinceUpdateS })

    return {
      toolCallId: toolCall.id,
      content:
        summary
        + (isTerminal(action.status)
          ? ` The lifecycle is complete.`
          : ` The status poller re-checks this action every few seconds — if you need a more recent read, call check_action_status again in ~10s.`),
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { toolCallId: toolCall.id, content: `Error reading action status: ${message}` }
  }
}

export async function executeListRecentActions(
  toolCall: ToolCallInput,
  context: ToolContext,
): Promise<ToolResult> {
  if (!context.userAddress) {
    return { toolCallId: toolCall.id, content: 'Error: no user address available' }
  }
  const { windowMinutes, limit } = toolCall.input as {
    windowMinutes?: number
    limit?: number
  }
  const clampedWindow = clamp(Number(windowMinutes) || 10, 1, 60)
  const clampedLimit = clamp(Number(limit) || 10, 1, 25)

  try {
    const { listRecentActions, statusLabel } = await import('@/lib/agents/action-timeline')
    const actions = await listRecentActions(context.userAddress, {
      windowMinutes: clampedWindow,
      limit: clampedLimit,
    })
    if (actions.length === 0) {
      return {
        toolCallId: toolCall.id,
        content: `No agent-initiated actions in the last ${clampedWindow} minute(s). The user has not made any chat-initiated deposits/withdrawals recently.`,
      }
    }
    const lines = actions.map((a) => {
      const elapsedS = Math.round((Date.now() - a.createdAt.getTime()) / 1000)
      return `- [${a.id}] ${formatActionSummary(a, statusLabel, { elapsedS, sinceUpdateS: 0, inline: true })}`
    })
    return {
      toolCallId: toolCall.id,
      content: `Recent actions (last ${clampedWindow}m):\n${lines.join('\n')}`,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { toolCallId: toolCall.id, content: `Error listing recent actions: ${message}` }
  }
}

/**
 * One-line summary used by both check_action_status and list_recent_actions.
 * Kept here (not in action-timeline.ts) because the wording is tool-surface
 * specific — ActionButtonBlock uses its own labels.
 */
function formatActionSummary(
  action: import('@/lib/agents/action-timeline').AgentAction,
  statusLabel: (s: import('@/lib/agents/action-timeline').ActionStatus) => string,
  opts: { elapsedS: number; sinceUpdateS: number; inline?: boolean },
): string {
  const verb = action.actionType
  const amount = isStablecoin(action.assetSymbol)
    ? `$${Number(action.amount).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
    : `${action.amount} ${action.assetSymbol}`
  const chainHop = action.destinationChainId && action.destinationChainId !== action.sourceChainId
    ? ` (chain ${action.sourceChainId} → ${action.destinationChainId})`
    : ` (chain ${action.sourceChainId})`
  const label = statusLabel(action.status)
  const elapsed = opts.elapsedS < 60
    ? `${opts.elapsedS}s ago`
    : `${Math.round(opts.elapsedS / 60)}m ago`

  if (opts.inline) {
    return `${verb} ${amount}${chainHop} — ${label} · started ${elapsed}`
  }

  const parts = [
    `Action ${action.id} — ${verb} ${amount}${chainHop}.`,
    `Status: ${label} (${action.status}).`,
    `Started ${elapsed}, last updated ${opts.sinceUpdateS}s ago.`,
  ]
  if (action.primaryHash) parts.push(`Backend hash: ${action.primaryHash}.`)
  if (action.errorMessage) parts.push(`Error: ${action.errorMessage}.`)
  return parts.join(' ')
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(n) ? n : min))
}

/**
 * Convert MCP tool results into chat content blocks.
 *
 * The MCP server emits `structuredContent: { data: ... }` alongside the
 * human-readable text — the client surfaces it via `McpToolCallResult.data`.
 * This module turns those typed payloads into ContentBlocks so Perry can
 * render visuals instead of dumping markdown tables.
 *
 * Tool-name → block builder is a small switch; new tools just register here.
 */

import type {
  ContentBlock,
  PoolInfo,
  PoolTableBlock,
  PortfolioOverviewBlock,
  PortfolioBreakdownEntry,
  PositionCardBlock,
  TransactionAction,
  TransactionEntry,
  TransactionHistoryBlock,
} from '@/types/agents'
import { getChainConfig } from '@/config/contracts'

const ACTION_TYPES: ReadonlySet<TransactionAction> = new Set([
  'supply',
  'borrow',
  'repay',
  'redeem',
])

interface UpstreamTx {
  txHash?: unknown
  chainId?: unknown
  blockNumber?: unknown
  actionType?: unknown
  tokenSymbol?: unknown
  amount?: unknown
  usdValue?: unknown
  verifiedAt?: unknown
  // Cross-chain bookkeeping (optional).
  isCrossChain?: unknown
  destinationChainId?: unknown
  destinationTxHash?: unknown
  destinationBlockNumber?: unknown
}

const EVM_TX_HASH_RE = /^0x[a-fA-F0-9]{64}$/

/**
 * Pick `(chainId, txHash)` to link out to. For cross-chain rows we prefer the
 * destination-side (hub) hash — that's the chain where the real Mint/Borrow
 * lands. The source-side `txHash` on cross-chain rows is a Biconomy MEE id
 * that no explorer indexes, which is why linking it hits 404s in prod.
 *
 * Returns null to mean "render a plain row without a link". That happens when:
 *   1. Any field is malformed (defensive parsing).
 *   2. Cross-chain row whose destination hash hasn't been backfilled yet.
 *   3. Single-chain row with blockNumber === 0 — stub rows from legacy writers
 *      that don't know the block. The hash may look real but explorer pages
 *      always 404 on these, so suppressing is better UX than the broken link.
 */
export function pickExplorerTarget(
  tx: UpstreamTx,
): { chainId: number; txHash: string } | null {
  if (tx.isCrossChain === true) {
    const destHash = tx.destinationTxHash
    const destChain = tx.destinationChainId
    if (typeof destHash !== 'string' || !EVM_TX_HASH_RE.test(destHash)) return null
    if (typeof destChain !== 'number' || !Number.isFinite(destChain)) return null
    return { chainId: destChain, txHash: destHash }
  }

  const hash = tx.txHash
  const chain = tx.chainId
  if (typeof hash !== 'string' || !EVM_TX_HASH_RE.test(hash)) return null
  if (typeof chain !== 'number' || !Number.isFinite(chain)) return null
  // block_number = 0 is the writer's sentinel for "I had no block" — those
  // rows almost always resolve to "tx not found" on explorers. Skip the link.
  if (typeof tx.blockNumber === 'number' && tx.blockNumber === 0) return null
  return { chainId: chain, txHash: hash }
}

function explorerUrlFor(target: { chainId: number; txHash: string } | null): string | undefined {
  if (!target) return undefined
  try {
    const cfg = getChainConfig(target.chainId) as { explorer?: unknown } | null
    const base = cfg?.explorer
    if (typeof base !== 'string' || base.length === 0) return undefined
    return `${base.replace(/\/$/, '')}/tx/${target.txHash}`
  } catch {
    return undefined
  }
}

function shortAddr(addr: unknown): string | undefined {
  if (typeof addr !== 'string' || !addr.startsWith('0x') || addr.length < 10) return undefined
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function buildTransactionHistoryBlock(
  data: Record<string, unknown>,
  walletAddress: string,
): TransactionHistoryBlock | null {
  // The wallet-history tool wraps under `data: { transactions, total }` (see
  // mcp-server/src/tools/index.ts wrap() at line 68).
  const inner =
    (data.data && typeof data.data === 'object' ? (data.data as Record<string, unknown>) : data) ??
    {}
  const rawTxs = (inner as { transactions?: unknown }).transactions
  if (!Array.isArray(rawTxs)) return null

  const entries: TransactionEntry[] = []
  for (const t of rawTxs as UpstreamTx[]) {
    const action = typeof t.actionType === 'string' ? t.actionType.toLowerCase() : ''
    if (!ACTION_TYPES.has(action as TransactionAction)) continue

    const usd = typeof t.usdValue === 'number' && Number.isFinite(t.usdValue) ? t.usdValue : 0
    const amt = typeof t.amount === 'number' && Number.isFinite(t.amount) ? t.amount : 0
    const symbol = typeof t.tokenSymbol === 'string' && t.tokenSymbol ? t.tokenSymbol : 'asset'
    const ts = typeof t.verifiedAt === 'string' ? t.verifiedAt : new Date().toISOString()
    const id =
      typeof t.txHash === 'string' && t.txHash
        ? `${t.txHash}-${action}`
        : `${ts}-${action}-${symbol}`

    const target = pickExplorerTarget(t)
    const explorerUrl = explorerUrlFor(target)
    const isCrossChain = t.isCrossChain === true
    const sourceChainId =
      typeof t.chainId === 'number' && Number.isFinite(t.chainId) ? t.chainId : undefined
    const destinationChainId =
      typeof t.destinationChainId === 'number' && Number.isFinite(t.destinationChainId)
        ? t.destinationChainId
        : null

    entries.push({
      id,
      action: action as TransactionAction,
      assetSymbol: symbol,
      amount: amt,
      usdValue: usd,
      timestamp: ts,
      explorerUrl,
      isCrossChain,
      sourceChainId,
      destinationChainId,
    })
  }

  const total = (inner as { total?: unknown }).total
  const totalAvailable =
    typeof total === 'number' && Number.isFinite(total) ? total : entries.length

  return {
    type: 'transaction_history',
    walletShort: shortAddr(walletAddress),
    entries,
    totalAvailable,
  }
}

// ── Wallet Summary → portfolio_overview + position_cards ────────────────

interface SummaryAsset {
  assetId?: unknown
  supplied?: unknown
  borrowed?: unknown
  net?: unknown
  percentage?: unknown
}

function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function buildPortfolioBlocksFromSummary(
  data: Record<string, unknown>,
): ContentBlock[] {
  // wrap() in the MCP server stuffs everything under `data: { ... }`.
  const inner =
    data.data && typeof data.data === 'object'
      ? (data.data as Record<string, unknown>)
      : data
  const portfolio =
    (inner.portfolio && typeof inner.portfolio === 'object'
      ? (inner.portfolio as Record<string, unknown>)
      : null) ?? null
  const assetsRaw = Array.isArray(inner.assets) ? (inner.assets as SummaryAsset[]) : []

  if (!portfolio && assetsRaw.length === 0) return []

  const totalDepositedUsd = num((portfolio as Record<string, unknown> | null)?.totalSupplied)
  const totalBorrowedUsd = num((portfolio as Record<string, unknown> | null)?.totalBorrowed)
  const netEarnRate = num((portfolio as Record<string, unknown> | null)?.netApy)

  const depositCards: PositionCardBlock[] = []
  const loanCards: PositionCardBlock[] = []
  const breakdown: PortfolioBreakdownEntry[] = []

  for (const a of assetsRaw) {
    const sym =
      typeof a.assetId === 'string' && a.assetId.length > 0
        ? a.assetId.toUpperCase()
        : null
    if (!sym) continue
    const supplied = num(a.supplied)
    const borrowed = num(a.borrowed)
    if (supplied >= 0.5) {
      depositCards.push({
        type: 'position_card',
        assetSymbol: sym,
        kind: 'deposit',
        valueUsd: supplied,
      })
      if (totalDepositedUsd > 0) {
        breakdown.push({
          assetSymbol: sym,
          valueUsd: supplied,
          percentage: (supplied / totalDepositedUsd) * 100,
        })
      }
    }
    if (borrowed >= 0.5) {
      loanCards.push({
        type: 'position_card',
        assetSymbol: sym,
        kind: 'loan',
        valueUsd: borrowed,
      })
    }
  }

  const overview: PortfolioOverviewBlock = {
    type: 'portfolio_overview',
    totalDepositedUsd,
    totalBorrowedUsd,
    netEarnRate,
    positionCount: depositCards.length,
    breakdown: breakdown.sort((a, b) => b.valueUsd - a.valueUsd),
  }

  return [overview, ...depositCards, ...loanCards]
}

// ── Live APYs / Market Metrics → pool_table ─────────────────────────────

interface ApyRow {
  asset?: unknown
  chainId?: unknown
  supplyApy?: unknown
  totalSupplyApy?: unknown
}

interface MetricRow {
  asset?: unknown
  chainId?: unknown
  utilizationPct?: unknown
  tvlUsd?: unknown
}

const STABLE = new Set(['USDC', 'USDT', 'DAI', 'AUSD', 'BUSD', 'USDD'])
const BLUE_CHIP = new Set(['ETH', 'WETH', 'BTC', 'WBTC', 'BNB', 'WBNB', 'MON', 'LINK'])

function riskTierFor(symbol: string): 'low' | 'medium' | 'high' {
  const upper = symbol.toUpperCase()
  if (STABLE.has(upper)) return 'low'
  if (BLUE_CHIP.has(upper)) return 'medium'
  return 'high'
}

/**
 * Pull a flat row array out of an MCP structured result. Tolerates three
 * upstream shapes seen in the wild:
 *   1. `{ data: [Row, Row, ...] }`               — current MCP server output
 *   2. `{ data: { rows: [Row, ...] } }`          — alt wrapper
 *   3. `[Row, Row, ...]`                         — already unwrapped (tests)
 */
function extractRows(data: Record<string, unknown>): unknown[] {
  if (Array.isArray(data)) return data
  const inner = (data.data ?? data) as unknown
  if (Array.isArray(inner)) return inner
  if (inner && typeof inner === 'object') {
    const maybeRows = (inner as Record<string, unknown>).rows
    if (Array.isArray(maybeRows)) return maybeRows
  }
  return []
}

function buildPoolTableFromLiveApys(data: Record<string, unknown>): PoolTableBlock | null {
  const rows = extractRows(data)
  if (rows.length === 0) return null

  const pools: PoolInfo[] = []
  for (const raw of rows) {
    if (!raw || typeof raw !== 'object') continue
    const entry = raw as ApyRow
    const asset = typeof entry.asset === 'string' ? entry.asset : null
    const chainId = num(entry.chainId)
    if (!asset || chainId === 0) continue
    const apy = num(entry.totalSupplyApy, num(entry.supplyApy))
    pools.push({
      id: `${asset.toLowerCase()}-${chainId}-live`,
      protocol: 'peridot',
      poolName: `Peridot ${asset.toUpperCase()}`,
      assetSymbol: asset.toUpperCase(),
      chainId,
      riskTier: riskTierFor(asset),
      isPeridot: true,
      isActive: true,
      liveApy: apy,
    })
  }

  if (pools.length === 0) return null
  return {
    type: 'pool_table',
    pools,
    title: 'Live earn rates',
    sortBy: 'apy',
  }
}

function buildPoolTableFromMarketMetrics(data: Record<string, unknown>): PoolTableBlock | null {
  const rows = extractRows(data)
  if (rows.length === 0) return null

  const pools: PoolInfo[] = []
  for (const raw of rows) {
    if (!raw || typeof raw !== 'object') continue
    const entry = raw as MetricRow
    const asset = typeof entry.asset === 'string' ? entry.asset : null
    const chainId = num(entry.chainId)
    if (!asset || chainId === 0) continue
    pools.push({
      id: `${asset.toLowerCase()}-${chainId}-metrics`,
      protocol: 'peridot',
      poolName: `Peridot ${asset.toUpperCase()}`,
      assetSymbol: asset.toUpperCase(),
      chainId,
      riskTier: riskTierFor(asset),
      isPeridot: true,
      isActive: true,
      utilizationRate: num(entry.utilizationPct),
      tvl: String(num(entry.tvlUsd)),
    })
  }

  if (pools.length === 0) return null
  return {
    type: 'pool_table',
    pools,
    title: 'Pool depth & utilization',
    sortBy: 'tvl',
  }
}

// Exported for targeted unit tests — not part of the public module API.
// See tests/agents/mcp-result-to-blocks-crosschain.test.ts.
export const __test = {
  pickExplorerTarget,
}

/**
 * Inspect the namespaced MCP tool name and return any UI blocks the result
 * should produce. Returns an empty array when no visual representation is
 * defined for the tool — the LLM still gets the text content.
 */
export function buildBlocksFromMcpResult(
  toolName: string,
  data: Record<string, unknown> | undefined,
  walletAddress: string,
): ContentBlock[] {
  if (!data) return []

  // Strip the "mcp__<server>__" prefix once so the switch below stays readable.
  const remote = toolName.replace(/^mcp__[^_]+__/, '')

  switch (remote) {
    case 'get_peridot_wallet_history': {
      const block = buildTransactionHistoryBlock(data, walletAddress)
      return block ? [block] : []
    }
    case 'get_peridot_wallet_summary':
      return buildPortfolioBlocksFromSummary(data)
    case 'get_live_apys': {
      const block = buildPoolTableFromLiveApys(data)
      return block ? [block] : []
    }
    case 'get_market_metrics': {
      const block = buildPoolTableFromMarketMetrics(data)
      return block ? [block] : []
    }
    default:
      return []
  }
}

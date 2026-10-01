// ── Content Blocks (rendered inline in chat messages) ────────────────

export type ContentBlockType =
  | 'text'
  | 'pool_table'
  | 'allocation'
  | 'chart'
  | 'three_visualization'
  | 'action_button'
  | 'rebalance'
  | 'portfolio_overview'
  | 'position_card'
  | 'alert'
  | 'quick_reply'
  | 'transaction_history'
  | 'asset_earnings'

export interface TextBlock {
  type: 'text'
  content: string // Markdown-formatted text
}

export interface PoolInfo {
  id: string
  protocol: string
  poolName: string
  assetSymbol: string
  chainId: number
  riskTier: 'low' | 'medium' | 'high'
  isPeridot: boolean
  isActive: boolean
  contractAddress?: string
  liveApy?: number
  tvl?: string
  utilizationRate?: number
  metadata?: Record<string, unknown>
}

export interface PoolTableBlock {
  type: 'pool_table'
  pools: PoolInfo[]
  title?: string
  sortBy?: 'apy' | 'tvl' | 'risk'
}

export interface AllocationEntry {
  protocol: string
  asset: string
  chainId: number
  percentage: number
  apy: number
  isPeridot: boolean
  poolId?: string
}

export interface AllocationBlock {
  type: 'allocation'
  allocations: AllocationEntry[]
  blendedApy: number
  riskLevel: 'low' | 'medium' | 'high'
  reasoning: string
}

export interface ChartBlock {
  type: 'chart'
  chartType: 'line' | 'bar' | 'area'
  title: string
  data: Array<Record<string, number | string>>
  xKey: string
  yKeys: string[]
  colors?: string[]
}

export type ThreeVisualizationType =
  | 'portfolio_sphere'
  | 'yield_landscape'
  | 'risk_heatmap'

export interface ThreeVisualizationBlock {
  type: 'three_visualization'
  visualizationType: ThreeVisualizationType
  data: Record<string, unknown>
}

export interface RebalanceEntry {
  asset: string
  currentPct: number
  targetPct: number
  driftPct: number       // positive = overweight, negative = underweight
  action: 'withdraw' | 'supply'
  amountUsd: number
}

export interface RebalanceBlock {
  type: 'rebalance'
  entries: RebalanceEntry[]
  totalValueUsd: number
  driftThreshold: number
}

/**
 * ActionButton action types.
 * The user-facing vocabulary is fintech ("deposit"/"withdraw"/"borrow"/"pay_back"/"convert"/"adjust_strategy").
 * Legacy DeFi values ("supply"/"rebalance"/"swap"/"repay"/"cross-chain_supply") are accepted for
 * backward compatibility and mapped internally.
 */
export type ActionButtonActionType =
  | 'deposit'
  | 'withdraw'
  | 'borrow'
  | 'pay_back'
  | 'convert'
  | 'adjust_strategy'
  // Legacy / DeFi-internal:
  | 'supply'
  | 'repay'
  | 'swap'
  | 'rebalance'
  | 'cross-chain_supply'

export interface ActionButtonBlock {
  type: 'action_button'
  actionType: ActionButtonActionType
  label: string                  // e.g. "Deposit $100"
  params: {
    assetSymbol: string
    amount: string
    poolId: string
    chainId: number
    targetAddress?: string
  }
  confirmationToken: string
  /** Amount the user actually receives after fees (e.g. "$99.30"). If omitted, main `amount` is shown. */
  netAmount?: string
  /** Annual earn rate for deposit actions (e.g. 8.5 for 8.5%). */
  earnRate?: number
  /** Expected completion time in seconds. Used for progress indicator. Defaults: 5s same-chain, 30s cross-chain. */
  estimatedSeconds?: number
  /**
   * MEE / bridge fee that will be skimmed from the trigger token. Set by the
   * cross-chain supply executor after fetching a Biconomy quote. The UI shows
   * this as "Network fee: $X.XX — You'll deposit $Y.YY" so the user sees
   * exactly what they're consenting to before confirming.
   */
  fee?: {
    /** Human-unit amount skimmed as fee (same token as params.assetSymbol). */
    amount: string
    /** Rough USD value for display; optional. */
    usdValue?: number
  }
  /**
   * Server-authoritative auto-execute decision. Populated by the tool-executor
   * from `buildAutoExecuteHint` so the client doesn't have to re-evaluate the
   * profile (which causes a hydration race: React-Query's `/api/agents/profile`
   * fetch runs *parallel* to block render, and `profile === null` in the first
   * frames would push the block to the manual-button path even when auto is
   * enabled). When `willFire === true` the client still gates on `canAutoSign`
   * and `isFreshMessage` before actually dispatching — those are runtime-only
   * facts the server can't know.
   */
  autoExecute?: {
    willFire: boolean
    reason?: string
  }
}

// ── Portfolio Overview (hero card showing total deposited / earn rate) ────

export interface PortfolioBreakdownEntry {
  assetSymbol: string
  valueUsd: number
  /** 0–100 share of totalDepositedUsd represented by this asset. */
  percentage: number
}

export interface PortfolioOverviewBlock {
  type: 'portfolio_overview'
  totalDepositedUsd: number
  totalBorrowedUsd: number
  /** Weighted annual earn rate across all deposits (percent). */
  netEarnRate: number
  /** Number of deposit positions counted in the overview. */
  positionCount: number
  /** Stacked-bar breakdown by asset, sorted by valueUsd desc. */
  breakdown: PortfolioBreakdownEntry[]
  /** Idle (not-yet-deposited) wallet balance roll-up across spoke chains. */
  idleUsd?: number
  /** Number of distinct idle assets. */
  idleAssetCount?: number
}

// ── Position Card (one per deposit / loan / idle balance) ─────────────────

export type PositionKind = 'deposit' | 'loan' | 'idle'

export interface PositionCardBlock {
  type: 'position_card'
  assetSymbol: string
  kind: PositionKind
  valueUsd: number
  /** For deposits: earn rate (%); for loans: interest rate paid. Omit for idle. */
  earnRate?: number
  /** Optional human-friendly subtitle, e.g. "Sitting in your wallet". */
  subtitle?: string
}

// ── Alert (severity-colored heads-up card) ─────────────────────────────────

export type AlertSeverity = 'info' | 'warn' | 'danger' | 'success'

export interface AlertBlock {
  type: 'alert'
  severity: AlertSeverity
  title: string
  /** Optional supporting copy (plain text — keep short, 1-2 sentences). */
  body?: string
}

// ── Quick Reply (clickable follow-up chips) ────────────────────────────────

export interface QuickReply {
  /** Chip label shown to the user. */
  label: string
  /**
   * Pre-filled chat prompt sent on click. Becomes the next user turn —
   * write it as a natural question / instruction Perry can answer.
   */
  prompt: string
}

export interface QuickReplyBlock {
  type: 'quick_reply'
  replies: QuickReply[]
}

// ── Transaction History (verified Peridot activity) ────────────────────────

export type TransactionAction = 'supply' | 'borrow' | 'repay' | 'redeem'

export interface TransactionEntry {
  /** Stable id used for React keys + dedup. txHash works. */
  id: string
  action: TransactionAction
  assetSymbol: string
  /** Underlying token amount (already humanized). */
  amount: number
  usdValue: number
  /** ISO 8601 timestamp from upstream. */
  timestamp: string
  /** Optional explorer URL — when present the row links out. */
  explorerUrl?: string
  /**
   * True when the action was bridged from a spoke chain to a hub chain.
   * Lets the row surface a "cross-chain" chip instead of pretending it was
   * a plain same-chain tx.
   */
  isCrossChain?: boolean
  /**
   * Source chain (where the user initiated) — always the `chain_id` column
   * on the DB row. Present on every row but meaningful mostly for cross-chain.
   */
  sourceChainId?: number
  /** Destination/hub chain, only set for cross-chain rows. */
  destinationChainId?: number | null
}

export interface TransactionHistoryBlock {
  type: 'transaction_history'
  /** Short label for the wallet — e.g. "0x7A2C…F3E9". Optional. */
  walletShort?: string
  entries: TransactionEntry[]
  /** Total available rows upstream — lets us show "showing 25 of 142". */
  totalAvailable?: number
}

// ── Asset Earnings (focused $-earned card, optional per-asset breakdown) ───

export interface AssetEarningsBreakdownEntry {
  tokenSymbol: string
  earnedUsd: number
  /** Net principal currently working — used to size the breakdown bar. */
  totalSuppliedUsd: number
  /** Days since first deposit of this asset. */
  daysActive: number
}

export interface AssetEarningsBlock {
  type: 'asset_earnings'
  /**
   * When set, the card focuses on a single asset (the one the user asked
   * about). When undefined, the card shows the lifetime aggregate plus a
   * per-asset breakdown.
   */
  focusSymbol?: string
  totalEarnedUsd: number
  /** Effective annualized return — already rendered as a percent value (e.g. 4.8 = 4.8%). */
  effectiveApy: number
  daysActive: number
  /**
   * Per-token breakdown. Always present (even for focused cards, with one
   * entry) so the renderer has consistent data to show alongside the hero.
   */
  breakdown: AssetEarningsBreakdownEntry[]
}

export type ContentBlock =
  | TextBlock
  | PoolTableBlock
  | AllocationBlock
  | ChartBlock
  | ThreeVisualizationBlock
  | ActionButtonBlock
  | RebalanceBlock
  | PortfolioOverviewBlock
  | PositionCardBlock
  | AlertBlock
  | QuickReplyBlock
  | TransactionHistoryBlock
  | AssetEarningsBlock

// ── Messages & Conversations ────────────────────────────────────────

export interface AgentMessage {
  id: string
  conversationId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  blocks?: ContentBlock[]
  createdAt: string
}

export interface AgentConversation {
  id: string
  title: string
  isArchived: boolean
  createdAt: string
  updatedAt: string
  lastMessage?: string
}

// ── Streaming SSE Events ────────────────────────────────────────────

export interface TextDeltaEvent {
  type: 'text_delta'
  delta: string
}

export interface BlockEvent {
  type: 'block'
  block: ContentBlock
}

export interface DoneEvent {
  type: 'done'
  messageId: string
}

export interface ErrorEvent {
  type: 'error'
  message: string
}

/**
 * Emitted the moment a tool invocation starts. Primarily exists to keep the
 * SSE channel alive for Cloudflare (which triggers 524 after 100s of silence)
 * during long tool executions like multi-chain balance reads. The client may
 * optionally surface it as a "Perry is checking…" hint; unknown events are
 * ignored by existing clients, so this is backwards-compatible.
 */
export interface ToolStartEvent {
  type: 'tool_start'
  name: string
}

export interface ToolEndEvent {
  type: 'tool_end'
  name: string
  ms: number
  ok: boolean
}

/**
 * Periodic keepalive during long tool executions. Carries no semantic
 * payload — it only exists so Cloudflare's 100s origin-response timer never
 * elapses while Perry is waiting on RPCs.
 */
export interface HeartbeatEvent {
  type: 'heartbeat'
  tool?: string
  elapsedMs: number
}

export type StreamEvent =
  | TextDeltaEvent
  | BlockEvent
  | DoneEvent
  | ErrorEvent
  | ToolStartEvent
  | ToolEndEvent
  | HeartbeatEvent

// ── Tool Definitions ────────────────────────────────────────────────

export interface ToolCall {
  id: string
  name: string
  input: Record<string, unknown>
}

/**
 * Typed error surface returned by a tool. The tool executor preserves this
 * across the `executeTool` catch so Perry gets actionable context instead of
 * a flattened "Error: …" string. When `suggestion` is set, Perry's system
 * prompt instructs him to follow it directly (e.g. switch `execute_cross_chain_supply`
 * to `execute_deposit`) without re-asking the user.
 */
export interface ToolStructuredError {
  /** Stable machine code — enables prompt-level switch logic. */
  code:
    | 'BELOW_MIN_AMOUNT'
    | 'UNSUPPORTED_CHAIN'
    | 'INSUFFICIENT_BALANCE'
    | 'INVALID_ADDRESS'
    | 'INVALID_AMOUNT'
    | 'QUOTE_FAILED'
    | 'WALLET_DISCONNECTED'
    | 'INTERNAL'
    | (string & {})  // Escape hatch for new codes without type bump
  /** Human-facing fintech message — already sanitised, Perry can quote. */
  message: string
  /** Optional pivot to a different tool. Perry must invoke it immediately. */
  suggestion?: {
    tool: string
    input: Record<string, unknown>
    reason: string
  }
  /** Raw original error, for logging / Details view. Not shown by default. */
  raw?: string
}

export interface ToolResult {
  toolCallId: string
  content: string
  block?: ContentBlock
  blocks?: ContentBlock[]
  /**
   * Typed error payload. Optional. When set, the assistant is expected to
   * act on `structuredError.suggestion` (if any) or explain `message` to
   * the user instead of narrating the raw `content` field.
   */
  structuredError?: ToolStructuredError
}

// ── Agent Profile ───────────────────────────────────────────────────

export interface AgentProfile {
  id: string
  userAddress: string
  riskLevel: 'low' | 'medium' | 'high'
  investmentGoal: string | null
  timeHorizon: 'short' | 'medium' | 'long' | null
  capitalUsd: number | null
  preferredAssets: string[]
  preferredChains: number[]
  onboardingComplete: boolean
  /** Whether the agent is permitted to silently auto-execute small transactions. */
  autoExecuteEnabled: boolean
  /** USD cap per transaction. Defaults to $2.00 (intentionally conservative). */
  autoExecuteLimitUsd: number
  /** Fintech action types allowed for auto-execute. Borrow/adjust_strategy always require click. */
  autoExecuteActions: string[]
  /** When we last asked the user the one-time opt-in question (null = never asked). */
  autoExecutePromptedAt: string | null
  createdAt: string
  updatedAt: string
}

// ── Live Portfolio ──────────────────────────────────────────────────

export interface PortfolioPosition {
  assetSymbol: string
  chainId: number
  pTokenAddress: string
  suppliedUnderlying: string   // human-readable amount
  suppliedUsd: number
  borrowedUnderlying: string
  borrowedUsd: number
  apy: number
}

/**
 * A bridgeable wallet balance — USDC / USDT / WETH / etc — sitting in the
 * user's wallet on a chain (not yet deposited into any pool). Perry uses this
 * to know that if a user says "deposit my USDT", the asset lives on e.g.
 * Arbitrum and the right tool is `execute_cross_chain_supply`, not
 * `execute_deposit` on a hub chain.
 */
export interface WalletBalance {
  assetSymbol: string
  chainId: number
  amount: string        // human-readable
  amountUsd?: number    // best-effort; stablecoins use 1:1
  tokenAddress: string
}

export interface LivePortfolio {
  positions: PortfolioPosition[]
  /**
   * Idle bridgeable balances across supported chains — NOT deposited anywhere.
   * Populated by the spoke-chain balance reader. Empty for users whose funds
   * are fully deposited.
   */
  walletBalances?: WalletBalance[]
  totalSuppliedUsd: number
  totalBorrowedUsd: number
  netApy: number
  timestamp: number
}

// ── Action Execution ────────────────────────────────────────────────

export interface ExecuteActionRequest {
  confirmationToken: string
}

export interface ExecuteActionResponse {
  to: string
  data: string
  value?: string
  chainId: number
  actionType: string
  assetSymbol: string
  amount: string
}

export interface ExecutedAction {
  id: string
  conversationId: string
  actionType: string
  assetSymbol: string
  amount: string
  chainId: number
  txHash?: string
  status: 'pending' | 'confirmed' | 'failed' | 'cancelled'
  createdAt: string
}

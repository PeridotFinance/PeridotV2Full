/**
 * Server-side preflight validation for agent-proposed transactions.
 *
 * Called in `/api/agents/execute` before `buildTxPlan` so we can return a
 * typed, fintech-friendly error instead of letting the RPC / contract
 * revert halfway through the UI flow.
 *
 * The actual on-chain balance fetch lives outside this module (keeps it pure
 * and unit-testable). Callers inject the fetched balance via
 * `userBalanceBaseUnits` if they want a strict balance check; otherwise the
 * check is skipped and the transaction will be validated on-chain instead.
 */

export type PreflightErrorCode =
  | 'POOL_INACTIVE'
  | 'POOL_MISSING'
  | 'WRONG_CHAIN'
  | 'INSUFFICIENT_BALANCE'
  | 'AMOUNT_BELOW_MIN'
  | 'INVALID_AMOUNT'
  | 'UNSUPPORTED_CHAIN'
  | 'UNKNOWN_ACTION'

export interface PreflightInput {
  actionType: string
  /** Numeric amount in the asset's human unit (e.g. "100" for 100 USDC) */
  amount: string | number
  assetSymbol: string
  /** Chain the transaction is *intended* for (destination hub) */
  chainId: number
  /** Pool row from `agent_pool_registry`, if found */
  pool?: { is_active?: boolean | null; chain_id?: number | null } | null
  /**
   * User's spendable balance in base units (wei / smallest denomination).
   * When undefined, balance check is skipped (will revert on-chain if not enough).
   */
  userBalanceBaseUnits?: bigint
  /** Amount converted to base units by the caller (for precise balance compare) */
  amountBaseUnits?: bigint
  /** Minimum USD value below which we reject. Defaults to $0.01 */
  minAmountUsd?: number
  /** USD value of `amount` when available (used for min-amount check) */
  amountUsd?: number
  /** Allow-list of hub chain IDs for this deployment preset */
  supportedChainIds?: number[]
}

export interface PreflightResult {
  ok: boolean
  code?: PreflightErrorCode
  /** Consumer-facing message (fintech vocabulary, no crypto jargon) */
  message?: string
  /** HTTP status for API routes to forward directly */
  status?: number
}

const DEFAULT_MIN_AMOUNT_USD = 0.01

const DEFAULT_SUPPORTED_CHAIN_IDS = [
  56,    // BSC mainnet
  97,    // BSC testnet
  143,   // Monad mainnet
  10143, // Monad testnet
  50312, // Somnia testnet
]

/**
 * Action types that don't require a wallet balance check.
 *
 * - `borrow`: pulls from protocol liquidity, not the user's wallet.
 * - `withdraw`: the user's *pool* balance is the gate, not wallet. Comparing
 *   wallet balance here incorrectly blocked users who had $X in the Peridot
 *   pool but less idle in their wallet — the withdraw tx itself doesn't need
 *   wallet funds. The contract enforces pool balance on-chain.
 * - `cross-chain_supply`: balance lives on the spoke chain; Biconomy builder
 *   validates it in its own flow.
 */
const SKIP_BALANCE_CHECK = new Set([
  'borrow',
  'withdraw',
  'cross-chain_supply',
])

/**
 * Action types our tx-builder knows. Anything outside this list surfaces
 * UNKNOWN_ACTION so the user sees a friendly message rather than a 500.
 */
const KNOWN_ACTIONS = new Set([
  'deposit', 'supply',
  'withdraw',
  'borrow',
  'repay', 'pay_back',
  'swap', 'convert',
  'rebalance', 'adjust_strategy',
  'cross-chain_supply',
])

export function preflightCheck(input: PreflightInput): PreflightResult {
  // 1. Known action
  if (!KNOWN_ACTIONS.has(input.actionType)) {
    return {
      ok: false,
      code: 'UNKNOWN_ACTION',
      status: 400,
      message: `Unsupported action: ${input.actionType}`,
    }
  }

  // 2. Amount sanity
  const n = typeof input.amount === 'number' ? input.amount : Number(input.amount)
  if (!Number.isFinite(n) || n <= 0) {
    return {
      ok: false,
      code: 'INVALID_AMOUNT',
      status: 400,
      message: 'Amount must be greater than zero.',
    }
  }

  // 3. Minimum USD value (skip only if caller explicitly passes amountUsd)
  if (typeof input.amountUsd === 'number') {
    const min = input.minAmountUsd ?? DEFAULT_MIN_AMOUNT_USD
    if (input.amountUsd < min) {
      return {
        ok: false,
        code: 'AMOUNT_BELOW_MIN',
        status: 400,
        message: `Minimum amount is $${min.toFixed(2)}.`,
      }
    }
  }

  // 4. Supported chain
  const supported = input.supportedChainIds ?? DEFAULT_SUPPORTED_CHAIN_IDS
  if (!supported.includes(input.chainId)) {
    return {
      ok: false,
      code: 'UNSUPPORTED_CHAIN',
      status: 400,
      message: `We don't support this network yet.`,
    }
  }

  // 5. Pool must be active (only if pool data was passed in)
  if (input.pool !== undefined) {
    if (input.pool === null) {
      return {
        ok: false,
        code: 'POOL_MISSING',
        status: 404,
        message: 'This pool is no longer available.',
      }
    }
    if (input.pool.is_active === false) {
      return {
        ok: false,
        code: 'POOL_INACTIVE',
        status: 410,
        message: 'This pool is temporarily paused. Try another pool.',
      }
    }
    if (
      typeof input.pool.chain_id === 'number' &&
      input.pool.chain_id !== input.chainId
    ) {
      return {
        ok: false,
        code: 'WRONG_CHAIN',
        status: 400,
        message: 'This pool is on a different network than expected.',
      }
    }
  }

  // 6. Balance check (optional, caller fetches on-chain)
  if (
    !SKIP_BALANCE_CHECK.has(input.actionType) &&
    input.userBalanceBaseUnits !== undefined &&
    input.amountBaseUnits !== undefined
  ) {
    if (input.userBalanceBaseUnits < input.amountBaseUnits) {
      return {
        ok: false,
        code: 'INSUFFICIENT_BALANCE',
        status: 402, // Payment Required — semantic fit for "not enough funds"
        message: 'Insufficient balance for this action.',
      }
    }
  }

  return { ok: true }
}

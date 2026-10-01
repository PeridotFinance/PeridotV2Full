/**
 * Pure consent-check for agent auto-execute.
 *
 * Called server-side before dispatching a transaction without user click-confirm,
 * and client-side to decide whether to render the inline auto-execute UI vs.
 * the traditional dialog. The wallet-level gate (`canAutoSign`) is checked in
 * `useActiveWallet`; this function layers on the per-user profile and the
 * specific action's cost/type.
 */

export interface AutoExecuteProfile {
  auto_execute_enabled?: boolean
  /** Numeric USD limit. Values come from Postgres numeric — they may be strings. */
  auto_execute_limit_usd?: number | string | null
  auto_execute_actions?: string[] | null
}

export interface AutoExecuteIntent {
  /** Fintech action vocabulary: 'deposit' | 'withdraw' | 'pay_back' | etc. */
  actionType: string
  /** Transaction's USD value. Used against `auto_execute_limit_usd`. */
  amountUsd: number
}

export type AutoExecuteDecision =
  | { allowed: true }
  | {
      allowed: false
      reason:
        | 'consent_disabled'
        | 'amount_over_limit'
        | 'action_not_in_allowlist'
        | 'borrow_never_auto'
        | 'invalid_amount'
      message: string
    }

/**
 * Actions that are NEVER auto-executed regardless of the user's allow-list.
 * Hard-coded here so a mis-configured profile can't bypass it. Borrow has
 * liquidation risk; adjust_strategy bundles multiple txs so the cumulative
 * cost can exceed the per-tx limit.
 */
// Actions that are hard-coded out of the auto-execute silent path.
// - borrow / adjust_strategy / rebalance: liquidation / cost risk; always confirm
// - cross-chain_supply: requires Biconomy MEE handoff that doesn't run silently
//   from the agent's execute route yet (Phase F6 will add session-backed MEE
//   execution). Until then, cross-chain actions always go through the
//   click-confirm dialog so the user's explicit confirmation routes through
//   the existing /app Biconomy adapter.
const NEVER_AUTO_ALLOWED = new Set<string>([
  'borrow',
  'adjust_strategy',
  'rebalance',
  'cross-chain_supply',
])

export function shouldAutoExecute(
  profile: AutoExecuteProfile | null | undefined,
  intent: AutoExecuteIntent,
): AutoExecuteDecision {
  if (NEVER_AUTO_ALLOWED.has(intent.actionType)) {
    return {
      allowed: false,
      reason: 'borrow_never_auto',
      message: 'This action always requires your confirmation.',
    }
  }

  if (!profile?.auto_execute_enabled) {
    return {
      allowed: false,
      reason: 'consent_disabled',
      message: 'Auto-confirm is turned off in your settings.',
    }
  }

  if (
    typeof intent.amountUsd !== 'number' ||
    !Number.isFinite(intent.amountUsd) ||
    intent.amountUsd < 0
  ) {
    return {
      allowed: false,
      reason: 'invalid_amount',
      message: 'Amount must be a positive number.',
    }
  }

  const limit = Number(profile.auto_execute_limit_usd ?? 0)
  if (!Number.isFinite(limit) || limit <= 0) {
    return {
      allowed: false,
      reason: 'consent_disabled',
      message: 'Auto-confirm is turned off in your settings.',
    }
  }

  if (intent.amountUsd > limit) {
    return {
      allowed: false,
      reason: 'amount_over_limit',
      message: `This action exceeds your auto-confirm limit of $${limit.toFixed(2)}.`,
    }
  }

  const allowed = profile.auto_execute_actions ?? []
  if (allowed.length > 0 && !allowed.includes(intent.actionType)) {
    return {
      allowed: false,
      reason: 'action_not_in_allowlist',
      message: 'This action type is not in your auto-confirm list.',
    }
  }

  return { allowed: true }
}

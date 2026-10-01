/**
 * Pure-function labels + status predicates for the Action Timeline.
 *
 * Extracted from `action-timeline.ts` so client components can import them
 * without pulling in `@/lib/database` (which is server-only). Keeps the
 * wording single-sourced across the system prompt, SSE labels, and UI.
 */

export type ActionStatus =
  | 'proposed'
  | 'signing'
  | 'pending'
  | 'bridging'
  | 'executing'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'timeout'

export const TERMINAL_STATUSES: readonly ActionStatus[] = [
  'succeeded',
  'failed',
  'cancelled',
  'timeout',
] as const

export const ACTIVE_STATUSES: readonly ActionStatus[] = [
  'proposed',
  'signing',
  'pending',
  'bridging',
  'executing',
] as const

export function statusLabel(status: ActionStatus | string): string {
  switch (status) {
    case 'proposed':  return 'Ready to confirm'
    case 'signing':   return 'Waiting for your wallet'
    case 'pending':   return 'Submitting your request'
    case 'bridging':  return 'Moving your funds'
    case 'executing': return 'Almost there'
    case 'succeeded': return 'Done'
    case 'failed':    return 'Failed'
    case 'cancelled': return 'Cancelled'
    case 'timeout':   return 'Timed out'
    default:          return String(status)
  }
}

export function isTerminal(status: ActionStatus | string): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(status)
}

export function isActive(status: ActionStatus | string): boolean {
  return (ACTIVE_STATUSES as readonly string[]).includes(status)
}

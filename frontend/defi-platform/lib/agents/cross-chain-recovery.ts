/**
 * Cross-chain ACK recovery — pure helper.
 *
 * Background: `useAgentExecution` dispatches `peridot:agent-cross-chain` with
 * a 2s timeout waiting for `peridot:agent-cross-chain-ack`. If the listener
 * (AgentCrossChainListener) is mounted it ACKs synchronously, so the happy
 * path is instant. But there are three cases where the ACK never lands:
 *
 *   (a) Listener isn't mounted yet — event fires into nothing. Action stays
 *       at `proposed` forever; the user's click did nothing.
 *   (b) Listener IS mounted, ACK fired, but the browser was too busy to
 *       deliver the CustomEvent within the 2s window. The listener then
 *       proceeds with biconomyAdapter.startSupply() and the action DOES
 *       execute. Without recovery the hook would throw "bridge handler
 *       not available" while the real tx is in flight.
 *   (c) Listener received + ACKed + started + already transitioned to
 *       `succeeded` / `failed` before we checked. We should show the
 *       correct terminal state, not a generic timeout error.
 *
 * This helper polls /api/agents/timeline/action?token=<confirmationToken>
 * for up to `attempts * intervalMs` milliseconds and returns the timeline
 * state. The caller decides what to do:
 *   - status is still 'proposed' → listener never ran (a). Throw.
 *   - status is 'signing'/'pending'/'bridging'/'executing' → case (b).
 *     Proceed to wait for the final outcome events.
 *   - status is 'succeeded'/'failed'/... → case (c). Skip directly.
 */

export type RecoveryStatus =
  | 'proposed'
  | 'signing'
  | 'pending'
  | 'bridging'
  | 'executing'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'timeout'

export interface RecoveryState {
  status: RecoveryStatus
  primaryHash: string | null
  errorMessage: string | null
  terminal: boolean
}

export interface RecoverCrossChainInput {
  confirmationToken: string
  /** Async fn that resolves the Privy bearer token; `null` = skip. */
  getAuthBearer: () => Promise<string | null>
  /** Number of polls. Default 5. */
  attempts?: number
  /** Wait between polls in ms. Default 500. */
  intervalMs?: number
  /** Injected for tests — defaults to global fetch. */
  fetchFn?: typeof fetch
  /** Injected for tests — defaults to setTimeout-based sleep. */
  sleepFn?: (ms: number) => Promise<void>
}

const DEFAULT_ATTEMPTS = 5
const DEFAULT_INTERVAL_MS = 500

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Poll the Timeline endpoint until the action is no longer in `proposed`
 * status (listener started) or until we run out of attempts.
 *
 * Returns `null` only if every poll came back as still-`proposed` (or if all
 * polls errored). Any observed non-proposed state short-circuits and returns
 * immediately — including terminal states.
 */
export async function recoverCrossChainState(
  input: RecoverCrossChainInput,
): Promise<RecoveryState | null> {
  const {
    confirmationToken,
    getAuthBearer,
    attempts = DEFAULT_ATTEMPTS,
    intervalMs = DEFAULT_INTERVAL_MS,
    fetchFn = globalThis.fetch,
    sleepFn = defaultSleep,
  } = input

  if (!confirmationToken) return null

  for (let i = 0; i < attempts; i++) {
    // Wait BEFORE the first poll too — the ACK already timed out, giving
    // the listener a bit more time before we hit the database is the whole
    // point of this helper.
    await sleepFn(intervalMs)

    try {
      const bearer = await getAuthBearer()
      if (!bearer) continue

      const res = await fetchFn(
        `/api/agents/timeline/action?token=${encodeURIComponent(confirmationToken)}`,
        {
          headers: { Authorization: `Bearer ${bearer}` },
          cache: 'no-store',
        },
      )

      if (!res.ok) continue

      const data = (await res.json()) as {
        status?: RecoveryStatus
        primaryHash?: string | null
        errorMessage?: string | null
        terminal?: boolean
      }

      if (!data.status) continue

      // Still stuck at proposed — listener hasn't picked up the event.
      // Keep polling until attempts run out.
      if (data.status === 'proposed') continue

      return {
        status: data.status,
        primaryHash: data.primaryHash ?? null,
        errorMessage: data.errorMessage ?? null,
        terminal: data.terminal === true,
      }
    } catch {
      // Network hiccup — keep trying.
    }
  }

  return null
}

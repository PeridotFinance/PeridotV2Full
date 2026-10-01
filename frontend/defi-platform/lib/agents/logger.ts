/**
 * Structured logger for agent-side code paths.
 *
 * Goal: when a user reports "Perry did the wrong thing", we can grep one
 * ID and get the full story across tool-executor / status-poller /
 * listeners / SSE. Before this module, logs looked like:
 *
 *   [tool-executor] tool threw { tool: 'execute_withdraw', ... }
 *   [action-timeline] createAction failed: ...
 *   [agents/execute PATCH] timeline transition skipped: ...
 *
 * No correlation key. Stuck-action diagnosis required cross-referencing
 * timestamps in Postgres. Now every log emits a JSON line with a stable
 * `actionId` / `userAddress` / `traceId` so `grep "action-id" logs.jsonl`
 * returns the whole timeline.
 *
 * Deliberately small: no external deps, no log-level toggles, no rotation.
 * Just structured console.{log,warn,error} with a consistent shape that
 * downstream tooling (Datadog, CloudWatch, grep) can pipeline.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogContext {
  /** agent_actions.id — primary correlation key. */
  actionId?: string
  /** ERC-20 / Privy-resolved EVM address (lowercase). */
  userAddress?: string
  /** Conversation or request scope — when available. */
  conversationId?: string
  /** Stable ID for a tool-call round-trip (HTTP req ↔ tool ↔ response). */
  traceId?: string
  /** The tool name when the log happens inside a tool execution. */
  tool?: string
  /** Free-form extras — keep keys stable across a single code path. */
  [key: string]: unknown
}

/**
 * Root logger. Prefix appears in the `source` field so Datadog-style
 * filters can narrow by subsystem without caring about the message text.
 */
export function createLogger(source: string) {
  const emit = (level: LogLevel, message: string, context: LogContext = {}) => {
    const record = {
      ts: new Date().toISOString(),
      level,
      source,
      message,
      ...context,
    }
    // eslint-disable-next-line no-console
    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
    // One line per record so log shippers pick it up cleanly. Compact JSON
    // (no indent) keeps the line short.
    try {
      fn(JSON.stringify(record))
    } catch {
      // Non-serialisable context — fall back to a string concat so we at
      // least see something.
      fn(`${record.ts} [${source}] ${level}: ${message}`)
    }
  }

  return {
    debug: (message: string, context?: LogContext) => emit('debug', message, context),
    info: (message: string, context?: LogContext) => emit('info', message, context),
    warn: (message: string, context?: LogContext) => emit('warn', message, context),
    error: (message: string, context?: LogContext) => emit('error', message, context),
    /** Bind a fixed context (e.g. `{ actionId }`) once, reuse on every call. */
    with(bound: LogContext) {
      return createLogger(source).withContext(bound)
    },
    /** Same as `with`, kept for internal chaining. */
    withContext(bound: LogContext) {
      return {
        debug: (message: string, context?: LogContext) =>
          emit('debug', message, { ...bound, ...context }),
        info: (message: string, context?: LogContext) =>
          emit('info', message, { ...bound, ...context }),
        warn: (message: string, context?: LogContext) =>
          emit('warn', message, { ...bound, ...context }),
        error: (message: string, context?: LogContext) =>
          emit('error', message, { ...bound, ...context }),
      }
    },
  }
}

/**
 * Generate a short trace ID for a single operation / request. Not
 * cryptographic — just collision-resistant across a user's flow. Ten
 * base36 characters is enough (~36^10 ≈ 3.7e15) given any single
 * correlation window is <1 minute.
 */
export function newTraceId(): string {
  const rand = Math.random().toString(36).slice(2, 8)
  const ts = Date.now().toString(36).slice(-6)
  return `${ts}${rand}`
}

/** Convenience pre-baked loggers for the common agent subsystems. */
export const toolExecutorLog = createLogger('tool-executor')
export const timelineLog = createLogger('action-timeline')
export const pollerLog = createLogger('status-poller')
export const listenerLog = createLogger('cross-chain-listener')
export const sseLog = createLogger('activity-stream')
export const executeRouteLog = createLogger('execute-route')
export const closureLog = createLogger('closure-message')

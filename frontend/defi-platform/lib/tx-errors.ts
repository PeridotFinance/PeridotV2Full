// Single source of truth for turning raw wallet / RPC / contract errors into
// short, consumer-safe copy.
//
// Every surface that shows a transaction error (EasyCardDev, DepositSheet, and
// the useEasySupply hook itself) routes through here so a raw viem error blob —
// which reads like a stack trace and can leak the RPC URL *including its API
// key* — never reaches a fintech-grade UI. The rule is simple: if it isn't a
// recognised, human-friendly message, it becomes the generic fallback.

const GENERIC = 'Something went wrong. Please try again.'

/**
 * Map any raw error string onto safe, consumer-friendly copy.
 * Returns `null` only for empty input (so callers can hide the row entirely);
 * any non-empty, unrecognised input collapses to the generic fallback rather
 * than leaking machine detail.
 */
export function friendlyTxError(input: string | null | undefined): string | null {
  if (!input) return null
  const msg = String(input).trim()
  if (!msg) return null
  const lower = msg.toLowerCase()

  // ── User-initiated cancellation — not an alarming "error" ──────────────────
  if (
    lower.includes('user rejected') ||
    lower.includes('user denied') ||
    lower.includes('rejected by user') ||
    lower.includes('request rejected')
  ) {
    return 'Cancelled.'
  }

  // ── Balance / fee shortfalls ───────────────────────────────────────────────
  if (lower.includes('insufficient funding amount')) {
    return 'Amount too low for this route — try a larger amount.'
  }
  if (lower.includes('not enough eoa balance') || lower.includes('pay orchestration fee')) {
    return 'Balance is too tight to cover the network fee. Add funds to keep going.'
  }
  if (
    lower.includes('insufficient_for_fee_budget') ||
    lower.includes('insufficient balance') ||
    lower.includes('insufficient funds')
  ) {
    return 'Not enough balance to cover this deposit.'
  }
  if (lower.includes('route not found') || lower.includes('biconomy_route_not_found')) {
    return 'Deposit route unavailable — try a different amount or asset.'
  }

  // ── Transient infrastructure issues ────────────────────────────────────────
  if (lower.includes('rate limit') || lower.includes('too many requests')) {
    return 'Too many requests right now — wait a moment, then try again.'
  }
  if (lower.includes('timeout') || lower.includes('timed out')) {
    return 'This took too long. Check your connection and try again.'
  }

  // ── Catch-all ──────────────────────────────────────────────────────────────
  // Anything that looks like a raw machine error — JSON blobs, RPC URLs (which
  // may carry an API key), viem version banners, "Contract Call" / "Request
  // Arguments" dumps, RPC capability mismatches, or just very long strings — is
  // replaced wholesale. This is the line of defence that keeps unmapped errors
  // (e.g. Alchemy "Unsupported method wallet_sendTransaction") out of the UI.
  if (
    msg.includes('{') ||
    msg.includes('}') ||
    /https?:\/\//i.test(msg) ||
    /viem@/i.test(msg) ||
    lower.includes('request arguments') ||
    lower.includes('contract call') ||
    lower.includes('contractfunctionexecutionerror') ||
    lower.includes('execution reverted') ||
    lower.includes('unsupported method') ||
    lower.includes('wallet_sendtransaction') ||
    lower.includes('method not found') ||
    lower.includes('timestamp') ||
    msg.length > 120
  ) {
    return GENERIC
  }

  return msg
}

/** Same as {@link friendlyTxError} but never returns null — handy at render time. */
export function friendlyTxErrorOrGeneric(input: string | null | undefined): string {
  return friendlyTxError(input) ?? GENERIC
}

/**
 * What went wrong with a cross-chain transfer, in words a user can act on.
 *
 * SODAX answers with solver-speak ("getQuote failed: No path was found between
 * 0x72e8… and 0x3480…"). The proxy routes run every failure through
 * `classifyXcError` and send `{ error: code, message }`, so a component only
 * ever shows `message` and branches on `code`. Pure, so the server and the
 * browser share it.
 */
import { XC_MIN_USD } from "@/lib/crosschain/route"

export type XcErrorCode =
  | "amount_too_low"
  | "no_path"
  | "over_cap"
  | "user_rejected"
  | "insufficient_funds"
  | "no_trustline"
  | "unsupported"
  | "disabled"
  | "rate_limited"
  | "unavailable"
  | "unknown"

export interface XcError {
  code: XcErrorCode
  message: string
  /** Trying the same thing again later can work. */
  retryable: boolean
}

const MESSAGES: Record<XcErrorCode, string> = {
  amount_too_low: `Minimum is $${XC_MIN_USD}.`,
  no_path: "Too large for one transfer. Try a smaller amount.",
  over_cap: "Above the current limit per transfer.",
  user_rejected: "Cancelled in the wallet. Nothing was sent.",
  insufficient_funds: "Not enough balance for this amount and the network fee.",
  no_trustline: "Your Stellar wallet cannot receive USDC yet.",
  unsupported: "This route is not available.",
  disabled: "Transfers between networks are paused. Anything already on its way still arrives.",
  rate_limited: "Too many requests. Wait a moment and try again.",
  unavailable: "The route service is not answering. Try again in a moment.",
  unknown: "Something went wrong. Nothing was sent.",
}

export function xcError(code: XcErrorCode, message?: string): XcError {
  return {
    code,
    message: message ?? MESSAGES[code],
    retryable: code === "rate_limited" || code === "unavailable" || code === "unknown",
  }
}

function messageOf(e: unknown): string {
  if (e instanceof Error) return e.message
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message)
  return String(e ?? "")
}

function statusOf(e: unknown): number | null {
  if (e && typeof e === "object" && "status" in e) {
    const s = Number((e as { status: unknown }).status)
    return Number.isFinite(s) ? s : null
  }
  return null
}

/** A wallet popup closed or refused, on any of the wallets we sign with. */
export function isUserRejection(e: unknown): boolean {
  const code = e && typeof e === "object" && "code" in e ? (e as { code: unknown }).code : undefined
  if (code === 4001 || code === "ACTION_REJECTED") return true
  return /user rejected|user denied|rejected the request|denied transaction|user cancell?ed|request cancell?ed|user declined|user closed/i.test(messageOf(e))
}

/**
 * Map a thrown value (a `SodaxApiError`, a wallet error, a fetch failure) to a
 * code and the copy to show. Checked from the most specific signal down.
 */
export function classifyXcError(e: unknown): XcError {
  if (isUserRejection(e)) return xcError("user_rejected")
  const msg = messageOf(e)
  if (/input amount too low/i.test(msg)) return xcError("amount_too_low")
  if (/no path was found/i.test(msg)) return xcError("no_path")
  if (/insufficient funds|exceeds balance|insufficient balance|op_underfunded/i.test(msg)) {
    return xcError("insufficient_funds")
  }
  if (/trustline|op_no_trust/i.test(msg)) return xcError("no_trustline")
  const status = statusOf(e)
  if (status === 429 || /too many requests/i.test(msg)) return xcError("rate_limited")
  if ((status !== null && status >= 500) || /fetch failed|timeout|timed out|network error|aborted/i.test(msg)) {
    return xcError("unavailable")
  }
  return xcError("unknown")
}

export interface SodaxFailureLike {
  failedAtStep?: string
  failureReason?: string
  userMessage?: string
  intentCancelled?: boolean
}

/**
 * The line stored in `fail_reason` for a transfer SODAX gave up on. When the
 * intent was cancelled the input went back to the wallet it came from, and the
 * user needs to hear that more than they need the step name.
 */
export function describeSodaxFailure(s: SodaxFailureLike, returnedTo: string): string {
  const detail = [s.userMessage, s.failureReason, s.failedAtStep && `step ${s.failedAtStep}`]
    .filter(Boolean)
    .join(" · ")
  const head = s.intentCancelled
    ? `This didn't go through. Your money is back in ${returnedTo}.`
    : "This didn't go through. Support is looking at it."
  return detail ? `${head} (${detail})` : head
}

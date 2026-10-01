/**
 * Pure, framework-free validation + formatting helpers for the send-tokens flow.
 * Kept side-effect free so they can be unit-tested in isolation
 * (see tests/send-validation.test.ts).
 */
import { isAddress, parseUnits } from 'viem'

export type SendKind = 'evm' | 'stellar'

/** A Stellar account address: `G` followed by 55 base32 chars. */
export const STELLAR_ACCOUNT_RE = /^G[A-Z2-7]{55}$/

/** True when `address` is a well-formed recipient for the given chain family. */
export function isValidRecipient(kind: SendKind, address: string): boolean {
  const a = (address || '').trim()
  if (!a) return false
  return kind === 'stellar' ? STELLAR_ACCOUNT_RE.test(a) : isAddress(a)
}

export interface AmountCheck {
  /** True when the amount is a sendable, in-range value. */
  valid: boolean
  /** A user-facing error, or `null` when the field is empty / valid. */
  error: string | null
}

/**
 * Validates a human-readable amount against a token's decimals and raw balance.
 * An empty input is treated as "not yet valid" without an error message.
 */
export function validateSendAmount(
  amount: string,
  decimals: number,
  balanceRaw: bigint,
): AmountCheck {
  const a = (amount || '').trim()
  if (a === '') return { valid: false, error: null }

  let parsed: bigint
  try {
    parsed = parseUnits(a, decimals)
  } catch {
    return { valid: false, error: 'Enter a valid amount.' }
  }
  if (parsed <= BigInt(0)) return { valid: false, error: 'Amount must be greater than 0.' }
  if (parsed > balanceRaw) return { valid: false, error: 'More than your available balance.' }
  return { valid: true, error: null }
}

// ─── Stellar memos ──────────────────────────────────────────────────────────

/**
 * How a memo is encoded on the transaction. Exchanges publish one or the other
 * next to their deposit address — a text memo sent where an id is expected (or
 * vice versa) can leave the deposit uncredited.
 */
export type MemoType = 'text' | 'id'

/** Stellar `MEMO_TEXT` is capped at 28 bytes by the protocol. */
export const MEMO_TEXT_MAX_BYTES = 28

/** `MEMO_ID` is an unsigned 64-bit integer. */
export const MEMO_ID_MAX = BigInt('18446744073709551615')

/** UTF-8 byte length — what Stellar's 28-byte memo limit actually counts. */
export function memoByteLength(memo: string): number {
  return new TextEncoder().encode(memo).length
}

/**
 * Validates a memo for the chosen encoding. An empty memo is always valid —
 * most transfers don't need one; whether one is *required* is the recipient
 * check's job (SEP-29), not this function's.
 */
export function validateMemo(type: MemoType, memo: string): AmountCheck {
  const m = memo || ''
  if (m.trim() === '') return { valid: true, error: null }

  if (type === 'id') {
    if (!/^\d+$/.test(m.trim())) {
      return { valid: false, error: 'An ID memo must be digits only.' }
    }
    if (BigInt(m.trim()) > MEMO_ID_MAX) {
      return { valid: false, error: 'That ID is too large.' }
    }
    return { valid: true, error: null }
  }

  // Text memos are byte-limited, and we never truncate: a truncated memo is
  // still a valid memo, so it would credit the wrong account rather than fail.
  const bytes = memoByteLength(m)
  if (bytes > MEMO_TEXT_MAX_BYTES) {
    return {
      valid: false,
      error: `Too long — ${bytes} of ${MEMO_TEXT_MAX_BYTES} characters allowed.`,
    }
  }
  return { valid: true, error: null }
}

/** Compact, locale-aware display formatting for token amounts. */
export function formatSendAmount(value: string | number): string {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n === 0) return '0'
  if (n < 0.0001) return '<0.0001'
  if (n >= 1_000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 })
  if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 4 })
  return n.toLocaleString(undefined, { maximumFractionDigits: 6 })
}

/** Shortens a long address to `0x1234…cdef` form for display. */
export function shortenAddress(addr: string): string {
  const a = (addr || '').trim()
  if (a.length <= 12) return a
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

/** Maps a raw wallet/RPC error from an EVM send into an actionable message. */
export function friendlyEvmError(msg: string): string {
  const m = msg || ''
  if (/reject|denied|declined|cancell/i.test(m)) return 'The transaction was cancelled.'
  if (/insufficient/i.test(m)) return 'Not enough balance to complete this transfer.'
  return m || 'An unknown error occurred.'
}

/** Maps a raw Stellar/Soroban error into a message a non-technical user can act on. */
export function friendlyStellarError(msg: string): string {
  const m = msg || ''
  if (/reject|denied|declined|cancell/i.test(m)) return 'The transaction was cancelled.'
  if (/trust ?line/i.test(m)) {
    return "The recipient can't accept this asset — they're missing a trustline for it."
  }
  if (/insufficient|underfunded|balance/i.test(m)) {
    return 'Not enough balance to complete this transfer.'
  }
  if (/not.?found|getAccount/i.test(m)) {
    return "The recipient account doesn't exist yet on the Stellar network."
  }
  return m || 'An unknown error occurred.'
}

export type TxAction = 'supply' | 'borrow' | 'repay' | 'withdraw'

export interface TxUpdatePayload {
  action: TxAction
  step: string
  statusMessage?: string
  txHash?: string
}

export function emitTxUpdate(update: TxUpdatePayload) {
  try { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('peridot:tx-update', { detail: update })) } catch {}
}

export function emitTxActive() {
  try { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('peridot:tx-active')) } catch {}
}

// Removed emitCcDialogOpen - now using unified tx-update events

export type RetryHandler = (step: string | null) => void
export type CheckStatusHandler = (step: string | null, txHash?: string | null) => void

export function attachScopedRetryListeners(action: TxAction, onRetry: RetryHandler, onCheckStatus?: CheckStatusHandler) {
  const retry = (ev: any) => {
    const a = ev?.detail?.action
    if (a && String(a) !== action) return
    try { onRetry(ev?.detail?.step ?? null) } catch {}
  }
  const check = (ev: any) => {
    const a = ev?.detail?.action
    if (a && String(a) !== action) return
    try { onCheckStatus?.(ev?.detail?.step ?? null, ev?.detail?.txHash) } catch {}
  }
  try { window.addEventListener('peridot:tx-retry', retry as any) } catch {}
  try { window.addEventListener('peridot:tx-check-status', check as any) } catch {}
  return () => {
    try { window.removeEventListener('peridot:tx-retry', retry as any) } catch {}
    try { window.removeEventListener('peridot:tx-check-status', check as any) } catch {}
  }
}

export function mapFriendlyError(raw: string): string | null {
  const s = String(raw || '')
  if (/user rejected/i.test(s)) return 'User rejected the transaction. Please try again.'
  if (/rate limited|rate\s*limit/i.test(s)) return 'Temporarily rate limited. Please wait 30–60 seconds, then try again.'
  if (/wallet timeout|timeout/i.test(s)) return 'Transaction timed out. Please check your connection and try again.'
  if (/arithmetic underflow|arithmetic overflow|0x4e487b71|panic code 0x11/i.test(s)) return 'Amount is too large relative to pool cash or precision. Try a slightly smaller amount or use MAX.'
  if (/insufficient funds/i.test(s)) return 'Insufficient wallet balance for this transaction.'
  if (/replacement transaction underpriced/i.test(s)) return 'Replacement transaction underpriced. Increase gas or wait before retrying.'
  
  // Handle JSON-RPC errors
  if (/internal json-rpc error/i.test(s)) {
    return 'Network error occurred. This is usually temporary - please wait a moment and try again.'
  }
  
  // Handle contract function execution errors
  if (/contract function.*reverted/i.test(s)) {
    return 'Transaction failed due to contract conditions. This could be due to insufficient liquidity, market restrictions, or network congestion. Please try again in a few moments.'
  }
  
  // Handle mint function specific errors
  if (/mint.*reverted/i.test(s)) {
    return 'Supply transaction failed. This could be due to insufficient liquidity in the market or network congestion. Please try again with a smaller amount or wait a few moments.'
  }
  
  return null
}


// Lightweight helper to unify transient rate-limit detection without duplicating regexes across hooks
export function isRateLimit(raw: unknown): boolean {
  const s = String(raw || '')
  return /rate limited|rate\s*limit/i.test(s)
}

// Detect arithmetic underflow/overflow (e.g., 0x4e487b71 panic code 0x11)
export function isArithmeticUnderOverflow(raw: unknown): boolean {
  const s = String(raw || '')
  return /arithmetic underflow|arithmetic overflow|0x4e487b71|panic code 0x11/i.test(s)
}

// Detect wallet/RPC timeout errors
export function isTimeoutError(raw: unknown): boolean {
  const s = String(raw || '')
  return /wallet timeout|timeout|An unknown RPC error occurred.*timeout/i.test(s)
}

// Detect JSON-RPC errors (usually temporary network issues)
export function isJsonRpcError(raw: unknown): boolean {
  const s = String(raw || '')
  return /internal json-rpc error|json-rpc error|rpc error/i.test(s)
}

// Detect contract execution errors (business logic failures)
export function isContractExecutionError(raw: unknown): boolean {
  const s = String(raw || '')
  return /contract function.*reverted|execution reverted|mint.*reverted/i.test(s)
}

// Check if an error is retryable (temporary issues that might resolve)
export function isRetryableError(raw: unknown): boolean {
  const s = String(raw || '')
  return isJsonRpcError(s) || isRateLimit(s) || isTimeoutError(s)
}

// Get retry delay based on error type and attempt number
export function getRetryDelay(error: string, attempt: number): number {
  const baseDelay = 1000 // 1 second base delay
  
  if (isRateLimit(error)) {
    // Rate limits need longer delays
    return Math.min(baseDelay * Math.pow(2, attempt), 60000) // Max 60 seconds
  }
  
  if (isJsonRpcError(error)) {
    // JSON-RPC errors are usually quick to resolve
    return Math.min(baseDelay * attempt, 10000) // Max 10 seconds
  }
  
  if (isTimeoutError(error)) {
    // Timeouts need moderate delays
    return Math.min(baseDelay * Math.pow(1.5, attempt), 30000) // Max 30 seconds
  }
  
  // Default exponential backoff
  return Math.min(baseDelay * Math.pow(2, attempt), 30000)
}



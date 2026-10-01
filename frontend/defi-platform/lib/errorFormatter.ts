// Minimal, centralized error formatting for user-facing messages

export function formatUserFacingError(raw: unknown): string {
  const isProd = process.env.NODE_ENV === 'production'
  const text = normalizeToString(raw)

  // Known concise cases first
  if (/INSUFFICIENT_LIQUIDITY/i.test(text)) return 'Not enough liquidity to complete this action.'
  if (/INSUFFICIENT_BALANCE/i.test(text)) return 'Insufficient balance.'
  if (/ALLOWANCE|INSUFFICIENT_ALLOWANCE/i.test(text)) return 'Approval required or allowance too low.'
  if (/PRICE_ERROR|ORACLE/i.test(text)) return 'Price oracle issue. Please try again later.'
  if (/UNAUTHORIZED|REJECTION/i.test(text)) return 'Action not authorized.'
  if (/revert/i.test(text) && /borrow/i.test(text)) return 'Borrow failed. Check collateral and limits.'
  if (/revert/i.test(text) && /mint|supply/i.test(text)) return 'Supply failed. Please try again.'
  if (/revert/i.test(text) && /repay/i.test(text)) return 'Repay failed. Please try again.'
  if (/revert/i.test(text) && /redeem|withdraw/i.test(text)) return 'Withdraw failed. Please try again.'

  // viem / userOp long errors → compress
  if (/UserOperation reverted|AA23|validateUserOp/i.test(text)) {
    return 'Smart account validation failed. Try a smaller amount or retry shortly.'
  }

  // Wallet/RPC timeout errors → specific handling
  if (/wallet timeout|timeout/i.test(text)) {
    return 'Transaction timed out. Please check your connection and try again.'
  }

  // General RPC noise → collapse
  if (/An unknown RPC error occurred|Request Arguments:|Contract Call:|Version: viem@/i.test(text)) {
    return 'Network error occurred. Please retry.'
  }

  // If we have a short, readable message already, pass it through
  const trimmed = text.trim()
  if (trimmed.length > 0 && trimmed.length <= 140 && !/0x[0-9a-fA-F]{32,}/.test(trimmed)) {
    return trimmed
  }

  // Fallbacks
  if (isProd) return 'Something went wrong. Please try again.'

  // Dev: include a compact slice for debugging
  return sliceForDev(trimmed)
}

function normalizeToString(err: unknown): string {
  if (typeof err === 'string') return err
  if (err instanceof Error) return err.message || String(err)
  try { return JSON.stringify(err) } catch { return String(err) }
}

function sliceForDev(s: string): string {
  // Keep the first 220 chars to avoid flooding UI, hint that it was truncated
  const max = 220
  if (s.length <= max) return s
  return s.slice(0, max) + '…'
}



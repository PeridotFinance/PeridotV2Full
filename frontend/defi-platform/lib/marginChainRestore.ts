/**
 * marginChainRestore.ts
 *
 * Lightweight, pure-function helpers for recording and restoring the wallet
 * chain that was active before a user switched to the Somnia margin-trading
 * network. Stored in sessionStorage so that it survives in-tab page reloads
 * but is automatically discarded when the browser session ends.
 *
 * Usage pattern:
 *   1. Call `recordPreMarginChain(chainId)` BEFORE initiating a
 *      wallet_switchEthereumChain to Somnia in use-margin-account.ts.
 *   2. Call `useRestorePreMarginChain()` (see hooks/) on the /app page to
 *      silently switch the wallet back once the user returns.
 *   3. Call `clearPreMarginChain()` whenever the user explicitly selects a
 *      network in the NetworkSwitcher so their intent is respected.
 */

const SESSION_KEY = 'peridot:pre-margin-chainId'

/** Persist the chain the user was on before entering margin mode. */
export function recordPreMarginChain(chainId: number): void {
  if (!chainId || Number.isNaN(chainId)) return
  try {
    sessionStorage.setItem(SESSION_KEY, String(chainId))
  } catch {
    // sessionStorage can be blocked (private mode, storage full) — safe to ignore.
  }
}

/** Return the stored pre-margin chainId, or null if none is recorded. */
export function getPreMarginChainId(): number | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const id = Number(raw)
    return Number.isNaN(id) ? null : id
  } catch {
    return null
  }
}

/** Remove the stored record (call after a successful restore or on explicit user selection). */
export function clearPreMarginChain(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY)
  } catch {}
}

// Centralized tracking for dismissed transaction dialogs
// Prevents auto-reopening of dialogs that users have explicitly closed
// Follows codebase patterns for localStorage operations and SSR safety

const DISMISSED_TX_STORAGE_KEY = 'peridot:dismissed-tx-hashes'

interface DismissedTransactionRecord {
  txHash: string
  dismissedAt: number
  assetId?: string
  walletAddress?: string
}

/**
 * Check if a transaction hash has been dismissed by the user
 */
export function isTransactionDismissed(txHash: string): boolean {
  if (typeof window === 'undefined') return false
  
  try {
    const raw = localStorage.getItem(DISMISSED_TX_STORAGE_KEY)
    if (!raw) return false
    
    const dismissed: DismissedTransactionRecord[] = JSON.parse(raw)
    return dismissed.some(record => record.txHash === txHash)
  } catch {
    return false
  }
}

/**
 * Mark a transaction as dismissed by the user
 */
export function markTransactionDismissed(txHash: string, assetId?: string, walletAddress?: string): void {
  if (typeof window === 'undefined') return
  
  try {
    const raw = localStorage.getItem(DISMISSED_TX_STORAGE_KEY)
    const dismissed: DismissedTransactionRecord[] = raw ? JSON.parse(raw) : []
    
    // Remove any existing record for this txHash to avoid duplicates
    const filtered = dismissed.filter(record => record.txHash !== txHash)
    
    // Add new dismissal record
    const newRecord: DismissedTransactionRecord = {
      txHash,
      dismissedAt: Date.now(),
      assetId,
      walletAddress: walletAddress?.toLowerCase()
    }
    
    filtered.push(newRecord)
    
    // Clean up old records (older than 7 days) to prevent localStorage bloat
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000)
    const cleaned = filtered.filter(record => record.dismissedAt > sevenDaysAgo)
    
    localStorage.setItem(DISMISSED_TX_STORAGE_KEY, JSON.stringify(cleaned))
    
    // Emit event for any components that need to react to dismissal
    try {
      window.dispatchEvent(new CustomEvent('peridot:tx-dismissed', { 
        detail: { txHash, assetId, walletAddress } 
      }))
    } catch {}
  } catch {}
}

/**
 * Clear dismissal state for a transaction (when user retries)
 */
export function clearTransactionDismissed(txHash: string): void {
  if (typeof window === 'undefined') return
  
  try {
    const raw = localStorage.getItem(DISMISSED_TX_STORAGE_KEY)
    if (!raw) return
    
    const dismissed: DismissedTransactionRecord[] = JSON.parse(raw)
    const filtered = dismissed.filter(record => record.txHash !== txHash)
    
    localStorage.setItem(DISMISSED_TX_STORAGE_KEY, JSON.stringify(filtered))
    
    // Emit event for any components that need to react to undismissal
    try {
      window.dispatchEvent(new CustomEvent('peridot:tx-undismissed', { 
        detail: { txHash } 
      }))
    } catch {}
  } catch {}
}

/**
 * Get all dismissed transactions (for debugging/admin purposes)
 */
export function getAllDismissedTransactions(): DismissedTransactionRecord[] {
  if (typeof window === 'undefined') return []
  
  try {
    const raw = localStorage.getItem(DISMISSED_TX_STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

/**
 * Clear all dismissed transactions (for testing/cleanup)
 */
export function clearAllDismissedTransactions(): void {
  if (typeof window === 'undefined') return
  
  try {
    localStorage.removeItem(DISMISSED_TX_STORAGE_KEY)
  } catch {}
}

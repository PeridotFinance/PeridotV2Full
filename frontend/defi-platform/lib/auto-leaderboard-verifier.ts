/**
 * Automatic Leaderboard Verification Utility
 * 
 * This utility automatically submits successful transaction hashes to the leaderboard
 * verification API when users interact with the protocol smart contracts.
 */

import { waitForTransactionReceipt } from 'wagmi/actions'
import { wagmiConfig } from '@/config'
import { Address } from 'viem'
// In-memory guard to prevent duplicate in-flight verification calls per tx
const inflightVerifications = new Set<string>()

// Consolidated verification cache (capped) under a single localStorage key
const VERIFY_LIST_KEY = 'peridot:verifyDone:list'
const MAX_VERIFY_ENTRIES = 200

function readVerifyList(): string[] {
  try {
    if (typeof window === 'undefined') return []
    const raw = window.localStorage.getItem(VERIFY_LIST_KEY)
    if (!raw) return []
    return raw.split(',').filter(Boolean)
  } catch {
    return []
  }
}

function isVerifiedInList(txHash: string): boolean {
  try {
    if (typeof window === 'undefined') return false
    const raw = window.localStorage.getItem(VERIFY_LIST_KEY) || ''
    // Ensure delimiter-wrapped search to avoid substring collisions
    const normalized = `,${raw.replace(/^,|,$/g, '')},`
    return normalized.includes(`,${txHash},`)
  } catch {
    return false
  }
}

function addVerifiedToList(txHash: string): void {
  try {
    if (typeof window === 'undefined') return
    const list = readVerifyList()
    if (!list.includes(txHash)) {
      list.push(txHash)
      if (list.length > MAX_VERIFY_ENTRIES) {
        list.splice(0, list.length - MAX_VERIFY_ENTRIES)
      }
      window.localStorage.setItem(VERIFY_LIST_KEY, list.join(','))
    }
  } catch {
    // ignore
  }
}

function hasVerificationSucceeded(txHash: string): boolean {
  try {
    if (typeof window === 'undefined') return false
    // Prefer consolidated list, but fall back to legacy per-tx key
    if (isVerifiedInList(txHash)) return true
    return window.localStorage.getItem(`peridot:verifyDone:${txHash}`) === 'true'
  } catch {
    return false
  }
}

function markVerificationSucceeded(txHash: string): void {
  try {
    if (typeof window === 'undefined') return
    // Write into consolidated capped list
    addVerifiedToList(txHash)
    // Optionally clean up legacy key to reduce key proliferation
    try { window.localStorage.removeItem(`peridot:verifyDone:${txHash}`) } catch {}
  } catch {
    // ignore
  }
}

export interface AutoVerificationOptions {
  txHash: string
  walletAddress: string
  chainId: number
  actionType?: 'supply' | 'borrow' | 'repay' | 'redeem' | 'cross-chain_supply' | 'cross-chain_borrow' | 'cross-chain_repay' | 'cross-chain_redeem'
  amount?: string
  usdValue?: number
  tokenSymbol?: string
  contractAddress?: string
  overrideChainId?: number
  privyToken?: string
  onSuccess?: (result: any) => void
  onError?: (error: Error) => void
}

/**
 * Automatically verify a transaction in the leaderboard system
 */
export async function autoVerifyTransaction({
  txHash,
  walletAddress,
  chainId,
  actionType,
  amount,
  usdValue,
  tokenSymbol,
  contractAddress,
  overrideChainId,
  privyToken,
  onSuccess,
  onError,
}: AutoVerificationOptions) {
  console.log('Auto-verifying transaction:', { txHash, walletAddress, chainId });

  try {
    // Skip if this tx was already verified successfully in this browser
    if (hasVerificationSucceeded(txHash)) {
      return { success: true, message: 'Already verified (cached)' }
    }

    // Prevent duplicate concurrent calls in the same session
    if (inflightVerifications.has(txHash)) {
      return { success: true, message: 'Verification already in progress' }
    }
    inflightVerifications.add(txHash)

    // Removed: waitForTransactionReceipt from frontend to avoid CSP violations with WalletConnect RPCs.
    // The backend /api/leaderboard/verify endpoint now handles waiting for the transaction to be mined.

    const storedRefCode = sessionStorage.getItem('referralCode');

    const response = await fetch('/api/leaderboard/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(privyToken ? { 'Authorization': `Bearer ${privyToken}` } : {})
      },
      body: JSON.stringify({
        txHash,
        walletAddress,
        chainId: overrideChainId ?? chainId,
        actionType,
        amount,
        usdValue,
        tokenSymbol,
        contractAddress,
        referralCode: storedRefCode,
      }),
    })

    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.error || 'Verification failed')
    }

    console.log('Auto-verification successful:', result)
    // Mark as verified to avoid future duplicate calls from this client
    markVerificationSucceeded(txHash)
    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('peridot:rewards-updated'))
      }
    } catch {}
    onSuccess?.(result)

    return result
  } catch (error) {
    console.error('Auto-verification failed:', error)
    onError?.(error as Error)
    throw error
  } finally {
    // Always clear inflight guard
    inflightVerifications.delete(txHash)
  }
}

/**
 * Create a callback function for transaction hooks that automatically verifies
 * successful transactions in the leaderboard
 */
export function createAutoVerificationCallback(
  walletAddress: string | undefined,
  chainId: number | undefined,
  originalCallback?: () => void
) {
  return (txHash?: string) => {
    // Call the original callback first
    originalCallback?.()

    // Only auto-verify if we have all required data
    if (txHash && walletAddress && chainId) {
      // Run auto-verification in the background, don't block the UI
      autoVerifyTransaction({
        txHash,
        walletAddress,
        chainId,
        onSuccess: (result) => {
          console.log('Transaction automatically verified and added to leaderboard:', result)
        },
        onError: (error) => {
          console.warn('Auto-verification failed (user can still verify manually):', error.message)
        },
      }).catch(() => {
        // Silent fail - user can still verify manually if needed
      })
    }
  }
} 
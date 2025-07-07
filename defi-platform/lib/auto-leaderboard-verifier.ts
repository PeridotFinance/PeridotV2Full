/**
 * Automatic Leaderboard Verification Utility
 * 
 * This utility automatically submits successful transaction hashes to the leaderboard
 * verification API when users interact with the protocol smart contracts.
 */

export interface AutoVerificationOptions {
  txHash: string
  walletAddress: string
  chainId: number
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
  onSuccess,
  onError,
}: AutoVerificationOptions) {
  try {
    console.log('Auto-verifying transaction:', {
      txHash: txHash.slice(0, 10) + '...',
      walletAddress: walletAddress.slice(0, 6) + '...',
      chainId,
    })

    const response = await fetch('/api/leaderboard/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        txHash,
        walletAddress,
        chainId,
      }),
    })

    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.error || 'Verification failed')
    }

    console.log('Auto-verification successful:', result)
    onSuccess?.(result)

    return result
  } catch (error) {
    console.error('Auto-verification failed:', error)
    onError?.(error as Error)
    throw error
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
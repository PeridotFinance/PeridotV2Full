import { useState, useCallback, useEffect } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseUnits, Address } from 'viem'
import { getAssetContractAddresses } from '@/data/market-data'
import combinedAbi from '@/app/abis/combinedAbi.json'
import { autoVerifyTransaction } from '@/lib/auto-leaderboard-verifier'

interface UseRedeemTransactionProps {
  assetId: string
  amount: string
  redeemType: 'pTokens' | 'underlying' // Whether to redeem specific pTokens or underlying amount
  onSuccess?: () => void
  onError?: (error: Error) => void
}

type TransactionStep = 'idle' | 'redeeming' | 'success' | 'error'

export function useRedeemTransaction({
  assetId,
  amount,
  redeemType,
  onSuccess,
  onError,
}: UseRedeemTransactionProps) {
  const { address, chainId } = useAccount()
  const [step, setStep] = useState<TransactionStep>('idle')
  const [error, setError] = useState<string | null>(null)
  const [redeemHash, setRedeemHash] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string>('')

  // Get contract addresses for the asset
  const contractAddresses = chainId ? getAssetContractAddresses(assetId, chainId) : null

  // Check if we have valid contract addresses
  const canRedeem = contractAddresses && contractAddresses.pTokenAddress

  // Parse amount to proper units (18 decimals for underlying tokens, may be different for pTokens)
  const parsedAmount = amount ? parseUnits(amount, 18) : BigInt(0)

  // Write contract hook for redeem transaction
  const { writeContract, isPending, error: writeError, data: redeemData } = useWriteContract()

  // Set hash when transaction data is available
  useEffect(() => {
    if (redeemData) {
      setRedeemHash(redeemData)
    }
  }, [redeemData])

  // Wait for transaction confirmation
  const { isLoading: isConfirming, isSuccess: isTransactionSuccess, error: transactionError } = useWaitForTransactionReceipt({
    hash: redeemHash as `0x${string}`,
  })

  // Handle transaction success/error
  useEffect(() => {
    if (isTransactionSuccess && redeemHash) {
      setStep('success')
      setStatusMessage('Redeem successful! Tokens redeemed.')
      onSuccess?.()

      // Auto-verify redeem transaction in leaderboard
      if (redeemHash && address && chainId) {
        autoVerifyTransaction({
          txHash: redeemHash,
          walletAddress: address,
          chainId,
          onSuccess: (result) => {
            console.log('Redeem transaction automatically verified and added to leaderboard:', result)
          },
          onError: (error) => {
            console.warn('Auto-verification failed (user can still verify manually):', error.message)
          },
        }).catch(() => {
          // Silent fail - user can still verify manually if needed
        })
      }
    }
  }, [isTransactionSuccess, redeemHash, onSuccess, address, chainId])

  useEffect(() => {
    if (transactionError) {
      setStep('error')
      setError(`Transaction failed: ${transactionError.message}`)
      onError?.(transactionError)
    }
  }, [transactionError, onError])

  useEffect(() => {
    if (writeError) {
      setStep('error')
      setError(`Transaction failed: ${writeError.message}`)
      onError?.(writeError)
    }
  }, [writeError, onError])

  const executeRedeem = useCallback(async () => {
    if (!address || !contractAddresses || !amount || parsedAmount <= 0) {
      setError('Invalid parameters for redeem')
      return
    }

    try {
      setError(null)
      setStep('redeeming')
      
      if (redeemType === 'pTokens') {
        // Redeem specific amount of pTokens
        setStatusMessage('Redeeming pTokens for underlying tokens...')
        
        writeContract({
          address: contractAddresses.pTokenAddress as Address,
          abi: combinedAbi,
          functionName: 'redeem',
          args: [parsedAmount], // Amount of pTokens to redeem
        } as any)
        
        setStatusMessage('Transaction submitted. Waiting for confirmation...')
        
      } else {
        // Redeem pTokens to get specific amount of underlying tokens
        setStatusMessage('Redeeming for specific underlying amount...')
        
        writeContract({
          address: contractAddresses.pTokenAddress as Address,
          abi: combinedAbi,
          functionName: 'redeemUnderlying',
          args: [parsedAmount], // Amount of underlying tokens to receive
        } as any)
        
        setStatusMessage('Transaction submitted. Waiting for confirmation...')
      }

    } catch (err: any) {
      console.error('Redeem transaction failed:', err)
      setStep('error')
      setError(err.message || 'Redeem transaction failed')
      onError?.(err)
    }
  }, [address, contractAddresses, amount, parsedAmount, redeemType, writeContract, onSuccess, onError])

  const reset = useCallback(() => {
    setStep('idle')
    setError(null)
    setRedeemHash(null)
    setStatusMessage('')
  }, [])

  const isLoading = isPending || isConfirming

  return {
    executeRedeem,
    isLoading,
    canRedeem,
    error,
    step,
    statusMessage,
    redeemHash,
    reset,
  }
} 
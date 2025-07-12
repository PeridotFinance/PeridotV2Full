import { useState, useCallback, useEffect, useRef } from 'react'
import { useAccount, useWriteContract, useReadContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseUnits, Address, erc20Abi } from 'viem'
import { getAssetContractAddresses } from '@/data/market-data'
import combinedAbi from '@/app/abis/combinedAbi.json'
import { autoVerifyTransaction } from '@/lib/auto-leaderboard-verifier'

interface UseRepayTransactionProps {
  assetId: string
  amount: string
  onSuccess?: () => void
  onError?: (error: Error) => void
}

type TransactionStep = 'idle' | 'checking-allowance' | 'approving' | 'approved' | 'repaying' | 'success' | 'error'

export function useRepayTransaction({
  assetId,
  amount,
  onSuccess,
  onError,
}: UseRepayTransactionProps) {
  const { address, chainId } = useAccount()
  const [step, setStep] = useState<TransactionStep>('idle')
  const [error, setError] = useState<string | null>(null)
  const [approveHash, setApproveHash] = useState<string | null>(null)
  const [repayHash, setRepayHash] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string>('')

  const onErrorRef = useRef(onError);
  useEffect(() => {
      onErrorRef.current = onError;
  });

  // Get contract addresses for the asset
  const contractAddresses = chainId ? getAssetContractAddresses(assetId, chainId) : null

  // Read underlying token decimals
  const { data: underlyingDecimals } = useReadContract({
    address: contractAddresses?.underlyingAddress as `0x${string}`,
    abi: combinedAbi,
    functionName: 'decimals',
    args: [],
    query: {
      enabled: !!contractAddresses?.underlyingAddress,
    }
  })

  // Check if we have valid contract addresses
  const canRepay = contractAddresses && contractAddresses.pTokenAddress && contractAddresses.underlyingAddress

  // Clean and parse amount to proper units
  const cleanAmount = (rawAmount: string): string => {
    if (!rawAmount) return '0'
    // Remove commas and any other formatting characters, keep only numbers and decimal point
    return rawAmount.replace(/[^0-9.]/g, '')
  }
  
  const parsedAmount = amount ? parseUnits(cleanAmount(amount), (underlyingDecimals as number) || 18) : BigInt(0)

  // Read current allowance of underlying token for repayment
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: contractAddresses?.underlyingAddress as Address,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [address!, contractAddresses?.pTokenAddress as Address],
    query: {
      enabled: !!contractAddresses && !!address,
    }
  })

  // Check if approval is needed
  const needsApproval = allowance !== undefined && parsedAmount > (allowance as bigint)

  // Write contract hooks
  const { 
    writeContract: writeApprove,
    isPending: isApprovePending,
    data: approveData,
    error: approveError,
    reset: resetApprove,
  } = useWriteContract()

  const { 
    writeContract: writeRepay,
    isPending: isRepayPending,
    data: repayData,
    error: repayError,
    reset: resetRepay,
  } = useWriteContract()

  // Set hashes when transactions are submitted
  useEffect(() => {
    if (approveData) {
      setApproveHash(approveData)
    }
  }, [approveData])

  useEffect(() => {
    if (repayData) {
      setRepayHash(repayData)
    }
  }, [repayData])

  // Wait for transaction receipts
  const { 
    isLoading: isApprovalConfirming, 
    isSuccess: isApprovalSuccess,
    error: approvalReceiptError 
  } = useWaitForTransactionReceipt({
    hash: approveHash as `0x${string}`,
  })

  const { 
    isLoading: isRepayConfirming, 
    isSuccess: isRepaySuccess,
    error: repayReceiptError 
  } = useWaitForTransactionReceipt({
    hash: repayHash as `0x${string}`,
  })

  // Handle approval success - proceed to repay
  useEffect(() => {
    if (isApprovalSuccess && step === 'approved') {
      refetchAllowance()
      
      // Auto-proceed to repay after approval
      const timer = setTimeout(() => {
        if (contractAddresses && address) {
          setStep('repaying')
          setStatusMessage('Repaying borrowed amount...')
          
          writeRepay({
            address: contractAddresses.pTokenAddress as Address,
            abi: combinedAbi,
            functionName: 'repayBorrow',
            args: [parsedAmount],
          } as any)
        }
      }, 2000) // Give wallet time to process
      
      return () => clearTimeout(timer)
    }
  }, [isApprovalSuccess, step, contractAddresses, writeRepay, parsedAmount, refetchAllowance, address])

  // Handle repay success
  useEffect(() => {
    if (isRepaySuccess && repayHash) {
      setStep('success')
      setStatusMessage('Repay successful! Loan repaid.')
      onSuccess?.()

      // Auto-verify repay transaction in leaderboard
      if (repayHash && address && chainId) {
        autoVerifyTransaction({
          txHash: repayHash,
          walletAddress: address,
          chainId,
          onSuccess: (result) => {
            console.log('Repay transaction automatically verified and added to leaderboard:', result)
          },
          onError: (error) => {
            console.warn('Auto-verification failed (user can still verify manually):', error.message)
          },
        }).catch(() => {
          // Silent fail - user can still verify manually if needed
        })
      }
    }
  }, [isRepaySuccess, repayHash, onSuccess, address, chainId])

  // Handle approval errors
  useEffect(() => {
    const combinedError = approveError || approvalReceiptError
    if (combinedError) {
      const errorObject = combinedError instanceof Error ? combinedError : new Error(String(combinedError))
      console.error("An approval error occurred:", errorObject)
      
      if (errorObject.message.includes('User rejected')) {
        setError('Approval rejected. Please try again.')
        reset() // Reset state if user rejects
      } else {
        onErrorRef.current?.(errorObject)
        setError(errorObject.message)
        setStep('error')
      }
    }
  }, [approveError, approvalReceiptError])

  // Handle repay errors
  useEffect(() => {
    const combinedError = repayError || repayReceiptError
    if (combinedError) {
      const errorObject = combinedError instanceof Error ? combinedError : new Error(String(combinedError))
      console.error("A repay error occurred:", errorObject)
      
      if (errorObject.message.includes('User rejected')) {
        setError('Repay transaction rejected. Please try again.')
        reset() // Reset state if user rejects
      } else {
        onErrorRef.current?.(errorObject)
        setError(errorObject.message)
        setStep('error')
      }
    }
  }, [repayError, repayReceiptError])

  const executeRepay = useCallback(async () => {
    if (!address || !contractAddresses || !amount || parsedAmount <= 0) {
      setError('Invalid parameters for repay')
      return
    }

    try {
      setError(null)
      setStep('checking-allowance')
      setStatusMessage('Checking token allowance...')
      
      // Refresh allowance
      await refetchAllowance()
      
      // Give a small delay for state to update
      await new Promise(resolve => setTimeout(resolve, 100))

      if (needsApproval) {
        setStep('approving')
        setStatusMessage('Please approve token spending in your wallet...')
        
        writeApprove({
          address: contractAddresses.underlyingAddress as Address,
          abi: erc20Abi,
          functionName: 'approve',
          args: [contractAddresses.pTokenAddress as Address, parsedAmount],
        } as any)
        
        setStep('approved')
        setStatusMessage('Approval submitted. Preparing repay...')
      } else {
        // No approval needed, go straight to repay
        setStep('repaying')
        setStatusMessage('Repaying borrowed amount...')
        
        writeRepay({
          address: contractAddresses.pTokenAddress as Address,
          abi: combinedAbi,
          functionName: 'repayBorrow',
          args: [parsedAmount],
        } as any)
      }

    } catch (err: any) {
      console.error('Repay transaction failed:', err)
      setStep('error')
      setError(err.message || 'Repay transaction failed')
      onError?.(err)
    }
  }, [address, contractAddresses, amount, parsedAmount, needsApproval, writeApprove, writeRepay, refetchAllowance, onError])

  const reset = useCallback(() => {
    setStep('idle')
    setError(null)
    setApproveHash(null)
    setRepayHash(null)
    setStatusMessage('')
    resetApprove()
    resetRepay()
  }, [resetApprove, resetRepay])

  const isLoading = isApprovePending || isRepayPending || isApprovalConfirming || isRepayConfirming

  return {
    executeRepay,
    isLoading,
    canRepay,
    needsApproval,
    error,
    step,
    statusMessage,
    approveHash,
    repayHash,
    reset,
  }
} 
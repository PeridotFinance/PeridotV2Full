import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { useAccount, useWriteContract, useReadContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseUnits, Address, erc20Abi, encodeFunctionData } from 'viem'
import { getAssetContractAddresses } from '@/data/market-data'
import combinedAbi from '@/app/abis/combinedAbi.json'
import pbnbAbi from '@/app/abis/pbnbabi.json'
import { autoVerifyTransaction } from '@/lib/auto-leaderboard-verifier'
import { toast } from 'sonner'
import { FEATURE_FLAGS } from '../config/featureFlags'
import { CHAIN_IDS, isHubChain, resolveHubReadChainId, getOracleAddress } from '@/config/contracts'
import { useRepayBiconomy } from './cc/use-repay-biconomy'
import { emitTxUpdate, attachScopedRetryListeners, mapFriendlyError, isRateLimit, isTimeoutError, emitTxActive } from '@/lib/txFeedback'
import { useActiveWallet } from '@/hooks/use-active-wallet'
import { useSmartExecution, TransactionCall } from '@/hooks/use-smart-execution'
import priceOracleAbi from '@/app/abis/PriceOracle.json'

interface UseRepayTransactionProps {
  assetId: string
  amount: string
  repayMax?: boolean
  onSuccess?: () => void
  onError?: (error: Error) => void
  // Optional chain override: when set, resolve contracts from this chain instead of the wallet's
  // current chain. The caller is responsible for switching the wallet before calling executeRepay.
  overrideChainId?: number
}

type TransactionStep = 'idle' | 'checking-allowance' | 'approving' | 'approved' | 'repaying' | 'success' | 'error'

export function useRepayTransaction({
  assetId,
  amount,
  repayMax = false,
  onSuccess,
  onError,
  overrideChainId,
}: UseRepayTransactionProps) {
  const { getAccessToken } = usePrivy()
  const { chainId } = useAccount()
  const { address, signerAddress, isSmartAccountActive } = useActiveWallet()
  const { execute: executeSmartTx } = useSmartExecution()
  // When overrideChainId targets a hub chain (BSC/Monad), skip Biconomy regardless of wallet chain.
  const isBiconomyCrossChain = Boolean(
    FEATURE_FLAGS.CROSS_CHAIN_REPAY_BICONOMY &&
    typeof chainId === 'number' &&
    !isHubChain(overrideChainId ?? chainId)
  )
  const ccRepay = useRepayBiconomy({ assetId, amount, repayMax, onSuccess, onError })
  const [step, setStep] = useState<TransactionStep>('idle')
  const [error, setError] = useState<string | null>(null)
  const [approveHash, setApproveHash] = useState<string | null>(null)
  const [repayHash, setRepayHash] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string>('')
  const emitUpdate = useCallback((nextStep: string, message?: string, hash?: string) => {
    emitTxUpdate({ action: 'repay', step: nextStep, statusMessage: message, txHash: hash })
  }, [])

  const markTxIdle = useCallback(() => {
    try {
      if (typeof window !== 'undefined') {
        ;(window as any).__PERIDOT_TX_ACTIVE = false
        window.dispatchEvent(new CustomEvent('peridot:tx-idle'))
      }
    } catch {}
  }, [])

  const onSuccessRef = useRef(onSuccess);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
  }, [onSuccess]);

  const onErrorRef = useRef(onError);
  useEffect(() => {
      onErrorRef.current = onError;
  }, [onError]);

  // Get contract addresses for the asset.
  // When overrideChainId is set (e.g. from EasyManagementModal for a Monad position), use that
  // chain so the correct contracts are resolved regardless of the wallet's current chain.
  const resolvedChainId = overrideChainId ?? chainId
  const contractAddresses = resolvedChainId ? getAssetContractAddresses(assetId, resolvedChainId) : null

  const effectiveChainId = useMemo(() => {
    const base = overrideChainId ?? chainId ?? null
    return resolveHubReadChainId(base) ?? base
  }, [overrideChainId, chainId]) as number | null
  const oracleAddress = effectiveChainId ? getOracleAddress(effectiveChainId) : null

  // Fetch asset price for leaderboard verification
  const { data: priceRaw } = useReadContract({
    address: oracleAddress as Address,
    abi: priceOracleAbi,
    functionName: 'getUnderlyingPrice',
    args: [contractAddresses?.pTokenAddress as Address],
    query: {
      enabled: !!oracleAddress && !!contractAddresses?.pTokenAddress,
    },
    chainId: effectiveChainId as any,
  })

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

  const assetPrice = useMemo(() => {
    if (!priceRaw) return 0
    const dec = (underlyingDecimals as number) || 18
    return Number(priceRaw) / (10 ** (36 - dec))
  }, [priceRaw, underlyingDecimals])

  // Check if we have valid contract addresses
  const isNative = Boolean((contractAddresses as any)?.isNative)
  const canRepay = isBiconomyCrossChain
    ? true
    : Boolean(contractAddresses && (contractAddresses as any).pTokenAddress && (isNative || (contractAddresses as any).underlyingAddress))

  // Clean and parse amount to proper units
  const cleanAmount = (rawAmount: string): string => {
    if (!rawAmount) return '0'
    // Remove commas and any other formatting characters, keep only numbers and decimal point
    return rawAmount.replace(/[^0-9.]/g, '')
  }
  
  const parsedAmount = repayMax 
    ? BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF') 
    : (amount ? parseUnits(cleanAmount(amount), (underlyingDecimals as number) || 18) : BigInt(0))

  // Read current allowance of underlying token for repayment
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: contractAddresses?.underlyingAddress as Address,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [address!, contractAddresses?.pTokenAddress as Address],
    query: {
      enabled: !!contractAddresses?.underlyingAddress && !!address && !isNative,
    }
  })

  // Check if approval is needed
  const needsApproval = !isNative && allowance !== undefined && parsedAmount > (allowance as bigint)

  // Calculate approval amount - add 5% buffer for interest accrual when repaying
  // This prevents "transfer amount exceeds spender allowance" errors due to interest accrual
  const getApprovalAmount = () => {
    if (repayMax) {
      return BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF')
    }
    // Add 5% buffer to handle interest accrual between approval and repay
    const buffer = parsedAmount * BigInt(5) / BigInt(100) // 5% buffer
    return parsedAmount + buffer
  }

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
      try {
        let toastId: any
        toastId = toast('Approval submitted', {
          description: 'Waiting for approval confirmation...',
          action: { label: 'Close', onClick: () => toast.dismiss(toastId) },
        })
      } catch {}
      emitUpdate('approving', 'Approval submitted...')
    }
  }, [approveData])

  useEffect(() => {
    if (repayData) {
      setRepayHash(repayData)
      try {
        let toastId: any
        toastId = toast('Repay submitted', {
          description: 'Waiting for on-chain confirmation...',
          action: { label: 'Close', onClick: () => toast.dismiss(toastId) },
        })
      } catch {}
      emitUpdate('repaying', 'Repay submitted...', repayData as any)
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
          emitUpdate('repaying', 'Repaying borrowed amount...')
          
      if (isNative) {
        writeRepay({
          address: (contractAddresses as any).pTokenAddress as Address,
          abi: pbnbAbi as any,
          functionName: 'repayBorrow',
          args: [],
          value: parsedAmount,
        } as any)
      } else {
        writeRepay({
          address: (contractAddresses as any).pTokenAddress as Address,
          abi: combinedAbi,
          functionName: 'repayBorrow',
          args: [parsedAmount],
        } as any)
      }
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
      onSuccessRef.current?.()
      try {
        window.dispatchEvent(new CustomEvent('peridot:tx-success', {
          detail: {
            type: 'repay',
            address,
            chainId,
            assetId,
            txHash: repayHash,
            observed_at: new Date().toISOString(),
            tokenSymbol: (contractAddresses as any)?.symbol || assetId?.toUpperCase?.(),
          }
        }))
      } catch {}
      try {
        let toastId: any
        toastId = toast('Repay executed', {
          description: 'Transaction confirmed successfully.',
          action: { label: 'Close', onClick: () => toast.dismiss(toastId) },
        })
      } catch {}

      // Auto-verify repay transaction in leaderboard
      if (repayHash && address && chainId) {
        getAccessToken().then(token => {
          fetch('/api/leaderboard/pre-verify', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            },
            body: JSON.stringify({
              txHash: repayHash,
              walletAddress: address,
              chainId,
              actionType: 'repay',
              amount: cleanAmount(amount),
              usdValue: parseFloat(cleanAmount(amount)) * (assetPrice || 0),
              tokenSymbol: (contractAddresses as any)?.symbol || assetId?.toUpperCase?.(),
            }),
          }).catch(console.warn)

          autoVerifyTransaction({
            txHash: repayHash,
            walletAddress: address,
            chainId,
            privyToken: token,
            // Ensure correct mainnet insertion when viewing from a spoke that mirrors BSC markets
            overrideChainId: chainId,
            onSuccess: (result) => {
              console.log('Repay transaction automatically verified and added to leaderboard:', result)
            },
            onError: (error) => {
              console.warn('Auto-verification failed (user can still verify manually):', error.message)
            },
          }).catch(() => {
            // Silent fail - user can still verify manually if needed
          })
        })
      }
    }
  }, [isRepaySuccess, repayHash, address, chainId])

  useEffect(() => {
    if (!isBiconomyCrossChain) return
    if (ccRepay.step === 'success' || ccRepay.step === 'error') {
      markTxIdle()
    }
  }, [isBiconomyCrossChain, ccRepay.step, markTxIdle])

  useEffect(() => {
    if (!isBiconomyCrossChain) return
    try {
      console.log('[useRepayTransaction] ccRepay step', {
        step: ccRepay.step,
        status: ccRepay.statusMessage,
        error: ccRepay.error,
        superTxHash: ccRepay.superTxHash,
      })
    } catch {}
  }, [isBiconomyCrossChain, ccRepay.step, ccRepay.statusMessage, ccRepay.error, ccRepay.superTxHash])

  useEffect(() => {
    if (!isBiconomyCrossChain) return
    if (ccRepay.step === 'success' || ccRepay.step === 'error') {
      markTxIdle()
    }
  }, [isBiconomyCrossChain, ccRepay.step, markTxIdle])

  useEffect(() => {
    if (!isBiconomyCrossChain) return
    try {
      console.log('[useRepayTransaction] ccRepay step', {
        step: ccRepay.step,
        status: ccRepay.statusMessage,
        error: ccRepay.error,
        superTxHash: ccRepay.superTxHash,
      })
    } catch {}
  }, [isBiconomyCrossChain, ccRepay.step, ccRepay.statusMessage, ccRepay.error, ccRepay.superTxHash])

  // Handle approval errors
  useEffect(() => {
    const combinedError = approveError || approvalReceiptError
    if (combinedError) {
      const errorObject = combinedError instanceof Error ? combinedError : new Error(String(combinedError))
      console.error("An approval error occurred:", errorObject)
      
      if (errorObject.message.includes('User rejected')) {
        const friendly = 'Approval rejected. Please try again.'
        setError(friendly)
        setStep('error')
        emitUpdate('error', friendly)
        try { markTxIdle() } catch {}
        reset() // Reset state if user rejects
      } else if (isRateLimit(errorObject.message)) {
        const friendly = mapFriendlyError(errorObject.message) || 'Temporarily rate limited. Please wait, then try again.'
        setError(friendly)
        setStep('error')
        emitUpdate('error', friendly)
        try { markTxIdle() } catch {}
      } else {
        onErrorRef.current?.(errorObject)
        const friendly = mapFriendlyError(errorObject.message) || errorObject.message
        setError(friendly)
        setStep('error')
        emitUpdate('error', friendly)
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
        const friendly = 'Repay transaction rejected. Please try again.'
        setError(friendly)
        setStep('error')
        emitUpdate('error', friendly)
        reset() // Reset state if user rejects
      } else if (isRateLimit(errorObject.message)) {
        const friendly = mapFriendlyError(errorObject.message) || 'Temporarily rate limited. Please wait, then try again.'
        setError(friendly)
        setStep('error')
        emitUpdate('error', friendly)
        try { markTxIdle() } catch {}
      } else if (isTimeoutError(errorObject.message)) {
        const friendly = mapFriendlyError(errorObject.message) || 'Transaction timed out. Please check your connection and try again.'
        setError(friendly)
        setStep('error')
        emitUpdate('error', friendly)
        try { markTxIdle() } catch {}
      } else {
        onErrorRef.current?.(errorObject)
        const friendly = mapFriendlyError(errorObject.message) || errorObject.message
        setError(friendly)
        setStep('error')
        emitUpdate('error', friendly)
      }
    }
  }, [repayError, repayReceiptError])

  const executeRepay = useCallback(async () => {
    try {
      console.log('[useRepayTransaction] executeRepay invoked', {
        assetId,
        amount,
        repayMax,
        isBiconomyCrossChain,
      })
    } catch {}
    try { emitTxActive() } catch {}
    if (isBiconomyCrossChain) {
      try {
        setError(null)
        setStep('repaying')
        setStatusMessage('Preparing cross-chain repay...')
        try {
          console.log('[useRepayTransaction] cross-chain repay start', {
            chainId,
            address,
            ccStep: ccRepay.step,
          })
        } catch {}
        try {
          if (typeof window !== 'undefined') {
            ;(window as any).__PERIDOT_TX_ACTIVE = true
            window.dispatchEvent(new CustomEvent('peridot:tx-active'))
          }
        } catch {}
        try {
          let toastId: any
          toastId = toast('Cross-chain repay', { description: 'Preparing Biconomy route...', action: { label: 'Close', onClick: () => toast.dismiss(toastId) } })
        } catch {}
        await ccRepay.executeRepay()
        try {
          console.log('[useRepayTransaction] cross-chain repay dispatched', {
            superTxHash: ccRepay.superTxHash,
          })
        } catch {}
        return
      } catch (e: any) {
        const raw = String(e?.message || e)
        try {
          console.error('[useRepayTransaction] cross-chain repay error', { message: raw, error: e })
        } catch {}
        if (raw.startsWith('BICONOMY_ONCHAIN_APPROVAL_REQUIRED:')) {
          try {
            const payloadRaw = raw.slice('BICONOMY_ONCHAIN_APPROVAL_REQUIRED:'.length)
            const payload = JSON.parse(payloadRaw)
            const spender = payload?.spender as Address | undefined
            const tokenAddress = payload?.tokenAddress as Address | undefined
            const approvalAmount = (() => {
              try { return BigInt(payload?.amount ?? '0') } catch { return parsedAmount }
            })()
            if (!spender || !tokenAddress) {
              throw new Error('Missing approval details for cross-chain repay')
            }
            setStep('approving')
            setStatusMessage('Approval required for cross-chain funding token...')
            try {
              let toastId: any
              toastId = toast('Approval required', { description: 'Approve the funding token to continue the repay.', action: { label: 'Close', onClick: () => toast.dismiss(toastId) } })
            } catch {}
            await writeApprove({
              address: tokenAddress,
              abi: erc20Abi,
              functionName: 'approve',
              args: [spender, approvalAmount],
            } as any)
            setError(null)
            setStep('repaying')
            setStatusMessage('Approval submitted. Re-trying cross-chain repay...')
            await ccRepay.executeRepay()
            try {
              console.log('[useRepayTransaction] cross-chain repay retried after approval', {
                superTxHash: ccRepay.superTxHash,
              })
            } catch {}
            return
          } catch (inner) {
            const innerError = inner instanceof Error ? inner : new Error(String(inner))
            const message = /User rejected/i.test(innerError.message)
              ? 'Approval rejected. Please try again.'
              : innerError.message || 'Failed to approve funding token.'
            setError(message)
            setStep('error')
            onError?.(innerError)
            markTxIdle()
            return
          }
        }
        setError(raw)
        setStep('error')
        onError?.(e instanceof Error ? e : new Error(raw))
        markTxIdle()
        return
      }
    }
    if (!address || !contractAddresses || !amount || parsedAmount <= 0) {
      setError('Invalid parameters for repay')
      return
    }

    try {
      setError(null)
      setStep('checking-allowance')
      setStatusMessage('Checking token allowance...')
      try { emitUpdate('checking-allowance', 'Checking token allowance...') } catch {}
      
      // Refresh allowance
      await refetchAllowance()
      
      // Give a small delay for state to update
      await new Promise(resolve => setTimeout(resolve, 100))

      if (needsApproval) {
        if (isSmartAccountActive && !isBiconomyCrossChain && !isNative && contractAddresses) {
          // Smart Account Batch: Approve + Repay
          setStep('repaying')
          setStatusMessage('Repaying with smart account...')
          emitUpdate('repaying', 'Repaying with smart account...')
          
          const calls: TransactionCall[] = [
            {
              to: contractAddresses.underlyingAddress as Address,
              data: encodeFunctionData({
                abi: erc20Abi,
                functionName: 'approve',
                args: [contractAddresses.pTokenAddress as Address, getApprovalAmount()],
              }),
            },
            {
              to: (contractAddresses as any).pTokenAddress as Address,
              data: encodeFunctionData({
                abi: combinedAbi,
                functionName: 'repayBorrow',
                args: [parsedAmount],
              }),
            }
          ]

          try {
            const hash = await executeSmartTx(calls, {
              chainId: chainId as number,
              onSuccess: (h) => {
                setRepayHash(h)
              }
            })
            if (hash) {
              setRepayHash(hash)
            }
          } catch (err) {
            console.error('Smart account repay error:', err)
          }
        } else {
          setStep('approving')
          setStatusMessage('Please approve token spending in your wallet...')
          
          writeApprove({
            address: contractAddresses.underlyingAddress as Address,
            abi: erc20Abi,
            functionName: 'approve',
            args: [contractAddresses.pTokenAddress as Address, getApprovalAmount()],
          } as any)
          
          setStep('approved')
          setStatusMessage('Approval submitted. Preparing repay...')
        }
      } else {
        // No approval needed, go straight to repay
        if (isSmartAccountActive && !isBiconomyCrossChain && contractAddresses) {
          // Smart Account: Repay only
          setStep('repaying')
          setStatusMessage('Repaying with smart account...')
          emitUpdate('repaying', 'Repaying with smart account...')
          
          const call: TransactionCall = isNative ? {
            to: (contractAddresses as any).pTokenAddress as Address,
            data: encodeFunctionData({
              abi: pbnbAbi as any,
              functionName: 'repayBorrow',
              args: [],
            }),
            value: parsedAmount,
          } : {
            to: (contractAddresses as any).pTokenAddress as Address,
            data: encodeFunctionData({
              abi: combinedAbi,
              functionName: 'repayBorrow',
              args: [parsedAmount],
            }),
          }

          try {
            const hash = await executeSmartTx(call, {
              chainId: chainId as number,
              onSuccess: (h) => {
                setRepayHash(h)
              }
            })
            if (hash) {
              setRepayHash(hash)
            }
          } catch (err) {
            console.error('Smart account repay error:', err)
          }
        } else {
          setStep('repaying')
          setStatusMessage('Repaying borrowed amount...')
          try {
            let toastId: any
            toastId = toast('Processing repay', {
              description: 'Submitting repay transaction...',
              action: { label: 'Close', onClick: () => toast.dismiss(toastId) },
            })
          } catch {}
          
          if (isNative) {
            writeRepay({
              address: (contractAddresses as any).pTokenAddress as Address,
              abi: pbnbAbi as any,
              functionName: 'repayBorrow',
              args: [],
              value: parsedAmount,
            } as any)
          } else {
            writeRepay({
              address: (contractAddresses as any).pTokenAddress as Address,
              abi: combinedAbi,
              functionName: 'repayBorrow',
              args: [parsedAmount],
            } as any)
          }
        }
      }

    } catch (err: any) {
      console.error('Repay transaction failed:', err)
      setStep('error')
      setError(err.message || 'Repay transaction failed')
      onError?.(err)
      try {
        let toastId: any
        toastId = toast('Transaction failed', {
          description: err.message || 'Repay failed',
          action: { label: 'Close', onClick: () => toast.dismiss(toastId) },
        })
      } catch {}
    }
  }, [address, contractAddresses, amount, parsedAmount, needsApproval, writeApprove, writeRepay, refetchAllowance, onError])

  useEffect(() => {
    return attachScopedRetryListeners('repay', () => {
      try {
        if (step === 'approving') {
          if (contractAddresses) {
            writeApprove({
              address: contractAddresses.underlyingAddress as Address,
              abi: erc20Abi,
              functionName: 'approve',
              args: [contractAddresses.pTokenAddress as Address, getApprovalAmount()],
            } as any)
          }
        } else if (step === 'repaying' || step === 'approved') {
          executeRepay()
        } else if (step === 'error' || step === 'idle') {
          executeRepay()
        }
      } catch {}
    })
  }, [step, contractAddresses, executeRepay])

  const reset = useCallback(() => {
    setStep('idle')
    setError(null)
    setApproveHash(null)
    setRepayHash(null)
    setStatusMessage('')
    resetApprove()
    resetRepay()
    try {
      if (typeof window !== 'undefined') {
        ;(window as any).__PERIDOT_TX_ACTIVE = false
        window.dispatchEvent(new CustomEvent('peridot:tx-idle'))
      }
    } catch {}
  }, [resetApprove, resetRepay])

  const isLoading = isApprovePending || isRepayPending || isApprovalConfirming || isRepayConfirming || (isBiconomyCrossChain && (ccRepay.step === 'quoting' || ccRepay.step === 'approving' || ccRepay.step === 'signing' || ccRepay.step === 'submitting'))

  return {
    executeRepay,
    isLoading,
    canRepay,
    needsApproval,
    error,
    step: isBiconomyCrossChain ? (ccRepay.step === 'success' ? 'success' : step) : step,
    statusMessage: isBiconomyCrossChain && ccRepay.statusMessage ? ccRepay.statusMessage : statusMessage,
    approveHash,
    repayHash: (repayHash as any) || (ccRepay.superTxHash as any),
    biconomyTrackingUrl: ccRepay.trackingUrl,
    biconomyFee: ccRepay.biconomyFee,
    biconomyFeeDetails: ccRepay.biconomyFeeDetails,
    biconomyMeeLink: ccRepay.meeScanLink,
    reset,
  }
}
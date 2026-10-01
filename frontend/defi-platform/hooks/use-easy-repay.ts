/**
 * use-easy-repay.ts
 *
 * Clean, simplified repay hook used exclusively in EasyManagementModal.
 * Drop-in replacement for useRepayTransaction — Easy Mode always passes
 * overrideChainId (the position's hub chain), so isBiconomyCrossChain is
 * always false. All Biconomy, attachScopedRetryListeners, and localStorage
 * logic has been removed.
 *
 * Improvements over use-repay-transaction.ts:
 *  - normalizeAmountStr is a module-level pure function (not inner)
 *  - Single isSubmittingRef guard prevents double-click
 *  - executeRepay wrapped in useCallback with correct deps
 *  - reset wrapped in useCallback
 *  - onErrorRef used in catch block (no stale onError prop closure)
 *  - No 2s setTimeout after approval — writeRepay called directly on approval success
 *  - No Biconomy (useRepayBiconomy not imported)
 *  - 30s stall timer for hung transactions
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { useAccount, useWriteContract, useReadContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseUnits, Address, erc20Abi, encodeFunctionData } from 'viem'
import { getAssetContractAddresses } from '@/data/market-data'
import combinedAbi from '@/app/abis/combinedAbi.json'
import pbnbAbi from '@/app/abis/pbnbabi.json'
import { autoVerifyTransaction } from '@/lib/auto-leaderboard-verifier'
import { toast } from 'sonner'
import { resolveHubReadChainId } from '@/config/contracts'
import { emitTxUpdate, mapFriendlyError, isRateLimit, isTimeoutError } from '@/lib/txFeedback'
import { useActiveWallet } from '@/hooks/use-active-wallet'
import { useSmartExecution, TransactionCall } from '@/hooks/use-smart-execution'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UseEasyRepayProps {
  assetId: string
  amount: string
  repayMax?: boolean
  onSuccess?: () => void
  onError?: (error: Error) => void
  overrideChainId?: number
}

type RepayStep = 'idle' | 'checking-allowance' | 'approving' | 'repaying' | 'success' | 'error'

// ---------------------------------------------------------------------------
// Pure helper — module-level so it is stable across renders
// ---------------------------------------------------------------------------

function normalizeAmountStr(raw: string, dec: number): string {
  if (!raw) return '0'
  const s = String(raw).trim().replace(/,/g, '')
  if (s === '' || s === '.') return '0'
  if (/e/i.test(s)) {
    const n = Number(s)
    if (!isFinite(n) || isNaN(n)) return '0'
    const minUnit = Math.pow(10, -Math.max(0, dec))
    if (Math.abs(n) < minUnit) return '0'
    return n.toFixed(Math.min(18, Math.max(0, dec))).replace(/\.?(0+)$/, '')
  }
  if (s.includes('.')) {
    const [int, frac] = s.split('.')
    const trimFrac = frac.slice(0, Math.max(0, dec)).replace(/0+$/, '')
    return trimFrac.length ? `${int}.${trimFrac}` : int
  }
  return s
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useEasyRepay({
  assetId,
  amount,
  repayMax = false,
  onSuccess,
  onError,
  overrideChainId,
}: UseEasyRepayProps) {
  const { getAccessToken } = usePrivy()
  const { chainId } = useAccount()
  const { address, isSmartAccountActive } = useActiveWallet()
  const { execute: executeSmartTx } = useSmartExecution()

  // ---- state ----------------------------------------------------------------
  const [step, setStep] = useState<RepayStep>('idle')
  const [error, setError] = useState<string | null>(null)
  const [approveHash, setApproveHash] = useState<string | null>(null)
  const [repayHash, setRepayHash] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string>('')

  // ---- refs -----------------------------------------------------------------
  /** Single execution guard — prevents double-click & StrictMode double-fire. */
  const isSubmittingRef = useRef(false)
  const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Stable refs for callbacks (avoids stale closure issues)
  const onSuccessRef = useRef(onSuccess)
  useEffect(() => { onSuccessRef.current = onSuccess }, [onSuccess])
  const onErrorRef = useRef(onError)
  useEffect(() => { onErrorRef.current = onError }, [onError])

  // ---- chain resolution -----------------------------------------------------
  const effectiveChainId = useMemo(
    () => (resolveHubReadChainId(overrideChainId ?? chainId) ?? (overrideChainId ?? chainId)) as number | null,
    [overrideChainId, chainId],
  )

  // contractAddresses targets the position's chain directly (NOT hub-routed)
  const contractAddresses = useMemo(
    () => getAssetContractAddresses(assetId, overrideChainId ?? chainId ?? 0),
    [assetId, overrideChainId, chainId],
  )

  const isNative = Boolean((contractAddresses as any)?.isNative)
  const canRepay = Boolean(
    contractAddresses &&
    (contractAddresses as any).pTokenAddress &&
    (isNative || (contractAddresses as any).underlyingAddress),
  )

  // ---- on-chain reads -------------------------------------------------------
  const { data: underlyingDecimals } = useReadContract({
    address: contractAddresses?.underlyingAddress as Address,
    abi: combinedAbi,
    functionName: 'decimals',
    args: [],
    query: { enabled: !!contractAddresses?.underlyingAddress },
    chainId: effectiveChainId as any,
  })

  const decimals = (underlyingDecimals as number) ?? 18

  // ---- amount parsing -------------------------------------------------------
  const parsedAmount = useMemo(
    () =>
      repayMax
        ? BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF')
        : amount
        ? parseUnits(normalizeAmountStr(amount, decimals), decimals)
        : BigInt(0),
    [repayMax, amount, decimals],
  )

  const getApprovalAmount = useCallback((): bigint => {
    if (repayMax) {
      return BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF')
    }
    // Add 5% buffer to handle interest accrual between approval and repay
    return (parsedAmount * 105n) / 100n
  }, [repayMax, parsedAmount])

  // ---- allowance read -------------------------------------------------------
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: contractAddresses?.underlyingAddress as Address,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [address as Address, contractAddresses?.pTokenAddress as Address],
    query: {
      enabled: !!contractAddresses?.underlyingAddress && !!address && !isNative,
    },
  })

  const needsApproval = !isNative && allowance !== undefined && parsedAmount > (allowance as bigint)

  // ---- wagmi write hooks ----------------------------------------------------
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

  // ---- sync hashes from wagmi data -----------------------------------------
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
      emitTxUpdate({ action: 'repay', step: 'approving', statusMessage: 'Approval submitted...' })
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
      emitTxUpdate({ action: 'repay', step: 'repaying', statusMessage: 'Repay submitted...', txHash: repayData })
    }
  }, [repayData])

  // ---- receipt watchers -----------------------------------------------------
  const {
    isLoading: isApprovalConfirming,
    isSuccess: isApprovalSuccess,
    error: approvalReceiptError,
  } = useWaitForTransactionReceipt({ hash: approveHash as `0x${string}` })

  const {
    isLoading: isRepayConfirming,
    isSuccess: isRepaySuccess,
    error: repayReceiptError,
  } = useWaitForTransactionReceipt({ hash: repayHash as `0x${string}` })

  // ---- stall timer ----------------------------------------------------------
  const clearStallTimer = useCallback(() => {
    if (stallTimerRef.current) {
      clearTimeout(stallTimerRef.current)
      stallTimerRef.current = null
    }
  }, [])

  const startStallTimer = useCallback(() => {
    clearStallTimer()
    stallTimerRef.current = setTimeout(() => {
      if (isSubmittingRef.current) {
        setStatusMessage('Transaction is taking longer than usual. Please wait...')
      }
    }, 30_000)
  }, [clearStallTimer])

  // ---- approval success → directly call writeRepay (no setTimeout) ----------
  const hasProceedAfterApprovalRef = useRef(false)
  useEffect(() => {
    if (!isApprovalSuccess || hasProceedAfterApprovalRef.current) return
    if (!contractAddresses || !address) return
    hasProceedAfterApprovalRef.current = true
    refetchAllowance().then(() => {
      setStep('repaying')
      setStatusMessage('Repaying borrowed amount...')
      emitTxUpdate({ action: 'repay', step: 'repaying', statusMessage: 'Repaying borrowed amount...' })
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
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isApprovalSuccess])

  // ---- repay success effect -------------------------------------------------
  useEffect(() => {
    if (!isRepaySuccess || !repayHash) return
    clearStallTimer()
    isSubmittingRef.current = false
    setStep('success')
    setStatusMessage('Repay successful! Loan repaid.')
    onSuccessRef.current?.()

    try {
      window.dispatchEvent(
        new CustomEvent('peridot:tx-success', {
          detail: {
            type: 'repay',
            address,
            chainId,
            assetId,
            txHash: repayHash,
            observed_at: new Date().toISOString(),
            tokenSymbol: (contractAddresses as any)?.symbol || assetId?.toUpperCase?.(),
          },
        }),
      )
    } catch {}

    try {
      let toastId: any
      toastId = toast('Repay executed', {
        description: 'Transaction confirmed successfully.',
        action: { label: 'Close', onClick: () => toast.dismiss(toastId) },
      })
    } catch {}

    if (repayHash && address && chainId) {
      getAccessToken().then((token) => {
        fetch('/api/leaderboard/pre-verify', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            txHash: repayHash,
            walletAddress: address,
            chainId,
            actionType: 'repay',
            amount: normalizeAmountStr(amount, decimals),
            tokenSymbol: (contractAddresses as any)?.symbol || assetId?.toUpperCase?.(),
          }),
        }).catch(console.warn)

        autoVerifyTransaction({
          txHash: repayHash,
          walletAddress: address,
          chainId,
          privyToken: token,
          overrideChainId: chainId,
          onSuccess: (result) => {
            console.log('Repay transaction automatically verified and added to leaderboard:', result)
          },
          onError: (err) => {
            console.warn('Auto-verification failed (user can still verify manually):', err.message)
          },
        }).catch(() => {})
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRepaySuccess, repayHash])

  // ---- approval error effect -----------------------------------------------
  useEffect(() => {
    const combinedError = approveError || approvalReceiptError
    if (!combinedError) return
    clearStallTimer()
    isSubmittingRef.current = false
    const errObj = combinedError instanceof Error ? combinedError : new Error(String(combinedError))
    const rawMsg = errObj.message

    if (rawMsg.includes('User rejected')) {
      const friendly = 'Approval rejected. Please try again.'
      setError(friendly)
      setStep('error')
      emitTxUpdate({ action: 'repay', step: 'error', statusMessage: friendly })
      reset()
    } else if (isRateLimit(rawMsg)) {
      const friendly =
        mapFriendlyError(rawMsg) || 'Temporarily rate limited. Please wait, then try again.'
      setError(friendly)
      setStep('error')
      emitTxUpdate({ action: 'repay', step: 'error', statusMessage: friendly })
    } else {
      onErrorRef.current?.(errObj)
      const friendly = mapFriendlyError(rawMsg) || rawMsg
      setError(friendly)
      setStep('error')
      emitTxUpdate({ action: 'repay', step: 'error', statusMessage: friendly })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approveError, approvalReceiptError])

  // ---- repay error effect ---------------------------------------------------
  useEffect(() => {
    const combinedError = repayError || repayReceiptError
    if (!combinedError) return
    clearStallTimer()
    isSubmittingRef.current = false
    const errObj = combinedError instanceof Error ? combinedError : new Error(String(combinedError))
    const rawMsg = errObj.message

    if (rawMsg.includes('User rejected')) {
      const friendly = 'Repay transaction rejected. Please try again.'
      setError(friendly)
      setStep('error')
      emitTxUpdate({ action: 'repay', step: 'error', statusMessage: friendly })
      reset()
    } else if (isRateLimit(rawMsg)) {
      const friendly =
        mapFriendlyError(rawMsg) || 'Temporarily rate limited. Please wait, then try again.'
      setError(friendly)
      setStep('error')
      emitTxUpdate({ action: 'repay', step: 'error', statusMessage: friendly })
    } else if (isTimeoutError(rawMsg)) {
      const friendly =
        mapFriendlyError(rawMsg) ||
        'Transaction timed out. Please check your connection and try again.'
      setError(friendly)
      setStep('error')
      emitTxUpdate({ action: 'repay', step: 'error', statusMessage: friendly })
    } else {
      onErrorRef.current?.(errObj)
      const friendly = mapFriendlyError(rawMsg) || rawMsg
      setError(friendly)
      setStep('error')
      emitTxUpdate({ action: 'repay', step: 'error', statusMessage: friendly })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repayError, repayReceiptError])

  // ---- auto-clear error when amount changes --------------------------------
  useEffect(() => {
    if (step === 'error') {
      setError(null)
      setStep('idle')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount])

  // ---- cleanup on unmount --------------------------------------------------
  useEffect(() => {
    return () => {
      clearStallTimer()
      isSubmittingRef.current = false
    }
  }, [clearStallTimer])

  // ---- reset ---------------------------------------------------------------
  const reset = useCallback(() => {
    setStep('idle')
    setError(null)
    setApproveHash(null)
    setRepayHash(null)
    setStatusMessage('')
    isSubmittingRef.current = false
    hasProceedAfterApprovalRef.current = false
    clearStallTimer()
    try { resetApprove() } catch {}
    try { resetRepay() } catch {}
    try {
      if (typeof window !== 'undefined') {
        ;(window as any).__PERIDOT_TX_ACTIVE = false
        window.dispatchEvent(new CustomEvent('peridot:tx-idle'))
      }
    } catch {}
  }, [clearStallTimer, resetApprove, resetRepay])

  // ---- executeRepay --------------------------------------------------------
  const executeRepay = useCallback(async () => {
    // Guard: prevent concurrent calls
    if (isSubmittingRef.current) return

    // Validate
    if (!address || !contractAddresses || !amount || parsedAmount <= BigInt(0)) {
      setError('Invalid parameters for repay')
      setStep('error')
      return
    }

    isSubmittingRef.current = true
    hasProceedAfterApprovalRef.current = false
    setError(null)
    setStep('checking-allowance')
    setStatusMessage('Checking token allowance...')
    emitTxUpdate({ action: 'repay', step: 'checking-allowance', statusMessage: 'Checking token allowance...' })
    startStallTimer()

    try {
      await refetchAllowance()

      if (needsApproval) {
        if (isSmartAccountActive && !isNative) {
          // Smart Account Batch: Approve + Repay in one tx
          setStep('repaying')
          setStatusMessage('Repaying with smart account...')
          emitTxUpdate({ action: 'repay', step: 'repaying', statusMessage: 'Repaying with smart account...' })

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
            },
          ]

          const hash = await executeSmartTx(calls, {
            chainId: chainId as number,
            onSuccess: (h) => { setRepayHash(h) },
          })
          if (hash) setRepayHash(hash)
        } else {
          // EOA: approve first, repay triggered by isApprovalSuccess effect
          setStep('approving')
          setStatusMessage('Please approve token spending in your wallet...')
          emitTxUpdate({ action: 'repay', step: 'approving', statusMessage: 'Please approve token spending...' })

          writeApprove({
            address: contractAddresses.underlyingAddress as Address,
            abi: erc20Abi,
            functionName: 'approve',
            args: [contractAddresses.pTokenAddress as Address, getApprovalAmount()],
          } as any)
        }
      } else {
        // No approval needed
        if (isSmartAccountActive) {
          setStep('repaying')
          setStatusMessage('Repaying with smart account...')
          emitTxUpdate({ action: 'repay', step: 'repaying', statusMessage: 'Repaying with smart account...' })

          const call: TransactionCall = isNative
            ? {
                to: (contractAddresses as any).pTokenAddress as Address,
                data: encodeFunctionData({
                  abi: pbnbAbi as any,
                  functionName: 'repayBorrow',
                  args: [],
                }),
                value: parsedAmount,
              }
            : {
                to: (contractAddresses as any).pTokenAddress as Address,
                data: encodeFunctionData({
                  abi: combinedAbi,
                  functionName: 'repayBorrow',
                  args: [parsedAmount],
                }),
              }

          const hash = await executeSmartTx(call, {
            chainId: chainId as number,
            onSuccess: (h) => { setRepayHash(h) },
          })
          if (hash) setRepayHash(hash)
        } else {
          setStep('repaying')
          setStatusMessage('Repaying borrowed amount...')
          emitTxUpdate({ action: 'repay', step: 'repaying', statusMessage: 'Repaying borrowed amount...' })

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
      clearStallTimer()
      isSubmittingRef.current = false
      const msg = err?.message || 'Repay transaction failed'
      setStep('error')
      setError(msg)
      onErrorRef.current?.(err instanceof Error ? err : new Error(msg))
      try {
        let toastId: any
        toastId = toast('Transaction failed', {
          description: msg,
          action: { label: 'Close', onClick: () => toast.dismiss(toastId) },
        })
      } catch {}
    }
  }, [
    address,
    contractAddresses,
    amount,
    parsedAmount,
    needsApproval,
    isNative,
    isSmartAccountActive,
    chainId,
    writeApprove,
    writeRepay,
    refetchAllowance,
    getApprovalAmount,
    executeSmartTx,
    startStallTimer,
    clearStallTimer,
  ])

  // ---- derived state -------------------------------------------------------
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

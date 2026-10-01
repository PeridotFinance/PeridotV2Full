/**
 * use-easy-biconomy.ts
 *
 * Central Biconomy hook for all Easy Mode spoke-chain operations.
 * Callers pass an adapter call function; this hook owns:
 *  - BICONOMY_ONCHAIN_APPROVAL_REQUIRED approval + retry
 *  - INSUFFICIENT_FOR_FEE_BUDGET and ROUTE_NOT_FOUND error mapping
 *  - Status polling after a superTxHash is produced
 *  - Phase event listener (peridot:biconomy-phase)
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import {
  useWriteContract,
  useWaitForTransactionReceipt,
  usePublicClient,
} from 'wagmi'
import { erc20Abi, encodeFunctionData, type Address } from 'viem'
import { biconomyAdapter } from '@/lib/biconomyAdapter'
import { formatTokenAmountFromWei, getRequiredWeiFromPayload, parseFeeBudgetErrorPayload } from '@/lib/crossChainFees'
import { toast } from 'sonner'
import { useActiveWallet } from '@/hooks/use-active-wallet'
import { useSmartExecution } from '@/hooks/use-smart-execution'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BiconomyResult {
  superTxHash: string
  trackingUrl?: string
  fee?: any
  feeDetails?: any
  meeScanLink?: string
}

export type BiconomyStep = 'idle' | 'approving' | 'executing' | 'polling' | 'success' | 'error'

interface UseEasyBiconomyProps {
  /** Decimals of the token being approved (needed for fee-budget error messages) */
  underlyingDecimals?: number
  /** Token symbol for user-facing messages */
  assetSymbol?: string
  onSuccess?: (result: BiconomyResult) => void
  onError?: (error: Error) => void
}

type AdapterCallFn = () => Promise<BiconomyResult>

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useEasyBiconomy({
  underlyingDecimals = 18,
  assetSymbol = '',
  onSuccess,
  onError,
}: UseEasyBiconomyProps = {}) {
  const { address, isSmartAccountActive } = useActiveWallet()
  const { execute: executeSmartTx } = useSmartExecution()

  // ---- state ---------------------------------------------------------------
  const [step, setStep] = useState<BiconomyStep>('idle')
  const [error, setError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState('')
  const [superTxHash, setSuperTxHash] = useState<string | null>(null)
  const [trackingUrl, setTrackingUrl] = useState<string | undefined>()
  const [fee, setFee] = useState<any>()
  const [feeDetails, setFeeDetails] = useState<any>()
  const [meeLink, setMeeLink] = useState<string | undefined>()
  const [explorerLinks, setExplorerLinks] = useState<string[] | undefined>()
  const [crossChainStatus, setCrossChainStatus] = useState<'idle' | 'pending' | 'executed' | 'failed' | 'unknown'>('idle')

  // ---- refs ----------------------------------------------------------------
  const isSubmittingRef = useRef(false)
  const pendingRetryRef = useRef<AdapterCallFn | null>(null)
  const crossChainPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastStatusRef = useRef<'idle' | 'pending' | 'executed' | 'failed' | 'unknown'>('idle')
  const pollingHashRef = useRef<string | null>(null)
  const onSuccessRef = useRef(onSuccess)
  useEffect(() => { onSuccessRef.current = onSuccess }, [onSuccess])
  const onErrorRef = useRef(onError)
  useEffect(() => { onErrorRef.current = onError }, [onError])

  // ---- approval hooks (for BICONOMY_ONCHAIN_APPROVAL_REQUIRED) -------------
  const { writeContract: writeApprove, data: approveData } = useWriteContract()
  const [approveHash, setApproveHash] = useState<`0x${string}` | undefined>()
  const { isSuccess: isApprovalSuccess } = useWaitForTransactionReceipt({ hash: approveHash })

  useEffect(() => {
    if (approveData) setApproveHash(approveData)
  }, [approveData])

  // When approval confirms and we have a pending retry, execute it
  useEffect(() => {
    if (!isApprovalSuccess || !pendingRetryRef.current) return
    const fn = pendingRetryRef.current
    pendingRetryRef.current = null
    setStatusMessage('Approval confirmed. Retrying...')
    fn().then((result) => {
      handleSuccess(result)
    }).catch((retryErr: any) => {
      handleError(retryErr)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isApprovalSuccess])

  // ---- biconomy phase events -----------------------------------------------
  useEffect(() => {
    const onPhase = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.message) setStatusMessage(detail.message)
    }
    try { window.addEventListener('peridot:biconomy-phase', onPhase) } catch {}
    return () => {
      try { window.removeEventListener('peridot:biconomy-phase', onPhase) } catch {}
    }
  }, [])

  // ---- status polling ------------------------------------------------------
  useEffect(() => {
    if (!superTxHash) return
    if (lastStatusRef.current === 'executed' || lastStatusRef.current === 'failed') return
    if (pollingHashRef.current === superTxHash && crossChainPollRef.current) return

    let cancelled = false
    setCrossChainStatus('pending')
    lastStatusRef.current = 'pending'
    pollingHashRef.current = superTxHash
    let pollCount = 0
    const MAX_POLLS = 72 // 72 × 5s = 6 min

    const poll = async () => {
      if (cancelled || pollCount >= MAX_POLLS) {
        if (crossChainPollRef.current) clearInterval(crossChainPollRef.current)
        crossChainPollRef.current = null
        return
      }
      pollCount++
      try {
        const { status, explorerLinks: links } = await biconomyAdapter.getStatus({ superTxHash })
        if (cancelled) return
        if (status !== lastStatusRef.current) {
          setCrossChainStatus(status as any)
          lastStatusRef.current = status as any
          if (status === 'executed') {
            try { toast('Cross-chain operation executed', { description: 'Transaction confirmed on destination chain.' }) } catch {}
          } else if (status === 'failed') {
            try { toast('Cross-chain execution failed', { description: 'Please check the transaction and retry.' }) } catch {}
          }
        }
        if (links?.length) setExplorerLinks(links)
        if (status === 'executed' || status === 'failed') {
          if (crossChainPollRef.current) clearInterval(crossChainPollRef.current)
          crossChainPollRef.current = null
          pollingHashRef.current = null
        }
      } catch {}
    }

    poll()
    crossChainPollRef.current = setInterval(poll, 5_000)
    return () => {
      cancelled = true
      if (crossChainPollRef.current) clearInterval(crossChainPollRef.current)
      crossChainPollRef.current = null
      pollingHashRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [superTxHash])

  // ---- cleanup on unmount --------------------------------------------------
  useEffect(() => {
    return () => {
      if (crossChainPollRef.current) clearInterval(crossChainPollRef.current)
    }
  }, [])

  // ---- internal helpers ----------------------------------------------------
  const handleSuccess = useCallback((result: BiconomyResult) => {
    isSubmittingRef.current = false
    setSuperTxHash(result.superTxHash)
    setTrackingUrl(result.trackingUrl)
    if (result.fee) setFee(result.fee)
    if (result.feeDetails) setFeeDetails(result.feeDetails)
    if (result.meeScanLink) setMeeLink(result.meeScanLink)
    setStep('success')
    setStatusMessage('Submitted. Bridge in progress...')
    onSuccessRef.current?.(result)
  }, [])

  const handleError = useCallback((err: any) => {
    isSubmittingRef.current = false
    const msg = String(err?.message || err || 'Unknown error')

    if (msg.includes('INSUFFICIENT_FOR_FEE_BUDGET')) {
      const payload = parseFeeBudgetErrorPayload(msg)
      const requiredWei = getRequiredWeiFromPayload(payload)
      let friendly = 'Amount too small to cover the cross-chain fee. Please increase the amount.'
      if (requiredWei && requiredWei > BigInt(0)) {
        const fmt = formatTokenAmountFromWei(requiredWei, underlyingDecimals)
        friendly = `Amount too small. The cross-chain fee requires at least ${fmt} ${assetSymbol}. Please supply a larger amount.`
      }
      setError(friendly)
      setStep('error')
      try { toast('Amount too small', { description: friendly }) } catch {}
      onErrorRef.current?.(new Error(friendly))
      return
    }

    if (/Route not found|BICONOMY_ROUTE_NOT_FOUND/i.test(msg)) {
      const friendly = 'No route found for this amount. Try increasing the amount or switch network.'
      setError(friendly)
      setStep('error')
      try { toast('No route found', { description: friendly, duration: 10_000 }) } catch {}
      onErrorRef.current?.(new Error(friendly))
      return
    }

    setError(msg)
    setStep('error')
    onErrorRef.current?.(new Error(msg))
  }, [underlyingDecimals, assetSymbol])

  // ---- execute -------------------------------------------------------------
  const execute = useCallback(async (adapterCallFn: AdapterCallFn) => {
    if (isSubmittingRef.current) return
    isSubmittingRef.current = true

    setStep('executing')
    setError(null)
    setStatusMessage('Preparing cross-chain operation...')

    try {
      let result: BiconomyResult
      try {
        result = await adapterCallFn()
      } catch (e: any) {
        const msg = String(e?.message || e || '')

        if (msg.startsWith('BICONOMY_ONCHAIN_APPROVAL_REQUIRED:')) {
          try {
            const payload = JSON.parse(msg.slice('BICONOMY_ONCHAIN_APPROVAL_REQUIRED:'.length))
            const spender = payload?.spender as Address | undefined
            const tokenAddress = payload?.tokenAddress as Address | undefined
            const approvalAmount = payload?.amount ? BigInt(payload.amount) : BigInt(2) ** BigInt(256) - BigInt(1)

            if (!spender || !tokenAddress) throw new Error('Approval data incomplete')

            setStep('approving')
            setStatusMessage('Please confirm token approval in wallet...')

            if (isSmartAccountActive) {
              await executeSmartTx({
                to: tokenAddress,
                data: encodeFunctionData({
                  abi: erc20Abi,
                  functionName: 'approve',
                  args: [spender, approvalAmount],
                }),
              }, { onSuccess: (h) => setApproveHash(h as any) })
              // SA approval is immediately confirmed — retry now
              result = await adapterCallFn()
            } else {
              // EOA: store retry and write approve; effect handles retry on receipt
              pendingRetryRef.current = adapterCallFn
              writeApprove({
                address: tokenAddress,
                abi: erc20Abi,
                functionName: 'approve',
                args: [spender, approvalAmount],
              } as any)
              return // effect will call handleSuccess / handleError
            }
          } catch (inner: any) {
            handleError(inner)
            return
          }
        } else {
          handleError(e)
          return
        }
      }

      handleSuccess(result!)
    } catch (err: any) {
      handleError(err)
    }
  }, [isSmartAccountActive, executeSmartTx, writeApprove, handleSuccess, handleError])

  // ---- reset ---------------------------------------------------------------
  const reset = useCallback(() => {
    setStep('idle')
    setError(null)
    setStatusMessage('')
    setSuperTxHash(null)
    setTrackingUrl(undefined)
    setFee(undefined)
    setFeeDetails(undefined)
    setMeeLink(undefined)
    setExplorerLinks(undefined)
    setCrossChainStatus('idle')
    isSubmittingRef.current = false
    pendingRetryRef.current = null
    lastStatusRef.current = 'idle'
    if (crossChainPollRef.current) {
      clearInterval(crossChainPollRef.current)
      crossChainPollRef.current = null
    }
  }, [])

  return {
    execute,
    step,
    statusMessage,
    error,
    superTxHash,
    trackingUrl,
    fee,
    feeDetails,
    meeLink,
    explorerLinks,
    crossChainStatus,
    isLoading: step === 'approving' || step === 'executing' || step === 'polling',
    reset,
  }
}

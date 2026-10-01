import { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
  usePublicClient,
} from 'wagmi'
import { parseUnits, Address, erc20Abi, encodeFunctionData } from 'viem'
import { getAssetContractAddresses } from '@/data/market-data'
import combinedAbi from '@/app/abis/combinedAbi.json'
import { autoVerifyTransaction } from '@/lib/auto-leaderboard-verifier'
import { emitTxUpdate, mapFriendlyError, isRateLimit, isTimeoutError } from '@/lib/txFeedback'
import { parseAndDecodeError } from '@/lib/compound-errors'
import { toast } from 'sonner'
import { resolveHubReadChainId, CHAIN_IDS } from '@/config/contracts'
import { FEATURE_FLAGS } from '@/config/featureFlags'
import { useActiveWallet } from '@/hooks/use-active-wallet'
import { useSmartExecution } from '@/hooks/use-smart-execution'
import { usePrivy, useSendTransaction } from '@privy-io/react-auth'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UseEasyRedeemProps {
  assetId: string
  amount: string
  /** Easy Mode always passes the position's chain here. */
  overrideChainId?: number
  onSuccess?: () => void
  onError?: (error: Error) => void
}

type RedeemStep = 'idle' | 'redeeming' | 'success' | 'error'

// ---------------------------------------------------------------------------
// Pure helper — module-level so it's stable across renders
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

export function useEasyRedeem({
  assetId,
  amount,
  overrideChainId,
  onSuccess,
  onError,
}: UseEasyRedeemProps) {
  const { getAccessToken } = usePrivy()
  const { sendTransaction: privySendTransaction } = useSendTransaction()
  const { chainId } = useAccount()
  const { address, isSmartAccountActive } = useActiveWallet()
  const { execute: executeSmartTx } = useSmartExecution()
  const publicClient = usePublicClient()

  // ---- state ----------------------------------------------------------------
  const [step, setStep] = useState<RedeemStep>('idle')
  const [error, setError] = useState<string | null>(null)
  const [redeemHash, setRedeemHash] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string>('')

  // ---- refs -----------------------------------------------------------------
  /** Single execution guard — prevents double-click & StrictMode double-fire. */
  const isSubmittingRef = useRef(false)
  const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Set to true when the rate-limit fallback path handles the error. */
  const handledRateLimitRef = useRef(false)

  // Stable refs for callbacks (avoids stale closure issues)
  const onSuccessRef = useRef(onSuccess)
  useEffect(() => { onSuccessRef.current = onSuccess }, [onSuccess])
  const onErrorRef = useRef(onError)
  useEffect(() => { onErrorRef.current = onError }, [onError])

  // ---- chain resolution -----------------------------------------------------
  const effectiveChainId = useMemo(() => {
    const base = overrideChainId ?? chainId ?? null
    return (resolveHubReadChainId(base) ?? base) as number | null
  }, [overrideChainId, chainId])

  const contractAddresses = useMemo(
    () => (effectiveChainId ? getAssetContractAddresses(assetId, effectiveChainId) : null),
    [assetId, effectiveChainId],
  )

  // ---- on-chain reads -------------------------------------------------------
  const { data: underlyingDecimals } = useReadContract({
    address: contractAddresses?.underlyingAddress as Address,
    abi: erc20Abi,
    functionName: 'decimals',
    args: [],
    query: { enabled: !!contractAddresses?.underlyingAddress },
    chainId: effectiveChainId as any,
  })

  const decimals = underlyingDecimals ?? 18
  const canRedeem = Boolean(contractAddresses?.pTokenAddress)

  // ---- amount parsing -------------------------------------------------------
  const parsedAmount = useMemo(
    () => (amount ? parseUnits(normalizeAmountStr(amount, decimals), decimals) : BigInt(0)),
    [amount, decimals],
  )

  // ---- wagmi write / receipt ------------------------------------------------
  const {
    writeContract,
    isPending,
    data: redeemData,
    error: writeError,
    reset: resetWrite,
  } = useWriteContract()

  useEffect(() => {
    if (redeemData) setRedeemHash(redeemData)
  }, [redeemData])

  const {
    isLoading: isConfirming,
    isSuccess: isTransactionSuccess,
    error: transactionError,
  } = useWaitForTransactionReceipt({
    hash: redeemHash as `0x${string}`,
  })

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

  // ---- reset ----------------------------------------------------------------
  const reset = useCallback(() => {
    setStep('idle')
    setError(null)
    setRedeemHash(null)
    setStatusMessage('')
    isSubmittingRef.current = false
    clearStallTimer()
    try {
      if (typeof window !== 'undefined') {
        ;(window as any).__PERIDOT_TX_ACTIVE = false
        window.dispatchEvent(new CustomEvent('peridot:tx-idle'))
      }
    } catch {}
  }, [clearStallTimer])

  // ---- success effect -------------------------------------------------------
  useEffect(() => {
    if (!isTransactionSuccess || !redeemHash) return
    clearStallTimer()
    isSubmittingRef.current = false
    setStep('success')
    setStatusMessage('Withdraw successful! Tokens withdrawn.')
    emitTxUpdate({ action: 'withdraw', step: 'success', statusMessage: '', txHash: redeemHash })
    onSuccessRef.current?.()

    try {
      window.dispatchEvent(
        new CustomEvent('peridot:tx-success', {
          detail: {
            type: 'redeem',
            address,
            chainId,
            assetId,
            txHash: redeemHash,
            observed_at: new Date().toISOString(),
            tokenSymbol: assetId?.toUpperCase?.(),
          },
        }),
      )
    } catch {}

    if (address && chainId) {
      getAccessToken().then((token) => {
        autoVerifyTransaction({
          txHash: redeemHash,
          walletAddress: address,
          chainId,
          privyToken: token,
          overrideChainId: chainId,
          onSuccess: (r) => console.log('Redeem verified in leaderboard:', r),
          onError: (e) => console.warn('Auto-verification failed:', e.message),
        }).catch(() => {})
      })
    }
  }, [isTransactionSuccess, redeemHash, clearStallTimer])

  // ---- error effect ---------------------------------------------------------
  useEffect(() => {
    const combinedError = transactionError || writeError
    if (!combinedError) return
    clearStallTimer()
    isSubmittingRef.current = false

    const errObj =
      combinedError instanceof Error ? combinedError : new Error(String(combinedError))
    const decoded = parseAndDecodeError(errObj.message)
    const rawMsg = String(errObj.message || '')

    // The rate-limit fallback already sent a new writeContract — suppress the
    // original error that triggered it.
    if (handledRateLimitRef.current && isRateLimit(rawMsg)) {
      handledRateLimitRef.current = false
      try { resetWrite?.() } catch {}
      emitTxUpdate({
        action: 'withdraw',
        step: 'error',
        statusMessage: 'Temporarily rate limited. Please retry shortly.',
      })
      setStep('error')
      return
    }

    if (rawMsg.includes('User rejected')) {
      setError('Withdraw transaction rejected. Please try again.')
      emitTxUpdate({ action: 'withdraw', step: 'error', statusMessage: 'Withdraw transaction rejected.' })
      reset()
    } else {
      const msg = isRateLimit(rawMsg)
        ? 'Temporarily rate limited. Please wait 30–60 seconds, then try again.'
        : isTimeoutError(rawMsg)
        ? 'Transaction timed out. Please check your connection and try again.'
        : mapFriendlyError(rawMsg) || `Transaction failed: ${decoded}`
      setError(msg)
      emitTxUpdate({ action: 'withdraw', step: 'error', statusMessage: msg })
      onErrorRef.current?.(errObj)
      setStep('error')
    }
  }, [transactionError, writeError, reset, clearStallTimer])

  // ---- auto-clear error when amount changes ---------------------------------
  useEffect(() => {
    if (step === 'error') {
      setError(null)
      setStep('idle')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount])

  // ---- cleanup on unmount ---------------------------------------------------
  useEffect(() => {
    return () => {
      clearStallTimer()
      isSubmittingRef.current = false
    }
  }, [clearStallTimer])

  // ---- main execute ---------------------------------------------------------
  const executeRedeem = useCallback(async () => {
    // Guard: prevent concurrent calls
    if (isSubmittingRef.current) return

    // Validate
    if (!address || !contractAddresses || !amount || parsedAmount <= BigInt(0)) {
      setError('Invalid parameters for redeem. Aborting.')
      return
    }

    isSubmittingRef.current = true
    setError(null)
    setStep('redeeming')
    setStatusMessage('Submitting withdraw...')
    emitTxUpdate({ action: 'withdraw', step: 'redeeming', statusMessage: 'Submitting withdraw...' })
    startStallTimer()

    try {
      // ------------------------------------------------------------------
      // Preflight: cap to pool cash, simulate with progressive backoff.
      // This avoids revert due to liquidity or rounding issues.
      // ------------------------------------------------------------------
      const getCappedAmount = async (): Promise<bigint> => {
        if (!publicClient) return parsedAmount
        let desired = parsedAmount
        try {
          const cash = (await (publicClient as any).readContract({
            address: contractAddresses.pTokenAddress as any,
            abi: combinedAbi as any,
            functionName: 'getCash',
          })) as bigint
          if (typeof cash === 'bigint') {
            const maxByCash = cash > BigInt(0) ? cash - BigInt(1) : BigInt(0)
            if (desired > maxByCash) desired = maxByCash
          }
          let tryAmount = desired
          for (let i = 0; i < 5; i++) {
            if (tryAmount <= BigInt(0)) break
            try {
              await (publicClient as any).simulateContract({
                address: contractAddresses.pTokenAddress as any,
                abi: combinedAbi as any,
                functionName: 'redeemUnderlying',
                args: [tryAmount],
                account: address as any,
              })
              return tryAmount
            } catch {
              tryAmount = (tryAmount * BigInt(9999)) / BigInt(10000)
            }
          }
          return tryAmount
        } catch {
          return desired
        }
      }

      const cappedAmount = await getCappedAmount()

      // ------------------------------------------------------------------
      // Write — Smart Account or EOA path
      // ------------------------------------------------------------------
      const doRedeem = async (): Promise<void> => {
        try {
          if (isSmartAccountActive) {
            setStatusMessage('Withdrawing with smart account...')
            emitTxUpdate({
              action: 'withdraw',
              step: 'redeeming',
              statusMessage: 'Withdrawing with smart account...',
            })
            const hash = await executeSmartTx(
              {
                to: contractAddresses.pTokenAddress as Address,
                data: encodeFunctionData({
                  abi: combinedAbi,
                  functionName: 'redeemUnderlying',
                  args: [cappedAmount],
                }),
              },
              {
                chainId: effectiveChainId as number,
                onSuccess: (h) => setRedeemHash(h as any),
              },
            )
            if (hash) setRedeemHash(hash as any)
          } else {
            // Privy sponsored gas: same shape as use-borrow-transaction.ts.
            // Threshold is effectively "any non-zero redeem" — easy-card
            // already filters by USD upstream, so a $0.01-equivalent floor
            // here would never block a legitimate withdraw. On non-BSC chains
            // (or sponsor failure) fall through to wallet-paid gas.
            const isTestnetPreset = (process.env.NEXT_PUBLIC_NETWORK_PRESET || '').startsWith('testnet')
            const bscChainId = isTestnetPreset ? CHAIN_IDS.BSC_TESTNET : CHAIN_IDS.BSC_MAINNET
            const canSponsor =
              FEATURE_FLAGS.WALLET_PRIVY_EXPERIMENT &&
              effectiveChainId === bscChainId &&
              cappedAmount > BigInt(0)
            let sponsoredOk = false
            if (canSponsor) {
              try {
                setStatusMessage('Withdrawing with sponsored gas...')
                emitTxUpdate({
                  action: 'withdraw',
                  step: 'redeeming',
                  statusMessage: 'Withdrawing with sponsored gas...',
                })
                const { hash } = await privySendTransaction(
                  {
                    to: contractAddresses.pTokenAddress as Address,
                    data: encodeFunctionData({
                      abi: combinedAbi,
                      functionName: 'redeemUnderlying',
                      args: [cappedAmount],
                    }),
                    chainId: bscChainId,
                  },
                  { sponsor: true },
                )
                setRedeemHash(hash as any)
                emitTxUpdate({
                  action: 'withdraw',
                  step: 'redeeming',
                  statusMessage: 'Withdraw submitted (Privy sponsored)...',
                  txHash: hash as any,
                })
                sponsoredOk = true
              } catch (sponsorErr) {
                console.warn('[EasyRedeem] Privy sponsorship failed, falling back to wallet gas:', sponsorErr)
              }
            }
            if (!sponsoredOk) {
              writeContract({
                address: contractAddresses.pTokenAddress as Address,
                abi: combinedAbi,
                functionName: 'redeemUnderlying',
                args: [cappedAmount],
              } as any)
              emitTxUpdate({
                action: 'withdraw',
                step: 'redeeming',
                statusMessage: 'Withdraw submitted...',
              })
            }
          }
        } catch (e: any) {
          const msg = String(e?.message || '')
          if (isRateLimit(msg)) {
            // Rate-limit fallback: try `redeem` (pToken amount) instead.
            handledRateLimitRef.current = true
            try {
              let tid: any
              tid = toast('Network is rate limited', {
                description: 'Switching to alternative withdraw method…',
                action: { label: 'Close', onClick: () => toast.dismiss(tid) },
              })
            } catch {}
            try {
              const pBal = (await (publicClient as any).readContract({
                address: contractAddresses.pTokenAddress as any,
                abi: combinedAbi as any,
                functionName: 'balanceOf',
                args: [address as any],
              })) as bigint
              let tryAmt = pBal
              for (let i = 0; i < 5; i++) {
                if (tryAmt <= BigInt(0)) break
                try {
                  await (publicClient as any).simulateContract({
                    address: contractAddresses.pTokenAddress as any,
                    abi: combinedAbi as any,
                    functionName: 'redeem',
                    args: [tryAmt],
                    account: address as any,
                  })
                  writeContract({
                    address: contractAddresses.pTokenAddress as Address,
                    abi: combinedAbi,
                    functionName: 'redeem',
                    args: [tryAmt],
                  } as any)
                  handledRateLimitRef.current = false
                  return
                } catch {
                  tryAmt = (tryAmt * BigInt(9999)) / BigInt(10000)
                }
              }
            } catch {}
            handledRateLimitRef.current = false
          }
          throw e
        }
      }

      await doRedeem()
      setStatusMessage('Transaction submitted. Waiting for confirmation...')
    } catch (err: any) {
      clearStallTimer()
      isSubmittingRef.current = false
      const msg = err?.message || 'An unexpected error occurred during withdraw.'
      setError(msg)
      setStep('error')
      onErrorRef.current?.(new Error(msg))
    }
  }, [
    address,
    contractAddresses,
    amount,
    parsedAmount,
    writeContract,
    effectiveChainId,
    isSmartAccountActive,
    executeSmartTx,
    publicClient,
    startStallTimer,
    clearStallTimer,
  ])

  return {
    executeRedeem,
    isLoading: isPending || isConfirming,
    canRedeem,
    error,
    step,
    statusMessage,
    redeemHash,
    reset,
  }
}

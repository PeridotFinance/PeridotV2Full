/**
 * use-easy-borrow.ts
 *
 * Clean borrow hook for /app/easy (EasyModeCard).
 * Drop-in replacement for useBorrowTransaction in Easy Mode.
 *
 * Hub chain (BSC / Monad): direct borrow — Smart Account or Privy-sponsored EOA.
 * Spoke chain (Arbitrum, Base, etc.): cross-chain borrow via useEasyBiconomy.
 *
 * Privy sponsorship: borrow >= $0.01 USD or BNB balance < 0.001 BNB on hub.
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
  useSwitchChain,
  useBalance,
} from 'wagmi'
import { parseUnits, formatUnits, Address, erc20Abi, encodeFunctionData } from 'viem'
import { getAssetContractAddresses, getMarketsForChain } from '@/data/market-data'
import { getChainConfig, CHAIN_IDS, isHubChain, resolveHubReadChainId } from '@/config/contracts'
import { FEATURE_FLAGS } from '@/config/featureFlags'
import { TOKENS as BICONOMY_TOKENS } from '@/biconomy/constants'
import combinedAbi from '@/app/abis/combinedAbi.json'
import { biconomyAdapter } from '@/lib/biconomyAdapter'
import { useSmartAccountUpgrade } from '@/components/providers/SmartAccountUpgradeProvider'
import { useSmartAccountStatus } from '@/hooks/use-smart-account-status'
import { useAccountType } from '@/hooks/use-account-type'
import type { ExecutionMode } from '@/biconomy/constants'
import { emitTxUpdate, mapFriendlyError, isRateLimit, isTimeoutError } from '@/lib/txFeedback'
import { autoVerifyTransaction } from '@/lib/auto-leaderboard-verifier'
import { toast } from 'sonner'
import { useActiveWallet } from '@/hooks/use-active-wallet'
import { useSmartExecution } from '@/hooks/use-smart-execution'
import { useBorrowingPower } from '@/hooks/use-borrowing-power'
import { useEasyBiconomy } from '@/hooks/use-easy-biconomy'
import { usePrivy, useSendTransaction } from '@privy-io/react-auth'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UseEasyBorrowProps {
  assetId: string
  amount: string
  onSuccess?: () => void
  onError?: (error: Error) => void
}

type BorrowStep = 'idle' | 'borrowing' | 'success' | 'error'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRIVY_SPONSORED_USD_THRESHOLD = 0.01
const BNB_GAS_THRESHOLD = parseUnits('0.001', 18)

// ---------------------------------------------------------------------------
// Pure helper
// ---------------------------------------------------------------------------

function normalizeAmountStr(raw: string, dec: number): string {
  if (!raw) return '0'
  const s = String(raw).trim().replace(/,/g, '')
  if (s === '' || s === '.') return '0'
  if (/e/i.test(s)) {
    const n = Number(s)
    if (!isFinite(n) || isNaN(n)) return '0'
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

export function useEasyBorrow({
  assetId,
  amount,
  onSuccess,
  onError,
}: UseEasyBorrowProps) {
  const { getAccessToken } = usePrivy()
  const { chainId } = useAccount()
  const { address, signerAddress, isSmartAccountActive } = useActiveWallet()
  const { execute: executeSmartTx } = useSmartExecution()
  const { switchChainAsync } = useSwitchChain()
  const { sendTransaction: privySendTransaction } = useSendTransaction()
  const { meeAuthorization } = useSmartAccountUpgrade()
  const { accountType } = useAccountType()
  const { smartAccountAddress: detectedSmartAccountAddress } = useSmartAccountStatus()

  const borrowingPowerHook = useBorrowingPower()
  const borrowingPower = borrowingPowerHook.borrowingPower

  // ---- state ---------------------------------------------------------------
  const [step, setStep] = useState<BorrowStep>('idle')
  const [error, setError] = useState<string | null>(null)
  const [borrowHash, setBorrowHash] = useState<`0x${string}` | undefined>()
  const [statusMessage, setStatusMessage] = useState('')

  // ---- refs ----------------------------------------------------------------
  const isSubmittingRef = useRef(false)
  const onSuccessRef = useRef(onSuccess)
  useEffect(() => { onSuccessRef.current = onSuccess }, [onSuccess])
  const onErrorRef = useRef(onError)
  useEffect(() => { onErrorRef.current = onError }, [onError])

  // ---- biconomy (spoke chain path) -----------------------------------------
  const biconomy = useEasyBiconomy({
    assetSymbol: assetId?.toUpperCase(),
    onSuccess: () => {
      setStep('success')
      setStatusMessage('Borrow submitted cross-chain.')
      onSuccessRef.current?.()
    },
    onError: (e) => {
      setStep('error')
      setError(e.message)
      onErrorRef.current?.(e)
    },
  })

  // ---- chain resolution ----------------------------------------------------
  const isTestnetPreset = (process.env.NEXT_PUBLIC_NETWORK_PRESET || '').startsWith('testnet')
  const bscChainId = isTestnetPreset ? CHAIN_IDS.BSC_TESTNET : CHAIN_IDS.BSC_MAINNET

  const isBiconomyCrossChain = Boolean(
    FEATURE_FLAGS.CROSS_CHAIN_BORROW_BICONOMY &&
    typeof chainId === 'number' &&
    !isHubChain(chainId)
  )

  // ---- asset/market resolution ---------------------------------------------
  const allAssets = chainId ? getMarketsForChain(chainId) : []
  const currentAsset = allAssets.find(a => a.id === assetId)

  const effectiveChainId = useMemo(() => {
    const base = chainId ?? null
    return (resolveHubReadChainId(base) ?? base) as number | null
  }, [chainId])

  const contractAddresses = useMemo(
    () => (effectiveChainId ? getAssetContractAddresses(assetId, effectiveChainId) : null),
    [assetId, effectiveChainId],
  )

  const bscContractAddresses = useMemo(
    () => getAssetContractAddresses(assetId, bscChainId),
    [assetId, bscChainId],
  )

  // Biconomy spoke-chain config
  const mapChainToBiconomyKey = (cid?: number | null): keyof typeof BICONOMY_TOKENS | undefined => {
    switch (cid) {
      case 1: return 'mainnet'
      case 137: return 'polygon'
      case 42161: return 'arbitrum'
      case 8453: return 'base'
      case 43114: return 'avalanche'
      default: return undefined
    }
  }
  const biconomyNetKey = mapChainToBiconomyKey(chainId)
  const assetSymbolUpper = (currentAsset?.symbol || assetId || '').toUpperCase()
  const targetTokenForBiconomy = useMemo(() =>
    biconomyNetKey ? (BICONOMY_TOKENS as any)[biconomyNetKey]?.[assetSymbolUpper] as Address | undefined : undefined,
    [biconomyNetKey, assetSymbolUpper],
  )
  const pTokenOnBsc = useMemo(() => {
    const cfg = getChainConfig(bscChainId) as any
    return cfg?.markets?.[assetSymbolUpper]?.pToken as Address | undefined
  }, [bscChainId, assetSymbolUpper])

  const executionMode: ExecutionMode = useMemo(() => {
    if (accountType === 'SMART_ACCOUNT') return 'smart-account'
    if (accountType === 'EOA_7702' && meeAuthorization) return 'eoa-7702'
    return 'eoa'
  }, [accountType, meeAuthorization])

  const biconomySmartAccountAddress = useMemo(() => {
    if (accountType !== 'SMART_ACCOUNT') return undefined
    return detectedSmartAccountAddress as Address | undefined
  }, [accountType, detectedSmartAccountAddress])

  // ---- decimals ------------------------------------------------------------
  const { data: underlyingDecimals } = useReadContract({
    address: contractAddresses?.underlyingAddress as Address,
    abi: erc20Abi,
    functionName: 'decimals',
    args: [],
    query: { enabled: !!contractAddresses?.underlyingAddress },
    chainId: effectiveChainId as any,
  })
  const decimals = underlyingDecimals ?? 18

  // ---- amount parsing ------------------------------------------------------
  const parsedAmount = useMemo(
    () => (amount ? parseUnits(normalizeAmountStr(amount, decimals), decimals) : BigInt(0)),
    [amount, decimals],
  )

  // ---- BNB balance (for sponsorship threshold) ----------------------------
  const { data: bnbBalance } = useBalance({
    address,
    chainId: bscChainId,
    query: { enabled: !!address },
  })

  // ---- canBorrow -----------------------------------------------------------
  const canBorrow = Boolean(
    isBiconomyCrossChain
      ? pTokenOnBsc && targetTokenForBiconomy
      : contractAddresses?.pTokenAddress || bscContractAddresses?.pTokenAddress,
  )

  // ---- wagmi write / receipt -----------------------------------------------
  const {
    writeContract: writeBorrow,
    data: borrowData,
    error: writeError,
    reset: resetWrite,
  } = useWriteContract()

  useEffect(() => {
    if (borrowData) setBorrowHash(borrowData)
  }, [borrowData])

  const {
    isLoading: isConfirming,
    isSuccess: isTransactionSuccess,
    error: transactionError,
  } = useWaitForTransactionReceipt({ hash: borrowHash })

  // ---- success effect ------------------------------------------------------
  useEffect(() => {
    if (!isTransactionSuccess || !borrowHash) return
    isSubmittingRef.current = false
    setStep('success')
    setStatusMessage('Borrow successful!')
    emitTxUpdate({ action: 'borrow', step: 'success', statusMessage: '', txHash: borrowHash })
    onSuccessRef.current?.()

    try {
      window.dispatchEvent(new CustomEvent('peridot:tx-success', {
        detail: {
          type: 'borrow', address, chainId, assetId, txHash: borrowHash,
          observed_at: new Date().toISOString(),
          tokenSymbol: assetId?.toUpperCase?.(),
        },
      }))
    } catch {}

    if (address && chainId) {
      getAccessToken().then((token) => {
        autoVerifyTransaction({
          txHash: borrowHash, walletAddress: address, chainId,
          privyToken: token, actionType: 'borrow',
          onSuccess: (r) => console.log('Borrow verified in leaderboard:', r),
          onError: (e) => console.warn('Auto-verification failed:', e.message),
        }).catch(() => {})
      })
    }
  }, [isTransactionSuccess, borrowHash])

  // ---- error effect --------------------------------------------------------
  useEffect(() => {
    const combinedError = transactionError || writeError
    if (!combinedError) return
    isSubmittingRef.current = false

    const errObj = combinedError instanceof Error ? combinedError : new Error(String(combinedError))
    const rawMsg = String(errObj.message || '')

    if (rawMsg.includes('User rejected') || rawMsg.toLowerCase().includes('user denied')) {
      setError('Borrow rejected. Please try again.')
      emitTxUpdate({ action: 'borrow', step: 'error', statusMessage: 'Borrow rejected.' })
      setStep('idle')
      try { resetWrite?.() } catch {}
    } else {
      const msg = isRateLimit(rawMsg)
        ? 'Temporarily rate limited. Please wait 30–60 seconds, then try again.'
        : isTimeoutError(rawMsg)
        ? 'Transaction timed out. Please check your connection and try again.'
        : mapFriendlyError(rawMsg) || rawMsg
      setError(msg)
      emitTxUpdate({ action: 'borrow', step: 'error', statusMessage: msg })
      onErrorRef.current?.(errObj)
      setStep('error')
    }
  }, [transactionError, writeError])

  // ---- auto-clear error when amount changes --------------------------------
  useEffect(() => {
    if (step === 'error') {
      setError(null)
      setStep('idle')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount])

  // ---- reset ---------------------------------------------------------------
  const reset = useCallback(() => {
    setStep('idle')
    setError(null)
    setBorrowHash(undefined)
    setStatusMessage('')
    isSubmittingRef.current = false
    biconomy.reset()
    try {
      if (typeof window !== 'undefined') {
        ;(window as any).__PERIDOT_TX_ACTIVE = false
        window.dispatchEvent(new CustomEvent('peridot:tx-idle'))
      }
    } catch {}
  }, [biconomy.reset])

  // ---- executeBorrow -------------------------------------------------------
  const executeBorrow = useCallback(async () => {
    if (isSubmittingRef.current) return

    if (!address || !amount || parsedAmount <= BigInt(0)) {
      setError('Invalid parameters for borrow. Aborting.')
      return
    }

    isSubmittingRef.current = true
    setError(null)
    setStep('borrowing')
    setStatusMessage('Submitting borrow...')
    emitTxUpdate({ action: 'borrow', step: 'borrowing', statusMessage: 'Submitting borrow...' })

    try {
      if (typeof window !== 'undefined') {
        ;(window as any).__PERIDOT_TX_ACTIVE = true
        window.dispatchEvent(new CustomEvent('peridot:tx-active'))
      }
    } catch {}

    try {
      // ── Borrowing power validation ─────────────────────────────────────
      if (borrowingPower.availableBorrowingPowerUSD <= 0) {
        const price = currentAsset?.oraclePrice || currentAsset?.price || 1
        const borrowValueUSD = parseFloat(normalizeAmountStr(amount, decimals)) * price
        if (borrowValueUSD > borrowingPower.availableBorrowingPowerUSD) {
          throw new Error(
            `Insufficient borrowing power. Available: $${borrowingPower.availableBorrowingPowerUSD.toFixed(2)}`,
          )
        }
      }

      // ── Biconomy cross-chain path ──────────────────────────────────────
      if (isBiconomyCrossChain) {
        if (!pTokenOnBsc) throw new Error('Cross-chain configuration not ready.')
        isSubmittingRef.current = false // biconomy hook owns its own guard
        await biconomy.execute(() => biconomyAdapter.startBorrow({
          userAddress: address as Address,
          smartAccountAddress: biconomySmartAccountAddress,
          destinationChainId: bscChainId,
          pTokenAddress: pTokenOnBsc,
          amountWei: parsedAmount,
          targetChainId: chainId ?? bscChainId,
          targetTokenAddress: targetTokenForBiconomy,
          slippage: 0.1,
          sponsorship: true,
          meeAuthorization: meeAuthorization ? [meeAuthorization].filter(Boolean) : undefined,
          executionMode,
        } as any))
        return
      }

      // ── Hub chain path ────────────────────────────────────────────────
      const targetAddr = (bscContractAddresses?.pTokenAddress || contractAddresses?.pTokenAddress) as Address | undefined
      if (!targetAddr) throw new Error(`${assetSymbolUpper} is not available on BSC.`)

      // Switch to hub chain if needed
      if (chainId !== bscChainId) {
        try {
          toast('Switching to BSC to borrow', { description: 'Your borrow will be signed on BSC.' })
          await switchChainAsync({ chainId: bscChainId })
        } catch {
          throw new Error('Network switch to BSC was declined. Please switch manually and retry.')
        }
      }

      // Smart Account: direct execute
      if (isSmartAccountActive) {
        setStatusMessage('Borrowing with smart account...')
        const hash = await executeSmartTx(
          {
            to: targetAddr,
            data: encodeFunctionData({ abi: combinedAbi, functionName: 'borrow', args: [parsedAmount] }),
          },
          { chainId: bscChainId, onSuccess: (h) => setBorrowHash(h as any) },
        )
        if (hash) setBorrowHash(hash as any)
        setStatusMessage('Transaction submitted. Waiting for confirmation...')
        return
      }

      // EOA: Privy sponsored or direct
      const price = currentAsset?.oraclePrice || currentAsset?.price || 1
      const borrowValueUSD = parseFloat(normalizeAmountStr(amount, decimals)) * price
      const bnbValue = bnbBalance?.value ?? BigInt(0)
      const shouldSponsor =
        FEATURE_FLAGS.WALLET_PRIVY_EXPERIMENT &&
        (borrowValueUSD >= PRIVY_SPONSORED_USD_THRESHOLD || bnbValue < BNB_GAS_THRESHOLD)

      if (shouldSponsor) {
        setStatusMessage('Borrowing with sponsored gas...')
        emitTxUpdate({ action: 'borrow', step: 'borrowing', statusMessage: 'Borrowing with sponsored gas...' })
        try {
          const { hash } = await privySendTransaction(
            {
              to: targetAddr,
              data: encodeFunctionData({ abi: combinedAbi, functionName: 'borrow', args: [parsedAmount] }),
              chainId: bscChainId,
            },
            { sponsor: true },
          )
          setBorrowHash(hash as `0x${string}`)
          setStatusMessage('Borrow submitted. Waiting for confirmation...')
          emitTxUpdate({ action: 'borrow', step: 'borrowing', statusMessage: 'Borrow submitted (sponsored)...', txHash: hash })
          return
        } catch (sponsorErr) {
          console.warn('[EasyBorrow] Privy sponsorship failed, falling back to wallet gas:', sponsorErr)
        }
      }

      // Fallback: standard wagmi write
      setStatusMessage('Please confirm in wallet...')
      writeBorrow({
        address: targetAddr,
        abi: combinedAbi,
        functionName: 'borrow',
        args: [parsedAmount],
      } as any)
      setStatusMessage('Transaction submitted. Waiting for confirmation...')
    } catch (err: any) {
      isSubmittingRef.current = false
      const msg = err?.message || 'An unexpected error occurred during borrow.'
      setError(msg)
      setStep('error')
      onErrorRef.current?.(new Error(msg))
    }
  }, [
    address, amount, parsedAmount, chainId, bscChainId,
    isBiconomyCrossChain, pTokenOnBsc, bscContractAddresses, contractAddresses,
    isSmartAccountActive, executeSmartTx, privySendTransaction, writeBorrow,
    switchChainAsync, biconomy, biconomySmartAccountAddress, targetTokenForBiconomy,
    meeAuthorization, executionMode, borrowingPower, currentAsset, decimals,
    assetSymbolUpper, bnbBalance,
  ])

  const isLoading =
    step === 'borrowing' ||
    isConfirming ||
    biconomy.isLoading

  const effectiveStatusMessage =
    biconomy.step !== 'idle' ? (biconomy.statusMessage || statusMessage) : statusMessage

  return {
    executeBorrow,
    isLoading,
    canBorrow,
    error: error || biconomy.error,
    step,
    statusMessage: effectiveStatusMessage,
    borrowHash,
    borrowingPower,
    // Cross-chain state
    crossChainStatus: biconomy.crossChainStatus,
    biconomyTrackingUrl: biconomy.trackingUrl,
    biconomySuperTxHash: biconomy.superTxHash,
    reset,
  }
}

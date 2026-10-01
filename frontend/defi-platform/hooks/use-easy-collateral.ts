/**
 * use-easy-collateral.ts
 *
 * Clean enable-collateral hook for /app/easy (EasyModeCard).
 * Drop-in replacement for useEnableCollateralTransaction in Easy Mode.
 *
 * Hub chain (BSC / Monad): direct enterMarkets — Smart Account or Privy-sponsored EOA.
 * Spoke chain (Arbitrum, Base, etc.): cross-chain via useEasyBiconomy.
 *
 * Collateral always lives on BSC hub. If the wallet is on a spoke chain:
 *  - EOA: switches to BSC, calls enterMarkets (sponsored first, fallback wagmi)
 *  - Smart Account: executes directly on BSC via executeSmartTx
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
  useSwitchChain,
} from 'wagmi'
import { Address, encodeFunctionData } from 'viem'
import { getMarketsForChain } from '@/data/market-data'
import { getChainConfig, CHAIN_IDS, isHubChain } from '@/config/contracts'
import { FEATURE_FLAGS } from '@/config/featureFlags'
import { TOKENS as BICONOMY_TOKENS } from '@/biconomy/constants'
import combinedAbi from '@/app/abis/combinedAbi.json'
import { biconomyAdapter } from '@/lib/biconomyAdapter'
import { toast } from 'sonner'
import { useActiveWallet } from '@/hooks/use-active-wallet'
import { useSmartExecution } from '@/hooks/use-smart-execution'
import { useEasyBiconomy } from '@/hooks/use-easy-biconomy'
import { useSendTransaction } from '@privy-io/react-auth'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UseEasyCollateralProps {
  assetId: string
  onSuccess?: () => void
  onError?: (error: Error) => void
}

type CollateralStep = 'idle' | 'entering' | 'success' | 'error'

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useEasyCollateral({
  assetId,
  onSuccess,
  onError,
}: UseEasyCollateralProps) {
  const { chainId } = useAccount()
  const { address, isSmartAccountActive } = useActiveWallet()
  const { execute: executeSmartTx } = useSmartExecution()
  const { switchChainAsync } = useSwitchChain()
  const { sendTransaction: privySendTransaction } = useSendTransaction()

  // ---- state ---------------------------------------------------------------
  const [step, setStep] = useState<CollateralStep>('idle')
  const [error, setError] = useState<string | null>(null)
  const [enterHash, setEnterHash] = useState<`0x${string}` | undefined>()
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
      setStatusMessage('Collateral enabled cross-chain.')
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
    FEATURE_FLAGS.CROSS_CHAIN_COLLATERAL_BICONOMY &&
    typeof chainId === 'number' &&
    !isHubChain(chainId)
  )

  // ---- asset resolution ----------------------------------------------------
  const asset = useMemo(() => {
    const markets = getMarketsForChain(bscChainId)
    return markets.find(a => a.id === assetId)
  }, [assetId, bscChainId])

  const assetSymbolUpper = (asset?.symbol || assetId || '').toUpperCase()

  const bscConfig = useMemo(() => getChainConfig(bscChainId) as any, [bscChainId])
  const controllerOnBsc = bscConfig?.unitrollerProxy as Address | undefined
  const pTokenOnBsc = bscConfig?.markets?.[assetSymbolUpper]?.pToken as Address | undefined

  // Biconomy spoke-chain token
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
  const sourceTokenForBiconomy = useMemo(() =>
    biconomyNetKey ? (BICONOMY_TOKENS as any)[biconomyNetKey]?.[assetSymbolUpper] as Address | undefined : undefined,
    [biconomyNetKey, assetSymbolUpper],
  )

  // ---- wagmi direct enter (fallback for EOA) -------------------------------
  const { writeContract: writeDirectEnter, data: directEnterData } = useWriteContract()

  useEffect(() => {
    if (directEnterData) setEnterHash(directEnterData)
  }, [directEnterData])

  const { isSuccess: isDirectSuccess } = useWaitForTransactionReceipt({ hash: enterHash })

  useEffect(() => {
    if (!isDirectSuccess) return
    isSubmittingRef.current = false
    setStep('success')
    setStatusMessage('Collateral enabled!')
    try {
      window.dispatchEvent(new CustomEvent('peridot:tx-success', {
        detail: { type: 'enable-collateral', address, chainId, assetId },
      }))
    } catch {}
    onSuccessRef.current?.()
  }, [isDirectSuccess])

  // ---- reset ---------------------------------------------------------------
  const reset = useCallback(() => {
    setStep('idle')
    setError(null)
    setEnterHash(undefined)
    setStatusMessage('')
    isSubmittingRef.current = false
    biconomy.reset()
  }, [biconomy.reset])

  // ---- executeEnableCollateral --------------------------------------------
  const executeEnableCollateral = useCallback(async () => {
    if (isSubmittingRef.current) return

    if (!address) {
      setError('Please connect your wallet first.')
      return
    }

    if (!controllerOnBsc || !pTokenOnBsc) {
      setError('Contract configuration not found for BSC. Please retry.')
      return
    }

    isSubmittingRef.current = true
    setError(null)
    setStep('entering')
    setStatusMessage('Enabling collateral...')

    try {
      // ── Biconomy cross-chain path ──────────────────────────────────────
      if (isBiconomyCrossChain && sourceTokenForBiconomy) {
        isSubmittingRef.current = false // biconomy owns its guard
        await biconomy.execute(() => (biconomyAdapter as any).startEnableCollateral?.({
          userAddress: address as Address,
          destinationChainId: bscChainId,
          pTokenAddress: pTokenOnBsc,
        }))
        return
      }

      // ── Hub chain path ────────────────────────────────────────────────
      const enterTxData = encodeFunctionData({
        abi: combinedAbi as any,
        functionName: 'enterMarkets',
        args: [[pTokenOnBsc]],
      })

      // Switch to BSC hub if needed
      if (chainId !== bscChainId) {
        try {
          toast('Switching to BSC to enable collateral', {
            description: 'A quick signature on BSC is needed — your collateral lives there.',
          })
          await switchChainAsync({ chainId: bscChainId })
        } catch {
          throw new Error('Network switch to BSC was declined. Please switch manually and retry.')
        }
      }

      // Smart Account: execute directly
      if (isSmartAccountActive) {
        setStatusMessage('Enabling with smart account...')
        const hash = await executeSmartTx(
          { to: controllerOnBsc, data: enterTxData },
          {
            chainId: bscChainId,
            onSuccess: (h) => {
              setEnterHash(h as any)
              isSubmittingRef.current = false
              setStep('success')
            },
          },
        )
        if (hash) {
          setEnterHash(hash as any)
          isSubmittingRef.current = false
          setStep('success')
        }
        return
      }

      // EOA: Privy sponsored first, then fallback
      if (FEATURE_FLAGS.WALLET_PRIVY_EXPERIMENT) {
        setStatusMessage('Enabling with sponsored gas...')
        try {
          const { hash } = await privySendTransaction(
            { to: controllerOnBsc, data: enterTxData, chainId: bscChainId },
            { sponsor: true },
          )
          setEnterHash(hash as `0x${string}`)
          return // receipt watcher handles step → 'success'
        } catch (sponsorErr) {
          console.warn('[EasyCollateral] Privy sponsorship failed, falling back to wallet gas:', sponsorErr)
        }
      }

      // Fallback: standard wagmi write
      setStatusMessage('Please confirm in wallet...')
      writeDirectEnter({
        address: controllerOnBsc,
        abi: combinedAbi as any,
        functionName: 'enterMarkets',
        args: [[pTokenOnBsc]],
      } as any)
    } catch (err: any) {
      isSubmittingRef.current = false
      const msg = err?.message || 'Failed to enable collateral.'
      setError(msg)
      setStep('error')
      onErrorRef.current?.(new Error(msg))
    }
  }, [
    address, chainId, bscChainId, isBiconomyCrossChain, sourceTokenForBiconomy,
    controllerOnBsc, pTokenOnBsc, isSmartAccountActive, executeSmartTx,
    privySendTransaction, writeDirectEnter, switchChainAsync, biconomy,
  ])

  const isLoading =
    step === 'entering' ||
    biconomy.isLoading

  const effectiveStatusMessage =
    biconomy.step !== 'idle' ? (biconomy.statusMessage || statusMessage) : statusMessage

  return {
    executeEnableCollateral,
    isLoading,
    error: error || biconomy.error,
    step,
    statusMessage: effectiveStatusMessage,
    enterHash,
    // Cross-chain state
    crossChainStatus: biconomy.crossChainStatus,
    biconomyTrackingUrl: biconomy.trackingUrl,
    reset,
  }
}

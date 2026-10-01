/**
 * use-easy-supply.ts
 *
 * Clean, simplified supply hook used exclusively in /app/easy (EasyModeCard).
 * Drop-in replacement for useSupplyTransaction — same external interface.
 *
 * Differences from use-supply-transaction.ts:
 *  - No dead Axelar code
 *  - No localStorage cross-chain resume (EasyModeTxStatus handles its own)
 *  - No double-execution guard stack (hasExecutedSupply + isSubmittingRef)
 *  - executeSupply is a stable useCallback reference
 *  - Biconomy approval retry handled inline without embedding it inside executeSupplyMint
 *  - Balance + fee validation runs once, after the quote event
 *  - statusHint defined at the top, not buried at line 1918
 *  - Simplified stall timeout (single, clear timeout)
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useAccount, useWriteContract, useReadContract, useWaitForTransactionReceipt, useWalletClient, usePublicClient, useSwitchChain } from 'wagmi'
import { parseUnits, formatUnits, Address, erc20Abi, encodeFunctionData } from 'viem'
import { getAssetContractAddresses, getMarketsForChain } from '@/data/market-data'
import { getChainConfig, CHAIN_IDS, isHubChain } from '@/config/contracts'
import { FEATURE_FLAGS } from '@/config/featureFlags'
import combinedAbi from '@/app/abis/combinedAbi.json'
import pbnbAbi from '@/app/abis/pbnbabi.json'
import { toast } from 'sonner'
import { biconomyAdapter } from '@/lib/biconomyAdapter'
import { TOKENS as BICONOMY_TOKENS } from '@/biconomy/constants'
import { useSmartAccountUpgrade } from '@/components/providers/SmartAccountUpgradeProvider'
import { useSmartAccountStatus } from '@/hooks/use-smart-account-status'
import { useAccountType } from '@/hooks/use-account-type'
import type { ExecutionMode } from '@/biconomy/constants'
import { formatTokenAmountFromWei, getRequiredWeiFromPayload, parseFeeBudgetErrorPayload } from '@/lib/crossChainFees'
import { friendlyTxErrorOrGeneric } from '@/lib/tx-errors'
import { isTransactionDismissed } from '@/lib/dismissedTransactionTracker'
import { useWalletBalance } from '@/hooks/use-wallet-balance'
import { useActiveWallet } from '@/hooks/use-active-wallet'
import { useSmartExecution, TransactionCall } from '@/hooks/use-smart-execution'
import { usePrivy, useSendTransaction } from '@privy-io/react-auth'
import { autoVerifyTransaction } from '@/lib/auto-leaderboard-verifier'

// ─── Types ────────────────────────────────────────────────────────────────────

type SupplyStep = 'idle' | 'approving' | 'supplying' | 'success' | 'error'

/**
 * Structured info extracted from a Biconomy "Not enough EOA balance..." rejection.
 * Surfaced so the UI can auto-adjust the amount to fit (balance − fee − buffer)
 * and re-submit, rather than dead-ending the user with "Something went wrong".
 */
export interface FeeShortfallInfo {
  /** Raw token units Biconomy required (amount + orchestration fee). */
  requiredUnits: bigint
  /** Raw token units the wallet actually held when /execute ran. */
  balanceUnits: bigint
  /** required − balance (raw units). */
  shortfallUnits: bigint
  /** required − amountSent — the orchestration fee Biconomy quoted. */
  feeUnits: bigint
  /** Decimals of the source token, for unit→USD conversion in the UI. */
  decimals: number
  /** USD price of the source token at the time of failure. */
  assetPriceUSD: number
}

const FEE_SHORTFALL_REGEX = /Required:\s*(\d+)\s*,\s*balance:\s*(\d+)\s*,\s*shortfall:\s*(\d+)/i

function parseShortfallFromError(
  message: string,
  amountSentUnits: bigint,
): Pick<FeeShortfallInfo, 'requiredUnits' | 'balanceUnits' | 'shortfallUnits' | 'feeUnits'> | null {
  const m = message.match(FEE_SHORTFALL_REGEX)
  if (!m) return null
  try {
    const requiredUnits = BigInt(m[1])
    const balanceUnits = BigInt(m[2])
    const shortfallUnits = BigInt(m[3])
    const feeUnits = requiredUnits > amountSentUnits ? requiredUnits - amountSentUnits : 0n
    return { requiredUnits, balanceUnits, shortfallUnits, feeUnits }
  } catch {
    return null
  }
}

interface UseEasySupplyProps {
  assetId: string
  amount: string
  destinationChainId?: number
  /** Override the source chain for cross-chain routing (Biconomy). When set, uses
   *  this chain for isBiconomyCrossChain detection and token address lookup instead
   *  of the active wagmi chain. Needed when user's funds are on a different chain
   *  than what wagmi currently reports as the active chain. */
  sourceChainIdOverride?: number
  onSuccess?: () => void
  onError?: (error: Error) => void
}

// ─── Constants ────────────────────────────────────────────────────────────────

const WALLET_STALL_MS = 90_000

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useEasySupply({
  assetId,
  amount,
  destinationChainId,
  sourceChainIdOverride,
  onSuccess,
  onError,
}: UseEasySupplyProps) {
  const { getAccessToken } = usePrivy()
  const { chainId: wagmiChainId } = useAccount()
  // Use override when provided so cross-chain routing targets the chain where the
  // user actually holds funds, not the currently-active wagmi chain.
  const chainId = sourceChainIdOverride ?? wagmiChainId
  const sourcePublicClient = usePublicClient({ chainId: wagmiChainId ?? undefined })
  const { address, signerAddress, isSmartAccountActive, isEmbeddedWallet } = useActiveWallet()
  // Privy embedded (social-login) wallets must send via Privy's own
  // `useSendTransaction` — wagmi's write path emits `wallet_sendTransaction`,
  // which Alchemy's BSC RPC rejects with code -32600/-32602 (the raw
  // ContractFunctionExecutionError users were seeing). External wallets and
  // smart accounts have their own working send paths and skip this.
  const { sendTransaction: privySendTransaction } = useSendTransaction()
  // Request a wallet client configured for the SOURCE chain (not necessarily the active
  // wagmi chain). This is needed when sourceChainIdOverride points to a different chain
  // than what the wallet is currently "on" — e.g. wallet active on Ethereum (1) but
  // funds (and Biconomy payload chainId) are on Arbitrum (42161). Without the chainId
  // here, viem's assertCurrentChain guard throws "Provided chainId '42161' must match
  // the active chainId '1'" when biconomyAdapter calls sendTransaction({ chain: arbitrum }).
  const { data: wagmiWalletClient } = useWalletClient({ chainId: chainId ?? undefined })
  const { execute: executeSmartTx } = useSmartExecution()
  const { switchChainAsync } = useSwitchChain()

  // ─── Core state ─────────────────────────────────────────────────────────────
  const [step, setStep] = useState<SupplyStep>('idle')
  const [error, setError] = useState<string | null>(null)
  const [statusHint, setStatusHint] = useState<string>('')
  const [feeShortfall, setFeeShortfall] = useState<FeeShortfallInfo | null>(null)

  // Transaction hashes
  const [approveHash, setApproveHash] = useState<`0x${string}` | undefined>()
  const [supplyHash, setSupplyHash] = useState<`0x${string}` | undefined>()

  // Biconomy cross-chain state
  const [crossChainStatus, setCrossChainStatus] = useState<'idle' | 'pending' | 'executed' | 'failed' | 'unknown'>('idle')
  const [biconomyTrackingUrl, setBiconomyTrackingUrl] = useState<string | undefined>()
  const [biconomyExplorerLinks, setBiconomyExplorerLinks] = useState<string[] | undefined>()
  const [biconomyBscTxHash, setBiconomyBscTxHash] = useState<`0x${string}` | undefined>()
  const [biconomyFee, setBiconomyFee] = useState<any>()
  const [biconomyFeeDetails, setBiconomyFeeDetails] = useState<any>()
  const [biconomyMeeLink, setBiconomyMeeLink] = useState<string | undefined>()

  // Refs
  const isSubmittingRef = useRef(false)
  const onSuccessCalledRef = useRef(false)
  const verificationSentRef = useRef(false)
  const destBackfillSentRef = useRef(false)
  const biconomySuperTxHashRef = useRef<string | undefined>(undefined)
  const [biconomySuperTxHashState, setBiconomySuperTxHashState] = useState<string | undefined>()
  const crossChainPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollingHashRef = useRef<string | null>(null)
  const lastCrossChainStatusRef = useRef<'idle' | 'pending' | 'executed' | 'failed' | 'unknown'>('idle')
  const lastAmountRef = useRef('')
  const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Stable callback refs for onSuccess/onError
  const onSuccessRef = useRef(onSuccess)
  useEffect(() => { onSuccessRef.current = onSuccess }, [onSuccess])
  const onErrorRef = useRef(onError)
  useEffect(() => { onErrorRef.current = onError }, [onError])

  // ─── Account type helpers ────────────────────────────────────────────────────
  const { meeAuthorization } = useSmartAccountUpgrade()
  const { isSmartAccount: statusSmartAccount, smartAccountAddress: detectedSmartAccountAddress } = useSmartAccountStatus()
  const { accountType } = useAccountType()

  const biconomySmartAccountAddress = useMemo((): Address | undefined => {
    if (!statusSmartAccount || !detectedSmartAccountAddress) return undefined
    return detectedSmartAccountAddress as Address
  }, [statusSmartAccount, detectedSmartAccountAddress])

  // ─── Asset / market resolution ───────────────────────────────────────────────
  const allAssets = chainId ? getMarketsForChain(chainId) : []
  const asset = allAssets.find(a => a.id === assetId)
  const underlyingDecimals = asset?.decimals ?? 18

  // ─── Cross-chain path detection ──────────────────────────────────────────────
  const isBiconomyCrossChain = Boolean(
    FEATURE_FLAGS.CROSS_CHAIN_SUPPLY_BICONOMY &&
    typeof chainId === 'number' &&
    !isHubChain(chainId)
  )

  // ─── Contract addresses ──────────────────────────────────────────────────────
  const contractAddresses = chainId ? getAssetContractAddresses(assetId, chainId) : null
  const chainConfig = chainId ? getChainConfig(chainId) : null
  const controllerAddress = chainConfig && 'unitrollerProxy' in chainConfig ? chainConfig.unitrollerProxy : null
  const isNative = Boolean((contractAddresses as any)?.isNative)

  const canSupplySameChain = Boolean(
    contractAddresses &&
    (contractAddresses as any).pTokenAddress &&
    controllerAddress &&
    (isNative || (contractAddresses as any).underlyingAddress)
  )

  // ─── Biconomy config ─────────────────────────────────────────────────────────
  const assetSymbolUpper = (asset?.symbol || '').toUpperCase()
  const isSourceHubChain = isHubChain(chainId)

  const mapChainToBiconomyKey = (cid?: number | null): keyof typeof BICONOMY_TOKENS | undefined => {
    switch (cid) {
      case 1: return 'mainnet'
      case 10: return 'optimism'
      case 137: return 'polygon'
      case 42161: return 'arbitrum'
      case 8453: return 'base'
      case 43114: return 'avalanche'
      case 10143: return 'monad'
      case 143: return 'monad'
      default: return undefined
    }
  }
  const biconomyNetKey = mapChainToBiconomyKey(chainId)
  const sourceTokenForBiconomy = isSourceHubChain
    ? ((chainConfig as any)?.markets?.[assetSymbolUpper]?.underlying as Address | undefined)
    : (biconomyNetKey ? (BICONOMY_TOKENS as any)[biconomyNetKey]?.[assetSymbolUpper] as Address | undefined : undefined)

  const destinationHubChainId = destinationChainId || CHAIN_IDS.BSC_MAINNET
  const destinationConfig = getChainConfig(destinationHubChainId) as any
  const pTokenOnDestination = (assetSymbolUpper && destinationConfig?.markets?.[assetSymbolUpper]?.pToken) as Address | undefined
  const canSupplyCrossChainBiconomy = Boolean(isBiconomyCrossChain && sourceTokenForBiconomy && pTokenOnDestination)

  const canSupply = isBiconomyCrossChain ? canSupplyCrossChainBiconomy : canSupplySameChain

  // ─── Amount parsing ──────────────────────────────────────────────────────────
  const { data: biconomySourceTokenDecimals } = useReadContract({
    address: (isBiconomyCrossChain ? sourceTokenForBiconomy : undefined) as any,
    abi: erc20Abi,
    functionName: 'decimals',
    args: [],
    query: { enabled: Boolean(isBiconomyCrossChain && sourceTokenForBiconomy) }
  })

  const effectiveAmountDecimals = isBiconomyCrossChain
    ? (typeof biconomySourceTokenDecimals === 'number' ? biconomySourceTokenDecimals : (underlyingDecimals || 18))
    : underlyingDecimals

  const cleanAmount = useCallback((raw: string): string => {
    if (!raw) return '0'
    const s = raw.replace(/[^0-9.]/g, '')
    if (!s.includes('.')) return s
    const [int, frac = ''] = s.split('.')
    const trimmed = frac.slice(0, effectiveAmountDecimals)
    return trimmed.length > 0 ? `${int}.${trimmed}` : int
  }, [effectiveAmountDecimals])

  const parsedAmount = amount ? parseUnits(cleanAmount(amount), effectiveAmountDecimals as number) : BigInt(0)

  // ─── Wallet balance (for fee validation) ─────────────────────────────────────
  const walletBalance = useWalletBalance({ assetId })

  // ─── Allowance (same-chain only) ─────────────────────────────────────────────
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: (contractAddresses?.underlyingAddress as Address),
    abi: erc20Abi,
    functionName: 'allowance',
    args: [address as Address, (contractAddresses?.pTokenAddress as Address)],
    query: {
      enabled: !isBiconomyCrossChain && !!address && !isNative && parsedAmount > BigInt(0) &&
        Boolean(contractAddresses?.underlyingAddress && contractAddresses?.pTokenAddress),
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    }
  })

  const needsApproval = !isBiconomyCrossChain && !isNative && allowance !== undefined && parsedAmount > (allowance as bigint)

  // ─── Write contract hooks ─────────────────────────────────────────────────────
  const { writeContract: writeApprove, data: approveData, error: approveError, reset: resetApprove } = useWriteContract()
  const { writeContract: writeSupply, data: supplyData, error: supplyError, reset: resetSupply } = useWriteContract()

  useEffect(() => { if (approveData) setApproveHash(approveData) }, [approveData])
  useEffect(() => { if (supplyData) setSupplyHash(supplyData) }, [supplyData])

  // ─── Receipt watchers ─────────────────────────────────────────────────────────
  const { isLoading: isApprovalConfirming, isSuccess: isApprovalSuccess, error: approvalReceiptError } = useWaitForTransactionReceipt({ hash: approveHash })
  const { isLoading: isSupplyConfirming, isSuccess: isSupplySuccess, error: supplyReceiptError } = useWaitForTransactionReceipt({ hash: supplyHash })

  // ─── Helpers ──────────────────────────────────────────────────────────────────
  const markIdle = useCallback(() => {
    isSubmittingRef.current = false
    try {
      if (typeof window !== 'undefined') {
        ;(window as any).__PERIDOT_TX_ACTIVE = false
        window.dispatchEvent(new CustomEvent('peridot:tx-idle'))
      }
    } catch {}
  }, [])

  const clearStallTimer = useCallback(() => {
    if (stallTimerRef.current) {
      clearTimeout(stallTimerRef.current)
      stallTimerRef.current = null
    }
  }, [])

  const startStallTimer = useCallback((ms: number, message: string) => {
    clearStallTimer()
    stallTimerRef.current = setTimeout(() => {
      setError(message)
      setStep('error')
      markIdle()
    }, ms)
  }, [clearStallTimer, markIdle])

  const emitTxUpdate = useCallback((txStep: string, message?: string, hash?: string) => {
    try {
      if (typeof window === 'undefined') return
      if (hash && isTransactionDismissed(hash)) return
      const detail: any = { action: 'supply', step: txStep }
      if (message) detail.statusMessage = message
      if (hash) detail.txHash = hash
      if (isBiconomyCrossChain) {
        detail.isCrossChain = true
        if (biconomyFee) detail.biconomyFee = biconomyFee
        if (biconomyFeeDetails) detail.biconomyFeeDetails = biconomyFeeDetails
        if (biconomyTrackingUrl) detail.trackingUrl = biconomyTrackingUrl
        if (biconomyMeeLink) detail.meeScanLink = biconomyMeeLink
        if (crossChainStatus) detail.crossChainStatus = crossChainStatus
      }
      window.dispatchEvent(new CustomEvent('peridot:tx-update', { detail }))
    } catch {}
  }, [isBiconomyCrossChain, biconomyFee, biconomyFeeDetails, biconomyTrackingUrl, biconomyMeeLink, crossChainStatus])

  // ─── Biconomy status polling ──────────────────────────────────────────────────
  const checkBiconomyStatus = useCallback(async (superHash: string) => {
    try {
      const result = await biconomyAdapter.getStatus({ superTxHash: superHash })
      return { status: result.status, explorerLinks: result.explorerLinks, bscTxHash: result.bscTxHash }
    } catch {
      return { status: 'unknown' as const }
    }
  }, [])

  // Start polling when Biconomy superTxHash is available
  useEffect(() => {
    if (!isBiconomyCrossChain || !biconomySuperTxHashState) return
    if (lastCrossChainStatusRef.current === 'executed') return

    let cancelled = false
    if (pollingHashRef.current === biconomySuperTxHashState && crossChainPollRef.current) return

    setCrossChainStatus('pending')
    lastCrossChainStatusRef.current = 'pending'
    pollingHashRef.current = biconomySuperTxHashState
    let pollCount = 0
    const MAX_POLLS = 72 // 72 × 5s = 6 min

    const poll = async () => {
      if (cancelled || pollCount >= MAX_POLLS) {
        if (crossChainPollRef.current) clearInterval(crossChainPollRef.current)
        crossChainPollRef.current = null
        return
      }
      pollCount++
      const { status, explorerLinks, bscTxHash } = await checkBiconomyStatus(biconomySuperTxHashState)
      if (cancelled) return

      if (status !== lastCrossChainStatusRef.current) {
        setCrossChainStatus(status as any)
        lastCrossChainStatusRef.current = status as any

        if (status === 'executed') {
          const cfg = getChainConfig(destinationHubChainId) as any
          const chainName = cfg?.chainNameReadable || 'destination chain'
          try { toast(`Supply executed on ${chainName}`, { description: 'Cross-chain supply completed.' }) } catch {}
          if (!verificationSentRef.current && supplyHash && address && chainId) {
            verificationSentRef.current = true
            fetch('/api/biconomy/verify-crosschain', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ superTxHash: supplyHash, destinationChainId }),
            }).catch(() => {})
          }
        } else if (status === 'failed') {
          try { toast('Cross-chain execution failed', { description: 'Execution on destination chain failed.' }) } catch {}
        }
      }
      if (explorerLinks?.length) setBiconomyExplorerLinks(explorerLinks)
      if (bscTxHash) setBiconomyBscTxHash(bscTxHash)

      // Backfill the destination tx hash on the verified_transactions row so
      // the agent's activity block surfaces a working link instead of
      // suppressing it. Once per session — the endpoint is idempotent.
      if (
        bscTxHash &&
        biconomySuperTxHashState &&
        !destBackfillSentRef.current
      ) {
        destBackfillSentRef.current = true
        try {
          const token = await getAccessToken()
          const { backfillCrossChainDestination } = await import('@/lib/crosschain/backfill')
          await backfillCrossChainDestination({
            sourceKey: biconomySuperTxHashState,
            destinationTxHash: bscTxHash,
            accessToken: token ?? null,
          })
        } catch (err) {
          destBackfillSentRef.current = false
          console.warn('[easy-supply] backfill-destination failed (will retry):', err)
        }
      }

      if (status === 'executed' || status === 'failed') {
        if (crossChainPollRef.current) clearInterval(crossChainPollRef.current)
        crossChainPollRef.current = null
        pollingHashRef.current = null
      }
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
  }, [isBiconomyCrossChain, biconomySuperTxHashState, checkBiconomyStatus])

  // ─── Approval success → proceed to supply ────────────────────────────────────
  const hasProceedAfterApprovalRef = useRef(false)
  useEffect(() => {
    if (!isApprovalSuccess || hasProceedAfterApprovalRef.current) return
    if (step !== 'approving') return
    hasProceedAfterApprovalRef.current = true
    refetchAllowance().then(() => {
      setStep('supplying')
      emitTxUpdate('supplying', 'Approval confirmed! Supplying tokens...')
      doSameChainSupply()
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isApprovalSuccess, step])

  // ─── Supply success ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isSupplySuccess) return
    clearStallTimer()
    markIdle()
    setStep('success')
    emitTxUpdate('success', '', supplyHash)

    if (!onSuccessCalledRef.current) {
      onSuccessCalledRef.current = true
      onSuccessRef.current?.()
    }

    try {
      const detail: any = { type: 'supply', address, chainId, assetId, txHash: supplyHash, observed_at: new Date().toISOString(), tokenSymbol: asset?.symbol || assetId.toUpperCase() }
      if (isBiconomyCrossChain) {
        detail.isCrossChain = true
        if (biconomyFee) detail.biconomyFee = biconomyFee
        if (biconomyFeeDetails) detail.biconomyFeeDetails = biconomyFeeDetails
        if (biconomyTrackingUrl) detail.trackingUrl = biconomyTrackingUrl
        if (biconomyMeeLink) detail.meeScanLink = biconomyMeeLink
        if (crossChainStatus) detail.crossChainStatus = crossChainStatus
      }
      window.dispatchEvent(new CustomEvent('peridot:tx-success', { detail }))
    } catch {}

    // Leaderboard pre-verify (same-chain only — cross-chain uses verify-crosschain)
    if (supplyHash && address && chainId && asset && !isBiconomyCrossChain) {
      const k = `peridot:preverify:${supplyHash}`
      try { if (sessionStorage.getItem(k)) return; sessionStorage.setItem(k, '1') } catch {}
      const storedRef = (() => { try { return sessionStorage.getItem('referralCode') } catch { return null } })()
      getAccessToken().then(token => {
        fetch('/api/leaderboard/pre-verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
          body: JSON.stringify({
            txHash: supplyHash, walletAddress: address, chainId,
            actionType: 'supply', amount: cleanAmount(amount),
            usdValue: parseFloat(cleanAmount(amount)) * (asset.price || 0),
            tokenSymbol: asset.symbol, referralCode: storedRef,
          }),
        }).then(async res => {
          const result = await res.json()
          if (res.ok && result.success) {
            try { autoVerifyTransaction({ txHash: supplyHash, walletAddress: address, chainId, privyToken: token }).catch(() => {}) } catch {}
          }
        }).catch(() => {})
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSupplySuccess])

  // ─── Approval error handling ──────────────────────────────────────────────────
  useEffect(() => {
    const err = approveError || approvalReceiptError
    if (!err) return
    const msg = err instanceof Error ? err.message : String(err)
    const lc = msg.toLowerCase()
    clearStallTimer()
    if (lc.includes('user rejected') || lc.includes('user denied') || lc.includes('rejected by user')) {
      setError('Approval rejected. Please try again.')
      setStep('idle')
    } else {
      setError(friendlyTxErrorOrGeneric(msg))
      setStep('error')
    }
    markIdle()
    emitTxUpdate('error', msg)
    resetApprove()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approveError, approvalReceiptError])

  // ─── Supply error handling ────────────────────────────────────────────────────
  useEffect(() => {
    const err = supplyError || supplyReceiptError
    if (!err) return
    const msg = err instanceof Error ? err.message : String(err)
    const lc = msg.toLowerCase()
    clearStallTimer()
    let friendly = msg
    if (lc.includes('user rejected') || lc.includes('user denied') || lc.includes('rejected by user')) {
      setError('Supply rejected. Please try again.')
      setStep('idle')
      markIdle()
      emitTxUpdate('error', 'Supply rejected.')
      resetSupply()
      return
    } else if (lc.includes('rate limit') || lc.includes('too many requests')) {
      friendly = 'Temporarily rate limited. Please wait 30–60 seconds, then try again.'
    } else if (lc.includes('timeout') || lc.includes('timed out')) {
      friendly = 'Transaction timed out. Please check your connection and try again.'
    }
    setError(friendlyTxErrorOrGeneric(friendly))
    setStep('error')
    markIdle()
    emitTxUpdate('error', friendly)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplyError, supplyReceiptError])

  // ─── Amount-change resets error after insufficient-balance ───────────────────
  useEffect(() => {
    if (error && /insufficient balance|not enough balance/i.test(error) && step === 'error') {
      const cur = cleanAmount(amount || '')
      const last = lastAmountRef.current
      if (cur && last && cur !== last) {
        setError(null)
        setStep('idle')
        setBiconomyFee(undefined)
        setBiconomyFeeDetails(undefined)
        isSubmittingRef.current = false
        try { window.dispatchEvent(new CustomEvent('peridot:tx-idle')) } catch {}
      }
    }
  }, [amount, error, step, cleanAmount])

  // ─── Privy embedded-wallet send ───────────────────────────────────────────────
  // Sends a single call through Privy's `useSendTransaction` instead of wagmi.
  // Two-stage, mirroring use-agent-execution: (1) sponsored + silent — the hub
  // chain's gas is covered via our Pimlico policy / Privy credits, so the user
  // never sees a popup; (2) on sponsorship failure, fall back to a self-paid
  // popup with an explicit gas limit (Privy doesn't auto-estimate on the
  // self-paid path → "intrinsic gas too low" without it). The silent self-paid
  // middle step is skipped on purpose: that's the one Privy routes through
  // Alchemy's `wallet_sendTransaction`, which the BSC RPC rejects.
  const sendViaPrivyEmbedded = useCallback(async (
    to: Address,
    data: `0x${string}`,
    value?: bigint,
  ): Promise<`0x${string}`> => {
    const pimlicoPolicyId = process.env.NEXT_PUBLIC_PIMLICO_SPONSORSHIP_POLICY_ID

    const attempt = async (withSponsor: boolean, withPopup: boolean): Promise<`0x${string}`> => {
      const options: any = { sponsor: withSponsor, uiOptions: { showWalletUIs: withPopup } }
      if (withSponsor && pimlicoPolicyId) options.paymasterContext = { sponsorshipPolicyId: pimlicoPolicyId }
      const txParams: any = { to, data: data ?? '0x', value, chainId: chainId ?? undefined }
      if (!withSponsor && sourcePublicClient && address) {
        try {
          const est = await sourcePublicClient.estimateGas({ account: address as Address, to, data: (data ?? '0x') as `0x${string}`, value })
          txParams.gasLimit = (est * BigInt(120)) / BigInt(100) // 20% buffer
        } catch { /* fall back to Privy's own estimation */ }
      }
      const res: any = await privySendTransaction(txParams, options)
      return (res?.hash ?? res) as `0x${string}`
    }

    try {
      return await attempt(true, false)
    } catch (err) {
      const m = ((err as any)?.message || String(err)).toLowerCase()
      // User explicitly declined → don't silently re-prompt with a popup.
      if (m.includes('user rejected') || m.includes('user denied') || m.includes('rejected by user')) throw err
      return await attempt(false, true)
    }
  }, [privySendTransaction, sourcePublicClient, address, chainId])

  // ─── Same-chain supply (called directly or after approval) ───────────────────
  async function doSameChainSupply() {
    if (!contractAddresses || !address) return
    try {
      startStallTimer(WALLET_STALL_MS, 'Wallet confirmation timed out. Please retry.')
      const pTokenAddr = (contractAddresses as any).pTokenAddress as Address
      if (isNative) {
        const mintData = encodeFunctionData({ abi: pbnbAbi as any, functionName: 'mint', args: [] })
        if (isSmartAccountActive) {
          await executeSmartTx({ to: pTokenAddr, data: mintData, value: parsedAmount },
            { onSuccess: h => { setSupplyHash(h); clearStallTimer() } })
        } else if (isEmbeddedWallet) {
          const h = await sendViaPrivyEmbedded(pTokenAddr, mintData, parsedAmount)
          setSupplyHash(h); clearStallTimer()
        } else {
          writeSupply({
            address: pTokenAddr,
            abi: pbnbAbi as any,
            functionName: 'mint',
            args: [],
            value: parsedAmount,
          } as any)
        }
      } else {
        const mintData = encodeFunctionData({ abi: combinedAbi, functionName: 'mint', args: [parsedAmount] })
        if (isSmartAccountActive) {
          await executeSmartTx({ to: pTokenAddr, data: mintData },
            { onSuccess: h => { setSupplyHash(h); clearStallTimer() } })
        } else if (isEmbeddedWallet) {
          const h = await sendViaPrivyEmbedded(pTokenAddr, mintData)
          setSupplyHash(h); clearStallTimer()
        } else {
          writeSupply({
            address: pTokenAddr,
            abi: combinedAbi,
            functionName: 'mint',
            args: [parsedAmount],
          } as any)
        }
      }
    } catch (err) {
      clearStallTimer()
      const msg = (err as any)?.message || String(err)
      setError(friendlyTxErrorOrGeneric(msg))
      setStep('error')
      markIdle()
    }
  }

  // ─── executeSupply — the public entry point ───────────────────────────────────
  const executeSupply = useCallback(async () => {
    if (isSubmittingRef.current) return
    isSubmittingRef.current = true
    onSuccessCalledRef.current = false
    verificationSentRef.current = false
    hasProceedAfterApprovalRef.current = false

    setError(null)
    setStep('supplying')
    setBiconomyFee(undefined)
    setBiconomyFeeDetails(undefined)
    setFeeShortfall(null)
    try { lastAmountRef.current = amount || '' } catch {}

    try {
      if (typeof window !== 'undefined') {
        ;(window as any).__PERIDOT_TX_ACTIVE = true
        window.dispatchEvent(new CustomEvent('peridot:tx-active'))
      }
    } catch {}

    emitTxUpdate('checking-allowance', 'Checking allowance...')

    try {
      // ── Guard checks ──────────────────────────────────────────────────────
      if (!address) throw new Error('Please connect your wallet first')
      if (!amount || parseFloat(amount) <= 0) throw new Error('Please enter a valid amount')
      if (!canSupply) throw new Error('Smart contracts for this asset are not available on this network')

      // ── Biconomy cross-chain path ─────────────────────────────────────────
      if (isBiconomyCrossChain) {
        if (!sourceTokenForBiconomy || !pTokenOnDestination) {
          throw new Error('Cross-chain configuration not ready. Please wait and try again.')
        }

        // Effective signer: for smart accounts, always use the EOA signer for Biconomy
        const effectiveUser: Address =
          isSmartAccountActive && signerAddress &&
          signerAddress.toLowerCase() !== (address as string).toLowerCase()
            ? signerAddress as Address
            : address as Address

        // Block if tokens are in the SA but not the EOA signer
        if (isSmartAccountActive && signerAddress && signerAddress.toLowerCase() !== (address as string).toLowerCase() && sourcePublicClient) {
          const [saBalance, eoaBalance] = await Promise.all([
            sourcePublicClient.readContract({ address: sourceTokenForBiconomy, abi: erc20Abi, functionName: 'balanceOf', args: [address as Address] }),
            sourcePublicClient.readContract({ address: sourceTokenForBiconomy, abi: erc20Abi, functionName: 'balanceOf', args: [signerAddress as Address] }),
          ])
          if ((saBalance as bigint) >= parsedAmount && (eoaBalance as bigint) < parsedAmount) {
            const msg = 'Your tokens are in your smart wallet. Open Wallet → Funding → "Withdraw to Signer" to move them to your signer wallet first, then supply.'
            setError(msg)
            setStep('error')
            emitTxUpdate('error', msg)
            markIdle()
            return
          }
        }

        const executionMode: ExecutionMode = isSmartAccountActive ? 'smart-account' : (accountType === 'EOA_7702' ? 'eoa-7702' : 'eoa')

        emitTxUpdate('supplying', 'Preparing cross-chain supply...')
        setStatusHint('Preparing cross-chain route...')

        // Ensure the wallet is on the source chain before signing.
        // wagmiWalletClient.chain.id must match the Biconomy payload chainId — viem
        // enforces this in sendTransaction. If the user's active chain is different
        // (e.g. Ethereum mainnet while funds are on Arbitrum), switch now.
        if (chainId && wagmiChainId && chainId !== wagmiChainId) {
          try {
            setStatusHint('Switching to source chain…')
            await switchChainAsync({ chainId })
          } catch (switchErr: any) {
            const msg = switchErr?.message || String(switchErr)
            // User rejected the switch — abort cleanly
            if (/rejected|denied/i.test(msg)) {
              setError('Chain switch cancelled. Please switch to the source chain and try again.')
              setStep('error')
              markIdle()
              return
            }
            // Non-rejection switch errors are usually recoverable — log and continue
            console.warn('[useEasySupply] chain switch failed, proceeding anyway', msg)
          }
          setStatusHint('Preparing cross-chain route...')
        }

        let result: Awaited<ReturnType<typeof biconomyAdapter.startSupply>>

        emitTxUpdate('routing', 'Calculating the best route and network fee…')
        setStatusHint('Calculating the best route and network fee…')

        // ── Attempt 1 ────────────────────────────────────────────────────────
        const doStartSupply = () => biconomyAdapter.startSupply({
          userAddress: effectiveUser,
          signerAddress: effectiveUser,
          signingClient: wagmiWalletClient || undefined,
          smartAccountAddress: biconomySmartAccountAddress,
          sourceChainId: chainId!,
          sourceTokenAddress: sourceTokenForBiconomy,
          destinationChainId: destinationHubChainId,
          pTokenAddress: pTokenOnDestination,
          amountWei: parsedAmount,
          enableAsCollateral: !!meeAuthorization,
          returnPTokensToUser: true,
          postEnableAsCollateral: false,
          meeAuthorization,
          executionMode,
        })

        try {
          result = await doStartSupply()
        } catch (e: any) {
          const msg = String(e?.message || e || '')

          // ── On-chain approval required ─────────────────────────────────────
          if (msg.startsWith('BICONOMY_ONCHAIN_APPROVAL_REQUIRED:')) {
            try {
              const payload = JSON.parse(msg.slice('BICONOMY_ONCHAIN_APPROVAL_REQUIRED:'.length))
              const spender = payload?.spender as Address | undefined
              if (!spender) throw new Error('Approval data missing spender')

              setStep('approving')
              emitTxUpdate('approving', 'Please confirm token approval in wallet...')

              if (isSmartAccountActive) {
                await executeSmartTx({
                  to: sourceTokenForBiconomy,
                  data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [spender, parsedAmount] }),
                }, { onSuccess: h => setApproveHash(h) })
              } else {
                await new Promise<void>((resolve, reject) => {
                  writeApprove({
                    address: sourceTokenForBiconomy,
                    abi: erc20Abi,
                    functionName: 'approve',
                    args: [spender, parsedAmount],
                  } as any)
                  // Approval result handled by the approveData useEffect above.
                  // We just proceed optimistically after a short delay.
                  setTimeout(resolve, 500)
                })
              }

              setStep('supplying')
              emitTxUpdate('supplying', 'Approval done. Retrying supply...')
              result = await doStartSupply()
            } catch (inner: any) {
              throw inner
            }

          // ── Amount too small for fee ───────────────────────────────────────
          } else if (msg.includes('INSUFFICIENT_FOR_FEE_BUDGET')) {
            const payload = parseFeeBudgetErrorPayload(msg)
            const requiredWei = getRequiredWeiFromPayload(payload)
            let friendly = 'Amount too small to cover the cross-chain fee. Please increase the amount.'
            if (requiredWei && requiredWei > BigInt(0)) {
              const fmt = formatTokenAmountFromWei(requiredWei, underlyingDecimals)
              friendly = `Amount too small. The cross-chain fee requires at least ${fmt} ${assetSymbolUpper}. Please supply a larger amount.`
            }
            setError(friendly)
            setStep('error')
            markIdle()
            return

          // ── No route found ─────────────────────────────────────────────────
          } else if (/Route not found|BICONOMY_ROUTE_NOT_FOUND/i.test(msg)) {
            const friendly = 'No route found for this amount. Try increasing the amount or switch network.'
            setError(friendly)
            setStep('error')
            markIdle()
            emitTxUpdate('error', friendly)
            return

          } else {
            throw e
          }
        }

        // ── Success: record result ─────────────────────────────────────────
        biconomySuperTxHashRef.current = result.superTxHash
        setBiconomySuperTxHashState(result.superTxHash)
        setSupplyHash(result.superTxHash as any)
        setBiconomyTrackingUrl(result.trackingUrl)
        if ((result as any).fee) setBiconomyFee((result as any).fee)
        if ((result as any).feeDetails) setBiconomyFeeDetails((result as any).feeDetails)
        if ((result as any).meeScanLink) setBiconomyMeeLink((result as any).meeScanLink)

        // Persist cross-chain tx to DB immediately
        try {
          const token = await getAccessToken()
          const sym = asset?.symbol
          const usd = parseFloat(cleanAmount(amount)) * (asset?.price || 0)
          const pTokenAddr = pTokenOnDestination
          await fetch('/api/leaderboard/verify-crosschain', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
            body: JSON.stringify({
              walletAddress: address, superTxHash: result.superTxHash,
              chainId, actionType: 'cross-chain_supply',
              tokenSymbol: sym, amount: cleanAmount(amount), usdValue: usd,
              contractAddress: pTokenAddr, destinationChainId,
            }),
          })
        } catch {}

        setStep('success')
        setStatusHint('Submitted. Bridge in progress...')
        lastCrossChainStatusRef.current = 'pending'
        setCrossChainStatus('pending')
        markIdle()

        if (!onSuccessCalledRef.current) {
          onSuccessCalledRef.current = true
          onSuccessRef.current?.()
        }

        try {
          const detail: any = {
            type: 'supply', address, chainId, assetId,
            txHash: result.superTxHash, observed_at: new Date().toISOString(),
            tokenSymbol: asset?.symbol || assetId.toUpperCase(),
            isCrossChain: true, crossChainStatus: 'pending',
          }
          if ((result as any).fee) detail.biconomyFee = (result as any).fee
          if ((result as any).feeDetails) detail.biconomyFeeDetails = (result as any).feeDetails
          if (result.trackingUrl) detail.trackingUrl = result.trackingUrl
          if ((result as any).meeScanLink) detail.meeScanLink = (result as any).meeScanLink
          window.dispatchEvent(new CustomEvent('peridot:tx-success', { detail }))
        } catch {}

        return
      }

      // ── Same-chain path ───────────────────────────────────────────────────
      if (!contractAddresses) throw new Error('Contract addresses not found')

      // Determine if approval is needed
      const refreshed = await refetchAllowance()
      const latestAllowance = (refreshed as any)?.data as bigint | undefined
      const needsApprovalNow = !isNative && latestAllowance !== undefined && parsedAmount > latestAllowance

      if (needsApprovalNow) {
        if (isSmartAccountActive) {
          // Smart account: batch approve + mint in one tx
          setStep('supplying')
          emitTxUpdate('supplying', 'Supplying with smart account...')
          const calls: TransactionCall[] = [
            {
              to: contractAddresses.underlyingAddress as Address,
              data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [contractAddresses.pTokenAddress as Address, parsedAmount] }),
            },
            {
              to: (contractAddresses as any).pTokenAddress as Address,
              data: encodeFunctionData({ abi: combinedAbi, functionName: 'mint', args: [parsedAmount] }),
            },
          ]
          startStallTimer(WALLET_STALL_MS, 'Wallet confirmation timed out. Please retry.')
          try {
            const hash = await executeSmartTx(calls, { onSuccess: h => { setSupplyHash(h); clearStallTimer() } })
            if (hash) setSupplyHash(hash)
          } catch (err) {
            clearStallTimer()
            throw err
          }
        } else if (isEmbeddedWallet) {
          // Privy embedded: approve via Privy's send path (wagmi would hit
          // wallet_sendTransaction → Alchemy rejection). Setting approveHash
          // drives the existing isApprovalSuccess effect → doSameChainSupply.
          setStep('approving')
          emitTxUpdate('approving', 'Setting up your deposit...')
          startStallTimer(WALLET_STALL_MS, 'Wallet confirmation timed out. Please retry.')
          const approveData = encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [contractAddresses.pTokenAddress as Address, parsedAmount] })
          const h = await sendViaPrivyEmbedded(contractAddresses.underlyingAddress as Address, approveData)
          setApproveHash(h)
          // Supply is triggered by the isApprovalSuccess effect
          return
        } else {
          // EOA: approve first, supply triggered after approval confirmed
          setStep('approving')
          emitTxUpdate('approving', 'Please confirm approval in wallet...')
          startStallTimer(WALLET_STALL_MS, 'Wallet confirmation timed out. Please retry.')
          writeApprove({
            address: contractAddresses.underlyingAddress as Address,
            abi: erc20Abi,
            functionName: 'approve',
            args: [contractAddresses.pTokenAddress as Address, parsedAmount],
          } as any)
          // Supply is triggered by the isApprovalSuccess effect
          return
        }
      } else {
        // No approval needed
        setStep('supplying')
        emitTxUpdate('supplying', 'Supplying tokens...')
        if (isSmartAccountActive) {
          const call: TransactionCall = isNative ? {
            to: (contractAddresses as any).pTokenAddress as Address,
            data: encodeFunctionData({ abi: pbnbAbi as any, functionName: 'mint', args: [] }),
            value: parsedAmount,
          } : {
            to: (contractAddresses as any).pTokenAddress as Address,
            data: encodeFunctionData({ abi: combinedAbi, functionName: 'mint', args: [parsedAmount] }),
          }
          startStallTimer(WALLET_STALL_MS, 'Wallet confirmation timed out. Please retry.')
          try {
            const hash = await executeSmartTx(call, { onSuccess: h => { setSupplyHash(h); clearStallTimer() } })
            if (hash) setSupplyHash(hash)
          } catch (err) {
            clearStallTimer()
            throw err
          }
        } else {
          startStallTimer(WALLET_STALL_MS, 'Wallet confirmation timed out. Please retry.')
          doSameChainSupply()
        }
      }
    } catch (err) {
      clearStallTimer()
      const errObj = err as Error
      const msg = errObj?.message || String(err)

      // Biconomy "Not enough EOA balance to pay orchestration fee" — capture the
      // exact fee/balance numbers so the UI can auto-adjust the amount instead
      // of leaving the user staring at "Something went wrong".
      const parsed = parseShortfallFromError(msg, parsedAmount)
      if (parsed && parsedAmount > 0n) {
        const info: FeeShortfallInfo = {
          ...parsed,
          decimals: effectiveAmountDecimals as number,
          assetPriceUSD: asset?.price || 0,
        }
        setFeeShortfall(info)
        setError(friendlyTxErrorOrGeneric(msg))
        setStep('error')
        // Use a distinct step name so EasyModeTxStatus shows the "adjusting"
        // overlay rather than the generic red error banner. Skip markIdle()
        // on purpose — the retry is imminent and we want the overlay to stay
        // visible so the user sees a single continuous flow.
        emitTxUpdate('fee-shortfall', 'Adjusting for network fee…')
        isSubmittingRef.current = false
        onErrorRef.current?.(errObj)
        return
      }

      setError(friendlyTxErrorOrGeneric(msg))
      setStep('error')
      emitTxUpdate('error', msg)
      markIdle()
      onErrorRef.current?.(errObj)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, amount, canSupply, chainId, wagmiChainId, isBiconomyCrossChain, sourceTokenForBiconomy, pTokenOnDestination, parsedAmount, contractAddresses, isNative, isSmartAccountActive, isEmbeddedWallet, sendViaPrivyEmbedded, signerAddress, accountType, meeAuthorization, wagmiWalletClient, biconomySmartAccountAddress, destinationHubChainId, underlyingDecimals, assetSymbolUpper, cleanAmount, asset, emitTxUpdate, markIdle, clearStallTimer, startStallTimer, getAccessToken, refetchAllowance, executeSmartTx, writeApprove, writeSupply, switchChainAsync])

  // ─── Reset ────────────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    clearStallTimer()
    setStep('idle')
    setError(null)
    setApproveHash(undefined)
    setSupplyHash(undefined)
    setStatusHint('')
    setFeeShortfall(null)
    isSubmittingRef.current = false
    onSuccessCalledRef.current = false
    hasProceedAfterApprovalRef.current = false
    try {
      if (typeof window !== 'undefined') {
        ;(window as any).__PERIDOT_TX_ACTIVE = false
        window.dispatchEvent(new CustomEvent('peridot:tx-idle'))
      }
    } catch {}
    resetApprove()
    resetSupply()
  }, [clearStallTimer, resetApprove, resetSupply])

  // Clean up stale cross-chain localStorage keys written by the legacy supply hook.
  // EasyModeTxStatus no longer resumes from localStorage, so these are orphaned.
  useEffect(() => {
    try {
      Object.keys(localStorage)
        .filter(k => k.startsWith('peridot:cc:lastSupply:'))
        .forEach(k => localStorage.removeItem(k))
    } catch {}
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearStallTimer()
      if (crossChainPollRef.current) clearInterval(crossChainPollRef.current)
    }
  }, [clearStallTimer])

  // ─── Derived state ────────────────────────────────────────────────────────────
  const isLoading = (
    step === 'approving' || step === 'supplying' ||
    (!isBiconomyCrossChain && (isApprovalConfirming || isSupplyConfirming))
  )

  const getStatusMessage = (): string => {
    if (isBiconomyCrossChain && statusHint) return statusHint
    switch (step) {
      case 'approving': return 'Please confirm approval in wallet...'
      case 'supplying': return 'Supplying tokens...'
      case 'success': return ''
      case 'error': return 'Transaction failed'
      default: return ''
    }
  }

  // ─── Return interface (matches useSupplyTransaction) ──────────────────────────
  return {
    executeSupply,
    step,
    error,
    feeShortfall,
    clearFeeShortfall: useCallback(() => setFeeShortfall(null), []),
    isLoading,
    needsApproval,
    canSupply,
    isBiconomyCrossChain,
    reset,
    statusMessage: getStatusMessage(),
    approveHash,
    supplyHash,
    crossChainStatus,
    biconomyTrackingUrl,
    biconomyExplorerLinks,
    biconomyBscTxHash,
    biconomyFee,
    biconomyFeeDetails,
    biconomyMeeLink,
    contractAddresses,
    // Unused by EasyModeCard but kept for interface compatibility
    manualSupplyTrigger: () => {},
    retryCrossChain: async () => {},
    retryTransaction: async () => {},
    checkResumedStatus: async () => ({ status: 'unknown' as const }),
    clearResumedCrossChain: () => {},
    crossChainLastPoll: null,
    axelarGasPaymentWei: undefined,
    hasResumableCrossChain: false,
    isRetryable: false,
    retryCount: 0,
  }
}

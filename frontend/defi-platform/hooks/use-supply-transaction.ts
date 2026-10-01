import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useAccount, useWriteContract, useReadContract, useWaitForTransactionReceipt, useWalletClient, usePublicClient } from 'wagmi'
import { parseUnits, formatUnits, Address, erc20Abi, encodeFunctionData } from 'viem'
import { getAssetContractAddresses, getMarketsForChain, AXELAR_CROSS_CHAIN_ASSET_IDS, AXELAR_ASSET_ID_TO_SYMBOL } from '@/data/market-data'
import { getChainConfig, CHAIN_IDS, getChainConfigByName, isAxelarSpokeChain, isHubChain } from '@/config/contracts'
import { FEATURE_FLAGS } from '../config/featureFlags'
import spokeAbi from '@/app/abis/spokeAbi.json'
import combinedAbi from '@/app/abis/combinedAbi.json'
import pbnbAbi from '@/app/abis/pbnbabi.json'
import { autoVerifyTransaction } from '@/lib/auto-leaderboard-verifier'
import { toast } from 'sonner'
import { isRateLimit, isTimeoutError, isJsonRpcError, isContractExecutionError, isRetryableError, getRetryDelay, attachScopedRetryListeners } from '@/lib/txFeedback'
import { biconomyAdapter } from '@/lib/biconomyAdapter'
import { TOKENS as BICONOMY_TOKENS } from '@/biconomy/constants'
import { useSmartAccountUpgrade } from '@/components/providers/SmartAccountUpgradeProvider'
import { useSmartAccountStatus } from '@/hooks/use-smart-account-status'
import { useAccountType } from '@/hooks/use-account-type'
import type { ExecutionMode } from '@/biconomy/constants'
import { formatTokenAmountFromWei, getRequiredWeiFromPayload, parseFeeBudgetErrorPayload } from '@/lib/crossChainFees'
import { isTransactionDismissed } from '@/lib/dismissedTransactionTracker'
import { useWalletBalance } from '@/hooks/use-wallet-balance'
import { useActiveWallet } from '@/hooks/use-active-wallet'
import { useSmartExecution, TransactionCall } from '@/hooks/use-smart-execution'
import { usePrivy, useSendTransaction } from '@privy-io/react-auth'

interface UseSupplyTransactionProps {
  assetId: string
  amount: string
  destinationChainId?: number
  onSuccess?: () => void
  onError?: (error: Error) => void
}

type TransactionStep = 'idle' | 'checking-allowance' | 'approving' | 'approved' | 'estimating-gas' | 'supplying' | 'entering-market' | 'success' | 'error'

const PREFLIGHT_STALL_TIMEOUT_MS = 45_000
const WALLET_CONFIRMATION_STALL_TIMEOUT_MS = 90_000
const RECEIPT_CONFIRMATION_STALL_TIMEOUT_MS = 180_000

export function useSupplyTransaction({
  assetId,
  amount,
  destinationChainId,
  onSuccess,
  onError,
}: UseSupplyTransactionProps) {
  const { getAccessToken } = usePrivy()
  const { chainId } = useAccount()
  const sourcePublicClient = usePublicClient({ chainId: chainId ?? undefined })
  const { address, signerAddress, isSmartAccountActive, isEmbeddedWallet } = useActiveWallet()
  // Privy embedded wallets must NOT go through wagmi's writeContract: that path
  // emits `wallet_sendTransaction` with no gas estimation, so the embedded wallet
  // forwards `gas: 0` to the BSC RPC → "intrinsic gas too low". We route them
  // through Privy's `useSendTransaction` with an explicit pre-estimated gasLimit
  // (see sendViaPrivyEmbedded below), mirroring use-easy-supply / use-agent-execution.
  const { sendTransaction: privySendTransaction } = useSendTransaction()
  // wagmi wallet client — used as the signing client for Privy smart wallets.
  // Privy embedded wallets are NOT injected into window.ethereum, so the adapter's
  // selectInjectedProvider cannot find them. This wagmi client uses the active Privy
  // connector and correctly routes signing through Privy's wallet infrastructure.
  const { data: wagmiWalletClient } = useWalletClient()
  const { execute: executeSmartTx } = useSmartExecution()
  const [step, setStep] = useState<TransactionStep>('idle')
  const [error, setError] = useState<string | null>(null)
  const [approveHash, setApproveHash] = useState<`0x${string}` | undefined>()
  const [supplyHash, setSupplyHash] = useState<`0x${string}` | undefined>()
  const [enterMarketHash, setEnterMarketHash] = useState<`0x${string}` | undefined>()
  const [crossChainStatus, setCrossChainStatus] = useState<'idle' | 'pending' | 'executed' | 'failed' | 'refunded' | 'unknown'>('idle')
  const [estimatedAxelarGasWei, setEstimatedAxelarGasWei] = useState<bigint | undefined>(undefined)
  const [biconomyTrackingUrl, setBiconomyTrackingUrl] = useState<string | undefined>(undefined)
  const [biconomyExplorerLinks, setBiconomyExplorerLinks] = useState<string[] | undefined>(undefined)
  const [biconomyBscTxHash, setBiconomyBscTxHash] = useState<`0x${string}` | undefined>(undefined)
  const [biconomyFee, setBiconomyFee] = useState<any | undefined>(undefined)
  const [biconomyFeeDetails, setBiconomyFeeDetails] = useState<any | undefined>(undefined)
  const [biconomyMeeLink, setBiconomyMeeLink] = useState<string | undefined>(undefined)
  const [retryCount, setRetryCount] = useState(0)
  const [lastError, setLastError] = useState<string | null>(null)
  const { meeAuthorization } = useSmartAccountUpgrade()
  const { isSmartAccount: statusSmartAccount, smartAccountAddress: detectedSmartAccountAddress } = useSmartAccountStatus()
  const { accountType } = useAccountType()
  const crossChainPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastCrossChainStatusRef = useRef<'idle' | 'pending' | 'executed' | 'failed' | 'refunded' | 'unknown'>('idle')
  const pollingHashRef = useRef<string | null>(null)
  const isPollingRef = useRef(false)
  // Cooldown and estimation caches/guards
  const lastAxelarSubmitAtRef = useRef<number>(0)
  const lastEstimateCacheRef = useRef<{ key: string; value: bigint; ts: number } | null>(null)
  const hasSubmittedCrossChainWriteRef = useRef<boolean>(false)
  const onSuccessCalledRef = useRef<boolean>(false)
  const verificationSentRef = useRef<boolean>(false)
  // Guard against backfill-POST being sent every 5s — once it lands, never again.
  const destBackfillSentRef = useRef<boolean>(false)
  const [crossChainLastPoll, setCrossChainLastPoll] = useState<{ at: number; status: 'pending' | 'executed' | 'failed' | 'refunded' | 'unknown'; simplified?: string; messageId?: string } | null>(null)

  const hasExecutedSupply = useRef(false)
  const hasExecutedEnterMarket = useRef(false)
  const isSubmittingRef = useRef(false)
  const lastAmountRef = useRef<string>('')

  const biconomySmartAccountAddress = useMemo(() => {
    if (!statusSmartAccount) return undefined
    if (!detectedSmartAccountAddress) return undefined
    return detectedSmartAccountAddress as Address
  }, [statusSmartAccount, detectedSmartAccountAddress])

  // Helper: ensure UI returns to idle state on terminal paths
  const markTxIdle = useCallback(() => {
    isSubmittingRef.current = false
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

  const allAssets = chainId ? getMarketsForChain(chainId) : [];
  const asset = allAssets.find(a => a.id === assetId);
  const underlyingDecimals = asset?.decimals ?? 18;

  // Debug flag: enable verbose logging in non-production or when explicitly needed
  const DEBUG = typeof window !== 'undefined' && (process.env.NEXT_PUBLIC_PERIDOT_DEBUG === '1' || process.env.NEXT_PUBLIC_PERIDOT_DEBUG === 'true' || process.env.NODE_ENV !== 'production')

  // Determine cross-chain flows
  // Axelar cross-chain disabled (deprecating); keep code paths dormant
  const isAxelarCrossChain = Boolean(
    FEATURE_FLAGS.CROSS_CHAIN_SUPPLY_AXELAR &&
    isAxelarSpokeChain(chainId) &&
    AXELAR_CROSS_CHAIN_ASSET_IDS.has(assetId) &&
    false
  )
  const isBiconomyCrossChain = Boolean(
    FEATURE_FLAGS.CROSS_CHAIN_SUPPLY_BICONOMY &&
    typeof chainId === 'number' &&
    (
      !isHubChain(chainId) || // Spoke-to-hub cross-chain
      (destinationChainId && destinationChainId !== chainId) // Hub-to-hub cross-chain when destination differs
    )
  )

  // Static Axelar gas payment fallback per integration docs (~0.01 ETH)
  const AXELAR_STATIC_GAS_PAYMENT_WEI = isAxelarCrossChain ? parseUnits('0.01', 18) : undefined

  // Get contract addresses for the asset (on current chain or as defined)
  const contractAddresses = chainId ? getAssetContractAddresses(assetId, chainId) : null
  
  // Get chain config for controller address
  const chainConfig = chainId ? getChainConfig(chainId) : null
  const controllerAddress = chainConfig && 'unitrollerProxy' in chainConfig ? chainConfig.unitrollerProxy : null

  // Check if we have valid contract addresses
  const isNative = Boolean((contractAddresses as any)?.isNative)
  // Default on-chain (same-chain) supply availability
  const canSupplySameChain = Boolean(contractAddresses && (contractAddresses as any).pTokenAddress && controllerAddress && (isNative || (contractAddresses as any).underlyingAddress))

  // Cross-chain supply availability (Axelar)
  const spokeConfig = chainId ? getChainConfig(chainId) as any : null
  const spokeAddress = (spokeConfig && (spokeConfig as any).peridotSpoke) as Address | undefined
  const axelarSymbol = AXELAR_ASSET_ID_TO_SYMBOL[assetId]
  const marketKey = axelarSymbol ? (axelarSymbol === 'aUSDC' ? 'AXL_USDC' : (`AXL_${axelarSymbol}`)) : ''
  const sourceUnderlying = (spokeConfig && (spokeConfig.markets?.[marketKey]?.underlying)) as Address | undefined
  const canSupplyCrossChain = Boolean(isAxelarCrossChain && spokeAddress && sourceUnderlying)
  
  // Cross-chain supply availability (Biconomy → configurable hub)
  const mapChainIdToBiconomyKey = (cid?: number | null): keyof typeof BICONOMY_TOKENS | undefined => {
    switch (cid) {
      case 1: return 'mainnet'
      case 10: return 'optimism'
      case 137: return 'polygon'
      case 42161: return 'arbitrum'
      case 8453: return 'base'
      case 43114: return 'avalanche'
      case 10143: return 'monad'  // Monad testnet
      case 143: return 'monad'    // Monad mainnet
      default: return undefined
    }
  }
  const biconomyNetKey = mapChainIdToBiconomyKey(chainId)
  const assetSymbolUpper = (asset?.symbol || '').toUpperCase()
  
  // When source chain is a hub chain (BSC or Monad), get token from market config instead of BICONOMY_TOKENS
  // BICONOMY_TOKENS only has entries for spoke chains, not hub chains
  const isSourceHubChain = isHubChain(chainId)
  const sourceTokenForBiconomy = isSourceHubChain
    ? ((chainConfig as any)?.markets?.[assetSymbolUpper]?.underlying as Address | undefined)
    : (biconomyNetKey && (BICONOMY_TOKENS as any)[biconomyNetKey]?.[assetSymbolUpper]) as Address | undefined

  // Determine destination hub chain (default to BSC for backward compatibility)
  const destinationHubChainId = destinationChainId || CHAIN_IDS.BSC_MAINNET
  const destinationConfig = getChainConfig(destinationHubChainId) as any
  const pTokenOnDestination = (assetSymbolUpper && destinationConfig?.markets?.[assetSymbolUpper]?.pToken) as Address | undefined
  const canSupplyCrossChainBiconomy = Boolean(isBiconomyCrossChain && sourceTokenForBiconomy && pTokenOnDestination)

  const canSupply = isAxelarCrossChain ? canSupplyCrossChain : (isBiconomyCrossChain ? canSupplyCrossChainBiconomy : canSupplySameChain)
  


  // Build a preflight summary for logging before any wallet prompt
  const buildPreflightSummary = () => {
    const summary: any = {
      walletAddress: address,
      chainId,
      destinationChainId: destinationHubChainId,
      asset: asset ? { id: asset.id, symbol: asset.symbol, decimals: asset.decimals, price: asset.price } : null,
      isNative,
      canSupplySameChain,
      canSupplyCrossChain,
      canSupply,
      controllerAddress,
      contractAddresses: contractAddresses ? {
        underlyingAddress: (contractAddresses as any).underlyingAddress,
        pTokenAddress: (contractAddresses as any).pTokenAddress,
      } : null,
      destinationContractAddresses: destinationConfig ? {
        pTokenAddress: pTokenOnDestination,
        underlyingAddress: (destinationConfig as any)?.markets?.[assetSymbolUpper]?.underlying,
      } : null,
      amount: {
        input: amount,
        cleaned: cleanAmount(amount),
        decimals: underlyingDecimals,
        parsed: parsedAmount?.toString?.(),
      },
      allowance: allowance !== undefined ? (allowance as bigint).toString() : undefined,
      needsApproval,
    }

    return summary
  }

  // Clean and parse amount to proper units (always 18 for supply)
  const cleanAmount = (rawAmount: string): string => {
    if (!rawAmount) return '0'
    const sanitized = rawAmount.replace(/[^0-9.]/g, '')
    // Truncate, do not round, to token decimals to avoid overpaying / limit errors
    if (!sanitized.includes('.')) return sanitized
    const [intPart, fracPartRaw] = sanitized.split('.')
    const fracPart = (fracPartRaw || '').slice(0, underlyingDecimals)
    return fracPart.length > 0 ? `${intPart}.${fracPart}` : intPart
  }
  
  // For Biconomy, amount must be encoded in source token decimals
  const { data: biconomySourceTokenDecimals } = useReadContract({
    address: (isBiconomyCrossChain ? (sourceTokenForBiconomy as Address) : undefined) as any,
    abi: erc20Abi,
    functionName: 'decimals',
    args: [],
    query: { enabled: Boolean(isBiconomyCrossChain && sourceTokenForBiconomy) }
  })
  const effectiveAmountDecimals = (isBiconomyCrossChain
    ? (typeof biconomySourceTokenDecimals === 'number' ? biconomySourceTokenDecimals : (underlyingDecimals || 18))
    : underlyingDecimals)
  const parsedAmount = amount ? parseUnits(cleanAmount(amount), effectiveAmountDecimals as number) : BigInt(0)

  // Get wallet balance for validation (especially needed for Biconomy spoke chains)
  const walletBalance = useWalletBalance({ assetId })

  // Read current allowance of underlying token
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: (isAxelarCrossChain ? (sourceUnderlying as Address) : (contractAddresses?.underlyingAddress as Address)),
    abi: erc20Abi,
    functionName: 'allowance',
    args: [
      address!,
      (isAxelarCrossChain ? (spokeAddress as Address) : (contractAddresses?.pTokenAddress as Address))
    ],
    query: {
      // Only read allowance when it can influence the next action
      enabled: !isBiconomyCrossChain && !!address && !isNative && parsedAmount > BigInt(0) && (
        (isAxelarCrossChain ? Boolean(sourceUnderlying && spokeAddress) : Boolean(contractAddresses?.underlyingAddress && contractAddresses?.pTokenAddress))
      ),
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 30000,
    }
  })

  // Check if approval is needed
  const needsApproval = !isBiconomyCrossChain && !isNative && allowance !== undefined && parsedAmount > (allowance as bigint)

  // Write contract hooks
  const { 
    writeContract: writeApprove,
    isPending: isApprovePending,
    data: approveData,
    error: approveError,
    reset: resetApprove,
  } = useWriteContract()

  const { 
    writeContract: writeSupply,
    isPending: isSupplyPending,
    data: supplyData,
    error: supplyError,
    reset: resetSupply,
  } = useWriteContract()

  // Write contract hook for entering markets (enabling collateral)
  const { 
    writeContract: writeEnterMarket,
    isPending: isEnterMarketPending,
    data: enterMarketData,
    error: enterMarketError,
    reset: resetEnterMarket,
  } = useWriteContract()

  const recoverFromStalledTransaction = useCallback((message: string, txHash?: string) => {
    setError(message)
    setStep('error')
    try {
      if (typeof window !== 'undefined') {
        const detail: any = { action: 'supply', step: 'error', statusMessage: message }
        if (txHash) detail.txHash = txHash
        window.dispatchEvent(new CustomEvent('peridot:tx-update', { detail }))
      }
    } catch {}
    try {
      toast('Supply stalled', {
        description: message,
        duration: 10000,
      })
    } catch {}
    setApproveHash(undefined)
    setSupplyHash(undefined)
    setEnterMarketHash(undefined)
    resetApprove()
    resetSupply()
    resetEnterMarket()
    markTxIdle()
  }, [resetApprove, resetSupply, resetEnterMarket, markTxIdle])

  // Set hashes when transactions are submitted
  useEffect(() => {
    if (approveData) {
      setApproveHash(approveData)
    }
  }, [approveData])

  useEffect(() => {
    if (supplyData) {
      setSupplyHash(supplyData)
    }
  }, [supplyData])

  useEffect(() => {
    if (enterMarketData) {
      setEnterMarketHash(enterMarketData)
    }
  }, [enterMarketData])

  // Wait for transaction receipts
  const { 
    isLoading: isApprovalConfirming, 
    isSuccess: isApprovalSuccess,
    error: approvalReceiptError 
  } = useWaitForTransactionReceipt({
    hash: approveHash,
  })

  const { 
    isLoading: isSupplyConfirming, 
    isSuccess: isSupplySuccess,
    error: supplyReceiptError 
  } = useWaitForTransactionReceipt({
    hash: supplyHash,
  })

  // Biconomy tracking URL (if needed in UI, can be derived from hash externally)
  const biconomySuperTxHashRef = useRef<string | undefined>(undefined)
  // State mirror of the ref so the polling effect can react when the hash becomes available
  const [biconomySuperTxHashState, setBiconomySuperTxHashState] = useState<string | undefined>(undefined)

  // Persist cross-chain supply across refresh (per-wallet+asset key)
  const CC_STORAGE_KEY = 'peridot:cc:lastSupply'

  const storageKeyFor = (wallet?: string | null, assetKey?: string | null) => {
    return `${CC_STORAGE_KEY}:${(wallet || '').toLowerCase()}:${assetKey || ''}`
  }

  const saveCrossChainRecord = (data: any) => {
    try {
      const key = storageKeyFor(address, assetId)
      localStorage.setItem(key, JSON.stringify({ ...data, savedAt: Date.now() }))
    } catch {}
  }

  const loadCrossChainRecord = (): any | null => {
    try {
      const key = storageKeyFor(address, assetId)
      const raw = localStorage.getItem(key)
      if (!raw) return null
      return JSON.parse(raw)
    } catch {
      return null
    }
  }

  const clearCrossChainRecord = () => {
    try {
      const key = storageKeyFor(address, assetId)
      localStorage.removeItem(key)
    } catch {}
  }


  // Fetch-based cross-chain status polling via adapter (Biconomy)
  const checkBiconomyStatus = useCallback(async (superHash: string): Promise<{ status: 'pending' | 'executed' | 'failed' | 'unknown'; explorerLinks?: string[]; bscTxHash?: `0x${string}` } > => {
    try {
      const result = await biconomyAdapter.getStatus({ superTxHash: superHash })
      return { status: result.status, explorerLinks: result.explorerLinks, bscTxHash: result.bscTxHash }
    } catch (e) {
      console.warn('Failed to check Biconomy status:', e)
      return { status: 'unknown' }
    }
  }, [])

  // Start polling when Biconomy superTxHash is available (disabled for performance)
  const ENABLE_BICONOMY_STATUS_POLL = true
  // Max polls before giving up: 72 × 5s = 6 minutes
  const MAX_POLL_COUNT = 72
  const pollCountRef = useRef(0)
  useEffect(() => {
    if (!ENABLE_BICONOMY_STATUS_POLL) return
    if (!isBiconomyCrossChain || !biconomySuperTxHashRef.current) return
    if (lastCrossChainStatusRef.current === 'executed') {
      return () => {}
    }

    let cancelled = false
    if (pollingHashRef.current === biconomySuperTxHashRef.current && crossChainPollRef.current) {
      return () => {}
    }
    setCrossChainStatus('pending')
    lastCrossChainStatusRef.current = 'pending'
    pollingHashRef.current = biconomySuperTxHashRef.current
    pollCountRef.current = 0

    const poll = async () => {
      if (isPollingRef.current) return
      // Stop polling after max attempts to avoid indefinite loop when API never resolves
      if (pollCountRef.current >= MAX_POLL_COUNT) {
        console.warn('[crosschain] Polling timed out after', MAX_POLL_COUNT, 'attempts')
        if (crossChainPollRef.current != null) clearInterval(crossChainPollRef.current)
        crossChainPollRef.current = null
        pollingHashRef.current = null
        isPollingRef.current = false
        return
      }
      pollCountRef.current += 1
      isPollingRef.current = true
      const { status, explorerLinks, bscTxHash } = await checkBiconomyStatus(biconomySuperTxHashRef.current!)
      if (cancelled) return
      if (status !== lastCrossChainStatusRef.current) {
        setCrossChainStatus(status as any)
      }
      if (explorerLinks && explorerLinks.length) {
        const prev = biconomyExplorerLinks || []
        const next = explorerLinks
        if (prev.length !== next.length || prev.some((v, i) => v !== next[i])) {
          setBiconomyExplorerLinks(next)
        }
      }
      if (bscTxHash && bscTxHash !== (biconomyBscTxHash as any)) {
        setBiconomyBscTxHash(bscTxHash)
      }

      // Fill the destination hash on our verified_transactions row so
      // Perry's activity block can render a working explorer link instead of
      // suppressing it. Once-per-session via ref guard — endpoint is
      // idempotent anyway, so a double-call is safe but wasteful.
      if (
        bscTxHash &&
        biconomySuperTxHashRef.current &&
        !destBackfillSentRef.current
      ) {
        destBackfillSentRef.current = true
        try {
          const token = await getAccessToken()
          const { backfillCrossChainDestination } = await import('@/lib/crosschain/backfill')
          await backfillCrossChainDestination({
            sourceKey: biconomySuperTxHashRef.current,
            destinationTxHash: bscTxHash,
            accessToken: token ?? null,
          })
        } catch (err) {
          // Reset so a later poll can retry if the user is still watching.
          destBackfillSentRef.current = false
          console.warn('[crosschain] backfill-destination failed (will retry):', err)
        }
      }
      if (status !== lastCrossChainStatusRef.current) {
        lastCrossChainStatusRef.current = status as any
        try {
          if (status === 'pending') {
            toast('Cross-chain processing', { description: 'Your supply is being processed. This can take 1-3 minutes.' })
          } else if (status === 'executed') {
            const destinationConfig = getChainConfig(destinationHubChainId) as any
            const chainName = destinationConfig?.chainNameReadable || 'destination chain'
            toast(`Supply executed on ${chainName}`, { description: 'Your cross-chain supply completed successfully.' })
            if (!verificationSentRef.current && supplyHash && address && chainId) {
              verificationSentRef.current = true
              // Use Biconomy-based verification for cross-chain transactions
              verifyCrossChainTransaction(supplyHash, chainId, destinationHubChainId)
                .then(() => {
                  try { toast('Rewards updated', { description: 'Your transaction has been verified for the leaderboard.' }) } catch {}
                })
                .catch((error) => {
                  console.warn('Cross-chain verification failed:', error)
                })
            }
          } else if (status === 'failed') {
            toast('Cross-chain execution failed', { description: 'Execution on the destination chain failed.' })
          }
        } catch {}
      }
      isPollingRef.current = false
      if (status === 'executed' || status === 'failed') {
        if (crossChainPollRef.current != null) clearInterval(crossChainPollRef.current)
        crossChainPollRef.current = null
        pollingHashRef.current = null
        // ensure UI hint reflects terminal state
        try {
          if (status === 'executed') setStatusHint('Destination execution confirmed!')
          else setStatusHint('Destination execution failed')
        } catch {}
      }
    }

    poll()
    crossChainPollRef.current = setInterval(poll, 5000)

    return () => {
      cancelled = true
      if (crossChainPollRef.current != null) clearInterval(crossChainPollRef.current)
      crossChainPollRef.current = null
      pollingHashRef.current = null
      isPollingRef.current = false
    }
  }, [ENABLE_BICONOMY_STATUS_POLL, isBiconomyCrossChain, biconomySuperTxHashState, checkBiconomyStatus, supplyHash, address, chainId])

  const {
    isLoading: isEnterMarketConfirming,
    isSuccess: isEnterMarketSuccess,
    error: enterMarketReceiptError
  } = useWaitForTransactionReceipt({
    hash: enterMarketHash,
  })

  // Safety net: recover if wallet prompt or receipt confirmation gets stuck and never settles.
  useEffect(() => {
    const waitingForPreflight = step === 'checking-allowance'
    const waitingForWalletConfirmation =
      (step === 'approving' && !approveHash && !isApprovalConfirming) ||
      (step === 'supplying' && !supplyHash && !isSupplyConfirming) ||
      (step === 'entering-market' && !enterMarketHash && !isEnterMarketConfirming)
    // Only count receipt confirmation as "waiting" when the step is actively in a
    // transaction flow. A restored-but-idle cross-chain record sets supplyHash to a
    // Biconomy superTxHash (non-EVM) which wagmi can never resolve, so
    // isSupplyConfirming stays true indefinitely — without this guard the stall
    // timeout would fire ~3 minutes after every page load.
    const waitingForReceiptConfirmation =
      step !== 'idle' &&
      ((Boolean(approveHash) && isApprovalConfirming) ||
       (Boolean(supplyHash) && isSupplyConfirming) ||
       (Boolean(enterMarketHash) && isEnterMarketConfirming))

    const timeoutMs = waitingForPreflight
      ? PREFLIGHT_STALL_TIMEOUT_MS
      : waitingForWalletConfirmation
        ? WALLET_CONFIRMATION_STALL_TIMEOUT_MS
        : waitingForReceiptConfirmation
          ? RECEIPT_CONFIRMATION_STALL_TIMEOUT_MS
          : null

    if (!timeoutMs) return

    const txHash = supplyHash || approveHash || enterMarketHash
    const message = waitingForReceiptConfirmation
      ? 'Transaction confirmation is taking longer than expected. Check your wallet or explorer and retry when ready.'
      : waitingForWalletConfirmation
        ? 'Wallet confirmation timed out. Please reopen your wallet and retry.'
        : 'Transaction setup took too long. Please retry.'

    const timer = window.setTimeout(() => {
      recoverFromStalledTransaction(message, txHash)
    }, timeoutMs)

    return () => window.clearTimeout(timer)
  }, [
    step,
    approveHash,
    supplyHash,
    enterMarketHash,
    isApprovalConfirming,
    isSupplyConfirming,
    isEnterMarketConfirming,
    recoverFromStalledTransaction,
  ])

  // Biconomy-based verification for cross-chain transactions
  const verifyCrossChainTransaction = useCallback(async (superTxHash: string, sourceChainId: number, destinationChainId: number) => {
    try {
      const response = await fetch('/api/biconomy/verify-crosschain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          superTxHash,
          destinationChainId
        })
      })

      if (!response.ok) {
        throw new Error(`Verification failed: ${response.status}`)
      }

      const result = await response.json()

      if (result.isValid) {
        // Call the regular leaderboard verify endpoint with the verified data
        // Use source chain ID to track cross-chain transaction origin
        await fetch('/api/leaderboard/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            txHash: superTxHash,
            walletAddress: address,
            chainId: sourceChainId, // Use source chain to track origin
            actionType: 'cross-chain_supply',
            amount: cleanAmount(amount),
            usdValue: parseFloat(cleanAmount(amount)) * (asset?.price || 0),
            tokenSymbol: asset?.symbol,
            contractAddress: result.contractAddress || (contractAddresses as any)?.pTokenAddress,
            destinationChainId, // Include destination for metadata
          })
        })
      }

      return result
    } catch (error) {
      console.error('Cross-chain verification failed:', error)
      throw error
    }
  }, [address, amount, asset, contractAddresses])

  // Helper to emit dialog updates
  const emitUpdate = useCallback((nextStep: string, message?: string, hash?: string) => {
    try {
      if (typeof window !== 'undefined') {
        // Check if this transaction was dismissed by user
        if (hash && isTransactionDismissed(hash)) {
          // Transaction was dismissed, don't emit events
          return
        }
        
        const detail: any = { action: 'supply', step: nextStep }
        if (message) detail.statusMessage = message
        if (hash) detail.txHash = hash
        if (isBiconomyCrossChain) {
          detail.isCrossChain = true
          // Include cross-chain specific data
          if (biconomyFee) detail.biconomyFee = biconomyFee
          if (biconomyFeeDetails) detail.biconomyFeeDetails = biconomyFeeDetails
          if (biconomyTrackingUrl) detail.trackingUrl = biconomyTrackingUrl
          if (biconomyMeeLink) detail.meeScanLink = biconomyMeeLink
          if (crossChainStatus) detail.crossChainStatus = crossChainStatus
        }
        window.dispatchEvent(new CustomEvent('peridot:tx-update', { detail }))
      }
    } catch {}
  }, [isBiconomyCrossChain, biconomyFee, biconomyFeeDetails, biconomyTrackingUrl, biconomyMeeLink, crossChainStatus])

  // ─── Privy embedded-wallet send ───────────────────────────────────────────────
  // Sends a single call through Privy's `useSendTransaction` instead of wagmi.
  // Two-stage, mirroring use-easy-supply / use-agent-execution: (1) sponsored +
  // silent — hub-chain gas is covered via our Pimlico policy / Privy credits, so
  // the user sees no popup; (2) on sponsorship failure, fall back to a self-paid
  // popup with an explicit gas limit (Privy doesn't auto-estimate on the self-paid
  // path → "intrinsic gas too low" without it). The silent self-paid middle step is
  // skipped on purpose: that's the one Privy routes through Alchemy's
  // `wallet_sendTransaction`, which the BSC RPC rejects.
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

  // Execute supply mint (defined before useEffect to avoid hoisting issues)
  const executeSupplyMint = useCallback(async () => {
    // For Biconomy cross-chain, local contract addresses are not required
    if (!isBiconomyCrossChain && !contractAddresses) {
      setError('Contract addresses not available')
      setStep('error')
      return
    }
    
    if (!address) {
      setError('Wallet not connected')
      setStep('error')
      return
    }
    
    try {
      if (isBiconomyCrossChain) {
        // Guard: Don't proceed if there's an insufficient balance error (double-check)
        if (error && /insufficient balance/i.test(error)) {
          console.warn('[SupplyHook] Blocking executeSupplyMint due to insufficient balance error')
          setStep('error')
          emitUpdate('error', error)
          return
        }
        // Cross-chain path (Biconomy): compose and execute supertransaction
        if (!address) throw new Error('Wallet not connected')
        if (!sourceTokenForBiconomy || !pTokenOnDestination) throw new Error('Cross-chain configuration not ready. Please wait and try again.')
        
        // Comprehensive logging before starting supply
        console.log('[SupplyHook] Starting Biconomy cross-chain supply', {
          userAddress: address,
          sourceChainId: chainId,
          sourceTokenAddress: sourceTokenForBiconomy,
          destinationChainId: destinationHubChainId,
          pTokenAddress: pTokenOnDestination,
          amountWei: parsedAmount.toString(),
          amountFormatted: formatUnits(parsedAmount, effectiveAmountDecimals),
          assetSymbol: assetSymbolUpper,
          isSourceHubChain: isHubChain(chainId),
          isDestinationHubChain: isHubChain(destinationHubChainId),
          enableAsCollateral: !!meeAuthorization,
          hasSmartAccount: !!biconomySmartAccountAddress,
        })
        
        // Validate token addresses and chain IDs
        const validationErrors: string[] = []
        if (!sourceTokenForBiconomy || sourceTokenForBiconomy === '0x0000000000000000000000000000000000000000') {
          validationErrors.push('Invalid source token address')
        }
        if (!pTokenOnDestination || pTokenOnDestination === '0x0000000000000000000000000000000000000000') {
          validationErrors.push('Invalid destination pToken address')
        }
        if (!chainId || chainId <= 0) {
          validationErrors.push('Invalid source chain ID')
        }
        if (!destinationHubChainId || destinationHubChainId <= 0) {
          validationErrors.push('Invalid destination chain ID')
        }
        if (parsedAmount <= BigInt(0)) {
          validationErrors.push('Invalid amount (must be > 0)')
        }
        if (chainId === destinationHubChainId) {
          validationErrors.push('Source and destination chain IDs are the same')
        }
        
        if (validationErrors.length > 0) {
          const errorMsg = `Supply validation failed: ${validationErrors.join(', ')}`
          console.error('[SupplyHook]', errorMsg, {
            sourceTokenForBiconomy,
            pTokenOnDestination,
            chainId,
            destinationHubChainId,
            parsedAmount: parsedAmount.toString(),
          })
          throw new Error(errorMsg)
        }
        
        // ── EOA signer check: Privy SA users must have tokens at the signer EOA ──
        // Biconomy's permit/execute verification uses ecrecover, which works only
        // for EOA addresses. Smart contract (SA) addresses always fail ecrecover.
        // So we always pass the EOA signer as ownerAddress to Biconomy.
        // If the source tokens are at the SA but not the EOA, block and guide the user
        // to move funds via the Wallet Management Dialog ("Withdraw to Signer").
        const effectiveUserAddress: Address =
          isSmartAccountActive && signerAddress &&
          (signerAddress as string).toLowerCase() !== (address as string).toLowerCase()
            ? signerAddress as Address
            : address as Address

        if (
          isSmartAccountActive &&
          signerAddress &&
          (signerAddress as string).toLowerCase() !== (address as string).toLowerCase() &&
          sourceTokenForBiconomy &&
          sourcePublicClient
        ) {
          const eoaSigner = signerAddress as Address
          const saAddr = address as Address
          const [saBalance, eoaBalance] = await Promise.all([
            sourcePublicClient.readContract({ address: sourceTokenForBiconomy as Address, abi: erc20Abi, functionName: 'balanceOf', args: [saAddr] }),
            sourcePublicClient.readContract({ address: sourceTokenForBiconomy as Address, abi: erc20Abi, functionName: 'balanceOf', args: [eoaSigner] }),
          ])
          if ((saBalance as bigint) >= parsedAmount && (eoaBalance as bigint) < parsedAmount) {
            console.log('[SupplyHook] Blocking supply: tokens are at Privy SA, not at EOA signer', {
              saAddr, eoaSigner, token: sourceTokenForBiconomy, saBalance: saBalance.toString(), eoaBalance: eoaBalance.toString(),
            })
            const msg = 'Your tokens are in your smart wallet. Open the Wallet section → Funding → "Withdraw to Signer" to move them to your signer wallet first, then supply.'
            setError(msg)
            setStep('error')
            emitUpdate('error', msg)
            markTxIdle()
            return
          }
        }

        setStep('supplying')
        let result
        try {
          console.log('[SupplyHook] Calling biconomyAdapter.startSupply with params:', {
            userAddress: effectiveUserAddress,
            smartAccountAddress: biconomySmartAccountAddress,
            sourceChainId: chainId!,
            sourceTokenAddress: sourceTokenForBiconomy,
            destinationChainId: destinationHubChainId,
            pTokenAddress: pTokenOnDestination,
            amountWei: parsedAmount.toString(),
            enableAsCollateral: !!meeAuthorization,
            returnPTokensToUser: true,
            postEnableAsCollateral: false,
            hasMeeAuthorization: !!meeAuthorization,
          })

          // Determine execution mode based on account type.
          // SMART_ACCOUNT must use smart-account mode so Biconomy quotes/execution align
          // with smart-account ownership/signing semantics.
          const executionMode: ExecutionMode =
            isSmartAccountActive
              ? 'smart-account'
              : (accountType === 'EOA_7702' ? 'eoa-7702' : 'eoa')
          console.log('[SupplyHook] 🔍 DEBUG accountType & executionMode', { accountType, executionMode, effectiveUserAddress, biconomySmartAccountAddress })


          result = await biconomyAdapter.startSupply({
            userAddress: effectiveUserAddress,
            signerAddress: effectiveUserAddress,
            // Pass the wagmi wallet client so the adapter can sign through the Privy
            // connector instead of window.ethereum (Privy wallets are not injected there).
            signingClient: wagmiWalletClient || undefined,
            smartAccountAddress: biconomySmartAccountAddress,
            sourceChainId: chainId!,
            sourceTokenAddress: sourceTokenForBiconomy,
            destinationChainId: destinationHubChainId,
            pTokenAddress: pTokenOnDestination,
            amountWei: parsedAmount,
            enableAsCollateral: !!meeAuthorization,
            returnPTokensToUser: true,
            // Cross-chain path only: run a follow-up sponsored enable-collateral
            postEnableAsCollateral: false,
            meeAuthorization,
            executionMode,
          })
          
          console.log('[SupplyHook] biconomyAdapter.startSupply completed', {
            hasResult: !!result,
            superTxHash: result?.superTxHash,
            trackingUrl: result?.trackingUrl,
          })
        } catch (e: any) {
          const msg = String(e?.message || e || '')
          if (msg.startsWith('BICONOMY_ONCHAIN_APPROVAL_REQUIRED:')) {
            try {
              const json = msg.slice('BICONOMY_ONCHAIN_APPROVAL_REQUIRED:'.length)
              const payload = JSON.parse(json)
              const spender = payload?.spender as Address | undefined
              const token = (sourceTokenForBiconomy as Address)
              const amount = parsedAmount
              if (!spender || !token) throw new Error('approval-missing-data')
              setStep('approving')
              if (DEBUG) { try { console.debug('[SupplyHook] Approving funding token for Biconomy (on-chain)', { token, spender, amount: amount.toString() }) } catch {} }
              
              if (isSmartAccountActive) {
                await executeSmartTx({
                  to: token,
                  data: encodeFunctionData({
                    abi: erc20Abi,
                    functionName: 'approve',
                    args: [spender, amount],
                  }),
                }, {
                  onSuccess: (h) => setApproveHash(h)
                })
              } else {
                // Use wagmi writeContract hook for approval (on source chain)
                await writeApprove({
                  address: token,
                  abi: erc20Abi as any,
                  functionName: 'approve',
                  args: [spender, amount],
                } as any)
              }
              setStep('supplying')
              // Keep retry mode consistent with the initial attempt.
              const executionMode: ExecutionMode =
                isSmartAccountActive
                  ? 'smart-account'
                  : (accountType === 'EOA_7702' ? 'eoa-7702' : 'eoa')
              console.log('[SupplyHook] 🔍 DEBUG (retry after approval) accountType & executionMode', { accountType, executionMode, address, biconomySmartAccountAddress })

              result = await biconomyAdapter.startSupply({
                userAddress: effectiveUserAddress,
                signerAddress: effectiveUserAddress,
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
            } catch (inner) {
              throw inner
            }
          } else if (msg.includes('INSUFFICIENT_FOR_FEE_BUDGET')) {
            // Biconomy handles fee deduction automatically - this error means the amount is too small
            const payload = parseFeeBudgetErrorPayload(msg)
            const requiredWei = getRequiredWeiFromPayload(payload)
            const tokenSymbol = asset?.symbol || 'tokens'
            let friendly = `The amount you're trying to supply is too small to cover the cross-chain fee. Please increase the amount.`
            if (requiredWei && requiredWei > BigInt(0)) {
              const formattedRequired = formatTokenAmountFromWei(requiredWei, underlyingDecimals)
              friendly = `Amount too small. The cross-chain fee requires at least ${formattedRequired} ${tokenSymbol}. Please supply a larger amount.`
            }
            setError(friendly)
            try {
              toast('Amount too small', { description: friendly })
            } catch {}
            markTxIdle()
            setStep('error')
            return
          } else if (msg.includes('FEE_EXCEEDS_TOLERANCE')) {
            // This error should no longer occur since we removed fee netting, but keep for safety
            const friendly = 'The network fee is higher than expected. Please retry your supply or try a different amount.'
            setError(friendly)
            try { toast('Fee issue', { description: friendly }) } catch {}
            markTxIdle()
            setStep('error')
            return
          } else if (/Compose \(net\) failed|Quote \(net\) failed/i.test(msg)) {
            // These errors should no longer occur since we removed netting, but keep for safety
            const friendly = 'Unable to process the transaction. Please retry your supply.'
            setError(friendly)
            try { toast('Transaction failed', { description: friendly }) } catch {}
            markTxIdle()
            setStep('error')
            return
          } else if (/Route not found|BICONOMY_ROUTE_NOT_FOUND/i.test(msg)) {
            const friendly = 'No route found for this amount. Try increasing the amount or slippage.'
            setError(friendly)
            try { toast('No route found', { description: friendly, duration: 10000 }) } catch {}
            markTxIdle()
            emitUpdate('error', friendly)
            setStep('error')
            return
          } else {
            throw e
          }
        }
        biconomySuperTxHashRef.current = result.superTxHash
        setBiconomySuperTxHashState(result.superTxHash)
        // Persist a resumable record for this wallet+asset
        saveCrossChainRecord({
          superTxHash: result.superTxHash,
          chainId,
          assetId,
          amount: cleanAmount(amount),
        })
        setSupplyHash(result.superTxHash as any)
        setBiconomyTrackingUrl(result.trackingUrl)
        if ((result as any).fee) setBiconomyFee((result as any).fee)
        if ((result as any).feeDetails) setBiconomyFeeDetails((result as any).feeDetails)
        if ((result as any).meeScanLink) setBiconomyMeeLink((result as any).meeScanLink)
        // Immediately persist cross-chain tx to DB (optimistic). Use source chain to track origin.
        try {
          const sourceChainId = chainId // Use source chain ID to track where transaction originated
          const symbol = asset?.symbol
          const usd = parseFloat(cleanAmount(amount)) * (asset?.price || 0)
          const cfg: any = getChainConfig(destinationHubChainId)
          const pTokenAddr = (cfg?.markets?.[symbol?.toUpperCase?.() || '']?.pToken) as Address | undefined
          
          // Get Privy access token for security header
          const token = await getAccessToken()
          
          await fetch('/api/leaderboard/verify-crosschain', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            },
            body: JSON.stringify({
              walletAddress: address,
              superTxHash: result.superTxHash,
              chainId: sourceChainId,
              actionType: 'cross-chain_supply',
              tokenSymbol: symbol,
              amount: cleanAmount(amount),
              usdValue: usd,
              contractAddress: pTokenAddr || (pTokenOnDestination as string),
              destinationChainId, // Include destination for tracking
            })
          })
        } catch (err) {
          console.warn('[crosschain] failed to persist immediately', err)
        }
        // Immediately switch to submitted state; status polling updates final execution state
        setStep('success')
        setStatusHint('Submitted. Bridge in progress...')
        lastCrossChainStatusRef.current = 'pending'
        setCrossChainStatus('pending')
        // Local submission complete → clear guard & global flag
        markTxIdle()

        // Cross-chain submission should still trigger success lifecycle hooks so UI can refresh immediately.
        if (!onSuccessCalledRef.current) {
          onSuccessCalledRef.current = true
          onSuccessRef.current?.()
        }
        try {
          const successDetail: any = {
            type: 'supply',
            address,
            chainId,
            assetId,
            txHash: result.superTxHash,
            observed_at: new Date().toISOString(),
            tokenSymbol: asset?.symbol || assetId?.toUpperCase?.(),
            isCrossChain: true,
            crossChainStatus: 'pending',
          }
          if ((result as any).fee) successDetail.biconomyFee = (result as any).fee
          if ((result as any).feeDetails) successDetail.biconomyFeeDetails = (result as any).feeDetails
          if (result.trackingUrl) successDetail.trackingUrl = result.trackingUrl
          if ((result as any).meeScanLink) successDetail.meeScanLink = (result as any).meeScanLink
          window.dispatchEvent(new CustomEvent('peridot:tx-success', { detail: successDetail }))
        } catch {}
      } else {
        if (isNative) {
          if (DEBUG) {
            try { console.debug('[SupplyHook] Calling mint (native)', { pTokenAddress: (contractAddresses as any).pTokenAddress, value: parsedAmount.toString() }) } catch {}
          }
          
          if (isSmartAccountActive) {
            await executeSmartTx({
              to: (contractAddresses as any).pTokenAddress as Address,
              data: encodeFunctionData({
                abi: pbnbAbi as any,
                functionName: 'mint',
                args: [],
              }),
              value: parsedAmount,
            }, {
              onSuccess: (h) => setSupplyHash(h)
            })
          } else if (isEmbeddedWallet) {
            const h = await sendViaPrivyEmbedded(
              (contractAddresses as any).pTokenAddress as Address,
              encodeFunctionData({ abi: pbnbAbi as any, functionName: 'mint', args: [] }),
              parsedAmount,
            )
            setSupplyHash(h)
          } else {
            writeSupply({
              address: (contractAddresses as any).pTokenAddress as Address,
              abi: pbnbAbi as any,
              functionName: 'mint',
              args: [],
              value: parsedAmount,
            } as any)
          }
        } else {
          if (DEBUG) {
            try { console.debug('[SupplyHook] Calling mint (ERC20)', { pTokenAddress: (contractAddresses as any).pTokenAddress, amount: parsedAmount.toString() }) } catch {}
          }
          
          if (isSmartAccountActive) {
            await executeSmartTx({
              to: (contractAddresses as any).pTokenAddress as Address,
              data: encodeFunctionData({
                abi: combinedAbi,
                functionName: 'mint',
                args: [parsedAmount],
              }),
            }, {
              onSuccess: (h) => setSupplyHash(h)
            })
          } else if (isEmbeddedWallet) {
            const h = await sendViaPrivyEmbedded(
              (contractAddresses as any).pTokenAddress as Address,
              encodeFunctionData({ abi: combinedAbi, functionName: 'mint', args: [parsedAmount] }),
            )
            setSupplyHash(h)
          } else {
            writeSupply({
              address: (contractAddresses as any).pTokenAddress as Address,
              abi: combinedAbi,
              functionName: 'mint',
              args: [parsedAmount],
            } as any)
          }
        }
      }
    } catch (err) {
      console.error('Error executing supply mint:', err)
      setError('Failed to execute supply transaction')
      // Terminal error path → clear guard & global flag
      markTxIdle()
      setStep('error')
    }
  }, [contractAddresses, parsedAmount, writeSupply, address,  spokeAddress, assetId, isEmbeddedWallet, isSmartAccountActive, executeSmartTx, sendViaPrivyEmbedded, isNative])

  // Execute enter market (enable pToken as collateral)
  const executeEnterMarket = useCallback(async () => {
    if (!contractAddresses || !controllerAddress) {
      setError('Contract addresses not available for entering market')
      setStep('error')
      return
    }
    
    if (!address) {
      setError('Wallet not connected')
      setStep('error')
      return
    }
    
    try {
      if (DEBUG) {
        try { console.debug('[SupplyHook] Calling enterMarkets', { controllerAddress, pTokenAddress: contractAddresses.pTokenAddress }) } catch {}
      }
      if (isSmartAccountActive) {
        // Smart Account: Enter Market
        executeSmartTx({
          to: controllerAddress as Address,
          data: encodeFunctionData({
            abi: combinedAbi,
            functionName: 'enterMarkets',
            args: [[contractAddresses.pTokenAddress as Address]],
          }),
        }, {
          onSuccess: (h) => {
            setEnterMarketHash(h)
          }
        })
      } else if (isEmbeddedWallet) {
        const h = await sendViaPrivyEmbedded(
          controllerAddress as Address,
          encodeFunctionData({
            abi: combinedAbi,
            functionName: 'enterMarkets',
            args: [[contractAddresses.pTokenAddress as Address]],
          }),
        )
        setEnterMarketHash(h)
      } else {
        writeEnterMarket({
          address: controllerAddress as Address,
          abi: combinedAbi,
          functionName: 'enterMarkets',
          args: [[contractAddresses.pTokenAddress as Address]], // Array of pToken addresses
        } as any)
      }
    } catch (err) {
      console.error('Error entering market:', err)
      setError('Failed to enable asset as collateral')
      setStep('error')
    }
  }, [contractAddresses, controllerAddress, writeEnterMarket, address, isSmartAccountActive, executeSmartTx, isEmbeddedWallet, sendViaPrivyEmbedded])

  // Set step to approved when approval succeeds
  useEffect(() => {
    if (isApprovalSuccess && step !== 'approved' && step !== 'supplying' && step !== 'success') {
      setStep('approved')
      emitUpdate('approved', 'Approval confirmed! Preparing supply...')
      hasExecutedSupply.current = false // Reset the flag
    }
  }, [isApprovalSuccess, step])

  // Handle approval success - proceed to supply
  useEffect(() => {
    if (isApprovalSuccess && step === 'approved' && !hasExecutedSupply.current && address) {
      refetchAllowance()
      
      // Auto-proceed to supply after approval with longer timeout
      const timer = setTimeout(() => {
        if (contractAddresses && !hasExecutedSupply.current && address) {
          hasExecutedSupply.current = true
          setStep('supplying')
          emitUpdate('supplying', isSupplyPending ? 'Please confirm supply in wallet...' : 'Supplying tokens...')
          executeSupplyMint()
        }
      }, 2500) // Slightly longer delay to reduce burst into Axelar
      
      return () => clearTimeout(timer)
    }
  }, [isApprovalSuccess, step, contractAddresses, executeSupplyMint, refetchAllowance, address])

  // Handle supply success
  useEffect(() => {
    if (isSupplySuccess) {
      // Mark submission as completed for wallet prompts (cross-chain continues in background)
      markTxIdle()
      setStep('success')
      emitUpdate('success', '')
      // For cross-chain, treat this as 'pending' success; call onSuccess once when local chain tx confirms
      if (!onSuccessCalledRef.current) {
        onSuccessCalledRef.current = true
        onSuccessRef.current?.()
      }

      try {
        const successDetail: any = {
          type: 'supply',
          address,
          chainId,
          assetId,
          txHash: supplyHash,
          observed_at: new Date().toISOString(),
          tokenSymbol: asset?.symbol || assetId?.toUpperCase?.(),
        }
        if (isBiconomyCrossChain) {
          successDetail.isCrossChain = true
          if (biconomyFee) successDetail.biconomyFee = biconomyFee
          if (biconomyFeeDetails) successDetail.biconomyFeeDetails = biconomyFeeDetails
          if (biconomyTrackingUrl) successDetail.trackingUrl = biconomyTrackingUrl
          if (biconomyMeeLink) successDetail.meeScanLink = biconomyMeeLink
          if (crossChainStatus) successDetail.crossChainStatus = crossChainStatus
        }
        window.dispatchEvent(new CustomEvent('peridot:tx-success', { detail: successDetail }))
      } catch {}

      // Pre-verify supply transaction in leaderboard (immediate reward for same-chain)
      const isResumedCrossChain = (isBiconomyCrossChain) && step === 'success' && (lastCrossChainStatusRef.current === 'pending' || crossChainStatus === 'pending')
      if (supplyHash && address && chainId && asset && !isResumedCrossChain) {
        try {
          const k = `peridot:preverify:${supplyHash}`
          const seen = sessionStorage.getItem(k)
          if (!seen) sessionStorage.setItem(k, '1')
          if (seen) {
            // Deduplicate repeated pre-verify during HMR or accidental re-renders
            return
          }
        } catch {}
        const storedRefCode = sessionStorage.getItem('referralCode')
        
        getAccessToken().then(token => {
          fetch('/api/leaderboard/pre-verify', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            },
            body: JSON.stringify({
              txHash: supplyHash,
              walletAddress: address,
              chainId,
              actionType: 'supply',
              amount: cleanAmount(amount),
              usdValue: parseFloat(cleanAmount(amount)) * (asset.price || 0),
              tokenSymbol: asset.symbol,
              referralCode: storedRefCode,
            }),
          })
          .then(async response => {
            const result = await response.json()
            if (response.ok && result.success) {
              console.log('Supply transaction acknowledged and points awarded:')
              // Kick off strict verification to persist the transaction in DB
              try {
              autoVerifyTransaction({
                txHash: supplyHash,
                walletAddress: address,
                chainId,
                privyToken: token,
                onSuccess: () => { try { console.debug('[SupplyHook] Strict verification completed') } catch {} },
                onError: () => { try { console.warn('[SupplyHook] Strict verification failed; user can retry manually') } catch {} },
              }).catch(() => {})
              } catch {}
              return
            }
            // If server returns 409 for already processed, stop retrying silently
            if (response.status === 409 && result?.alreadyProcessed) {
              return
            }
            console.warn('Pre-verification failed:', result.error)
          })
          .catch(error => {
            console.warn('Pre-verification request failed:', error)
          })
        })

      }
    }
  }, [isSupplySuccess, supplyHash, address, chainId])

  // Note: Enter market is now handled separately via manual user action

  // Handle approval errors
  useEffect(() => {
    const combinedError = approveError || approvalReceiptError
    if (combinedError) {
      const errorObject = combinedError instanceof Error ? combinedError : new Error(String(combinedError))
      console.error("An approval error occurred:", errorObject)
      
      const messageLc = errorObject.message.toLowerCase()
      if (messageLc.includes('user rejected') || messageLc.includes('user denied') || messageLc.includes('rejected by user')) {
        setError('Approval rejected. Please try again.')
        try { toast('Approval rejected', { description: 'You declined the approval in your wallet. You can try again.' }) } catch {}
        markTxIdle()
        emitUpdate('error', 'Approval rejected. Please try again.')
        setStep('idle')
        reset() // Reset state if user rejects
      } else if (isRateLimit(errorObject.message)) {
        const friendly = 'Temporarily rate limited. Please wait 30–60 seconds, then try again.'
        setError(friendly)
        try { toast('Temporarily rate limited', { description: 'Please wait 30–60 seconds and try again. Your funds are safe.', duration: 20000 }) } catch {}
        markTxIdle()
        emitUpdate('error', friendly)
        setStep('error')
      } else {
        onErrorRef.current?.(errorObject)
        setError(errorObject.message)
        try { toast('Approval failed', { description: 'There was a problem approving tokens. Please try again.' }) } catch {}
        markTxIdle()
        emitUpdate('error', errorObject.message)
        setStep('error')
      }
    }
  }, [approveError, approvalReceiptError])

  // Handle supply errors
  useEffect(() => {
    const combinedError = supplyError || supplyReceiptError
    if (combinedError) {
      const errorObject = combinedError instanceof Error ? combinedError : new Error(String(combinedError))
      console.error("A supply error occurred:", errorObject)
      
      const messageLc = errorObject.message.toLowerCase()
      if (messageLc.includes('user rejected') || messageLc.includes('user denied') || messageLc.includes('rejected by user')) {
        setError('Supply transaction rejected. Please try again.')
        try { toast('Supply rejected', { description: 'You declined the transaction in your wallet. You can try again.' }) } catch {}
        markTxIdle()
        emitUpdate('error', 'Supply transaction rejected. Please try again.')
        setStep('idle')
        reset() // Reset state if user rejects
      } else if (isRateLimit(errorObject.message)) {
        const friendly = 'Temporarily rate limited. Please wait 30–60 seconds, then try again.'
        setError(friendly)
        try { toast('Temporarily rate limited', { description: 'Please wait 30–60 seconds and try again. Your funds are safe.', duration: 20000 }) } catch {}
        markTxIdle()
        emitUpdate('error', friendly)
        setStep('error')
      } else if (isTimeoutError(errorObject.message)) {
        const friendly = 'Transaction timed out. Please check your connection and try again.'
        setError(friendly)
        try { toast('Transaction timed out', { description: 'Please check your connection and try again.', duration: 10000 }) } catch {}
        markTxIdle()
        emitUpdate('error', friendly)
        setStep('error')
      } else if (isJsonRpcError(errorObject.message)) {
        const friendly = 'Network error occurred. This is usually temporary - please wait a moment and try again.'
        setError(friendly)
        setLastError(errorObject.message)
        try { toast('Network error', { description: 'A temporary network issue occurred. Please wait a moment and try again.', duration: 15000 }) } catch {}
        markTxIdle()
        emitUpdate('error', friendly)
        setStep('error')
      } else if (isContractExecutionError(errorObject.message)) {
        const friendly = 'Supply transaction failed. This could be due to insufficient liquidity in the market or network congestion. Please try again with a smaller amount or wait a few moments.'
        setError(friendly)
        setLastError(errorObject.message)
        try { toast('Supply failed', { description: 'Transaction failed due to market conditions. Try a smaller amount or wait a moment.', duration: 15000 }) } catch {}
        markTxIdle()
        emitUpdate('error', friendly)
        setStep('error')
      } else {
        onErrorRef.current?.(errorObject)
        setError(errorObject.message)
        try { toast('Supply failed', { description: 'There was a problem submitting the supply. Please try again.' }) } catch {}
        markTxIdle()
        emitUpdate('error', errorObject.message)
        setStep('error')
      }
    }
  }, [supplyError, supplyReceiptError])

  // Execute approval
  const executeApproval = useCallback(async () => {
    if (!contractAddresses) return
    if (DEBUG) {
      try { console.debug('[SupplyHook] Approving ERC20 for pToken', { token: contractAddresses.underlyingAddress, spender: contractAddresses.pTokenAddress, amount: parsedAmount.toString() }) } catch {}
    }
    emitUpdate('approving', 'Please confirm approval in wallet...')

    if (isSmartAccountActive) {
      try {
        const hash = await executeSmartTx({
          to: contractAddresses.underlyingAddress as Address,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: 'approve',
            args: [contractAddresses.pTokenAddress as Address, parsedAmount],
          }),
        }, {
          onSuccess: (h) => {
            setApproveHash(h)
          }
        })
        if (hash) {
          setApproveHash(hash)
        }
      } catch (err) {
        console.error('Smart account approval error:', err)
      }
    } else if (isEmbeddedWallet) {
      try {
        const h = await sendViaPrivyEmbedded(
          contractAddresses.underlyingAddress as Address,
          encodeFunctionData({
            abi: erc20Abi,
            functionName: 'approve',
            args: [contractAddresses.pTokenAddress as Address, parsedAmount],
          }),
        )
        setApproveHash(h)
      } catch (err) {
        console.error('Embedded wallet approval error:', err)
      }
    } else {
      writeApprove({
        address: contractAddresses.underlyingAddress as Address,
        abi: erc20Abi,
        functionName: 'approve',
        args: [contractAddresses.pTokenAddress as Address, parsedAmount],
      } as any)
    }
  }, [contractAddresses, parsedAmount, isSmartAccountActive, executeSmartTx, writeApprove, emitUpdate, DEBUG, isEmbeddedWallet, sendViaPrivyEmbedded])



  // Execute the supply transaction
  const executeSupply = async () => {
    try {
      console.log("[SupplyHook] executeSupply triggered", {
        isSmartAccountActive,
        address,
        chainId,
        amount,
        isBiconomyCrossChain,
        canSupply
      })
      if (isSubmittingRef.current) return
      isSubmittingRef.current = true
      try {
        if (typeof window !== 'undefined') {
          ;(window as any).__PERIDOT_TX_ACTIVE = true
          try { window.dispatchEvent(new CustomEvent('peridot:tx-active')) } catch {}
          // Open cross-chain dialog ASAP on user click when Biconomy path
          if (isBiconomyCrossChain) {
            // Removed cc-dialog-open - now using unified tx-update events
          }
        }
      } catch {}
      setError(null)
      setStep('checking-allowance')
      try { lastAmountRef.current = amount || '' } catch {}
      emitUpdate('checking-allowance', 'Checking allowance...')
      hasExecutedSupply.current = false // Reset flag at start of new transaction
      
      if (!canSupply) {
        throw new Error('Smart contracts for this asset are not available on this network')
      }

      if (!address) {
        throw new Error('Please connect your wallet first')
      }

      if (!amount || parseFloat(amount) <= 0) {
        throw new Error('Please enter a valid amount')
      }

      // For Biconomy cross-chain, local contract addresses are not required
      if (!isBiconomyCrossChain && !contractAddresses) {
        throw new Error('Contract addresses not found')
      }

      // Ensure configuration present for the selected path
      if (isBiconomyCrossChain) {
        if (!sourceTokenForBiconomy || !pTokenOnDestination) {
          throw new Error('Cross-chain configuration not ready. Please wait and try again.')
        }
      } else if (!contractAddresses) {
        throw new Error('Contract addresses not found')
      }

      // Check if approval is needed for same-chain only
      let latestAllowance = allowance as bigint | undefined
      let approvalNeededNow: boolean
      if (isBiconomyCrossChain) {
        approvalNeededNow = false
      } else if (!isNative && latestAllowance !== undefined && parsedAmount <= latestAllowance) {
        approvalNeededNow = false
      } else {
        const refreshed = await refetchAllowance()
        latestAllowance = (refreshed as any)?.data as bigint | undefined
        approvalNeededNow = !isNative && latestAllowance !== undefined && parsedAmount > latestAllowance
      }

      if (DEBUG) {
        try {
          const preflight = buildPreflightSummary()
          console.groupCollapsed('[SupplyHook] Preflight summary')
          console.log(preflight)
          console.groupEnd()
          console.debug('[SupplyHook] Approval decision', { latestAllowance: latestAllowance?.toString?.(), approvalNeededNow })
        } catch {}
      }
      
      // For Biconomy cross-chain EOA paths, pre-quote fees before wallet prompt.
      // Skip smart-account pre-quote to avoid creating an extra quote flow/hash and
      // keep a single canonical quote->execute lifecycle.
      if (
        isBiconomyCrossChain &&
        !isSmartAccountActive &&
        !biconomyFee &&
        sourceTokenForBiconomy &&
        pTokenOnDestination &&
        parsedAmount > BigInt(0)
      ) {
        try {
          const pre = await (biconomyAdapter as any).preQuote?.({
            userAddress: address,
            smartAccountAddress: biconomySmartAccountAddress,
            sourceChainId: chainId,
            destinationChainId: destinationHubChainId,
            sourceTokenAddress: sourceTokenForBiconomy,
            pTokenAddress: pTokenOnDestination,
            amountWei: parsedAmount,
          })
          if (pre?.fee) setBiconomyFee(pre.fee)
          if (pre?.feeDetails) setBiconomyFeeDetails(pre.feeDetails)
        } catch (e) {
          // ignore pre-quote failures
        }
      }

      // For Biconomy cross-chain on spoke chains: validate amount + fee doesn't exceed wallet balance
      if (isBiconomyCrossChain && !isHubChain(chainId) && walletBalance.rawBalance) {
        // Check if fee is in the same token as the supply amount
        const feeTokenMatchesSource = biconomyFeeDetails?.paymentToken?.toLowerCase() === sourceTokenForBiconomy?.toLowerCase()
        
        if (feeTokenMatchesSource && biconomyFeeDetails?.paymentTokenWeiAmount) {
          try {
            const walletBalanceWei = walletBalance.rawBalance as bigint
            const feeWei = BigInt(biconomyFeeDetails.paymentTokenWeiAmount)
            const totalRequired = parsedAmount + feeWei
            
            if (totalRequired > walletBalanceWei) {
              const shortfall = totalRequired - walletBalanceWei
              const shortfallFormatted = formatUnits(shortfall, effectiveAmountDecimals)
              const totalFormatted = formatUnits(totalRequired, effectiveAmountDecimals)
              const balanceFormatted = formatUnits(walletBalanceWei, effectiveAmountDecimals)
              const feeFormatted = formatUnits(feeWei, effectiveAmountDecimals)
              const amountFormatted = formatUnits(parsedAmount, effectiveAmountDecimals)
              
              throw new Error(
                `Insufficient balance for supply + fee. ` +
                `Required: ${totalFormatted} ${assetSymbolUpper} ` +
                `(amount: ${amountFormatted} + fee: ${feeFormatted}), ` +
                `but you only have ${balanceFormatted} ${assetSymbolUpper}. ` +
                `Please reduce the amount by at least ${shortfallFormatted} ${assetSymbolUpper}.`
              )
            }
          } catch (err: any) {
            // If it's our validation error, throw it
            if (err?.message?.includes('Insufficient balance')) throw err
            // Otherwise, log and continue (balance check failed, but don't block transaction)
            console.warn('[SupplyHook] Failed to validate balance + fee', err)
          }
        }
      }

      if (approvalNeededNow) {
        console.log("[SupplyHook] Approval needed, checking SA path", {
          isSmartAccountActive,
          isBiconomyCrossChain,
          isNative,
          hasContractAddresses: !!contractAddresses
        })
        if (isSmartAccountActive && !isBiconomyCrossChain && !isNative && contractAddresses) {
          // Smart Account Batch: Approve + Mint
          setStep('supplying')
          emitUpdate('supplying', 'Supplying with smart account...')
          
          const calls: TransactionCall[] = [
            {
              to: contractAddresses.underlyingAddress as Address,
              data: encodeFunctionData({
                abi: erc20Abi,
                functionName: 'approve',
                args: [contractAddresses.pTokenAddress as Address, parsedAmount],
              }),
            },
            {
              to: (contractAddresses as any).pTokenAddress as Address,
              data: encodeFunctionData({
                abi: combinedAbi,
                functionName: 'mint',
                args: [parsedAmount],
              }),
            }
          ]

          try {
            const hash = await executeSmartTx(calls, {
              onSuccess: (h) => {
                setSupplyHash(h)
                // Transaction confirmed via receipt handler
              }
            })
            if (hash) {
              setSupplyHash(hash)
            }
          } catch (err) {
            console.error('Smart account supply error:', err)
            // Error handled by useSmartExecution toast and onError
          }
        } else {
          setStep('approving')
          emitUpdate('approving', 'Please confirm approval in wallet...')
          executeApproval()
        }
      } else {
        if (isSmartAccountActive && !isBiconomyCrossChain && contractAddresses) {
          // Smart Account: Mint only
          setStep('supplying')
          emitUpdate('supplying', 'Supplying with smart account...')
          
          const call: TransactionCall = isNative ? {
            to: (contractAddresses as any).pTokenAddress as Address,
            data: encodeFunctionData({
              abi: pbnbAbi as any,
              functionName: 'mint',
              args: [],
            }),
            value: parsedAmount,
          } : {
            to: (contractAddresses as any).pTokenAddress as Address,
            data: encodeFunctionData({
              abi: combinedAbi,
              functionName: 'mint',
              args: [parsedAmount],
            }),
          }

          try {
            const hash = await executeSmartTx(call, {
              onSuccess: (h) => {
                setSupplyHash(h)
              }
            })
            if (hash) {
              setSupplyHash(hash)
            }
          } catch (err) {
            console.error('Smart account supply error:', err)
          }
        } else {
          setStep('supplying')
          emitUpdate('supplying', isSupplyPending ? 'Please confirm supply in wallet...' : 'Supplying tokens...')
          executeSupplyMint()
        }
      }
    } catch (err) {
      const error = err as Error
      setError(error.message)
      setStep('error')
      emitUpdate('error', error.message)
      
      // For insufficient balance errors on cross-chain, emit tx-update to open dialog with fee
      if (isBiconomyCrossChain && /insufficient balance/i.test(error.message)) {
        try {
          window.dispatchEvent(new CustomEvent('peridot:tx-update', {
            detail: {
              action: 'supply',
              step: 'error',
              statusMessage: error.message,
              isCrossChain: true,
              txHash: undefined,
              trackingUrl: biconomyTrackingUrl,
              biconomyFee: biconomyFee,
              biconomyFeeDetails: biconomyFeeDetails,
              meeScanLink: biconomyMeeLink,
              crossChainStatus: crossChainStatus
            }
          }))
        } catch {}
      }
      
      isSubmittingRef.current = false
      try {
        if (typeof window !== 'undefined') {
          ;(window as any).__PERIDOT_TX_ACTIVE = false
          window.dispatchEvent(new CustomEvent('peridot:tx-idle'))
        }
      } catch {}
      onError?.(error)
    }
  }

  // Reset error state when amount changes (allows new transaction attempt)
  useEffect(() => {
    // If there's an insufficient balance error and amount changes, reset error state
    if (error && /insufficient balance/i.test(error) && step === 'error') {
      // Only reset if amount actually changed (not just on mount)
      const currentAmount = cleanAmount(amount || '')
      const lastAmount = lastAmountRef.current
      if (currentAmount && lastAmount && currentAmount !== lastAmount) {
        console.log('[SupplyHook] Amount changed after insufficient balance error, resetting error state', {
          oldAmount: lastAmount,
          newAmount: currentAmount
        })
        setError(null)
        setStep('idle')
        // Clear fee details to force fresh quote
        setBiconomyFee(undefined)
        setBiconomyFeeDetails(undefined)
        // Reset submitting flag to allow new transaction
        isSubmittingRef.current = false
        // Emit idle event to reset dialog state
        try {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('peridot:tx-idle'))
          }
        } catch {}
      }
    }
  }, [amount, error, step])

  // Reset function
  const reset = () => {
    setStep('idle')
    setError(null)
    setApproveHash(undefined)
    setSupplyHash(undefined)
    setEnterMarketHash(undefined)
    setRetryCount(0)
    setLastError(null)
    hasExecutedSupply.current = false
    hasExecutedEnterMarket.current = false
    isSubmittingRef.current = false
    hasSubmittedCrossChainWriteRef.current = false
    try {
      if (typeof window !== 'undefined') {
        ;(window as any).__PERIDOT_TX_ACTIVE = false
        window.dispatchEvent(new CustomEvent('peridot:tx-idle'))
      }
    } catch {}
    resetApprove()
    resetSupply()
    resetEnterMarket()
  }

  // Get current loading state based on step
  const isLoading = (
    step === 'checking-allowance' ||
    step === 'approving' ||
    step === 'supplying' ||
    step === 'entering-market' ||
    (!isBiconomyCrossChain && (
      isApprovePending ||
      isSupplyPending ||
      isEnterMarketPending ||
      isApprovalConfirming ||
      isSupplyConfirming ||
      isEnterMarketConfirming
    ))
  )

  // Enhanced status message with Biconomy phases
  useEffect(() => {
    const handler = (ev: any) => {
      const d = ev?.detail || {}
      const phase = d.phase as string
      const operation = d.meta?.operation as string
      if (!phase) return
      // Only react when cross-chain path is active
      if (!isBiconomyCrossChain) return
      // Only process events for supply operations
      if (operation && operation !== 'supply') return
      
      // Check if this transaction was dismissed by user before updating UI
      const currentHash = supplyHash || biconomySuperTxHashRef.current
      if (currentHash && isTransactionDismissed(currentHash)) {
        // Transaction was dismissed, don't update UI state
        return
      }
      
      let mappedStep = 'quoting'
      let mappedMessage = 'Preparing cross-chain route...'
      
      try {
        switch (phase) {
          case 'compose-start':
            mappedStep = 'quoting'
            mappedMessage = 'Preparing cross-chain route...'
            setStatusHint(mappedMessage)
            break
          case 'compose-ok':
            mappedStep = 'quoting'
            mappedMessage = 'Route prepared. Calculating funding & fees...'
            setStatusHint(mappedMessage)
            break
          case 'quote-start':
            mappedStep = 'quoting'
            mappedMessage = 'Quoting fees and funding method...'
            setStatusHint(mappedMessage)
            break
          case 'quote-ok':
            const txHashForFee = supplyHash || biconomySuperTxHashRef.current
            mappedStep = 'signing'
            mappedMessage = 'Quote received. Requesting signatures...'
            setStatusHint(mappedMessage)
            // Capture fee details immediately when quote is received
            const feeFromQuote = d?.meta?.fee
            const feeDetailsFromQuote = d?.meta?.feeDetails
            if (feeFromQuote) setBiconomyFee(feeFromQuote)
            if (feeDetailsFromQuote) setBiconomyFeeDetails(feeDetailsFromQuote)
            
            // Validate amount + fee doesn't exceed wallet balance (if on spoke chain and fee token matches)
            if (!isHubChain(chainId) && walletBalance.rawBalance && feeDetailsFromQuote?.paymentTokenWeiAmount) {
              const feeTokenMatchesSource = feeDetailsFromQuote?.paymentToken?.toLowerCase() === sourceTokenForBiconomy?.toLowerCase()
              if (feeTokenMatchesSource && parsedAmount > BigInt(0)) {
                try {
                  const walletBalanceWei = walletBalance.rawBalance as bigint
                  const feeWei = BigInt(feeDetailsFromQuote.paymentTokenWeiAmount)
                  const totalRequired = parsedAmount + feeWei
                  
                  if (totalRequired > walletBalanceWei) {
                    const shortfall = totalRequired - walletBalanceWei
                    const shortfallFormatted = formatUnits(shortfall, effectiveAmountDecimals)
                    const totalFormatted = formatUnits(totalRequired, effectiveAmountDecimals)
                    const balanceFormatted = formatUnits(walletBalanceWei, effectiveAmountDecimals)
                    const feeFormatted = formatUnits(feeWei, effectiveAmountDecimals)
                    const amountFormatted = formatUnits(parsedAmount, effectiveAmountDecimals)
                    
                    const errorMsg = `Insufficient balance for supply + fee. ` +
                      `Required: ${totalFormatted} ${assetSymbolUpper} ` +
                      `(amount: ${amountFormatted} + fee: ${feeFormatted}), ` +
                      `but you only have ${balanceFormatted} ${assetSymbolUpper}. ` +
                      `Please reduce the amount by at least ${shortfallFormatted} ${assetSymbolUpper}.`
                    
                    setError(errorMsg)
                    setStep('error')
                    emitUpdate('error', errorMsg)
                    // Emit tx-update event to ensure dialog opens with error + fee
                    try {
                      window.dispatchEvent(new CustomEvent('peridot:tx-update', {
                        detail: {
                          action: 'supply',
                          step: 'error',
                          statusMessage: errorMsg,
                          isCrossChain: true,
                          txHash: txHashForFee || undefined,
                          trackingUrl: biconomyTrackingUrl,
                          biconomyFee: feeFromQuote || biconomyFee,
                          biconomyFeeDetails: feeDetailsFromQuote || biconomyFeeDetails,
                          meeScanLink: biconomyMeeLink,
                          crossChainStatus: crossChainStatus
                        }
                      }))
                    } catch {}
                    console.error('[SupplyHook] Balance + fee validation failed after quote', {
                      amount: amountFormatted,
                      fee: feeFormatted,
                      total: totalFormatted,
                      balance: balanceFormatted,
                      shortfall: shortfallFormatted,
                    })
                    return // Don't proceed with signing
                  }
                } catch (err: any) {
                  console.warn('[SupplyHook] Failed to validate balance + fee after quote', err)
                }
              }
            }
            // Emit event immediately with fee details so dialog can display it
            // Note: txHash might not exist yet at quote-ok phase, but we still want to show the fee
            const shouldEmit = !txHashForFee || (txHashForFee && !isTransactionDismissed(txHashForFee))
            if (shouldEmit) {
              try {
                window.dispatchEvent(new CustomEvent('peridot:tx-update', {
                  detail: {
                    action: 'supply',
                    step: mappedStep,
                    statusMessage: mappedMessage,
                    isCrossChain: true,
                    txHash: txHashForFee || undefined,
                    trackingUrl: biconomyTrackingUrl,
                    biconomyFee: feeFromQuote || biconomyFee,
                    biconomyFeeDetails: feeDetailsFromQuote || biconomyFeeDetails,
                    meeScanLink: biconomyMeeLink,
                    crossChainStatus: crossChainStatus
                  }
                }))
              } catch {}
            }
            break
          case 'sign-start':
            mappedStep = 'signing'
            mappedMessage = 'Signing required payloads...'
            setStatusHint(mappedMessage)
            break
          case 'execute-start':
            mappedStep = 'submitting'
            mappedMessage = 'Submitting supertransaction...'
            setStatusHint(mappedMessage)
            // Move UI to bridge phase immediately after signing/submission
            try {
              setStep('success')
              lastCrossChainStatusRef.current = 'pending'
              setCrossChainStatus('pending')
            } catch {}
            break
          case 'execute-ok':
            mappedStep = 'success'
            mappedMessage = 'Submitted. Bridge in progress...'
            setStatusHint(mappedMessage)
            // Keep pending until status API confirms terminal state
            try {
              lastCrossChainStatusRef.current = 'pending'
              setCrossChainStatus('pending')
            } catch {}
            break
        }
      } catch {}
      
      // Emit standard tx-update event for unified dialog system
      // Check if this transaction was dismissed by user before emitting events
      const txHash = supplyHash || biconomySuperTxHashRef.current
      if (txHash && isTransactionDismissed(txHash)) {
        // Transaction was dismissed, don't emit events
        return
      }
      
      try {
        window.dispatchEvent(new CustomEvent('peridot:tx-update', {
          detail: {
            action: 'supply',
            step: mappedStep,
            statusMessage: mappedMessage,
            isCrossChain: true,
            txHash: txHash,
            trackingUrl: biconomyTrackingUrl,
            biconomyFee: biconomyFee,
            biconomyFeeDetails: biconomyFeeDetails,
            meeScanLink: biconomyMeeLink,
            crossChainStatus: lastCrossChainStatusRef.current || crossChainStatus
          }
        }))
      } catch {}
    }
    try { window.addEventListener('peridot:biconomy-phase', handler as any) } catch {}
    const detach = attachScopedRetryListeners('supply', () => {
      try {
        if (step === 'approving') {
          executeApproval()
        } else if (step === 'approved' || step === 'supplying') {
          executeSupplyMint()
        } else if (step === 'error' || step === 'idle') {
          const amt = parseFloat(amount || '')
          if (!amount || !Number.isFinite(amt) || amt <= 0) {
            const friendly = lastAmountRef.current && parseFloat(lastAmountRef.current) > 0
              ? 'Please re-enter the amount (e.g., previous value) and press Retry.'
              : 'Please enter an amount to retry the supply.'
            emitUpdate('error', friendly)
          } else {
            executeSupply()
          }
        }
      } catch {}
    }, () => {
      try {
        if (isBiconomyCrossChain && biconomySuperTxHashRef.current) {
          checkResumedStatus()?.catch(()=>{})
        }
      } catch {}
    })
    return () => {
      try { window.removeEventListener('peridot:biconomy-phase', handler as any) } catch {}
      try { detach?.() } catch {}
    }
  }, [isBiconomyCrossChain, step, amount, executeSupplyMint, chainId, walletBalance.rawBalance, sourceTokenForBiconomy, parsedAmount, effectiveAmountDecimals, assetSymbolUpper])

  const [statusHint, setStatusHint] = useState<string>('')

  // Get status message
  const getStatusMessage = () => {
    if (isBiconomyCrossChain && statusHint) return statusHint
    switch (step) {
      case 'checking-allowance':
        return 'Checking allowance...'
      case 'approving':
        return isApprovePending ? 'Please confirm approval in wallet...' : 'Approving tokens...'
      case 'approved':
        return 'Approval confirmed! Preparing supply...'
      case 'estimating-gas':
        return 'Estimating cross-chain gas...'
      case 'supplying':
        return isSupplyPending ? 'Please confirm supply in wallet...' : 'Supplying tokens...'
      case 'entering-market':
        return isEnterMarketPending ? 'Please confirm collateral setup in wallet...' : 'Enabling as collateral...'
      case 'success':
        return ''
      case 'error':
        return 'Transaction failed'
      default:
        return ''
    }
  }

  // Manual supply trigger (in case automatic transition fails)
  const manualSupplyTrigger = useCallback(() => {
    if (step === 'approved' && !hasExecutedSupply.current && address && contractAddresses) {
      hasExecutedSupply.current = true
      setStep('supplying')
      executeSupplyMint()
    }
  }, [step, address, contractAddresses, executeSupplyMint])

  // Minimal retry for cross-chain (Biconomy) destination leg failures
  // Recompose and resubmit the supertransaction with current inputs
  const retryCrossChain = useCallback(async () => {
    if (!isBiconomyCrossChain) return
    try {
      setError(null)
      setStep('supplying')
      await executeSupplyMint()
    } catch (e: any) {
      setError(String(e?.message || e))
      setStep('error')
    }
  }, [isBiconomyCrossChain, executeSupplyMint])

  // Check status for a resumed cross-chain transaction (if any)
  const checkResumedStatus = useCallback(async () => {
    const rec = loadCrossChainRecord()
    const hash = (rec && rec.superTxHash) || biconomySuperTxHashRef.current
    if (!hash) return { status: 'unknown' as const }
    const { status, explorerLinks, bscTxHash } = await checkBiconomyStatus(hash)
    const effectiveStatus = status === 'unknown' ? 'pending' : status
    if (status === 'executed' || status === 'failed' || (status as any) === 'refunded') {
      // Terminal → clear stored record
      clearCrossChainRecord()
    }
    if (explorerLinks && explorerLinks.length) setBiconomyExplorerLinks(explorerLinks)
    if (bscTxHash && bscTxHash !== (biconomyBscTxHash as any)) setBiconomyBscTxHash(bscTxHash)
    setCrossChainStatus(effectiveStatus as any)
    lastCrossChainStatusRef.current = effectiveStatus as any
    return { status: effectiveStatus as any }
  }, [checkBiconomyStatus, biconomyBscTxHash])

  // On mount: if there is a stored cross-chain record, expose it for UI and set pending state
  useEffect(() => {
    if (!isBiconomyCrossChain || !address) return
    const rec = loadCrossChainRecord()
    if (rec && rec.superTxHash) {
      // Discard stale records (> 10 min) — consistent with EasyModeTxStatus resume window.
      // Without this check the hook would set supplyHash to an old Biconomy superTxHash
      // that wagmi can never resolve on-chain, keeping isSupplyConfirming=true forever.
      if (rec.savedAt && Date.now() - rec.savedAt > 10 * 60 * 1000) {
        clearCrossChainRecord()
        return
      }
      // Check if this transaction was dismissed by user
      if (isTransactionDismissed(rec.superTxHash)) {
        return
      }
      
      biconomySuperTxHashRef.current = rec.superTxHash
      setBiconomySuperTxHashState(rec.superTxHash)
      setSupplyHash(rec.superTxHash as any)
      // Present as pending until user checks status
      setCrossChainStatus('pending')
      lastCrossChainStatusRef.current = 'pending'
      checkResumedStatus().catch(() => {})
    }
  }, [isBiconomyCrossChain, address, checkResumedStatus])

  // Retry function for transient errors
  const retryTransaction = useCallback(async () => {
    if (!lastError || !isRetryableError(lastError)) return
    
    const maxRetries = 3
    if (retryCount >= maxRetries) {
      setError('Maximum retry attempts reached. Please try again later.')
      return
    }
    
    const delay = getRetryDelay(lastError, retryCount)
    setRetryCount(prev => prev + 1)
    setError(null)
    setStep('idle')
    
    // Wait for the calculated delay
    await new Promise(resolve => setTimeout(resolve, delay))
    
    // Retry the transaction
    try {
      await executeSupply()
    } catch (err) {
      console.error('Retry failed:', err)
      setError('Retry failed. Please try again manually.')
      setStep('error')
    }
  }, [lastError, retryCount, executeSupply])

  // Emit events when cross-chain status changes
  useEffect(() => {
    // Don't emit when step is idle — transaction lifecycle is over; this prevents spurious overlay
    // updates firing on unrelated user actions (e.g. clicking borrow after a completed supply).
    if (isBiconomyCrossChain && crossChainStatus && crossChainStatus !== 'idle' && step && step !== 'idle') {
      // Check if this transaction was dismissed by user before emitting events
      const txHashForStatus = supplyHash || biconomySuperTxHashRef.current
      if (txHashForStatus && isTransactionDismissed(txHashForStatus)) {
        // Transaction was dismissed, don't emit events
        return
      }
      emitUpdate(step || 'success', statusHint || 'Cross-chain transaction in progress', supplyHash)
    }
  }, [crossChainStatus, isBiconomyCrossChain, step, statusHint, supplyHash, emitUpdate])

  return {
    executeSupply,
    manualSupplyTrigger,
    retryCrossChain,
    retryTransaction,
    checkResumedStatus,
    clearResumedCrossChain: clearCrossChainRecord,
    step,
    error,
    isLoading,
    needsApproval,
    canSupply,
    reset,
    contractAddresses,
    statusMessage: getStatusMessage(),
    approveHash,
    supplyHash,
    crossChainStatus,
    crossChainLastPoll,
    axelarGasPaymentWei: (estimatedAxelarGasWei ?? AXELAR_STATIC_GAS_PAYMENT_WEI),
    biconomyTrackingUrl,
    biconomyExplorerLinks,
    biconomyBscTxHash,
    biconomyFee,
    biconomyFeeDetails,
    biconomyMeeLink,
    hasResumableCrossChain: Boolean(biconomySuperTxHashRef.current),
    isRetryable: lastError ? isRetryableError(lastError) : false,
    retryCount,
  }
}

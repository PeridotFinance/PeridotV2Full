import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useAccount, useWriteContract, useReadContract, useReadContracts, useWaitForTransactionReceipt, useSwitchChain, useBalance } from 'wagmi'
import { parseUnits, Address, formatUnits, erc20Abi, encodeFunctionData } from 'viem'
import { getAssetContractAddresses, getMarketsForChain } from '@/data/market-data'
import { getChainConfig, CHAIN_IDS, resolveHubReadChainId, isHubChain } from '@/config/contracts'
import { useBorrowingPower } from './use-borrowing-power'
import { useAllMarketMemberships } from './use-market-membership'
import combinedAbi from '@/app/abis/combinedAbi.json'
import { autoVerifyTransaction } from '@/lib/auto-leaderboard-verifier'
import { FEATURE_FLAGS } from '@/config/featureFlags'
import { biconomyAdapter } from '@/lib/biconomyAdapter'
import { TOKENS as BICONOMY_TOKENS, BSC_UNDERLYING_TOKENS } from '@/biconomy/constants'
import { useSmartAccountUpgrade } from '@/components/providers/SmartAccountUpgradeProvider'
import type { ExecutionMode } from '@/biconomy/constants'
import { useAccountType } from '@/hooks/use-account-type'
import { useSmartAccountStatus } from '@/hooks/use-smart-account-status'
import { toast } from 'sonner'
import { formatTokenAmountFromWei, getRequiredWeiFromPayload, parseFeeBudgetErrorPayload } from '@/lib/crossChainFees'
import { emitTxUpdate, attachScopedRetryListeners, mapFriendlyError, isRateLimit, isArithmeticUnderOverflow, isTimeoutError } from '@/lib/txFeedback'
import { isTransactionDismissed } from '@/lib/dismissedTransactionTracker'
import { useActiveWallet } from '@/hooks/use-active-wallet'
import { useSmartExecution } from '@/hooks/use-smart-execution'
import { usePrivy, useSendTransaction } from '@privy-io/react-auth'

interface UseBorrowTransactionProps {
  assetId: string
  amount: string
  destinationChainId?: number
  feeMode?: 'biconomy' | 'native'
  biconomySponsorship?: boolean
  onSuccess?: () => void
  onError?: (error: Error) => void
}

type TransactionStep = 'idle' | 'checking-liquidity' | 'borrowing' | 'success' | 'error'

const BORROW_FEE_TOKEN_PRIORITY: Array<{ symbol: string; address: Address }> = [
  { symbol: 'USDC', address: BSC_UNDERLYING_TOKENS.USDC },
  { symbol: 'USDT', address: BSC_UNDERLYING_TOKENS.USDT },
  { symbol: 'WBNB', address: BSC_UNDERLYING_TOKENS.WBNB },
  { symbol: 'WETH', address: BSC_UNDERLYING_TOKENS.WETH },
  { symbol: 'AUSD', address: BSC_UNDERLYING_TOKENS.AUSD },
]

type BorrowFeeTokenOption = {
  symbol: string
  address: Address
  chainId: number
  hasBalance: boolean
  balanceWei?: bigint
  formattedBalance?: string
}

export function useBorrowTransaction({
  assetId,
  amount,
  destinationChainId,
  feeMode = 'biconomy',
  biconomySponsorship = true,
  onSuccess,
  onError,
}: UseBorrowTransactionProps) {
  const { getAccessToken } = usePrivy()
  const { chainId } = useAccount()
  const { address, signerAddress, isSmartAccountActive } = useActiveWallet()
  const { execute: executeSmartTx } = useSmartExecution()
  const { meeAuthorization } = useSmartAccountUpgrade()
  const { accountType } = useAccountType()
  const { smartAccountAddress: detectedSmartAccountAddress } = useSmartAccountStatus()
  const { switchChainAsync } = useSwitchChain()

  // Privy gasless: used when the user has no BNB on BSC (sponsor: true pays from $10 gas credits)
  const { sendTransaction: privySendTransaction } = useSendTransaction()
  // Read native BNB balance on the current hub chain (only needed for direct borrow path)
  const { data: bnbBalanceOnBsc } = useBalance({
    address,
    chainId: chainId ?? CHAIN_IDS.BSC_MAINNET,
    query: { enabled: !!address && !!chainId },
  })

  const [step, setStep] = useState<TransactionStep>('idle')
  const [error, setError] = useState<string | null>(null)
  const [borrowHash, setBorrowHash] = useState<`0x${string}` | undefined>()
  const [crossChainStatus, setCrossChainStatus] = useState<'idle' | 'pending' | 'executed' | 'failed' | 'refunded' | 'unknown'>('idle')
  const lastCrossChainStatusRef = useRef<'idle' | 'pending' | 'executed' | 'failed' | 'refunded' | 'unknown'>('idle')
  const [biconomyTrackingUrl, setBiconomyTrackingUrl] = useState<string | undefined>(undefined)
  const [biconomyExplorerLinks, setBiconomyExplorerLinks] = useState<string[] | undefined>(undefined)
  const [biconomyBscTxHash, setBiconomyBscTxHash] = useState<`0x${string}` | undefined>(undefined)
  const [biconomyFee, setBiconomyFee] = useState<any | undefined>(undefined)
  const [biconomyFeeDetails, setBiconomyFeeDetails] = useState<any | undefined>(undefined)
  const [biconomyMeeLink, setBiconomyMeeLink] = useState<string | undefined>(undefined)
  const [biconomyExpectedNet, setBiconomyExpectedNet] = useState<string | undefined>(undefined)
  const [biconomyFundingMode, setBiconomyFundingMode] = useState<'sponsored' | 'fallback' | undefined>(undefined)
  const biconomySuperTxHashRef = useRef<string | undefined>(undefined)
  const crossChainPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollingHashRef = useRef<string | null>(null)
  const isPollingRef = useRef(false)
  const verificationSentRef = useRef<boolean>(false)
  const [statusHint, setStatusHint] = useState<string>('')
  const emitUpdate = useCallback((nextStep: string, message?: string, hash?: string) => {
    emitTxUpdate({ action: 'borrow', step: nextStep, statusMessage: message, txHash: hash })
  }, [])

  const normalizedMeeAuthorization = useMemo(() => {
    if (!meeAuthorization) return undefined
    if (Array.isArray(meeAuthorization)) {
      const filtered = meeAuthorization.filter(Boolean)
      return filtered.length ? filtered : undefined
    }
    return [meeAuthorization]
  }, [meeAuthorization])

  const executionMode: ExecutionMode = useMemo(() => {
    if (accountType === 'SMART_ACCOUNT') return 'smart-account'
    if (accountType === 'EOA_7702' && normalizedMeeAuthorization?.length) return 'eoa-7702'
    return 'eoa'
  }, [accountType, normalizedMeeAuthorization])

  const biconomySmartAccountAddress = useMemo(() => {
    if (accountType !== 'SMART_ACCOUNT') return undefined
    if (!detectedSmartAccountAddress) return undefined
    return detectedSmartAccountAddress as Address
  }, [accountType, detectedSmartAccountAddress])

  const feeTokenContracts = useMemo(() => {
    if (!address) return []
    return BORROW_FEE_TOKEN_PRIORITY.map((token) => ({
      address: token.address,
      abi: erc20Abi,
      functionName: 'balanceOf' as const,
      args: [address as Address],
      chainId: CHAIN_IDS.BSC_MAINNET,
    }))
  }, [address])

  const {
    data: feeTokenBalanceData,
    isLoading: isFeeTokenBalanceLoading,
    refetch: refetchFeeTokenBalances,
  } = useReadContracts({
    contracts: feeTokenContracts as any,
    query: {
      enabled: feeTokenContracts.length > 0 && FEATURE_FLAGS.CROSS_CHAIN_BORROW_BICONOMY,
      refetchInterval: 45000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  } as any)

  const feeTokenOptions = useMemo<BorrowFeeTokenOption[]>(() => {
    return BORROW_FEE_TOKEN_PRIORITY.map((token, idx) => {
      const record = feeTokenBalanceData?.[idx]
      const hasResult = record && record.status === 'success'
      const balanceWei = hasResult ? (record.result as bigint) : undefined
      const formattedBalance = balanceWei != null ? formatUnits(balanceWei, 18) : undefined
      return {
        symbol: token.symbol,
        address: token.address,
        chainId: CHAIN_IDS.BSC_MAINNET,
        hasBalance: Boolean(balanceWei && balanceWei > BigInt(0)),
        balanceWei,
        formattedBalance,
      }
    })
  }, [feeTokenBalanceData])

  const [selectedFeeTokenAddress, setSelectedFeeTokenAddress] = useState<Address | null>(null)

  const selectedFeeToken = useMemo(() => {
    if (!selectedFeeTokenAddress) return null
    const lower = selectedFeeTokenAddress.toLowerCase()
    return feeTokenOptions.find((option) => option.address.toLowerCase() === lower) || null
  }, [feeTokenOptions, selectedFeeTokenAddress])

  const selectFeeToken = useCallback((tokenAddress: Address | null) => {
    if (tokenAddress == null) {
      setSelectedFeeTokenAddress(null)
      return
    }
    const lower = tokenAddress.toLowerCase()
    const exists = feeTokenOptions.some((option) => option.address.toLowerCase() === lower)
    if (exists) {
      setSelectedFeeTokenAddress(tokenAddress)
    }
  }, [feeTokenOptions])

  const onSuccessRef = useRef(onSuccess);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
  }, [onSuccess]);

  const onErrorRef = useRef(onError);
  useEffect(() => {
      onErrorRef.current = onError;
  }, [onError]);

  // Resolve hub chain for reads (borrow capacity, decimals) while preserving same-chain writes
  const effectiveChainId = useMemo(() => resolveHubReadChainId(chainId ?? null) ?? chainId ?? null, [chainId]) as number | null

  // Get contract addresses for the asset on current chain (writes) and effective chain (reads)
  const contractAddresses = chainId ? getAssetContractAddresses(assetId, chainId) : null
  const effectiveAddresses = effectiveChainId ? getAssetContractAddresses(assetId, effectiveChainId) : null
  
  // Get chain config to access controller address
  const chainConfig = chainId ? getChainConfig(chainId) : null
  const controllerAddress = chainConfig && 'unitrollerProxy' in chainConfig ? chainConfig.unitrollerProxy : null

  // Get borrowing power information
  const { borrowingPower, isBorrowAmountSafe, getMaxBorrowAmount, accountLiquidity, refetch: refetchBorrowingPower } = useBorrowingPower()
  const { assetsIn: collateralAssetAddresses } = useAllMarketMemberships()

  // Get asset information for validation
  const allAssets = effectiveChainId ? getMarketsForChain(effectiveChainId) : []
  const currentAsset = allAssets.find(a => a.id === assetId)

  // Read underlying token decimals
  const { data: underlyingDecimals } = useReadContract({
    address: (effectiveAddresses?.underlyingAddress ?? contractAddresses?.underlyingAddress) as `0x${string}`,
    abi: combinedAbi,
    functionName: 'decimals',
    args: [],
    query: {
      enabled: !!(effectiveAddresses?.underlyingAddress ?? contractAddresses?.underlyingAddress),
    },
    chainId: effectiveChainId as any,
  })

  const resolvedDestinationChainId = useMemo(() => {
    if (typeof destinationChainId === 'number') return destinationChainId
    if (typeof chainId === 'number') return chainId
    return CHAIN_IDS.BSC_MAINNET
  }, [destinationChainId, chainId])

  // Check if we have valid contract addresses
  const canBorrowLocal = Boolean(contractAddresses && contractAddresses.pTokenAddress)
  const useBiconomy = Boolean(feeMode === 'biconomy' && FEATURE_FLAGS.CROSS_CHAIN_BORROW_BICONOMY)

  useEffect(() => {
    if (!FEATURE_FLAGS.CROSS_CHAIN_BORROW_BICONOMY) return
    if (!useBiconomy) return
    if (executionMode !== 'eoa') {
      if (selectedFeeTokenAddress !== null) {
        setSelectedFeeTokenAddress(null)
      }
      return
    }
    if (selectedFeeTokenAddress) {
      const match = feeTokenOptions.find((option) => option.address.toLowerCase() === selectedFeeTokenAddress.toLowerCase())
      if (!match && feeTokenOptions.length) {
        setSelectedFeeTokenAddress(feeTokenOptions[0].address)
      }
      return
    }
    const fallback = feeTokenOptions.find((option) => option.hasBalance) || feeTokenOptions[0]
    if (fallback) {
      setSelectedFeeTokenAddress(fallback.address)
    }
  }, [executionMode, feeTokenOptions, selectedFeeTokenAddress, useBiconomy])

  useEffect(() => {
    if (!useBiconomy && selectedFeeTokenAddress !== null) {
      setSelectedFeeTokenAddress(null)
    }
  }, [useBiconomy, selectedFeeTokenAddress])

  const mapChainIdToBiconomyKey = (cid?: number | null): keyof typeof BICONOMY_TOKENS | undefined => {
    switch (cid) {
      case 1: return 'mainnet'
      case 10: return 'optimism'
      case 137: return 'polygon'
      case 42161: return 'arbitrum'
      case 8453: return 'base'
      case 43114: return 'avalanche'
      default: return undefined
    }
  }

  const assetSymbolUpper = (currentAsset?.symbol || '').toUpperCase()
  const biconomyDestKey = mapChainIdToBiconomyKey(resolvedDestinationChainId)
  const targetTokenForBiconomy = biconomyDestKey ? (BICONOMY_TOKENS as any)[biconomyDestKey]?.[assetSymbolUpper] as Address | undefined : undefined
  const bscConfig = getChainConfig(CHAIN_IDS.BSC_MAINNET) as any
  const pTokenOnBsc = (assetSymbolUpper && bscConfig?.markets?.[assetSymbolUpper]?.pToken) as Address | undefined
  const collateralMarkets = useMemo(() => {
    const normalized = new Set<string>()
    if (Array.isArray(collateralAssetAddresses)) {
      collateralAssetAddresses.forEach((addr) => {
        if (typeof addr === 'string' && addr.startsWith('0x') && addr.length === 42) {
          normalized.add(addr.toLowerCase())
        }
      })
    }
    if (pTokenOnBsc) {
      normalized.add(pTokenOnBsc.toLowerCase())
    }
    return Array.from(normalized).map((addr) => addr as Address)
  }, [collateralAssetAddresses, pTokenOnBsc])
  const canBorrowViaBiconomy = Boolean(
    useBiconomy &&
    pTokenOnBsc &&
    (resolvedDestinationChainId === CHAIN_IDS.BSC_MAINNET || !!targetTokenForBiconomy)
  )

  const canBorrow = Boolean(useBiconomy ? canBorrowViaBiconomy : canBorrowLocal)

  const resolveFriendlyBorrowError = useCallback((rawMessage?: string | null) => {
    if (!rawMessage) return null
    const lower = rawMessage.toLowerCase()
    const symbol = currentAsset?.symbol || assetId.toUpperCase()

    if (lower.includes('borrow is paused') || lower.includes('borrowing is paused')) {
      return `${symbol} borrowing is temporarily paused by the protocol. Try another asset or check back soon.`
    }

    return null
  }, [currentAsset?.symbol, assetId])

  const applyFriendlyBorrowError = useCallback((rawMessage?: string | null): boolean => {
    const friendly = resolveFriendlyBorrowError(rawMessage)
    if (!friendly) return false
    setError(friendly)
    setStatusHint('')
    setStep('error')
    emitTxUpdate({ action: 'borrow', step: 'error', statusMessage: friendly })
    return true
  }, [resolveFriendlyBorrowError, setError, setStatusHint, setStep])

  // Clean and parse amount to proper units
  const cleanAmount = (rawAmount: string): string => {
    if (!rawAmount) return '0'
    // Remove commas and any other formatting characters, keep only numbers and decimal point
    return rawAmount.replace(/[^0-9.]/g, '')
  }
  
  const parsedAmount = amount ? parseUnits(cleanAmount(amount), (underlyingDecimals as number) || 18) : BigInt(0)
  const numericAmount = parseFloat(cleanAmount(amount)) || 0

  // Write contract hook for borrow
  const { 
    writeContract: writeBorrow,
    isPending: isBorrowPending,
    data: borrowData,
    error: borrowError,
    reset: resetBorrow,
  } = useWriteContract()

  // Set hash when transaction is submitted
  useEffect(() => {
    if (borrowData) {
      setBorrowHash(borrowData)
      emitUpdate('borrowing', 'Borrow submitted...', borrowData)
    }
  }, [borrowData])

  // Wait for transaction receipt
  const { 
    isLoading: isBorrowConfirming, 
    isSuccess: isBorrowSuccess,
    error: borrowReceiptError 
  } = useWaitForTransactionReceipt({
    hash: borrowHash,
  })

  const checkBiconomyStatus = useCallback(async (superHash: string): Promise<{ status: 'pending' | 'executed' | 'failed' | 'unknown'; explorerLinks?: string[]; bscTxHash?: `0x${string}` }> => {
    try {
      const result = await biconomyAdapter.getStatus({ superTxHash: superHash })
      return { status: result.status, explorerLinks: result.explorerLinks, bscTxHash: result.bscTxHash }
    } catch (e) {
      console.warn('Failed to check Biconomy status (borrow):', e)
      return { status: 'unknown' }
    }
  }, [])

  const ENABLE_BICONOMY_STATUS_POLL = false
  useEffect(() => {
    if (!ENABLE_BICONOMY_STATUS_POLL) return
    if (!useBiconomy || !biconomySuperTxHashRef.current) return
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

    const poll = async () => {
      if (isPollingRef.current) return
      isPollingRef.current = true
      const { status, explorerLinks, bscTxHash } = await checkBiconomyStatus(biconomySuperTxHashRef.current!)
      if (cancelled) return
      if (status !== lastCrossChainStatusRef.current) {
        setCrossChainStatus(status as any)
        lastCrossChainStatusRef.current = status
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
      isPollingRef.current = false
      if (status === 'executed' || status === 'failed') {
        if (crossChainPollRef.current != null) clearInterval(crossChainPollRef.current)
        crossChainPollRef.current = null
        pollingHashRef.current = null
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
  }, [ENABLE_BICONOMY_STATUS_POLL, useBiconomy, checkBiconomyStatus, biconomyExplorerLinks, biconomyBscTxHash])

  // Handle borrow success
  useEffect(() => {
    if (isBorrowSuccess) {
      setStep('success')
      emitUpdate('success', '')
      onSuccessRef.current?.()

      try {
        // Notify snapshotters to refresh/save latest balances
        window.dispatchEvent(new CustomEvent('peridot:tx-success', {
          detail: {
            type: 'borrow',
            address,
            chainId,
            assetId,
            txHash: borrowHash,
            observed_at: new Date().toISOString(),
            tokenSymbol: currentAsset?.symbol || assetId?.toUpperCase?.(),
          }
        }))
      } catch {}

      if (borrowHash && address && chainId) {
        // Use Privy token for secure pre-verification
        getAccessToken().then(token => {
          fetch('/api/leaderboard/pre-verify', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            },
            body: JSON.stringify({
              txHash: borrowHash,
              walletAddress: address,
              chainId,
              actionType: 'borrow',
              amount: cleanAmount(amount),
              usdValue: parseFloat(cleanAmount(amount)) * (currentAsset?.price || 0),
              tokenSymbol: currentAsset?.symbol || assetId.toUpperCase(),
            }),
          })
          .then(async response => {
            const result = await response.json()
            if (response.ok && result.success) {
              // Kick off strict verification
              try {
                autoVerifyTransaction({
                  txHash: borrowHash,
                  walletAddress: address,
                  chainId,
                  actionType: 'borrow',
                  privyToken: token,
                }).catch(() => {})
              } catch {}
              
              // Show points toast
              const points = result.transaction?.estimated_points || 0
              if (points > 0) {
                toast.success(`You earned +${points} XP!`, {
                  description: 'Points will be verified shortly.',
                  duration: 5000,
                  icon: '🎉'
                })
              }
            }
          })
          .catch(e => console.error('Pre-verify error:', e))
        })
      }
    }
  }, [isBorrowSuccess, borrowHash, address, chainId])

  // Handle errors
  useEffect(() => {
    const combinedError = borrowError || borrowReceiptError
    if (combinedError) {
      const errorObject = combinedError instanceof Error ? combinedError : new Error(String(combinedError))
      console.error("A borrow error occurred:", errorObject)
      
      const msgLower = errorObject.message.toLowerCase()
      if (msgLower.includes('user rejected') || msgLower.includes('user denied') || msgLower.includes('rejected by user')) {
        const friendly = 'Borrow transaction rejected. Please try again.'
        setError(friendly)
        setStep('idle') // Instantly reset to idle to drop 'Processing...' state
        emitUpdate('error', friendly)
        reset() // Reset state if user rejects
      } else {
        // Suppress modal for transient cases; keep dialog steady and surface friendly guidance
        if (isRateLimit(errorObject.message) || isArithmeticUnderOverflow(errorObject.message) || isTimeoutError(errorObject.message)) {
          const friendly = mapFriendlyError(errorObject.message) || 'Temporary issue detected. Please wait and retry.'
          setError(friendly)
          // Mark error to expose Retry in the dialog; gateway suppresses auto-open for these cases
          setStep('error')
          emitUpdate('error', friendly)
          return
        }
        const handled = applyFriendlyBorrowError(errorObject.message)
        if (!handled) {
          onErrorRef.current?.(errorObject)
          const friendly = mapFriendlyError(errorObject.message) || errorObject.message
          setError(friendly)
          setStep('error')
          emitUpdate('error', friendly)
        } else {
          const friendly = resolveFriendlyBorrowError(errorObject.message) || 'Transaction failed'
          emitUpdate('error', friendly)
        }
      }
    }
  }, [borrowError, borrowReceiptError, applyFriendlyBorrowError])

  // Execute borrow transaction
  const executeBorrow = async () => {
    try {
      try { if (typeof window !== 'undefined') (window as any).dispatchEvent(new CustomEvent('peridot:tx-active')) } catch {}
      setError(null)

      setStep('checking-liquidity')
      emitUpdate('checking-liquidity', 'Checking borrowing capacity...')

      if (!canBorrow) {
        throw new Error('Smart contracts for this asset are not available on this network')
      }

      if (!address) {
        throw new Error('Please connect your wallet first')
      }

      if (!amount || parseFloat(amount) <= 0) {
        throw new Error('Please enter a valid amount')
      }

      // For same-chain borrows we need local market address; cross-chain borrows use BSC addresses via adapter
      if (!contractAddresses && !useBiconomy) {
        throw new Error('Contract addresses not found')
      }

      // Use existing borrowing power data for immediate validation

      // Enhanced validation using borrowing power calculations
      console.log('Borrow validation - borrowingPower:', borrowingPower)
      console.log('Borrow validation - availableBorrowingPowerUSD:', borrowingPower.availableBorrowingPowerUSD)
      console.log('Borrow validation - accountLiquidity:', accountLiquidity)
      
      // Also check the raw account liquidity as backup validation
      let hasLiquidity = false
      if (accountLiquidity) {
        const [error, liquidity, shortfall] = accountLiquidity as [bigint, bigint, bigint]
        if (error === BigInt(0) && liquidity > BigInt(0)) {
          hasLiquidity = true
          const liquidityUSD = parseFloat(formatUnits(liquidity, 18))
          console.log('Raw account liquidity USD:', liquidityUSD)
        }
      }
      
      if (borrowingPower.availableBorrowingPowerUSD <= 0 && !hasLiquidity) {
        if (borrowingPower.totalSuppliedUSD > 0) {
          throw new Error('Your supplied assets aren\'t enabled as collateral yet. Enable collateral to start borrowing.')
        }
        throw new Error('No borrowing capacity. Supply assets and enable them as collateral first.')
      }

      // Check if the specific borrow amount is safe using the borrowing power hook
      if (!isBorrowAmountSafe(assetId, numericAmount)) {
        const maxAmount = getMaxBorrowAmount(assetId)
        const symbol = currentAsset?.symbol || assetId.toUpperCase()
        // Distinguish between "pool has no cash" and "not enough borrowing power"
        if (maxAmount <= 0 && borrowingPower.availableBorrowingPowerUSD > 0) {
          throw new Error(
            `Not enough ${symbol} in the lending pool right now. ` +
            `There is insufficient liquidity to fulfill this borrow. Try a smaller amount or check back later.`
          )
        }
        throw new Error(
          `Insufficient borrowing power. You can borrow up to ${maxAmount.toFixed(4)} ${symbol}. ` +
          `Available borrowing power: $${borrowingPower.availableBorrowingPowerUSD.toFixed(2)}`
        )
      }

      // Additional check with existing account liquidity for validation
      if (accountLiquidity) {
        const [error, liquidity, shortfall] = accountLiquidity as [bigint, bigint, bigint]

        if (error !== BigInt(0)) {
          console.warn('Account liquidity returned error code:', error)
        } else if (shortfall > BigInt(0)) {
          const shortfallUsd = parseFloat(formatUnits(shortfall, 18))
          if (shortfallUsd >= Math.max(0.01, borrowingPower.availableBorrowingPowerUSD)) {
            throw new Error('Smart contract indicates insufficient collateral')
          }

          console.warn('Controller reported shortfall but local borrowing power is positive. Proceeding with borrow.', {
            shortfallUsd,
            availableBorrowingPowerUSD: borrowingPower.availableBorrowingPowerUSD,
          })
        }
      }
      
      // If cross-chain borrow supported, reflect phases. Else, same-chain.
      setStep('borrowing')
      emitUpdate('borrowing', isBorrowPending ? 'Please confirm borrow in wallet...' : 'Borrowing tokens...')

      // Privy sponsored path: bypass Biconomy fee requirements entirely.
      // Switch to BSC and sign borrow() directly with Privy gas sponsorship.
      // Threshold is intentionally near-zero so users without BNB can borrow any
      // non-trivial amount; the > 0 floor only filters out 0/dust borrows that
      // would burn a sponsorship credit for no economic activity.
      const PRIVY_SPONSORED_USD_THRESHOLD = 0.01
      const borrowValueUSD = numericAmount * (currentAsset?.oraclePrice || currentAsset?.price || 1)
      const isTestnetPreset = (process.env.NEXT_PUBLIC_NETWORK_PRESET || '').startsWith('testnet')
      const bscChainId = isTestnetPreset ? CHAIN_IDS.BSC_TESTNET : CHAIN_IDS.BSC_MAINNET

      if (
        FEATURE_FLAGS.WALLET_PRIVY_EXPERIMENT &&
        !isSmartAccountActive &&
        borrowValueUSD >= PRIVY_SPONSORED_USD_THRESHOLD
      ) {
        const bscContractAddresses = getAssetContractAddresses(assetId, bscChainId)
        if (!bscContractAddresses?.pTokenAddress) {
          throw new Error(`${currentAsset?.symbol || assetId.toUpperCase()} is not available on BSC.`)
        }

        if (chainId !== bscChainId) {
          const chainName = isTestnetPreset ? 'BSC Testnet' : 'BSC'
          try {
            toast(`Switching to ${chainName} to borrow`, {
              description: 'Your borrow will be signed on BSC with sponsored gas.',
            })
            await switchChainAsync({ chainId: bscChainId })
          } catch {
            const msg = 'Network switch to BSC was declined. Please switch manually and retry.'
            setError(msg)
            setStep('error')
            emitTxUpdate({ action: 'borrow', step: 'error', statusMessage: msg })
            return
          }
        }

        emitUpdate('borrowing', 'Borrowing with sponsored gas...')
        try {
          const { hash } = await privySendTransaction(
            {
              to: bscContractAddresses.pTokenAddress,
              data: encodeFunctionData({
                abi: combinedAbi,
                functionName: 'borrow',
                args: [parsedAmount],
              }),
              chainId: bscChainId,
            },
            { sponsor: true },
          )
          setBorrowHash(hash)
          emitUpdate('borrowing', 'Borrow submitted (Privy sponsored)...', hash)
        } catch (sponsorErr) {
          console.warn('[Borrow] Privy sponsorship failed, falling back to wallet gas:', sponsorErr)
          writeBorrow({
            address: bscContractAddresses.pTokenAddress as Address,
            abi: combinedAbi,
            functionName: 'borrow',
            args: [parsedAmount],
          } as any)
        }
        return
      }

      if (useBiconomy) {
        try {
          if (!pTokenOnBsc) {
            throw new Error('Cross-chain configuration not ready. Please try again.')
          }
          // Determine the appropriate BSC chain based on network preset
          const isTestnetPreset = (process.env.NEXT_PUBLIC_NETWORK_PRESET || '').startsWith('testnet')
          const bscChainId = isTestnetPreset ? CHAIN_IDS.BSC_TESTNET : CHAIN_IDS.BSC_MAINNET
          
          if (resolvedDestinationChainId !== bscChainId && !targetTokenForBiconomy) {
            throw new Error('Destination chain not supported for cross-chain borrow yet.')
          }

          const requiresBscChain = executionMode === 'eoa'
          if (requiresBscChain && chainId !== bscChainId) {
            const chainName = isTestnetPreset ? 'BSC Testnet' : 'BSC Mainnet'
            toast(`Switch to ${chainName} to continue`, {
              description: `Borrowing through Biconomy signs on ${chainName} but delivers to your selected chain.`,
              action: {
                label: 'Switch',
                onClick: async () => {
                  try {
                    await switchChainAsync?.({ chainId: bscChainId })
                  } catch (err) {
                    console.error('Failed to switch chain', err)
                  }
                },
              },
            })
            setStatusHint(`Switch to ${chainName} to authorize this borrow flow.`)
            setStep('error')
            emitTxUpdate({ action: 'borrow', step: 'error', statusMessage: `Switch to ${chainName} to authorize this borrow flow.` })
            return
          }

          setBiconomyTrackingUrl(undefined)
          setBiconomyExplorerLinks(undefined)
          setBiconomyBscTxHash(undefined)
          setBiconomyFee(undefined)
          setBiconomyFeeDetails(undefined)
          setBiconomyMeeLink(undefined)
          setBiconomyExpectedNet(undefined)
          setBiconomyFundingMode(undefined)
          biconomySuperTxHashRef.current = undefined
          verificationSentRef.current = false

          const sponsorshipEnabled = biconomySponsorship !== false

          const feeTokenForBorrow = executionMode === 'eoa'
            ? (selectedFeeToken || feeTokenOptions.find((option) => option.hasBalance) || feeTokenOptions[0] || null)
            : null

          if (executionMode === 'eoa') {
            if (!feeTokenForBorrow) {
              const msg = 'Select a fee token on BSC to cover Fusion fees before borrowing.'
              setError(msg)
              setStatusHint('Pick a fee token to continue.')
              setStep('error')
              emitTxUpdate({ action: 'borrow', step: 'error', statusMessage: msg })
              return
            }
            if (feeTokenForBorrow.balanceWei == null) {
              const msg = 'Checking the selected fee token balance on BSC. Please try again once the balance has loaded.'
              setError(msg)
              setStatusHint('Fetching BSC wallet balance...')
              setStep('error')
              emitTxUpdate({ action: 'borrow', step: 'error', statusMessage: msg })
              return
            }
            if (feeTokenForBorrow.balanceWei <= BigInt(0)) {
              const symbol = feeTokenForBorrow.symbol || 'tokens'
              const msg = `Add some ${symbol} on BSC or switch tokens to cover Fusion fees.`
              setError(msg)
              setStatusHint('Top up a supported fee token on BSC to continue.')
              setStep('error')
              emitTxUpdate({ action: 'borrow', step: 'error', statusMessage: msg })
              return
            }
          }

          const result = await biconomyAdapter.startBorrow({
            userAddress: address as Address,
            smartAccountAddress: biconomySmartAccountAddress,
            destinationChainId: resolvedDestinationChainId,
            pTokenAddress: pTokenOnBsc as Address,
            amountWei: parsedAmount,
            collateralMarkets,
            targetChainId: resolvedDestinationChainId,
            targetTokenAddress: targetTokenForBiconomy,
            slippage: 0.1,
            sponsorship: sponsorshipEnabled,
            initialFundingAmountWei: BigInt(0),
            meeAuthorization: normalizedMeeAuthorization,
            executionMode,
            feeTokenOverride: feeTokenForBorrow ? { address: feeTokenForBorrow.address, chainId: feeTokenForBorrow.chainId } : undefined,
            triggerMaxAmountWei: feeTokenForBorrow?.balanceWei ?? undefined,
          })

          if (result?.superTxHash) {
            setBorrowHash(result.superTxHash as any)
            biconomySuperTxHashRef.current = result.superTxHash
          }
          const resolvedFundingMode: 'sponsored' | 'fallback' = result?.fundingMode ?? (sponsorshipEnabled ? 'sponsored' : 'fallback')
          setBiconomyFundingMode(resolvedFundingMode)
          if (result?.trackingUrl) setBiconomyTrackingUrl(result.trackingUrl)
          if (result?.fee) setBiconomyFee(result.fee)
          if (result?.feeDetails) setBiconomyFeeDetails(result.feeDetails)
          if (result?.meeScanLink) setBiconomyMeeLink(result.meeScanLink)
          if (result?.expectedNetWei !== undefined) {
            try {
              const decimalsFromAsset = currentAsset?.decimals
              const decimalsFromOnChain = (() => {
                if (underlyingDecimals == null) return undefined
                if (typeof underlyingDecimals === 'number') return underlyingDecimals
                try { return Number(underlyingDecimals) } catch { return undefined }
              })()
              const decimals = decimalsFromAsset ?? decimalsFromOnChain ?? 18
              setBiconomyExpectedNet(formatUnits(result.expectedNetWei, decimals))
            } catch {}
          }

          const fundingLabel = resolvedFundingMode === 'sponsored'
            ? 'Submitting sponsored supertransaction...'
            : sponsorshipEnabled
              ? 'Submitting fallback supertransaction...'
              : 'Submitting wallet-funded supertransaction...'
          setStatusHint(fundingLabel)
          lastCrossChainStatusRef.current = 'pending'
          setCrossChainStatus('pending')
          setStep('success')
          try { refetchFeeTokenBalances?.() } catch {}
        } catch (e) {
          throw e as any
        }
      } else {
        // For direct borrowing, allow on any hub chain (BSC or Monad)
        // Hub chains have their own markets and can handle direct borrowing
        if (!isHubChain(chainId)) {
          // Determine the appropriate BSC chain based on network preset
          const isTestnetPreset = (process.env.NEXT_PUBLIC_NETWORK_PRESET || '').startsWith('testnet')
          const bscChainId = isTestnetPreset ? CHAIN_IDS.BSC_TESTNET : CHAIN_IDS.BSC_MAINNET
          const chainName = isTestnetPreset ? 'BSC Testnet' : 'BSC Mainnet'
          
          try {
            toast(`Switching to ${chainName} to borrow`, {
              description: `Direct borrowing uses your wallet gas on ${chainName}.`,
            })
            emitUpdate('borrowing', `Switching to ${chainName}...`)
            await switchChainAsync?.({ chainId: bscChainId })
            // Re-fetch contract addresses since chain has changed
            const newAddresses = getAssetContractAddresses(assetId, bscChainId)
            if (!newAddresses?.pTokenAddress) {
              throw new Error(`Asset not available on ${chainName}`)
            }
            writeBorrow({
              address: newAddresses.pTokenAddress as Address,
              abi: combinedAbi,
              functionName: 'borrow',
              args: [parsedAmount],
            } as any)
            return
          } catch (err) {
            console.error('Failed to switch chain automatically', err)
            const switchMsg = `Please switch to ${chainName} to complete this borrow.`
            setError(switchMsg)
            setStatusHint(`Switch to ${chainName} to submit this borrow.`)
            setStep('error')
            emitTxUpdate({ action: 'borrow', step: 'error', statusMessage: switchMsg })
            return
          }
        }
        if (isSmartAccountActive && isHubChain(chainId) && contractAddresses) {
          // Smart Account: Borrow
          emitUpdate('borrowing', 'Borrowing with smart account...')
          
          try {
            const hash = await executeSmartTx({
              to: contractAddresses.pTokenAddress as Address,
              data: encodeFunctionData({
                abi: combinedAbi,
                functionName: 'borrow',
                args: [parsedAmount],
              }),
            }, {
              chainId: chainId as number,
              onSuccess: (h) => {
                setBorrowHash(h)
              }
            })
            if (hash) {
              setBorrowHash(hash)
            }
          } catch (err) {
            console.error('Smart account borrow error:', err)
            throw err
          }
        } else {
          // Use Privy sponsored gas when borrow value >= $0.01 or user has no BNB for gas.
          // Privy routes through ERC-4337 EntryPoint — msg.sender in borrow() = user's wallet ✓
          const SPONSORED_USD_THRESHOLD = 0.01
          const borrowValueUSD = numericAmount * (currentAsset?.oraclePrice || currentAsset?.price || 1)
          const BNB_GAS_THRESHOLD = parseUnits('0.001', 18)
          const bnbBalance = bnbBalanceOnBsc?.value ?? 0n
          const usePrivyGasless = FEATURE_FLAGS.WALLET_PRIVY_EXPERIMENT &&
            (borrowValueUSD >= SPONSORED_USD_THRESHOLD || bnbBalance < BNB_GAS_THRESHOLD)

          if (usePrivyGasless) {
            emitUpdate('borrowing', 'Borrowing with sponsored gas...')
            try {
              const { hash } = await privySendTransaction(
                {
                  to: contractAddresses.pTokenAddress,
                  data: encodeFunctionData({
                    abi: combinedAbi,
                    functionName: 'borrow',
                    args: [parsedAmount],
                  }),
                  chainId: chainId as number,
                },
                { sponsor: true },
              )
              setBorrowHash(hash)
              emitUpdate('borrowing', 'Borrow submitted (Privy sponsored)...', hash)
            } catch (sponsorErr) {
              // Sponsorship rejected (e.g. credits exhausted) — fall back to wallet signing
              console.warn('Privy gas sponsorship failed, falling back to wallet signing:', sponsorErr)
              writeBorrow({
                address: contractAddresses.pTokenAddress as Address,
                abi: combinedAbi,
                functionName: 'borrow',
                args: [parsedAmount],
              } as any)
            }
          } else {
            writeBorrow({
              address: contractAddresses.pTokenAddress as Address,
              abi: combinedAbi,
              functionName: 'borrow',
              args: [parsedAmount],
            } as any)
          }
        }
      }
      
    } catch (err) {
      const error = err as Error
      const message = error.message || String(error)
      if (applyFriendlyBorrowError(message)) {
        return
      }
      const emitError = (friendly: string) => {
        setError(friendly)
        setStatusHint('')
        setStep('error')
        emitTxUpdate({ action: 'borrow', step: 'error', statusMessage: friendly })
      }
      if (message.includes('INSUFFICIENT_FOR_FEE_BUDGET')) {
        const payload = parseFeeBudgetErrorPayload(message)
        const decimals = Number(underlyingDecimals ?? currentAsset?.decimals ?? 18)
        const requiredWei = getRequiredWeiFromPayload(payload)
        const tokenSymbol = currentAsset?.symbol || 'tokens'
        let friendly = 'Not enough of the borrowed asset remains after fees. Borrow a slightly larger amount or choose a different fee token.'
        if (requiredWei && requiredWei > BigInt(0)) {
          const formattedRequired = formatTokenAmountFromWei(requiredWei, decimals)
          friendly = `Not enough of the borrowed asset remains after fees. Try borrowing at least ${formattedRequired} ${tokenSymbol} so the route keeps a positive balance after fees.`
        }
        emitError(friendly)
        return
      }
      if (message.includes('BICONOMY_MISSING_SIGNABLE_PAYLOADS')) {
        emitError('Failed to prepare cross-chain borrow payloads. Please retry in a few moments.')
        return
      }
      if (message.includes('BICONOMY_7702_AUTHORIZATION_REQUIRED')) {
        emitError('Smart account delegation is missing. Run the smart account upgrade to generate a 7702 authorization and try again.')
        return
      }
      if (message.includes('BICONOMY_SMART_ACCOUNT_REQUIRES_SPONSORSHIP')) {
        emitError('Smart account borrows must use sponsored execution. Re-enable gas sponsorship and retry your borrow.')
        return
      }
      if (message.includes('BICONOMY_SMART_ACCOUNT_SPONSORSHIP_REQUIRED')) {
        emitError('Biconomy could not sponsor this route. Try a smaller amount or retry later once sponsorship is available.')
        return
      }
      if (message.includes('BICONOMY_SMART_ACCOUNT_ONCHAIN_TX_UNSUPPORTED')) {
        emitError('This borrow requires an on-chain confirmation on BSC. Switch to a standard wallet flow or borrow directly on BSC.')
        return
      }
      if (message.includes('BICONOMY_7702_AUTHORIZATION_REQUIRED')) {
        const friendly = 'Smart account delegation is missing. Run the smart account upgrade to generate a 7702 authorization and try again.'
        setError(friendly)
        setStatusHint('')
        setStep('error')
        return
      }
      if (message.includes('BICONOMY_SMART_ACCOUNT_REQUIRES_SPONSORSHIP')) {
        const friendly = 'Smart account borrows must use sponsored execution. Re-enable gas sponsorship and retry your borrow.'
        setError(friendly)
        setStatusHint('')
        setStep('error')
        return
      }
      if (message.includes('BICONOMY_SMART_ACCOUNT_SPONSORSHIP_REQUIRED')) {
        const friendly = 'Biconomy could not sponsor this route. Try a smaller amount or retry later once sponsorship is available.'
        setError(friendly)
        setStatusHint('')
        setStep('error')
        return
      }
      if (message.includes('BICONOMY_SMART_ACCOUNT_ONCHAIN_TX_UNSUPPORTED')) {
        const friendly = 'This borrow requires an on-chain confirmation on BSC. Switch to a standard wallet flow or borrow directly on BSC.'
        setError(friendly)
        setStatusHint('')
        setStep('error')
        return
      }
      if (message.includes('BICONOMY_ONCHAIN_BSC_SIGNATURE_REQUIRED')) {
        emitError('Biconomy requested a direct BSC transaction to continue. Please try a smaller borrow amount or borrow from BSC directly.')
        return
      }
      if (message.startsWith('Compose failed:')) {
        try {
          const raw = message.replace('Compose failed:', '').trim()
          const parsed = JSON.parse(raw)
          const details = Array.isArray(parsed?.errors) ? parsed.errors.join(' \n') : parsed?.message
          emitError(details || 'Invalid parameters for cross-chain compose request. Please reduce amount or retry.')
          return
        } catch {}
      }
      emitError(message)
      onError?.(error)
    }
  }

  // Reset function
  const reset = () => {
    setStep('idle')
    setError(null)
    setBorrowHash(undefined)
    setCrossChainStatus('idle')
    lastCrossChainStatusRef.current = 'idle'
    setBiconomyTrackingUrl(undefined)
    setBiconomyExplorerLinks(undefined)
    setBiconomyBscTxHash(undefined)
    setBiconomyFee(undefined)
    setBiconomyFeeDetails(undefined)
    setBiconomyMeeLink(undefined)
    setBiconomyExpectedNet(undefined)
    setBiconomyFundingMode(undefined)
    setStatusHint('')
    biconomySuperTxHashRef.current = undefined
    verificationSentRef.current = false
    resetBorrow()
    try {
      if (typeof window !== 'undefined') {
        ;(window as any).__PERIDOT_TX_ACTIVE = false
        window.dispatchEvent(new CustomEvent('peridot:tx-idle'))
      }
    } catch {}
  }

  // Get current loading state based on step
  const isLoading = step === 'checking-liquidity' || 
                   step === 'borrowing' ||
                   isBorrowPending || 
                   isBorrowConfirming

  // Get status message
  const getStatusMessage = () => {
    if (useBiconomy && statusHint) return statusHint
    switch (step) {
      case 'checking-liquidity':
        return 'Checking borrowing capacity...'
      case 'borrowing':
        return isBorrowPending ? 'Please confirm borrow in wallet...' : 'Borrowing tokens...'
      case 'success':
        return useBiconomy
          ? (biconomyFundingMode === 'fallback'
              ? 'Borrow submitted via fallback route. Awaiting bridge completion.'
              : 'Sponsored borrow submitted. Awaiting bridge completion.')
          : `Borrow successful! You borrowed ${amount} ${assetId.toUpperCase()}.`
      case 'error':
        return 'Transaction failed'
      default:
        return ''
    }
  }

  useEffect(() => {
    if (!useBiconomy) return

    const handler = (event: Event) => {
      const detail = (event as CustomEvent)?.detail
      const phase: string | undefined = detail?.phase
      const operation = detail?.meta?.operation as string
      if (!phase) return
      // Only process events for borrow operations
      if (operation && operation !== 'borrow') return

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
            mappedMessage = 'Route prepared. Calculating fees...'
            setStatusHint(mappedMessage)
            break
          case 'quote-start':
            mappedStep = 'quoting'
            if (detail?.attempt === 'fallback') {
              mappedMessage = 'Retrying quote using wallet-funded fallback...'
            } else {
              if (detail?.executionMode && detail.executionMode !== 'eoa') {
                mappedMessage = 'Requesting smart account sponsorship from Biconomy...'
              } else {
                mappedMessage = 'Requesting gas sponsorship from Biconomy...'
              }
            }
            setStatusHint(mappedMessage)
            break
          case 'quote-ok':
            mappedStep = 'signing'
            if (detail?.fundingMode === 'fallback') {
              mappedMessage = 'Fallback quote ready. You will confirm in your wallet...'
              setBiconomyFundingMode('fallback')
            } else {
              if (detail?.executionMode && detail.executionMode !== 'eoa') {
                mappedMessage = 'Smart account quote ready. Awaiting signatures...'
              } else {
                mappedMessage = 'Sponsored quote ready. Awaiting signatures...'
              }
              setBiconomyFundingMode('sponsored')
            }
            setStatusHint(mappedMessage)
            break
          case 'quote-fallback':
            mappedStep = 'quoting'
            mappedMessage = 'Gas sponsorship unavailable. Preparing fallback route...'
            setStatusHint(mappedMessage)
            setBiconomyFundingMode('fallback')
            break
          case 'quote-signature-required':
            mappedStep = 'signing'
            if (detail?.executionMode && detail.executionMode !== 'eoa') {
              mappedMessage = 'Preparing smart account authorization payloads...'
            } else {
              mappedMessage = 'Biconomy requires an on-chain confirmation. Preparing payload...'
            }
            setStatusHint(mappedMessage)
            break
          case 'sign-start':
            mappedStep = 'signing'
            mappedMessage = 'Signing required payloads...'
            setStatusHint(mappedMessage)
            break
          case 'execute-start': {
            mappedStep = 'submitting'
            const mode: 'sponsored' | 'fallback' = detail?.fundingMode || biconomyFundingMode || 'sponsored'
            if (mode === 'fallback') {
              mappedMessage = 'Submitting fallback supertransaction...'
            } else if (detail?.executionMode && detail.executionMode !== 'eoa') {
              mappedMessage = 'Submitting smart account supertransaction...'
            } else {
              mappedMessage = 'Submitting sponsored supertransaction...'
            }
            setStatusHint(mappedMessage)
            setStep('success')
            lastCrossChainStatusRef.current = 'pending'
            setCrossChainStatus('pending')
            break
          }
          case 'execute-ok':
            mappedStep = 'success'
            mappedMessage = 'Submitted. Bridge in progress...'
            setStatusHint('')
            lastCrossChainStatusRef.current = 'executed'
            setCrossChainStatus('executed')
            if (!verificationSentRef.current && biconomySuperTxHashRef.current && address) {
              verificationSentRef.current = true
              getAccessToken().then(token => {
                autoVerifyTransaction({
                  txHash: biconomySuperTxHashRef.current as `0x${string}`,
                  walletAddress: address,
                  chainId: CHAIN_IDS.BSC_MAINNET,
                  actionType: 'cross-chain_borrow',
                  amount: cleanAmount(amount),
                  tokenSymbol: currentAsset?.symbol || assetId.toUpperCase(),
                  overrideChainId: CHAIN_IDS.BSC_MAINNET,
                  privyToken: token,
                }).catch(() => {})
              })
            }
            break
          case 'quote-unsupported':
            mappedStep = 'quoting'
            mappedMessage = 'Cross-chain quote requires a BSC signature; adjust the amount or retry later.'
            setStatusHint(mappedMessage)
            break
        }
      } catch (err) {
        console.warn('Failed to handle biconomy phase (borrow):', err)
      }
      
      // Emit standard tx-update event for unified dialog system
      // Check if this transaction was dismissed by user before emitting events
      const currentHash = biconomySuperTxHashRef.current
      if (currentHash && isTransactionDismissed(currentHash)) {
        // Transaction was dismissed, don't emit events
        return
      }
      
      try {
        window.dispatchEvent(new CustomEvent('peridot:tx-update', {
          detail: {
            action: 'borrow',
            step: mappedStep,
            statusMessage: mappedMessage,
            isCrossChain: true,
            txHash: currentHash,
            crossChainStatus: crossChainStatus
          }
        }))
      } catch {}
    }

    try { window.addEventListener('peridot:biconomy-phase', handler as any) } catch {}
    return () => {
      try { window.removeEventListener('peridot:biconomy-phase', handler as any) } catch {}
    }
  }, [useBiconomy, address, amount, currentAsset?.symbol, assetId, biconomyFundingMode])

  // Always attach retry/check listeners regardless of cross-chain mode
  useEffect(() => {
    const detach = attachScopedRetryListeners('borrow', () => {
      try {
        if (step === 'borrowing') {
          reset()
          setTimeout(() => { try { (window as any).dispatchEvent(new CustomEvent('peridot:tx-active')) } catch {}; executeBorrow() }, 0)
        } else if (step === 'error' || step === 'idle') {
          reset()
          setTimeout(() => { try { (window as any).dispatchEvent(new CustomEvent('peridot:tx-active')) } catch {}; executeBorrow() }, 0)
        }
      } catch {}
    }, () => {
      try {
        if (useBiconomy && biconomySuperTxHashRef.current) {
          checkBiconomyStatus(biconomySuperTxHashRef.current).catch(()=>{})
        }
      } catch {}
    })
    return () => { try { detach?.() } catch {} }
  }, [step, reset, executeBorrow, useBiconomy])

  return {
    executeBorrow,
    step,
    error,
    isLoading,
    canBorrow,
    reset,
    contractAddresses,
    statusMessage: getStatusMessage(),
    borrowHash,
    crossChainStatus,
    biconomyTrackingUrl,
    biconomyExplorerLinks,
    biconomyBscTxHash,
    biconomyFee,
    biconomyFeeDetails,
    biconomyMeeLink,
    biconomyExpectedNet,
    biconomyFundingMode,
    isBiconomyCrossChain: useBiconomy,
    statusHint,
    accountLiquidity,
    borrowingPower,
    feeTokenOptions,
    selectedFeeToken,
    selectFeeToken,
    isFeeTokenBalanceLoading,
  }
}

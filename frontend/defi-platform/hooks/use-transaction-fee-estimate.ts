import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useAccount, usePublicClient } from 'wagmi'
import { parseUnits, formatUnits, type Address } from 'viem'
import { getAssetContractAddresses, getMarketsForChain, AXELAR_CROSS_CHAIN_ASSET_IDS } from '@/data/market-data'
import { getChainConfig, CHAIN_IDS, resolveHubReadChainId, isHubChain } from '@/config/contracts'
import { FEATURE_FLAGS } from '@/config/featureFlags'
import { biconomyAdapter } from '@/lib/biconomyAdapter'
import { TOKENS as BICONOMY_TOKENS } from '@/biconomy/constants'
import { useSmartAccountStatus } from '@/hooks/use-smart-account-status'
import { useActiveWallet } from '@/hooks/use-active-wallet'
import { useAccountType } from '@/hooks/use-account-type'
import type { ExecutionMode } from '@/biconomy/constants'

type TransactionType = 'supply' | 'borrow' | 'repay' | 'withdraw'
type FeeMode = 'native' | 'biconomy'

interface FeeEstimate {
  native?: {
    wei: bigint
    usd: number
    token: string
    formatted: string
  }
  biconomy?: {
    amount: string
    token: string
    usd: number
    formatted: string
    isSponsored?: boolean
  }
  approval?: {
    wei: bigint
    usd: number
    formatted: string
  }
  totalUsd: number
  isLoading: boolean
  error?: Error | null
}

interface UseTransactionFeeEstimateProps {
  assetId: string
  amount: string
  transactionType: TransactionType
  feeMode?: FeeMode
  biconomySponsored?: boolean
  destinationChainId?: number
  needsApproval?: boolean
}

// Standard gas limits (conservative estimates)
const GAS_LIMITS = {
  approve: 46000n,
  mint: 200000n,
  supply: 150000n,
  borrow: 300000n,
  repay: 200000n,
  redeem: 150000n,
  redeemUnderlying: 150000n,
}

// Native token prices (fallback if oracle unavailable)
const NATIVE_TOKEN_PRICES: Record<number, number> = {
  [CHAIN_IDS.BSC_MAINNET]: 600, // BNB
  [CHAIN_IDS.BSC_TESTNET]: 600,
  1: 3000, // ETH
  42161: 3000, // Arbitrum ETH
  10: 3000, // Optimism ETH
  8453: 3000, // Base ETH
  137: 0.8, // Polygon MATIC
}

// Get native token symbol for a chain
const getNativeTokenSymbol = (chainId?: number): string => {
  if (!chainId) return 'ETH'
  if (chainId === CHAIN_IDS.BSC_MAINNET || chainId === CHAIN_IDS.BSC_TESTNET) return 'BNB'
  if (chainId === 137) return 'MATIC'
  return 'ETH'
}

// Convert wei to USD using native token price
const convertWeiToUsd = (wei: bigint, chainId: number, nativePrice?: number): number => {
  const price = nativePrice || NATIVE_TOKEN_PRICES[chainId] || 0
  if (price === 0) return 0
  const ethValue = Number(formatUnits(wei, 18))
  return ethValue * price
}

// Format fee amount nicely
const formatFeeAmount = (value: number, decimals: number = 2): string => {
  if (value === 0) return '0'
  if (value < 0.0001) return '<0.0001'
  if (value < 1) return value.toFixed(4)
  if (value < 1000) return value.toFixed(decimals)
  if (value < 1_000_000) return `${(value / 1000).toFixed(2)}K`
  return `${(value / 1_000_000).toFixed(2)}M`
}

export function useTransactionFeeEstimate({
  assetId,
  amount,
  transactionType,
  feeMode = 'native',
  biconomySponsored = true,
  destinationChainId,
  needsApproval = false,
}: UseTransactionFeeEstimateProps): FeeEstimate {
  const { chainId } = useAccount()
  const { address } = useActiveWallet()
  const publicClient = usePublicClient()
  const { isSmartAccount, smartAccountAddress } = useSmartAccountStatus()
  const { accountType } = useAccountType()
  
  const [nativeFee, setNativeFee] = useState<{ wei: bigint; usd: number; token: string; formatted: string } | undefined>()
  const [biconomyFee, setBiconomyFee] = useState<{ amount: string; token: string; usd: number; formatted: string; isSponsored?: boolean } | undefined>()
  const [approvalFee, setApprovalFee] = useState<{ wei: bigint; usd: number; formatted: string } | undefined>()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const lastEstimateKeyRef = useRef<string>('')
  
  // Cache for simulation results (key: estimateKey, value: fee estimate, expires after 5 minutes)
  const simulationCacheRef = useRef<Map<string, { result: any; timestamp: number }>>(new Map())
  const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

  // Get asset and contract addresses
  const asset = useMemo(() => {
    if (!chainId) return null
    const markets = getMarketsForChain(chainId)
    return markets.find(a => a.id === assetId)
  }, [chainId, assetId])

  const contractAddresses = useMemo(() => {
    if (!chainId) return null
    return getAssetContractAddresses(assetId, chainId)
  }, [chainId, assetId])

  const effectiveReadChainId = useMemo(() => resolveHubReadChainId(chainId ?? null) ?? undefined, [chainId])
  const effectiveAddresses = useMemo(() => {
    if (!effectiveReadChainId) return null
    return getAssetContractAddresses(assetId, effectiveReadChainId)
  }, [effectiveReadChainId, assetId])

  const chainConfig = useMemo(() => {
    if (!chainId) return null
    return getChainConfig(chainId)
  }, [chainId])

  // Determine if this is a cross-chain transaction
  const isCrossChain = useMemo(() => {
    if (transactionType === 'borrow' && destinationChainId) {
      const isTestnetPreset = (process.env.NEXT_PUBLIC_NETWORK_PRESET || '').startsWith('testnet')
      const bscChainId = isTestnetPreset ? CHAIN_IDS.BSC_TESTNET : CHAIN_IDS.BSC_MAINNET
      return destinationChainId !== bscChainId
    }
    if (transactionType === 'supply') {
      return AXELAR_CROSS_CHAIN_ASSET_IDS.has(assetId) && chainId && !isHubChain(chainId)
    }
    return false
  }, [transactionType, destinationChainId, assetId, chainId])

  // Estimate native gas fee
  const estimateNativeGas = useCallback(async (): Promise<{ wei: bigint; usd: number; token: string; formatted: string } | null> => {
    if (!publicClient || !chainId || !address || !contractAddresses) return null

    try {
      const gasPrice = await publicClient.getGasPrice()
      if (!gasPrice || gasPrice === 0n) return null

      let gasLimit = GAS_LIMITS.mint // default

      // Use standard gas limits based on transaction type
      // Actual gas estimation would require proper contract calls which may fail
      // Using conservative estimates with buffer is more reliable
      switch (transactionType) {
        case 'supply':
          gasLimit = GAS_LIMITS.mint
          break
        case 'borrow':
          gasLimit = GAS_LIMITS.borrow
          break
        case 'repay':
          gasLimit = GAS_LIMITS.repay
          break
        case 'withdraw':
          gasLimit = GAS_LIMITS.redeem
          break
      }

      // Add 20% buffer
      const bufferedGasLimit = (gasLimit * 120n) / 100n
      const feeWei = gasPrice * bufferedGasLimit
      
      const nativeTokenSymbol = getNativeTokenSymbol(chainId)
      const nativePrice = NATIVE_TOKEN_PRICES[chainId] || 0
      const feeUsd = convertWeiToUsd(feeWei, chainId, nativePrice)
      const formatted = formatFeeAmount(Number(formatUnits(feeWei, 18)), 6)

      return { wei: feeWei, usd: feeUsd, token: nativeTokenSymbol, formatted }
    } catch (err) {
      console.warn('[FeeEstimate] Native gas estimation failed:', err)
      return null
    }
  }, [publicClient, chainId, address, contractAddresses, effectiveAddresses, transactionType, amount, asset])

  // Estimate approval gas fee
  const estimateApprovalGas = useCallback(async (): Promise<{ wei: bigint; usd: number; formatted: string } | null> => {
    if (!publicClient || !chainId || !address || !needsApproval) return null

    try {
      const gasPrice = await publicClient.getGasPrice()
      if (!gasPrice || gasPrice === 0n) return null

      const feeWei = gasPrice * GAS_LIMITS.approve
      const nativePrice = NATIVE_TOKEN_PRICES[chainId] || 0
      const feeUsd = convertWeiToUsd(feeWei, chainId, nativePrice)
      const formatted = formatFeeAmount(Number(formatUnits(feeWei, 18)), 6)

      return { wei: feeWei, usd: feeUsd, formatted }
    } catch (err) {
      console.warn('[FeeEstimate] Approval gas estimation failed:', err)
      return null
    }
  }, [publicClient, chainId, address, needsApproval])

  // Estimate Biconomy fee
  const estimateBiconomyFee = useCallback(async (): Promise<{ amount: string; token: string; usd: number; formatted: string; isSponsored?: boolean } | null> => {
    if (!address || !chainId || !contractAddresses || !amount || parseFloat(amount) <= 0) return null
    if (!FEATURE_FLAGS.CROSS_CHAIN_BORROW_BICONOMY && transactionType !== 'supply') return null
    if (feeMode !== 'biconomy' && !isCrossChain) return null

    try {
      const assetSymbolUpper = (asset?.symbol || '').toUpperCase()
      const isTestnetPreset = (process.env.NEXT_PUBLIC_NETWORK_PRESET || '').startsWith('testnet')
      const bscChainId = isTestnetPreset ? CHAIN_IDS.BSC_TESTNET : CHAIN_IDS.BSC_MAINNET
      
      // Map chain ID to Biconomy key
      const mapChainIdToBiconomyKey = (cid: number): keyof typeof BICONOMY_TOKENS | undefined => {
        switch (cid) {
          case 1: return 'mainnet'
          case 10: return 'optimism'
          case 137: return 'polygon'
          case 42161: return 'arbitrum'
          case 8453: return 'base'
          default: return undefined
        }
      }

      if (transactionType === 'supply' && isCrossChain) {
        const sourceTokenForBiconomy = mapChainIdToBiconomyKey(chainId)
          ? (BICONOMY_TOKENS as any)[mapChainIdToBiconomyKey(chainId)!]?.[assetSymbolUpper] as Address | undefined
          : undefined
        
        const bscConfig = getChainConfig(bscChainId) as any
        const pTokenOnBsc = assetSymbolUpper && bscConfig?.markets?.[assetSymbolUpper]?.pToken as Address | undefined

        if (sourceTokenForBiconomy && pTokenOnBsc) {
          const amountWei = parseUnits(amount, asset?.decimals ?? 18)
          
          // Check if we're on a spoke chain (not hub) - use simulation for accurate gas estimates
          // Simulation provides precise gas estimates by executing the transaction against a forked blockchain
          // This is especially important for cross-chain transactions where gas costs can vary significantly
          // See: https://docs.biconomy.io/simulation-and-optimize-gas
          const isSpokeChain = chainId && !isHubChain(chainId)
          const enableSimulation = isSpokeChain
          
          // Create cache key
          const cacheKey = `biconomy-fee-${chainId}-${sourceTokenForBiconomy}-${pTokenOnBsc}-${amountWei.toString()}-${enableSimulation}`
          
          // Check cache first
          const cached = simulationCacheRef.current.get(cacheKey)
          if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
            const feeDetails = cached.result?.feeDetails
            if (feeDetails) {
              const paymentToken = feeDetails.paymentToken || feeDetails.token || 'USDC'
              const paymentTokenValue = feeDetails.paymentTokenValue || feeDetails.amount || '0'
              const feeUsd = parseFloat(paymentTokenValue) * (paymentToken === 'USDC' || paymentToken === 'USDT' ? 1 : 0)
              
              return {
                amount: paymentTokenValue,
                token: paymentToken,
                usd: feeUsd,
                formatted: formatFeeAmount(parseFloat(paymentTokenValue), 4),
                isSponsored: biconomySponsored,
              }
            }
          }
          
          // Determine execution mode — supply always uses 'eoa' mode (smart-account raw REST mode
          // requires pre-funded Biconomy SA which is never the case in cold state).
          const executionMode: ExecutionMode = accountType === 'EOA_7702' ? 'eoa-7702' : 'eoa'
          console.log('[FeeEstimate] 🔍 DEBUG accountType & executionMode', { accountType, executionMode, address, isSmartAccount, smartAccountAddress })

          // Fetch quote with simulation enabled for spoke chains
          const pre = await (biconomyAdapter as any).preQuote?.({
            userAddress: address,
            smartAccountAddress: isSmartAccount ? (smartAccountAddress as Address) : undefined,
            sourceChainId: chainId,
            sourceTokenAddress: sourceTokenForBiconomy,
            pTokenAddress: pTokenOnBsc,
            amountWei,
            enableSimulation, // Enable simulation on spoke chains for accurate gas estimates
            executionMode,
          })

          if (pre?.feeDetails) {
            // Cache the result
            simulationCacheRef.current.set(cacheKey, {
              result: pre,
              timestamp: Date.now(),
            })
            
            // Clean up old cache entries (keep only last 50 entries)
            if (simulationCacheRef.current.size > 50) {
              const entries = Array.from(simulationCacheRef.current.entries())
              entries.sort((a, b) => b[1].timestamp - a[1].timestamp)
              simulationCacheRef.current.clear()
              entries.slice(0, 50).forEach(([key, value]) => {
                simulationCacheRef.current.set(key, value)
              })
            }
            
            const feeDetails = pre.feeDetails
            const paymentToken = feeDetails.paymentToken || feeDetails.token || 'USDC'
            const paymentTokenValue = feeDetails.paymentTokenValue || feeDetails.amount || '0'
            const feeUsd = parseFloat(paymentTokenValue) * (paymentToken === 'USDC' || paymentToken === 'USDT' ? 1 : 0) // Simplified USD conversion
            
            return {
              amount: paymentTokenValue,
              token: paymentToken,
              usd: feeUsd,
              formatted: formatFeeAmount(parseFloat(paymentTokenValue), 4),
              isSponsored: biconomySponsored,
            }
          }
        }
      }

      // For borrow, we'd need to call the borrow quote API (similar to useBorrowTransaction)
      // This is more complex and may require the actual borrow hook to expose pre-quote functionality
      
      return null
    } catch (err) {
      console.warn('[FeeEstimate] Biconomy fee estimation failed:', err)
      return null
    }
  }, [
    address,
    chainId,
    contractAddresses,
    amount,
    asset,
    transactionType,
    feeMode,
    isCrossChain,
    biconomySponsored,
    isSmartAccount,
    smartAccountAddress,
  ])

  // Main estimation function with debouncing
  const performEstimation = useCallback(async () => {
    if (!amount || parseFloat(amount) <= 0) {
      setNativeFee(undefined)
      setBiconomyFee(undefined)
      setApprovalFee(undefined)
      setIsLoading(false)
      setError(null)
      return
    }

    const estimateKey = `${assetId}-${amount}-${transactionType}-${feeMode}-${chainId}-${destinationChainId}`
    if (estimateKey === lastEstimateKeyRef.current) {
      return // Already estimated for this combination
    }

    setIsLoading(true)
    setError(null)
    lastEstimateKeyRef.current = estimateKey

    try {
      const [native, biconomy, approval] = await Promise.all([
        feeMode === 'native' || !isCrossChain ? estimateNativeGas() : Promise.resolve(null),
        feeMode === 'biconomy' || isCrossChain ? estimateBiconomyFee() : Promise.resolve(null),
        needsApproval ? estimateApprovalGas() : Promise.resolve(null),
      ])

      setNativeFee(native || undefined)
      setBiconomyFee(biconomy || undefined)
      setApprovalFee(approval || undefined)
    } catch (err) {
      console.error('[FeeEstimate] Estimation error:', err)
      setError(err instanceof Error ? err : new Error('Fee estimation failed'))
    } finally {
      setIsLoading(false)
    }
  }, [amount, assetId, transactionType, feeMode, chainId, destinationChainId, estimateNativeGas, estimateBiconomyFee, estimateApprovalGas, needsApproval, isCrossChain])

  // Debounced effect
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    debounceTimerRef.current = setTimeout(() => {
      performEstimation()
    }, 500) // 500ms debounce

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [performEstimation])

  // Calculate total USD
  const totalUsd = useMemo(() => {
    let total = 0
    if (nativeFee) total += nativeFee.usd
    if (biconomyFee && !biconomyFee.isSponsored) total += biconomyFee.usd
    if (approvalFee) total += approvalFee.usd
    return total
  }, [nativeFee, biconomyFee, approvalFee])

  return {
    native: nativeFee,
    biconomy: biconomyFee,
    approval: approvalFee,
    totalUsd,
    isLoading,
    error,
  }
}


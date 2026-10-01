import { useState, useCallback, useMemo, useRef } from 'react'
import { useAccount, useReadContract, useReadContracts, usePublicClient } from 'wagmi'
import { formatUnits, Address, erc20Abi, createPublicClient, http, defineChain } from 'viem'
import { getChainConfig, resolveHubReadChainId, monadTestnetContracts, bscTestnetContracts, CHAIN_IDS } from '@/config/contracts'
import combinedAbi from '@/app/abis/combinedAbi.json'
import pdtptokenABI from '@/app/abis/pdtptokenABI.json'
import peridottrollerABI from '@/app/abis/peridottrollerABI.json'
import PriceOracle from '@/app/abis/PriceOracle.json'

// Development mode flag for debug logging
const isDevelopment = process.env.NODE_ENV === 'development'

// Debug logging helper
const debugLog = (...args: any[]) => {
  if (isDevelopment) {
    console.log(...args)
  }
}

// Define chain objects for viem
const monadTestnet = defineChain({
  id: monadTestnetContracts.chainId,
  name: monadTestnetContracts.chainNameReadable,
  nativeCurrency: { name: 'Monad', symbol: 'MONAD', decimals: 18 },
  rpcUrls: {
    default: { http: [monadTestnetContracts.rpcUrl] },
    public: { http: [monadTestnetContracts.rpcUrl] },
  },
  blockExplorers: {
    default: { name: 'Monad Explorer', url: monadTestnetContracts.explorer },
  },
  testnet: true,
})

const bscTestnet = defineChain({
  id: bscTestnetContracts.chainId,
  name: bscTestnetContracts.chainNameReadable,
  nativeCurrency: { name: 'BNB', symbol: 'tBNB', decimals: 18 },
  rpcUrls: {
    default: { http: [bscTestnetContracts.rpcUrl] },
    public: { http: [bscTestnetContracts.rpcUrl] },
  },
  blockExplorers: {
    default: { name: 'BscScan', url: bscTestnetContracts.explorer },
  },
  testnet: true,
})

interface WalletAnalysisData {
  // Basic Info
  walletAddress: string
  chainId: number
  timestamp: number
  
  // gMON Specific
  gmonBalance: string
  pgmonBalance: string
  gmonBorrowBalance: string
  
  // Market State
  isInGmonMarket: boolean
  collateralFactor: string
  gmonPrice: string
  
  // Multi-Market Analysis
  totalMarkets: number
  marketDetails: Array<{
    symbol: string
    pTokenAddress: string
    underlyingAddress: string
    userBalance: string
    underlyingPrice: string
    underlyingAmount: string
    collateralValue: string
    collateralFactor: string
    borrowBalance: string
    borrowValue: string
    isCollateralEnabled: boolean
    isMarketActive: boolean
    decimals: number
  }>
  totalCollateralValue: string
  totalBorrowValue: string
  availableCollateral: string
  
  // Account Health
  accountLiquidity: string
  accountShortfall: string
  healthFactor: number
  
  // Withdrawal Analysis
  canWithdraw: boolean
  maxWithdrawable: string
  maxWithdrawableUsd: string
  safeWithdrawalPercentage: string
  safeWithdrawalGmon: string
  safeWithdrawalUsd: string
  withdrawalBlockers: string[]
  withdrawalReason?: string
  
  // Market Conditions
  marketPaused: boolean
  totalSupply: string
  totalBorrows: string
  availableLiquidity: string
  
  // Recommendations
  recommendations: string[]
  severity: 'healthy' | 'warning' | 'critical'
}

interface AnalysisStep {
  id: string
  name: string
  status: 'pending' | 'loading' | 'success' | 'error'
  message?: string
  data?: any
  error?: string
  timestamp: number
}

interface UseWalletAnalysisResult {
  data: WalletAnalysisData | null
  isLoading: boolean
  error: string | null
  steps: AnalysisStep[]
  analyzeWallet: (address: string) => Promise<void>
  clearAnalysis: () => void
}

// Cache configuration
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes
const CACHE_KEY = 'peridot:wallet-analysis'
const RPC_DELAY = 500 // 500ms between calls

// In-memory cache
const memoryCache = new Map<string, { data: WalletAnalysisData; timestamp: number }>()
const inflightRequests = new Set<string>()

export function useWalletAnalysis(): UseWalletAnalysisResult {
  const [data, setData] = useState<WalletAnalysisData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [steps, setSteps] = useState<AnalysisStep[]>([])
  
  const { chainId } = useAccount()
  const stepRef = useRef<AnalysisStep[]>([])

  // Route reads to hub chain for Axelar spoke chains (following existing pattern)
  const effectiveChainId = useMemo(() => resolveHubReadChainId(chainId ?? null) ?? chainId ?? null, [chainId]) as number | null

  // Get chain config for controller/oracle address on effective chain (following existing pattern)
  const chainConfig = effectiveChainId ? getChainConfig(effectiveChainId) : null
  const controllerAddress = chainConfig && 'unitrollerProxy' in chainConfig ? chainConfig.unitrollerProxy : null
  const oracleAddress = chainConfig && 'oracle' in chainConfig ? chainConfig.oracle : null

  // Get gMON market config from the effective chain
  const gmonConfig = chainConfig && 'markets' in chainConfig && chainConfig.markets && 'gMON' in chainConfig.markets 
    ? chainConfig.markets.gMON 
    : null
  const gmonTokenAddress = gmonConfig?.underlying as Address | undefined
  const gmonPTokenAddress = gmonConfig?.pToken as Address | undefined
  
  // Market mapping for easy identification
  // NOTE: market.decimals in config refers to underlying token decimals, not pToken decimals
  const marketMapping: Record<string, { symbol: string; decimals: number; underlying: string; pTokenDecimals: number }> = {}
  
  // Hardcoded pToken decimals (all pTokens have 8 decimals)
  const pTokenDecimalsMap: Record<string, number> = {
    'pgMON': 8,
    'pUSDC': 8,
    'pUSDT': 8,
    'pLINK': 8,
    'pPDT': 8,
    'pWETH': 8,
    'pWBTC': 8,
    'prUSDC': 8
  }
  
  if (chainConfig && 'markets' in chainConfig && chainConfig.markets) {
    Object.entries(chainConfig.markets).forEach(([key, market]) => {
      marketMapping[market.pToken.toLowerCase()] = { 
        symbol: market.symbol, 
        decimals: market.decimals, // underlying token decimals
        underlying: market.underlying,
        pTokenDecimals: pTokenDecimalsMap[market.symbol] || 8 // pToken decimals (default to 8)
      }
    })
  }

  // Create public client for the effective chain
  const publicClient = useMemo(() => {
    if (!effectiveChainId) return null
    
    if (effectiveChainId === monadTestnet.id) {
      return createPublicClient({ chain: monadTestnet, transport: http() })
    }
    if (effectiveChainId === bscTestnet.id) {
      return createPublicClient({ chain: bscTestnet, transport: http() })
    }
    return null
  }, [effectiveChainId])

  // Helper function to add/update analysis step
  const updateStep = useCallback((step: AnalysisStep) => {
    setSteps(prev => {
      const newSteps = [...prev]
      const existingIndex = newSteps.findIndex(s => s.id === step.id)
      if (existingIndex >= 0) {
        newSteps[existingIndex] = step
      } else {
        newSteps.push(step)
      }
      stepRef.current = newSteps
      return newSteps
    })
  }, [])

  // Helper function to get cached data
  const getCachedData = useCallback((address: string): WalletAnalysisData | null => {
    // Check memory cache first
    const memoryCached = memoryCache.get(address.toLowerCase())
    if (memoryCached && Date.now() - memoryCached.timestamp < CACHE_TTL) {
      return memoryCached.data
    }

    // Check localStorage cache
    try {
      const cached = localStorage.getItem(`${CACHE_KEY}:${address.toLowerCase()}`)
      if (cached) {
        const parsed = JSON.parse(cached)
        if (Date.now() - parsed.timestamp < CACHE_TTL) {
          // Update memory cache
          memoryCache.set(address.toLowerCase(), parsed)
          return parsed.data
        }
      }
    } catch (e) {
      console.warn('Failed to read from localStorage cache:', e)
    }

    return null
  }, [])

  // Helper function to cache data
  const cacheData = useCallback((address: string, analysisData: WalletAnalysisData) => {
    const cacheEntry = { data: analysisData, timestamp: Date.now() }
    
    // Update memory cache
    memoryCache.set(address.toLowerCase(), cacheEntry)
    
    // Update localStorage cache
    try {
      localStorage.setItem(`${CACHE_KEY}:${address.toLowerCase()}`, JSON.stringify(cacheEntry))
    } catch (e) {
      console.warn('Failed to write to localStorage cache:', e)
    }
  }, [])

  // Helper function to add delay between RPC calls
  const delay = useCallback((ms: number) => new Promise(resolve => setTimeout(resolve, ms)), [])

  // Helper function to retry contract calls with exponential backoff
  const retryContractCall = useCallback(async <T>(
    contractCall: () => Promise<T>,
    stepId: string,
    stepName: string,
    maxRetries: number = 3
  ): Promise<T> => {
    let lastError: Error | null = null
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        updateStep({
          id: stepId,
          name: stepName,
          status: 'loading',
          message: attempt > 1 ? `Retrying... (attempt ${attempt}/${maxRetries})` : 'Loading...',
          timestamp: Date.now()
        })
        
        const result = await contractCall()
        
        updateStep({
          id: stepId,
          name: stepName,
          status: 'success',
          message: 'Success',
          timestamp: Date.now()
        })
        
        return result
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error')
        
        if (attempt < maxRetries) {
          const delayMs = Math.pow(2, attempt) * 1000 // Exponential backoff
          updateStep({
            id: stepId,
            name: stepName,
            status: 'loading',
            message: `Failed, retrying in ${delayMs/1000}s... (${lastError.message})`,
            timestamp: Date.now()
          })
          await delay(delayMs)
        } else {
          updateStep({
            id: stepId,
            name: stepName,
            status: 'error',
            error: lastError.message,
            timestamp: Date.now()
          })
          throw lastError
        }
      }
    }
    
    throw lastError || new Error('Max retries exceeded')
  }, [updateStep, delay])

  // Main analysis function
  const analyzeWallet = useCallback(async (address: string) => {
    if (!address || !publicClient || !controllerAddress || !gmonTokenAddress || !gmonPTokenAddress) {
      setError('Invalid address, client not available, or missing contract addresses')
      return
    }

    const normalizedAddress = address.toLowerCase()
    
    // Check if already in progress
    if (inflightRequests.has(normalizedAddress)) {
      setError('Analysis already in progress for this address')
      return
    }

    // Check cache first
    const cached = getCachedData(normalizedAddress)
    if (cached) {
      setData(cached)
      setError(null)
      updateStep({
        id: 'cache-hit',
        name: 'Cache Check',
        status: 'success',
        message: 'Using cached data',
        timestamp: Date.now()
      })
      return
    }

    inflightRequests.add(normalizedAddress)
    setIsLoading(true)
    setError(null)
    setSteps([])
    stepRef.current = []

    try {
      // Step 1: Validate address and setup
      updateStep({
        id: 'validate-address',
        name: 'Validating Address',
        status: 'loading',
        message: 'Checking if address is valid...',
        timestamp: Date.now()
      })

      if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
        throw new Error('Invalid Ethereum address format')
      }

      updateStep({
        id: 'validate-address',
        name: 'Validating Address',
        status: 'success',
        message: `Address valid, analyzing on chain ${effectiveChainId}`,
        timestamp: Date.now()
      })

      await delay(RPC_DELAY)

      // Step 2: Get account liquidity using proper Comptroller ABI
      const accountLiquidity = await retryContractCall(
        () => publicClient.readContract({
          address: controllerAddress as Address,
          abi: peridottrollerABI,
          functionName: 'getAccountLiquidity',
          args: [address as Address]
        }) as Promise<[bigint, bigint, bigint]>,
        'account-liquidity',
        'Account Liquidity'
      )

      updateStep({
        id: 'account-liquidity',
        name: 'Account Liquidity',
        status: 'success',
        message: `Liquidity: ${formatUnits(accountLiquidity[0], 18)}, Shortfall: ${formatUnits(accountLiquidity[1], 18)}`,
        data: accountLiquidity,
        timestamp: Date.now()
      })

      await delay(RPC_DELAY)

      // Step 3: Get assets in (market membership) using proper Comptroller ABI
      const assetsIn = await retryContractCall(
        () => publicClient.readContract({
          address: controllerAddress as Address,
          abi: peridottrollerABI,
          functionName: 'getAssetsIn',
          args: [address as Address]
        }) as Promise<Address[]>,
        'assets-in',
        'Market Membership'
      )

      const isInGmonMarket = assetsIn.some(asset => 
        asset.toLowerCase() === gmonPTokenAddress.toLowerCase()
      )

      updateStep({
        id: 'assets-in',
        name: 'Market Membership',
        status: 'success',
        message: `In ${assetsIn.length} markets, gMON market: ${isInGmonMarket ? 'YES' : 'NO'}`,
        data: { assetsIn, isInGmonMarket },
        timestamp: Date.now()
      })

      await delay(RPC_DELAY)

      // Step 4: Use decimals from config (more efficient than fetching from contracts)
      const gmonDecimals = gmonConfig?.decimals || 18
      const pgmonDecimals = 8 // pToken decimals are always 8

      updateStep({
        id: 'token-decimals',
        name: 'Token Decimals',
        status: 'success',
        message: `gMON: ${gmonDecimals} (config), pgMON: ${pgmonDecimals} (hardcoded)`,
        data: { gmonDecimals, pgmonDecimals },
        timestamp: Date.now()
      })

      await delay(RPC_DELAY)

      // Step 5: Get gMON balances using ERC20 ABI
      const [gmonBalance, pgmonBalance] = await Promise.all([
        retryContractCall(
          () => publicClient.readContract({
            address: gmonTokenAddress,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [address as Address]
          }) as Promise<bigint>,
          'gmon-balance',
          'gMON Balance'
        ),
        retryContractCall(
          () => publicClient.readContract({
            address: gmonPTokenAddress,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [address as Address]
          }) as Promise<bigint>,
          'pgmon-balance',
          'pgMON Balance'
        )
      ])

      updateStep({
        id: 'gmon-balances',
        name: 'gMON Balances',
        status: 'success',
        message: `gMON: ${formatUnits(gmonBalance, gmonDecimals)}, pgMON: ${formatUnits(pgmonBalance, 8)}`,
        data: { gmonBalance, pgmonBalance, gmonDecimals, pgmonDecimals: 8 },
        timestamp: Date.now()
      })

      await delay(RPC_DELAY)

      // Step 5: Get borrow balance using pToken ABI
      const borrowBalance = await retryContractCall(
        () => publicClient.readContract({
          address: gmonPTokenAddress,
          abi: pdtptokenABI,
          functionName: 'borrowBalanceCurrent',
          args: [address as Address]
        }) as Promise<bigint>,
        'borrow-balance',
        'Borrow Balance'
      )

      updateStep({
        id: 'borrow-balance',
        name: 'Borrow Balance',
        status: 'success',
        message: `Borrowed: ${formatUnits(borrowBalance, gmonDecimals)} gMON`,
        data: { borrowBalance, gmonDecimals },
        timestamp: Date.now()
      })

      await delay(RPC_DELAY)

      // Step 6: Comprehensive Multi-Market Analysis
      updateStep({
        id: 'multi-market-analysis',
        name: 'Multi-Market Analysis',
        status: 'loading',
        message: `Analyzing ${assetsIn.length} markets for complete picture...`,
        timestamp: Date.now()
      })

      // Analyze each market the user is in
      const marketAnalysis = await Promise.all(
        assetsIn.map(async (marketAddress) => {
          const marketInfo = marketMapping[marketAddress.toLowerCase()]
          if (!marketInfo) {
            console.warn(`Unknown market: ${marketAddress}`)
            return null
          }

          try {
            // Get all market data in parallel (using decimals from config instead of fetching)
            const [marketData, userBalance, underlyingBalance, underlyingPrice, borrowBalance] = await Promise.all([
              retryContractCall(
                () => publicClient.readContract({
                  address: controllerAddress as Address,
                  abi: peridottrollerABI,
                  functionName: 'markets',
                  args: [marketAddress]
                }) as Promise<[boolean, bigint, boolean]>,
                `market-data-${marketInfo.symbol}`,
                `${marketInfo.symbol} Market Data`
              ),
              retryContractCall(
                () => publicClient.readContract({
                  address: marketAddress,
                  abi: erc20Abi,
                  functionName: 'balanceOf',
                  args: [address as Address]
                }) as Promise<bigint>,
                `balance-${marketInfo.symbol}`,
                `${marketInfo.symbol} Balance`
              ),
              retryContractCall(
                () => publicClient.readContract({
                  address: marketAddress,
                  abi: pdtptokenABI,
                  functionName: 'balanceOfUnderlying',
                  args: [address as Address]
                }) as Promise<bigint>,
                `underlying-${marketInfo.symbol}`,
                `${marketInfo.symbol} Underlying Balance`
              ),
              retryContractCall(
                () => publicClient.readContract({
                  address: oracleAddress as Address,
                  abi: PriceOracle,
                  functionName: 'getUnderlyingPrice',
                  args: [marketAddress]
                }) as Promise<bigint>,
                `price-${marketInfo.symbol}`,
                `${marketInfo.symbol} Price`
              ),
              retryContractCall(
                () => publicClient.readContract({
                  address: marketAddress,
                  abi: pdtptokenABI,
                  functionName: 'borrowBalanceCurrent',
                  args: [address as Address]
                }) as Promise<bigint>,
                `borrow-${marketInfo.symbol}`,
                `${marketInfo.symbol} Borrow Balance`
              )
            ])

            // Use decimals from config (underlying token decimals)
            const underlyingDecimals = marketInfo.decimals

            // Calculate derived values
            const userBalanceNum = parseFloat(formatUnits(userBalance, marketInfo.pTokenDecimals))
            
            // FIXED: balanceOfUnderlying returns 18 decimals, not pToken decimals
            const underlyingAmount = parseFloat(formatUnits(underlyingBalance, 18))
            const underlyingPriceNum = parseFloat(formatUnits(underlyingPrice, 18)) // Price is always 18 decimals
            // FIXED: borrowBalanceCurrent returns 18 decimals, not underlying token decimals
            const borrowBalanceNum = parseFloat(formatUnits(borrowBalance, 18))
            const collateralFactorNum = parseFloat(formatUnits(marketData[1], 18)) // Collateral factor is 18 decimals
            
            // Calculate collateral value considering collateral factor
            const collateralValue = underlyingAmount * underlyingPriceNum * collateralFactorNum
            const borrowValue = borrowBalanceNum * underlyingPriceNum
            
            // Debug: Log key values (only in development)
            debugLog(`DEBUG ${marketInfo.symbol}:`, {
              pTokenBalance: userBalanceNum,
              underlyingAmount,
              borrowBalanceNum,
              underlyingPrice: underlyingPriceNum,
              collateralValue,
              borrowValue
            })
            
            // CRITICAL SANITY CHECK: If borrow value is impossibly large (> $1M), something is wrong
            if (borrowValue > 1000000) {
              console.error(`CRITICAL: Borrow value too high for ${marketInfo.symbol}: $${borrowValue.toFixed(2)}`)
              console.error(`This indicates a decimal scaling error. Raw borrowBalance: ${borrowBalance.toString()}`)
              console.error(`Using 18 decimals for borrow balance calculation`)
              // Skip this market to prevent incorrect totals
              return null;
            }
            
            // Additional sanity check for underlying amount
            if (underlyingAmount > 10000000) { // 10M tokens
              console.error(`CRITICAL: Underlying amount too high for ${marketInfo.symbol}: ${underlyingAmount.toFixed(2)}`)
              console.error(`This indicates a decimal scaling error. Raw underlyingBalance: ${underlyingBalance.toString()}`)
              console.error(`Using 18 decimals for underlying balance calculation`)
              return null;
            }

            return {
              symbol: marketInfo.symbol,
              pTokenAddress: marketAddress,
              underlyingAddress: marketInfo.underlying,
              userBalance: userBalanceNum.toString(),
              underlyingPrice: underlyingPriceNum.toString(),
              underlyingAmount: underlyingAmount.toString(),
              collateralValue: collateralValue.toString(),
              collateralFactor: collateralFactorNum.toString(),
              borrowBalance: borrowBalanceNum.toString(),
              borrowValue: borrowValue.toString(),
              isCollateralEnabled: marketData[0], // isListed
              isMarketActive: !marketData[2], // not paused
              decimals: underlyingDecimals
            }
          } catch (error) {
            console.error(`Error analyzing market ${marketInfo.symbol}:`, error)
            return null
          }
        })
      )

      // Filter out null results
      const validMarkets = marketAnalysis.filter(market => market !== null)
      
      // Calculate totals - collateralValue is the full value, we need to apply collateral factor to get the collateralized amount
      const totalCollateralValue = validMarkets.reduce((sum, market) => {
        return sum + (parseFloat(market!.collateralValue) * parseFloat(market!.collateralFactor))
      }, 0)
      
      const totalBorrowValue = validMarkets.reduce((sum, market) => {
        return sum + parseFloat(market!.borrowValue)
      }, 0)
      
      // SANITY CHECK: If total collateral value is impossibly large, flag it
      if (totalCollateralValue > 100000000) { // $100M
        console.error(`CRITICAL: Total collateral value too high: $${totalCollateralValue.toFixed(2)}`)
        console.error('This indicates a decimal scaling error in underlying balance calculations')
        console.error('Markets with high collateral values:', validMarkets.filter(m => parseFloat(m!.collateralValue) > 1000000))
        throw new Error(`Decimal scaling error detected: Total collateral value = $${totalCollateralValue.toFixed(2)}`)
      }
      
      // Calculate available collateral considering collateral factors
      // Each market's collateral value is already multiplied by its collateral factor
      const availableCollateral = totalCollateralValue - totalBorrowValue
      
      // CRITICAL SANITY CHECK: If total borrow value is impossibly large, flag it
      if (totalBorrowValue > 1000000) {
        console.error(`CRITICAL SANITY CHECK FAILED: Total borrow value = $${totalBorrowValue.toFixed(2)}`)
        console.error('This indicates a decimal scaling error in borrow balance calculations')
        console.error('Markets with high borrow values:', validMarkets.filter(m => parseFloat(m!.borrowValue) > 1000))
        // Don't continue with incorrect calculations
        throw new Error(`Decimal scaling error detected: Total borrow value = $${totalBorrowValue.toFixed(2)}`)
      }

      updateStep({
        id: 'multi-market-analysis',
        name: 'Multi-Market Analysis',
        status: 'success',
        message: `Analyzed ${validMarkets.length} markets. Total collateral: $${totalCollateralValue.toFixed(2)}, Total borrows: $${totalBorrowValue.toFixed(2)}`,
        data: { 
          marketDetails: validMarkets,
          totalCollateralValue,
          totalBorrowValue,
          availableCollateral
        },
        timestamp: Date.now()
      })

      await delay(RPC_DELAY)

      // Step 7: Get gMON specific data for detailed analysis
      const gmonMarket = validMarkets.find(m => m?.symbol === 'pgMON')
      if (!gmonMarket) {
        throw new Error('gMON market not found in user markets')
      }

      const [gmonMarketInfo, gmonUnderlyingBalance, totalSupply, totalBorrows, cash, gmonPrice] = await Promise.all([
        retryContractCall(
          () => publicClient.readContract({
            address: controllerAddress as Address,
            abi: peridottrollerABI,
            functionName: 'markets',
            args: [gmonPTokenAddress]
          }) as Promise<[boolean, bigint, boolean]>,
          'gmon-market-info',
          'gMON Market Info'
        ),
        retryContractCall(
          () => publicClient.readContract({
            address: gmonPTokenAddress,
            abi: pdtptokenABI,
            functionName: 'balanceOfUnderlying',
            args: [address as Address]
          }) as Promise<bigint>,
          'gmon-underlying-balance',
          'gMON Underlying Balance'
        ),
        retryContractCall(
          () => publicClient.readContract({
            address: gmonPTokenAddress,
            abi: pdtptokenABI,
            functionName: 'totalSupply',
            args: []
          }) as Promise<bigint>,
          'gmon-total-supply',
          'gMON Total Supply'
        ),
        retryContractCall(
          () => publicClient.readContract({
            address: gmonPTokenAddress,
            abi: pdtptokenABI,
            functionName: 'totalBorrows',
            args: []
          }) as Promise<bigint>,
          'gmon-total-borrows',
          'gMON Total Borrows'
        ),
        retryContractCall(
          () => publicClient.readContract({
            address: gmonPTokenAddress,
            abi: pdtptokenABI,
            functionName: 'getCash',
            args: []
          }) as Promise<bigint>,
          'gmon-available-cash',
          'gMON Available Cash'
        ),
        retryContractCall(
          () => publicClient.readContract({
            address: oracleAddress as Address,
            abi: PriceOracle,
            functionName: 'getUnderlyingPrice',
            args: [gmonPTokenAddress]
          }) as Promise<bigint>,
          'gmon-price',
          'gMON Price'
        )
      ])

      updateStep({
        id: 'gmon-market-data',
        name: 'gMON Market Data',
        status: 'success',
        message: `Market active: ${gmonMarketInfo[0]}, Paused: ${gmonMarketInfo[2]}, Price: $${formatUnits(gmonPrice, 18)}`,
        data: { 
          gmonMarketInfo, 
          gmonUnderlyingBalance, 
          totalSupply, 
          totalBorrows, 
          cash,
          gmonPrice,
          gmonDecimals,
          pgmonDecimals
        },
        timestamp: Date.now()
      })

      await delay(RPC_DELAY)

      // Step 8: Enhanced withdrawal analysis using multi-market data
      updateStep({
        id: 'withdrawal-analysis',
        name: 'Withdrawal Analysis',
        status: 'loading',
        message: 'Analyzing withdrawal capability using multi-market data...',
        timestamp: Date.now()
      })

      // Get gMON specific values
      const pgmonBalanceNum = parseFloat(gmonMarket.userBalance)
      const gmonBalanceNum = parseFloat(formatUnits(gmonBalance, gmonDecimals))
      const liquidityNum = parseFloat(formatUnits(accountLiquidity[0], 18)) // Comptroller uses 18 decimals
      const shortfallNum = parseFloat(formatUnits(accountLiquidity[1], 18)) // Comptroller uses 18 decimals
      // FIXED: balanceOfUnderlying returns 18 decimals, not pToken decimals (8)
      const gmonUnderlyingAmount = parseFloat(formatUnits(gmonUnderlyingBalance, 18))
      const gmonPriceNum = parseFloat(gmonMarket.underlyingPrice)
      
      // Debug: Log gMON specific values (only in development)
      debugLog('DEBUG gMON specific:', {
        pgmonBalanceNum,
        gmonBalanceNum,
        gmonUnderlyingAmount,
        gmonPriceNum,
        liquidityNum,
        shortfallNum,
        totalCollateralValue,
        totalBorrowValue,
        availableCollateral
      })

      // Use direct underlying balance (no exchange rate calculation needed)
      const maxWithdrawableGmon = gmonUnderlyingAmount
      const maxWithdrawableUsd = maxWithdrawableGmon * gmonPriceNum

      // Use multi-market totals for accurate calculations
      const gmonCollateralValue = parseFloat(gmonMarket.collateralValue) * parseFloat(gmonMarket.collateralFactor)
      const gmonBorrowValue = parseFloat(gmonMarket.borrowValue)
      
      // Calculate safe withdrawal based on total portfolio
      const safeWithdrawalPercentage = availableCollateral > 0 ? 
        Math.min(100, (availableCollateral / totalCollateralValue) * 100) : 0
      const safeWithdrawalGmon = (safeWithdrawalPercentage / 100) * maxWithdrawableGmon

      // Calculate health factor using total portfolio
      // If there's a shortfall, health factor is 0 (undercollateralized)
      // If there's liquidity, health factor = liquidity / total borrows
      // If no borrows, health factor is high (999)
      const healthFactor = shortfallNum > 0 ? 0 : totalBorrowValue > 0 ? liquidityNum / totalBorrowValue : 999

      // Determine withdrawal capability with detailed analysis
      const withdrawalBlockers: string[] = []
      let canWithdraw = true
      let maxWithdrawable = maxWithdrawableGmon
      let withdrawalReason = ''

      // Check if user has any pgMON to withdraw
      if (pgmonBalanceNum === 0) {
        canWithdraw = false
        withdrawalBlockers.push('No pgMON balance available to withdraw')
        withdrawalReason = 'You have no pgMON tokens to withdraw. You may have already withdrawn them or never supplied gMON.'
      } else if (pgmonBalanceNum < 0.000001) {
        canWithdraw = false
        withdrawalBlockers.push('pgMON balance too small to withdraw (dust amount)')
        withdrawalReason = 'Your pgMON balance is too small to be withdrawn due to rounding errors.'
      } else if (safeWithdrawalPercentage === 0) {
        canWithdraw = false
        withdrawalBlockers.push('Cannot withdraw without going undercollateralized')
        withdrawalReason = `You have borrowed $${totalBorrowValue.toFixed(2)} across all markets. Withdrawing would make you undercollateralized.`
      } else if (safeWithdrawalPercentage < 100) {
        canWithdraw = true
        withdrawalBlockers.push(`Can only safely withdraw ${safeWithdrawalPercentage.toFixed(1)}% of collateral`)
        withdrawalReason = `You can safely withdraw ${safeWithdrawalGmon.toFixed(2)} gMON ($${(safeWithdrawalGmon * gmonPriceNum).toFixed(2)}) without going undercollateralized.`
      }

      // Check market status
      if (gmonMarketInfo[2]) {
        canWithdraw = false
        withdrawalBlockers.push('gMON market is paused by admin')
        withdrawalReason = 'The gMON market is currently paused. Withdrawals are disabled.'
      }

      if (!gmonMarketInfo[0]) {
        canWithdraw = false
        withdrawalBlockers.push('gMON market is not listed')
        withdrawalReason = 'The gMON market is not listed in the protocol.'
      }

      // Check collateralization
      if (shortfallNum > 0) {
        canWithdraw = false
        withdrawalBlockers.push('Account is undercollateralized')
        withdrawalReason = 'Your account is undercollateralized. You must add collateral or repay debt before withdrawing.'
      }

      // Enhanced recommendations based on multi-market analysis
      const recommendations: string[] = []
      let severity: 'healthy' | 'warning' | 'critical' = 'healthy'

      // Analyze the total portfolio position
      if (totalBorrowValue > 0) {
        if (safeWithdrawalPercentage === 0) {
          severity = 'critical'
          recommendations.push(`🚨 CRITICAL: You cannot withdraw any gMON without going undercollateralized`)
          recommendations.push(`You have borrowed $${totalBorrowValue.toFixed(2)} across all markets against your collateral`)
          recommendations.push(`💡 SOLUTION: Repay some debt to free up collateral for withdrawal`)
        } else if (safeWithdrawalPercentage < 100) {
          severity = 'warning'
          recommendations.push(`⚠️ You can only safely withdraw ${safeWithdrawalPercentage.toFixed(1)}% of your gMON collateral`)
          recommendations.push(`Safe withdrawal: ${safeWithdrawalGmon.toFixed(2)} gMON ($${(safeWithdrawalGmon * gmonPriceNum).toFixed(2)})`)
          recommendations.push(`💡 To withdraw more: Repay some of your $${totalBorrowValue.toFixed(2)} total debt first`)
        } else {
          recommendations.push(`✅ You can withdraw all ${maxWithdrawableGmon.toFixed(2)} gMON safely`)
          recommendations.push(`You have $${totalBorrowValue.toFixed(2)} borrowed but sufficient collateral across all markets`)
        }
      }

      if (shortfallNum > 0) {
        severity = 'critical'
        recommendations.push('🚨 CRITICAL: Add collateral or repay debt immediately to avoid liquidation')
      } else if (healthFactor < 1.5 && totalBorrowValue > 0) {
        severity = 'warning'
        recommendations.push('⚠️ Health factor is low. Consider adding collateral or repaying debt')
      }

      if (!isInGmonMarket && pgmonBalanceNum > 0) {
        recommendations.push('Enter the gMON market to enable borrowing against your collateral')
      }

      // Multi-market specific guidance
      if (validMarkets.length > 1) {
        recommendations.push(`📊 You are active in ${validMarkets.length} markets with $${totalCollateralValue.toFixed(2)} total collateral`)
        const marketsWithBorrows = validMarkets.filter(m => parseFloat(m!.borrowBalance) > 0)
        if (marketsWithBorrows.length > 0) {
          recommendations.push(`💰 You have borrows in: ${marketsWithBorrows.map(m => m!.symbol).join(', ')}`)
        }
      }

      // Specific guidance for this user's situation
      if (gmonBalanceNum > 1000 && pgmonBalanceNum < 0.000001 && totalBorrowValue > 500) {
        recommendations.push(`💡 SOLUTION: You have plenty of gMON (${gmonBalanceNum.toFixed(2)}). Supply some to get pgMON tokens, then you can withdraw them`)
        recommendations.push('💡 ALTERNATIVE: Repay your borrows first, then you can withdraw your existing pgMON')
      }

      updateStep({
        id: 'withdrawal-analysis',
        name: 'Withdrawal Analysis',
        status: 'success',
        message: `Can withdraw: ${canWithdraw ? 'YES' : 'NO'}, Max: ${maxWithdrawable.toFixed(6)} gMON`,
        data: { canWithdraw, maxWithdrawable, withdrawalBlockers, healthFactor, withdrawalReason },
        timestamp: Date.now()
      })

      // Step 8: Compile final analysis
      updateStep({
        id: 'final-analysis',
        name: 'Final Analysis',
        status: 'loading',
        message: 'Compiling final analysis...',
        timestamp: Date.now()
      })

      const analysisData: WalletAnalysisData = {
        walletAddress: address,
        chainId: effectiveChainId || 0,
        timestamp: Date.now(),
        gmonBalance: formatUnits(gmonBalance, gmonDecimals),
        pgmonBalance: formatUnits(pgmonBalance, 8), // pgMON has 8 decimals
        gmonBorrowBalance: formatUnits(borrowBalance, gmonDecimals),
        isInGmonMarket,
        collateralFactor: formatUnits(gmonMarketInfo[1], 18),
        // Exchange rate removed - using direct underlying balance instead
        gmonPrice: formatUnits(gmonPrice, 18),
        totalMarkets: validMarkets.length,
        marketDetails: validMarkets,
        totalCollateralValue: totalCollateralValue.toString(),
        totalBorrowValue: totalBorrowValue.toString(),
        availableCollateral: availableCollateral.toString(),
        accountLiquidity: formatUnits(accountLiquidity[0], 18),
        accountShortfall: formatUnits(accountLiquidity[1], 18),
        healthFactor,
        canWithdraw,
        maxWithdrawable: maxWithdrawableGmon.toString(),
        maxWithdrawableUsd: maxWithdrawableUsd.toString(),
        safeWithdrawalPercentage: safeWithdrawalPercentage.toString(),
        safeWithdrawalGmon: safeWithdrawalGmon.toString(),
        safeWithdrawalUsd: (safeWithdrawalGmon * gmonPriceNum).toString(),
        withdrawalBlockers,
        withdrawalReason,
        marketPaused: gmonMarketInfo[2],
        totalSupply: formatUnits(totalSupply, 8), // pgMON has 8 decimals
        totalBorrows: formatUnits(totalBorrows, gmonDecimals),
        availableLiquidity: formatUnits(cash, gmonDecimals),
        recommendations,
        severity
      }

      // Cache the results
      cacheData(normalizedAddress, analysisData)

      setData(analysisData)
      setError(null)

      updateStep({
        id: 'final-analysis',
        name: 'Final Analysis',
        status: 'success',
        message: `Analysis complete: ${severity.toUpperCase()}`,
        data: analysisData,
        timestamp: Date.now()
      })

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred'
      setError(errorMessage)
      
      // Update the last step with error
      const lastStep = stepRef.current[stepRef.current.length - 1]
      if (lastStep) {
        updateStep({
          ...lastStep,
          status: 'error',
          error: errorMessage,
          timestamp: Date.now()
        })
      }
    } finally {
      setIsLoading(false)
      inflightRequests.delete(normalizedAddress)
    }
  }, [publicClient, controllerAddress, gmonTokenAddress, gmonPTokenAddress, effectiveChainId, updateStep, getCachedData, cacheData, delay, retryContractCall])

  const clearAnalysis = useCallback(() => {
    setData(null)
    setError(null)
    setSteps([])
    stepRef.current = []
  }, [])

  return {
    data,
    isLoading,
    error,
    steps,
    analyzeWallet,
    clearAnalysis
  }
}

import { useAccount, useReadContract, useReadContracts } from 'wagmi'
import { getAssetContractAddresses, getAssetById } from '@/data/market-data'
import combinedAbi from '@/app/abis/combinedAbi.json'
import jumpRateModelAbi from '@/app/abis/Jumpratemodel.json'
import pTokenAbi from '@/app/abis/pdtptokenABI.json'
import comptrollerAbi from '@/app/abis/comptrollerAbi.json'
import { useQuery } from '@tanstack/react-query'
import { createPublicClient, http, defineChain } from 'viem'
import { monadTestnetContracts, getChainConfig, bscTestnetContracts, CHAIN_IDS } from '@/config/contracts'
import { useNetworkContext, NetworkContext } from '@/context'
import { useContext } from 'react'
import React from 'react'
import { useActiveWallet } from '@/hooks/use-active-wallet'

// Define the Monad testnet chain object for viem
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

// Define the BSC testnet chain object for viem
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

// Helper function to get decimals from contract configuration
function getAssetDecimals(assetId: string, chainId: number): number | undefined {
  const chainConfig = getChainConfig(chainId)
  if (!chainConfig || !("markets" in chainConfig)) {
    return undefined
  }

  const markets = chainConfig.markets as any

  // Map asset IDs to market keys (same mapping as in getAssetContractAddresses)
  const assetToMarketKey: { [key: string]: string } = {
    pusd: "PUSD",
    usdc: "USDC", 
    usdt: "USDT",
    link: "LINK",
    peridot: "PDT",
    monad: "WMON",
    weth: "WETH",
    wbtc: "WBTC",
    rusdc: "rUSDC",
  }

  const marketKey = assetToMarketKey[assetId]
  if (marketKey && markets[marketKey] && markets[marketKey].decimals !== undefined) {
    return markets[marketKey].decimals
  }

  return undefined
}

interface UseApyProps {
  assetId: string
  // Optional manual override for which chain to read contracts from
  overrideChainId?: number
}

interface ApyData {
  supplyApy: number
  borrowApy: number
  peridotSupplyApy: number
  peridotBorrowApy: number
  totalSupplyApy: number
  netBorrowApy: number
  supplyRatePerBlock?: bigint
  borrowRatePerBlock?: bigint
  isLoading: boolean
  error: Error | null
  formattedSupplyApy: string
  formattedBorrowApy: string
}

// Blocks per year for different networks
const getBlocksPerYear = (chainId: number): number => {
  switch (chainId) {
    case 1: // Ethereum mainnet
      return 2_102_400 // ~15 second blocks
    case 97: // BSC testnet  
      return 10_512_000 // ~3 second blocks
    case 56: // BSC mainnet
      return 42_048_000 // ~3 second blocks
    case 10143: // Monad testnet
      return 63_072_000 // ~0.5 second blocks
    case 50312: // Somnia Testnet
      return 63_072_000 // ~0.5 second blocks (same as Monad)
    default:
      return 2_102_400 // Default to Ethereum blocks
  }
}

export function useApy({ assetId, overrideChainId }: UseApyProps): ApyData {
  const { isConnected, chainId: walletChainId } = useActiveWallet()
  
  // Safely get network context - use useContext directly to avoid throwing if context not ready
  // This handles the case where ContextProvider is dynamically loaded and might not be ready yet
  const networkContext = useContext(NetworkContext)
  
  // Provide defaults if context is not available (e.g., during SSR or before ContextProvider mounts)
  const selectedNetworkId = networkContext?.selectedNetworkId ?? 'bnb'
  const getChainIdFromNetworkId = networkContext?.getChainIdFromNetworkId ?? (() => {
    // Default mapping for common network IDs
    const networkIdToChainId: Record<string, number> = {
      'bnb': 56,
      'monad': 10143,
      'arbitrum': 42161,
    }
    return networkIdToChainId[selectedNetworkId]
  })
  
  // Use wallet chainId if connected, otherwise fallback to UI network selection
  const currentChainId = overrideChainId ?? (walletChainId || getChainIdFromNetworkId(selectedNetworkId))

  // Memoize the public client creation to avoid re-renders and type unions
  const publicClient = React.useMemo(() => {
    if (isConnected || !currentChainId) return undefined
    
    if (currentChainId === monadTestnet.id) {
      return createPublicClient({ chain: monadTestnet, transport: http() })
    }
    if (currentChainId === bscTestnet.id) {
      return createPublicClient({ chain: bscTestnet, transport: http() })
    }
    return undefined
  }, [currentChainId, isConnected])
  
  const chainConfig = currentChainId ? getChainConfig(currentChainId) : null
  const contractAddresses = currentChainId ? getAssetContractAddresses(assetId, currentChainId) : null
  // Get full asset info
  const underlyingDecimals = currentChainId ? getAssetDecimals(assetId, currentChainId) : undefined // Get decimals from contract config

  const comptrollerAddress = chainConfig && 'unitrollerProxy' in chainConfig ? chainConfig.unitrollerProxy as `0x${string}`: undefined
  const oracleAddress = chainConfig && "oracle" in chainConfig ? chainConfig.oracle as `0x${string}` : undefined
  const pPeridotAddress = chainConfig && "markets" in chainConfig && chainConfig.markets && "PDT" in chainConfig.markets ? chainConfig.markets.PDT.pToken as `0x${string}` : undefined
  
  // Step 1: Get basic token data from pToken (matching script logic)
  const pTokenContract = {
    address: contractAddresses?.pTokenAddress as `0x${string}`,
    abi: pTokenAbi,
  };

  const { data: pTokenResults } = useReadContracts<{ result: unknown }[]>({
    contracts: ([
      { ...pTokenContract, functionName: 'totalBorrows', args: [], chainId: currentChainId as any },
      { ...pTokenContract, functionName: 'reserveFactorMantissa', args: [], chainId: currentChainId as any },
      { ...pTokenContract, functionName: 'interestRateModel', args: [], chainId: currentChainId as any },
      { ...pTokenContract, functionName: 'totalSupply', args: [], chainId: currentChainId as any },
      { ...pTokenContract, functionName: 'exchangeRateStored', args: [], chainId: currentChainId as any },
    ] as any),
    query: {
      enabled: isConnected && !!contractAddresses?.pTokenAddress,
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  });

  const [
    totalBorrows,
    reserveFactorMantissa,
    interestRateModelAddress,
    totalSupply,
    exchangeRateStored,
  ] = React.useMemo(() => {
    return pTokenResults?.map(r => r.result) ?? [];
  }, [pTokenResults]);
  
  // Step 2: Call interest rate model with EXACT same parameters as script
  // Script calls: interestRateModel.getBorrowRate(0, vars.totalBorrows, 0)
  const { 
    data: wagmiBorrowRate, 
    isLoading: isWagmiBorrowLoading, 
    error: wagmiBorrowError 
  } = useReadContract({
    address: interestRateModelAddress as `0x${string}`,
    abi: jumpRateModelAbi,
    functionName: 'getBorrowRate',
    args: [BigInt(0), totalBorrows || BigInt(0), BigInt(0)], // cash=0, totalBorrows, reserves=0 (exactly like script)
    chainId: currentChainId as any,
    query: {
      enabled: isConnected && !!interestRateModelAddress && totalBorrows !== undefined,
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    }
  })

  // Script calls: interestRateModel.getSupplyRate(0, vars.totalBorrows, 0, pToken.reserveFactorMantissa())
  const { 
    data: wagmiSupplyRate, 
    isLoading: isWagmiSupplyLoading, 
    error: wagmiSupplyError 
  } = useReadContract({
    address: interestRateModelAddress as `0x${string}`,
    abi: jumpRateModelAbi,
    functionName: 'getSupplyRate',
    args: [BigInt(0), totalBorrows || BigInt(0), BigInt(0), reserveFactorMantissa || BigInt(0)], // cash=0, totalBorrows, reserves=0, reserveFactor
    chainId: currentChainId as any,
    query: {
      enabled: isConnected && !!interestRateModelAddress && totalBorrows !== undefined && reserveFactorMantissa !== undefined,
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    }
  })

  const { data: underlyingPrice } = useReadContract({
    address: oracleAddress,
    abi: combinedAbi, // The getUnderlyingPrice is in combinedAbi
    functionName: 'getUnderlyingPrice',
    args: [contractAddresses?.pTokenAddress],
    chainId: currentChainId as any,
    query: {
      enabled: isConnected && !!oracleAddress && !!contractAddresses?.pTokenAddress,
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  })

  const { data: peridotPrice } = useReadContract({
    address: oracleAddress,
    abi: combinedAbi,
    functionName: 'getUnderlyingPrice',
    args: [pPeridotAddress],
    chainId: currentChainId as any,
    query: {
      enabled: isConnected && !!oracleAddress && !!pPeridotAddress,
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  })

  const { data: peridotSpeed } = useReadContract({
    address: comptrollerAddress,
    abi: comptrollerAbi,
    functionName: 'peridotSpeeds',
    args: [contractAddresses?.pTokenAddress],
    chainId: currentChainId as any,
    query: {
      enabled: isConnected && !!comptrollerAddress && !!contractAddresses?.pTokenAddress,
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  })
  
  // Public client version for non-connected users
  const {
    data: publicBorrowRate,
    isLoading: isPublicBorrowLoading,
    error: publicBorrowError,
  } = useQuery<bigint>({
    queryKey: ['borrowRate', assetId, currentChainId, totalBorrows?.toString()],
    queryFn: async (): Promise<bigint> => {
      if (!contractAddresses?.pTokenAddress || !publicClient) {
        throw new Error('pTokenAddress or publicClient not available for public query')
      }
      
      // Get interest rate model address
      const interestModelAddr = await publicClient.readContract({
        address: contractAddresses.pTokenAddress as `0x${string}`,
        abi: pTokenAbi,
        functionName: 'interestRateModel',
        args: [],
      })
      
      // Get total borrows
      const borrows = await publicClient.readContract({
        address: contractAddresses.pTokenAddress as `0x${string}`,
        abi: pTokenAbi,
        functionName: 'totalBorrows',
        args: [],
      })

      return publicClient.readContract({
        address: interestModelAddr as `0x${string}`,
        abi: jumpRateModelAbi,
        functionName: 'getBorrowRate',
        args: [BigInt(0), borrows || BigInt(0), BigInt(0)],
      }) as Promise<bigint>
    },
    enabled: !isConnected && !!contractAddresses?.pTokenAddress && !!publicClient,
    staleTime: 5 * 60 * 1000,
  })
  
  const {
    data: publicSupplyRate,
    isLoading: isPublicSupplyLoading,
    error: publicSupplyError,
  } = useQuery<bigint>({
    queryKey: ['supplyRate', assetId, currentChainId, totalBorrows?.toString(), reserveFactorMantissa?.toString()],
    queryFn: async (): Promise<bigint> => {
      if (!contractAddresses?.pTokenAddress || !publicClient) {
        throw new Error('pTokenAddress or publicClient not available for public query')
      }

      const interestModelAddr = await publicClient.readContract({
        address: contractAddresses.pTokenAddress as `0x${string}`,
        abi: pTokenAbi,
        functionName: 'interestRateModel',
        args: [],
      })
      const borrows = await publicClient.readContract({
        address: contractAddresses.pTokenAddress as `0x${string}`,
        abi: pTokenAbi,
        functionName: 'totalBorrows',
        args: [],
      })
      const reserveFactor = await publicClient.readContract({
        address: contractAddresses.pTokenAddress as `0x${string}`,
        abi: pTokenAbi,
        functionName: 'reserveFactorMantissa',
        args: [],
      })

      return publicClient.readContract({
        address: interestModelAddr as `0x${string}`,
        abi: jumpRateModelAbi,
        functionName: 'getSupplyRate',
        args: [BigInt(0), borrows || BigInt(0), BigInt(0), reserveFactor || BigInt(0)],
      }) as Promise<bigint>
    },
    enabled: !isConnected && !!contractAddresses?.pTokenAddress && !!publicClient,
    staleTime: 5 * 60 * 1000,
  })

  // Use wagmi data if connected, otherwise use public client data
  const borrowRatePerBlock = isConnected ? wagmiBorrowRate : publicBorrowRate
  const supplyRatePerBlock = isConnected ? wagmiSupplyRate : publicSupplyRate

  // Determine loading state
  const isLoading = isConnected 
    ? isWagmiSupplyLoading || isWagmiBorrowLoading 
    : isPublicSupplyLoading || isPublicBorrowLoading

  const error = isConnected ? (wagmiSupplyError || wagmiBorrowError) : (publicSupplyError || publicBorrowError)
  
  // Step 3: Get Peridot rewards data from Comptroller - REMOVED, as peridotSpeed is used directly
  // const { data: peridotSupplyRateData, isLoading: isPeridotSupplyRateLoading } = useReadContract({
  //   address: comptrollerAddress,
  //   abi: comptrollerAbi,
  //   functionName: 'peridotSupplySpeeds',
  //   args: [contractAddresses?.pTokenAddress],
  //   query: {
  //     enabled: !!comptrollerAddress && !!contractAddresses?.pTokenAddress,
  //   },
  // })

  // const { data: peridotBorrowRateData, isLoading: isPeridotBorrowRateLoading } = useReadContract({
  //   address: comptrollerAddress,
  //   abi: comptrollerAbi,
  //   functionName: 'peridotBorrowSpeeds',
  //   args: [contractAddresses?.pTokenAddress],
  //   query: {
  //     enabled: !!comptrollerAddress && !!contractAddresses?.pTokenAddress,
  //   },
  // })

  // Calculate APY using EXACT same formula as script
  // Script formula: (vars.supplyRatePerBlock * BLOCKS_PER_YEAR * 100) / MANTISSA;
  // Note: Script stores APY in basis points, then divides by 100 for display (see formatPercent function)
  const calculateApy = (ratePerBlock: bigint | undefined): number => {
    if (!ratePerBlock || !currentChainId) {
      return 0
    }
    
    try {
      const blocksPerYear = getBlocksPerYear(currentChainId)
      
      // EXACT formula from script: (ratePerBlock * BLOCKS_PER_YEAR * 100) / MANTISSA
      // where MANTISSA = 1e18 and BLOCKS_PER_YEAR = 63_072_000
      const MANTISSA = 1e18
      const apyBasisPoints = (Number(ratePerBlock) * blocksPerYear * 100) / MANTISSA
      
      // Script divides by 100 in formatPercent function to convert basis points to percentage
      const apyPercentage = apyBasisPoints / 100
      
      return Math.max(0, apyPercentage) // Ensure non-negative
    } catch (e) {
      console.error("Error calculating APY:", e)
      return 0
    }
  }

  const supplyApy = calculateApy(supplyRatePerBlock as bigint | undefined)
  const borrowApy = calculateApy(borrowRatePerBlock as bigint | undefined)
  
  const formattedSupplyApy = `${(supplyApy * 100).toFixed(2)}%`
  const formattedBorrowApy = `${(borrowApy * 100).toFixed(2)}%`
  
  // Calculate Peridot rewards APY
  let peridotSupplyApy = 0;
  let peridotBorrowApy = 0;


  if (currentChainId && peridotSpeed && Number(peridotSpeed) > 0) {
    const blocksPerYear = getBlocksPerYear(currentChainId);
    const MANTISSA = 1e18;


    // Calculate PERIDOT Supply APY
    if (totalSupply && exchangeRateStored && underlyingPrice && peridotPrice && underlyingDecimals) {
      // Script formula: totalSupplyValue = (totalSupply * exchangeRate * underlyingPrice) / (MANTISSA * MANTISSA)
      const P_TOKEN_DECIMALS = 8;
      const totalSupplyValue = (Number(totalSupply) * Number(exchangeRateStored) * Number(underlyingPrice)) / ((10 ** P_TOKEN_DECIMALS) * MANTISSA * MANTISSA);

      if (totalSupplyValue > 0) {
        // Script formula: peridotSupplyAPY = (peridotSpeed * blocksPerYear * peridotPrice * 100) / (totalSupplyValue * MANTISSA)
        const peridotSupplyApyRaw = (Number(peridotSpeed) * blocksPerYear * Number(peridotPrice) * 100) / (totalSupplyValue * MANTISSA);
        
        // Script divides by 100 in formatPercent function to convert basis points to percentage
        peridotSupplyApy = peridotSupplyApyRaw / 100;
        

      }
    }

    // Calculate PERIDOT Borrow APY
    if (totalBorrows && Number(totalBorrows) > 0 && underlyingPrice && peridotPrice && underlyingDecimals) {
      // Script formula: totalBorrowValue = (totalBorrows * underlyingPrice) / MANTISSA
      const totalBorrowValue = (Number(totalBorrows) * Number(underlyingPrice)) / MANTISSA;

      if (totalBorrowValue > 0) {
        // Script formula: peridotBorrowAPY = (peridotSpeed * blocksPerYear * peridotPrice * 100) / (totalBorrowValue * MANTISSA)
        const peridotBorrowApyRaw = (Number(peridotSpeed) * blocksPerYear * Number(peridotPrice) * 100) / (totalBorrowValue * MANTISSA);
        
        // Script divides by 100 in formatPercent function to convert basis points to percentage
        peridotBorrowApy = peridotBorrowApyRaw / 100;

      }
    }
  }

  
  const totalSupplyApy = supplyApy + peridotSupplyApy;
  // Match Solidity script: Net Borrow APY = base borrow APY - PERIDOT borrow rewards
  const netBorrowApy = borrowApy - peridotBorrowApy;

  return {
    supplyApy,
    borrowApy,
    peridotSupplyApy,
    peridotBorrowApy,
    totalSupplyApy,
    netBorrowApy,
    supplyRatePerBlock: supplyRatePerBlock as bigint | undefined,
    borrowRatePerBlock: borrowRatePerBlock as bigint | undefined,
    isLoading,
    error: error as Error | null,
    formattedSupplyApy,
    formattedBorrowApy,
  }
} 
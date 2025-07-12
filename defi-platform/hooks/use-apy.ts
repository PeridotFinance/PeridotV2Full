import { useAccount, useReadContract } from 'wagmi'
import { getAssetContractAddresses } from '@/data/market-data'
import combinedAbi from '@/app/abis/combinedAbi.json'
import { useQuery } from '@tanstack/react-query'
import { createPublicClient, http, defineChain } from 'viem'
import { monadTestnetContracts } from '@/config/contracts'

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

// Create a public client for non-connected reads
const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(),
})

interface UseApyProps {
  assetId: string
}

interface ApyData {
  supplyApy: number
  borrowApy: number
  supplyRatePerBlock: bigint | undefined
  borrowRatePerBlock: bigint | undefined
  isLoading: boolean
  error: Error | null
}

// Blocks per year for different networks
const getBlocksPerYear = (chainId: number): number => {
  switch (chainId) {
    case 1: // Ethereum mainnet
      return 2_102_400 // ~15 second blocks
    case 97: // BSC testnet  
      return 10_512_000 // ~3 second blocks
    case 56: // BSC mainnet
      return 10_512_000 // ~3 second blocks
    case 10143: // Monad testnet
      return 2_102_400 // Assuming similar to Ethereum for now
    default:
      return 2_102_400 // Default to Ethereum blocks
  }
}

export function useApy({ assetId }: UseApyProps): ApyData {
  const { chainId, isConnected } = useAccount()
  
  const currentChainId = isConnected ? chainId : monadTestnet.id

  // Get contract addresses for the asset
  const contractAddresses = currentChainId ? getAssetContractAddresses(assetId, currentChainId) : null
  
  // Use wagmi's useReadContract when connected
  const { 
    data: wagmiSupplyRate, 
    isLoading: isWagmiSupplyLoading, 
    error: wagmiSupplyError 
  } = useReadContract({
    address: contractAddresses?.pTokenAddress as `0x${string}`,
    abi: combinedAbi,
    functionName: 'supplyRatePerBlock',
    args: [],
    query: {
      enabled: isConnected && !!contractAddresses?.pTokenAddress,
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
    }
  })

  const { 
    data: wagmiBorrowRate, 
    isLoading: isWagmiBorrowLoading, 
    error: wagmiBorrowError 
  } = useReadContract({
    address: contractAddresses?.pTokenAddress as `0x${string}`,
    abi: combinedAbi,
    functionName: 'borrowRatePerBlock',
    args: [],
    query: {
      enabled: isConnected && !!contractAddresses?.pTokenAddress,
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
    }
  })
  
  // Use public client with react-query when not connected
  const {
    data: publicSupplyRate,
    isLoading: isPublicSupplyLoading,
    error: publicSupplyError,
  } = useQuery({
    queryKey: ['supplyRate', assetId, monadTestnet.id],
    queryFn: () => {
      if (!contractAddresses?.pTokenAddress) {
        throw new Error('pTokenAddress not available for public query')
      }
      return publicClient.readContract({
        address: contractAddresses.pTokenAddress as `0x${string}`,
        abi: combinedAbi,
        functionName: 'supplyRatePerBlock',
        args: [],
      })
    },
    enabled: !isConnected && !!contractAddresses?.pTokenAddress,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })
  
  const {
    data: publicBorrowRate,
    isLoading: isPublicBorrowLoading,
    error: publicBorrowError,
  } = useQuery({
    queryKey: ['borrowRate', assetId, monadTestnet.id],
    queryFn: () => {
      if (!contractAddresses?.pTokenAddress) {
        throw new Error('pTokenAddress not available for public query')
      }
      return publicClient.readContract({
        address: contractAddresses.pTokenAddress as `0x${string}`,
        abi: combinedAbi,
        functionName: 'borrowRatePerBlock',
        args: [],
      })
    },
    enabled: !isConnected && !!contractAddresses?.pTokenAddress,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })

  const supplyRatePerBlock = isConnected ? wagmiSupplyRate : publicSupplyRate
  const borrowRatePerBlock = isConnected ? wagmiBorrowRate : publicBorrowRate

  // Calculate APY from rates
  const calculateApy = (ratePerBlock: bigint | undefined): number => {
    if (!ratePerBlock || !currentChainId) return 0
    
    try {
      const blocksPerYear = getBlocksPerYear(currentChainId)
      
      // Convert from wei to decimal
      const ratePerBlockDecimal = Number(ratePerBlock) / 1e18
      
      // Calculate APY: (1 + ratePerBlock * blocksPerYear) - 1
      // For small rates, this approximates to: ratePerBlock * blocksPerYear
      const apy = ratePerBlockDecimal * blocksPerYear * 100 // Convert to percentage
      
      return Math.max(0, apy) // Ensure non-negative
    } catch (error) {
      console.error('Error calculating APY:', error)
      return 0
    }
  }

  const supplyApy = calculateApy(supplyRatePerBlock as bigint)
  const borrowApy = calculateApy(borrowRatePerBlock as bigint)

  const isLoading = isConnected 
    ? isWagmiSupplyLoading || isWagmiBorrowLoading 
    : isPublicSupplyLoading || isPublicBorrowLoading;
  
  const error = isConnected
    ? wagmiSupplyError || wagmiBorrowError
    : publicSupplyError || publicBorrowError;

  return {
    supplyApy,
    borrowApy,
    supplyRatePerBlock: supplyRatePerBlock as bigint,
    borrowRatePerBlock: borrowRatePerBlock as bigint,
    isLoading,
    error: error ? (error as Error) : null,
  }
} 
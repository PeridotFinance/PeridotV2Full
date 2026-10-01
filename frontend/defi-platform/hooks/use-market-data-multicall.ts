import { useReadContracts } from 'wagmi'
import { getOracleAddress } from '@/config/contracts'
import { getAssetContractAddresses } from '@/data/market-data'
import combinedAbi from '@/app/abis/combinedAbi.json'
import peridotTrollerABI from '@/app/abis/peridottrollerABI.json'

interface UseMarketDataMulticallProps {
  assetId: string
  chainId?: number
  effectiveReadChainId?: number
  controllerAddress?: string
  isConnected: boolean
  enabled?: boolean
}

export function useMarketDataMulticall({
  assetId,
  chainId,
  effectiveReadChainId,
  controllerAddress,
  isConnected,
  enabled = true
}: UseMarketDataMulticallProps) {
  // Resolve addresses
  const addresses = effectiveReadChainId ? getAssetContractAddresses(assetId, effectiveReadChainId) : null
  const oracleAddress = effectiveReadChainId ? getOracleAddress(effectiveReadChainId) : (chainId ? getOracleAddress(chainId) : null)
  
  const pTokenAddress = addresses?.pTokenAddress as `0x${string}` | undefined
  const isReady = !!(pTokenAddress && controllerAddress && oracleAddress && isConnected && enabled)

  const { data, refetch, isLoading, error } = useReadContracts({
    contracts: [
      // 0. Borrow Caps
      {
        address: controllerAddress as `0x${string}`,
        abi: peridotTrollerABI,
        functionName: 'borrowCaps',
        args: [pTokenAddress!],
        chainId: effectiveReadChainId,
      },
      // 1. Oracle Price (Underlying)
      {
        address: oracleAddress as `0x${string}`,
        abi: combinedAbi,
        functionName: 'getUnderlyingPrice',
        args: [pTokenAddress!],
        chainId: effectiveReadChainId,
      },
      // 2. Liquidation Incentive
      {
        address: controllerAddress as `0x${string}`,
        abi: combinedAbi,
        functionName: 'liquidationIncentiveMantissa',
        chainId: effectiveReadChainId,
      },
      // 3. Total Borrows
      {
        address: pTokenAddress,
        abi: combinedAbi,
        functionName: 'totalBorrows',
        chainId: effectiveReadChainId,
      },
      // 4. Cash
      {
        address: pTokenAddress,
        abi: combinedAbi,
        functionName: 'getCash',
        chainId: effectiveReadChainId,
      },
      // 5. Total Reserves
      {
        address: pTokenAddress,
        abi: combinedAbi,
        functionName: 'totalReserves',
        chainId: effectiveReadChainId,
      }
    ],
    query: {
      enabled: isReady,
      staleTime: 10000, // Cache for 10s to prevent rapid refetches
    }
  })

  return {
    data: {
      borrowCap: data?.[0]?.result as bigint | undefined,
      oraclePrice: data?.[1]?.result as bigint | undefined,
      liquidationIncentiveMantissa: data?.[2]?.result as bigint | undefined,
      totalBorrows: data?.[3]?.result as bigint | undefined,
      cash: data?.[4]?.result as bigint | undefined,
      totalReserves: data?.[5]?.result as bigint | undefined,
    },
    isLoading,
    error,
    refetch
  }
}


import { useAccount, useReadContract } from 'wagmi'
import { getAssetContractAddresses } from '@/data/market-data'
import { getChainConfig } from '@/config/contracts'
import combinedAbi from '@/app/abis/combinedAbi.json'

interface UseMarketMembershipProps {
  assetId: string
}

export function useMarketMembership({ assetId }: UseMarketMembershipProps) {
  const { address, chainId } = useAccount()
  
  // Get contract addresses for the asset
  const contractAddresses = chainId ? getAssetContractAddresses(assetId, chainId) : null
  
  // Get chain config for controller address
  const chainConfig = chainId ? getChainConfig(chainId) : null
  const controllerAddress = chainConfig && 'unitrollerProxy' in chainConfig ? chainConfig.unitrollerProxy : null

  // Check if user has entered this market (enabled as collateral)
  const { 
    data: isCollateralEnabled, 
    isLoading, 
    error,
    refetch 
  } = useReadContract({
    address: controllerAddress as `0x${string}`,
    abi: combinedAbi,
    functionName: 'checkMembership',
    args: [address!, contractAddresses?.pTokenAddress!],
    query: {
      enabled: !!controllerAddress && !!address && !!contractAddresses?.pTokenAddress,
      refetchInterval: 30000, // Reduced from 10s to 30s
    }
  })

  // Get all assets user has entered (for overview)
  const { 
    data: assetsIn,
    isLoading: isAssetsInLoading,
    refetch: refetchAssetsIn
  } = useReadContract({
    address: controllerAddress as `0x${string}`,
    abi: combinedAbi,
    functionName: 'getAssetsIn',
    args: [address!],
    query: {
      enabled: !!controllerAddress && !!address,
      refetchInterval: 30000,
    }
  })

  return {
    isCollateralEnabled: Boolean(isCollateralEnabled),
    assetsIn: (assetsIn as string[]) || [],
    isLoading,
    isAssetsInLoading,
    error,
    refetch,
    refetchAssetsIn,
    contractAddresses,
    controllerAddress,
  }
}

// Hook to get all market memberships for the user
export function useAllMarketMemberships() {
  const { address, chainId } = useAccount()
  
  // Get chain config for controller address
  const chainConfig = chainId ? getChainConfig(chainId) : null
  const controllerAddress = chainConfig && 'unitrollerProxy' in chainConfig ? chainConfig.unitrollerProxy : null

  // Get all assets user has entered (enabled as collateral)
  const { 
    data: assetsIn,
    isLoading,
    error,
    refetch
  } = useReadContract({
    address: controllerAddress as `0x${string}`,
    abi: combinedAbi,
    functionName: 'getAssetsIn',
    args: [address!],
    query: {
      enabled: !!controllerAddress && !!address,
      refetchInterval: 30000,
    }
  })

  return {
    assetsIn: (assetsIn as string[]) || [],
    isLoading,
    error,
    refetch,
    controllerAddress,
    hasCollateralAssets: (assetsIn as string[] || []).length > 0,
  }
} 
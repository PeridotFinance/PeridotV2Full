import { useAccount, useReadContract } from 'wagmi'
import { erc20Abi, formatUnits } from 'viem'
import { getAssetContractAddresses } from '@/data/market-data'
import combinedAbi from '@/app/abis/combinedAbi.json'

interface UsePTokenBalanceProps {
  assetId: string
}

export function usePTokenBalance({ assetId }: UsePTokenBalanceProps) {
  const { address, chainId } = useAccount()
  
  // Get contract addresses for the asset
  const contractAddresses = chainId ? getAssetContractAddresses(assetId, chainId) : null
  
  // Read raw pToken balance 
  const { 
    data: pTokenBalance, 
    isLoading, 
    error,
    refetch: refetchPTokenBalance
  } = useReadContract({
    address: contractAddresses?.pTokenAddress as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address!],
    query: {
      enabled: !!contractAddresses?.pTokenAddress && !!address,
      refetchInterval: 30000, // Reduced from 5s to 30s
    }
  })

  // Fetch the balance in terms of the underlying asset directly
  const {
    data: underlyingBalance,
    refetch: refetchUnderlyingBalance
  } = useReadContract({
    address: contractAddresses?.pTokenAddress as `0x${string}`,
    abi: combinedAbi,
    functionName: 'balanceOfUnderlying',
    args: [address!],
    query: {
      enabled: !!contractAddresses?.pTokenAddress && !!address,
      refetchInterval: 30000,
    }
  })

  // Read pToken decimals (might be 8 instead of 18)
  const { 
    data: pTokenDecimals, 
  } = useReadContract({
    address: contractAddresses?.pTokenAddress as `0x${string}`,
    abi: erc20Abi,
    functionName: 'decimals',
    args: [],
    query: {
      enabled: !!contractAddresses?.pTokenAddress,
    }
  })

  // Read underlying token decimals
  const {
    data: underlyingDecimals,
  } = useReadContract({
    address: contractAddresses?.underlyingAddress as `0x${string}`,
    abi: erc20Abi,
    functionName: 'decimals',
    args: [],
    query: {
      enabled: !!contractAddresses?.underlyingAddress,
    }
  })

  const decimals = underlyingDecimals || 18 // Default to 18 if not available

  // Format the balance to a readable string
  const formatBalance = (balance: bigint | undefined, decimals: number | undefined): string => {
    if (!balance || decimals === undefined) return '0.00'
    
    const numericBalance = parseFloat(formatUnits(balance, decimals))
    
    if (numericBalance === 0) return '0.00'
    if (numericBalance < 0.01) {
      return parseFloat(numericBalance.toPrecision(4)).toString()
    }
    
    return numericBalance.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    })
  }
  
  const refetch = () => {
    refetchPTokenBalance()
    refetchUnderlyingBalance()
  }

  return {
    pTokenBalance: pTokenBalance as bigint | undefined,
    underlyingBalance: underlyingBalance as bigint | undefined,
    decimals: underlyingDecimals,
    pTokenDecimals: pTokenDecimals,
    formattedBalance: formatBalance(underlyingBalance as bigint, decimals),
    isLoading,
    error,
    refetch,
    hasBalance: underlyingBalance && (underlyingBalance as bigint) > BigInt(0),
    contractAddresses,
  }
} 
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
    data: rawPTokenBalance, 
    isLoading, 
    error,
    refetch 
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

  // Read exchange rate to normalize the display
  const { 
    data: exchangeRate, 
  } = useReadContract({
    address: contractAddresses?.pTokenAddress as `0x${string}`,
    abi: combinedAbi,
    functionName: 'exchangeRateStored',
    args: [],
    query: {
      enabled: !!contractAddresses?.pTokenAddress,
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

  // Calculate underlying balance from pToken balance and exchange rate
  // In Compound V2: underlyingBalance = pTokenBalance * exchangeRate / 1e18
  const calculateUnderlyingBalance = (): bigint => {
    if (!rawPTokenBalance || !exchangeRate) return BigInt(0)
    
    // Exchange rate is in mantissa form (scaled by 1e18)
    // In Compound V2: exchangeRateStored returns the current exchange rate as a mantissa (scaled by 1e18)
    // Formula: (pTokenBalance * exchangeRate) / 1e18
    // Note: This works regardless of pToken decimals because we're converting to underlying token amount
    return (rawPTokenBalance * BigInt(exchangeRate.toString())) / BigInt(10 ** 18)
  }

  const underlyingBalance = calculateUnderlyingBalance()
  const decimals = pTokenDecimals || 18 // Default to 18 if not available

  // Format the balance to a readable string
  const formatBalance = (balance: bigint | undefined, decimals: number = 18): string => {
    if (!balance) return '0.00'
    
    const formattedBalance = formatUnits(balance, decimals)
    const numericBalance = parseFloat(formattedBalance)
    
    if (numericBalance === 0) return '0.00'
    if (numericBalance < 0.01) return '< 0.01'
    
    return numericBalance.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    })
  }

  return {
    pTokenBalance: rawPTokenBalance,
    underlyingBalance: underlyingBalance,
    exchangeRate,
    decimals,
    formattedBalance: formatBalance(underlyingBalance),
    isLoading,
    error,
    refetch,
    hasBalance: underlyingBalance > BigInt(0),
    contractAddresses,
  }
} 
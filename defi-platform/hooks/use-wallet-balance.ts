import { useAccount, useReadContract } from 'wagmi'
import { erc20Abi, formatUnits } from 'viem'
import { getAssetContractAddresses } from '@/data/market-data'
import { useMemo } from 'react'

interface UseWalletBalanceProps {
  assetId: string
}

export function useWalletBalance({ assetId }: UseWalletBalanceProps) {
  const { address, chainId } = useAccount()
  
  // Get contract addresses for the asset
  const contractAddresses = chainId ? getAssetContractAddresses(assetId, chainId) : null
  
  // Read user's wallet balance of the underlying token
  const { 
    data: rawBalance, 
    isLoading, 
    error,
    refetch 
  } = useReadContract({
    address: contractAddresses?.underlyingAddress as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address!],
    query: {
      enabled: !!contractAddresses?.underlyingAddress && !!address,
      refetchInterval: 30000, // Refresh every 30 seconds
    }
  })

  // Read token decimals (usually 18 for most tokens)
  const { 
    data: tokenDecimals, 
  } = useReadContract({
    address: contractAddresses?.underlyingAddress as `0x${string}`,
    abi: erc20Abi,
    functionName: 'decimals',
    args: [],
    query: {
      enabled: !!contractAddresses?.underlyingAddress,
    }
  })

  const decimals = tokenDecimals || 18 // Default to 18 if not available

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

  // Get numeric balance for calculations
  const getNumericBalance = (): number => {
    if (!rawBalance) return 0
    const formattedBalance = formatUnits(rawBalance, decimals)
    return parseFloat(formattedBalance)
  }

  const formattedBalance = useMemo(() => {
    return formatBalance(rawBalance as bigint, decimals)
  }, [rawBalance, decimals])

  return {
    rawBalance,
    decimals,
    formattedBalance,
    numericBalance: getNumericBalance(),
    isLoading,
    error,
    refetch,
    hasBalance: (rawBalance as bigint || BigInt(0)) > BigInt(0),
    contractAddresses,
  }
} 
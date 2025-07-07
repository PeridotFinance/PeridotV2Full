import { useAccount, useReadContract } from 'wagmi'
import { formatUnits } from 'viem'
import { getAssetContractAddresses } from '@/data/market-data'
import combinedAbi from '@/app/abis/combinedAbi.json'

interface UseBorrowBalanceProps {
  assetId: string
}

export function useBorrowBalance({ assetId }: UseBorrowBalanceProps) {
  const { address, chainId } = useAccount()
  
  // Get contract addresses for the asset
  const contractAddresses = chainId ? getAssetContractAddresses(assetId, chainId) : null
  
  // Read borrow balance from pToken contract
  const { 
    data: borrowBalance, 
    isLoading, 
    error,
    refetch 
  } = useReadContract({
    address: contractAddresses?.pTokenAddress as `0x${string}`,
    abi: combinedAbi,
    functionName: 'borrowBalanceOf',
    args: [address!],
    query: {
      enabled: !!contractAddresses?.pTokenAddress && !!address,
      refetchInterval: 30000, // Reduced from 5s to 30s
    }
  })

  // Read current borrow rate for interest calculation
  const { 
    data: borrowRate, 
  } = useReadContract({
    address: contractAddresses?.pTokenAddress as `0x${string}`,
    abi: combinedAbi,
    functionName: 'borrowRatePerBlock',
    args: [],
    query: {
      enabled: !!contractAddresses?.pTokenAddress,
    }
  })

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
    borrowBalance,
    borrowRate,
    formattedBalance: formatBalance(borrowBalance as bigint),
    isLoading,
    error,
    refetch,
    hasBorrow: (borrowBalance as bigint || BigInt(0)) > BigInt(0),
    contractAddresses,
  }
} 
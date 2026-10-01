import { useState, useEffect, useMemo } from 'react'
import { useAccount, useReadContract, useReadContracts } from 'wagmi'
import { formatUnits, type Address } from 'viem'
import { getAssetContractAddresses } from '@/data/market-data'
import pTokenAbi from '@/app/abis/pTokenAbi.json'
import combinedAbi from '@/app/abis/combinedAbi.json'
import { useActiveWallet } from '@/hooks/use-active-wallet'

interface BoostedPositionValue {
  underlyingValue: number // Value in underlying asset (e.g., AUSD)
  usdValue: number // USD value
  pTokenBalance: number // User's pToken balance
  isLoading: boolean
  error: string | null
}

interface UseBoostedPositionProps {
  assetId: string
  chainId?: number
}

export function useBoostedPosition({ assetId, chainId = 143 }: UseBoostedPositionProps): BoostedPositionValue {
  const { address: userAddress } = useActiveWallet()
  const [underlyingValue, setUnderlyingValue] = useState<number>(0)
  const [usdValue, setUsdValue] = useState<number>(0)
  const [pTokenBalance, setPTokenBalance] = useState<number>(0)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const contractAddresses = useMemo(() =>
    chainId ? getAssetContractAddresses(assetId, chainId) : null,
    [assetId, chainId]
  )

  const pTokenAddress = contractAddresses?.pTokenAddress as Address

  // Check if this is a boosted asset
  const isBoosted = assetId.includes('morpho-boosted') || assetId.includes('pancake-boosted')
  const boostType = isBoosted ? (assetId.includes('morpho') ? 'morpho' : 'pancake') : null

  // Get pToken balance
  const { data: balanceData, isLoading: isBalanceLoading } = useReadContract({
    address: pTokenAddress,
    abi: pTokenAbi,
    functionName: 'balanceOf',
    args: userAddress ? [userAddress] : undefined,
    query: {
      enabled: !!userAddress && !!pTokenAddress && isBoosted,
      refetchInterval: 60000, // Reduced frequency to prevent RPC rate limits
    },
    chainId: chainId,
  })

  // Get exchange rate
  const { data: exchangeRateData, isLoading: isExchangeRateLoading } = useReadContract({
    address: pTokenAddress,
    abi: pTokenAbi,
    functionName: 'exchangeRateStored',
    query: {
      enabled: !!pTokenAddress && isBoosted,
      refetchInterval: 60000, // Refetch every minute
    },
    chainId: chainId,
  })

  // Get oracle price for USD conversion
  const { data: oraclePriceData } = useReadContract({
    address: contractAddresses?.oracleAddress as Address,
    abi: combinedAbi,
    functionName: 'getUnderlyingPrice',
    args: pTokenAddress ? [pTokenAddress] : undefined,
    query: {
      enabled: !!contractAddresses?.oracleAddress && !!pTokenAddress && isBoosted,
      refetchInterval: 60000,
    },
    chainId: chainId,
  })

  // For Pancake LP positions, we need additional vault data
  const vaultAddress = boostType === 'pancake' ? contractAddresses?.underlyingAddress as Address : undefined

  const pancakeVaultReads = useReadContracts({
    contracts: vaultAddress ? [
      {
        address: vaultAddress,
        abi: [
          { name: 'totalSupply', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
          { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
        ] as const,
        functionName: 'totalSupply',
        chainId: chainId,
      },
      {
        address: vaultAddress,
        abi: [
          { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
        ] as const,
        functionName: 'balanceOf',
        args: userAddress ? [userAddress] : undefined,
        chainId: chainId,
      }
    ] : [],
    query: {
      enabled: !!vaultAddress && !!userAddress && boostType === 'pancake',
      refetchInterval: 60000, // Reduced frequency to prevent RPC rate limits
    },
  })

  const [vaultTotalSupply, vaultUserBalance] = useMemo(() => {
    if (pancakeVaultReads.data && boostType === 'pancake') {
      return [
        pancakeVaultReads.data[0]?.result ? Number(pancakeVaultReads.data[0].result) : 0,
        pancakeVaultReads.data[1]?.result ? Number(pancakeVaultReads.data[1].result) : 0,
      ]
    }
    return [0, 0]
  }, [pancakeVaultReads.data, boostType])

  // Calculate position value
  useEffect(() => {
    if (!isBoosted || !userAddress) {
      setIsLoading(false)
      return
    }

    setIsLoading(isBalanceLoading || isExchangeRateLoading || pancakeVaultReads.isLoading)

    try {
      if (balanceData && exchangeRateData && oraclePriceData) {
        const balance = Number(balanceData)
        const exchangeRate = Number(exchangeRateData)
        const oraclePrice = Number(oraclePriceData)

        setPTokenBalance(balance / 1e18) // pTokens have 18 decimals

        let underlyingAmount = 0

        if (boostType === 'morpho') {
          // Morpho Boosted: Direct exchange rate calculation
          underlyingAmount = (balance * exchangeRate) / (1e18 * 1e18)
        } else if (boostType === 'pancake') {
          // Pancake LP Boosted: Need vault share conversion
          const vaultSharesValue = (balance * exchangeRate) / (1e18 * 1e18)

          if (vaultTotalSupply > 0 && vaultUserBalance > 0) {
            // Try to use vault total assets if available
            try {
              // For Pancake LP, the vault represents AUSD/USDC liquidity
              // This is simplified - in practice you'd need to get the actual vault assets
              underlyingAmount = vaultSharesValue * (vaultUserBalance / vaultTotalSupply)
            } catch (e) {
              console.warn('Could not calculate vault share value, using direct amount')
              underlyingAmount = vaultSharesValue
            }
          } else {
            // Fallback to direct vault shares value
            underlyingAmount = vaultSharesValue
          }
        }

        setUnderlyingValue(underlyingAmount)

        // Convert to USD using oracle price
        // oraclePrice is scaled by 1e18, underlyingAmount needs proper decimal handling
        const usdValueCalc = (underlyingAmount * oraclePrice) / 1e18
        setUsdValue(usdValueCalc)

        setError(null)
      }
    } catch (err) {
      console.error('Error calculating boosted position value:', err)
      setError('Failed to calculate position value')
    }
  }, [
    balanceData,
    exchangeRateData,
    oraclePriceData,
    vaultTotalSupply,
    vaultUserBalance,
    isBalanceLoading,
    isExchangeRateLoading,
    pancakeVaultReads.isLoading,
    boostType,
    isBoosted,
    userAddress
  ])

  return {
    underlyingValue,
    usdValue,
    pTokenBalance,
    isLoading,
    error
  }
}





import { useState, useEffect } from 'react'
import { useAccount, useReadContract } from 'wagmi'
import { formatUnits } from 'viem'
import { getMarketsForChain } from '@/data/market-data'
import { getChainConfig } from '@/config/contracts'
import { usePTokenBalance } from './use-ptoken-balance'
import { useBorrowBalance } from './use-borrow-balance'
import combinedAbi from '@/app/abis/combinedAbi.json'

interface CollateralAsset {
  assetId: string
  symbol: string
  suppliedBalance: number // underlying balance
  suppliedValueUSD: number
  collateralFactor: number // maxLTV / 100
  borrowingPowerUSD: number // suppliedValueUSD * collateralFactor
}

interface BorrowedAsset {
  assetId: string
  symbol: string
  borrowedBalance: number
  borrowedValueUSD: number
}

interface BorrowingPowerData {
  totalSuppliedUSD: number
  totalBorrowedUSD: number
  totalBorrowingPowerUSD: number
  availableBorrowingPowerUSD: number
  collateralUtilization: number // borrowed / borrowingPower * 100
  collateralAssets: CollateralAsset[]
  borrowedAssets: BorrowedAsset[]
  liquidationRisk: 'safe' | 'moderate' | 'high'
}

export function useBorrowingPower() {
  const { address, chainId } = useAccount()
  const [borrowingPower, setBorrowingPower] = useState<BorrowingPowerData>({
    totalSuppliedUSD: 0,
    totalBorrowedUSD: 0,
    totalBorrowingPowerUSD: 0,
    availableBorrowingPowerUSD: 0,
    collateralUtilization: 0,
    collateralAssets: [],
    borrowedAssets: [],
    liquidationRisk: 'safe',
  })
  const [isLoading, setIsLoading] = useState(false)

  // Get chain config for controller address
  const chainConfig = chainId ? getChainConfig(chainId) : null
  const controllerAddress = chainConfig && 'unitrollerProxy' in chainConfig ? chainConfig.unitrollerProxy : null

  // Enhanced debug logging
  console.log('🔍 Borrowing Power Debug Setup:', {
    address,
    chainId,
    controllerAddress,
    chainConfig: chainConfig ? Object.keys(chainConfig) : 'null',
  })

  // Get account liquidity from controller (for validation)
  const { data: accountLiquidity, refetch: refetchLiquidity, error: accountLiquidityError } = useReadContract({
    address: controllerAddress as `0x${string}`,
    abi: combinedAbi,
    functionName: 'getAccountLiquidity',
    args: [address!],
    query: {
      enabled: !!controllerAddress && !!address,
      refetchInterval: 30000, // Reduced from 10s to 30s
    }
  })

  // Also try to get the user's entered markets for debugging
  const { data: assetsIn, error: assetsInError } = useReadContract({
    address: controllerAddress as `0x${string}`,
    abi: combinedAbi,
    functionName: 'getAssetsIn',
    args: [address!],
    query: {
      enabled: !!controllerAddress && !!address,
      refetchInterval: 30000,
    }
  })

  // Get all assets for current chain
  const allAssets = chainId ? getMarketsForChain(chainId) : []
  const assetsWithSmartContracts = allAssets.filter(asset => asset.hasSmartContract)

  // Calculate borrowing power across all assets
  const calculateBorrowingPower = async () => {
    console.log('🚀 Calculate Borrowing Power Called:', {
      address,
      chainId,
      assetsWithSmartContracts: assetsWithSmartContracts.length,
      accountLiquidity,
      accountLiquidityError: accountLiquidityError?.message,
      assetsIn,
      assetsInError: assetsInError?.message,
    })

    if (!address || !chainId || assetsWithSmartContracts.length === 0) {
      console.log('❌ Early return - missing requirements')
      setBorrowingPower({
        totalSuppliedUSD: 0,
        totalBorrowedUSD: 0,
        totalBorrowingPowerUSD: 0,
        availableBorrowingPowerUSD: 0,
        collateralUtilization: 0,
        collateralAssets: [],
        borrowedAssets: [],
        liquidationRisk: 'safe',
      })
      return
    }

    setIsLoading(true)
    
    try {
      // Enhanced debug logging for account liquidity
      console.log('💰 Account Liquidity Raw Data:', {
        accountLiquidity,
        type: typeof accountLiquidity,
        isArray: Array.isArray(accountLiquidity),
        length: accountLiquidity ? (accountLiquidity as any).length : 'N/A',
        controllerAddress,
        userAddress: address,
      })
      
      // For now, use account liquidity as the primary source of truth
      // This is what the Compound protocol actually uses internally
      if (accountLiquidity) {
        const [error, liquidity, shortfall] = accountLiquidity as [bigint, bigint, bigint]
        
        console.log('📊 Account Liquidity Breakdown:', {
          error: error.toString(),
          liquidity: liquidity.toString(),
          shortfall: shortfall.toString(),
          liquidityFormatted: formatUnits(liquidity, 18),
          shortfallFormatted: formatUnits(shortfall, 18),
        })
        
        if (error === BigInt(0)) {
          // liquidity = amount available to borrow (in USD, scaled by 1e18)
          // shortfall = amount by which account is underwater (in USD, scaled by 1e18)
          const availableBorrowingPowerUSD = parseFloat(formatUnits(liquidity, 18))
          const shortfallUSD = parseFloat(formatUnits(shortfall, 18))
          
          // If there's no shortfall, user has positive borrowing power
          // If there's shortfall, user is underwater (borrowed too much)
          const totalBorrowedUSD = shortfallUSD // This represents how much over the limit
          const totalBorrowingPowerUSD = availableBorrowingPowerUSD + totalBorrowedUSD
          
          const collateralUtilization = totalBorrowingPowerUSD > 0 
            ? (totalBorrowedUSD / totalBorrowingPowerUSD) * 100 
            : 0
          
          const liquidationRisk = 
            shortfallUSD > 0 ? 'high' : 
            collateralUtilization > 80 ? 'moderate' : 
            'safe'
          
          setBorrowingPower({
            totalSuppliedUSD: 0, // We'll calculate this separately if needed
            totalBorrowedUSD,
            totalBorrowingPowerUSD,
            availableBorrowingPowerUSD,
            collateralUtilization,
            collateralAssets: [], // We'll populate this separately if needed
            borrowedAssets: [], // We'll populate this separately if needed
            liquidationRisk,
          })
          
          console.log('✅ Borrowing Power Final Result:', {
            liquidity: liquidity.toString(),
            shortfall: shortfall.toString(),
            availableBorrowingPowerUSD,
            shortfallUSD,
            totalBorrowingPowerUSD,
            collateralUtilization,
            assetsInCount: assetsIn ? (assetsIn as string[]).length : 0,
          })
        } else {
          console.error('❌ Account liquidity error from contract:', {
            error: error.toString(),
            errorAsNumber: Number(error),
            controllerAddress,
            userAddress: address,
          })
          setBorrowingPower({
            totalSuppliedUSD: 0,
            totalBorrowedUSD: 0,
            totalBorrowingPowerUSD: 0,
            availableBorrowingPowerUSD: 0,
            collateralUtilization: 0,
            collateralAssets: [],
            borrowedAssets: [],
            liquidationRisk: 'safe',
          })
        }
      } else {
        console.log('⚠️ No account liquidity data available:', {
          accountLiquidity,
          accountLiquidityError: accountLiquidityError?.message,
          controllerAddress,
          userAddress: address,
        })
      }
    } catch (error) {
      console.error('💥 Error calculating borrowing power:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Recalculate when account liquidity changes
  useEffect(() => {
    calculateBorrowingPower()
  }, [accountLiquidity, address, chainId])

  // Helper function to calculate how much of a specific asset can be borrowed
  const getMaxBorrowAmount = (assetId: string): number => {
    const asset = allAssets.find(a => a.id === assetId)
    if (!asset || !asset.oraclePrice) return 0
    
    // Convert available borrowing power to asset amount
    return borrowingPower.availableBorrowingPowerUSD / asset.oraclePrice
  }

  // Helper function to check if borrow amount is safe
  const isBorrowAmountSafe = (assetId: string, amount: number): boolean => {
    const asset = allAssets.find(a => a.id === assetId)
    if (!asset || !asset.oraclePrice) return false
    
    const borrowValueUSD = amount * asset.oraclePrice
    return borrowValueUSD <= borrowingPower.availableBorrowingPowerUSD
  }

  return {
    borrowingPower,
    isLoading,
    refetch: refetchLiquidity,
    getMaxBorrowAmount,
    isBorrowAmountSafe,
    accountLiquidity,
  }
}

// Hook to get individual asset borrowing power (call this for each asset)
export function useAssetBorrowingPower(assetId: string) {
  const { chainId } = useAccount()
  const allAssets = chainId ? getMarketsForChain(chainId) : []
  const asset = allAssets.find(a => a.id === assetId)
  
  // Get pToken balance for this asset
  const { 
    formattedBalance: suppliedBalance,
    underlyingBalance,
    isLoading: isBalanceLoading 
  } = usePTokenBalance({ assetId })
  
  // Get borrow balance for this asset
  const { 
    formattedBalance: borrowedBalance,
    borrowBalance,
    isLoading: isBorrowLoading 
  } = useBorrowBalance({ assetId })

  // Calculate asset-specific borrowing power
  const suppliedBalanceNumeric = parseFloat(suppliedBalance.replace(/[<,]/g, '')) || 0
  const borrowedBalanceNumeric = parseFloat(borrowedBalance.replace(/[<,]/g, '')) || 0
  
  const suppliedValueUSD = asset ? suppliedBalanceNumeric * asset.oraclePrice : 0
  const borrowedValueUSD = asset ? borrowedBalanceNumeric * asset.oraclePrice : 0
  const collateralFactor = asset ? asset.maxLTV / 100 : 0
  const borrowingPowerUSD = suppliedValueUSD * collateralFactor

  return {
    asset,
    suppliedBalance: suppliedBalanceNumeric,
    borrowedBalance: borrowedBalanceNumeric,
    suppliedValueUSD,
    borrowedValueUSD,
    borrowingPowerUSD,
    collateralFactor,
    isLoading: isBalanceLoading || isBorrowLoading,
    hasSupplied: suppliedBalanceNumeric > 0,
    hasBorrowed: borrowedBalanceNumeric > 0,
  }
} 
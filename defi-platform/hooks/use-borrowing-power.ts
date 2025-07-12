import { useState, useEffect, useMemo } from 'react'
import { useAccount, useReadContract, useReadContracts, type Config } from 'wagmi'
import { formatUnits, Abi } from 'viem'
import { getMarketsForChain, getAssetContractAddresses } from '@/data/market-data'
import { getChainConfig } from '@/config/contracts'
import { usePTokenBalance } from './use-ptoken-balance'
import { useBorrowBalance } from './use-borrow-balance'
import { decodeCompoundError } from '@/lib/compound-errors'
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

const minimalDecimalsAbi = [
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

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
  const [marketLiquidities, setMarketLiquidities] = useState<Record<string, number>>({})
  const [assetDecimals, setAssetDecimals] = useState<Record<string, number>>({})
  const [oraclePrices, setOraclePrices] = useState<Record<string, number>>({})

  // Get chain config for controller address
  const chainConfig = chainId ? getChainConfig(chainId) : null
  const controllerAddress = chainConfig && 'unitrollerProxy' in chainConfig ? chainConfig.unitrollerProxy : null



  // Get all assets for current chain
  const allAssets = useMemo(() => (chainId ? getMarketsForChain(chainId) : []), [chainId])
  const assetsWithSmartContracts = useMemo(() => allAssets.filter(asset => asset.hasSmartContract), [allAssets])

  // Prepare contracts for fetching decimals
  const decimalContracts = useMemo(() => {
    if (!chainId) return []
    return assetsWithSmartContracts.map(asset => {
      const addresses = getAssetContractAddresses(asset.id, chainId)
      return {
        assetId: asset.id,
        address: addresses?.underlyingAddress as `0x${string}`,
        abi: minimalDecimalsAbi,
        functionName: 'decimals',
      } as const
    }).filter(c => !!c.address)
  }, [chainId, assetsWithSmartContracts])

  // Fetch all decimals
  const decimalsContracts = decimalContracts.map(c => ({
    address: c.address,
    abi: c.abi,
    functionName: c.functionName,
  }))
  
  // @ts-ignore - Complex wagmi type inference issue
  const { data: decimalsData, isLoading: areDecimalsLoading } = useReadContracts({
    contracts: decimalsContracts as any,
    query: {
      enabled: decimalContracts.length > 0,
    }
  })

  // Process decimals data
  useEffect(() => {
    if (!decimalsData) return
    const newDecimals: Record<string, number> = {}
    decimalsData.forEach((result, index) => {
      const assetId = decimalContracts[index].assetId
      if (result.status === 'success') {
        newDecimals[assetId] = result.result as number
      } else {
        const staticDecimals = allAssets.find(a => a.id === assetId)?.decimals
        if (staticDecimals) {
          newDecimals[assetId] = staticDecimals
        }
      }
    })
    setAssetDecimals(newDecimals)
  }, [decimalsData, decimalContracts, allAssets])

  // Prepare contracts for fetching live oracle prices
  const knownOracleAddress = '0xeAEdaF63CbC1d00cB6C14B5c4DE161d68b7C63A0' // Monad testnet oracle

  const oraclePriceContracts = useMemo(() => {
    if (!chainId || !knownOracleAddress) return []
    return assetsWithSmartContracts.map(asset => {
      const addresses = getAssetContractAddresses(asset.id, chainId)
      return {
        assetId: asset.id,
        address: knownOracleAddress as `0x${string}`,
        abi: combinedAbi as Abi,
        functionName: 'getUnderlyingPrice',
        args: [addresses?.pTokenAddress!],
      } as const
    }).filter(c => !!c.args[0])
  }, [chainId, assetsWithSmartContracts])

  const oracleContracts = oraclePriceContracts.map(c => ({
    address: c.address,
    abi: c.abi,
    functionName: c.functionName,
    args: c.args,
  }))

  // @ts-ignore - Complex wagmi type inference issue
  const { data: oraclePricesData, isLoading: arePricesLoading } = useReadContracts({
    contracts: oracleContracts as any,
    query: {
      enabled: oraclePriceContracts.length > 0 && chainId === 10143, // For Monad testnet
      refetchInterval: 60000,
    }
  })

  // Process oracle prices data
  useEffect(() => {
    if (!oraclePricesData) return
    const newPrices: Record<string, number> = {}
    oraclePricesData.forEach((result, index) => {
      const assetId = oraclePriceContracts[index].assetId
      if (result.status === 'success' && result.result) {
        newPrices[assetId] = parseFloat(formatUnits(result.result as bigint, 18))
      } else {
        console.warn(`Could not fetch oracle price for ${assetId}. Using static price as fallback.`)
      }
    })
    setOraclePrices(newPrices)
  }, [oraclePricesData, oraclePriceContracts])
  
  // Prepare contracts for fetching market liquidity (cash)
  const cashContracts = useMemo(() => {
    if (!chainId) return []
    return assetsWithSmartContracts.map(asset => {
      const addresses = getAssetContractAddresses(asset.id, chainId)
      return {
        assetId: asset.id,
        address: addresses?.pTokenAddress as `0x${string}`,
        abi: combinedAbi as Abi,
        functionName: 'getCash',
      } as const
    }).filter(c => !!c.address)
  }, [chainId, assetsWithSmartContracts])
  
  const cashContractsArray = cashContracts.map(c => ({
    address: c.address,
    abi: c.abi,
    functionName: c.functionName,
  }))
  
  // @ts-ignore - Complex wagmi type inference issue
  const { data: cashData, isLoading: areLiquiditiesLoading } = useReadContracts({
    contracts: cashContractsArray as any,
    query: {
      enabled: cashContracts.length > 0 && Object.keys(assetDecimals).length > 0,
      refetchInterval: 15000,
    }
  })

  // Process cash data
  useEffect(() => {
    if (!cashData) return
    const newLiquidities: Record<string, number> = {}
    cashData.forEach((result, index) => {
      const assetId = cashContracts[index].assetId
      if (result.status === 'success') {
        const decimals = assetDecimals[assetId] ?? 18
        newLiquidities[assetId] = parseFloat(formatUnits(result.result as bigint, decimals))
      }
    })
    setMarketLiquidities(newLiquidities)
  }, [cashData, cashContracts, assetDecimals])


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

  // Fetch balances for all assets at the top level
  const assetBalances = assetsWithSmartContracts.map(asset => {
    const { 
      formattedBalance: suppliedBalance,
      underlyingBalance,
      isLoading: isBalanceLoading 
    } = usePTokenBalance({ assetId: asset.id })
    
    const { 
      formattedBalance: borrowedBalance,
      borrowBalance,
      isLoading: isBorrowLoading 
    } = useBorrowBalance({ assetId: asset.id })

    const liveOraclePrice = oraclePrices[asset.id] ?? asset.oraclePrice
    const suppliedBalanceNumeric = parseFloat(suppliedBalance.replace(/[<,]/g, '')) || 0
    const borrowedBalanceNumeric = parseFloat(borrowedBalance.replace(/[<,]/g, '')) || 0
    
    return {
      asset,
      suppliedBalance: suppliedBalanceNumeric,
      borrowedBalance: borrowedBalanceNumeric,
      suppliedValueUSD: suppliedBalanceNumeric * liveOraclePrice,
      borrowedValueUSD: borrowedBalanceNumeric * liveOraclePrice,
      collateralFactor: asset.maxLTV / 100,
      borrowingPowerUSD: (suppliedBalanceNumeric * liveOraclePrice) * (asset.maxLTV / 100),
      isLoading: isBalanceLoading || isBorrowLoading,
      hasSupplied: suppliedBalanceNumeric > 0,
      hasBorrowed: borrowedBalanceNumeric > 0,
    }
  })

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
      
      // Calculate individual asset positions from pre-fetched data
      const collateralAssets: CollateralAsset[] = []
      const borrowedAssets: BorrowedAsset[] = []
      let totalSuppliedUSD = 0
      let totalBorrowedUSD = 0
      let totalBorrowingPowerUSD = 0

      console.log('🔄 Calculating positions for all assets:', assetsWithSmartContracts.map(a => a.symbol))

      // Process each asset's balance data
      assetBalances.forEach(assetData => {
        if (assetData.hasSupplied) {
          const collateralAsset: CollateralAsset = {
            assetId: assetData.asset.id,
            symbol: assetData.asset.symbol,
            suppliedBalance: assetData.suppliedBalance,
            suppliedValueUSD: assetData.suppliedValueUSD,
            collateralFactor: assetData.collateralFactor,
            borrowingPowerUSD: assetData.borrowingPowerUSD,
          }
          collateralAssets.push(collateralAsset)
          totalSuppliedUSD += assetData.suppliedValueUSD
          totalBorrowingPowerUSD += assetData.borrowingPowerUSD
          
          console.log(`✅ Found supplied position in ${assetData.asset.symbol}:`, {
            balance: assetData.suppliedBalance,
            valueUSD: assetData.suppliedValueUSD,
            borrowingPowerUSD: assetData.borrowingPowerUSD,
          })
        }

        if (assetData.hasBorrowed) {
          const borrowedAsset: BorrowedAsset = {
            assetId: assetData.asset.id,
            symbol: assetData.asset.symbol,
            borrowedBalance: assetData.borrowedBalance,
            borrowedValueUSD: assetData.borrowedValueUSD,
          }
          borrowedAssets.push(borrowedAsset)
          totalBorrowedUSD += assetData.borrowedValueUSD
          
          console.log(`✅ Found borrowed position in ${assetData.asset.symbol}:`, {
            balance: assetData.borrowedBalance,
            valueUSD: assetData.borrowedValueUSD,
          })
        }
      })

      // Calculate derived values
      const availableBorrowingPowerUSD = Math.max(0, totalBorrowingPowerUSD - totalBorrowedUSD)
      const collateralUtilization = totalBorrowingPowerUSD > 0 
        ? (totalBorrowedUSD / totalBorrowingPowerUSD) * 100 
        : 0

      const liquidationRisk: 'safe' | 'moderate' | 'high' = 
        collateralUtilization > 90 ? 'high' : 
        collateralUtilization > 75 ? 'moderate' : 
        'safe'

      // Use controller data as fallback/validation if individual calculation fails
      let finalAvailableBorrowingPowerUSD = availableBorrowingPowerUSD
      
      if (accountLiquidity && Array.isArray(accountLiquidity) && accountLiquidity.length === 3) {
        const [error, liquidity, shortfall] = accountLiquidity as [bigint, bigint, bigint]
        
        if (typeof error === 'bigint' && typeof liquidity === 'bigint' && error === BigInt(0)) {
          const controllerAvailableBorrowingPowerUSD = parseFloat(formatUnits(liquidity, 18))
          
          // Use controller data if our calculation seems off (could happen if oracle prices are stale)
          if (Math.abs(controllerAvailableBorrowingPowerUSD - availableBorrowingPowerUSD) > 0.01) {
            console.log('📊 Using controller borrowing power as more accurate:', {
              calculated: availableBorrowingPowerUSD,
              controller: controllerAvailableBorrowingPowerUSD,
              difference: Math.abs(controllerAvailableBorrowingPowerUSD - availableBorrowingPowerUSD),
            })
            finalAvailableBorrowingPowerUSD = controllerAvailableBorrowingPowerUSD
          }
        }
      }

      const finalResult = {
        totalSuppliedUSD,
        totalBorrowedUSD,
        totalBorrowingPowerUSD,
        availableBorrowingPowerUSD: finalAvailableBorrowingPowerUSD,
        collateralUtilization,
        collateralAssets,
        borrowedAssets,
        liquidationRisk,
      }

      setBorrowingPower(finalResult)
      
      console.log('✅ Final Borrowing Power Calculation:', {
        totalSuppliedUSD,
        totalBorrowedUSD,
        totalBorrowingPowerUSD,
        availableBorrowingPowerUSD: finalAvailableBorrowingPowerUSD,
        collateralUtilization,
        collateralAssetsCount: collateralAssets.length,
        borrowedAssetsCount: borrowedAssets.length,
        liquidationRisk,
      })
      
    } catch (error) {
      console.error('💥 Error calculating borrowing power:', error)
      // Fallback to controller data only
      if (accountLiquidity && Array.isArray(accountLiquidity) && accountLiquidity.length === 3) {
        const [error, liquidity, shortfall] = accountLiquidity as [bigint, bigint, bigint]
        
        if (typeof error === 'bigint' && typeof liquidity === 'bigint' && error === BigInt(0)) {
          const availableBorrowingPowerUSD = parseFloat(formatUnits(liquidity, 18))
          const shortfallUSD = parseFloat(formatUnits(shortfall, 18))
          
          setBorrowingPower({
            totalSuppliedUSD: 0,
            totalBorrowedUSD: shortfallUSD,
            totalBorrowingPowerUSD: availableBorrowingPowerUSD + shortfallUSD,
            availableBorrowingPowerUSD,
            collateralUtilization: 0,
            collateralAssets: [],
            borrowedAssets: [],
            liquidationRisk: shortfallUSD > 0 ? 'high' : 'safe',
          })
        }
      }
    } finally {
      setIsLoading(false)
    }
  }

  // Recalculate when account liquidity, or asset balances/prices change
  useEffect(() => {
    calculateBorrowingPower()
  }, [accountLiquidity, address, chainId, JSON.stringify(assetBalances)])

  // Helper function to calculate how much of a specific asset can be borrowed
  const getMaxBorrowAmount = (assetId: string): number => {
    const asset = allAssets.find(a => a.id === assetId)
    const liveOraclePrice = oraclePrices[assetId] ?? asset?.oraclePrice
    if (!asset || !liveOraclePrice || liveOraclePrice === 0) return 0
    
    const userMaxBorrow = borrowingPower.availableBorrowingPowerUSD / liveOraclePrice
    const marketLiquidity = marketLiquidities[assetId] ?? 0
    
    // The max borrowable amount is the minimum of what the user is allowed to borrow
    // and what the market has available.
    return Math.min(userMaxBorrow, marketLiquidity)
  }

  // Helper function to check if borrow amount is safe
  const isBorrowAmountSafe = (assetId: string, amount: number): boolean => {
    const asset = allAssets.find(a => a.id === assetId)
    const liveOraclePrice = oraclePrices[assetId] ?? asset?.oraclePrice
    if (!asset || !liveOraclePrice) return false
    
    const borrowValueUSD = amount * liveOraclePrice
    if (borrowValueUSD > borrowingPower.availableBorrowingPowerUSD) {
      return false
    }

    const marketLiquidity = marketLiquidities[assetId]
    if (marketLiquidity !== undefined && amount > marketLiquidity) {
      return false
    }
    
    return true
  }

  return {
    borrowingPower,
    isLoading: isLoading || areDecimalsLoading || areLiquiditiesLoading || arePricesLoading,
    refetch: refetchLiquidity,
    getMaxBorrowAmount,
    isBorrowAmountSafe,
    accountLiquidity,
  }
} 
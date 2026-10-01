import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAccount, useReadContracts, useReadContract, type Config } from 'wagmi'
import { formatUnits, Abi } from 'viem'
import { getMarketsForChain, getAssetContractAddresses } from '@/data/market-data'
import { getChainConfig, CHAIN_IDS, isAxelarSpokeChain, resolveHubReadChainId, getOracleAddress } from '@/config/contracts'
import { decodeCompoundError } from '@/lib/compound-errors'
import priceOracleAbi from '@/app/abis/PriceOracle.json';
import combinedAbi from '@/app/abis/combinedAbi.json'
import { useActiveWallet } from '@/hooks/use-active-wallet'

type ContractCall = {
  address: `0x${string}`;
  abi: readonly any[];
  functionName: string;
  args?: any[];
  chainId?: number;
  assetId: string;
  type: 'decimal' | 'price' | 'cash' | 'supplied' | 'borrowed';
};


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

const borrowBalanceAbi = [{
  name: 'borrowBalanceStored',
  type: 'function' as const,
  stateMutability: 'view' as const,
  inputs: [{ name: 'account', type: 'address' as const }],
  outputs: [{ name: '', type: 'uint256' as const }]
}]

export function useBorrowingPower() {
  const { chainId } = useAccount()
  const { address } = useActiveWallet()
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
  const [userBalances, setUserBalances] = useState<Record<string, { supplied: bigint, borrowed: bigint }>>({})
  const [accountLiquidity, setAccountLiquidity] = useState<[bigint, bigint, bigint] | undefined>(undefined)

  // Route reads to hub chain for Axelar spoke chains (e.g., Arbitrum/Base/Ethereum Sepolia)
  const effectiveChainId = useMemo(() => resolveHubReadChainId(chainId ?? null) ?? null, [chainId]) as number | null

  // Get chain config for controller/oracle address on effective chain
  const chainConfig = effectiveChainId ? getChainConfig(effectiveChainId) : null;
  const controllerAddress = chainConfig && 'unitrollerProxy' in chainConfig ? chainConfig.unitrollerProxy : null;
  const oracleAddress = chainConfig && 'oracle' in chainConfig ? chainConfig.oracle : null;

  // Get all assets for current chain
  const allAssets = useMemo(() => (effectiveChainId ? getMarketsForChain(effectiveChainId) : []), [effectiveChainId])
  const assetsWithSmartContracts = useMemo(() => (allAssets ? allAssets.filter(asset => asset.hasSmartContract) : []), [allAssets])

  // Prepare contracts for fetching decimals, cash, and user balances in batches
  // NOTE: Oracle prices are NOT fetched here - we use fallback prices from asset config
  // This dramatically reduces RPC calls, especially with per-asset oracles
  const combinedContracts = useMemo(() => {
    if (!chainId) return [];

    return assetsWithSmartContracts.flatMap(asset => {
      const addresses = effectiveChainId ? getAssetContractAddresses(asset.id, effectiveChainId) : null
      if (!addresses) return []

      const pTokenContract = { address: addresses.pTokenAddress as `0x${string}`, abi: combinedAbi as Abi }
      const underlyingContract = { address: addresses.underlyingAddress as `0x${string}`, abi: minimalDecimalsAbi }
      const pTokenBorrowAbi = { address: addresses.pTokenAddress as `0x${string}`, abi: borrowBalanceAbi }

      const userBalanceContracts = address ? [
        { ...pTokenContract, functionName: 'balanceOfUnderlying', args: [address], assetId: asset.id, type: 'supplied' as const, chainId: effectiveChainId as number },
        { ...pTokenBorrowAbi, functionName: 'borrowBalanceStored', args: [address], assetId: asset.id, type: 'borrowed' as const, chainId: effectiveChainId as number },
      ] : []

      return [
        { ...underlyingContract, functionName: 'decimals', assetId: asset.id, type: 'decimal' as const, chainId: effectiveChainId as number },
        // REMOVED: Oracle price calls - use fallback prices from asset config instead
        { ...pTokenContract, functionName: 'getCash', assetId: asset.id, type: 'cash' as const, chainId: effectiveChainId as number },
        ...userBalanceContracts,
      ]
    }).filter(c => !!c.address)
  }, [chainId, assetsWithSmartContracts, address, effectiveChainId]);

  const { data: combinedData, isLoading: isCombinedDataLoading, refetch: refetchCombinedData } = useReadContracts({
    contracts: combinedContracts as any,
    query: {
      enabled: combinedContracts.length > 0,
      refetchInterval: 60000, // Reduced frequency to prevent RPC rate limits
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    } as any
  } as any)

  // Process all batched data
  useEffect(() => {
    if (!combinedData) return
    
    const newDecimals: Record<string, number> = {}
    const newPrices: Record<string, number> = {}
    const newLiquidities: Record<string, number> = {}
    const newBalances: Record<string, { supplied: bigint, borrowed: bigint }> = {}
    
    combinedData.forEach((result, index) => {
      const contractInfo = combinedContracts[index]
      
      if (!contractInfo || result.status !== 'success') return

      const { assetId, type } = contractInfo
      
      switch (type) {
        case 'decimal':
          newDecimals[assetId] = result.result as number
          break
        case 'cash':
          const rawCash = result.result as bigint
          const decimalsFromFetch =
            newDecimals[assetId] ??
            assetDecimals[assetId] ??
            allAssets.find(a => a.id === assetId)?.decimals ?? 18
          
          // getCash returns underlying token balance in underlying decimals
          newLiquidities[assetId] = parseFloat(formatUnits(rawCash, decimalsFromFetch))
          break
        case 'supplied':
          if (!newBalances[assetId]) newBalances[assetId] = { supplied: BigInt(0), borrowed: BigInt(0) }
          newBalances[assetId].supplied = result.result as bigint
          break
        case 'borrowed':
          if (!newBalances[assetId]) newBalances[assetId] = { supplied: BigInt(0), borrowed: BigInt(0) }
          newBalances[assetId].borrowed = result.result as bigint
          break
      }
    })

    if (Object.keys(newDecimals).length > 0) {
      setAssetDecimals(prev => {
        const hasChanges = Object.keys(newDecimals).some(key => prev[key] !== newDecimals[key])
        return hasChanges ? { ...prev, ...newDecimals } : prev
      })
    }
    // Oracle prices removed - using fallback from asset config
    if (Object.keys(newLiquidities).length > 0) {
      setMarketLiquidities(prev => {
        const hasChanges = Object.keys(newLiquidities).some(key => prev[key] !== newLiquidities[key])
        return hasChanges ? { ...prev, ...newLiquidities } : prev
      })
    }
    if (Object.keys(newBalances).length > 0) {
      setUserBalances(prev => {
        const hasChanges = Object.keys(newBalances).some(key => 
          prev[key]?.supplied !== newBalances[key]?.supplied || 
          prev[key]?.borrowed !== newBalances[key]?.borrowed
        )
        return hasChanges ? { ...prev, ...newBalances } : prev
      })
    }
  }, [combinedData, combinedContracts, allAssets, effectiveChainId])

  // Get account liquidity from controller (for validation)
  const { data: rawAccountLiquidity, refetch: refetchLiquidity } = useReadContract({
    address: controllerAddress as `0x${string}`,
    abi: combinedAbi,
    functionName: 'getAccountLiquidity',
    args: [address!],
    query: {
      enabled: !!controllerAddress && !!address,
      refetchInterval: 60000, // Reduced frequency to prevent RPC rate limits
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    } as any
    ,
    chainId: effectiveChainId as any,
  } as any)

  useEffect(() => {
    if (rawAccountLiquidity) {
      setAccountLiquidity(rawAccountLiquidity as [bigint, bigint, bigint])
    }
  }, [rawAccountLiquidity])

  // Fetch which markets are entered as collateral (Comptroller.getAssetsIn)
  const { data: assetsInData } = useReadContract({
    address: controllerAddress as `0x${string}`,
    abi: combinedAbi,
    functionName: 'getAssetsIn',
    args: [address!],
    query: {
      enabled: !!controllerAddress && !!address,
      refetchInterval: 60000, // Reduced frequency to prevent RPC rate limits
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    } as any
    ,
    chainId: effectiveChainId as any,
  } as any)

  const assetsInPTokenSet = useMemo(() => {
    const set = new Set<string>()
    const arr = (assetsInData as any) as string[] | undefined
    if (Array.isArray(arr)) {
      for (const addr of arr) {
        if (typeof addr === 'string') set.add(addr.toLowerCase())
      }
    }
    return set
  }, [assetsInData])

  // Calculate borrowing power across all assets
  const calculateBorrowingPower = useCallback(() => {
    if (!address || !chainId || assetsWithSmartContracts.length === 0) {
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
      const collateralAssets: CollateralAsset[] = []
      const borrowedAssets: BorrowedAsset[] = []
      let totalSuppliedUSD = 0
      let totalBorrowedUSD = 0
      let totalBorrowingPowerUSD = 0
      
      assetsWithSmartContracts.forEach(asset => {
        const balances = userBalances[asset.id]
        if (!balances) return

        // Use asset.oraclePrice as primary source (configured fallback price)
        // oraclePrices from RPC are no longer fetched to reduce RPC calls
        const liveOraclePrice = asset.oraclePrice || asset.price || 0
        const decimals = assetDecimals[asset.id] ?? asset.decimals ?? 18
        
        // CRITICAL: On Monad, balanceOfUnderlying returns value in UNDERLYING decimals (not 18!)
        // This differs from standard Compound where it's always 18 decimals
        // We must use the actual underlying token decimals for Monad
        const suppliedBalance = parseFloat(formatUnits(balances.supplied, decimals))
        
        // CRITICAL FIX: borrowBalanceStored seems to return pToken-scaled values (8 decimals)
        // not underlying decimals on Monad. Test both to see which is correct.
        const borrowedBalanceUnderlying = parseFloat(formatUnits(balances.borrowed, decimals))
        
        // For now, use underlying decimals (standard Compound behavior)
        const borrowedBalance = borrowedBalanceUnderlying
        
        if (suppliedBalance > 0) {
          // Only count as collateral if user entered this market in Comptroller
          const addresses = effectiveChainId ? getAssetContractAddresses(asset.id, effectiveChainId) : null
          const pTokenAddr = (addresses?.pTokenAddress || '').toLowerCase()
          const isEnteredAsCollateral = pTokenAddr && assetsInPTokenSet.has(pTokenAddr)

          const suppliedValueUSD = suppliedBalance * liveOraclePrice
          const borrowingPowerForAsset = isEnteredAsCollateral ? (suppliedValueUSD * (asset.maxLTV / 100)) : 0
          
          if (isEnteredAsCollateral) {
            collateralAssets.push({
              assetId: asset.id,
              symbol: asset.symbol,
              suppliedBalance,
              suppliedValueUSD,
              collateralFactor: asset.maxLTV / 100,
              borrowingPowerUSD: borrowingPowerForAsset,
            })
            totalBorrowingPowerUSD += borrowingPowerForAsset
          }
          totalSuppliedUSD += suppliedValueUSD
        }

        if (borrowedBalance > 0) {
          const borrowedValueUSD = borrowedBalance * liveOraclePrice
          borrowedAssets.push({
            assetId: asset.id,
            symbol: asset.symbol,
            borrowedBalance,
            borrowedValueUSD,
          })
          totalBorrowedUSD += borrowedValueUSD
        }
      })
      
      // Prefer Comptroller's accountLiquidity as the authoritative available power when present
      const computedAvailableUSD = Math.max(0, totalBorrowingPowerUSD - totalBorrowedUSD)
      const theoreticalAvailableBorrowingPowerUSD = computedAvailableUSD
      let availableBorrowingPowerUSD = theoreticalAvailableBorrowingPowerUSD
      
      if (accountLiquidity && Array.isArray(accountLiquidity) && accountLiquidity.length === 3) {
        const [error, liquidity] = accountLiquidity as [bigint, bigint, bigint]
        if (error === BigInt(0)) {
          const controllerAvailableUSD = parseFloat(formatUnits(liquidity, 18))
          if (controllerAvailableUSD > 0) {
            availableBorrowingPowerUSD = Math.max(0, Math.min(theoreticalAvailableBorrowingPowerUSD, controllerAvailableUSD))
          }
        }
      }
      const borrowingCapacityUSD = Math.max(totalBorrowingPowerUSD, totalBorrowedUSD, 0.000001)
      const collateralUtilization = borrowingCapacityUSD > 0 ? (totalBorrowedUSD / borrowingCapacityUSD) * 100 : 0
      const liquidationRisk: 'safe' | 'moderate' | 'high' = 
        collateralUtilization > 90 ? 'high' : 
        collateralUtilization > 75 ? 'moderate' : 'safe'

      setBorrowingPower({
        totalSuppliedUSD,
        totalBorrowedUSD,
        totalBorrowingPowerUSD,
        availableBorrowingPowerUSD,
        collateralUtilization,
        collateralAssets,
        borrowedAssets,
        liquidationRisk,
      })

    } catch (error) {
      console.error('💥 Error calculating borrowing power:', error)
    } finally {
      setIsLoading(false)
    }
  }, [address, chainId, assetsWithSmartContracts, userBalances, assetDecimals, accountLiquidity, effectiveChainId, assetsInPTokenSet])

  // Recalculate when dependencies change
  useEffect(() => {
    calculateBorrowingPower()
  }, [calculateBorrowingPower])

  const getMaxBorrowAmount = useCallback((assetId: string): number => {
    const asset = allAssets.find(a => a.id === assetId)
    // Use asset.oraclePrice as primary source (configured fallback price)
    const liveOraclePrice = asset?.oraclePrice || asset?.price || 0
    if (!asset || !liveOraclePrice || liveOraclePrice === 0) return 0
    
    // Use authoritative availableBorrowingPowerUSD already computed from Comptroller when present
    const userMaxBorrow = borrowingPower.availableBorrowingPowerUSD / liveOraclePrice
    const marketLiquidity = marketLiquidities[assetId]
    
    // If market liquidity not yet fetched (undefined), don't limit by it
    // This prevents showing "Max: 0.0000" when user has valid borrowing power
    if (marketLiquidity === undefined) {
      return userMaxBorrow
    }
    
    return Math.min(userMaxBorrow, marketLiquidity)
  }, [allAssets, borrowingPower.availableBorrowingPowerUSD, marketLiquidities, effectiveChainId])

  const isBorrowAmountSafe = useCallback((assetId: string, amount: number): boolean => {
    const asset = allAssets.find(a => a.id === assetId)
    // Use asset.oraclePrice as primary source (configured fallback price)
    const liveOraclePrice = asset?.oraclePrice || asset?.price || 0
    if (!asset || !liveOraclePrice) return false
    
    const borrowValueUSD = amount * liveOraclePrice
    if (borrowValueUSD > borrowingPower.availableBorrowingPowerUSD) {
      return false
    }

    const marketLiquidity = marketLiquidities[assetId]
    // Only check market liquidity if it has been fetched
    // If undefined, we can't validate against it yet (assume safe until data loads)
    if (marketLiquidity !== undefined && amount > marketLiquidity) {
      return false
    }
    
    return true
  }, [allAssets, borrowingPower.availableBorrowingPowerUSD, marketLiquidities])

  const getHypotheticalBorrowUtilization = useCallback((assetId: string, amount: number): number => {
    const asset = allAssets.find(a => a.id === assetId);
    // Use asset.oraclePrice as primary source (configured fallback price)
    const liveOraclePrice = asset?.oraclePrice || asset?.price || 0;

    const theoreticalAvailableUSD = Math.max(borrowingPower.totalBorrowingPowerUSD - borrowingPower.totalBorrowedUSD, 0);
    const borrowingCapacityUSD = Math.max(borrowingPower.totalBorrowingPowerUSD, borrowingPower.totalBorrowedUSD + theoreticalAvailableUSD, 0.000001);

    if (!asset || !liveOraclePrice || borrowingCapacityUSD === 0) {
      return borrowingPower.collateralUtilization;
    }

    const additionalBorrowUSD = amount * liveOraclePrice;
    const hypotheticalTotalBorrowedUSD = borrowingPower.totalBorrowedUSD + additionalBorrowUSD;
    const cappedBorrowedUSD = Math.min(hypotheticalTotalBorrowedUSD, borrowingCapacityUSD);
    const hypotheticalUtilization = (cappedBorrowedUSD / borrowingCapacityUSD) * 100;

    return Math.min(hypotheticalUtilization, 100); // Cap at 100%
  }, [allAssets, oraclePrices, borrowingPower.totalBorrowedUSD, borrowingPower.totalBorrowingPowerUSD, borrowingPower.collateralUtilization]);

  // Refetch function to manually trigger updates
  const refetch = useCallback(() => {
    refetchCombinedData()
    refetchLiquidity()
  }, [refetchCombinedData, refetchLiquidity])

  return useMemo(() => ({
    borrowingPower,
    isLoading: isLoading || isCombinedDataLoading,
    refetch,
    getMaxBorrowAmount,
    isBorrowAmountSafe,
    getHypotheticalBorrowUtilization,
    accountLiquidity,
  }), [
    borrowingPower,
    isLoading,
    isCombinedDataLoading,
    refetch,
    getMaxBorrowAmount,
    isBorrowAmountSafe,
    getHypotheticalBorrowUtilization,
    accountLiquidity
  ])
} 

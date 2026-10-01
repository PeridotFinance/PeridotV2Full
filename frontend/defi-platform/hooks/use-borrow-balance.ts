import { useAccount, useReadContracts } from 'wagmi'
import { formatUnits } from 'viem'
import { getAssetContractAddresses, getAssetById, AXELAR_CROSS_CHAIN_ASSET_IDS } from '@/data/market-data'
import { CHAIN_IDS, isAxelarSpokeChain, getConfiguredUnderlyingDecimals, resolveHubReadChainId } from '@/config/contracts'
import combinedAbi from '@/app/abis/combinedAbi.json'
import { useMemo, useEffect } from 'react'
import { FEATURE_FLAGS } from '@/config/featureFlags'
import { useLivePrice } from './use-live-price'
import { useActiveWallet } from '@/hooks/use-active-wallet'

interface UseBorrowBalanceProps {
  assetId: string
}

// Custom ABI for borrowBalanceStored function (same as cross-chain balance hook)
const borrowBalanceAbi = [{
  name: 'borrowBalanceStored',
  type: 'function' as const,
  stateMutability: 'view' as const,
  inputs: [{ name: 'account', type: 'address' as const }],
  outputs: [{ name: '', type: 'uint256' as const }]
}]

// Threshold for minimum borrow amount in USD
const MINIMUM_BORROW_THRESHOLD_USD = 0.001

export function useBorrowBalance({ assetId }: UseBorrowBalanceProps) {
  const { chainId } = useAccount()
  const { address } = useActiveWallet()
  
  // Determine effective chain for Axelar cross-chain assets (read positions from BSC hub when on Arbitrum)
  const effectiveChainId = useMemo(() => resolveHubReadChainId(chainId ?? null) ?? null, [chainId]) as number | null

  // Get contract addresses for the asset on the effective chain
  const contractAddresses = effectiveChainId ? getAssetContractAddresses(assetId, effectiveChainId) : null
  
  // Get asset info for oracle price
  const asset = getAssetById(assetId)
  
  // Get live price from oracle
  // Always price against the hub (BSC) so prices reflect destination chain
  const { price: livePrice, hasValidPrice } = useLivePrice({ 
    assetId, 
    chainIdOverride: effectiveChainId ?? undefined 
  })

  const pTokenContract = {
    address: contractAddresses?.pTokenAddress as `0x${string}`,
    abi: combinedAbi,
  } as const

  const underlyingTokenContract = {
    address: contractAddresses?.underlyingAddress as `0x${string}`,
    abi: combinedAbi,
  } as const

  const { data, isLoading, error, refetch } = useReadContracts({
    contracts: [
      { ...pTokenContract, abi: borrowBalanceAbi as any, functionName: 'borrowBalanceStored', args: [address!], chainId: effectiveChainId as any },
      { ...pTokenContract, functionName: 'borrowRatePerBlock', args: [], chainId: effectiveChainId as any },
      { ...underlyingTokenContract, functionName: 'decimals', args: [], chainId: effectiveChainId as any },
    ] as any,
    query: {
      enabled: !!contractAddresses?.pTokenAddress && !!address && !!effectiveChainId,
      refetchInterval: 60000, // Reduced frequency to prevent RPC rate limits
    }
  } as any)

  const [
    borrowBalance,
    borrowRate,
    underlyingDecimals,
  ] = useMemo(() => {
    return (data || []).map(item => item.status === 'success' ? item.result : undefined)
  }, [data])

  // Use the direct borrow balance (no need for revert handling with borrowBalanceStored)
  const actualBorrowBalance = (borrowBalance as bigint) || BigInt(0)

  // Prefer configured decimals from contracts config
  const configuredDecimals = useMemo(() => {
    if (!effectiveChainId) return undefined as any
    return getConfiguredUnderlyingDecimals(effectiveChainId as number, {
      underlyingAddress: (contractAddresses as any)?.underlyingAddress,
      symbol: asset?.symbol,
    })
  }, [effectiveChainId, contractAddresses, asset?.symbol]) as number | undefined

  const decimals = (configuredDecimals as number | undefined) || (underlyingDecimals as number | undefined) || asset?.decimals || 18

  // Format the balance to a readable string
  const formatBalance = (balance: bigint | undefined, decimals: number): string => {
    if (!balance || balance === BigInt(0)) return '0.00'
    
    const numericBalance = parseFloat(formatUnits(balance, decimals))
    
    if (numericBalance === 0) return '0.00'
    if (numericBalance < 0.001) {
      return '<0.001'
    }
    
    return numericBalance.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    })
  }

  // Get numeric balance for calculations (used by borrowing power calculations)
  const getNumericBalance = (): number => {
    if (!actualBorrowBalance) return 0
    const numericBalance = parseFloat(formatUnits(actualBorrowBalance, decimals as number))
    
    // Apply minimum threshold - don't show dust amounts in USD terms
    const priceUSD = hasValidPrice ? livePrice : asset?.oraclePrice || 0
    const balanceValueUSD = numericBalance * priceUSD
    
    return balanceValueUSD < MINIMUM_BORROW_THRESHOLD_USD ? 0 : numericBalance
  }

  // Calculate daily interest earned (approximate)
  const getDailyInterest = (): number => {
    if (!borrowRate || !actualBorrowBalance) return 0
    
    const ratePerBlock = parseFloat(formatUnits(borrowRate as bigint, 18))
    const blocksPerDay = 6400 // Approximate for Ethereum (13.5s blocks)
    const dailyRate = ratePerBlock * blocksPerDay
    const balance = getNumericBalance()
    
    return balance * dailyRate
  }

  // Memoize the return object to prevent unnecessary re-renders
  return useMemo(() => {
    const hasBorrowBalance = actualBorrowBalance > BigInt(0)
    
    return {
      borrowBalance: actualBorrowBalance,
      formattedBalance: formatBalance(actualBorrowBalance, decimals as number),
      numericBalance: getNumericBalance(),
      dailyInterest: getDailyInterest(),
      decimals,
      isLoading,
      error,
      refetch,
      hasBorrowBalance,
      // Legacy aliases for backward compatibility
      hasBorrow: hasBorrowBalance,
      rawBorrowBalance: actualBorrowBalance, // For debug component
      contractAddresses,
      borrowRate: borrowRate as bigint | undefined,
    }
  }, [
    actualBorrowBalance,
    decimals,
    isLoading,
    error,
    refetch,
    contractAddresses,
    borrowRate,
    asset?.oraclePrice,
    hasValidPrice,
    livePrice
  ])

  // After any tx success, do a one-shot refetch after 1s to reconcile per-asset borrow balance
  useEffect(() => {
    if (!FEATURE_FLAGS.LIVE_MARKET_REFRESH) return
    const handler = () => {
      try { setTimeout(() => { try { refetch?.() } catch {} }, 1000) } catch {}
    }
    try { window.addEventListener('peridot:tx-success' as any, handler) } catch {}
    return () => { try { window.removeEventListener('peridot:tx-success' as any, handler) } catch {} }
  }, [refetch])
} 
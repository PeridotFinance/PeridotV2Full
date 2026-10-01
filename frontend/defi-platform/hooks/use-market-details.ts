import React from 'react'
import { useAccount, useReadContract, useReadContracts } from 'wagmi'
import { formatUnits } from 'viem'
import combinedAbi from '@/app/abis/combinedAbi.json'
import pTokenAbi from '@/app/abis/pdtptokenABI.json'
import comptrollerAbi from '@/app/abis/comptrollerAbi.json'
import peridottrollerAbi from '@/app/abis/peridottrollerABI.json'
import jumpRateModelAbi from '@/app/abis/Jumpratemodel.json'
import { getAssetContractAddresses, AXELAR_CROSS_CHAIN_ASSET_IDS } from '@/data/market-data'
import { getChainConfig, resolveHubReadChainId } from '@/config/contracts'

export interface MarketDetailsData {
  priceUSD: number | null
  totalSupplyUnderlying: number | null
  totalSupplyUSD: number | null
  totalBorrowsUnderlying: number | null
  totalBorrowsUSD: number | null
  liquidityUnderlying: number | null
  liquidityUSD: number | null
  utilizationPct: number | null
  reserveFactor: number | null
  collateralFactor: number | null
  liquidationIncentive: number | null
  exchangeRateStored: bigint | null
  tTokenAddress: `0x${string}` | null
  underlyingAddress: `0x${string}` | null
  decimals: number | null
  pTokenDecimals: number | null
  totalReservesUnderlying: number | null
  totalReservesUSD: number | null
  borrowCapUnderlying: number | null
  tTokenTotalSupply: number | null
  tokensPerUnderlying: number | null // tToken per 1 underlying
  dailyInterestUnderlying: number | null
  dailyInterestUSD: number | null
}

export function useMarketDetails(assetId: string, providedChainId?: number): { data: MarketDetailsData; isLoading: boolean } {
  const { chainId } = useAccount()
  // Route cross-chain reads to hub chain (BSC) when on spoke chains
  const effectiveChainId = React.useMemo(() => resolveHubReadChainId(providedChainId ?? chainId), [providedChainId, chainId])

  const chainConfig = effectiveChainId ? getChainConfig(effectiveChainId) : null
  const comptroller = chainConfig && 'unitrollerProxy' in chainConfig ? (chainConfig.unitrollerProxy as `0x${string}`) : undefined
  const oracle = chainConfig && 'oracle' in chainConfig ? (chainConfig.oracle as `0x${string}`) : undefined
  const addresses = effectiveChainId ? getAssetContractAddresses(assetId, effectiveChainId) : null

  const pToken = addresses?.pTokenAddress as `0x${string}` | undefined
  const underlying = addresses?.underlyingAddress as `0x${string}` | undefined

  const { data: results, isLoading } = useReadContracts<{ result: unknown; status: 'success' | 'failure' }[]>({
    // Cast to any to avoid deep type instantiation issues with viem types
    contracts: (pToken && comptroller && oracle ? ([
      { address: pToken as any, abi: pTokenAbi, functionName: 'totalSupply', args: [], chainId: effectiveChainId as any },
      { address: pToken as any, abi: pTokenAbi, functionName: 'exchangeRateStored', args: [], chainId: effectiveChainId as any },
      { address: pToken as any, abi: pTokenAbi, functionName: 'totalBorrows', args: [], chainId: effectiveChainId as any },
      { address: pToken as any, abi: pTokenAbi, functionName: 'getCash', args: [], chainId: effectiveChainId as any },
      { address: pToken as any, abi: pTokenAbi, functionName: 'reserveFactorMantissa', args: [], chainId: effectiveChainId as any },
      { address: comptroller as any, abi: combinedAbi, functionName: 'markets', args: [pToken as any], chainId: effectiveChainId as any },
      { address: comptroller as any, abi: combinedAbi, functionName: 'liquidationIncentiveMantissa', args: [], chainId: effectiveChainId as any },
      { address: oracle as any, abi: combinedAbi, functionName: 'getUnderlyingPrice', args: [pToken as any], chainId: effectiveChainId as any },
      { address: pToken as any, abi: pTokenAbi, functionName: 'totalReserves', args: [], chainId: effectiveChainId as any },
      { address: pToken as any, abi: pTokenAbi, functionName: 'decimals', args: [], chainId: effectiveChainId as any },
      { address: comptroller as any, abi: peridottrollerAbi as any, functionName: 'borrowCaps', args: [pToken as any], chainId: effectiveChainId as any },
      { address: pToken as any, abi: pTokenAbi, functionName: 'interestRateModel', args: [], chainId: effectiveChainId as any },
    ] as const) : ([])) as any,
    query: {
      enabled: Boolean(pToken && comptroller && oracle && effectiveChainId),
      staleTime: 60_000,
      retry: 2,
      retryDelay: 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  })

  const [
    totalSupply,
    exchangeRate,
    totalBorrows,
    cash,
    reserveFactorMantissa,
    marketData,
    liquidationIncentiveMantissa,
    underlyingPriceRaw,
    totalReserves,
    pTokenDecimalsRaw,
    borrowCap,
    interestRateModelAddress,
  ] = React.useMemo(() => {
    if (!results) return [null, null, null, null, null, null, null, null, null, null, null, null]
    // Only extract results from successful calls to prevent crashes on mobile
    return results.map(r => r.status === 'success' ? r.result : null)
  }, [results])

  // Derive decimals from config; fallback to 18
  const decimals = React.useMemo(() => {
    if (!chainConfig || !('markets' in chainConfig)) return 18
    // Find market by matching pToken address
    const markets = (chainConfig as any).markets as Record<string, any>
    const found = Object.values(markets).find((m: any) => m.pToken?.toLowerCase() === pToken?.toLowerCase()) as any
    return found?.decimals ?? 18
  }, [chainConfig, pToken])

  const MANTISSA = 1e18

  const priceUSD = underlyingPriceRaw ? Number(underlyingPriceRaw) / MANTISSA : null

  const exchangeRateStored = (exchangeRate as bigint) ?? null

  // Read pToken decimals precisely
  const pTokenDecimals = typeof pTokenDecimalsRaw === 'number' ? pTokenDecimalsRaw : (pTokenDecimalsRaw ? Number(pTokenDecimalsRaw) : null)

  // underlying per 1 pToken
  const exchangeRateUnderlyingPerPT = ((): number | null => {
    if (!exchangeRateStored) return null
    if (decimals == null || pTokenDecimals == null) {
      // Fallback: assume standard 18-scaling
      return Number(exchangeRateStored) / MANTISSA
    }
    // Compound-style scaling: exchangeRateStored is scaled by 1e(18 + underlyingDecimals - pTokenDecimals)
    const scale = Math.pow(10, 18 + (decimals as number) - (pTokenDecimals as number))
    return Number(exchangeRateStored) / scale
  })()

  // Convert totals
  const tTokenTotalSupply = totalSupply && pTokenDecimals != null ? Number(totalSupply) / Math.pow(10, pTokenDecimals) : null
  const totalSupplyUnderlying = totalSupply && exchangeRateUnderlyingPerPT !== null && pTokenDecimals != null
    ? (Number(totalSupply) / Math.pow(10, pTokenDecimals)) * exchangeRateUnderlyingPerPT
    : null

  const totalBorrowsUnderlying = totalBorrows ? Number(totalBorrows) / Math.pow(10, decimals) : null
  const cashUnderlying = cash ? Number(cash) / Math.pow(10, decimals) : null
  const totalReservesUnderlying = totalReserves ? Number(totalReserves) / Math.pow(10, decimals) : null

  const totalSupplyUSD = totalSupplyUnderlying !== null && priceUSD !== null ? totalSupplyUnderlying * priceUSD : null
  const totalBorrowsUSD = totalBorrowsUnderlying !== null && priceUSD !== null ? totalBorrowsUnderlying * priceUSD : null
  const liquidityUSD = cashUnderlying !== null && priceUSD !== null ? cashUnderlying * priceUSD : null
  const totalReservesUSD = totalReservesUnderlying !== null && priceUSD !== null ? totalReservesUnderlying * priceUSD : null

  const utilizationPct = totalBorrowsUnderlying !== null && cashUnderlying !== null
    ? (totalBorrowsUnderlying / Math.max(1e-12, (totalBorrowsUnderlying + cashUnderlying))) * 100
    : null

  const reserveFactor = reserveFactorMantissa ? Number(reserveFactorMantissa) / MANTISSA * 100 : null
  const collateralFactor = Array.isArray(marketData) && marketData.length >= 3
    ? Number(marketData[1]) / MANTISSA * 100
    : null
  const liquidationIncentive = liquidationIncentiveMantissa ? Number(liquidationIncentiveMantissa) / MANTISSA * 100 : null

  // Borrow cap (underlying units)
  const borrowCapUnderlying = borrowCap ? Number(borrowCap) / Math.pow(10, decimals) : null

  // Tokens per 1 underlying (invert exchange rate)
  const tokensPerUnderlying = exchangeRateUnderlyingPerPT && exchangeRateUnderlyingPerPT > 0 ? (1 / exchangeRateUnderlyingPerPT) : null

  // Daily interest estimation using model rate per block
  const { data: borrowRatePerBlock } = useReadContract({
    address: interestRateModelAddress as `0x${string}`,
    abi: jumpRateModelAbi,
    functionName: 'getBorrowRate',
    args: [cash || BigInt(0), totalBorrows || BigInt(0), totalReserves || BigInt(0)],
    chainId: effectiveChainId as any,
    query: { 
      enabled: Boolean(interestRateModelAddress && effectiveChainId),
      retry: 2,
      retryDelay: 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    }
  })

  const blocksPerYear = React.useMemo(() => {
    switch (effectiveChainId) {
      case 56: return 42_048_000
      case 97: return 10_512_000
      case 10143: return 63_072_000
      default: return 2_102_400
    }
  }, [effectiveChainId])

  const dailyInterestUnderlying = (() => {
    if (!borrowRatePerBlock || totalBorrowsUnderlying == null) return null
    const ratePerBlock = Number(borrowRatePerBlock) / MANTISSA
    const blocksPerDay = blocksPerYear / 365
    return totalBorrowsUnderlying * ratePerBlock * blocksPerDay
  })()
  const dailyInterestUSD = dailyInterestUnderlying != null && priceUSD != null ? dailyInterestUnderlying * priceUSD : null

  return {
    data: {
      priceUSD,
      totalSupplyUnderlying,
      totalSupplyUSD,
      totalBorrowsUnderlying,
      totalBorrowsUSD,
      liquidityUnderlying: cashUnderlying,
      liquidityUSD,
      utilizationPct,
      reserveFactor,
      collateralFactor,
      liquidationIncentive,
      exchangeRateStored,
      tTokenAddress: (pToken ?? null) as any,
      underlyingAddress: (underlying ?? null) as any,
      decimals,
      pTokenDecimals,
      totalReservesUnderlying,
      totalReservesUSD,
      borrowCapUnderlying,
      tTokenTotalSupply,
      tokensPerUnderlying,
      dailyInterestUnderlying,
      dailyInterestUSD,
    },
    isLoading: isLoading,
  }
}



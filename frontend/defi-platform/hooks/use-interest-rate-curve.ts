import { useAccount, useReadContract, useReadContracts } from 'wagmi'
import { useMemo } from 'react'
import pTokenAbi from '@/app/abis/pdtptokenABI.json'
import jumpRateModelAbi from '@/app/abis/Jumpratemodel.json'
import { getAssetContractAddresses } from '@/data/market-data'
import { getChainConfig, resolveHubReadChainId, CHAIN_IDS } from '@/config/contracts'
import { useMobile } from './use-mobile'

export interface CurvePoint {
  uPct: number
  supplyApyPct: number
  borrowApyPct: number
}

export function useInterestRateCurve(assetId: string, providedChainId?: number) {
  const isMobile = useMobile()
  const { chainId } = useAccount()
  // Add null check to prevent crashes when chainId is undefined
  const effectiveChainId = (providedChainId ?? chainId) ? resolveHubReadChainId(providedChainId ?? chainId ?? null) : null
  const addresses = effectiveChainId ? getAssetContractAddresses(assetId, effectiveChainId) : null
  const chainConfig = effectiveChainId ? getChainConfig(effectiveChainId) : null

  // Skip RPC calls on mobile to save resources and prevent crashes
  const { data: baseCalls } = useReadContracts<any>({
    contracts: [
      { address: addresses?.pTokenAddress as `0x${string}`, abi: pTokenAbi, functionName: 'interestRateModel', args: [], chainId: effectiveChainId as any },
      { address: addresses?.pTokenAddress as `0x${string}`, abi: pTokenAbi, functionName: 'reserveFactorMantissa', args: [], chainId: effectiveChainId as any },
      { address: addresses?.pTokenAddress as `0x${string}`, abi: pTokenAbi, functionName: 'getCash', args: [], chainId: effectiveChainId as any },
      { address: addresses?.pTokenAddress as `0x${string}`, abi: pTokenAbi, functionName: 'totalBorrows', args: [], chainId: effectiveChainId as any },
    ],
    query: { 
      enabled: !isMobile && Boolean(addresses?.pTokenAddress && effectiveChainId),
      retry: 2,
      retryDelay: 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    }
  })

  const [irmAddress, reserveFactorMantissa, cash, borrows] = useMemo(() => {
    if (!baseCalls) return [null, null, null, null]
    // Only extract results from successful calls to prevent crashes on mobile
    return baseCalls.map(r => r.status === 'success' ? r.result : null)
  }, [baseCalls])

  const { data: irmParams } = useReadContracts<any>({
    contracts: [
      { address: irmAddress as `0x${string}`, abi: jumpRateModelAbi, functionName: 'baseRatePerBlock', args: [], chainId: effectiveChainId as any },
      { address: irmAddress as `0x${string}`, abi: jumpRateModelAbi, functionName: 'multiplierPerBlock', args: [], chainId: effectiveChainId as any },
      { address: irmAddress as `0x${string}`, abi: jumpRateModelAbi, functionName: 'jumpMultiplierPerBlock', args: [], chainId: effectiveChainId as any },
      { address: irmAddress as `0x${string}`, abi: jumpRateModelAbi, functionName: 'kink', args: [], chainId: effectiveChainId as any },
    ],
    query: { 
      enabled: !isMobile && Boolean(irmAddress && effectiveChainId),
      retry: 2,
      retryDelay: 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    }
  })

  const [basePerBlock, multiplierPerBlock, jumpMultiplierPerBlock, kinkMantissa] = useMemo(() => {
    if (!irmParams) return [null, null, null, null]
    // Only extract results from successful calls to prevent crashes on mobile
    return irmParams.map(r => r.status === 'success' ? r.result : null)
  }, [irmParams])

  const blocksPerYear = useMemo(() => {
    switch (effectiveChainId) {
      case CHAIN_IDS.BSC_TESTNET: return 10_512_000
      case CHAIN_IDS.MONAD_TESTNET: return 63_072_000
      case CHAIN_IDS.BSC_MAINNET: return 42_048_000
      default: return 2_102_400
    }
  }, [effectiveChainId])

  const curve = useMemo(() => {
    // Add null checks to prevent crashes when RPC calls fail on mobile
    if (!basePerBlock || !multiplierPerBlock || !jumpMultiplierPerBlock || !kinkMantissa || reserveFactorMantissa === null || reserveFactorMantissa === undefined) {
      return { points: [] as CurvePoint[], currentUPct: 0 }
    }
    
    try {
      const M = 1e18
      const base = Number(basePerBlock)
      const m = Number(multiplierPerBlock)
      const jm = Number(jumpMultiplierPerBlock)
      const kink = Number(kinkMantissa) / M // 0..1
      const rf = Number(reserveFactorMantissa) / M // 0..1

      // Return APY in percentage units (e.g., 29.2 for 29.2%)
      const toApyPct = (ratePerBlock: number) => (ratePerBlock * blocksPerYear * 100) / M

      const pts: CurvePoint[] = []
      for (let i = 0; i <= 100; i++) {
        const u = i / 100
        const borrowRate = u <= kink
          ? base + u * m
          : base + kink * m + (u - kink) * jm
        const supplyRate = borrowRate * u * (1 - rf)
        pts.push({ uPct: i, borrowApyPct: toApyPct(borrowRate), supplyApyPct: toApyPct(supplyRate) })
      }

      const cashNum = cash ? Number(cash) : 0
      const borrowsNum = borrows ? Number(borrows) : 0
      const currentUtil = cashNum + borrowsNum > 0 ? (borrowsNum / (cashNum + borrowsNum)) : 0
      // Return utilization in percent units for the chart X-axis
      return { points: pts, currentUPct: currentUtil * 100 }
    } catch (error) {
      // Gracefully handle calculation errors on mobile
      console.warn('[useInterestRateCurve] Error calculating curve:', error)
      return { points: [] as CurvePoint[], currentUPct: 0 }
    }
  }, [basePerBlock, multiplierPerBlock, jumpMultiplierPerBlock, kinkMantissa, reserveFactorMantissa, blocksPerYear, cash, borrows])

  return curve
}



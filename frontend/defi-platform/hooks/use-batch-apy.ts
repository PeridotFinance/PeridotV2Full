"use client"

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useReadContracts } from 'wagmi'
import { getAssetContractAddresses, getMarketsForChain } from '@/data/market-data'
import { getChainConfig, CHAIN_IDS } from '@/config/contracts'
import pTokenAbi from '@/app/abis/pdtptokenABI.json'
import jumpRateModelAbi from '@/app/abis/Jumpratemodel.json'
import combinedAbi from '@/app/abis/combinedAbi.json'
import comptrollerAbi from '@/app/abis/comptrollerAbi.json'
import { fetchApyData } from './use-database-apy'

// Blocks per year for different networks (duplicated from useApy for independence)
const getBlocksPerYear = (chainId: number): number => {
  switch (chainId) {
    case 1: return 2_102_400
    case 97: return 10_512_000
    case 56: return 42_048_000
    case 10143: return 63_072_000
    case 50312: return 63_072_000
    default: return 2_102_400
  }
}

interface Position {
  assetId: string
  chainId: number
}

/**
 * APY shape produced by this hook.
 *
 * This is `ChainApyEntry` from `use-apy-data` — one canonical shape with one
 * set of semantics (`supplyApy` = base market rate, boost layers separate,
 * `totalSupplyApy` = the server-authoritative headline). `useCrossChainBalances`
 * was already written against those semantics, so conforming here is what makes
 * the Expert and Easy portfolios agree.
 *
 * Several call sites used to import `LiveApyData` from `@/app/app/page`, which
 * never exported it — a dangling type-only import that silently degraded to
 * `any` (builds ignore TS errors). That is how consumers came to read fields
 * like `totalSupplyApy` off objects that never carried them, and why the
 * Stellar APY gap went unnoticed for so long.
 */
export type { ChainApyEntry as ApyDetails, LiveApyData } from '@/hooks/use-apy-data'
import type { ChainApyEntry as ApyDetails } from '@/hooks/use-apy-data'

export interface DbApyEntry {
  supplyApy: number
  borrowApy: number
  peridotSupplyApy: number
  peridotBorrowApy: number
  boostSourceSupplyApy: number
  boostRewardsSupplyApy: number
  totalSupplyApy: number
  netBorrowApy: number
}

export function useBatchApy(positions: Position[]) {
  // 1. Unique chains involved
  const uniqueChainIds = useMemo(() => Array.from(new Set(positions.map(p => p.chainId))), [positions])

  // 2. Fetch DB APYs for all involved chains (includes boost components for boosted markets)
  const { data: dbApyMap } = useQuery({
    queryKey: ['database-apy-batch', uniqueChainIds],
    queryFn: async () => {
      const responses = await Promise.all(uniqueChainIds.map(chainId => fetchApyData(chainId)))
      const merged: Record<string, Record<number, DbApyEntry>> = {}
      responses.forEach(res => {
        Object.entries(res.data).forEach(([assetId, chainData]) => {
          if (!merged[assetId]) merged[assetId] = {}
          Object.assign(merged[assetId], chainData)
        })
      })
      return merged
    },
    enabled: uniqueChainIds.length > 0,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  })

  // 3. Construct first layer of contract calls
  const firstLayerCalls = useMemo(() => {
    const calls: any[] = []
    
    // Per-chain calls (e.g. Peridot price from Oracle)
    uniqueChainIds.forEach(chainId => {
      const chainConfig = getChainConfig(chainId)
      const oracleAddress = chainConfig && "oracle" in chainConfig ? chainConfig.oracle as `0x${string}` : undefined
      const pPeridotAddress = chainConfig && "markets" in chainConfig && chainConfig.markets && "PDT" in chainConfig.markets ? chainConfig.markets.PDT.pToken as `0x${string}` : undefined
      
      if (oracleAddress && pPeridotAddress) {
        calls.push({
          address: oracleAddress,
          abi: combinedAbi,
          functionName: 'getUnderlyingPrice',
          args: [pPeridotAddress],
          chainId,
          type: 'peridotPrice',
          context: { chainId }
        })
      }
    })

    // Per-position calls
    positions.forEach(pos => {
      const contractAddresses = getAssetContractAddresses(pos.assetId, pos.chainId)
      const chainConfig = getChainConfig(pos.chainId)
      const pTokenAddress = contractAddresses?.pTokenAddress as `0x${string}`
      const oracleAddress = chainConfig && "oracle" in chainConfig ? chainConfig.oracle as `0x${string}` : undefined
      const comptrollerAddress = chainConfig && 'unitrollerProxy' in chainConfig ? chainConfig.unitrollerProxy as `0x${string}`: undefined

      if (!pTokenAddress) return

      const base = { address: pTokenAddress, abi: pTokenAbi, chainId: pos.chainId, context: { assetId: pos.assetId, chainId: pos.chainId } }
      
      calls.push({ ...base, functionName: 'totalBorrows' })
      calls.push({ ...base, functionName: 'reserveFactorMantissa' })
      calls.push({ ...base, functionName: 'interestRateModel' })
      calls.push({ ...base, functionName: 'totalSupply' })
      calls.push({ ...base, functionName: 'exchangeRateStored' })
      
      if (oracleAddress) {
        calls.push({
          address: oracleAddress,
          abi: combinedAbi,
          functionName: 'getUnderlyingPrice',
          args: [pTokenAddress],
          chainId: pos.chainId,
          context: { assetId: pos.assetId, chainId: pos.chainId, type: 'assetPrice' }
        })
      }

      if (comptrollerAddress) {
        calls.push({
          address: comptrollerAddress,
          abi: comptrollerAbi,
          functionName: 'peridotSpeeds',
          args: [pTokenAddress],
          chainId: pos.chainId,
          context: { assetId: pos.assetId, chainId: pos.chainId, type: 'peridotSpeed' }
        })
      }
    })

    return calls
  }, [positions, uniqueChainIds])

  const { data: firstLayerResults, isLoading: isFirstLayerLoading } = useReadContracts({
    contracts: firstLayerCalls.map(({ context, type, ...rest }) => rest),
    query: {
      enabled: firstLayerCalls.length > 0,
      staleTime: 5 * 60 * 1000,
    }
  })

  // 4. Extract data and prepare second layer (InterestRateModel calls)
  const { secondLayerCalls, intermediateData } = useMemo(() => {
    if (!firstLayerResults) return { secondLayerCalls: [], intermediateData: {} }

    const data: any = {}
    const peridotPrices: Record<number, bigint> = {}
    let idx = 0

    // Process per-chain results
    uniqueChainIds.forEach(chainId => {
      const chainConfig = getChainConfig(chainId)
      const oracleAddress = chainConfig && "oracle" in chainConfig ? chainConfig.oracle as `0x${string}` : undefined
      const pPeridotAddress = chainConfig && "markets" in chainConfig && chainConfig.markets && "PDT" in chainConfig.markets ? chainConfig.markets.PDT.pToken as `0x${string}` : undefined
      
      if (oracleAddress && pPeridotAddress) {
        const res = firstLayerResults[idx++]
        if (res?.status === 'success') {
          peridotPrices[chainId] = res.result as bigint
        }
      }
    })

    const calls: any[] = []

    // Process per-position results
    positions.forEach(pos => {
      const key = `${pos.assetId}-${pos.chainId}`
      const contractAddresses = getAssetContractAddresses(pos.assetId, pos.chainId)
      const chainConfig = getChainConfig(pos.chainId)
      const pTokenAddress = contractAddresses?.pTokenAddress as `0x${string}`
      const oracleAddress = chainConfig && "oracle" in chainConfig ? chainConfig.oracle as `0x${string}` : undefined
      const comptrollerAddress = chainConfig && 'unitrollerProxy' in chainConfig ? chainConfig.unitrollerProxy as `0x${string}`: undefined

      if (!pTokenAddress) return

      const totalBorrows = firstLayerResults[idx++]?.result as bigint
      const reserveFactorMantissa = firstLayerResults[idx++]?.result as bigint
      const interestRateModel = firstLayerResults[idx++]?.result as `0x${string}`
      const totalSupply = firstLayerResults[idx++]?.result as bigint
      const exchangeRateStored = firstLayerResults[idx++]?.result as bigint
      
      let assetPrice = BigInt(0)
      if (oracleAddress) {
        assetPrice = firstLayerResults[idx++]?.result as bigint || BigInt(0)
      }

      let peridotSpeed = BigInt(0)
      if (comptrollerAddress) {
        peridotSpeed = firstLayerResults[idx++]?.result as bigint || BigInt(0)
      }

      data[key] = {
        totalBorrows,
        reserveFactorMantissa,
        interestRateModel,
        totalSupply,
        exchangeRateStored,
        assetPrice,
        peridotSpeed,
        peridotPrice: peridotPrices[pos.chainId] || BigInt(0)
      }

      if (interestRateModel) {
        calls.push({
          address: interestRateModel,
          abi: jumpRateModelAbi,
          functionName: 'getBorrowRate',
          args: [BigInt(0), totalBorrows || BigInt(0), BigInt(0)],
          chainId: pos.chainId,
          context: { key }
        })
        calls.push({
          address: interestRateModel,
          abi: jumpRateModelAbi,
          functionName: 'getSupplyRate',
          args: [BigInt(0), totalBorrows || BigInt(0), BigInt(0), reserveFactorMantissa || BigInt(0)],
          chainId: pos.chainId,
          context: { key }
        })
      }
    })

    return { secondLayerCalls: calls, intermediateData: data }
  }, [firstLayerResults, positions, uniqueChainIds])

  const { data: secondLayerResults, isLoading: isSecondLayerLoading } = useReadContracts({
    contracts: secondLayerCalls.map(({ context, ...rest }) => rest),
    query: {
      enabled: secondLayerCalls.length > 0,
      staleTime: 5 * 60 * 1000,
    }
  })

  // 5. Final APY Calculation
  const apyData = useMemo(() => {
    const results: Record<string, ApyDetails> = {}
    if (!intermediateData) return results

    let secondIdx = 0
    positions.forEach(pos => {
      const key = `${pos.assetId}-${pos.chainId}`
      const item = intermediateData[key]
      const dbEntryForPos: DbApyEntry | undefined = dbApyMap?.[pos.assetId]?.[pos.chainId]

      if (!item) {
        // No EVM contracts back this market — Stellar Soroban vaults have none
        // (`stellarSorobanMainnetContracts` carries no `chainId`, so
        // `getChainConfig` misses, and `assetToMarketKey` has no `*-stellar`
        // entries). Returning early here meant these positions got no APY entry
        // at all, so /app/portfolio projected 0%/$0 on deposits the markets
        // table correctly showed yielding.
        //
        // The DB feed is the only source for them — and the right one: these
        // vaults earn through the boost layer, which never existed on-chain.
        if (!dbEntryForPos) return

        // Pass the feed through unfolded, exactly as `useApyData` does. The
        // headline number is `totalSupplyApy`; for these vaults `supplyApy` is
        // genuinely ~0 and the yield sits in `boostSourceApy`.
        results[key] = {
          supplyApy: dbEntryForPos.supplyApy || 0,
          supplyRewardsApy: dbEntryForPos.peridotSupplyApy || 0,
          boostSourceApy: dbEntryForPos.boostSourceSupplyApy || 0,
          boostRewardsApy: dbEntryForPos.boostRewardsSupplyApy || 0,
          totalSupplyApy: dbEntryForPos.totalSupplyApy || 0,
          borrowApy: dbEntryForPos.borrowApy || 0,
          borrowRewardsApy: dbEntryForPos.peridotBorrowApy || 0,
          netBorrowApy: dbEntryForPos.netBorrowApy || 0,
        }
        return
      }

      let borrowRatePerBlock = BigInt(0)
      let supplyRatePerBlock = BigInt(0)

      if (item.interestRateModel) {
        borrowRatePerBlock = secondLayerResults?.[secondIdx++]?.result as bigint || BigInt(0)
        supplyRatePerBlock = secondLayerResults?.[secondIdx++]?.result as bigint || BigInt(0)
      }

      const blocksPerYear = getBlocksPerYear(pos.chainId)
      const MANTISSA = 1e18

      // Base APY calculation
      const calculateApy = (rate: bigint) => {
        const apyBasisPoints = (Number(rate) * blocksPerYear * 100) / MANTISSA
        return apyBasisPoints / 100
      }

      const supplyApy = calculateApy(supplyRatePerBlock)
      const borrowApy = calculateApy(borrowRatePerBlock)

      // Peridot Rewards calculation
      let peridotSupplyApy = 0
      let peridotBorrowApy = 0

      if (item.peridotSpeed && Number(item.peridotSpeed) > 0) {
        const markets = getMarketsForChain(pos.chainId)
        const market = markets.find(m => m.id === pos.assetId)
        const decimals = market?.decimals || 18

        if (item.totalSupply && item.exchangeRateStored && item.assetPrice && item.peridotPrice) {
          const P_TOKEN_DECIMALS = 8
          const totalSupplyValue = (Number(item.totalSupply) * Number(item.exchangeRateStored) * Number(item.assetPrice)) / ((10 ** P_TOKEN_DECIMALS) * MANTISSA * MANTISSA)
          if (totalSupplyValue > 0) {
            const raw = (Number(item.peridotSpeed) * blocksPerYear * Number(item.peridotPrice) * 100) / (totalSupplyValue * MANTISSA)
            peridotSupplyApy = raw / 100
          }
        }

        if (item.totalBorrows && Number(item.totalBorrows) > 0 && item.assetPrice && item.peridotPrice) {
          const totalBorrowValue = (Number(item.totalBorrows) * Number(item.assetPrice)) / MANTISSA
          if (totalBorrowValue > 0) {
            const raw = (Number(item.peridotSpeed) * blocksPerYear * Number(item.peridotPrice) * 100) / (totalBorrowValue * MANTISSA)
            peridotBorrowApy = raw / 100
          }
        }
      }

      // Use DB totalSupplyApy when available — it includes boost components
      // (boostSourceSupplyApy + boostRewardsSupplyApy) that don't exist on-chain.
      // supplyRewardsApy absorbs everything above the base rate so that
      // supplyApy + supplyRewardsApy === totalSupplyApy in all callers.
      const dbEntry = dbEntryForPos
      const dbTotalSupplyApy = dbEntry?.totalSupplyApy ?? 0
      const effectiveRewardsApy = dbTotalSupplyApy > 0
        ? Math.max(0, dbTotalSupplyApy - supplyApy)
        : peridotSupplyApy

      results[key] = {
        supplyApy: supplyApy,
        supplyRewardsApy: effectiveRewardsApy,
        borrowApy: borrowApy,
        borrowRewardsApy: peridotBorrowApy,
        // Live on-chain base + whatever the feed reports above it. Kept as the
        // headline so EVM and Stellar rows are read the same way downstream.
        totalSupplyApy: supplyApy + effectiveRewardsApy,
        // Deliberately 0 on this branch: `effectiveRewardsApy` above already
        // absorbs every layer above the on-chain base, boost included. Echoing
        // the boost fields here as well would let any consumer that sums the
        // components double-count an EVM boosted market.
        boostSourceApy: 0,
        boostRewardsApy: 0,
        netBorrowApy: dbEntry?.netBorrowApy ?? borrowApy,
      }
    })

    return results
  }, [intermediateData, secondLayerResults, positions, dbApyMap])

  return {
    apyData,
    isLoading: isFirstLayerLoading || isSecondLayerLoading
  }
}


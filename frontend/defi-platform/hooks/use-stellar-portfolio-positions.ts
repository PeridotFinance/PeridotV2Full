"use client"

import { useQuery } from "@tanstack/react-query"
import { CHAIN_IDS } from "@/config/contracts"
import { getStellarSorobanMarkets } from "@/data/market-data"
import {
  getStellarVaultConfig,
  stellarFetchPrice,
  stellarGetBorrowBalance,
  stellarGetExchangeRate,
  stellarGetPtokenBalance,
} from "@/lib/stellar-soroban-lending"

export const STELLAR_PORTFOLIO_POSITIONS_QUERY_KEY = "stellar-portfolio-positions"

export interface StellarPortfolioPosition {
  assetId: string
  icon: string
  symbol: string
  chainId: number
  chainName: string
  suppliedBalance: number
  borrowedBalance: number
  suppliedValueUSD: number
  borrowedValueUSD: number
  priceUSD: number
  decimals: number
  pTokenAddress: string
  marketData: any
}

const toBigIntSafe = (value: string) => {
  try {
    return BigInt(value)
  } catch {
    return BigInt(0)
  }
}

export function useStellarPortfolioPositions(stellarAddress?: string | null) {
  const query = useQuery({
    queryKey: [STELLAR_PORTFOLIO_POSITIONS_QUERY_KEY, stellarAddress || ""],
    enabled: Boolean(stellarAddress),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<StellarPortfolioPosition[]> => {
      if (!stellarAddress) return []

      const stellarMarkets = getStellarSorobanMarkets()
      const rows = await Promise.all(
        stellarMarkets.map(async (asset) => {
          const cfg = getStellarVaultConfig(asset.id)
          if (!cfg?.vaultId) return null

          const [ptokenRawStr, borrowRawStr, exchangeRateRawStr, price] = await Promise.all([
            stellarGetPtokenBalance(cfg.vaultId, stellarAddress),
            stellarGetBorrowBalance(cfg.vaultId, stellarAddress),
            stellarGetExchangeRate(cfg.vaultId),
            stellarFetchPrice(asset.id),
          ])

          const ptokenRaw = toBigIntSafe(ptokenRawStr)
          const borrowRaw = toBigIntSafe(borrowRawStr)
          const exchangeRateRaw = toBigIntSafe(exchangeRateRawStr)
          const underlyingScale = BigInt(10) ** BigInt(cfg.decimals)
          const exchangeScale = BigInt(1_000_000)

          // The Soroban ReceiptVault stores ptoken_raw and underlying_raw as a
          // raw-to-raw pair: underlying_raw = ptoken_raw × rate / 1e6.
          // The vault exposes decimals()=6 as SEP-41 metadata, but that value
          // does NOT enter this conversion — verified empirically against all
          // three vaults: total_underlying_raw / total_supply_raw matches
          // exchange_rate/1e6 exactly (ratio 1.0 at rate=1.0). An earlier
          // formula multiplied by underlyingScale/ptokenScale and over-counted
          // by 10× for 7-decimal underlying assets.
          const suppliedUnderlyingRaw =
            ptokenRaw > 0n && exchangeRateRaw > 0n
              ? (ptokenRaw * exchangeRateRaw) / exchangeScale
              : 0n

          const suppliedBalance = Number(suppliedUnderlyingRaw) / Number(underlyingScale)
          const borrowedBalance = Number(borrowRaw) / Number(underlyingScale)
          const priceUSD = Number.isFinite(price ?? Number.NaN) ? Number(price) : 0

          if (suppliedBalance <= 0 && borrowedBalance <= 0) return null

          return {
            assetId: asset.id,
            icon: asset.icon || "",
            symbol: asset.symbol,
            chainId: CHAIN_IDS.STELLAR_MAINNET,
            chainName: "Stellar",
            suppliedBalance,
            borrowedBalance,
            suppliedValueUSD: suppliedBalance * priceUSD,
            borrowedValueUSD: borrowedBalance * priceUSD,
            priceUSD,
            decimals: cfg.decimals,
            pTokenAddress: cfg.vaultId,
            marketData: asset,
          } as StellarPortfolioPosition
        })
      )

      return rows.filter((row): row is StellarPortfolioPosition => Boolean(row))
    },
  })

  return {
    positions: query.data || [],
    // `isLoading` reflects only the true initial load (no cached data yet) and
    // identity changes (new queryKey → no data). It must NOT include
    // `isFetching`: the query polls every 30s and refetches after every action,
    // and folding `isFetching` in here made every background refetch surface as
    // a "loading" state — which callers (AssetTable) turn into a full skeleton
    // swap, so the asset list flashed every 30s. Expose `isFetching` separately
    // for anyone who wants a subtle background-refresh indicator.
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error instanceof Error ? query.error.message : null,
    refetch: query.refetch,
  }
}


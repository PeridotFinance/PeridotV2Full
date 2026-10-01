import { useQuery } from "@tanstack/react-query"
import { CHAIN_IDS } from "@/config/contracts"
import {
  getStellarVaultConfig,
  stellarFetchPrice,
  stellarGetAvailableLiquidity,
  stellarGetBorrowAprPct,
  stellarGetTokenBalance,
  stellarGetTotalBorrowed,
} from "@/lib/stellar-soroban-lending"

type StellarMetricsMap = Record<
  string,
  {
    utilizationPct: number
    tvlUsd: number
    liquidityUnderlying: number
    liquidityUsd: number
    priceUsd: number
    collateralFactorPct: number
    /** Live borrow APR (%) from the on-chain rate model; null if unreadable. */
    borrowAprPct: number | null
    /**
     * Where the pool's underlying actually is, as a share of TVL. Boosted
     * markets forward most idle underlying into a DeFindex/Blend vault, so
     * "90% unused" is misleading — that capital is earning in Blend. Null on
     * markets without a boosted vault (nothing to split).
     */
    blendPct: number | null
    /** Underlying sitting in the Peridot vault itself, as a share of TVL. */
    idlePct: number | null
    /** USD value deployed into the Blend-backed DeFindex vault. */
    blendUsd: number | null
    updatedAt: string
    chainId: number
  }
>

const toBigIntSafe = (value: string) => {
  try {
    return BigInt(value)
  } catch {
    return BigInt(0)
  }
}

export function useStellarMarketMetrics(assetIds: string[], enabled: boolean) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["stellar-market-metrics", assetIds.join(",")],
    enabled: enabled && assetIds.length > 0,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: 2,
    queryFn: async (): Promise<StellarMetricsMap> => {
      const out: StellarMetricsMap = {}
      for (const assetId of assetIds) {
        const cfg = getStellarVaultConfig(assetId)
        if (!cfg?.vaultId || cfg.decimals == null) continue

        const [availableRaw, totalBorrowedRaw, price, heldRaw] = await Promise.all([
          stellarGetAvailableLiquidity(cfg.vaultId),
          stellarGetTotalBorrowed(cfg.vaultId),
          stellarFetchPrice(assetId),
          // Underlying the ReceiptVault holds directly. Everything else that
          // `get_available_liquidity` counts is deployed into the boosted
          // DeFindex vault — verified against the vault's own share accounting
          // on all three mainnet markets (scripts/stellar-probe-boosted-split.mjs).
          cfg.boostedVault
            ? stellarGetTokenBalance(cfg.underlying, cfg.vaultId)
            : Promise.resolve(null),
        ])

        const available = toBigIntSafe(availableRaw)
        const totalBorrowed = toBigIntSafe(totalBorrowedRaw)
        const denom = available + totalBorrowed

        const utilizationPct = denom > 0n
          ? Number((totalBorrowed * 10000n) / denom) / 100
          : 0

        // The indexer often has no borrow-APY row for quiet markets, which
        // used to surface as a flat "0%". Ask the market's rate model for the
        // real rate at the current pool state instead.
        const borrowAprPct = cfg.rateModel
          ? await stellarGetBorrowAprPct(cfg.rateModel, available, totalBorrowed)
          : null

        const priceUsd = Number.isFinite(price ?? NaN) ? (price as number) : 0
        const scale = Math.pow(10, cfg.decimals)
        const liquidityUnderlying = Number(available) / scale
        const totalUnderlying = Number(denom) / scale

        const liquidityUsd = priceUsd > 0 ? liquidityUnderlying * priceUsd : 0
        const tvlUsd = priceUsd > 0 ? totalUnderlying * priceUsd : 0

        // Split the un-borrowed side: what the vault holds itself vs. what is
        // working in Blend. Both are expressed against TVL so the three shares
        // (borrowed + idle + Blend) add up to 100%.
        let blendPct: number | null = null
        let idlePct: number | null = null
        let blendUsd: number | null = null
        if (heldRaw != null && denom > 0n) {
          const held = toBigIntSafe(heldRaw)
          const inBlend = available > held ? available - held : 0n
          blendPct = Number((inBlend * 10000n) / denom) / 100
          idlePct = Number((held * 10000n) / denom) / 100
          blendUsd = priceUsd > 0 ? (Number(inBlend) / scale) * priceUsd : 0
        }

        const key = `${assetId.replace(/_/g, "-").toUpperCase()}:${CHAIN_IDS.STELLAR_MAINNET}`
        out[key] = {
          utilizationPct,
          tvlUsd,
          liquidityUnderlying,
          liquidityUsd,
          priceUsd,
          collateralFactorPct: Number.NaN,
          borrowAprPct,
          blendPct,
          idlePct,
          blendUsd,
          updatedAt: new Date().toISOString(),
          chainId: CHAIN_IDS.STELLAR_MAINNET,
        }
      }
      return out
    },
  })

  return { metrics: data || {}, loading: isLoading, error: error?.message || null }
}

"use client"

import Link from "next/link"
import Image from "next/image"
import React from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { InterestRateCurve } from "@/components/charts/InterestRateCurve"
import { useHybridApy } from "@/hooks/use-hybrid-apy"
import { useMarketDetails } from "@/hooks/use-market-details"
import { useInterestRateCurve } from "@/hooks/use-interest-rate-curve"
import { useBoostedAPR } from "@/hooks/use-boosted-apr"
import { getAssetById, getAssetContractAddresses, AXELAR_CROSS_CHAIN_ASSET_IDS } from "@/data/market-data"
import { useAccount, useReadContract } from "wagmi"
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip"
import { resolveHubReadChainId } from '@/config/contracts'

interface MarketSummaryCardProps {
  assetId: string
  chainId?: number
}

function formatUsd(value: number | null | undefined) {
  if (value == null) return "-"
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value)
  } catch {
    return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
  }
}

function formatPct(value: number | null | undefined) {
  if (value == null) return "-"
  return `${value.toFixed(2)}%`
}

function formatUnderlying(value: number | null | undefined, symbol?: string) {
  if (value == null) return "-"
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}${symbol ? ` ${symbol}` : ''}`
}

export const MarketSummaryCard: React.FC<MarketSummaryCardProps> = ({ assetId, chainId }) => {
  const asset = getAssetById(assetId)
  const { chainId: walletChainId } = useAccount()
  // Route spoke chains to hub chain for reads (BSC when on Arbitrum, etc.)
  const effectiveChainId = resolveHubReadChainId(chainId ?? walletChainId)
  const addresses = effectiveChainId ? getAssetContractAddresses(assetId, effectiveChainId) : null

  // APY prefers DB with on-chain fallback and supports explicit chainId
  const { totalSupplyApy, netBorrowApy, supplyApy, borrowApy, peridotSupplyApy, peridotBorrowApy } = useHybridApy({ assetId, chainId: chainId ?? null }) as any

  // Check if this is a boosted asset
  const isBoosted = asset?.category === "boosted"
  const boostedType = isBoosted ? (assetId.includes('morpho') ? 'morpho' : 'pancake') : null
  
  // Get boosted APR if this is a boosted asset
  const boostedAPR = useBoostedAPR({
    assetId,
    chainId: effectiveChainId ?? chainId ?? undefined,
    boostType: boostedType as 'morpho' | 'pancake' | undefined
  })

  // Use boosted APR if available, otherwise use regular APY
  const displaySupplyApy = isBoosted && !boostedAPR.isLoading 
    ? boostedAPR.total 
    : supplyApy

  // Core market metrics (price, totals, factors, reserves, caps)
  const { data: market, isLoading } = useMarketDetails(assetId, chainId)

  // Utilization curve for mini chart
  const { points, currentUPct } = useInterestRateCurve(assetId, chainId)

  const priceUSD = market?.priceUSD ?? null
  // On-chain precise reads to avoid config-decimal mismatches (e.g., LINK)
  const { data: cashRaw } = useReadContract({
    address: addresses?.pTokenAddress as `0x${string}` | undefined,
    abi: [{ name: 'getCash', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] }] as const,
    functionName: 'getCash',
    args: [],
    chainId: effectiveChainId,
    query: { enabled: Boolean(addresses?.pTokenAddress) }
  })
  const { data: borrowsRaw } = useReadContract({
    address: addresses?.pTokenAddress as `0x${string}` | undefined,
    abi: [{ name: 'totalBorrows', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] }] as const,
    functionName: 'totalBorrows',
    args: [],
    chainId: effectiveChainId,
    query: { enabled: Boolean(addresses?.pTokenAddress) }
  })
  const { data: reservesRaw } = useReadContract({
    address: addresses?.pTokenAddress as `0x${string}` | undefined,
    abi: [{ name: 'totalReserves', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] }] as const,
    functionName: 'totalReserves',
    args: [],
    chainId: effectiveChainId,
    query: { enabled: Boolean(addresses?.pTokenAddress) }
  })
  const { data: underlyingDecimalsRaw } = useReadContract({
    address: addresses?.underlyingAddress as `0x${string}` | undefined,
    abi: [{ name: 'decimals', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint8' }] }] as const,
    functionName: 'decimals',
    args: [],
    chainId: effectiveChainId,
    query: { enabled: Boolean(addresses?.underlyingAddress && !addresses?.isNative) }
  })

  const computedSupplyUnderlying = (() => {
    const cash = market?.liquidityUnderlying
    const borrows = market?.totalBorrowsUnderlying
    const reserves = market?.totalReservesUnderlying
    if (cash == null || borrows == null || reserves == null) return market?.totalSupplyUnderlying ?? null
    return Math.max(0, cash + borrows - reserves)
  })()

  const preciseSupplyUnderlying = (() => {
    const dec = addresses?.isNative ? 18 : (typeof underlyingDecimalsRaw === 'number' ? underlyingDecimalsRaw : (underlyingDecimalsRaw ? Number(underlyingDecimalsRaw) : null))
    if (!dec || cashRaw == null || borrowsRaw == null || reservesRaw == null) return null
    const scale = Math.pow(10, dec)
    const cash = Number(cashRaw) / scale
    const borrows = Number(borrowsRaw) / scale
    const reserves = Number(reservesRaw) / scale
    return Math.max(0, cash + borrows - reserves)
  })()

  const preciseReservesUnderlying = (() => {
    const dec = addresses?.isNative ? 18 : (typeof underlyingDecimalsRaw === 'number' ? underlyingDecimalsRaw : (underlyingDecimalsRaw ? Number(underlyingDecimalsRaw) : null))
    if (!dec || reservesRaw == null) return null
    const scale = Math.pow(10, dec)
    return Number(reservesRaw) / scale
  })()
  const preciseReservesUSD = preciseReservesUnderlying != null && priceUSD != null ? preciseReservesUnderlying * priceUSD : null

  return (
    <Card className="relative overflow-hidden border-border/50 bg-card/70 backdrop-blur-md transition-transform duration-150 hover:translate-y-[-1px] hover:shadow-lg">
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-primary/5 via-transparent to-transparent" />

      <div className="relative p-4 md:p-5 lg:p-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {asset?.icon && (
              <Image src={asset.icon} alt={asset?.symbol || assetId} width={28} height={28} className="rounded-full" />
            )}
            <div>
              <div className="text-sm text-muted-foreground">{asset?.name || assetId.toUpperCase()}</div>
              <div className="text-lg font-semibold tracking-tight">{formatUsd(priceUSD)}</div>
            </div>
          </div>

          <Link href={`/app/markets/${assetId}`} prefetch className="shrink-0">
            <Button size="sm" variant="outline" className="hover:scale-[1.02] transition-transform">View market</Button>
          </Link>
        </div>

        {/* Body */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-5 gap-4">
          {/* Metrics */}
          <div className="md:col-span-3 grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <div className="rounded-lg border border-border/50 p-3 bg-muted/5">
              <div className="text-muted-foreground">Total Supplied</div>
              <div className="font-medium mt-1">{isLoading ? <Skeleton className="h-5 w-32" /> : formatUnderlying(preciseSupplyUnderlying ?? computedSupplyUnderlying, asset?.symbol)}</div>
            </div>
            <div className="rounded-lg border border-border/50 p-3 bg-muted/5">
              <div className="text-muted-foreground">Total Borrowed</div>
              <div className="font-medium mt-1">{isLoading ? <Skeleton className="h-5 w-32" /> : formatUnderlying(market.totalBorrowsUnderlying, asset?.symbol)}</div>
            </div>
            <div className="rounded-lg border border-border/50 p-3 bg-muted/5">
              <div className="text-muted-foreground">Collateral Factor</div>
              <div className="font-medium mt-1">{isLoading ? <Skeleton className="h-5 w-16" /> : formatPct(market.collateralFactor)}</div>
            </div>
            <div className="rounded-lg border border-border/50 p-3 bg-muted/5">
              <div className="text-muted-foreground">Earn APY</div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="font-medium mt-1 cursor-help">
                      {isLoading ? <Skeleton className="h-5 w-28" /> : (
                        isBoosted && !boostedAPR.isLoading ? (
                          <span>
                            {formatPct(displaySupplyApy)}
                            {boostedAPR.breakdown.boostSource > 0 && (
                              <span className="text-muted-foreground"> (+{formatPct(boostedAPR.breakdown.boostSource)} boost)</span>
                            )}
                          </span>
                        ) : (
                          <span>{formatPct(displaySupplyApy)} <span className="text-muted-foreground">({formatPct(peridotSupplyApy)} rewards)</span></span>
                        )
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <div className="text-xs">
                      {isBoosted && !boostedAPR.isLoading ? (
                        <>
                          <div>Lending: {formatPct(boostedAPR.breakdown.lending)}</div>
                          {boostedAPR.breakdown.boostSource > 0 && (
                            <div>Boost: {formatPct(boostedAPR.breakdown.boostSource)}</div>
                          )}
                          {boostedAPR.breakdown.rewards > 0 && (
                            <div>Rewards: {formatPct(boostedAPR.breakdown.rewards)}</div>
                          )}
                          <div className="mt-1 font-medium">Total: {formatPct(boostedAPR.total)}</div>
                        </>
                      ) : (
                        <>
                          <div>Base: {formatPct(supplyApy)}</div>
                          <div>Rewards: {formatPct(peridotSupplyApy)}</div>
                          <div className="mt-1 font-medium">Total: {formatPct(totalSupplyApy)}</div>
                        </>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="rounded-lg border border-border/50 p-3 bg-muted/5">
              <div className="text-muted-foreground">Borrow APY</div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="font-medium mt-1 cursor-help">
                      {isLoading ? <Skeleton className="h-5 w-28" /> : (
                        <span>{formatPct(borrowApy)} <span className="text-muted-foreground">({formatPct(peridotBorrowApy)} rewards)</span></span>
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <div className="text-xs">
                      <div>Base: {formatPct(borrowApy)}</div>
                      <div>Rewards: {formatPct(peridotBorrowApy)}</div>
                      <div className="mt-1 font-medium">Net: {formatPct(netBorrowApy)}</div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="rounded-lg border border-border/50 p-3 bg-muted/5">
              <div className="text-muted-foreground">Reserves</div>
              <div className="font-medium mt-1">
                {isLoading ? (
                  <Skeleton className="h-5 w-28" />
                ) : (
                  <span>
                    {formatUnderlying(preciseReservesUnderlying ?? market.totalReservesUnderlying, asset?.symbol)}
                    {" "}
                    <span className="text-muted-foreground">({formatUsd(preciseReservesUSD ?? market.totalReservesUSD)})</span>
                  </span>
                )}
              </div>
            </div>
            <div className="rounded-lg border border-border/50 p-3 bg-muted/5">
              <div className="text-muted-foreground">Borrow Cap</div>
              <div className="font-medium mt-1">
                {isLoading ? <Skeleton className="h-5 w-24" /> : (market.borrowCapUnderlying != null ? `${market.borrowCapUnderlying.toLocaleString(undefined,{ maximumFractionDigits:2 })} ${asset?.symbol}` : "No cap")}
              </div>
            </div>
          </div>

          {/* Mini utilization chart */}
          <div className="md:col-span-2">
            <div className="rounded-lg border border-border/50 p-2 h-full bg-muted/5">
              <div className="flex items-center justify-between px-2">
                <div className="text-xs text-muted-foreground">Utilization</div>
                <div className="text-xs">{currentUPct != null ? `${currentUPct.toFixed(2)}%` : "-"}</div>
              </div>
              <div className="mt-1 [&_.recharts-legend-wrapper]:hidden [&_.recharts-cartesian-axis]:hidden">
                <InterestRateCurve data={points || []} currentUPct={currentUPct} height={120} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}

export default MarketSummaryCard



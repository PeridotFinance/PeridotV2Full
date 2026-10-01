"use client"

import React, { useState, useMemo, useEffect, useCallback } from "react"
import { useAccount } from 'wagmi'
import { useActiveWallet } from '@/hooks/use-active-wallet'
import { useTheme } from "next-themes"
import dynamic from "next/dynamic"
import { ErrorBoundary } from "@/components/ErrorBoundary"
import { UserPortfolioSummary } from "@/components/shared/UserPortfolioSummary"
import { useCrossChainBalances } from "@/hooks/use-cross-chain-balances"
import { useNetworkContext } from "@/context/index"
import { isHubChain, resolveHubReadChainId, CHAIN_IDS, isStellarNetwork } from "@/config/contracts"
import { useProtocolTVL } from "@/hooks/use-protocol-tvl"
import { useChainTheme } from "@/components/providers/ChainThemeProvider"
import { useChainCopy } from "@/hooks/use-chain-copy"
import { Card, CardContent } from "@/components/ui/card"
import { Info, ChevronDown, RefreshCw } from "lucide-react"
import { AnimatedCounter } from "@/components/ui/animated-components"
import { ChainTVLTooltip } from "@/components/ui/chain-tvl-tooltip"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { FEATURE_FLAGS } from "@/config/featureFlags"
import { cn } from "@/lib/utils"
import { useMobile } from "@/hooks/use-mobile"
import { ApyPrefetcher } from "@/components/portfolio/ApyPrefetcher"

// Live APY data — canonical shape lives with its producer (useBatchApy).
// This page previously declared its own 4-field copy, which drifted from what
// the hook actually emits (boost layers) and from what useCrossChainBalances
// reads. Re-export instead of redeclaring so the shape can only be changed in
// one place.
export type { ChainApyEntry as ApyDetails, LiveApyData } from "@/hooks/use-apy-data"
import type { ChainApyEntry as ApyDetails, LiveApyData } from "@/hooks/use-apy-data"

const EnhancedPortfolioView = dynamic(() => import("@/components/portfolio/EnhancedPortfolioView").then(mod => ({ default: mod.EnhancedPortfolioView })), {
  loading: () => <div className="flex items-center justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>
})

const BORROW_THRESHOLD = 0.01

export default function PortfolioPage() {
  const isMobile = useMobile()
  const { isConnected: isWagmiConnected, chainId } = useAccount()
  const { address, isConnected } = useActiveWallet()
  const { theme, resolvedTheme } = useTheme()
  const effectiveTheme = resolvedTheme || theme || "dark"
  const { selectedNetworkId, getChainIdFromNetworkId } = useNetworkContext()
  const { currentChainTheme, isChainThemeActive, chainThemeCopy } = useChainTheme()
  const { getTagline } = useChainCopy()
  const [isMounted, setIsMounted] = useState(false)
  
  const [liveApyData, setLiveApyData] = useState<LiveApyData>({})

  // Callback for child components to report their APY data
  const handleApyDataUpdate = useCallback((chainId: number, assetId: string, apy: ApyDetails) => {
    setLiveApyData(prev => {
      const existingApy = prev[chainId]?.[assetId];
      // Compare every field, not just the original four. A boost-only change
      // (the layer Stellar vaults actually earn through) would otherwise be
      // treated as "no change" and dropped.
      if (existingApy &&
          existingApy.supplyApy === apy.supplyApy &&
          existingApy.supplyRewardsApy === apy.supplyRewardsApy &&
          existingApy.borrowApy === apy.borrowApy &&
          existingApy.borrowRewardsApy === apy.borrowRewardsApy &&
          existingApy.totalSupplyApy === apy.totalSupplyApy &&
          existingApy.boostSourceApy === apy.boostSourceApy &&
          existingApy.boostRewardsApy === apy.boostRewardsApy) {
        return prev;
      }
      
      const newChainData = { ...(prev[chainId] || {}), [assetId]: apy };
      return { ...prev, [chainId]: newChainData };
    });
  }, []);

  useEffect(() => {
    setIsMounted(true)
  }, [])

  const currentChainId = useMemo(() => {
    if (isStellarNetwork(selectedNetworkId)) return null
    if (isConnected && chainId) return chainId
    return getChainIdFromNetworkId(selectedNetworkId) ?? CHAIN_IDS.BSC_TESTNET
  }, [isConnected, chainId, selectedNetworkId, getChainIdFromNetworkId])

  const { 
    totalSupplied: globalTotalSupplied, 
    totalBorrowed: globalTotalBorrowed, 
    borrowLimitUsed: globalBorrowLimitUsed, 
    netAPY,
    liveNetAPY,
    netEarningsUSD: hookNetEarningsUSD,
    chainBalances,
    allPositions: globalAllPositions,
    isLoading: balancesLoading,
    weightedSupplyAPY,
    weightedBorrowAPY,
    weightedSupplyRewardsAPY,
    weightedBorrowRewardsAPY,
    supplyEarningsUSD,
    supplyRewardsUSD,
    borrowCostsUSD,
    borrowRewardsUSD,
  } = useCrossChainBalances(liveApyData)

  const { 
    totalSupplied, 
    totalBorrowed, 
    borrowLimitUsed, 
    allPositions 
  } = useMemo(() => {
    const globals = {
      totalSupplied: globalTotalSupplied,
      totalBorrowed: globalTotalBorrowed,
      borrowLimitUsed: globalBorrowLimitUsed,
      allPositions: globalAllPositions
    }

    const isHub = isHubChain(currentChainId)
    if (!isHub) return globals

    const effectiveFilterId = resolveHubReadChainId(currentChainId) ?? currentChainId
    const activeChainBalance = chainBalances.find(cb => cb.chainId === effectiveFilterId)

    const positions = activeChainBalance?.positions || []

    // Never let the chain filter report an empty portfolio while positions
    // exist elsewhere. On the Stellar-only host the chain picker is hidden, so
    // `selectedNetworkId` stays pinned at the preset default and this resolved
    // to BSC for every user — zeroing the Overview and Performance tabs for
    // anyone whose funds are on Stellar, while the summary above them still
    // showed the real cross-chain total.
    if (positions.length === 0) return globals

    const supplied = activeChainBalance?.totalSupplied || 0
    const borrowed = activeChainBalance?.totalBorrowed || 0
    const limit = positions.reduce((acc, p) => acc + (p.suppliedValueUSD * ((p.marketData?.maxLTV || 0) / 100)), 0)
    const limitUsed = limit > 0 ? (borrowed / limit) * 100 : 0

    return {
      totalSupplied: supplied,
      totalBorrowed: borrowed,
      borrowLimitUsed: limitUsed,
      allPositions: positions
    }
  }, [
    currentChainId,
    chainBalances,
    globalTotalSupplied,
    globalTotalBorrowed,
    globalBorrowLimitUsed,
    globalAllPositions
  ])

  // Fallback for netEarningsUSD only when the hook produced nothing at all
  // (no live APY data yet). Guarding on `> 0` instead of `!== 0` swallowed
  // genuinely negative results — a portfolio paying more borrow interest than
  // it earns rendered "$0.00/yr" next to a negative percentage, which read as
  // a bug rather than as the (correct) loss it was.
  const netEarningsUSD = useMemo(() => {
    if (hookNetEarningsUSD !== 0) return hookNetEarningsUSD;
    if (globalTotalSupplied <= 0 || liveNetAPY === 0) return 0;
    return (globalTotalSupplied * liveNetAPY) / 100;
  }, [hookNetEarningsUSD, globalTotalSupplied, liveNetAPY]);

  const { 
    totalMarketSize: protocolMarketSize,
    chains: tvlChains,
    isLoading: isTVLLoading, 
  } = useProtocolTVL()

  // Computed over the GLOBAL position set, because the summary card beside it
  // shows global deposits and borrows. Deriving it from the chain-filtered set
  // meant a user with BSC + Stellar funds saw a cross-chain deposit total next
  // to a Health Factor describing only one of those chains.
  const healthFactor = useMemo(() => {
    const totalCollateralValueWeightedByLT = globalAllPositions.reduce((acc, p) => {
      const liquidationThreshold = p.marketData?.liquidationThreshold || 0
      return acc + (p.suppliedValueUSD * (liquidationThreshold / 100))
    }, 0)

    if (!isFinite(totalCollateralValueWeightedByLT) || totalCollateralValueWeightedByLT <= 0) return null
    if (globalTotalBorrowed <= BORROW_THRESHOLD) return Infinity
    return totalCollateralValueWeightedByLT / globalTotalBorrowed
  }, [globalAllPositions, globalTotalBorrowed])

  const InfoContent = () => (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-gradient-to-r from-primary to-primary"></div>
        <h4 className="font-semibold text-primary">How Peridot Works</h4>
      </div>
      <div className="space-y-2.5 text-xs leading-relaxed">
        <div>
          <strong className="text-primary">🔗 Connect Wallet:</strong> Link your Web3 wallet to start earning points on our cross-chain lending platform.
        </div>
        <div>
          <strong className="text-blue-400">💰 Lend & Borrow:</strong> Supply assets to earn APY or borrow against your collateral. Every transaction earns you points.
        </div>
        <div>
          <strong className="text-purple-400">🎯 Earn Points:</strong> Points make you eligible for future token launches, exclusive features, and governance rights.
        </div>
        <div className="border-t border-border/50 pt-2 mt-3">
          <strong className="text-orange-400">📈 Quick Start:</strong> Choose an asset → Supply/Borrow → Earn APY + Points!
        </div>
      </div>
    </div>
  )

  const InfoTrigger = () => (
    <button
      className={cn(
        "relative w-6 h-6 md:w-7 md:h-7 rounded-full transition-all duration-50 ease-out group",
        "backdrop-blur-xl border border-white/20 shadow-lg",
        "bg-gradient-to-br hover:scale-110 active:scale-95",
        "flex items-center justify-center cursor-pointer touch-manipulation",
        isMounted && effectiveTheme === "light" 
          ? "from-white/40 via-white/20 to-white/10 shadow-primary/20 hover:from-white/50 hover:via-white/30 hover:to-white/20 hover:shadow-primary/30" 
          : "from-white/10 via-white/5 to-transparent shadow-primary/20 hover:from-white/15 hover:via-white/10 hover:to-white/5 hover:shadow-primary/40"
      )}
    >
      <div className={cn(
        "absolute inset-0 rounded-full blur-md transition-all duration-50 ease-out",
        "opacity-0 group-hover:opacity-100",
        "bg-gradient-to-r from-primary/20 via-primary/30 to-primary/20"
      )}></div>
      <Info
        className={cn(
          "h-3.5 w-3.5 md:h-4 md:w-4 transition-colors duration-50 relative z-10",
          "text-slate-600 dark:text-white/80",
          "group-hover:text-primary dark:group-hover:text-primary"
        )}
      />
    </button>
  )

  const HeaderIntro = () => (
    <div>
      <div className="flex items-center gap-2">
        <h1 className="text-2xl md:text-3xl font-bold">
          {isConnected
            ? (isChainThemeActive && chainThemeCopy.welcome) || `${currentChainTheme.name} Portfolio`
            : "Your Portfolio"
          }
        </h1>
        {isMobile ? (
          <Popover>
            <PopoverTrigger asChild>
              <InfoTrigger />
            </PopoverTrigger>
            <PopoverContent side="bottom" align="start" className={cn(
              "max-w-[280px] md:max-w-[320px] p-4 text-sm rounded-xl",
              "backdrop-blur-xl border border-white/20 shadow-2xl",
              "bg-gradient-to-br transition-all duration-50",
              isMounted && effectiveTheme === "light"
                ? "from-white/90 via-white/80 to-white/70 shadow-primary/10"
                : "from-background/90 via-background/80 to-background/70 shadow-primary/20"
            )}>
              <InfoContent />
            </PopoverContent>
          </Popover>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <InfoTrigger />
            </TooltipTrigger>
            <TooltipContent 
              side="bottom" 
              align="start"
              className={cn(
                "max-w-[280px] md:max-w-[320px] p-4 text-sm rounded-xl",
                "backdrop-blur-xl border border-white/20 shadow-2xl",
                "bg-gradient-to-br transition-all duration-50",
                isMounted && effectiveTheme === "light"
                  ? "from-white/90 via-white/80 to-white/70 shadow-primary/10"
                  : "from-background/90 via-background/80 to-background/70 shadow-primary/20"
              )}
              sideOffset={8}
            >
              <InfoContent />
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      <p className="text-sm text-muted-foreground mt-1">
        {isConnected ? getTagline() : "Connect your wallet to view your cross-chain portfolio."}
      </p>
    </div>
  )

  return (
    <TooltipProvider delayDuration={100}>
      <ApyPrefetcher 
        positions={globalAllPositions} 
        onApyDataUpdate={handleApyDataUpdate} 
      />
      <div className="w-full max-w-7xl mx-auto md:px-6 py-8 transition-all duration-300">
        <div className="mb-8">
          <Card className="bg-transparent border-border/50 overflow-hidden shadow-sm glass-card soft-shadow">
            <CardContent className="p-6">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <HeaderIntro />
                {FEATURE_FLAGS.SHOW_TOTAL_MARKET_SIZE && (
                  <div className="text-left md:text-right">
                    <p className="text-sm font-medium text-muted-foreground">Total Market Size</p>
                    <ChainTVLTooltip chains={tvlChains} totalMarketSize={protocolMarketSize}>
                      <div className="relative inline-block mt-1">
                        <div className={cn(
                          "text-3xl font-bold transition-all duration-300",
                          "relative px-4 py-2 rounded-xl",
                          "border border-border/30",
                          "bg-gradient-to-br from-background/50 to-background/30",
                          "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1),0_1px_2px_0_rgba(0,0,0,0.1)]",
                          "hover:border-primary/50 hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.15),0_2px_8px_0_rgba(0,0,0,0.15)]",
                          "hover:scale-[1.02] hover:-translate-y-0.5",
                          tvlChains && tvlChains.length > 0 && "cursor-pointer"
                        )}>
                          {isTVLLoading ? (
                            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                          ) : (
                            <div className="flex items-center gap-2">
                              <AnimatedCounter value={protocolMarketSize} prefix="$" duration={0.8} />
                              <ChevronDown className="h-4 w-4 text-muted-foreground opacity-50" />
                            </div>
                          )}
                        </div>
                      </div>
                    </ChainTVLTooltip>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mb-6">
          <UserPortfolioSummary
            totalSupplied={isConnected ? globalTotalSupplied : 0}
            totalBorrowed={isConnected ? globalTotalBorrowed : 0}
            netAPY={isConnected ? liveNetAPY : 0}
            netEarningsUSD={isConnected ? netEarningsUSD : 0}
            healthFactor={isConnected ? (healthFactor === Infinity ? 99.9 : (healthFactor || undefined)) : undefined}
            borrowLimitUsage={isConnected ? globalBorrowLimitUsed : 0}
            theme={theme}
            isLoading={isConnected ? balancesLoading : false}
            chainBalances={isConnected ? chainBalances : []}
            supplyEarningsUSD={isConnected ? supplyEarningsUSD : 0}
            weightedSupplyAPY={isConnected ? weightedSupplyAPY : 0}
            supplyRewardsUSD={isConnected ? supplyRewardsUSD : 0}
            weightedSupplyRewardsAPY={isConnected ? weightedSupplyRewardsAPY : 0}
            borrowRewardsUSD={isConnected ? borrowRewardsUSD : 0}
            weightedBorrowRewardsAPY={isConnected ? weightedBorrowRewardsAPY : 0}
            borrowCostsUSD={isConnected ? borrowCostsUSD : 0}
            weightedBorrowAPY={isConnected ? weightedBorrowAPY : 0}
          />
        </div>

        <ErrorBoundary>
          <EnhancedPortfolioView
            allPositions={allPositions}
            globalAllPositions={globalAllPositions}
            chainBalances={chainBalances}
            totalSupplied={totalSupplied}
            totalBorrowed={totalBorrowed}
            netAPY={liveNetAPY}
            netEarningsUSD={netEarningsUSD}
            liveApyData={liveApyData}
            onApyDataUpdate={handleApyDataUpdate}
            isLoading={balancesLoading}
            borrowLimitUsed={borrowLimitUsed}
          />
        </ErrorBoundary>
      </div>
    </TooltipProvider>
  )
}

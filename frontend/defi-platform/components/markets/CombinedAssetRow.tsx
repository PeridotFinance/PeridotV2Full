"use client"

import React, { useState, useEffect, useRef, memo, useCallback } from "react"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"
import { Asset } from "@/types/markets"
import { TableCell } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import Image from "next/image"
import { AssetDropdown } from "@/components/markets/AssetDropdown"
// framer-motion removed for mobile perf — dropdown uses CSS animate-in
import { usePTokenBalance, usePTokenBalanceTxRefresh } from "@/hooks/use-ptoken-balance"
import { useBoostedPosition } from "@/hooks/use-boosted-position"
import { useDatabaseApy } from "@/hooks/use-database-apy"
import { AXELAR_CROSS_CHAIN_ASSET_IDS } from "@/data/market-data"
import { resolveHubReadChainId, CHAIN_IDS, getDefaultHubChainId, getNetworkAwareChainId, isStellarNetwork } from "@/config/contracts"
import { getStellarVaultConfig } from "@/lib/stellar-soroban-lending"
import { useStellarPrice } from "@/hooks/use-stellar-price"
import { useAccount, useReadContract, useSwitchChain } from "wagmi"
import { formatUnits } from "viem"
import { useLivePrice } from "@/hooks/use-live-price"
import combinedAbi from "@/app/abis/combinedAbi.json"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { AssetPromoBanner } from "@/components/ui/capsule"
import { MARKET_PROMOTIONS } from "@/config/marketPromotions"
import { FEATURE_FLAGS } from "@/config/featureFlags"
import { useWalletBalance } from "@/hooks/use-wallet-balance"
import { useBorrowBalance } from "@/hooks/use-borrow-balance"
import { useMarketMembership } from "@/hooks/use-market-membership"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import Link from "next/link"
import { playHover, playOpen, playClose, playClick } from "@/lib/sound"
import { useNetworkContext } from "@/context"
import { BoostedBadge } from "@/components/ui/boosted-badge"
import { APRBreakdownPopover } from "@/components/ui/apr-breakdown-popover"
import { useBoostedAPR } from "@/hooks/use-boosted-apr"
import { useActiveWallet } from "@/hooks/use-active-wallet"

// Utility function to format percentage with K/M suffixes
const formatPercentage = (value: number): string => {
  if (value >= 10000000) { // 10M%
    return ">10M%"
  } else if (value >= 1000000) { // 1M%
    return `${(value / 1000000).toFixed(1)}M%`
  } else if (value >= 1000) { // 1K%
    return `${(value / 1000).toFixed(1)}K%`
  } else {
    return `${value.toFixed(2)}%`
  }
}

// Utility function to format numbers with K/M/B suffixes
const formatNumber = (num: number, precision = 2) => {
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(precision)}B`;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(precision)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(precision)}K`;
  return num.toFixed(precision);
};

type CombinedAssetRowProps = {
  asset: Asset
  isExpanded: boolean
  onToggleExpanded: (event?: React.MouseEvent) => void
  onTransaction: (
    asset: Asset,
    amount: number,
    type: "supply" | "borrow"
  ) => void
  isDemoMode: boolean
  onApyDataUpdate?: (chainId: number, assetId: string, apy: { supplyApy: number; supplyRewardsApy: number; borrowApy: number; borrowRewardsApy: number; }) => void;
  isTourActive?: boolean
  tourRowAnchorId?: string
  marketMetrics?: Record<string, { utilizationPct: number; tvlUsd: number; updatedAt: string; chainId: number }>
  isMetricsLoading?: boolean
}


// Add a helper for icons
const getChainIcon = (chainId: number) => {
  switch(chainId) {
    case 56: // BSC Mainnet
    case 97: // BSC Testnet
      return "/tokenimages/app/bnb-logo.svg";
    case 143: // Monad Mainnet
    case 10143: // Monad Testnet
      return "/tokenimages/app/Monad-Logo.svg";
    case 50312: // Somnia Testnet
      return "/tokenimages/app/somnia_logo_color.jpg";
    default:
      return null;
  }
}

const getChainName = (chainId: number) => {
   switch(chainId) {
    case 56: // BSC Mainnet
      return "BSC";
    case 97: // BSC Testnet
      return "BSC Testnet";
    case 143: // Monad Mainnet
      return "Monad";
    case 10143: // Monad Testnet
      return "Monad Testnet";
    case 50312: // Somnia Testnet
      return "Somnia";
    default:
      return "Unknown Network";
  }
}

const getNetworkId = (chainId: number): string | undefined => {
  switch(chainId) {
    case 10143: return 'monad';
    case 143: return 'monad';
    case 97:
    case 56: return 'bnb';
    case 42161: return 'arbitrum';
    case 421614: return 'arbitrum';
    case 8453: return 'base';
    case 84532: return 'base';
    case 11155111: return 'eth';
    case 1: return 'eth';
    case 137: return 'polygon';
    case 43114: return 'avalanche';
    case 50312: return 'somnia';
    default: return undefined;
  }
}

const CombinedAssetRowImpl = ({
  asset,
  isExpanded,
  onToggleExpanded,
  onTransaction,
  isDemoMode,
  onApyDataUpdate,
  isTourActive,
  tourRowAnchorId,
  marketMetrics = {},
  isMetricsLoading = false,
}: CombinedAssetRowProps) => {
  const { isConnected: isWagmiConnected, chainId } = useAccount()
  const { address, isConnected } = useActiveWallet()
  const [activeTab, setActiveTab] = useState("supply")
  const [isHovered, setIsHovered] = useState(false)
  const { theme, resolvedTheme } = useTheme()
  const [isMounted, setIsMounted] = useState(false)
  const isDark = isMounted && (resolvedTheme || theme) === "dark"
  const hasSmartContract = asset.hasSmartContract !== false
  const { switchChain } = useSwitchChain()
  const { selectedNetworkId, setSelectedNetworkId, getChainIdFromNetworkId } = useNetworkContext()

  // Animation & Throttling
  const lastToggleTime = useRef(0)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Resolve chain for DB APY via central hub resolver
  // For foreign assets, use their actual chain instead of the current chain
  const apyChainId = asset.availableOnChainId || (() => {
    const baseChainId = isConnected ? chainId : (getChainIdFromNetworkId(selectedNetworkId) ?? null)
    const hubResolved = resolveHubReadChainId(baseChainId ?? null)
    const defaultHubChainId = getDefaultHubChainId(selectedNetworkId)
    return hubResolved ?? defaultHubChainId
  })()

  // Get pToken balance for assets with smart contracts
  const {
    formattedBalance: pTokenBalance,
    numericBalance: pTokenNumericBalance,
    isLoading: isBalanceLoading,
    hasBalance,
    refetch: refetchPToken,
  } = usePTokenBalance({
    assetId: asset.id,
  })

  // Check if this is a boosted asset
  const isBoosted = asset.category === "boosted"

  // Get boosted position value for boosted assets
  const {
    underlyingValue: boostedUnderlyingValue,
    usdValue: boostedUsdValue,
    pTokenBalance: boostedPTokenBalance,
    isLoading: isBoostedPositionLoading,
  } = useBoostedPosition({
    assetId: asset.id,
    chainId: apyChainId,
  })

  // Immediate refresh on tx success/idle
  usePTokenBalanceTxRefresh(refetchPToken)

  // Manual refresh: opening/closing a row should refresh the displayed position balance.
  // This gives users a deterministic way to reconcile list data after recent actions.
  useEffect(() => {
    if (!hasSmartContract) return
    const refresh = () => {
      try { Promise.resolve(refetchPToken?.()).catch(() => {}) } catch {}
      try { setTimeout(() => { Promise.resolve(refetchPToken?.()).catch(() => {}) }, 900) } catch {}
    }
    refresh()
  }, [isExpanded, hasSmartContract, refetchPToken, asset.id])

  // For metrics: use the asset's actual chain for foreign assets, otherwise use chain resolution
  // When no wallet is connected, prioritize the selected network's chain ID to ensure correct metrics lookup
  const metricsChainId = asset.availableOnChainId || (() => {
    if (isStellarNetwork(selectedNetworkId) && getStellarVaultConfig(asset.id)) {
      return CHAIN_IDS.STELLAR_MAINNET
    }
    // If wallet is connected, use wallet's chain (resolved through hub if needed)
    if (isConnected && chainId) {
      return resolveHubReadChainId(chainId) ?? chainId
    }
    // If no wallet, use the selected network's chain ID directly
    if (selectedNetworkId) {
      try {
        const chainIdFromNetwork = getChainIdFromNetworkId(selectedNetworkId)
        if (chainIdFromNetwork) {
          return chainIdFromNetwork
        }
      } catch (e) {
        // Fallback if context is not available
      }
    }
    // Final fallback
    return getNetworkAwareChainId(isConnected, chainId, selectedNetworkId)
  })()

  // Get APY data from database only (avoid on-chain RPCs in list view)
  const {
    supplyApy: liveSupplyApy,
    borrowApy: liveBorrowApy,
    peridotSupplyApy,
    peridotBorrowApy,
    totalSupplyApy,
    netBorrowApy,
    isLoading: isApyLoading,
    error: apyError,
  } = useDatabaseApy({ assetId: asset.id, chainId: apyChainId })

  // Get live price from oracle
  // Always price against the hub (BSC) so supplied USD reflects destination chain
  const hubChainId = resolveHubReadChainId(chainId ?? null) ?? getDefaultHubChainId(selectedNetworkId)
  const shouldFetchLivePrice = hasSmartContract && (isExpanded || hasBalance)

  const { price: livePrice, hasValidPrice } = useLivePrice({
    assetId: asset.id,
    enabled: shouldFetchLivePrice && !(getStellarVaultConfig(asset.id) && isStellarNetwork(selectedNetworkId)),
    chainIdOverride: hubChainId,
  })

  const { price: stellarPrice, hasValidPrice: hasValidStellarPrice } = useStellarPrice(
    asset.id,
    shouldFetchLivePrice && !!(getStellarVaultConfig(asset.id) && isStellarNetwork(selectedNetworkId))
  )

  // Always use live data from smart contracts, or for foreign assets that have live data
  const displaySupplyApy = (hasSmartContract || asset.availableOnChainId)
    ? liveSupplyApy
    : asset.supplyApy

  const displayBorrowApy = (hasSmartContract || asset.availableOnChainId)
    ? liveBorrowApy
    : asset.borrowApy

  // Boosted APR calculation
  const boostedType = isBoosted
    ? asset.id.endsWith('-stellar')
      ? 'defindex'
      : asset.id.includes('morpho')
        ? 'morpho'
        : asset.id.includes('magma')
          ? 'magma'
          : 'pancake'
    : null
  const boostedAPR = useBoostedAPR({
    assetId: asset.id,
    chainId: apyChainId,
    boostType: boostedType as 'morpho' | 'pancake' | 'magma' | 'defindex' | undefined
  })

  // Use boosted APR if available
  const finalDisplaySupplyApy = isBoosted && !boostedAPR.isLoading ?
    boostedAPR.total :
    displaySupplyApy

  const displayPrice = hasSmartContract && (hasValidStellarPrice && stellarPrice != null)
    ? stellarPrice
    : hasSmartContract && hasValidPrice ? livePrice : asset.price

  // Report live APY data up to the parent component
  useEffect(() => {
    if (hasSmartContract && !isApyLoading && apyChainId) {
      // Use boosted APR if available, otherwise use regular APR
      const effectiveSupplyApy = isBoosted && !boostedAPR.isLoading ? boostedAPR.total : liveSupplyApy

      onApyDataUpdate?.(apyChainId, asset.id, {
        supplyApy: effectiveSupplyApy,
        supplyRewardsApy: peridotSupplyApy,
        borrowApy: liveBorrowApy,
        borrowRewardsApy: peridotBorrowApy,
      })
    }
  }, [
    asset.id,
    apyChainId,
    hasSmartContract,
    isApyLoading,
    liveSupplyApy,
    peridotSupplyApy,
    liveBorrowApy,
    peridotBorrowApy,
    onApyDataUpdate,
    isBoosted,
    boostedAPR,
  ])

  const handleChainSwitch = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (asset.availableOnChainId) {
      if (isConnected) {
        try {
          await switchChain({ chainId: asset.availableOnChainId })
        } catch (error) {
          console.error("Failed to switch chain:", error)
        }
      } else {
        const networkId = getNetworkId(asset.availableOnChainId)
        if (networkId) {
          setSelectedNetworkId(networkId)
        }
      }
    }
  }

  const handleClick = useCallback((event: React.MouseEvent) => {
    if (hasSmartContract) {
      const now = Date.now()
      if (now - lastToggleTime.current < 400) return // Debounce rapid toggles
      lastToggleTime.current = now

      // Play open/close sound based on current state
      if (isExpanded) {
        playClose()
      } else {
        playOpen()
      }
      onToggleExpanded(event)
    }
  }, [hasSmartContract, isExpanded, onToggleExpanded])

  // Standardize asset ID to match backend format
  const standardizedAssetId = asset.id.replace(/_/g, '-').toUpperCase()
  const metricsKey = `${standardizedAssetId}:${metricsChainId}`
  

  const serverMetrics = marketMetrics[metricsKey]
  const hasServerMetrics = serverMetrics !== undefined
  // Check if metrics exist and are not undefined, even if 0
  const serverUtilization = hasServerMetrics ? Number(serverMetrics.utilizationPct) : undefined
  const serverTvl = hasServerMetrics ? Number(serverMetrics.tvlUsd) : undefined

  // Show loading state if metrics are loading and we don't have data yet
  const shouldShowMetricsLoading = isMetricsLoading && !hasServerMetrics
  // Only use real server data - no mock fallbacks
  const displayUtilization = hasServerMetrics && serverUtilization !== undefined ? serverUtilization : undefined
  const displayTvl = hasServerMetrics && serverTvl !== undefined ? serverTvl : undefined

  return (
    <>
      <tr
        id={tourRowAnchorId}
        className={cn(
          "relative group transition-all duration-300 ease-out",
          isExpanded
            ? "border-b-0 bg-gradient-to-r from-white/[0.04] to-white/[0.02] dark:from-white/[0.05] dark:to-white/[0.03]"
            : "border-b border-white/10",
          hasSmartContract 
            ? "cursor-pointer hover:border-white/20 hover:bg-gradient-to-r hover:from-white/[0.02] hover:to-white/[0.01] dark:hover:from-white/[0.03] dark:hover:to-white/[0.02] hover:shadow-sm hover:shadow-primary/5" 
            : "cursor-not-allowed opacity-50"
        )}
        onMouseEnter={() => {
          if (hasSmartContract) {
            setIsHovered(true)
            playHover()
          }
        }}
        onMouseLeave={() => hasSmartContract && setIsHovered(false)}
        onClick={handleClick}
      >
        <TableCell className="relative pl-2 sm:pl-4 pr-2 py-3 sm:py-4">
          <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
            <div
              className={cn(
                "w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center relative overflow-hidden flex-shrink-0 transition-all duration-300 ease-out",
                hasSmartContract && "hover:scale-110 hover:rotate-3 group-hover:shadow-lg group-hover:shadow-primary/20"
              )}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-accent/20 rounded-full blur-sm group-hover:blur-md transition-all duration-300"></div>
              <div className="absolute inset-0 bg-card rounded-full group-hover:bg-gradient-to-br group-hover:from-card group-hover:to-card/80 transition-all duration-300"></div>
              <Image
                src={asset.icon}
                alt={asset.name}
                width={24}
                height={24}
                className="relative z-10 sm:w-8 sm:h-8 transition-transform duration-300 group-hover:scale-105"
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-medium text-sm sm:text-base flex items-center gap-1 sm:gap-2 flex-wrap min-w-0 overflow-hidden">
                <span className="truncate min-w-0 max-w-[90px] sm:max-w-none">
                  {asset.name}
                </span>
                {asset.category === "boosted" && (
                  <BoostedBadge
                    type={asset.id.includes('morpho') ? 'morpho' : 'lp'}
                    size="sm"
                  />
                )}
                {!hasSmartContract && !asset.availableOnChainId ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="secondary" className="text-xs px-1 py-0 flex-shrink-0 cursor-help">
                        Coming Soon
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">
                      <p className="text-sm">This asset is coming soon to our lending platform. Check back later for updates!</p>
                    </TooltipContent>
                  </Tooltip>
                ) : null}
                {FEATURE_FLAGS.MARKETS_PROMO_BANNER && (() => {
                  const promo = MARKET_PROMOTIONS[asset.id] || MARKET_PROMOTIONS[asset.symbol]
                  return promo ? (
                    <span className="ml-1">
                      <AssetPromoBanner
                        label={promo.label}
                        tooltip={promo.tooltip}
                        rewardsApy={promo.rewardsApy ?? null}
                        variant={promo.variant}
                        glow={promo.glow}
                      />
                    </span>
                  ) : null
                })()}
                {/* NEW: Foreign Chain Indicator - Interactive Button */}
                {!hasSmartContract && asset.availableOnChainId && (
                   <Tooltip>
                      <TooltipTrigger asChild>
                         <button
                            onClick={handleChainSwitch}
                            className={cn(
                              "flex items-center gap-1.5 pl-1.5 pr-2.5 py-0.5 rounded-full transition-all duration-300 group/btn",
                              "bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20",
                              "backdrop-blur-sm hover:shadow-sm hover:shadow-primary/10 hover:scale-105 active:scale-95"
                            )}
                         >
                            <div className="relative w-3.5 h-3.5 flex items-center justify-center">
                              <Image
                                src={getChainIcon(asset.availableOnChainId) || ""}
                                alt={`Switch to ${getChainName(asset.availableOnChainId)}`}
                                width={14}
                                height={14}
                                className="rounded-full transition-transform group-hover/btn:rotate-12"
                              />
                            </div>
                            <span className="text-[10px] font-semibold text-foreground/80 group-hover/btn:text-foreground transition-colors">
                              {getChainName(asset.availableOnChainId).replace(' Testnet', '')}
                            </span>
                         </button>
                      </TooltipTrigger>
                      <TooltipContent>
                         <p>Click to switch to {getChainName(asset.availableOnChainId)} and view this asset</p>
                      </TooltipContent>
                   </Tooltip>
                )}
              </div>
              <div className="text-xs text-text/60">{asset.symbol}</div>
            </div>
          </div>

          {/* Mobile-only tap chevron */}
          {hasSmartContract && (
            <svg
              className={cn(
                "sm:hidden ml-auto flex-shrink-0 w-3 h-3 text-muted-foreground/40 transition-transform duration-200",
                isExpanded && "rotate-90"
              )}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          )}

          <div
            className={cn(
              "absolute left-0 top-0 bottom-0 w-[3px] bg-primary rounded-full transition-all duration-200 ease-out",
              isHovered ? "h-full opacity-100" : "h-0 opacity-0"
            )}
          />
        </TableCell>

        {/* Desktop: Separate columns for Supply and Borrow APY */}
        <TableCell className="whitespace-nowrap text-center hidden sm:table-cell py-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex flex-col items-center cursor-help">
                <div className={`font-medium ${hasSmartContract && (!isMounted || isApyLoading) ? 'text-gray-400' : ' dark:text-neutral-200'}`}>
                  {hasSmartContract && (!isMounted || isApyLoading) ? (
                    <div className="h-4 w-14 rounded bg-muted/40 animate-pulse" />
                  ) : (
                    <span className="flex items-center gap-1">
                      {isBoosted && !boostedAPR.isLoading ? (
                        <APRBreakdownPopover
                          totalAPR={finalDisplaySupplyApy}
                          breakdown={[
                            {
                              label: "Lending APR",
                              value: boostedAPR.breakdown.lending,
                              color: "#10b981"
                            },
                            {
                              label:
                                boostedType === 'morpho'
                                  ? "Morpho Vault"
                                  : boostedType === 'defindex'
                                    ? "Blend via DeFindex"
                                    : "LP Fees",
                              value: boostedAPR.breakdown.boostSource,
                              color: "#8b5cf6"
                            },
                            ...(boostedAPR.breakdown.rewards > 0 ? [{
                              label: "Merkl Rewards",
                              value: boostedAPR.breakdown.rewards,
                              color: "#f59e0b",
                              isReward: true,
                              link: "https://app.merkl.xyz/users/"
                            }] : [])
                          ]}
                          trigger={
                            <div className="text-primary font-medium flex items-center gap-1 cursor-pointer hover:text-primary/80">
                              {finalDisplaySupplyApy.toFixed(2)}%
                              <div className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-pulse" title="Boosted yield breakdown" />
                            </div>
                          }
                        />
                      ) : (
                        <>
                          {finalDisplaySupplyApy.toFixed(2)}%
                          {finalDisplaySupplyApy > 10 && (
                            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" title="High yield" />
                          )}
                        </>
                      )}
                    </span>
                  )}
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <p className="text-sm">
                {hasSmartContract && (!isMounted || isApyLoading) 
                  ? "Loading current supply APY from blockchain..."
                  : isBoosted && !boostedAPR.isLoading
                    ? `Boosted Supply APR: ${finalDisplaySupplyApy.toFixed(2)}% (Lending: ${boostedAPR.breakdown.lending.toFixed(2)}% + ${boostedType === 'morpho' ? 'Morpho' : 'LP'}: ${boostedAPR.breakdown.boostSource.toFixed(2)}%${boostedAPR.breakdown.rewards > 0 ? ` + Rewards: ${boostedAPR.breakdown.rewards.toFixed(2)}%` : ''})`
                    : `Earn ${finalDisplaySupplyApy.toFixed(2)}% annually by supplying ${asset.symbol}. ${finalDisplaySupplyApy > 10 ? 'High yield opportunity!' : 'Stable returns.'}`
                }
              </p>
            </TooltipContent>
          </Tooltip>
        </TableCell>

        {/* Desktop: Utilization column (server) */}
        <TableCell className="whitespace-nowrap text-center hidden sm:table-cell py-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex flex-col items-center cursor-help">
                <div className={`font-medium ${shouldShowMetricsLoading || (!isMounted) ? 'text-gray-400' : 'text-green-500 dark:text-green-400'}`}>
                  {shouldShowMetricsLoading || (!isMounted) ? (
                    <div className="h-4 w-16 rounded bg-muted/40 animate-pulse" />
                  ) : displayUtilization !== undefined ? (
                    <div className="flex items-center gap-2">
                      <span>{Math.round(Math.min(displayUtilization, 100))}%</span>
                      <div className="w-8 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div 
                          className={`h-full transition-all duration-300 ${
                            displayUtilization > 80 ? 'bg-green-600' :
                            displayUtilization > 60 ? 'bg-green-500' : 'bg-green-400'
                          }`}
                          style={{ width: `${Math.min(displayUtilization, 100)}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                    <span className="text-xs text-text/60">N/A</span>
                  )}
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <p className="text-sm">
                {shouldShowMetricsLoading || (!isMounted)
                  ? "Loading market utilization data..."
                  : displayUtilization !== undefined
                    ? `Market utilization: ${Math.round(Math.min(displayUtilization, 100))}% of total supply is borrowed. ${
                        displayUtilization > 80 ? 'Very high demand - excellent market activity!' :
                        displayUtilization > 60 ? 'High demand - healthy market activity' : 'Moderate demand - good market participation'
                      }`
                    : 'Utilization data not available'
                }
              </p>
            </TooltipContent>
          </Tooltip>
        </TableCell>

        <TableCell className="whitespace-nowrap text-center hidden sm:table-cell py-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex flex-col items-center cursor-help">
                <div className={`font-medium ${(hasSmartContract || asset.availableOnChainId) && (!isMounted || isApyLoading) ? 'text-gray-400' : 'dark:text-neutral-200'}`}>
                  {(hasSmartContract || asset.availableOnChainId) && (!isMounted || isApyLoading) ? (
                    <div className="h-4 w-14 rounded bg-muted/40 animate-pulse" />
                  ) : (
                    <span className="flex items-center gap-1">
                      {displayBorrowApy.toFixed(2)}%
                      {displayBorrowApy < 5 && (
                        <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" title="Low cost borrowing" />
                      )}
                    </span>
                  )}
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <p className="text-sm">
                {hasSmartContract && (!isMounted || isApyLoading) 
                  ? "Loading current borrow APY from blockchain..."
                  : `Borrow ${asset.symbol} at ${liveBorrowApy.toFixed(2)}% annually. ${liveBorrowApy < 5 ? 'Low cost opportunity!' : 'Competitive rates.'}`
                }
              </p>
            </TooltipContent>
          </Tooltip>
        </TableCell>

        {/* TVL column - hidden on mobile */}
        <TableCell className="text-center px-1 py-3 sm:py-4 hidden sm:table-cell">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex flex-col items-center space-y-1 cursor-help">
                <div className="text-sm font-semibold">
                  {shouldShowMetricsLoading || (!isMounted) ? (
                    <div className="h-4 w-12 rounded bg-muted/40 animate-pulse" />
                  ) : (() => {
                    const tvlUsd = displayTvl
                    return tvlUsd !== undefined ? (
                      <div className="flex items-center gap-1">
                        <span>${formatNumber(tvlUsd)}</span>
                        {tvlUsd > 10000000 && (
                          <div className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-pulse" title="High liquidity" />
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-text/60">N/A</span>
                    )
                  })()}
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <p className="text-sm">
                {shouldShowMetricsLoading || (!isMounted)
                  ? "Loading TVL data..."
                  : (() => {
                      const tvlUsd = displayTvl
                      return tvlUsd !== undefined
                        ? `Total Value Locked: $${formatNumber(tvlUsd)} in this market. ${tvlUsd > 10000000 ? 'High liquidity - easy to enter/exit' : 'Moderate liquidity - good for most users'}`
                        : 'TVL data not available'
                    })()
                }
              </p>
            </TooltipContent>
          </Tooltip>
        </TableCell>

        {/* Mobile: Combined APY column (rewards removed) */}
        <TableCell className="text-center sm:hidden px-1 py-3 sm:py-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex flex-col items-center space-y-1 cursor-help">
                {(hasSmartContract || asset.availableOnChainId) && (!isMounted || isApyLoading) ? (
                  <div className="h-3 w-16 rounded bg-muted/40 animate-pulse" />
                ) : (hasSmartContract || asset.availableOnChainId) ? (
                  <div className="flex items-center space-x-1">
                    {isBoosted ? (
                      <APRBreakdownPopover
                        totalAPR={finalDisplaySupplyApy}
                        breakdown={[
                          {
                            label: "Lending APR",
                            value: boostedAPR.breakdown.lending,
                            color: "#10b981"
                          },
                          {
                            label: boostedType === 'morpho' ? "Morpho Vault" : "LP Fees",
                            value: boostedAPR.breakdown.boostSource,
                            color: "#8b5cf6"
                          },
                          ...(boostedAPR.breakdown.rewards > 0 ? [{
                            label: "Merkl Rewards",
                            value: boostedAPR.breakdown.rewards,
                            color: "#f59e0b",
                            isReward: true,
                            link: "https://app.merkl.xyz/users/"
                          }] : [])
                        ]}
                        trigger={
                          <div className="text-xs text-primary font-medium flex items-center gap-1 cursor-pointer hover:text-primary/80">
                            {formatPercentage(finalDisplaySupplyApy)}
                            <div className="w-1 h-1 bg-purple-500 rounded-full animate-pulse" />
                          </div>
                        }
                      />
                    ) : (
                      <div className="text-xs text-primary font-medium flex items-center gap-1">
                        {formatPercentage(finalDisplaySupplyApy)}
                        {finalDisplaySupplyApy > 10 && (
                          <div className="w-1 h-1 bg-green-500 rounded-full animate-pulse" />
                        )}
                      </div>
                    )}
                    <div className="text-xs text-text/60">|</div>
                    <div className="text-xs text-orange-500 font-medium flex items-center gap-1">
                      {formatPercentage(displayBorrowApy)}
                      {displayBorrowApy < 5 && (
                        <div className="w-1 h-1 bg-blue-500 rounded-full animate-pulse" />
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-text/60">-</div>
                )}

              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <p className="text-sm">
                {isBoosted && !boostedAPR.isLoading
                  ? `Boosted Supply APR: ${finalDisplaySupplyApy.toFixed(2)}% (Lending: ${boostedAPR.breakdown.lending.toFixed(2)}% + ${boostedType === 'morpho' ? 'Morpho' : 'LP'}: ${boostedAPR.breakdown.boostSource.toFixed(2)}%${boostedAPR.breakdown.rewards > 0 ? ` + Morpho Rewards: ${boostedAPR.breakdown.rewards.toFixed(2)}%` : ''})`
                  : hasSmartContract && (!isMounted || isApyLoading)
                  ? "Loading current APY rates from blockchain..."
                  : hasSmartContract
                    ? `Supply: ${finalDisplaySupplyApy.toFixed(2)}% APY | Borrow: ${displayBorrowApy.toFixed(2)}% APY. ${finalDisplaySupplyApy > 10 ? 'High supply yield!' : ''} ${displayBorrowApy < 5 ? 'Low borrow cost!' : ''}`
                    : "APY data not available for this asset."
                }
              </p>
            </TooltipContent>
          </Tooltip>
        </TableCell>

        <TableCell className="text-right px-1 sm:px-4 py-3 sm:py-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex flex-col items-end cursor-help">
                <div className="font-medium text-sm truncate max-w-[120px] sm:max-w-none">
                  {hasSmartContract && isConnected && isMounted ? (
                    (isBalanceLoading || (isBoosted && isBoostedPositionLoading)) ? (
                      <div className="space-y-1 flex flex-col items-end">
                        <div className="h-4 w-20 rounded bg-muted/40 animate-pulse" />
                        <div className="h-3 w-12 rounded bg-muted/40 animate-pulse" />
                      </div>
                    ) : (
                      (() => {
                        if (isBoosted) {
                          // Use boosted position values for boosted assets, fallback to pToken balance
                          const amtNum = boostedUnderlyingValue || Number(pTokenNumericBalance) || 0
                          const amtUsd = boostedUsdValue || (displayPrice ? amtNum * displayPrice : 0)
                          const amountDisplay = amtUsd > 0 && amtUsd < 0.01 ? '0.00' : amtNum.toFixed(6)
                          return (
                            <div className="flex items-center gap-1">
                              <span>{amountDisplay} {asset.symbol}</span>
                              {amtNum > 0 && (
                                <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" title="Active boosted position" />
                              )}
                            </div>
                          )
                        } else {
                          // Use regular pToken balance for non-boosted assets
                          const amtNum = Number.isFinite(pTokenNumericBalance) ? pTokenNumericBalance : 0
                          const amtUsd = (displayPrice || 0) * amtNum
                          const amountDisplay = amtUsd > 0 && amtUsd < 0.01 ? '0.00' : pTokenBalance
                          return (
                            <div className="flex items-center gap-1">
                              <span>{amountDisplay} {asset.symbol}</span>
                              {amtNum > 0 && (
                                <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" title="Active position" />
                              )}
                            </div>
                          )
                        }
                      })()
                    )
                  ) : (
                    <div className="flex items-center gap-1">
                      <span>{asset.wallet}</span>
                      <div className="w-1.5 h-1.5 bg-gray-400 rounded-full" title="Demo data" />
                    </div>
                  )}
                </div>
                <div className="text-xs text-text/60 truncate max-w-[120px] sm:max-w-none">
                  {hasSmartContract && isConnected && isMounted ? (
                    (() => {
                      if (isBoosted) {
                        // Show boosted position USD value, fallback to pToken calculation
                        const usdValue = boostedUsdValue || (Number(pTokenNumericBalance) * displayPrice) || 0
                        return usdValue > 0
                          ? `$${usdValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : "$0.00"
                      } else {
                        // Show regular position USD value
                        const hasPosition = hasBalance && Number.isFinite(pTokenNumericBalance) && pTokenNumericBalance > 0
                        return hasPosition
                          ? `$${((pTokenNumericBalance * displayPrice)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : "$0.00"
                      }
                    })()
                  ) : (
                    `$${((parseFloat(asset.wallet.split(" ")[0]) || 0) * displayPrice).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}`
                  )}
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-xs">
              <p className="text-sm">
                {hasSmartContract && isConnected && isMounted ? (
                  (() => {
                    if (isBoosted) {
                      // Show boosted position details
                      const hasBoostedPosition = boostedUnderlyingValue > 0
                      return hasBoostedPosition
                        ? `Your boosted position: ${boostedUnderlyingValue.toFixed(6)} ${asset.symbol} worth $${boostedUsdValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : "No boosted position. Click to start supplying to this boosted market."
                    } else {
                      // Show regular position details
                      return hasBalance
                        ? `Your supply position: ${pTokenBalance} ${asset.symbol} worth $${(((Number.isFinite(pTokenNumericBalance) ? pTokenNumericBalance : 0) * displayPrice)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : "No supply position. Click to start supplying this asset."
                    }
                  })()
                ) : (
                  "Connect your wallet to see your actual supply balance and start earning rewards."
                )}
              </p>
            </TooltipContent>
          </Tooltip>
        </TableCell>

        {/* Expand Button Column */}
        <TableCell className="text-center px-2 py-4 hidden sm:table-cell">
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleClick(e)
            }}
            disabled={!hasSmartContract}
            className={cn(
              "inline-flex items-center justify-center",
              "w-10 h-10 rounded-2xl",
              "backdrop-blur-md transition-all duration-300",
              "border border-white/10",
              // Liquid glass neomorphism - subtle
              "bg-gradient-to-br from-white/5 via-white/2 to-transparent",
              "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1),0_2px_8px_rgba(0,0,0,0.1)]",
              // Hover effects
              hasSmartContract && "hover:from-white/10 hover:via-white/5 hover:to-white/2",
              hasSmartContract && "hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.15),0_4px_12px_rgba(0,0,0,0.15)]",
              hasSmartContract && "hover:border-white/20",
              hasSmartContract && "hover:scale-105 active:scale-95",
              // Dark mode adjustments
              "dark:from-white/3 dark:via-white/1 dark:to-transparent",
              hasSmartContract && "dark:hover:from-white/6 dark:hover:via-white/3 dark:hover:to-white/1",
              "dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_2px_8px_rgba(0,0,0,0.3)]",
              hasSmartContract && "dark:hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1),0_4px_12px_rgba(0,0,0,0.4)]",
              // Disabled state
              !hasSmartContract && "opacity-30 cursor-not-allowed"
            )}
          >
            <svg 
              className={cn(
                "w-4 h-4 transition-all duration-300",
                isExpanded ? "rotate-90 text-foreground" : "text-muted-foreground",
                hasSmartContract && "hover:text-foreground"
              )}
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M9 5l7 7-7 7" 
              />
            </svg>
          </button>
        </TableCell>
      </tr>
      
      {/* Expand Dropdown — pure CSS animation for mobile performance */}
      {isExpanded && (
        <tr className="border-0">
          <td colSpan={8} className="p-0 border-0">
            <div className="animate-in fade-in-0 slide-in-from-top-1 duration-200 ease-out">
              <AssetDropdown
                asset={asset}
                isOpen={isExpanded}
                onClose={onToggleExpanded}
                onTransaction={onTransaction}
                isDemoMode={isDemoMode}
                supplyRewardsApy={peridotSupplyApy}
                borrowRewardsApy={peridotBorrowApy}
              />
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

export const CombinedAssetRow = memo(CombinedAssetRowImpl)

"use client"

import { TooltipTrigger } from "@/components/ui/tooltip"
// import { DemoDataModal } from "@/components/DemoDataModal" // Temporarily disabled
import {
  Asset,
  StakingAsset,
} from "@/types/markets"
import { getMarketsWithPrioritization, getStellarSorobanMarkets } from "@/data/market-data"
import { stakingAssets } from "@/data/staking-data"
import { generateChartData } from "@/lib/chart-utils"
import { AnimatedCounter, MiniChart, AnimatedCard, DonutChart } from "@/components/ui/animated-components"
import { CombinedAssetRow } from "@/components/markets/CombinedAssetRow"
import { ErrorBoundary } from "@/components/ErrorBoundary"

import React, { useState, useEffect, useCallback, useRef, useMemo, Suspense } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  TrendingUp,
  TrendingDown,
  Info,
  RefreshCw,
  Search,
  X,
  HelpCircle,
  PiggyBank,
  Zap,
  Table as TableIcon,
  TrendingUp as TrendingUpIcon,
  ChevronDown,
  Star,
} from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipProvider } from "@/components/ui/tooltip"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useAccount } from 'wagmi'
import { useActiveWallet } from '@/hooks/use-active-wallet'
import { ConnectWalletButton } from "@/components/wallet/connect-wallet-button"
import { motion, AnimatePresence, useInView } from "framer-motion"
import { FEATURE_FLAGS } from "@/config/featureFlags"
import RewardsHud from "@/components/markets/RewardsHud"
import ManageDashboard from "@/components/markets/ManageDashboard"
import { OnboardingGuide } from "@/components/shared/OnboardingGuide"
import { UserPortfolioSummary } from "@/components/shared/UserPortfolioSummary"
import MarketBanners from "@/components/markets/MarketBanners"
import AllMarketsGuide from "@/components/markets/AllMarketsGuide"
import { ApyPrefetcher } from "@/components/portfolio/ApyPrefetcher"
import { useDailyLogin } from "@/hooks/use-daily-login"
import { DailyLoginPopup } from "@/components/ui/daily-login-popup"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"
import { useMobile } from "@/hooks/use-mobile"
import { Progress } from "@/components/ui/progress"
import { useRouter } from "next/navigation"
import { useCrossChainBalances } from "@/hooks/use-cross-chain-balances"
import { usePTokenBalance } from "@/hooks/use-ptoken-balance"
import { useBorrowBalance } from "@/hooks/use-borrow-balance"
import { ChainThemeApplicator, useChainTheme } from "@/components/providers/ChainThemeProvider"
import { useChainCopy } from "@/hooks/use-chain-copy"
import { useProtocolTVL } from "@/hooks/use-protocol-tvl"
import type { Network } from "@/components/ui/network-switcher"
import { NetworkSwitcher } from "@/components/ui/network-switcher"
import { useNetworkContext } from "@/context/index"
import { CHAIN_IDS, resolveHubReadChainId, isHubChain, getNetworkAwareChainId, isStellarNetwork } from "@/config/contracts"
import { getStellarVaultConfig } from "@/lib/stellar-soroban-lending"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { useFeatureTour } from "@/hooks/use-feature-tour"
import { useRestorePreMarginChain } from "@/hooks/use-restore-pre-margin-chain"
import { FeatureTour } from "@/components/tour/FeatureTour"
import { useLivePrice } from "@/hooks/use-live-price"
import ActionRewardPopup from "@/components/ui/ActionRewardPopup"
import { usePeridotRewards } from "@/hooks/use-peridot-rewards"
import { useMarketMetrics } from "@/hooks/use-market-metrics"
import { useStellarMarketMetrics } from "@/hooks/use-stellar-market-metrics"
import { ChainSwitchDialog } from "@/components/ui/ChainSwitchDialog"
import { ChainTVLTooltip } from "@/components/ui/chain-tvl-tooltip"
import { TVLMarquee } from "@/components/ui/tvl-marquee"
import { RiskDisclaimerModal } from "@/components/RiskDisclaimerModal"
import dynamic from "next/dynamic"

// Lazy-load SimplifiedAssetTable with code splitting for optimal performance
const SimplifiedAssetTable = dynamic(
  () => import("@/components/markets/simplified").then(mod => ({ default: mod.SimplifiedAssetTable })),
  {
    loading: () => (
      <div className="flex items-center justify-center py-16 animate-in fade-in-0 duration-300">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin"></div>
          <p className="text-sm text-muted-foreground">Loading simplified view...</p>
        </div>
      </div>
    ),
    ssr: false, // Client-side only for better initial load
  }
)


// Chart data utility imported from lib/chart-utils

// AnimatedCounter imported from components/ui/animated-components

// MiniChart imported from components/ui/animated-components

// AnimatedCard imported from components/ui/animated-components

// DonutChart imported from components/ui/animated-components

// AssetDropdown imported from components/markets/AssetDropdown

// CombinedAssetRow imported from components/markets/CombinedAssetRow

// Portfolio Detail Modal component - now imported from external file

// Staking Management Modal component - now imported from external file



// Live APY data — canonical shape lives with its producer (useApyData).
// This page used to declare a narrower 4-field copy, which no longer matched
// what useCrossChainBalances consumes (it reads the boost layers).
export type { ChainApyEntry as ApyDetails, LiveApyData } from "@/hooks/use-apy-data"
import type { ChainApyEntry as ApyDetails, LiveApyData } from "@/hooks/use-apy-data"

// Helper function for chain display names
function getChainDisplayName(chainId: number | null): string {
  switch (chainId) {
    case 1:
      return "Ethereum"
    case 11155111:
      return "Ethereum Sepolia"
    case 56:
      return "BNB Smart Chain"
    case 97:
      return "BNB Testnet"
    case 42161:
      return "Arbitrum"
    case 421614:
      return "Arbitrum Sepolia"
    case 137:  // Polygon mainnet
      return "Polygon"
    case 8453:
      return "Base"
    case 84532:
      return "Base Sepolia"
    case 10143:
      return "Monad"
    case 50312:
      return "Somnia Testnet"
    case 43114:  // Avalanche mainnet
      return "Avalanche"
    default:
      return "Unknown Chain"
  }
}

const tourSteps = [
  {
    elementId: 'tour-step-0-wallet-connect',
    title: 'Connect Your Wallet',
    content: (
      <div>
        Connect your wallet to start earning points on our cross-chain lending platform.
      </div>
    ),
  },
  {
    elementId: 'tour-step-5-markets-tab',
    title: 'Markets',
    content: (
      <div>
        View all available assets to supply or borrow. Click the Markets tab to explore different assets and their APYs.
      </div>
    ),
  },
  {
    elementId: 'tour-step-2-net-apy',
    title: 'Your Dashboard',
    content: (
      <div>
        Monitor your net APY, supply balance, borrow balance, and borrow limit. This dashboard shows your overall position across all assets.
      </div>
    ),
  },
];

// Threshold for considering borrowing as effectively zero (to avoid division by tiny numbers in health factor calculation)
const BORROW_THRESHOLD = 0.01 // $0.01 USD

const MONAD_WELCOME_MESSAGES = [
  "Peridot <3 Monad! 💜",
  "Welcome to the fast lane on Monad! 🏎️",
  "Purple power activated! 🟣",
  "Gmon! 💜 Time to speedrun DeFi.",
  "10,000 TPS and you're still reading this? ⚡",
  "Purple Mode Activated. 🟣",
  "Blink and you'll miss the transaction. 💨",
  "Peridot + Monad = 💜⚡",
]

// Whitelist of wallet addresses that can expand Pancake LP boosted markets (automatically normalized to lowercase)
// Note: Morpho boosted markets (AUSD and USDC) are accessible to everyone
const PANCAKE_BOOSTED_MARKETS_WHITELIST = new Set([
  // Add wallet addresses here that should have access to Pancake LP boosted markets (any format works)
  // Example: '0x1234567890123456789012345678901234567890'
  '0xac56fc480bea95f30e66f7fef2b4564762645eee', // Your test wallet
  '0x01D3602e9A20b1322dd44BDD478AFdb6FcF82355', // Can be added in any case format
  '0x50b2433ae52afb3fbd2dffe1f8624d1950281412'
].map(addr => addr.toLowerCase()))

export default function OldDashboardPage() {
  const { theme, resolvedTheme } = useTheme()
  const effectiveTheme = resolvedTheme || theme || "dark"
  const isMobile = useMobile()
  const { isConnected: isWagmiConnected, isConnecting, chainId } = useAccount()
  const { address, isConnected } = useActiveWallet()
  const { selectedNetworkId, setSelectedNetworkId, getChainIdFromNetworkId } = useNetworkContext()
  const { showPopup, closePopup, lastClaimResult, loginStreak } = useDailyLogin()
  const { currentChainTheme, chainThemeCopy, isChainThemeActive } = useChainTheme()
  const { getWelcomeMessage, getTagline } = useChainCopy()
  const showMobileAccountUI = isMobile && isConnected

  // Silently restore the wallet to the chain the user was on before entering
  // margin-trading mode (which forces a switch to Somnia testnet).
  // If the wallet is still on Somnia when landing here, this switches it back
  // so market reads, APY data, and transactions all target the correct chain.
  useRestorePreMarginChain()
  
  const [monadMessage, setMonadMessage] = useState("")

  useEffect(() => {
    setMonadMessage(MONAD_WELCOME_MESSAGES[Math.floor(Math.random() * MONAD_WELCOME_MESSAGES.length)])
  }, [chainId]) // Update message when chain changes or on mount

  // Fetch metrics once at page level (not per-row!)
  const { metrics: marketMetrics, loading: isMetricsLoading } = useMarketMetrics()

  // Debug logging for market metrics
  useEffect(() => {
    if (marketMetrics && Object.keys(marketMetrics).length > 0) {
      const monadKeys = Object.keys(marketMetrics).filter(k => k.includes(':143') || k.includes(':10143'))
      console.log('[Market Metrics Debug] Monad keys in API response:', monadKeys)
      console.log('[Market Metrics Debug] Total metrics keys:', Object.keys(marketMetrics).length)
      if (monadKeys.length > 0) {
        console.log('[Market Metrics Debug] Sample Monad metrics:', monadKeys.slice(0, 10).map(k => ({ key: k, data: marketMetrics[k] })))
      } else {
        console.log('[Market Metrics Debug] No Monad keys found! Available chain IDs:', [...new Set(Object.keys(marketMetrics).map(k => k.split(':')[1]))])
      }
    }
  }, [marketMetrics])

  const [marketData, setMarketData] = useState<Asset[]>(getMarketsWithPrioritization())

  const stellarAssetIds = useMemo(
    () => marketData.filter(a => getStellarVaultConfig(a.id)).map(a => a.id),
    [marketData]
  )
  const { metrics: stellarMetrics, loading: isStellarMetricsLoading } = useStellarMarketMetrics(
    stellarAssetIds,
    isStellarNetwork(selectedNetworkId)
  )
  const mergedMarketMetrics = useMemo(
    () => ({ ...marketMetrics, ...stellarMetrics }),
    [marketMetrics, stellarMetrics]
  )
  const [expandedAssetId, setExpandedAssetId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  // Sorting
  const [sortBy, setSortBy] = useState<'asset' | 'supplyApy' | 'borrowApy' | 'utilization' | 'balance' | 'tvl'>('supplyApy')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  
  // State to hold live APY data from child components
  const [liveApyData, setLiveApyData] = useState<LiveApyData>({})

  // Callback for child components to report their APY data
  const handleApyDataUpdate = useCallback((chainId: number, assetId: string, apy: ApyDetails) => {
    setLiveApyData(prev => {
      const existingApy = prev[chainId]?.[assetId];
      if (existingApy && 
          existingApy.supplyApy === apy.supplyApy &&
          existingApy.supplyRewardsApy === apy.supplyRewardsApy &&
          existingApy.borrowApy === apy.borrowApy &&
          existingApy.borrowRewardsApy === apy.borrowRewardsApy) {
        return prev;
      }
      
      const newChainData = { ...(prev[chainId] || {}), [assetId]: apy };
      return { ...prev, [chainId]: newChainData };
    });
  }, []);

  // 1. Hoist currentChainId determination to top-level for filtering.
  //
  // Design principle: selectedNetworkId (set by the NetworkSwitcher) is the
  // single source of truth for what markets the user wants to see.  The wallet's
  // raw chainId is only used when it AGREES with that selection, or when the user
  // is on a spoke chain (Arbitrum, Base, etc.) where there is no "hub mismatch".
  //
  // This prevents the classic post-margin bug: wallet stranded on Somnia testnet
  // while selectedNetworkId is still 'bnb' → page showed Somnia (0-APY) markets
  // because chainId was used unconditionally.
  const currentChainId = useMemo(() => {
    if (isStellarNetwork(selectedNetworkId)) return null

    const selectedChainId = getChainIdFromNetworkId(selectedNetworkId) ?? CHAIN_IDS.BSC_TESTNET

    if (!isConnected || !chainId) return selectedChainId

    // Spoke chains route through the hub anyway; use wallet chain so resolveHubReadChainId
    // can map them correctly (e.g. Arbitrum → BSC).
    if (!isHubChain(chainId)) return chainId

    // For hub chains: only use the wallet chain when it matches the selected network.
    // A mismatch (e.g. wallet on Somnia but selectedNetworkId = 'bnb') means the wallet
    // is stranded from a previous session — trust the switcher's selection and let the
    // restoration hook switch the wallet to align.
    return chainId === selectedChainId ? chainId : selectedChainId
  }, [isConnected, chainId, selectedNetworkId, getChainIdFromNetworkId])

  // Real cross-chain balance data with live APY
  const { 
    totalSupplied: globalTotalSupplied, 
    totalBorrowed: globalTotalBorrowed, 
    borrowLimit: globalBorrowLimit,
    borrowLimitUsed: globalBorrowLimitUsed, 
    netAPY, // Keep global Net APY as requested
    liveNetAPY,
    weightedSupplyAPY,
    weightedBorrowAPY,
    weightedSupplyRewardsAPY,
    weightedBorrowRewardsAPY,
    supplyEarningsUSD,
    supplyRewardsUSD,
    borrowCostsUSD,
    borrowRewardsUSD,
    netEarningsUSD: hookNetEarningsUSD,
    chainBalances,
    allPositions: globalAllPositions,
    isLoading: balancesLoading,
    error: balancesError 
  } = useCrossChainBalances(liveApyData)

  // Calculate a fallback for netEarningsUSD if the hook returns 0 due to missing live APY data
  const netEarningsUSD = useMemo(() => {
    if (hookNetEarningsUSD > 0) return hookNetEarningsUSD;
    if (globalTotalSupplied <= 0 || liveNetAPY <= 0) return 0;
    return (globalTotalSupplied * liveNetAPY) / 100;
  }, [hookNetEarningsUSD, globalTotalSupplied, liveNetAPY]);

  // 2. Derive Context-Aware Metrics
  // - Hub Chains (BSC, Monad): Show ONLY that chain's data (Isolated View)
  // - Spoke Chains (Arbitrum, etc.): Show AGGREGATED data (Dashboard View)
  const { 
    totalSupplied, 
    totalBorrowed, 
    borrowLimit, 
    borrowLimitUsed, 
    allPositions 
  } = useMemo(() => {
    // Check if current chain is a Hub (has its own isolated lending pool)
    const isHub = isHubChain(currentChainId)

    if (!isHub) {
      // Spoke Chain: User isn't "on" a specific pool, so show their Global Portfolio
      return {
        totalSupplied: globalTotalSupplied,
        totalBorrowed: globalTotalBorrowed,
        borrowLimit: globalBorrowLimit,
        borrowLimitUsed: globalBorrowLimitUsed,
        allPositions: globalAllPositions
      }
    }

    // Hub Chain: Filter to show only this chain's risk context
    // We map currentChainId to its "Read ID" to match how useCrossChainBalances keys data
    // (e.g. if multiple chain IDs map to one hub in the backend)
    const effectiveFilterId = resolveHubReadChainId(currentChainId) ?? currentChainId
    
    const activeChainBalance = chainBalances.find(cb => cb.chainId === effectiveFilterId)
    
    // Default to empty/zero if no data found for this specific chain
    const positions = activeChainBalance?.positions || []
    const supplied = activeChainBalance?.totalSupplied || 0
    const borrowed = activeChainBalance?.totalBorrowed || 0
    
    // Recalculate Borrow Limit just for this chain
    // Formula: Sum(CollateralValue * CollateralFactor) for local positions only
    const limit = positions.reduce((acc, p) => acc + (p.suppliedValueUSD * ((p.marketData?.maxLTV || 0) / 100)), 0)
    
    // Calculate usage safely
    const limitUsed = limit > 0 ? (borrowed / limit) * 100 : 0

    return {
      totalSupplied: supplied,
      totalBorrowed: borrowed,
      borrowLimit: limit,
      borrowLimitUsed: limitUsed,
      allPositions: positions
    }
  }, [
    currentChainId,
    chainBalances,
    globalTotalSupplied,
    globalTotalBorrowed,
    globalBorrowLimit,
    globalBorrowLimitUsed,
    globalAllPositions
  ])

  // Protocol TVL data
  const { 
    totalTVL: protocolTVL,
    totalMarketSize: protocolMarketSize,
    chains: tvlChains,
    isLoading: isTVLLoading, 
    error: tvlError 
  } = useProtocolTVL()
  const [searchTerm, setSearchTerm] = useState("")
  const [debugExpandAll, setDebugExpandAll] = useState(false)
  const [debugFilterAssetId, setDebugFilterAssetId] = useState<string>("")
  const router = useRouter()
  const [supplyChartData, setSupplyChartData] = useState<Array<{day: number; value: number}>>([])
  const [borrowChartData, setBorrowChartData] = useState<Array<{day: number; value: number}>>([])
  
  // Handle tab parameter from URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const tab = urlParams.get('tab')
    if (tab && ['markets', 'guide'].includes(tab)) {
      // Tab functionality removed, ignoring URL parameter
    }
  }, [])
  const [isDemoMode, setIsDemoMode] = useState(true)
  // Lazy markets table pagination state
  const [page, setPage] = useState(1)
  const pageSize = 5
  const overscan = 4
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const isSentinelInView = useInView(sentinelRef, { amount: 0.1 })
  const [sentinelExited, setSentinelExited] = useState(true)
  const [isMounted, setIsMounted] = useState(false)
  const [showComingSoonBanner, setShowComingSoonBanner] = useState(false)
  const [isDebuggerVisible, setIsDebuggerVisible] = useState(false)
  const [rewardOpen, setRewardOpen] = useState(false)
  const rewardMetaRef = useRef<{ action: 'supply' | 'borrow' | 'repay' | 'redeem'; tokenSymbol?: string } | null>(null)
  const [isManageDashboardOpen, setIsManageDashboardOpen] = useState(false)
  const [isPortfolioExpanded, setIsPortfolioExpanded] = useState(false)
  const { accruedRewards, isLoadingAccruedRewards, isClaiming, claimRewards } = usePeridotRewards()

  // Chain switch dialog state
  const [previousChainId, setPreviousChainId] = useState<number | null>(null)
  const [showChainSwitchDialog, setShowChainSwitchDialog] = useState(false)

  // Markets view mode: 'table' for current table view, 'simplified' for aggregated view
  const [viewMode, setViewMode] = useState<'table' | 'simplified'>('table')

  // Prefetch state for lazy-loaded components
  const [simplifiedPrefetched, setSimplifiedPrefetched] = useState(false)

  // Boosted markets notification state
  const [showBoostedComingSoon, setShowBoostedComingSoon] = useState(false)
  const [notificationPosition, setNotificationPosition] = useState<{ x: number; y: number } | null>(null)
  
  // Prefetch SimplifiedAssetTable on hover for instant feel
  const prefetchSimplifiedView = useCallback(() => {
    if (!simplifiedPrefetched) {
      import("@/components/markets/simplified").then(() => {
        setSimplifiedPrefetched(true)
      }).catch(err => {
        console.error("Failed to prefetch SimplifiedAssetTable:", err)
      })
    }
  }, [simplifiedPrefetched])


  const { isTourActive, currentStep, nextStep, prevStep, stopTour } = useFeatureTour(tourSteps.length);


  useEffect(() => {
    // Simulate loading data on mount
    setIsLoading(true)
    setTimeout(() => {
      setSupplyChartData(generateChartData(30, 0.05, true))
      setBorrowChartData(generateChartData(30, 0.08, true))
      setIsLoading(false)
    }, 1500)
  }, [])

  useEffect(() => {
    const doRefresh = () => handleRefresh();
    window.addEventListener('custom:refresh', doRefresh);
    return () => window.removeEventListener('custom:refresh', doRefresh);
  }, []);

  // Global listener for tx success → show reward popup
  useEffect(() => {
    const onTxSuccess = (e: any) => {
      try {
        const detail = e?.detail || {}
        const action = detail.type as 'supply' | 'borrow' | 'repay' | 'redeem'
        if (!action) return
        rewardMetaRef.current = { action, tokenSymbol: detail?.tokenSymbol || detail?.assetId }
        setRewardOpen(true)
      } catch {}
    }
    window.addEventListener('peridot:tx-success', onTxSuccess as any)
    return () => window.removeEventListener('peridot:tx-success', onTxSuccess as any)
  }, [])

  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Track chain changes for dialog
  useEffect(() => {
    if (isConnected && chainId && chainId !== previousChainId) {
      if (previousChainId !== null && !isHubChain(chainId)) {
        setShowChainSwitchDialog(true)
      }
      setPreviousChainId(chainId)
    }
  }, [chainId, previousChainId, isConnected])

  // Update market data when chain changes
  
  useEffect(() => {
    const isStellarSelected = selectedNetworkId === "stellar-soroban-mainnet"
    const newMarketData = isStellarSelected
      ? getStellarSorobanMarkets()
      : getMarketsWithPrioritization(currentChainId ?? undefined)
    setMarketData(prev => {
      // Prevent unnecessary updates
      if (JSON.stringify(prev) === JSON.stringify(newMarketData)) {
        return prev
      }
      return newMarketData
    })
  }, [currentChainId, selectedNetworkId])

  const handleRefresh = () => {
    setIsLoading(true)
    setTimeout(() => {
      setMarketData([...getMarketsWithPrioritization(chainId)].sort(() => Math.random() - 0.5))
      setSupplyChartData(generateChartData(30, 0.05, Math.random() > 0.5))
      setBorrowChartData(generateChartData(30, 0.08, Math.random() > 0.5))
      // Note: Real balance data now comes from useCrossChainBalances hook
      setIsLoading(false)
    }, 1000)
  }

  const handleToggleExpanded = (assetId: string, event?: React.MouseEvent) => {
    if (FEATURE_FLAGS.MARKETS_DEBUG_TOOLBAR && debugExpandAll) {
      // In expand-all mode, keep rows open; clicking toggles the focused one
      setExpandedAssetId((prev) => (prev === assetId ? null : assetId))
      return
    }

    // Check if trying to expand a boosted market
    const asset = marketData.find(a => a.id === assetId)
    const isBoostedMarket = asset?.category === 'boosted'
    
    // Only restrict Pancake LP boosted markets - Morpho boosted markets are accessible to everyone
    const isPancakeBoosted = assetId.includes('pancake-boosted')
    const userAddress = address?.toLowerCase() || ''
    
    // Only check whitelist for Pancake LP boosted markets
    if (isBoostedMarket && isPancakeBoosted && !PANCAKE_BOOSTED_MARKETS_WHITELIST.has(userAddress)) {
      console.log('Pancake boosted market access denied:', {
        assetId,
        userAddress,
        isWhitelisted: PANCAKE_BOOSTED_MARKETS_WHITELIST.has(userAddress),
        whitelist: Array.from(PANCAKE_BOOSTED_MARKETS_WHITELIST)
      })

      // Show coming soon notification for non-whitelisted users
      setShowBoostedComingSoon(true)
      setNotificationPosition(null) // Reset position first

      // Calculate position based on click location
      if (event) {
        const rect = event.currentTarget.getBoundingClientRect()
        let x = rect.left + rect.width / 2
        const y = rect.top - 10 // Position above the clicked element
        
        // Get viewport width and popup width estimate
        const viewportWidth = window.innerWidth
        // Estimate popup width: content (~240px) + padding (px-4 on mobile = 16px, px-6 on desktop = 24px)
        const popupWidth = Math.min(280, viewportWidth - 32) // Cap at viewport width minus margins
        const margin = 16 // Minimum margin from screen edges
        
        // Adjust x position to keep popup within viewport
        const popupLeftEdge = x - popupWidth / 2
        const popupRightEdge = x + popupWidth / 2
        
        if (popupLeftEdge < margin) {
          // Too far left, align to left edge with margin
          x = popupWidth / 2 + margin
        } else if (popupRightEdge > viewportWidth - margin) {
          // Too far right, align to right edge with margin  
          x = viewportWidth - popupWidth / 2 - margin
        }

        setNotificationPosition({ x, y })
      }

      // Auto-hide after 3 seconds
      setTimeout(() => {
        setShowBoostedComingSoon(false)
        setNotificationPosition(null)
      }, 3000)
      return
    }

    setExpandedAssetId(expandedAssetId === assetId ? null : assetId)
  }

  const handleTransaction = (
    targetAsset: Asset,
    numericAmount: number,
    type: "supply" | "borrow"
  ) => {
    if (!isDemoMode) return;

    // Note: Real transactions would trigger contract calls and update balances automatically
    // For demo mode, we only update the market data display
    setMarketData((prevData) =>
      prevData.map((asset) => {
        if (asset.id === targetAsset.id) {
          const currentWalletAmount = parseFloat(asset.wallet.split(" ")[0]) || 0;
          const newWalletAmount = currentWalletAmount + numericAmount;
          return {
            ...asset,
            wallet: `${newWalletAmount.toFixed(2)} ${asset.symbol}`,
          };
        }
        return asset;
      })
    );
  };

  const filteredMarketData = marketData
    .filter(
      (asset) =>
        asset.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        asset.symbol.toLowerCase().includes(searchTerm.toLowerCase()),
    )
    .filter((asset) =>
      FEATURE_FLAGS.MARKETS_DEBUG_TOOLBAR && debugFilterAssetId
        ? asset.id === debugFilterAssetId
        : true,
    )
    .filter((asset) => {
      // Filter out stock markets if disabled via feature flag
      if (!FEATURE_FLAGS.STOCK_MARKETS_ENABLED && asset.category === "stock") return false
      // Filter out non-smart-contract teaser rows (e.g. Stellar external-link row)
      if (asset.hasSmartContract === false) return false
      return true
    })

  // Compute visible assets based on feature flag
  const visibleAssets = FEATURE_FLAGS.LAZY_MARKETS_TABLE
    ? filteredMarketData.slice(0, page * pageSize + overscan)
    : filteredMarketData

  // Sorted assets derived from visible list (keeps lazy-loading behavior intact)
  const sortedAssets = useMemo(() => {
    const assets = [...visibleAssets]
    const getBalanceNumeric = (wallet: string): number => {
      if (!wallet || typeof wallet !== 'string') return 0

      // Handle cases like "0.000402 BTCB", "1,234.56 USDC", or just "0"
      const parts = wallet.trim().split(/\s+/)
      if (parts.length === 0) return 0

      // Extract the numeric part (first part should be the number)
      const amountStr = parts[0]?.replace(/[<,>]/g, '') || '0'
      const n = parseFloat(amountStr)
      return isNaN(n) ? 0 : n
    }
    assets.sort((a, b) => {
      // Priority 1: Interactive local assets (on current chain, can interact)
      const isInteractiveLocalA = !a.availableOnChainId && a.hasSmartContract !== false
      const isInteractiveLocalB = !b.availableOnChainId && b.hasSmartContract !== false

      if (isInteractiveLocalA && !isInteractiveLocalB) return -1  // Interactive local first
      if (!isInteractiveLocalA && isInteractiveLocalB) return 1   // Interactive local first

      // Priority 2: Non-interactive local assets (coming soon, like Stellar)
      const isNonInteractiveLocalA = !a.availableOnChainId && a.hasSmartContract === false
      const isNonInteractiveLocalB = !b.availableOnChainId && b.hasSmartContract === false

      if (isNonInteractiveLocalA && !isNonInteractiveLocalB) return -1  // Non-interactive local second
      if (!isNonInteractiveLocalA && isNonInteractiveLocalB) return 1   // Non-interactive local second

      // Priority 3: Foreign assets (from other chains)
      const isForeignA = !!a.availableOnChainId
      const isForeignB = !!b.availableOnChainId

      if (isForeignA && !isForeignB) return -1  // Foreign assets last
      if (!isForeignA && isForeignB) return 1   // Foreign assets last

      let av = 0, bv = 0
      switch (sortBy) {
        case 'asset':
          av = a.name.localeCompare(b.name)
          return sortDir === 'asc' ? av : -av
        case 'supplyApy':
          // Use asset's native chain for foreign assets, resolved hub chain for local assets (spoke chains route to hub)
          const supplyChainIdA = a.availableOnChainId || resolveHubReadChainId(currentChainId) || currentChainId
          const supplyChainIdB = b.availableOnChainId || resolveHubReadChainId(currentChainId) || currentChainId
          av = (liveApyData[supplyChainIdA]?.[a.id]?.supplyApy ?? a.supplyApy ?? 0);
          bv = (liveApyData[supplyChainIdB]?.[b.id]?.supplyApy ?? b.supplyApy ?? 0)
          break
        case 'utilization':
          {
            const metricsChainId = (isStellarNetwork(selectedNetworkId) && getStellarVaultConfig(a.id))
              ? CHAIN_IDS.STELLAR_MAINNET
              : (resolveHubReadChainId(chainId ?? null) ?? getNetworkAwareChainId(isConnected, chainId, selectedNetworkId))
            const metricsKeyA = `${a.id.toUpperCase()}:${metricsChainId}`
            const metricsChainIdB = (isStellarNetwork(selectedNetworkId) && getStellarVaultConfig(b.id))
              ? CHAIN_IDS.STELLAR_MAINNET
              : (resolveHubReadChainId(chainId ?? null) ?? getNetworkAwareChainId(isConnected, chainId, selectedNetworkId))
            const metricsKeyB = `${b.id.toUpperCase()}:${metricsChainIdB}`
            // Use real metrics or 0 as fallback (assets without metrics will sort to bottom)
            av = Number(marketMetrics?.[metricsKeyA]?.utilizationPct ?? 0)
            bv = Number(marketMetrics?.[metricsKeyB]?.utilizationPct ?? 0)
          }
          break
        case 'tvl':
          {
            const metricsChainId = (isStellarNetwork(selectedNetworkId) && getStellarVaultConfig(a.id))
              ? CHAIN_IDS.STELLAR_MAINNET
              : (resolveHubReadChainId(chainId ?? null) ?? getNetworkAwareChainId(isConnected, chainId, selectedNetworkId))
            const metricsKeyA = `${a.id.toUpperCase()}:${metricsChainId}`
            const metricsChainIdB = (isStellarNetwork(selectedNetworkId) && getStellarVaultConfig(b.id))
              ? CHAIN_IDS.STELLAR_MAINNET
              : (resolveHubReadChainId(chainId ?? null) ?? getNetworkAwareChainId(isConnected, chainId, selectedNetworkId))
            const metricsKeyB = `${b.id.toUpperCase()}:${metricsChainIdB}`
            // Use real metrics or 0 as fallback (assets without metrics will sort to bottom)
            av = Number(marketMetrics?.[metricsKeyA]?.tvlUsd ?? 0)
            bv = Number(marketMetrics?.[metricsKeyB]?.tvlUsd ?? 0)
          }
          break
        case 'borrowApy':
          // Use asset's native chain for foreign assets, resolved hub chain for local assets (spoke chains route to hub)
          const borrowChainIdA = a.availableOnChainId || resolveHubReadChainId(currentChainId) || currentChainId
          const borrowChainIdB = b.availableOnChainId || resolveHubReadChainId(currentChainId) || currentChainId
          av = (liveApyData[borrowChainIdA]?.[a.id]?.borrowApy ?? a.borrowApy ?? 0);
          bv = (liveApyData[borrowChainIdB]?.[b.id]?.borrowApy ?? b.borrowApy ?? 0)
          break
        case 'balance':
          av = getBalanceNumeric(a.wallet); bv = getBalanceNumeric(b.wallet)
          break
      }
      return sortDir === 'asc' ? av - bv : bv - av
    })
    return assets
  }, [visibleAssets, sortBy, sortDir, liveApyData, currentChainId, marketMetrics])

  // Update Asset.wallet fields with real balance data from useCrossChainBalances
  useEffect(() => {
    if (!allPositions || allPositions.length === 0) return

    setMarketData(prevData => {
      const updatedData = prevData.map(asset => {
        // Find the corresponding position for this asset
        const position = allPositions.find(pos => pos.assetId === asset.id)
        if (!position) return asset

        // Calculate total wallet balance (supplied + any wallet balance)
        const walletBalance = position.suppliedBalance

        // Format the balance as "number SYMBOL"
        const formattedBalance = walletBalance > 0
          ? `${walletBalance.toFixed(6)} ${asset.symbol}`
          : `0 ${asset.symbol}`

        // Only update if the balance has changed
        if (asset.wallet !== formattedBalance) {
          return { ...asset, wallet: formattedBalance }
        }
        return asset
      })

      // Only update if something changed
      if (JSON.stringify(prevData) !== JSON.stringify(updatedData)) {
        return updatedData
      }
      return prevData
    })
  }, [allPositions, currentChainId, marketData])

  const toggleSort = (column: typeof sortBy) => {
    if (sortBy === column) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(column)
      setSortDir('desc')
    }
  }

  // Derived Health score (0-100) without extra RPCs
  const healthScore = useMemo(() => {
    // If borrow limit data is invalid and user has debt, avoid misleading 100% display
    if (!isFinite(borrowLimit) || borrowLimit <= 0) {
      return totalBorrowed > 0 ? 0 : 100
    }
    const used = Math.max(0, Math.min(100, borrowLimitUsed || 0))
    return Math.round(100 - used)
  }, [borrowLimit, borrowLimitUsed, totalBorrowed])

  // Canonical Health Factor (HF): (Total Collateral Value * Weighted Average Liquidation Threshold) / Total Borrow Value
  const healthFactor = useMemo(() => {
    // Calculate total collateral value weighted by liquidation threshold
    // Formula: Σ(collateral_value_i * liquidation_threshold_i) / total_borrow
    const totalCollateralValueWeightedByLT = allPositions.reduce((acc, p) => {
      const liquidationThreshold = p.marketData?.liquidationThreshold || 0
      // Only count positions that are supplied (collateral)
      return acc + (p.suppliedValueUSD * (liquidationThreshold / 100))
    }, 0)

    // If no collateral with liquidation threshold, return null
    if (!isFinite(totalCollateralValueWeightedByLT) || totalCollateralValueWeightedByLT <= 0) return null
    // If no borrowing (or effectively zero), health factor is infinite (perfectly safe)
    if (totalBorrowed <= BORROW_THRESHOLD) return Infinity
    // Standard calculation: (Total Collateral * Weighted Avg Liquidation Threshold) / Total Borrow
    return totalCollateralValueWeightedByLT / totalBorrowed
  }, [allPositions, totalBorrowed])

  // Map Health Factor to a 0–100 bar (1.0 => 0%, 2.0 => 100%, with proper scaling for higher values)
  const healthBarPercent = useMemo(() => {
    if (healthFactor === null) return null
    // If no borrowing, show 100% (perfectly safe)
    if (healthFactor === Infinity) return 100
    // Map HF to 0-100: HF 1.0 = 0%, HF 2.0 = 100%, with logarithmic scaling for HF > 2.0
    // Formula: min(100, max(0, ((HF - 1.0) / 1.0) * 100)) for HF <= 2.0
    // For HF > 2.0, we still cap at 100% since that's the maximum safe display
    const pct = ((healthFactor - 1.0) / 1.0) * 100
    return Math.max(0, Math.min(100, Math.round(pct)))
  }, [healthFactor])

  // Health style + label derived from canonical Health Factor
  const { healthHex, healthTextClass, healthLabel } = useMemo(() => {
    // Handle null case (no collateral)
    if (healthFactor === null) {
      return { 
        healthHex: '#6b7280', 
        healthTextClass: 'text-muted-foreground', 
        healthLabel: 'N/A' 
      }
    }
    
    // Handle Infinity case (no debt - perfectly safe)
    if (healthFactor === Infinity) {
      return {
        healthHex: '#10b981',
        healthTextClass: 'text-primary',
        healthLabel: 'Safe'
      }
    }
    
    // Standard thresholds based on Health Factor value
    // HF ≥ 2.0: Safe (green)
    // 1.25 ≤ HF < 2.0: Caution (amber)
    // HF < 1.25: Risk (red) - approaching or at liquidation
    if (healthFactor >= 2.0) {
      return {
        healthHex: '#10b981',
        healthTextClass: 'text-primary',
        healthLabel: 'Safe'
      }
    } else if (healthFactor >= 1.25) {
      return { 
        healthHex: '#f59e0b', 
        healthTextClass: 'text-amber-400', 
        healthLabel: 'Caution' 
      }
    } else {
      return { 
        healthHex: '#ef4444', 
        healthTextClass: 'text-red-400', 
        healthLabel: 'Risk' 
      }
    }
  }, [healthFactor])

  // Deduplicated Expandable Portfolio Summary Component
  const ExpandablePortfolio = useCallback(() => (
    <div className="w-full">
      <Collapsible
        open={!isMobile || isPortfolioExpanded}
        onOpenChange={setIsPortfolioExpanded}
        className="w-full"
      >
        {/* Trigger: Visible ONLY on Mobile */}
        {isMobile && (
          <div className="flex items-center justify-between px-1 mb-3 animate-in fade-in duration-500">
            <CollapsibleTrigger asChild>
              <Button 
                variant="ghost" 
                size="sm" 
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground h-auto py-2 px-4 rounded-xl bg-muted/30 border border-white/5 shadow-sm active:scale-95 transition-all"
              >
                <div className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  isConnected ? "bg-primary animate-pulse" : "bg-muted-foreground/30"
                )} />
                <span className="text-[10px] font-bold uppercase tracking-widest">
                  {isPortfolioExpanded ? 'Hide' : 'Show'} Portfolio
                </span>
                <ChevronDown className={cn(
                  "h-3 w-3 transition-transform duration-300", 
                  isPortfolioExpanded && "rotate-180"
                )} />
              </Button>
            </CollapsibleTrigger>
            
            {/* mini-preview: Show balance when the card is closed to save space */}
            {!isPortfolioExpanded && isConnected && (
              <div className="text-xs font-bold text-primary/80 pr-2 flex items-center gap-1 animate-in slide-in-from-right-2">
                <span className="text-[9px] text-muted-foreground font-normal uppercase">Balance:</span>
                <AnimatedCounter value={globalTotalSupplied} prefix="$" duration={0.5} />
              </div>
            )}
          </div>
        )}

        {/* Content: Always visible on desktop, toggleable on mobile */}
        <CollapsibleContent 
          forceMount={!isMobile ? true : undefined}
          className={cn(
            "animate-in slide-in-from-top-2 duration-300",
            !isMobile ? "block opacity-100" : isPortfolioExpanded ? "block" : "hidden"
          )}
        >
          <UserPortfolioSummary
            totalSupplied={isConnected ? globalTotalSupplied : 0}
            totalBorrowed={isConnected ? globalTotalBorrowed : 0}
            netAPY={isConnected ? liveNetAPY : 0}
            netEarningsUSD={isConnected ? netEarningsUSD : 0}
            healthFactor={isConnected ? (healthFactor === Infinity ? 99.9 : (healthFactor || undefined)) : undefined}
            borrowLimitUsage={isConnected ? globalBorrowLimitUsed : 0}
            theme={theme}
            isLoading={isConnected ? balancesLoading : false}
            supplyEarningsUSD={isConnected ? supplyEarningsUSD : 0}
            weightedSupplyAPY={isConnected ? weightedSupplyAPY : 0}
            supplyRewardsUSD={isConnected ? supplyRewardsUSD : 0}
            weightedSupplyRewardsAPY={isConnected ? weightedSupplyRewardsAPY : 0}
            borrowRewardsUSD={isConnected ? borrowRewardsUSD : 0}
            weightedBorrowRewardsAPY={isConnected ? weightedBorrowRewardsAPY : 0}
            borrowCostsUSD={isConnected ? borrowCostsUSD : 0}
            weightedBorrowAPY={isConnected ? weightedBorrowAPY : 0}
            chainBalances={isConnected ? chainBalances : []}
          />
        </CollapsibleContent>
      </Collapsible>
    </div>
  ), [
    isMobile, 
    isPortfolioExpanded, 
    isConnected, 
    globalTotalSupplied, 
    globalTotalBorrowed, 
    liveNetAPY, 
    netEarningsUSD, 
    healthFactor, 
    globalBorrowLimitUsed, 
    theme, 
    balancesLoading, 
    supplyEarningsUSD, 
    weightedSupplyAPY, 
    supplyRewardsUSD, 
    weightedBorrowRewardsAPY, 
    borrowRewardsUSD, 
    borrowCostsUSD, 
    weightedBorrowAPY, 
    chainBalances
  ])

  useEffect(() => {
    if (!FEATURE_FLAGS.LAZY_MARKETS_TABLE) return
    if (!isSentinelInView) {
      setSentinelExited(true)
      return
    }
    if (isSentinelInView && sentinelExited && page * pageSize < filteredMarketData.length) {
      setPage((p) => p + 1)
      setSentinelExited(false)
    }
  }, [isSentinelInView, sentinelExited, page, pageSize, filteredMarketData.length])


  // Pro Mode Return Statement
  // Determine if we should show onboarding guide instead of hero stats
  const shouldShowOnboarding = !isConnected || (isConnected && globalTotalSupplied === 0 && !balancesLoading)

  // Scroll to markets handler
  const scrollToMarkets = useCallback(() => {
    const element = document.getElementById('markets-view')
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [])

  // Onboarding Guide Component - Subtle Neomorphism Design
  const OnboardingGuideComponent = (
    <OnboardingGuide
      shouldShowOnboarding={shouldShowOnboarding}
      isConnected={isConnected}
      theme={effectiveTheme}
      scrollToMarkets={scrollToMarkets}
    />
  )

  // HeaderIntro: only shown when not connected — minimal label + market size
  // Connected users land directly on portfolio + markets, no orientation text needed
  const HeaderIntro: React.FC = () => {
    if (isConnected) return null
    return (
      <div className="flex items-center justify-between gap-4 px-1 pt-1">
        <h2 className="text-base font-semibold text-foreground/60 tracking-tight">
          Cross-Chain Lending
        </h2>
        {FEATURE_FLAGS.SHOW_TOTAL_MARKET_SIZE && (
          <ChainTVLTooltip chains={tvlChains} totalMarketSize={protocolMarketSize}>
            <button className="text-right group leading-tight">
              <p className="text-[9px] text-muted-foreground/50 uppercase tracking-widest font-semibold mb-0.5">
                Market Size
              </p>
              <div className="text-base font-bold font-mono text-foreground/80 group-hover:text-primary transition-colors">
                {isTVLLoading
                  ? <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
                  : <AnimatedCounter value={protocolMarketSize} prefix="$" duration={0.2} />
                }
              </div>
            </button>
          </ChainTVLTooltip>
        )}
      </div>
    )
  }

  const ApyTooltipContent: React.FC = () => (
    <div className="space-y-3 text-sm">
      <div className="font-semibold mb-1">Net APY Breakdown (Annualized)</div>
      <div className="p-3 rounded-lg bg-muted/50">
        <div className="font-medium text-base mb-2">Overall Summary</div>
        <div className="space-y-1.5 text-xs">
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Supply Earnings</span>
            <div className="text-right">
              <div className="text-primary font-mono">+${supplyEarningsUSD.toFixed(2)}</div>
              <div className="text-primary/70 font-mono text-[10px]">({weightedSupplyAPY.toFixed(2)}% avg)</div>
            </div>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Supply Rewards</span>
            <div className="text-right">
              <div className="text-primary font-mono">+${supplyRewardsUSD.toFixed(2)}</div>
              <div className="text-primary/70 font-mono text-[10px]">({weightedSupplyRewardsAPY.toFixed(2)}% avg)</div>
            </div>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Borrow Rewards</span>
            <div className="text-right">
              <div className="text-primary font-mono">+${borrowRewardsUSD.toFixed(2)}</div>
              <div className="text-primary/70 font-mono text-[10px]">({weightedBorrowRewardsAPY.toFixed(2)}% avg)</div>
            </div>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Borrow Costs</span>
            <div className="text-right">
              <div className="text-orange-400 font-mono">-${borrowCostsUSD.toFixed(2)}</div>
              <div className="text-orange-400/70 font-mono text-[10px]">({weightedBorrowAPY.toFixed(2)}% avg)</div>
            </div>
          </div>
          <div className="border-t border-border/50 pt-2 mt-2 flex justify-between items-center font-semibold">
            <span>Net Earnings</span>
            <span className="font-mono text-base">${netEarningsUSD.toFixed(2)}</span>
          </div>
        </div>
      </div>
      {chainBalances.length > 0 && (
        <div className="space-y-1.5 text-xs">
          <div className="font-medium text-base mt-2">Per-Chain</div>
          {chainBalances.map(chain => (
            <div key={chain.chainId} className="flex justify-between items-center">
              <span>{chain.chainName}</span>
              <span className={cn("font-mono", chain.netEarningsUSD >= 0 ? "text-primary" : "text-orange-400")}>{chain.netEarningsUSD >= 0 ? '+' : ''}${chain.netEarningsUSD.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}
      <div className="text-xs text-muted-foreground pt-2 border-t border-border/50 mt-2">
        Your Net APY of <strong className={cn(netAPY >= 0 ? "text-primary" : "text-red-500")}>{netAPY.toFixed(2)}%</strong> is derived from net earnings over your total supplied value of <strong>${globalTotalSupplied.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong>.
      </div>
    </div>
  )

  // Mobile APY Tooltip Component
  const ApyMobileTooltip: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [open, setOpen] = useState(false)

    return (
      <Tooltip open={open} onOpenChange={setOpen} delayDuration={100}>
        <TooltipTrigger asChild onClick={() => setOpen(prev => !prev)}>
          {children}
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          className="max-w-sm p-4 bg-background/95 backdrop-blur-xl border border-border/50 shadow-xl"
          sideOffset={8}
        >
          <ApyTooltipContent />
        </TooltipContent>
      </Tooltip>
    )
  }

  const BorrowLimitInfoContent: React.FC = () => (
    <div>
      <div className="text-xs max-w-[260px] space-y-1">
        <p>Maximum borrowing limit based on your (enabled) collateral.</p>
        <p className="opacity-80">
          {borrowLimit > 0
            ? `${((globalBorrowLimit / (globalTotalSupplied || 1)) * 100).toFixed(0)}% of $${globalTotalSupplied.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} collateral`
            : '75% of your collateral'}
        </p>
      </div>
      <div className="text-sm text-primary font-medium mt-2">
        <AnimatedCounter value={borrowLimit - totalBorrowed} prefix="$" duration={0.8} />{' '}
        still available to borrow
      </div>
    </div>
  )
  return (
    <TooltipProvider delayDuration={100}>
      <ChainThemeApplicator />
      {FEATURE_FLAGS.SHOW_TVL_MARQUEE && (
        <TVLMarquee 
          chains={tvlChains || []} 
          totalMarketSize={protocolMarketSize} 
          isLoading={isTVLLoading}
          className="sm:-mt-8"
        />
      )}
      <div className="w-full max-w-7xl mx-auto md:px-6 py-2 transition-all duration-300 flex flex-col gap-4 md:gap-6">


        {/* Not-connected: minimal label + market size (HeaderIntro handles this) */}
        {!isConnected && <HeaderIntro />}

        {/* ApyPrefetcher — background prefetch when connected with no positions yet */}
        {isConnected && shouldShowOnboarding && (
          <ApyPrefetcher
            positions={globalAllPositions}
            onApyDataUpdate={handleApyDataUpdate}
          />
        )}

        {/* Portfolio summary — connected users only, always above markets */}
        {isConnected && (
          <div>
            <ExpandablePortfolio />
          </div>
        )}


        {/* Markets Section - Order 2 on mobile, Order 3 on desktop */}
        <div id="markets-view" className="w-full order-2 md:order-3">
            {/* All Markets Guide - Show on main view */}
            <AllMarketsGuide theme={theme} />

             {/* Combined Markets Table */}
              <AnimatedCard>
                <Card className="relative overflow-hidden rounded-2xl backdrop-blur-xl bg-gradient-to-br from-white/5 via-white/2 to-transparent border-t border-white/10 shadow-2xl">
                  {/* Gradient overlay */}
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 opacity-50" />
                  
                  <CardHeader className="relative pb-2 px-2 md:px-6">
                   <CardTitle className="relative inline-flex items-center gap-3 w-full justify-between">
                    <div className="flex items-center gap-3">
                      <NetworkSwitcher
                        selectedNetworkId={selectedNetworkId}
                        setSelectedNetworkId={setSelectedNetworkId}
                      />
                      <MarketBanners
                        currentChainId={currentChainId}
                        theme={theme}
                        isMounted={isMounted}
                        monadMessage={monadMessage}
                      />
                    </div>
                   <div className="ml-auto flex items-center gap-3">
                     {/* Market size — shown in table header for connected users (desktop) */}
                     {isConnected && FEATURE_FLAGS.SHOW_TOTAL_MARKET_SIZE && !isTVLLoading && protocolMarketSize > 0 && (
                       <ChainTVLTooltip chains={tvlChains} totalMarketSize={protocolMarketSize}>
                         <button className="hidden sm:flex flex-col items-end group leading-tight mr-1">
                           <span className="text-[9px] text-muted-foreground/50 uppercase tracking-widest font-semibold">Market</span>
                           <span className="text-sm font-bold font-mono text-foreground/70 group-hover:text-primary transition-colors">
                             <AnimatedCounter value={protocolMarketSize} prefix="$" duration={0.2} />
                           </span>
                         </button>
                       </ChainTVLTooltip>
                     )}
                     <div className="relative hidden sm:block">
                       <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                       <input 
                         type="text"
                         placeholder="Search assets..."
                         value={searchTerm}
                         onChange={(e) => setSearchTerm(e.target.value)}
                         className="pl-8 pr-3 py-1.5 w-[220px] rounded-2xl border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                       />
                     </div>
                      {FEATURE_FLAGS.MARKETS_VIEW_TOGGLE && (
                        <div
                          className={cn(
                            "relative hidden md:inline-flex items-center rounded-2xl p-1 select-none w-[100px]",
                            "backdrop-blur-sm",
                            "bg-gradient-to-br from-slate-100/60 via-slate-50/40 to-white/30",
                            "dark:from-white/[0.03] dark:via-white/[0.02] dark:to-transparent",
                            "shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_1px_3px_rgba(0,0,0,0.05)]",
                            "dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.03),0_1px_3px_rgba(0,0,0,0.2)]",
                            "border border-slate-200/40 dark:border-white/[0.08]",
                            "transition-all duration-300 ease-out"
                          )}
                          role="group"
                          aria-label="Toggle markets view"
                        >
                          <button
                            type="button"
                            onClick={() => setViewMode('table')}
                            className={cn(
                              "relative z-10 flex-1 flex items-center justify-center py-1.5 rounded-xl",
                              "transition-all duration-300 ease-out",
                              viewMode === 'table'
                                ? "text-slate-800 dark:text-white scale-100"
                                : "text-slate-500/60 hover:text-slate-700 dark:text-white/50 dark:hover:text-white/80 hover:scale-105 active:scale-95"
                            )}
                            aria-label="Table view"
                            aria-pressed={viewMode === 'table'}
                            title="Table view"
                          >
                            <TableIcon className={cn(
                              "h-4 w-4 transition-all duration-300 ease-out",
                              viewMode === 'table' ? "drop-shadow-sm" : ""
                            )} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setViewMode('simplified')}
                            onMouseEnter={prefetchSimplifiedView}
                            onFocus={prefetchSimplifiedView}
                            className={cn(
                              "relative z-10 flex-1 flex items-center justify-center py-1.5 rounded-xl",
                              "transition-all duration-300 ease-out",
                              viewMode === 'simplified'
                                ? "text-slate-800 dark:text-white scale-100"
                                : "text-slate-500/60 hover:text-slate-700 dark:text-white/50 dark:hover:text-white/80 hover:scale-105 active:scale-95"
                            )}
                            aria-label="Simplified view"
                            aria-pressed={viewMode === 'simplified'}
                            title="Simplified view"
                          >
                            <TrendingUpIcon className={cn(
                              "h-4 w-4 transition-all duration-300 ease-out",
                              viewMode === 'simplified' ? "drop-shadow-sm" : ""
                            )} />
                          </button>
                          {/* Sliding indicator - Pure CSS */}
                          <span
                            className={cn(
                              "absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-xl",
                              "transition-all duration-300 ease-out",
                              "shadow-[0_1px_3px_rgba(0,0,0,0.08),inset_0_1px_1px_rgba(255,255,255,0.6)]",
                              "dark:shadow-[0_1px_3px_rgba(0,0,0,0.3),inset_0_1px_1px_rgba(255,255,255,0.08)]",
                              isMounted && theme === 'light'
                                ? "bg-gradient-to-br from-white via-white/95 to-slate-50/80 border border-slate-200/50"
                                : "bg-gradient-to-br from-white/[0.12] via-white/[0.08] to-white/[0.04] border border-white/[0.12]"
                            )}
                            style={{ 
                              left: viewMode === 'table' ? '4px' : 'calc(50% + 2px)',
                              transition: 'left 300ms cubic-bezier(0.4, 0.0, 0.2, 1), background 300ms ease-out, border-color 300ms ease-out, box-shadow 300ms ease-out'
                            }}
                          />
                        </div>
                      )}
                    </div>
                   </CardTitle>
                  </CardHeader>
                  <CardContent className="relative p-0 overflow-hidden">
                   {viewMode === 'table' ? (
                     <div className="overflow-x-auto animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
                       <Table className="w-full">
                         <TableHeader>
                           <TableRow className="border-b border-white/10">
                            <TableHead
                              className="text-left pl-2 sm:pl-4 cursor-pointer select-none text-muted-foreground font-semibold"
                              onClick={() => toggleSort('asset')}
                            >
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex items-center gap-1">
                                    Asset
                                    <Info className="h-3 w-3 text-muted-foreground/60" />
                                    {sortBy === 'asset' && (
                                      <span className="text-xs opacity-70">{sortDir === 'asc' ? '▲' : '▼'}</span>
                                    )}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="max-w-xs">
                                  <p className="text-sm">The cryptocurrency or token available for lending and borrowing. Click to sort alphabetically.</p>
                                </TooltipContent>
                              </Tooltip>
                            </TableHead>
                            <TableHead
                              className="text-center hidden sm:table-cell text-primary cursor-pointer select-none font-semibold"
                              onClick={() => toggleSort('supplyApy')}
                            >
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex items-center gap-1">
                                    Supply APY
                                    <Info className="h-3 w-3 text-primary/60" />
                                    {sortBy === 'supplyApy' && (<span className="text-xs opacity-70">{sortDir === 'asc' ? '▲' : '▼'}</span>)}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="max-w-xs">
                                  <p className="text-sm">Annual Percentage Yield earned by supplying this asset. Higher APY means more rewards for depositors.</p>
                                </TooltipContent>
                              </Tooltip>
                            </TableHead>
                            <TableHead
                              className="text-center hidden sm:table-cell cursor-pointer select-none text-muted-foreground font-semibold"
                              onClick={() => toggleSort('utilization')}
                            >
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex items-center gap-1">
                                    Utilization
                                    <Info className="h-3 w-3 text-muted-foreground/60" />
                                    {sortBy === 'utilization' && (<span className="text-xs opacity-70">{sortDir === 'asc' ? '▲' : '▼'}</span>)}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="max-w-xs">
                                  <p className="text-sm">Percentage of total supply currently being borrowed. Higher utilization indicates strong market demand and healthy lending activity.</p>
                                </TooltipContent>
                              </Tooltip>
                            </TableHead>
                            <TableHead
                              className="text-center hidden sm:table-cell text-blue-300 cursor-pointer select-none font-semibold"
                              onClick={() => toggleSort('borrowApy')}
                            >
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex items-center gap-1">
                                    Borrow APY
                                    <Info className="h-3 w-3 text-blue-300/60" />
                                    {sortBy === 'borrowApy' && (<span className="text-xs opacity-70">{sortDir === 'asc' ? '▲' : '▼'}</span>)}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="max-w-xs">
                                  <p className="text-sm">Annual Percentage Yield paid when borrowing this asset. Lower APY means cheaper borrowing costs.</p>
                                </TooltipContent>
                              </Tooltip>
                            </TableHead>
                            <TableHead
                              className="text-center cursor-pointer hover:bg-muted/50 transition-colors text-muted-foreground font-semibold hidden sm:table-cell"
                              onClick={() => toggleSort('tvl')}
                            >
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex items-center gap-1">
                                    TVL
                                    <Info className="h-3 w-3 text-muted-foreground/60" />
                                    {sortBy === 'tvl' && (<span className="text-xs opacity-70">{sortDir === 'asc' ? '▲' : '▼'}</span>)}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="max-w-xs">
                                  <p className="text-sm">Total Value Locked - the total USD value of assets supplied to this market. Higher TVL indicates more liquidity and stability.</p>
                                </TooltipContent>
                              </Tooltip>
                            </TableHead>
                            <TableHead className="text-center sm:hidden text-muted-foreground font-semibold">
                              <span className="flex flex-col items-center leading-tight gap-0.5">
                                <span>APY</span>
                                <span className="text-[9px] font-normal text-muted-foreground/50 tracking-wide">S · B</span>
                              </span>
                            </TableHead>
                            <TableHead
                              className="text-right pr-2 cursor-pointer select-none text-muted-foreground font-semibold"
                              onClick={() => toggleSort('balance')}
                            >
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex items-center gap-1">
                                    Your Supply
                                    <Info className="h-3 w-3 text-muted-foreground/60" />
                                    {sortBy === 'balance' && (<span className="text-xs opacity-70">{sortDir === 'asc' ? '▲' : '▼'}</span>)}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="max-w-xs">
                                  <p className="text-sm">Your current supply balance in this asset. Shows both token amount and USD value. Connect wallet to see your actual balance.</p>
                                </TooltipContent>
                              </Tooltip>
                            </TableHead>
                            <TableHead className="text-center w-16 text-muted-foreground font-semibold hidden sm:table-cell">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex items-center gap-1">
                                    Expand
                                    <Info className="h-3 w-3 text-muted-foreground/60" />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="max-w-xs">
                                  <p className="text-sm">Click to expand and view supply/borrow options for this asset.</p>
                                </TooltipContent>
                              </Tooltip>
                            </TableHead>
                           </TableRow>
                         </TableHeader>
                         <TableBody>
                          {sortedAssets.map((asset) => (
                            <CombinedAssetRow
                               key={asset.id}
                               asset={asset}
                              isExpanded={(FEATURE_FLAGS.MARKETS_DEBUG_TOOLBAR && debugExpandAll) ? true : (expandedAssetId === asset.id)}
                              onToggleExpanded={(e) => handleToggleExpanded(asset.id, e)}
                              onTransaction={handleTransaction}
                               isDemoMode={isDemoMode}
                               onApyDataUpdate={handleApyDataUpdate}
                               isTourActive={isTourActive}
                               marketMetrics={mergedMarketMetrics}
                               isMetricsLoading={isMetricsLoading || isStellarMetricsLoading}
                             />
                           ))}
                           {FEATURE_FLAGS.LAZY_MARKETS_TABLE && (page * pageSize < filteredMarketData.length) && (
                             <tr>
                               <td colSpan={8}>
                                 <div ref={sentinelRef as any} className="h-10 w-full flex items-center justify-center text-xs text-muted-foreground">
                                   Loading more...
                                 </div>
                               </td>
                             </tr>
                           )}
                         </TableBody>
                       </Table>
                     </div>
                   ) : (
                     <div className="animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
                       <SimplifiedAssetTable />
                     </div>
                   )}
                  </CardContent>
                </Card>
              </AnimatedCard>
        </div>


        {/* Demo Data Modal */}
        {/* <DemoDataModal /> */} 

        {/* Coming Soon Banner */}
        <AnimatePresence>
          {showComingSoonBanner && (
            <motion.div
              initial={{ opacity: 0, y: -50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -50 }}
              className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 mx-4"
            >
              <div className="bg-background/90 backdrop-blur-sm border rounded-lg px-6 py-3 shadow-lg relative">
                <button
                  onClick={() => setShowComingSoonBanner(false)}
                  className="absolute -top-1 -right-1 w-6 h-6 bg-background border rounded-full flex items-center justify-center hover:bg-muted transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                  <span className="text-sm font-medium">Coming Soon</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Portfolio details will be available soon!</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Boosted Markets Coming Soon Notification */}
        <AnimatePresence>
          {showBoostedComingSoon && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="fixed z-50 pointer-events-auto max-w-[calc(100vw-2rem)]"
              style={{
                left: notificationPosition ? `${notificationPosition.x}px` : '50%',
                top: notificationPosition ? `${notificationPosition.y}px` : '80px',
                transform: notificationPosition ? 'translate(-50%, -100%)' : 'translateX(-50%)',
              }}
            >
              <div className="bg-background/90 backdrop-blur-sm border rounded-lg px-4 sm:px-6 py-3 shadow-lg relative max-w-full">
                <button
                  onClick={() => {
                    setShowBoostedComingSoon(false)
                    setNotificationPosition(null)
                  }}
                  className="absolute -top-1 -right-1 w-6 h-6 bg-background border rounded-full flex items-center justify-center hover:bg-muted transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                  <span className="text-sm font-medium">Boosted Markets</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 break-words">Coming soon! We're rolling this out to select users first.</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Daily Login Popup */}
        <DailyLoginPopup 
          isOpen={showPopup}
          onClose={closePopup}
          points={lastClaimResult?.points}
          loginStreak={loginStreak}
          isNewUser={lastClaimResult?.isNewUser}
          userName={address}
        />

      </div>
      {FEATURE_FLAGS.MARKETS_MANAGE_DASHBOARD && (
        <ManageDashboard assets={sortedAssets} isOpen={isManageDashboardOpen} onClose={() => setIsManageDashboardOpen(false)} />
      )}
      <FeatureTour 
        steps={tourSteps}
        isTourActive={isTourActive}
        currentStep={currentStep}
        nextStep={nextStep}
        prevStep={prevStep}
        stopTour={stopTour}
      />
      <ActionRewardPopup
        isOpen={rewardOpen}
        onClose={() => setRewardOpen(false)}
        actionType={(rewardMetaRef.current?.action || 'supply')}
        tokenSymbol={rewardMetaRef.current?.tokenSymbol}
      />
      
      {/* Chain Switch Dialog */}
      <ChainSwitchDialog
        isOpen={showChainSwitchDialog}
        onClose={() => setShowChainSwitchDialog(false)}
        previousChainId={previousChainId}
        currentChainId={chainId}
        previousChainName={getChainDisplayName(previousChainId)}
        currentChainName={getChainDisplayName(chainId)}
      />

      {/* Risk Disclaimer Modal */}
      <RiskDisclaimerModal />
    </TooltipProvider>
  )
}

"use client"

import { TooltipTrigger } from "@/components/ui/tooltip"
import { DemoDataModal } from "@/components/DemoDataModal"
import { 
  Asset, 
  PortfolioAsset, 
  StakingAsset, 
} from "@/types/markets"
import { getMarketsWithPrioritization } from "@/data/market-data"
import { portfolioAssets } from "@/data/portfolio-data"
import { stakingAssets } from "@/data/staking-data"
import { generateChartData } from "@/lib/chart-utils"
import { AnimatedCounter, MiniChart, AnimatedCard, DonutChart } from "@/components/ui/animated-components"
import { CombinedAssetRow } from "@/components/markets/CombinedAssetRow"
import { PortfolioAssetRow } from "@/components/portfolio/PortfolioAssetRow"
import { PortfolioDetailModal } from "@/components/portfolio/PortfolioDetailModal"
import { StakingAssetRow } from "@/components/staking/StakingAssetRow"
import { StakingManageModal } from "@/components/staking/StakingManageModal"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import {
  TrendingUp,
  TrendingDown,
  Info,
  RefreshCw,
  Search,
  X,
  HelpCircle,
  PiggyBank,
} from "lucide-react"
import Image from "next/image"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipProvider } from "@/components/ui/tooltip"
import { useAccount } from 'wagmi'
import { ConnectWalletButton } from "@/components/wallet/connect-wallet-button"
import { motion, AnimatePresence, useInView } from "framer-motion"
import { useDailyLogin } from "@/hooks/use-daily-login"
import { DailyLoginPopup } from "@/components/ui/daily-login-popup"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"
import { useMobile } from "@/hooks/use-mobile"
import { Progress } from "@/components/ui/progress"
import { usePathname } from "next/navigation"
import { useCrossChainBalances } from "@/hooks/use-cross-chain-balances"
import { usePTokenBalance } from "@/hooks/use-ptoken-balance"
import { useBorrowBalance } from "@/hooks/use-borrow-balance"
import type { Network } from "@/components/ui/network-switcher"

// Chart data utility imported from lib/chart-utils

// AnimatedCounter imported from components/ui/animated-components

// MiniChart imported from components/ui/animated-components

// AnimatedCard imported from components/ui/animated-components

// DonutChart imported from components/ui/animated-components

// PortfolioAssetRow imported from components/portfolio/PortfolioAssetRow

// StakingAssetRow imported from components/staking/StakingAssetRow

// AssetDropdown imported from components/markets/AssetDropdown

// CombinedAssetRow imported from components/markets/CombinedAssetRow

// Portfolio Detail Modal component - now imported from external file

// Staking Management Modal component - now imported from external file

// Live Asset Positions Component
const LiveAssetPositions = () => {
  const { chainId } = useAccount()
  const allAssets = chainId ? getMarketsWithPrioritization(chainId) : []
  const assetsWithContracts = allAssets.filter(asset => asset.hasSmartContract)

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium">Asset Positions</h4>
      {assetsWithContracts.map(asset => (
        <LiveAssetRow key={asset.id} assetId={asset.id} />
      ))}
      
      {assetsWithContracts.length === 0 && (
        <div className="text-center py-4 text-muted-foreground">
          <p className="text-sm">No assets supplied yet</p>
          <p className="text-xs">Supply assets to start earning and use as collateral</p>
        </div>
      )}
    </div>
  )
}

// Individual live asset row component
const LiveAssetRow = ({ assetId }: { assetId: string }) => {
  const { chainId } = useAccount()
  const allAssets = chainId ? getMarketsWithPrioritization(chainId) : []
  const asset = allAssets.find(a => a.id === assetId)
  
  const { 
    formattedBalance: suppliedBalanceStr,
    isLoading: isBalanceLoading 
  } = usePTokenBalance({ assetId })
  
  const { 
    formattedBalance: borrowedBalanceStr,
    isLoading: isBorrowLoading 
  } = useBorrowBalance({ assetId })

  const suppliedBalance = parseFloat(suppliedBalanceStr.replace(/[<,]/g, '')) || 0
  const borrowedBalance = parseFloat(borrowedBalanceStr.replace(/[<,]/g, '')) || 0
  const suppliedValueUSD = asset ? suppliedBalance * asset.oraclePrice : 0
  const borrowedValueUSD = asset ? borrowedBalance * asset.oraclePrice : 0
  const borrowingPowerUSD = asset ? suppliedValueUSD * (asset.maxLTV / 100) : 0
  
  const hasSupplied = suppliedBalance > 0
  const hasBorrowed = borrowedBalance > 0
  const isLoading = isBalanceLoading || isBorrowLoading
  
  if (!asset) {
    return null
  }

  // Only show if user has supplied or borrowed this asset
  if (!hasSupplied && !hasBorrowed) {
    return null
  }

  return (
    <div className="flex items-center justify-between p-3 bg-muted/20 rounded-lg">
      <div className="flex items-center gap-3">
        <Image src={asset.icon} alt={asset.symbol} width={24} height={24} />
        <div>
          <div className="font-medium text-sm">{asset.symbol}</div>
          <div className="text-xs text-muted-foreground">
            LTV: {asset.maxLTV}% | CF: {(asset.maxLTV / 100 * 100).toFixed(0)}%
          </div>
        </div>
      </div>
      
      <div className="text-right space-y-1">
        {isLoading ? (
          <div className="space-y-1">
            <div className="w-20 h-3 bg-gray-200 rounded animate-pulse"></div>
            <div className="w-16 h-3 bg-gray-200 rounded animate-pulse"></div>
          </div>
        ) : (
          <>
            {hasSupplied && (
              <div className="flex items-center gap-1 text-xs text-green-600">
                <TrendingUp className="h-3 w-3" />
                <span>
                  {suppliedBalance.toLocaleString(undefined, { 
                    minimumFractionDigits: 2, 
                    maximumFractionDigits: 4 
                  })} ({suppliedValueUSD.toLocaleString(undefined, { 
                    style: 'currency', 
                    currency: 'USD' 
                  })})
                </span>
              </div>
            )}
            
            {hasBorrowed && (
              <div className="flex items-center gap-1 text-xs text-orange-600">
                <TrendingDown className="h-3 w-3" />
                <span>
                  -{borrowedBalance.toLocaleString(undefined, { 
                    minimumFractionDigits: 2, 
                    maximumFractionDigits: 4 
                  })} ({borrowedValueUSD.toLocaleString(undefined, { 
                    style: 'currency', 
                    currency: 'USD' 
                  })})
                </span>
              </div>
            )}
            
            {borrowingPowerUSD > 0 && (
              <div className="text-xs text-blue-600">
                Power: {borrowingPowerUSD.toLocaleString(undefined, { 
                  style: 'currency', 
                  currency: 'USD' 
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default function AppPage() {
  const { theme } = useTheme()
  const isMobile = useMobile()
  const { address, isConnected, isConnecting, chainId } = useAccount()
  const { showPopup, closePopup, lastClaimResult, loginStreak } = useDailyLogin()
  const [marketData, setMarketData] = useState<Asset[]>(getMarketsWithPrioritization())
  const [expandedAssetId, setExpandedAssetId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  // Real cross-chain balance data
  const { 
    totalSupplied, 
    totalBorrowed, 
    borrowLimit,
    borrowLimitUsed, 
    netAPY,
    chainBalances,
    isLoading: balancesLoading,
    error: balancesError 
  } = useCrossChainBalances()
  const [searchTerm, setSearchTerm] = useState("")
  const [supplyChartData, setSupplyChartData] = useState<Array<{day: number; value: number}>>([])
  const [borrowChartData, setBorrowChartData] = useState<Array<{day: number; value: number}>>([])
  const [activeTab, setActiveTab] = useState("markets")
  const [isDemoMode, setIsDemoMode] = useState(true)
  const [portfolioData, setPortfolioData] = useState<PortfolioAsset[]>(portfolioAssets)
  const [stakingData, setStakingData] = useState<StakingAsset[]>(stakingAssets)
  const [totalPortfolioValue, setTotalPortfolioValue] = useState(0)
  const [totalStakedValue, setTotalStakedValue] = useState(159194.50)
  const [totalRewards, setTotalRewards] = useState(604.05)
  const [selectedPortfolioAsset, setSelectedPortfolioAsset] = useState<PortfolioAsset | null>(null)
  const [selectedStakingAsset, setSelectedStakingAsset] = useState<StakingAsset | null>(null)
  const [stakingModalMode, setStakingModalMode] = useState<"manage" | "claim">("manage")
  const [isMounted, setIsMounted] = useState(false)
  const [showInfoTooltip, setShowInfoTooltip] = useState(false)
  const [showComingSoonBanner, setShowComingSoonBanner] = useState(false)

  const heroRef = useRef<HTMLDivElement>(null)
  const summaryRef = useRef<HTMLDivElement>(null)
  const marketsRef = useRef<HTMLDivElement>(null)


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

  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Close tooltip when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (showInfoTooltip && !(event.target as Element)?.closest('[data-tooltip-trigger]')) {
        setShowInfoTooltip(false)
      }
    }

    if (showInfoTooltip) {
      document.addEventListener('click', handleClickOutside)
      document.addEventListener('touchstart', handleClickOutside)
    }

    return () => {
      document.removeEventListener('click', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [showInfoTooltip])

  // Update market data when chain changes
  useEffect(() => {
    const newMarketData = getMarketsWithPrioritization(chainId)
    setMarketData(newMarketData)
  }, [chainId])

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

  const handleToggleExpanded = (assetId: string) => {
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

  const handleViewPortfolioDetails = (asset: PortfolioAsset) => {
    if (!isDemoMode) return;
    // Open the modal AND show coming soon banner for Other Assets
    setSelectedPortfolioAsset(asset);
    setShowComingSoonBanner(true);
    setTimeout(() => setShowComingSoonBanner(false), 3000); // Hide after 3 seconds
  };

  const handleManageStake = (asset: StakingAsset) => {
    if (!isDemoMode) return;
    setSelectedStakingAsset(asset);
    setStakingModalMode("manage");
  };

  const handleClaimRewards = (asset: StakingAsset) => {
    if (!isDemoMode) return;
    setSelectedStakingAsset(asset);
    setStakingModalMode("claim");
  };

  const handlePortfolioTransaction = (asset: PortfolioAsset, amount: number, type: "buy" | "sell") => {
    if (!isDemoMode) return;

    const transactionValue = amount * asset.price;

    setPortfolioData(prevData =>
      prevData.map(portfolioAsset => {
        if (portfolioAsset.id === asset.id) {
          const newAmount = type === "buy" 
            ? portfolioAsset.amount + amount 
            : Math.max(0, portfolioAsset.amount - amount);
          const newValue = newAmount * portfolioAsset.price;
          
          return {
            ...portfolioAsset,
            amount: newAmount,
            value: newValue,
          };
        }
        return portfolioAsset;
      })
    );

    // Update total portfolio value
    setTotalPortfolioValue(prev => type === "buy" ? prev + transactionValue : prev - transactionValue);
  };

  const handleStakeTransaction = (asset: StakingAsset, amount: number, type: "stake" | "unstake") => {
    if (!isDemoMode) return;

    setStakingData(prevData =>
      prevData.map(stakingAsset => {
        if (stakingAsset.id === asset.id) {
          const newStaked = type === "stake" 
            ? stakingAsset.staked + amount 
            : Math.max(0, stakingAsset.staked - amount);
          const newTotalValue = newStaked * 15.5; // Rough calculation for demo
          
          return {
            ...stakingAsset,
            staked: newStaked,
            totalValue: newTotalValue,
            status: type === "unstake" && newStaked === 0 ? "pending" as const : stakingAsset.status,
          };
        }
        return stakingAsset;
      })
    );

    // Update total staked value
    const valueChange = amount * 15.5; // Rough calculation for demo
    setTotalStakedValue(prev => type === "stake" ? prev + valueChange : prev - valueChange);
  };

  const handleStakeRewardsClaim = (asset: StakingAsset) => {
    if (!isDemoMode) return;
    
    // Simulate claiming rewards
    setStakingData(prevData =>
      prevData.map(stakingAsset => {
        if (stakingAsset.id === asset.id && stakingAsset.rewards > 0) {
          return {
            ...stakingAsset,
            rewards: 0,
          };
        }
        return stakingAsset;
      })
    );
    
    // Update total rewards
    setTotalRewards(prev => prev - asset.rewards);
  };

  const filteredMarketData = marketData.filter(
    (asset) =>
      asset.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      asset.symbol.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  // Pro Mode Return Statement
  return (
    <TooltipProvider>
      <div className="w-full max-w-7xl mx-auto md:px-6 py-8 transition-all duration-300">

        {/* Header section with Title and Easy Mode Toggle */} 
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-4 px-4 md:px-0">
          <div>
             {/* Keep Title if desired */}
             <div className="flex items-center gap-2">
               <h1 className="text-2xl md:text-3xl font-bold">Peridot Alpha (Testnet)</h1>
               <Tooltip open={showInfoTooltip} onOpenChange={setShowInfoTooltip}>
                 <TooltipTrigger asChild>
                   <button 
                     onClick={() => setShowInfoTooltip(!showInfoTooltip)}
                     onTouchStart={() => setShowInfoTooltip(!showInfoTooltip)}
                     data-tooltip-trigger
                     className={cn(
                       "relative w-6 h-6 md:w-7 md:h-7 rounded-full transition-all duration-300 ease-out group",
                       "backdrop-blur-xl border border-white/20 shadow-lg",
                       "bg-gradient-to-br hover:scale-110 active:scale-95",
                       "flex items-center justify-center cursor-pointer touch-manipulation",
                       showInfoTooltip && "scale-110",
                       isMounted && theme === "light" 
                         ? "from-white/40 via-white/20 to-white/10 shadow-green-500/20 hover:from-white/50 hover:via-white/30 hover:to-white/20 hover:shadow-green-500/30" 
                         : "from-white/10 via-white/5 to-transparent shadow-green-500/20 hover:from-white/15 hover:via-white/10 hover:to-white/5 hover:shadow-green-500/40"
                     )}
                   >
                     {/* Glow effect */}
                     <div className={cn(
                       "absolute inset-0 rounded-full blur-md transition-all duration-300 ease-out",
                       showInfoTooltip || "opacity-0 group-hover:opacity-100",
                       showInfoTooltip && "opacity-100",
                       "bg-gradient-to-r from-green-400/20 via-green-500/30 to-green-600/20"
                     )}></div>
                     
                     {/* Info icon */}
                     <Info className={cn(
                       "h-3.5 w-3.5 md:h-4 md:w-4 transition-colors duration-300 relative z-10",
                       showInfoTooltip && (isMounted && theme === "light" ? "text-green-600" : "text-green-400"),
                       !showInfoTooltip && (isMounted && theme === "light" 
                         ? "text-slate-600 group-hover:text-green-600" 
                         : "text-white/80 group-hover:text-green-400")
                     )} />
                   </button>
                 </TooltipTrigger>
                 <TooltipContent 
                   side="bottom" 
                   align="start"
                   className={cn(
                     "max-w-[280px] md:max-w-[320px] p-4 text-sm rounded-xl",
                     "backdrop-blur-xl border border-white/20 shadow-2xl",
                     "bg-gradient-to-br transition-all duration-300",
                     isMounted && theme === "light"
                       ? "from-white/90 via-white/80 to-white/70 shadow-green-500/10"
                       : "from-background/90 via-background/80 to-background/70 shadow-green-500/20"
                   )}
                   sideOffset={8}
                 >
                   <div className="space-y-3">
                     <div className="flex items-center justify-between mb-2">
                       <div className="flex items-center gap-2">
                         <div className="w-2 h-2 rounded-full bg-gradient-to-r from-green-400 to-green-500"></div>
                         <h4 className="font-semibold text-green-500">How Peridot Works</h4>
                       </div>
                       <button
                         onClick={() => setShowInfoTooltip(false)}
                         className="p-1 rounded-full hover:bg-white/10 transition-colors"
                       >
                         <X className="h-3 w-3 text-muted-foreground" />
                       </button>
                     </div>
                     
                     <div className="space-y-2.5 text-xs leading-relaxed">
                       <div>
                         <strong className="text-green-400">🔗 Connect Wallet:</strong> Link your Web3 wallet to start earning points on our cross-chain lending platform.
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
                 </TooltipContent>
               </Tooltip>
             </div>
             <p className="text-sm text-muted-foreground">Cross-chain lending & borrowing</p>
          </div>
        </div>

        {/* Modern Dashboard Overview */}
        <Card className="bg-card border-border/50 overflow-hidden shadow-sm mb-4">
          <CardContent className="p-6">
            {/* Desktop Layout */}
            <div className="hidden md:flex md:items-center md:justify-between mb-8">
              {/* Supply Balance - Left */}
              <div className="flex flex-col">
                <div className="text-sm font-medium text-green-400 mb-1 flex items-center gap-2">
                  SUPPLY BALANCE
                  {balancesLoading && (
                    <RefreshCw className="h-3 w-3 animate-spin opacity-50" />
                  )}
                </div>
                <div className="text-3xl font-bold">
                  <AnimatedCounter value={totalSupplied} prefix="$" duration={0.8} />
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  {totalSupplied > 0 ? (
                    <div>
                      ${(totalSupplied / 1000).toFixed(2)}K supplied
                      {chainBalances.length > 0 && (
                        <div className="text-xs opacity-75 mt-0.5">
                          Across {chainBalances.length} chain{chainBalances.length !== 1 ? 's' : ''}
                        </div>
                      )}
                    </div>
                  ) : (
                    balancesLoading ? 'Loading balances...' : '0.00 supplied'
                  )}
                  {balancesError && (
                    <div className="text-xs text-red-400 mt-0.5">
                      Failed to load balances
                    </div>
                  )}
                </div>
              </div>

              {/* APY Circle - Center */}
              <div className="flex flex-col items-center">
                <Tooltip delayDuration={100}>
                  <TooltipTrigger asChild>
                    <div className="relative cursor-pointer group">
                      {/* Glow effect */}
                      <div className={cn(
                        "absolute inset-0 rounded-full blur-2xl transition-all duration-300 ease-out",
                        "group-hover:blur-3xl group-hover:scale-110",
                        "group-active:scale-95 group-active:blur-xl",
                        isMounted && theme === "light" 
                          ? "bg-gradient-to-r from-green-400/20 via-green-500/30 to-green-600/20 group-hover:from-green-400/40 group-hover:via-green-500/50 group-hover:to-green-600/40" 
                          : "bg-gradient-to-r from-green-400/30 via-green-500/40 to-green-600/30 group-hover:from-green-400/50 group-hover:via-green-500/60 group-hover:to-green-600/50"
                      )}></div>
                      
                      {/* Main circle with glassmorphism */}
                      <div className={cn(
                        "w-32 h-32 rounded-full relative z-10",
                        "backdrop-blur-xl border border-white/20 shadow-2xl",
                        "bg-gradient-to-br transition-all duration-300 ease-out",
                        "group-hover:scale-105 group-hover:shadow-3xl",
                        "group-active:scale-95",
                        isMounted && theme === "light" 
                          ? "from-white/40 via-white/20 to-white/10 shadow-green-500/20 group-hover:from-white/50 group-hover:via-white/30 group-hover:to-white/20 group-hover:shadow-green-500/30" 
                          : "from-white/10 via-white/5 to-transparent shadow-green-500/20 group-hover:from-white/15 group-hover:via-white/10 group-hover:to-white/5 group-hover:shadow-green-500/40"
                      )}>
                        {/* Inner glow ring */}
                        <div className={cn(
                          "absolute inset-1 rounded-full transition-opacity duration-300 ease-out",
                          "bg-gradient-to-br opacity-60 group-hover:opacity-80",
                          isMounted && theme === "light"
                            ? "from-green-200/30 to-green-300/20"
                            : "from-green-400/20 to-green-500/10"
                        )}></div>
                        
                        {/* Content */}
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="text-center relative z-30 transition-colors duration-300 ease-out">
                            <div className={cn(
                              "text-xs font-semibold tracking-wider mb-1",
                              isMounted && theme === "light" 
                                ? "text-slate-700 group-hover:text-slate-800" 
                                : "text-white/90 group-hover:text-white"
                            )}>
                              NET APY
                            </div>
                            <div className={cn(
                              "text-2xl font-bold",
                              isMounted && theme === "light" 
                                ? "text-slate-800 group-hover:text-slate-900" 
                                : "text-white group-hover:text-green-300"
                            )}>
                              +{netAPY.toFixed(1)}%
                            </div>
                          </div>
                        </div>

                        {/* Click ripple effect */}
                        <div className={cn(
                          "absolute inset-0 rounded-full opacity-0 group-active:opacity-100",
                          "bg-gradient-to-r from-green-400/20 via-green-500/30 to-green-600/20",
                          "animate-ping"
                        )}></div>
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    <div className="space-y-2 text-sm">
                      <div className="font-semibold">APY Breakdown</div>
                      <div className="flex justify-between">
                        <span className="text-green-400">Supply APY:</span>
                        <span>+{(netAPY + 1.2).toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-orange-400">Borrow APY:</span>
                        <span>-{(1.2).toFixed(1)}%</span>
                      </div>
                      <div className="border-t pt-1 flex justify-between font-semibold">
                        <span>Net APY:</span>
                        <span className="text-green-400">+{netAPY.toFixed(1)}%</span>
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </div>

              {/* Borrow Balance - Right */}
              <div className="flex flex-col items-end">
                <div className="text-sm font-medium text-orange-400 mb-1 flex items-center gap-2">
                  BORROW BALANCE
                  {balancesLoading && (
                    <RefreshCw className="h-3 w-3 animate-spin opacity-50" />
                  )}
                </div>
                <div className="text-3xl font-bold">
                  <AnimatedCounter value={totalBorrowed} prefix="$" duration={0.8} />
                </div>
                <div className="text-sm text-muted-foreground mt-1 text-right">
                  {totalBorrowed > 0 ? (
                    <div>
                      Active loans
                      <div className="text-xs opacity-75 mt-0.5">
                        Limit: ${borrowLimit.toFixed(2)} ({borrowLimitUsed.toFixed(1)}% used)
                      </div>
                    </div>
                  ) : (
                    <div>
                      {balancesLoading ? 'Loading...' : 'No active loans'}
                      {borrowLimit > 0 && !balancesLoading && (
                        <div className="text-xs opacity-75 mt-0.5">
                          Borrow limit: ${borrowLimit.toFixed(2)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Mobile Layout */}
            <div className="md:hidden flex items-center gap-6 mb-8">
              {/* APY Circle - Left */}
              <div className="flex-shrink-0">
                <Tooltip delayDuration={100}>
                  <TooltipTrigger asChild>
                    <div className="relative cursor-pointer group">
                      {/* Glow effect */}
                      <div className={cn(
                        "absolute inset-0 rounded-full blur-xl transition-all duration-300 ease-out",
                        "group-hover:blur-2xl group-hover:scale-110",
                        "group-active:scale-95 group-active:blur-lg",
                        isMounted && theme === "light" 
                          ? "bg-gradient-to-r from-green-400/20 via-green-500/30 to-green-600/20 group-hover:from-green-400/40 group-hover:via-green-500/50 group-hover:to-green-600/40" 
                          : "bg-gradient-to-r from-green-400/30 via-green-500/40 to-green-600/30 group-hover:from-green-400/50 group-hover:via-green-500/60 group-hover:to-green-600/50"
                      )}></div>
                      
                      {/* Main circle with glassmorphism */}
                      <div className={cn(
                        "w-24 h-24 rounded-full relative z-10",
                        "backdrop-blur-xl border border-white/20 shadow-2xl",
                        "bg-gradient-to-br transition-all duration-300 ease-out",
                        "group-hover:scale-105 group-hover:shadow-3xl",
                        "group-active:scale-95",
                        isMounted && theme === "light" 
                          ? "from-white/40 via-white/20 to-white/10 shadow-green-500/20 group-hover:from-white/50 group-hover:via-white/30 group-hover:to-white/20 group-hover:shadow-green-500/30" 
                          : "from-white/10 via-white/5 to-transparent shadow-green-500/20 group-hover:from-white/15 group-hover:via-white/10 group-hover:to-white/5 group-hover:shadow-green-500/40"
                      )}>
                        {/* Inner glow ring */}
                        <div className={cn(
                          "absolute inset-1 rounded-full transition-opacity duration-300 ease-out",
                          "bg-gradient-to-br opacity-60 group-hover:opacity-80",
                          isMounted && theme === "light"
                            ? "from-green-200/30 to-green-300/20"
                            : "from-green-400/20 to-green-500/10"
                        )}></div>
                        
                        {/* Content */}
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="text-center relative z-30 transition-colors duration-300 ease-out">
                            <div className={cn(
                              "text-xs font-semibold tracking-wider",
                              isMounted && theme === "light" 
                                ? "text-slate-700 group-hover:text-slate-800" 
                                : "text-white/90 group-hover:text-white"
                            )}>
                              NET
                            </div>
                            <div className={cn(
                              "text-xs font-semibold tracking-wider mb-1",
                              isMounted && theme === "light" 
                                ? "text-slate-700 group-hover:text-slate-800" 
                                : "text-white/90 group-hover:text-white"
                            )}>
                              APY
                            </div>
                            <div className={cn(
                              "text-lg font-bold",
                              isMounted && theme === "light" 
                                ? "text-slate-800 group-hover:text-slate-900" 
                                : "text-white group-hover:text-green-300"
                            )}>
                              +{netAPY.toFixed(1)}%
                            </div>
                          </div>
                        </div>

                        {/* Click ripple effect */}
                        <div className={cn(
                          "absolute inset-0 rounded-full opacity-0 group-active:opacity-100",
                          "bg-gradient-to-r from-green-400/20 via-green-500/30 to-green-600/20",
                          "animate-ping"
                        )}></div>
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    <div className="space-y-2 text-sm">
                      <div className="font-semibold">APY Breakdown</div>
                      <div className="flex justify-between">
                        <span className="text-green-400">Supply APY:</span>
                        <span>+{(netAPY + 1.2).toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-orange-400">Borrow APY:</span>
                        <span>-{(1.2).toFixed(1)}%</span>
                      </div>
                      <div className="border-t pt-1 flex justify-between font-semibold">
                        <span>Net APY:</span>
                        <span className="text-green-400">+{netAPY.toFixed(1)}%</span>
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </div>

              {/* Balances - Right */}
              <div className="flex-1">
                <div className="mb-4">
                  <div className="text-sm font-medium text-green-400 mb-1">SUPPLY BALANCE</div>
                  <div className="text-2xl font-bold">
                    <AnimatedCounter value={totalSupplied} prefix="$" duration={0.8} />
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium text-orange-400 mb-1">BORROW BALANCE</div>
                  <div className="text-2xl font-bold">
                    <AnimatedCounter value={totalBorrowed} prefix="$" duration={0.8} />
                  </div>
                </div>
              </div>
            </div>

            {/* Borrow Limit Section */}
            <div className="border-t border-border/50 pt-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center">
                  <span className="text-sm text-muted-foreground">
                    Borrow Limit ({borrowLimit > 0 ? ((borrowLimit / totalSupplied) * 100).toFixed(0) : '75'}% of{' '}
                    <span className="text-green-400">
                      <AnimatedCounter value={totalSupplied} prefix="$" duration={0.8} />
                    </span>
                    {' '}collateral)
                  </span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="ml-1 cursor-pointer"><HelpCircle className="h-3 w-3 text-text/40" /></span>
                    </TooltipTrigger>
                    <TooltipContent side="right"><p className="text-xs max-w-[200px]">Maximum borrowing limit based on your collateral.</p></TooltipContent>
                  </Tooltip>
                </div>
                <div className="text-sm text-green-400 font-medium">
                  <AnimatedCounter value={borrowLimit - totalBorrowed} prefix="$" duration={0.8} />{' '}
                  available
                </div>
              </div>
              
              <Progress value={borrowLimitUsed} className="h-2 w-full bg-muted/30 [&>div]:bg-green-500 mb-2" />
              
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  <AnimatedCounter value={totalBorrowed} prefix="$" duration={0.8} /> borrowed
                </span>
                <span>
                  <AnimatedCounter value={borrowLimit} prefix="$" duration={0.8} /> max
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Markets Section with Enhanced Professional Tabs */}
        <Tabs defaultValue="markets" value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className={cn(
            "grid grid-cols-3 w-full md:w-auto mb-6 h-auto p-1",
            "rounded-2xl backdrop-blur-sm border transition-all duration-300",
            "shadow-lg shadow-black/5",
            isMounted && theme === "light" 
              ? "bg-slate-100/80 border-slate-200/60" 
              : "bg-muted border-border"
          )}>
            <TabsTrigger 
              value="markets" 
              className={cn(
                "rounded-xl py-2.5 sm:py-3 px-3 sm:px-4",
                "text-xs sm:text-sm font-medium transition-all duration-300",
                "data-[state=active]:shadow-lg",
                isMounted && theme === "light"
                  ? "data-[state=active]:bg-white/90 data-[state=active]:border data-[state=active]:border-white/60 data-[state=active]:shadow-slate-200/50 data-[state=active]:text-slate-800 text-slate-600 hover:text-slate-800 hover:bg-white/50"
                  : "data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-black/20"
              )}
            >
              Markets
            </TabsTrigger>
            <TabsTrigger 
              value="portfolio" 
              className={cn(
                "rounded-xl py-2.5 sm:py-3 px-3 sm:px-4",
                "text-xs sm:text-sm font-medium transition-all duration-300",
                "data-[state=active]:shadow-lg",
                isMounted && theme === "light"
                  ? "data-[state=active]:bg-white/90 data-[state=active]:border data-[state=active]:border-white/60 data-[state=active]:shadow-slate-200/50 data-[state=active]:text-slate-800 text-slate-600 hover:text-slate-800 hover:bg-white/50"
                  : "data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-black/20"
              )}
            >
              Portfolio
            </TabsTrigger>
            <TabsTrigger 
              value="stake" 
              className={cn(
                "rounded-xl py-2.5 sm:py-3 px-3 sm:px-4",
                "text-xs sm:text-sm font-medium transition-all duration-300",
                "data-[state=active]:shadow-lg",
                isMounted && theme === "light"
                  ? "data-[state=active]:bg-white/90 data-[state=active]:border data-[state=active]:border-white/60 data-[state=active]:shadow-slate-200/50 data-[state=active]:text-slate-800 text-slate-600 hover:text-slate-800 hover:bg-white/50"
                  : "data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-black/20"
              )}
            >
              Stake
            </TabsTrigger>
          </TabsList>

          {/* Markets Tab Content */} 
          <TabsContent value="markets">
             {/* Search and Filter Bar */} 
             <div className="flex items-center gap-4 mb-4">
               <div className="relative flex-grow">
                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                 <input 
                   type="text"
                   placeholder="Search assets..."
                   value={searchTerm}
                   onChange={(e) => setSearchTerm(e.target.value)}
                   className="pl-10 pr-4 py-2 w-full rounded-md border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                 />
               </div>
             </div>

             {/* Combined Markets Table */}
              <AnimatedCard>
                <Card>
                  <CardHeader className="pb-2 px-2 md:px-6">
                   <CardTitle>Markets</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                   <div className="overflow-x-auto">
                     <Table className="w-full">
                        <TableHeader>
                          <TableRow>
                           <TableHead className="text-left pl-2">Asset</TableHead>
                           <TableHead className="text-center hidden sm:table-cell">Supply APY</TableHead>
                           <TableHead className="text-center hidden sm:table-cell">Borrow APY</TableHead>
                           <TableHead className="text-center sm:hidden">APY</TableHead>
                           <TableHead className="text-right pr-2">Balance</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                         {filteredMarketData.map((asset) => (
                           <CombinedAssetRow
                              key={asset.id}
                              asset={asset}
                             isExpanded={expandedAssetId === asset.id}
                             onToggleExpanded={() => handleToggleExpanded(asset.id)}
                             onTransaction={handleTransaction}
                              isDemoMode={isDemoMode}
                            />
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </AnimatedCard>
           </TabsContent>

           {/* Portfolio Tab Content */}
          <TabsContent value="portfolio">
            <div className="space-y-6">

              {/* Asset Positions Breakdown (moved from CollateralDashboard) */}
              <LiveAssetPositions />

              {/* Other Assets Table */}
              <AnimatedCard delay={0.3}>
                <Card>
                  <CardHeader>
                    <CardTitle>Other Assets</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <Table className="min-w-[700px]">
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[25%]">Asset</TableHead>
                            <TableHead className="w-[15%] text-right">Price</TableHead>
                            <TableHead className="w-[15%] text-right">Amount</TableHead>
                            <TableHead className="w-[15%] text-right">Value</TableHead>
                            <TableHead className="w-[15%] text-right">Allocation</TableHead>
                            <TableHead className="w-[15%] text-right">24h</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {portfolioData.map((asset) => (
                            <PortfolioAssetRow
                              key={asset.id}
                              asset={asset}
                              onViewDetails={handleViewPortfolioDetails}
                            />
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </AnimatedCard>
            </div>
          </TabsContent>

          {/* Stake Tab Content */}
          <TabsContent value="stake">
            <div className="flex items-center justify-center min-h-[400px]">
              <AnimatedCard>
                <Card className="w-full max-w-md mx-auto">
                  <CardContent className="p-8 text-center">
                    <div className="mb-6">
                      <div className="w-16 h-16 bg-orange-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                        <PiggyBank className="h-8 w-8 text-orange-500" />
                      </div>
                      <h3 className="text-xl font-semibold mb-2">Staking Coming Soon</h3>
                      <p className="text-muted-foreground text-sm">
                        We're working hard to bring you an amazing staking experience. Stay tuned for updates!
                      </p>
                    </div>
                    <div className="flex items-center justify-center gap-2 text-orange-500">
                      <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                      <span className="text-sm font-medium">Feature in development</span>
                    </div>
                  </CardContent>
                </Card>
              </AnimatedCard>
            </div>
          </TabsContent>


        </Tabs>

        {/* Portfolio Detail Modal */}
        <AnimatePresence>
          {selectedPortfolioAsset && isDemoMode && (
            <PortfolioDetailModal
              asset={selectedPortfolioAsset}
              onClose={() => setSelectedPortfolioAsset(null)}
              onTransaction={handlePortfolioTransaction}
              isDemoMode={isDemoMode}
              isComingSoon={true}
            />
          )}
        </AnimatePresence>

        {/* Staking Management Modal */}
        <AnimatePresence>
          {selectedStakingAsset && isDemoMode && (
            <StakingManageModal
              asset={selectedStakingAsset}
              onClose={() => setSelectedStakingAsset(null)}
              onStakeTransaction={handleStakeTransaction}
              onClaimRewards={handleStakeRewardsClaim}
              isDemoMode={isDemoMode}
              mode={stakingModalMode}
            />
         )}
       </AnimatePresence>

        {/* Demo Data Modal */}
        <DemoDataModal />

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

        {/* Daily Login Popup */}
        <DailyLoginPopup 
          isOpen={showPopup}
          onClose={closePopup}
          points={lastClaimResult?.points || 20}
          loginStreak={loginStreak}
          isNewUser={lastClaimResult?.isNewUser}
          userName={address}
        />

      </div>
    </TooltipProvider>
  )
}

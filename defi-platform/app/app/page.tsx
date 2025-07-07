"use client"

import { TooltipTrigger } from "@/components/ui/tooltip"
import { DemoDataModal } from "@/components/DemoDataModal"
import { 
  Asset, 
  OnboardingStep, 
  PaymentMethod, 
  PortfolioAsset, 
  StakingAsset, 
  ChartData,
  AnimatedCounterProps,
  MiniChartProps,
  AnimatedCardProps,
  DonutChartProps
} from "@/types/markets"
import { getMarketsWithPrioritization } from "@/data/market-data"
import { portfolioAssets } from "@/data/portfolio-data"
import { stakingAssets } from "@/data/staking-data"
import { generateChartData } from "@/lib/chart-utils"
import { AnimatedCounter, MiniChart, AnimatedCard, DonutChart } from "@/components/ui/animated-components"
import { CombinedAssetRow } from "@/components/markets/CombinedAssetRow"
import { CollateralDashboard } from "@/components/markets/CollateralDashboard"
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
  ArrowRight,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Plus,
  Info,
  WalletIcon,
  BarChart3,
  LineChart,
  RefreshCw,
  Search,
  Filter,
  X,
  Eye,
  Globe,
  Smartphone,
  CreditCard,
  Building,
  ArrowUpRight,
  HelpCircle,
  Zap,
  Check,
  User,
  BarChart4,
  History,
  PiggyBank,
} from "lucide-react"
import Image from "next/image"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipProvider } from "@/components/ui/tooltip"
import { useAccount } from 'wagmi'
import { ConnectWalletButton } from "@/components/wallet/connect-wallet-button"
import { motion, AnimatePresence, useInView } from "framer-motion"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"
import { useMobile } from "@/hooks/use-mobile"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import Link from "next/link"
import { usePathname } from "next/navigation"

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

export default function AppPage() {
  const { theme } = useTheme()
  const isMobile = useMobile()
  const { address, isConnected, isConnecting, chainId } = useAccount()
  const [marketData, setMarketData] = useState<Asset[]>(getMarketsWithPrioritization())
  const [expandedAssetId, setExpandedAssetId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [totalSupplied, setTotalSupplied] = useState(15423.82)
  const [totalBorrowed, setTotalBorrowed] = useState(4971.50)
  const [netAPY, setNetAPY] = useState(3)
  const [borrowLimitUsed, setBorrowLimitUsed] = useState(64)
  const [searchTerm, setSearchTerm] = useState("")
  const [supplyChartData, setSupplyChartData] = useState<Array<{day: number; value: number}>>([])
  const [borrowChartData, setBorrowChartData] = useState<Array<{day: number; value: number}>>([])
  const [activeTab, setActiveTab] = useState("markets")
  const [isDemoMode, setIsDemoMode] = useState(true)
  const [showLiveModeComingSoon, setShowLiveModeComingSoon] = useState(false)
  const [focusAmountInputInModal, setFocusAmountInputInModal] = useState(false)
  const [portfolioData, setPortfolioData] = useState<PortfolioAsset[]>(portfolioAssets)
  const [stakingData, setStakingData] = useState<StakingAsset[]>(stakingAssets)
  const [totalPortfolioValue, setTotalPortfolioValue] = useState(55873)
  const [totalStakedValue, setTotalStakedValue] = useState(159194.50)
  const [totalRewards, setTotalRewards] = useState(604.05)
  const [selectedPortfolioAsset, setSelectedPortfolioAsset] = useState<PortfolioAsset | null>(null)
  const [selectedStakingAsset, setSelectedStakingAsset] = useState<StakingAsset | null>(null)
  const [showRewardsModal, setShowRewardsModal] = useState(false)
  const [stakingModalMode, setStakingModalMode] = useState<"manage" | "claim">("manage")
  const [isMounted, setIsMounted] = useState(false)

  const heroRef = useRef<HTMLDivElement>(null)
  const summaryRef = useRef<HTMLDivElement>(null)
  const marketsRef = useRef<HTMLDivElement>(null)
  const heroInView = useInView(heroRef, { once: true, amount: 0.3 })
  const summaryInView = useInView(summaryRef, { once: true, amount: 0.3 })
  const marketsInView = useInView(marketsRef, { once: true, amount: 0.2 })
  const pathname = usePathname()


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
    setIsMounted(true)
  }, [])

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
      setTotalSupplied(15000 + Math.random() * 1000)
      setTotalBorrowed(4000 + Math.random() * 1000)
      setNetAPY(2 + Math.random() * 2)
      setBorrowLimitUsed(50 + Math.random() * 30)
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

    if (type === "supply") {
      setTotalSupplied((prev) => prev + numericAmount);
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
    } else if (type === "borrow") {
      setTotalBorrowed((prev) => prev + numericAmount);
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
    }
  };

  const handleViewPortfolioDetails = (asset: PortfolioAsset) => {
    if (!isDemoMode) return;
    setSelectedPortfolioAsset(asset);
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
      <div className={cn("container mx-auto px-4 md:px-6 py-8 transition-all duration-300", { "blur-sm": isLoading })}>
        <AnimatePresence>
          {isLoading && (
             <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50"
            >
              <RefreshCw className="h-10 w-10 animate-spin text-primary" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Header section with Title and Easy Mode Toggle */} 
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-4">
          <div>
             {/* Keep Title if desired */}
             <h1 className="text-2xl md:text-3xl font-bold">Peridot DeFi</h1>
             <p className="text-sm text-muted-foreground">Cross-chain lending & borrowing</p>
          </div>
          <div className="flex items-center gap-2 mt-2 md:mt-0">

             {/* Refresh Button */}
            <Button variant="outline" size="sm" onClick={handleRefresh} className="h-8 px-3">
               <RefreshCw className="h-3.5 w-3.5 mr-1" /> <span className="text-xs">Refresh</span>
             </Button>
             {/* Conditionally show Connect Button based on path if needed, or always show */}
            <ConnectWalletButton className="w-full md:w-auto" /> 
          </div>
        </div>

        {/* Modern Dashboard Overview */}
        <Card className="bg-card border-border/50 overflow-hidden shadow-sm mb-4">
          <CardContent className="p-6">
            {/* Desktop Layout */}
            <div className="hidden md:flex md:items-center md:justify-between mb-8">
              {/* Supply Balance - Left */}
              <div className="flex flex-col">
                <div className="text-sm font-medium text-green-400 mb-1">SUPPLY BALANCE</div>
                <div className="text-3xl font-bold">
                  <AnimatedCounter value={totalSupplied} prefix="$" duration={0.8} />
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  {totalSupplied > 0 ? `${(totalSupplied / 1000).toFixed(2)}K PDOT supplied` : '0.00 PDOT supplied'}
                </div>
              </div>

              {/* APY Circle - Center */}
              <div className="flex flex-col items-center">
                <div className="relative">
                  <div className={cn(
                    "absolute inset-0 rounded-full blur-xl",
                    isMounted && theme === "light" ? "bg-green-700/50" : "bg-green-600/40"
                  )}></div>
                  <div className={cn(
                    "w-32 h-32 rounded-full bg-gradient-to-br flex items-center justify-center relative z-10",
                    isMounted && theme === "light" ? "from-green-700/40 to-green-600/50" : "from-green-600/30 to-green-500/40"
                  )}>
                    <div className={cn(
                      "absolute inset-2 rounded-full bg-gradient-to-br flex items-center justify-center shadow-lg z-20",
                      isMounted && theme === "light" ? "from-green-700 to-green-600" : "from-green-600 to-green-500"
                    )}>
                      <div className="text-center relative z-30">
                        <div className="text-xs font-medium" style={{ color: '#ffffff' }}>SUPPLY APY</div>
                        <div className="text-xl font-bold" style={{ color: '#ffffff' }}>+{netAPY.toFixed(1)}%</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Borrow Balance - Right */}
              <div className="flex flex-col items-end">
                <div className="text-sm font-medium text-orange-400 mb-1">BORROW BALANCE</div>
                <div className="text-3xl font-bold">
                  <AnimatedCounter value={totalBorrowed} prefix="$" duration={0.8} />
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  {totalBorrowed > 0 ? 'Active loans' : 'No active loans'}
                </div>
              </div>
            </div>

            {/* Mobile Layout */}
            <div className="md:hidden flex items-center gap-6 mb-8">
              {/* APY Circle - Left */}
              <div className="flex-shrink-0">
                <div className="relative">
                  <div className={cn(
                    "absolute inset-0 rounded-full blur-xl",
                    isMounted && theme === "light" ? "bg-green-700/50" : "bg-green-600/40"
                  )}></div>
                  <div className={cn(
                    "w-24 h-24 rounded-full bg-gradient-to-br flex items-center justify-center relative z-10",
                    isMounted && theme === "light" ? "from-green-700/40 to-green-600/50" : "from-green-600/30 to-green-500/40"
                  )}>
                    <div className={cn(
                      "absolute inset-2 rounded-full bg-gradient-to-br flex items-center justify-center shadow-lg z-20",
                      isMounted && theme === "light" ? "from-green-700 to-green-600" : "from-green-600 to-green-500"
                    )}>
                      <div className="text-center relative z-30">
                        <div className="text-xs font-medium" style={{ color: '#ffffff' }}>SUPPLY</div>
                        <div className="text-xs font-medium" style={{ color: '#ffffff' }}>APY</div>
                        <div className="text-lg font-bold" style={{ color: '#ffffff' }}>+{netAPY.toFixed(1)}%</div>
                      </div>
                    </div>
                  </div>
                </div>
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
                  <h3 className="text-sm font-medium">
                    Borrow Limit (80% of{' '}
                    <span className="text-green-400">
                      <AnimatedCounter value={totalSupplied * 0.8} prefix="$" duration={0.8} />
                    </span>
                    {' '}collateral)
                  </h3>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="ml-1 cursor-pointer"><HelpCircle className="h-3 w-3 text-text/40" /></span>
                    </TooltipTrigger>
                    <TooltipContent side="right"><p className="text-xs max-w-[200px]">Maximum borrowing limit based on your collateral.</p></TooltipContent>
                  </Tooltip>
                </div>
                <div className="text-sm text-green-400 font-medium">
                  <AnimatedCounter value={totalSupplied * 0.8 - totalBorrowed} prefix="$" duration={0.8} />{' '}
                  available
                </div>
              </div>
              
              <Progress value={borrowLimitUsed} className="h-2 w-full bg-muted/30 [&>div]:bg-green-500 mb-2" />
              
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  <AnimatedCounter value={totalBorrowed} prefix="$" duration={0.8} /> borrowed
                </span>
                <span>
                  <AnimatedCounter value={totalSupplied * 0.8} prefix="$" duration={0.8} /> max
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Markets Section with Tabs */}
        <Tabs defaultValue="markets" value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid grid-cols-3 w-full md:w-auto mb-4">
            <TabsTrigger value="markets">Markets</TabsTrigger>
            <TabsTrigger value="portfolio">Portfolio</TabsTrigger>
            <TabsTrigger value="stake">Stake</TabsTrigger>
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

             {/* Collateral Dashboard */}
             {isConnected && (
               <div className="mb-6">
                 <CollateralDashboard />
               </div>
             )}
             
             {/* Combined Markets Table */}
              <AnimatedCard>
                <Card>
                  <CardHeader className="pb-2">
                   <CardTitle>Markets</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                   <div className="overflow-hidden">
                     <Table className="w-full overflow-hidden">
                        <TableHeader>
                          <TableRow>
                           <TableHead className="text-left pl-4">Asset</TableHead>
                           <TableHead className="text-center hidden sm:table-cell">Supply APY</TableHead>
                           <TableHead className="text-center hidden sm:table-cell">Borrow APY</TableHead>
                           <TableHead className="text-center sm:hidden">APY</TableHead>
                           <TableHead className="text-right">Balance</TableHead>
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
              {/* Portfolio Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <AnimatedCard>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Total Portfolio Value</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="text-2xl font-bold">
                        <AnimatedCounter value={totalPortfolioValue} prefix="$" />
                      </div>
                      <div className="flex items-center text-sm text-green-500">
                        <TrendingUp className="h-4 w-4 mr-1" />
                        +$1234 (2.25%) 24h
                      </div>
                    </CardContent>
                  </Card>
                </AnimatedCard>

                <AnimatedCard delay={0.1}>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Asset Allocation</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 flex items-center justify-center">
                      <DonutChart value={40} max={100} size={80} color="var(--primary)" />
                      <div className="ml-4 space-y-1">
                        {portfolioData.slice(0, 4).map((asset, index) => {
                          const colors = ['text-blue-500', 'text-green-500', 'text-orange-500', 'text-pink-500']
                          return (
                            <div key={asset.id} className="flex items-center text-xs">
                              <div className={cn("w-2 h-2 rounded-full mr-2", colors[index]?.replace('text-', 'bg-'))} />
                              <span className="font-medium">{asset.symbol}:</span>
                              <span className="ml-1">{asset.allocation}%</span>
                            </div>
                          )
                        })}
                      </div>
                    </CardContent>
                  </Card>
                </AnimatedCard>

                <AnimatedCard delay={0.2}>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">24h Performance</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="text-2xl font-bold text-green-500">+2.25%</div>
                      <div className="text-sm text-muted-foreground">Best: SOL +4.78%</div>
                    </CardContent>
                  </Card>
                </AnimatedCard>
              </div>

              {/* My Assets Table */}
              <AnimatedCard delay={0.3}>
                <Card>
                  <CardHeader>
                    <CardTitle>My Assets</CardTitle>
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
            <div className="space-y-6">
              {/* Staking Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <AnimatedCard>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center">
                        <PiggyBank className="h-4 w-4 mr-2" />
                        Total Staked Value
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="text-2xl font-bold">
                        <AnimatedCounter value={totalStakedValue} prefix="$" />
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Across {stakingData.length} pools
                      </div>
                    </CardContent>
                  </Card>
                </AnimatedCard>

                <AnimatedCard delay={0.1}>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center">
                        <Zap className="h-4 w-4 mr-2" />
                        Total Rewards
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="text-2xl font-bold text-green-500">
                        <AnimatedCounter value={totalRewards} prefix="$" />
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Available to claim
                      </div>
                    </CardContent>
                  </Card>
                </AnimatedCard>

                <AnimatedCard delay={0.2}>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center">
                        <BarChart4 className="h-4 w-4 mr-2" />
                        Average APY
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="text-2xl font-bold">
                        {(stakingData.reduce((acc, asset) => acc + asset.apy, 0) / stakingData.length).toFixed(1)}%
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Weighted average
                      </div>
                    </CardContent>
                  </Card>
                </AnimatedCard>
              </div>

              {/* Active Stakes Table */}
              <AnimatedCard delay={0.3}>
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>Active Stakes</CardTitle>
                      <Badge variant="outline" className="text-xs">
                        {stakingData.filter(asset => asset.status === "active").length} Active
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <Table className="min-w-[800px]">
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[20%]">Asset</TableHead>
                            <TableHead className="w-[15%] text-right">APY</TableHead>
                            <TableHead className="w-[20%] text-right">Staked Amount</TableHead>
                            <TableHead className="w-[15%] text-right">Total Value</TableHead>
                            <TableHead className="w-[15%] text-center">Status</TableHead>
                            <TableHead className="w-[15%]">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {stakingData.map((asset) => (
                            <StakingAssetRow
                              key={asset.id}
                              asset={asset}
                              onManageStake={handleManageStake}
                              onClaimRewards={handleClaimRewards}
                            />
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </AnimatedCard>

              {/* Quick Actions */}
              <AnimatedCard delay={0.4}>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Quick Actions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => isDemoMode && alert("Claim All Rewards: $" + totalRewards.toFixed(2))}
                        disabled={!isDemoMode || totalRewards <= 0}
                      >
                        <Zap className="h-4 w-4 mr-1" />
                        Claim All Rewards
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => isDemoMode && alert("Auto-compound feature coming soon!")}
                        disabled={!isDemoMode}
                      >
                        <RefreshCw className="h-4 w-4 mr-1" />
                        Auto-Compound
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => isDemoMode && alert("Portfolio rebalancing coming soon!")}
                        disabled={!isDemoMode}
                      >
                        <BarChart3 className="h-4 w-4 mr-1" />
                        Rebalance
                      </Button>
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

      </div>
    </TooltipProvider>
  )
}

"use client"

import { TooltipTrigger } from "@/components/ui/tooltip"

import { useState, useEffect, useRef, useMemo, useCallback } from "react"
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
  Users,
  AlertTriangle,
  Loader2,
  ChevronDown,
  Wifi,
  WifiOff,
} from "lucide-react"
import Image from "next/image"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipProvider } from "@/components/ui/tooltip"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi'
import { ConnectWalletButton } from "@/components/wallet/connect-wallet-button"
import { motion, AnimatePresence, useInView } from "framer-motion"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"
import { useMobile } from "@/hooks/use-mobile"
import { useReducedMotion } from "@/hooks/use-reduced-motion"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import Link from "next/link"
import EasyMode from "@/components/app-modes/EasyMode"
import { usePathname } from "next/navigation"
import { PeridottrollerABI } from '../../abi/PeridottrollerABI' // Adjusted path
import { PEtherABI } from '../../abi/PEtherABI' // Add PEtherABI import
import { ERC20ABI } from '../../abi/ERC20ABI' // Add ERC20ABI import
import { Asset, supplyMarkets, borrowMarkets } from '../data/markets' // Import from new markets file
import { useLiveAccountData, useLiveMarketData, useLivePortfolioData } from '../hooks/useLiveData'
import type { 
  PortfolioAsset, 
  PortfolioSummary, 
  StakingPool, 
  StakingSummary, 
  OnboardingStep, 
  PaymentMethod, 
  EasyModeAction, 
  EasyModeTransaction,
  TransactionStatus
} from '../types/defi'
// Import extracted UI components
import { AnimatedCounter, MiniChart, DonutChart, AnimatedCard } from '../components/ui/ChartComponents'
import { AssetRow, AssetDetailCard } from '../components/ui/AssetComponents'
// Import utility functions
import { generateChartData, getColorForAsset } from '../utils/chartHelpers'
// Import new modular components
import { UserPositionsCard, type UserPosition } from '../components/markets/UserPositionsCard'
import { RiskManagementCard } from '../components/markets/RiskManagementCard'
import { MarketInsightsCard } from '../components/markets/MarketInsightsCard'
import { useUserPositions, DEMO_TOTALS } from '../hooks/useUserPositions'
import { PositionManagementCard } from '../components/dashboard/PositionManagementCard'
import { MarketInsightsWrapper } from '../components/dashboard/MarketInsightsWrapper'
// Import new network configuration
import { supportedNetworks, soneiumMinato, getPeridottrollerAddress, getNetworkConfig, isSupportedNetwork, networkContracts, getNetworkDisplayInfo } from '../../config/networks'
// Import NetworkSwitcher component
import { NetworkSwitcher } from '../../components/network/NetworkSwitcher'
import { NetworkDemo } from '../../components/network/NetworkDemo'
import { useSolana } from '@/hooks/use-solana'
// Import LoadingCubes component
import { LoadingCubes } from '../components/ui/LoadingCubes'

// Define Peridottroller address for Soneium Minato
// const peridottrollerAddressSoneiumMinato = '0xB911C192ed1d6428A12F2Cf8F636B00c34e68a2a' as `0x${string}`;

// Define PERC token address for Soneium Minato
// const percTokenAddressSoneiumMinato = '0x28fE679719e740D15FC60325416bB43eAc50cD15' as `0x${string}`;

// Define pToken addresses for different assets
// const pTokenAddresses = {
//   PERC: '0x1DCb19949fC0a68cbdAa53Cce898B60D7436b14F' as `0x${string}`,
//   // Add more pToken addresses as they become available
// } as const;

// Demo data constants - now using consistent values from useUserPositions
const DEMO_DATA = {
  totalSupplied: DEMO_TOTALS.totalSupplied,
  totalBorrowed: DEMO_TOTALS.totalBorrowed,
  netAPY: DEMO_TOTALS.netAPY,
  borrowLimitUsed: DEMO_TOTALS.borrowLimitUsed,
  portfolioSummary: {
    totalValue: 55873.21,
    change24hValue: 1234.56,
    change24hPercentage: 2.25,
  },
  portfolioAssets: [
    { id: "sol", name: "Solana", symbol: "SOL", icon: "/tokenimages/app/solana-sol-logo.svg", amount: 150.5, price: 148.93, value: 22413.96, allocation: 40.11, change24h: 4.78 },
    { id: "pdt", name: "Peridot", symbol: "PDT", icon: "/logo.svg", amount: 1200.0, price: 14.86, value: 17832.00, allocation: 31.91, change24h: 7.21 },
    { id: "eth", name: "Ether", symbol: "ETH", icon: "/tokenimages/app/ethereum-eth-logo.svg", amount: 3.0, price: 3521.48, value: 10564.44, allocation: 18.91, change24h: 2.34 },
    { id: "usdc", name: "USD Coin", symbol: "USDC", icon: "/tokenimages/app/usd-coin-usdc-logo.svg", amount: 5062.81, price: 1.00, value: 5062.81, allocation: 9.06, change24h: 0.01 },
  ],
  stakingSummary: {
    totalStakedValue: 25340.75,
    totalRewardsValue: 672.11,
    averageApy: 9.75,
  },
  stakingPools: [
    { id: "pdt-stake", assetName: "Peridot", assetSymbol: "PDT", assetIcon: "/logo.svg", apy: 12.5, totalStaked: 1500000, userStakedAmount: 800, userStakedValue: 11888, rewardsEarned: 25.5, rewardsEarnedValue: 378.99, lockupPeriod: "30 days" },
    { id: "sol-stake", assetName: "Solana", assetSymbol: "SOL", assetIcon: "/tokenimages/app/solana-sol-logo.svg", apy: 7.0, totalStaked: 5000000, userStakedAmount: 50, userStakedValue: 7446.5, rewardsEarned: 1.2, rewardsEarnedValue: 178.71, lockupPeriod: "Flexible" },
    { id: "usdc-lp-stake", assetName: "USDC LP", assetSymbol: "USDC-LP", assetIcon: "/tokenimages/app/usd-coin-usdc-logo.svg", apy: 9.75, totalStaked: 250000, userStakedAmount: 6000, userStakedValue: 6006.25, rewardsEarned: 115.3, rewardsEarnedValue: 115.41, lockupPeriod: "14 days"},
  ]
};

export default function AppPage() {
  const { theme } = useTheme()
  const isMobile = useMobile()
  const { shouldUseReducedAnimations } = useReducedMotion()
  // useAccount returns chain info including id
  const { address, isConnected, isConnecting, chain } = useAccount()
  const { switchChain, isPending: isSwitchingNetwork } = useSwitchChain()

  // Network configuration
  const currentChainId = chain?.id;
  const isCurrentNetworkSupported = currentChainId ? isSupportedNetwork(currentChainId) : false;
  
  // Optimized debug logging - only log when values actually change
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('Network State Changed:', {
        chainId: currentChainId,
        chainName: chain?.name,
        isConnected,
        isCurrentNetworkSupported,
        supportedNetworkIds: supportedNetworks.map(n => n.id)
      });
    }
  }, [currentChainId, chain?.name, isConnected, isCurrentNetworkSupported]); // Only log when these values change
  
  const peridottrollerAddress = currentChainId && isCurrentNetworkSupported
    ? getPeridottrollerAddress(currentChainId)
    : getPeridottrollerAddress(soneiumMinato.id);
  
  const networkConfig = currentChainId && isCurrentNetworkSupported 
    ? getNetworkConfig(currentChainId) 
    : getNetworkConfig(soneiumMinato.id);

  // Get PERC token address and pToken address dynamically
  const percTokenAddress = networkConfig.peridotToken;
  const pPercTokenAddress = 'pTokens' in networkConfig && networkConfig.pTokens && 'PERC' in networkConfig.pTokens 
    ? networkConfig.pTokens.PERC 
    : undefined;

  // State declarations first
  const [isDemoMode, setIsDemoMode] = useState(true)
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null)
  const [isDetailSupply, setIsDetailSupply] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [isEasyMode, setIsEasyMode] = useState(false)
  const [showLiveModeComingSoon, setShowLiveModeComingSoon] = useState(false)
  const [focusAmountInputInModal, setFocusAmountInputInModal] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<"idle" | "pendingSignature" | "transactionPending" | "success" | "error">("idle");
  const [transactionHash, setTransactionHash] = useState<string | null>(null);

  // Data state - will be populated based on demo/live mode
  const [totalSupplied, setTotalSupplied] = useState(DEMO_DATA.totalSupplied)
  const [totalBorrowed, setTotalBorrowed] = useState(DEMO_DATA.totalBorrowed)
  const [netAPY, setNetAPY] = useState(DEMO_DATA.netAPY)
  const [borrowLimitUsed, setBorrowLimitUsed] = useState(DEMO_DATA.borrowLimitUsed)
  const [searchTerm, setSearchTerm] = useState("")
  const [supplyChartData, setSupplyChartData] = useState<Array<{day: number; value: number}>>([])
  const [borrowChartData, setBorrowChartData] = useState<Array<{day: number; value: number}>>([])
  const [activeTab, setActiveTab] = useState("lending")
  const [supplyData, setSupplyData] = useState<Asset[]>(supplyMarkets)
  const [borrowData, setBorrowData] = useState<Asset[]>(borrowMarkets)

  // Portfolio State
  const [portfolioSummary, setPortfolioSummary] = useState<PortfolioSummary>(DEMO_DATA.portfolioSummary)
  const [portfolioAssets, setPortfolioAssets] = useState<PortfolioAsset[]>(DEMO_DATA.portfolioAssets)

  // Staking State
  const [stakingSummary, setStakingSummary] = useState<StakingSummary>(DEMO_DATA.stakingSummary)
  const [stakingPools, setStakingPools] = useState<StakingPool[]>(DEMO_DATA.stakingPools)

  // Live data hooks (now that isDemoMode is declared)
  const liveAccountData = useLiveAccountData(isDemoMode, address, isConnected, chain);
  const liveMarketData = useLiveMarketData(isDemoMode, isConnected, chain);
  const livePortfolioData = useLivePortfolioData(isDemoMode, address, isConnected, chain);

  // User positions hook - FIXED: Remove constant re-triggering
  const {
    positions: userPositions,
    isLoading: isLoadingPositions,
    error: positionsError,
    refetch: refetchPositions,
    toggleCollateral: togglePositionCollateral,
    totalSupplied: userTotalSupplied,
    totalBorrowed: userTotalBorrowed,
    netAPY: userNetAPY,
    healthFactor: userHealthFactor,
    liquidationRisk
  } = useUserPositions({ isDemoMode }); // Removed refreshTrigger: Date.now() - this was causing constant re-renders!

  // Market insights state
  const [selectedMarketForInsights, setSelectedMarketForInsights] = useState("usdc");

  // Demo market data for insights - MEMOIZED FOR PERFORMANCE
  const demoMarketData = useMemo(() => {
    // Create static chart data once to avoid recalculation
    const staticPriceHistory = Array.from({ length: 7 }, (_, i) => ({
      timestamp: Date.now() - (6 - i) * 24 * 60 * 60 * 1000,
      price: 1.0 + Math.sin(i * 0.5) * 0.02 // Simple sine wave for demo
    }));
    
    const staticApyHistory = Array.from({ length: 7 }, (_, i) => ({
      timestamp: Date.now() - (6 - i) * 24 * 60 * 60 * 1000,
      supplyAPY: 4.25 + Math.sin(i * 0.3) * 0.5,
      borrowAPY: 6.8 + Math.sin(i * 0.3) * 0.8
    }));

    return [
      {
        id: "usdc",
        asset: {
          name: "USD Coin",
          symbol: "USDC",
          icon: "/tokenimages/app/usd-coin-usdc-logo.svg",
          chain: "Ethereum"
        },
        supplyAPY: 4.25,
        borrowAPY: 6.8,
        totalSupplied: 125000000,
        totalBorrowed: 89000000,
        totalReserves: 2500000,
        utilizationRate: 71.2,
        collateralFactor: 80,
        liquidationThreshold: 85,
        reserveFactor: 15,
        userSupplied: isDemoMode ? 5000 : undefined,
        userBorrowed: isDemoMode ? 3500 : undefined,
        priceHistory: staticPriceHistory,
        apyHistory: staticApyHistory,
      },
      {
        id: "eth", 
        asset: {
          name: "Ethereum",
          symbol: "ETH",
          icon: "/tokenimages/app/ethereum-eth-logo.svg",
          chain: "Ethereum"
        },
        supplyAPY: 3.85,
        borrowAPY: 5.2,
        totalSupplied: 85000000,
        totalBorrowed: 62000000,
        totalReserves: 1800000,
        utilizationRate: 72.9,
        collateralFactor: 75,
        liquidationThreshold: 80,
        reserveFactor: 20,
        userSupplied: isDemoMode ? 10564 : undefined,
        userBorrowed: undefined,
        priceHistory: staticPriceHistory.map(p => ({ ...p, price: p.price * 3500 })),
        apyHistory: staticApyHistory.map(a => ({ ...a, supplyAPY: 3.85, borrowAPY: 5.2 })),
      },
      {
        id: "sol",
        asset: {
          name: "Solana", 
          symbol: "SOL",
          icon: "/tokenimages/app/solana-sol-logo.svg",
          chain: "Solana"
        },
        supplyAPY: 5.2,
        borrowAPY: 7.5,
        totalSupplied: 45000000,
        totalBorrowed: 32000000,
        totalReserves: 900000,
        utilizationRate: 71.1,
        collateralFactor: 70,
        liquidationThreshold: 75,
        reserveFactor: 18,
        userSupplied: isDemoMode ? 22414 : undefined,
        userBorrowed: undefined,
        priceHistory: staticPriceHistory.map(p => ({ ...p, price: p.price * 150 })),
        apyHistory: staticApyHistory.map(a => ({ ...a, supplyAPY: 5.2, borrowAPY: 7.5 })),
      },
      {
        id: "usdt",
        asset: {
          name: "Tether USD",
          symbol: "USDT", 
          icon: "/tokenimages/app/tether-usdt-logo.svg",
          chain: "Ethereum"
        },
        supplyAPY: 3.1,
        borrowAPY: 7.2,
        totalSupplied: 95000000,
        totalBorrowed: 68000000,
        totalReserves: 1900000,
        utilizationRate: 71.6,
        collateralFactor: 75,
        liquidationThreshold: 80,
        reserveFactor: 20,
        userSupplied: undefined,
        userBorrowed: isDemoMode ? 1200 : undefined,
        priceHistory: staticPriceHistory,
        apyHistory: staticApyHistory.map(a => ({ ...a, supplyAPY: 3.1, borrowAPY: 7.2 })),
      }
    ];
  }, [isDemoMode]); // Only recalculate when isDemoMode changes

  // Risk data for risk management component
  const riskData = useMemo(() => ({
    healthFactor: userHealthFactor,
    liquidationRisk: liquidationRisk,
    totalCollateral: userTotalSupplied,
    totalBorrowed: userTotalBorrowed,
    borrowLimit: userTotalSupplied * 0.75, // Assuming 75% LTV
    borrowLimitUsed: userTotalSupplied > 0 ? (userTotalBorrowed / (userTotalSupplied * 0.75)) * 100 : 0,
    liquidationThreshold: 85,
    priceImpactRisk: "medium" as const
  }), [userHealthFactor, liquidationRisk, userTotalSupplied, userTotalBorrowed]);

  // Position management handlers - OPTIMIZED: Removed excessive console.logs
  const handleManagePosition = useCallback((position: UserPosition) => {
    // This would typically open a modal or navigate to a management page
    // For now, we'll just open the asset detail modal
    const asset = supplyData.find(a => a.symbol === position.asset.symbol) || 
                  borrowData.find(a => a.symbol === position.asset.symbol);
    if (asset) {
      setSelectedAsset(asset);
      setIsDetailSupply(position.type === "supply");
    }
  }, [supplyData, borrowData])

  const handleAddCollateral = useCallback(() => {
    // Navigate to supply page or open supply modal
    setActiveTab("lending");
  }, [])

  const handleRepayDebt = useCallback(() => {
    // Navigate to repay page or open repay modal
    setActiveTab("lending");
  }, [])

  // Refs for animations
  const heroRef = useRef<HTMLDivElement>(null)
  const summaryRef = useRef<HTMLDivElement>(null)
  const marketsRef = useRef<HTMLDivElement>(null)
  const heroInView = useInView(heroRef, { once: true, amount: 0.3 })
  const summaryInView = useInView(summaryRef, { once: true, amount: 0.3 })
  const marketsInView = useInView(marketsRef, { once: true, amount: 0.2 })
  const pathname = usePathname()

  // --- START WAGMI WRITE CONTRACT HOOKS ---
  const { data: enterMarketsHash, writeContract: enterMarkets } = useWriteContract();
  const { data: exitMarketHash, writeContract: exitMarket } = useWriteContract();
  const { data: supplyEthHash, writeContract: supplyEth } = useWriteContract();
  const { data: mintPercHash, writeContract: mintPerc } = useWriteContract();
  const { data: approvePercHash, writeContract: approvePerc } = useWriteContract();

  const { isLoading: isLoadingEnterMarketsTx, isSuccess: isSuccessEnterMarketsTx } = useWaitForTransactionReceipt({
    hash: enterMarketsHash,
  });
  const { isLoading: isLoadingExitMarketTx, isSuccess: isSuccessExitMarketTx } = useWaitForTransactionReceipt({
    hash: exitMarketHash,
  });
  const { isLoading: isLoadingSupplyEthTx, isSuccess: isSuccessSupplyEthTx } = useWaitForTransactionReceipt({
    hash: supplyEthHash,
  });
  const { isLoading: isLoadingMintPercTx, isSuccess: isSuccessMintPercTx } = useWaitForTransactionReceipt({
    hash: mintPercHash,
  });
  const { isLoading: isLoadingApprovePercTx, isSuccess: isSuccessApprovePercTx } = useWaitForTransactionReceipt({
    hash: approvePercHash,
  });
  // --- END WAGMI WRITE CONTRACT HOOKS ---

  // Read getBlockNumber
  const { data: blockNumber, error: blockNumberError, isLoading: isLoadingBlockNumber } = useReadContract({
    abi: PeridottrollerABI,
    address: peridottrollerAddress,
    functionName: 'getBlockNumber',
    // Only execute if connected and address is available
    query: { enabled: isConnected && isCurrentNetworkSupported && !!peridottrollerAddress }, 
  });

  // Read peridottrollerImplementation to get the actual implementation address
  const { 
    data: implementationAddress, 
    error: implementationError, 
    isLoading: isLoadingImplementation 
  } = useReadContract({
    abi: PeridottrollerABI,
    address: peridottrollerAddress,
    functionName: 'peridottrollerImplementation',
    query: { enabled: isConnected && isCurrentNetworkSupported && !!peridottrollerAddress },
  });

  // Read getAccountLiquidity
  const { 
    data: accountLiquidityData, 
    error: accountLiquidityError, 
    isLoading: isLoadingAccountLiquidity,
    refetch: refetchAccountLiquidity // Added refetch function
  } = useReadContract({
    abi: PeridottrollerABI,
    address: peridottrollerAddress,
    functionName: 'getAccountLiquidity',
    args: [address as `0x${string}`], // Pass the user's address as an argument
    // Only execute if connected and address is available
    query: { enabled: isConnected && isCurrentNetworkSupported && !!address && !!peridottrollerAddress },
  });

  // Read getAllMarkets
  const { 
    data: allMarkets, 
    error: allMarketsError, 
    isLoading: isLoadingAllMarkets 
  } = useReadContract({
    abi: PeridottrollerABI,
    address: peridottrollerAddress,
    functionName: 'getAllMarkets',
    query: { enabled: isConnected && isCurrentNetworkSupported && !!peridottrollerAddress },
  });

  // Read oracle address
  const { 
    data: oracleAddress, 
    error: oracleError, 
    isLoading: isLoadingOracle 
  } = useReadContract({
    abi: PeridottrollerABI,
    address: peridottrollerAddress,
    functionName: 'oracle',
    query: { enabled: isConnected && isCurrentNetworkSupported && !!peridottrollerAddress },
  });

  // Read market information for the PERC token
  const pTokenAddress = pPercTokenAddress || '0x1DCb19949fC0a68cbdAa53Cce898B60D7436b14F' as `0x${string}`;
  
  const { 
    data: marketInfo, 
    error: marketInfoError, 
    isLoading: isLoadingMarketInfo 
  } = useReadContract({
    abi: PeridottrollerABI,
    address: peridottrollerAddress,
    functionName: 'markets',
    args: [pTokenAddress],
    query: { enabled: isConnected && isCurrentNetworkSupported && !!peridottrollerAddress },
  });

  // Check if user is in this market
  const { 
    data: checkMembership, 
    error: checkMembershipError, 
    isLoading: isLoadingCheckMembership 
  } = useReadContract({
    abi: PeridottrollerABI,
    address: peridottrollerAddress,
    functionName: 'checkMembership',
    args: [address as `0x${string}`, pTokenAddress],
    query: { enabled: isConnected && isCurrentNetworkSupported && !!address && !!peridottrollerAddress },
  });

  // Get user's assets in the protocol
  const { 
    data: assetsIn, 
    error: assetsInError, 
    isLoading: isLoadingAssetsIn 
  } = useReadContract({
    abi: PeridottrollerABI,
    address: peridottrollerAddress,
    functionName: 'getAssetsIn',
    args: [address as `0x${string}`],
    query: { enabled: isConnected && isCurrentNetworkSupported && !!address && !!peridottrollerAddress },
  });

  // Read PERC token balance
  const { 
    data: percBalance, 
    error: percBalanceError, 
    isLoading: isLoadingPercBalance,
    refetch: refetchPercBalance
  } = useReadContract({
    abi: ERC20ABI,
    address: percTokenAddress,
    functionName: 'balanceOf',
    args: [address as `0x${string}`],
    query: { enabled: isConnected && isCurrentNetworkSupported && !!address && !!percTokenAddress },
  });

  // Read PERC token allowance for pPERC contract
  const { 
    data: percAllowance, 
    error: percAllowanceError, 
    isLoading: isLoadingPercAllowance,
    refetch: refetchPercAllowance
  } = useReadContract({
    abi: ERC20ABI,
    address: percTokenAddress,
    functionName: 'allowance',
    args: [address as `0x${string}`, pTokenAddress],
    query: { enabled: isConnected && isCurrentNetworkSupported && !!address && !!percTokenAddress },
  });

  // Data switching logic: Use live data when not in demo mode, otherwise use demo data
  useEffect(() => {
    if (!isDemoMode && liveAccountData) {
      // Update state with live data
      setTotalSupplied(liveAccountData.totalSupplied);
      setTotalBorrowed(liveAccountData.totalBorrowed);
      setNetAPY(liveAccountData.netAPY);
      setBorrowLimitUsed(liveAccountData.borrowLimitUsed);
    } else if (isDemoMode) {
      // Reset to demo data when switching back to demo mode
      setTotalSupplied(DEMO_DATA.totalSupplied);
      setTotalBorrowed(DEMO_DATA.totalBorrowed);
      setNetAPY(DEMO_DATA.netAPY);
      setBorrowLimitUsed(DEMO_DATA.borrowLimitUsed);
    }
  }, [isDemoMode, liveAccountData]);

  // Update market data based on mode
  useEffect(() => {
    if (!isDemoMode && liveMarketData) {
      setSupplyData(liveMarketData.supplyMarkets);
      setBorrowData(liveMarketData.borrowMarkets);
    } else if (isDemoMode) {
      setSupplyData(supplyMarkets);
      setBorrowData(borrowMarkets);
    }
  }, [isDemoMode, liveMarketData]);

  // Update portfolio data based on mode
  useEffect(() => {
    if (!isDemoMode && livePortfolioData) {
      setPortfolioSummary(livePortfolioData.summary);
      setPortfolioAssets(livePortfolioData.assets);
    } else if (isDemoMode) {
      setPortfolioSummary(DEMO_DATA.portfolioSummary);
      setPortfolioAssets(DEMO_DATA.portfolioAssets);
    }
  }, [isDemoMode, livePortfolioData]);

  useEffect(() => {
    if (accountLiquidityData) {
      if (process.env.NODE_ENV === 'development') {
        console.log("Account liquidity updated:", {
          errorCode: accountLiquidityData[0].toString(),
          liquidity: accountLiquidityData[1].toString(),
          shortfall: accountLiquidityData[2].toString(),
        });
      }
    }
    if (accountLiquidityError) {
      console.error("Account liquidity error:", accountLiquidityError);
    }
  }, [accountLiquidityData, accountLiquidityError]);

  useEffect(() => {
    // Update Easy Mode based on URL
    setIsEasyMode(pathname.includes("/easy"))
  }, [pathname])

  useEffect(() => {
    // Simulate loading data on mount - OPTIMIZED
    setIsLoading(true)
    
    // Generate chart data once and reuse
    const supplyChartDataStatic = generateChartData(30, 0.05, true)
    const borrowChartDataStatic = generateChartData(30, 0.08, true)
    
    // Data loading
    const dataLoadingTimer = setTimeout(() => {
      setSupplyChartData(supplyChartDataStatic)
      setBorrowChartData(borrowChartDataStatic)
      setIsLoading(false)
    }, shouldUseReducedAnimations ? 500 : 1000) // Faster since NavigationLoader handles initial loading
    
    return () => {
      clearTimeout(dataLoadingTimer)
    }
  }, [shouldUseReducedAnimations]) // Only depend on performance setting

  // OPTIMIZED HANDLERS - Using useCallback to prevent unnecessary re-renders
  const handleRefresh = useCallback(() => {
    setIsLoading(true)
    // Simulate refreshing data - using original demo values/logic if possible
    setTimeout(() => {
      setSupplyData([...supplyMarkets].sort(() => Math.random() - 0.5))
      setBorrowData([...borrowMarkets].sort(() => Math.random() - 0.5))
      setSupplyChartData(generateChartData(30, 0.05, Math.random() > 0.5))
      setBorrowChartData(generateChartData(30, 0.08, Math.random() > 0.5))
      // Update state with random values for demo or fetch real data
      setTotalSupplied(15000 + Math.random() * 1000)
      setTotalBorrowed(4000 + Math.random() * 1000)
      setNetAPY(2 + Math.random() * 2)
      setBorrowLimitUsed(50 + Math.random() * 30)
      setIsLoading(false)
    }, 1000)
  }, []) // Remove dependencies that cause constant changes

  const handleOpenDetailModal = useCallback((assetForModal: Asset, isSupplyView: boolean) => {
    setSelectedAsset(assetForModal);
    setIsDetailSupply(isSupplyView);
    setFocusAmountInputInModal(false);
  }, [])

  const handleQuickSupplyClick = useCallback((clickedAsset: Asset) => {
    setSelectedAsset(clickedAsset)
    setIsDetailSupply(true)
    setFocusAmountInputInModal(true)
  }, [])

  const handleCloseAssetDetail = useCallback(() => {
    setSelectedAsset(null)
    setFocusAmountInputInModal(false)
  }, [])

  const toggleEasyMode = useCallback(() => {
    setIsEasyMode(!isEasyMode)
  }, [isEasyMode])

  const toggleDemoMode = useCallback(() => {
    if (isDemoMode) {
      setShowLiveModeComingSoon(true)
    } else {
      setIsDemoMode(true)
      setShowLiveModeComingSoon(false)
    }
  }, [isDemoMode])

  const handleConfirmSwitchToLiveMode = useCallback(() => {
    setIsDemoMode(false)
    setShowLiveModeComingSoon(false)
  }, [])

  const handleCancelSwitchToLiveMode = useCallback(() => {
    setShowLiveModeComingSoon(false)
  }, [])

  // Helper function to calculate borrow limit and usage
  const calculateBorrowLimitInfo = (currentSupplyData: Asset[], currentTotalBorrowed: number) => {
    let totalCollateralValue = 0;
    currentSupplyData.forEach(asset => {
      if (asset.collateral) {
        const suppliedAmount = parseFloat(asset.wallet.split(" ")[0]) || 0;
        const price = asset.price || 0;
        // Using a fixed 75% collateral factor for all assets in demo mode
        totalCollateralValue += suppliedAmount * price * 0.75;
      }
    });

    if (totalCollateralValue <= 0) {
      return { maxBorrowable: 0, newBorrowLimitUsedPercentage: currentTotalBorrowed > 0 ? 100 : 0 }; // If no collateral, but borrowed, show 100% used or 0 if nothing borrowed
    }

    const newBorrowLimitUsedPercentage = Math.min((currentTotalBorrowed / totalCollateralValue) * 100, 100);
    return { maxBorrowable: totalCollateralValue, newBorrowLimitUsedPercentage };
  };

  const handleToggleCollateral = (assetId: string) => {
    if (isDemoMode) {
      setSupplyData((prevData) =>
        prevData.map((asset) =>
          asset.id === assetId
            ? { ...asset, collateral: !asset.collateral }
            : asset
        )
      );
      return;
    }

    const assetToToggle = supplyData.find(asset => asset.id === assetId);
    if (!assetToToggle) return;

    // Optimistically update UI first
    const updatedSupplyData = supplyData.map(asset => {
      if (asset.id === assetId && typeof asset.collateral === 'boolean') {
        const suppliedAmount = parseFloat(asset.wallet.split(" ")[0]) || 0;
        if (suppliedAmount > 0) {
          return { ...asset, collateral: !asset.collateral };
        }
      }
      return asset;
    });
    setSupplyData(updatedSupplyData);

    // On-chain interaction
    if (!isDemoMode && assetToToggle.pTokenAddress && address && chain) {
      if (assetToToggle.collateral === false) { 
        console.log(`Entering market with pToken: ${assetToToggle.pTokenAddress}`);
        enterMarkets({
          address: peridottrollerAddress,
          abi: PeridottrollerABI,
          functionName: 'enterMarkets',
          args: [[assetToToggle.pTokenAddress]],
          chain: chain,
          account: address,
        });
      } else { 
        console.log(`Exiting market with pToken: ${assetToToggle.pTokenAddress}`);
        exitMarket({
          address: peridottrollerAddress,
          abi: PeridottrollerABI,
          functionName: 'exitMarket',
          args: [assetToToggle.pTokenAddress],
          chain: chain,
          account: address,
        });
      }
    } else if (!isDemoMode && !assetToToggle.pTokenAddress) {
      console.warn(`No pTokenAddress defined for asset ${assetToToggle.name} to toggle collateral on-chain.`);
    } else if (!isDemoMode && (!address || !chain)) {
      console.warn("Wallet not connected or chain undefined, cannot toggle collateral on-chain.");
    }

    const { newBorrowLimitUsedPercentage } = calculateBorrowLimitInfo(updatedSupplyData, totalBorrowed);
    setBorrowLimitUsed(newBorrowLimitUsedPercentage);
  };

  // Refetch account liquidity when enter/exit market transactions succeed
  useEffect(() => {
    if (isSuccessEnterMarketsTx || isSuccessExitMarketTx) {
      console.log("Collateral transaction successful, refetching account liquidity...");
      refetchAccountLiquidity?.();
    }
  }, [isSuccessEnterMarketsTx, isSuccessExitMarketTx, refetchAccountLiquidity]);

  const handleTransaction = (
    targetAsset: Asset,
    numericAmount: number,
    type: "supply" | "borrow" | "withdraw" | "repay"
  ) => {
    console.log(`Handling ${type} for ${targetAsset.name}, Amount: ${numericAmount}`)
    if (isDemoMode) {
      // Simulate transaction in demo mode
      setTransactionStatus("pendingSignature");
      setTimeout(() => {
        setTransactionStatus("transactionPending");
        setTimeout(() => {
          setTransactionStatus("success");
          setTransactionHash("0xDemoTransactionHash")
          // Update balances or other relevant data based on transaction type
          if (type === "supply") {
            setSupplyData(prev => prev.map(asset => asset.id === targetAsset.id ? { ...asset, wallet: `${parseFloat(asset.wallet) + numericAmount} ${asset.symbol}` } : asset));
          } else if (type === "withdraw") {
            setSupplyData(prev => prev.map(asset => asset.id === targetAsset.id ? { ...asset, wallet: `${Math.max(0, parseFloat(asset.wallet) - numericAmount)} ${asset.symbol}` } : asset));
          } else if (type === "borrow") {
            // Update borrow data - in demo mode we would track this
            console.log(`Demo: Borrowed ${numericAmount} ${targetAsset.symbol}`);
          } else if (type === "repay") {
            // Update repay data - in demo mode we would track this
            console.log(`Demo: Repaid ${numericAmount} ${targetAsset.symbol}`);
          }
          setTimeout(() => setTransactionStatus("idle"), 3000);
        }, 2000);
      }, 1000);
      return;
    }

    if (!address || !chain) {
      console.error("Wallet not connected or chain not identified for transaction");
      setTransactionStatus("error");
      // Optionally, show a message to the user to connect their wallet
      return;
    }

    setTransactionStatus("pendingSignature");

    if (type === "supply") {
      if (targetAsset.symbol === "ETH" && targetAsset.pTokenAddress) {
        supplyEth({
          address: targetAsset.pTokenAddress,
          abi: PEtherABI,
          functionName: 'mint',
          value: BigInt(Math.round(numericAmount * 1e18)), // Ensure it's an integer, then convert to BigInt
          chain: chain,
          account: address,
        }, {
          onSuccess: (data) => {
            setTransactionHash(data);
            setTransactionStatus("transactionPending");
            console.log(`ETH Supply submitted: ${data}`);
          },
          onError: (err) => {
            console.error("ETH Supply error", err);
            setTransactionStatus("error");
          },
        });
      } else if (targetAsset.pTokenAddress) {
        // Handle ERC20 supply here if needed in the future
        console.log(`Supply ${targetAsset.symbol} using its pToken: ${targetAsset.pTokenAddress}`);
        setTransactionStatus("error"); // Placeholder until ERC20 supply is implemented
        console.error("ERC20 supply not implemented yet for this asset.");
      } else {
        console.error(`pTokenAddress not defined for ${targetAsset.name} to supply.`);
        setTransactionStatus("error");
      }
    } else if (type === "withdraw") {
      if (targetAsset.symbol === "ETH" && targetAsset.pTokenAddress) {
        // For ETH withdraw, we need to call redeemUnderlying on the pEther contract
        console.log(`Withdraw ETH from pEther contract`);
        // This would be implemented when withdraw functionality is ready
        setTransactionStatus("error");
        console.error("ETH withdraw not implemented yet.");
      } else if (targetAsset.pTokenAddress) {
        console.log(`Withdraw ${targetAsset.symbol} from pToken: ${targetAsset.pTokenAddress}`);
        setTransactionStatus("error");
        console.error("ERC20 withdraw not implemented yet for this asset.");
      } else {
        console.error(`pTokenAddress not defined for ${targetAsset.name} to withdraw.`);
        setTransactionStatus("error");
      }
    } else if (type === "borrow") {
      if (targetAsset.pTokenAddress) {
        console.log(`Borrow ${targetAsset.symbol} from pToken: ${targetAsset.pTokenAddress}`);
        // This would call the borrow function on the pToken contract
        setTransactionStatus("error");
        console.error("Borrow functionality not implemented yet.");
      } else {
        console.error(`pTokenAddress not defined for ${targetAsset.name} to borrow.`);
        setTransactionStatus("error");
      }
    } else if (type === "repay") {
      if (targetAsset.symbol === "ETH" && targetAsset.pTokenAddress) {
        console.log(`Repay ETH to pEther contract`);
        // This would call repayBorrow on the pEther contract with ETH value
        setTransactionStatus("error");
        console.error("ETH repay not implemented yet.");
      } else if (targetAsset.pTokenAddress) {
        console.log(`Repay ${targetAsset.symbol} to pToken: ${targetAsset.pTokenAddress}`);
        // This would call repayBorrow on the pToken contract
        setTransactionStatus("error");
        console.error("ERC20 repay not implemented yet for this asset.");
      } else {
        console.error(`pTokenAddress not defined for ${targetAsset.name} to repay.`);
        setTransactionStatus("error");
      }
    }
  }

  // Effect to refetch account liquidity after successful enter/exit market or supply
  useEffect(() => {
    if (isSuccessEnterMarketsTx || isSuccessExitMarketTx || isSuccessSupplyEthTx) {
      console.log("Enter/Exit market or Supply transaction successful, refetching account liquidity.");
      refetchAccountLiquidity();
      // Potentially refetch other relevant balances or user data here
      if (isSuccessEnterMarketsTx) {
        // Example: update wallet balance display for ETH
        // This would ideally come from a balance fetch hook
        console.log("ETH supply successful, consider updating ETH wallet balance display.");
      }

    }
  }, [isSuccessEnterMarketsTx, isSuccessExitMarketTx, isSuccessSupplyEthTx, refetchAccountLiquidity]);

  const filteredSupplyData = supplyData.filter(
    (asset) =>
      asset.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      asset.symbol.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  const filteredBorrowData = borrowData.filter(
    (asset) =>
      asset.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      asset.symbol.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  // If Easy Mode is enabled, render it and return early
  if (isEasyMode) {
    return <EasyMode onExitEasyMode={toggleEasyMode} />;
  }

  // Add Solana connection detection
  const { isConnected: isSolanaConnected } = useSolana()

  // Performance monitoring in development
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('🔄 AppPage re-rendered at:', new Date().toISOString())
      console.log('🔍 Current tab:', activeTab)
      console.log('📊 Connected state:', { isConnected, chain: chain?.name })
    }
  }, [activeTab, isConnected, chain?.name]) // Only log when these key values change

  // Pro Mode Return Statement
  return (
    <TooltipProvider>
      <div className={cn("container mx-auto px-2 md:px-6 py-4 md:py-8 transition-all duration-300", { "blur-sm": isLoading })}>
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
        <div className="flex flex-col gap-4 mb-4">
          {/* Title Section */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              {/* Keep Title if desired */}
              <div className="flex items-center gap-3">
                <div>
                  <h1 className="text-2xl md:text-3xl font-bold">Peridot DeFi</h1>
                  <p className="text-sm text-muted-foreground">Cross-chain lending & borrowing</p>
                </div>
              </div>
            </div>
            
            {/* Controls Section - Horizontally Scrollable on Mobile */}
            <div className="flex-shrink-0">
              <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1 min-w-0">
                <div className="flex items-center gap-2 flex-nowrap">
                  {/* Quick Network Switcher */}
                  <div className="flex-shrink-0">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "h-8 justify-between gap-2 min-w-[140px] rounded-xl border-border/50 bg-background/50 backdrop-blur-sm hover:bg-background/80 transition-all duration-200",
                              !isCurrentNetworkSupported && "border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20",
                              isSwitchingNetwork && "cursor-wait"
                            )}
                            disabled={isSwitchingNetwork}
                          >
                            <div className="flex items-center gap-2">
                              {isSwitchingNetwork ? (
                                <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
                              ) : (
                                <>
                                  <div className={cn(
                                    "w-2 h-2 rounded-full transition-colors duration-200",
                                    isCurrentNetworkSupported ? "bg-emerald-500 shadow-emerald-500/50 shadow-sm" : "bg-red-500 shadow-red-500/50 shadow-sm"
                                  )} />
                                  {isCurrentNetworkSupported ? (
                                    <Wifi className="h-3 w-3 text-emerald-600" />
                                  ) : (
                                    <WifiOff className="h-3 w-3 text-red-500" />
                                  )}
                                </>
                              )}
                              <span className="text-xs font-medium truncate">
                                {chain ? chain.name.split(' ')[0] : 'Network'}
                              </span>
                              {!isCurrentNetworkSupported && (
                                <AlertTriangle className="h-3 w-3 text-amber-500" />
                              )}
                            </div>
                            <ChevronDown className="h-3 w-3 opacity-50 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                          </Button>
                        </DropdownMenuTrigger>
                        
                        <DropdownMenuContent 
                          align="end" 
                          className="w-72 rounded-xl border-border/50 bg-background/95 backdrop-blur-md shadow-xl"
                          sideOffset={8}
                        >
                          <DropdownMenuLabel className="flex items-center gap-2 text-sm font-semibold">
                            <Globe className="h-4 w-4 text-blue-500" />
                            Network Selection
                          </DropdownMenuLabel>
                          <DropdownMenuSeparator className="bg-border/50" />
                          
                          {/* Current Network Status */}
                          {chain && (
                            <>
                              <div className="px-2 py-2">
                                <div className="text-xs text-muted-foreground mb-2">Current Network</div>
                                <div className={cn(
                                  "flex items-center justify-between p-2 rounded-lg transition-colors",
                                  isCurrentNetworkSupported 
                                    ? "bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/50" 
                                    : "bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50"
                                )}>
                                  <div className="flex items-center gap-2">
                                    <div className={cn(
                                      "w-2 h-2 rounded-full",
                                      isCurrentNetworkSupported ? "bg-emerald-500" : "bg-amber-500"
                                    )} />
                                    <span className="text-sm font-medium">{chain.name}</span>
                                    {!isCurrentNetworkSupported && (
                                      <AlertTriangle className="h-3 w-3 text-amber-500" />
                                    )}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    ID: {chain.id}
                                  </div>
                                </div>
                              </div>
                              <DropdownMenuSeparator className="bg-border/50" />
                            </>
                          )}
                          
                          {/* Supported Networks */}
                          <div className="px-2 py-1">
                            <div className="text-xs text-muted-foreground mb-2">Available Networks</div>
                            <div className="space-y-1">
                              {supportedNetworks.map((network) => {
                                const isCurrentNetwork = chain?.id === network.id
                                const networkConfig = getNetworkConfig(network.id)
                                const networkInfo = getNetworkDisplayInfo(network.id)
                                
                                return (
                                  <DropdownMenuItem
                                    key={network.id}
                                    onClick={() => !isCurrentNetwork && switchChain && switchChain({ chainId: network.id })}
                                    disabled={isCurrentNetwork || isSwitchingNetwork}
                                    className={cn(
                                      "cursor-pointer rounded-lg p-2 transition-all duration-200 hover:bg-blue-50 dark:hover:bg-blue-950/20",
                                      isCurrentNetwork && "opacity-50 cursor-default bg-gray-50 dark:bg-gray-900/50"
                                    )}
                                  >
                                    <div className="flex items-center justify-between w-full">
                                      <div className="flex items-center gap-2">
                                        <div className={cn(
                                          "w-2 h-2 rounded-full",
                                          isCurrentNetwork ? "bg-emerald-500" : "bg-gray-400"
                                        )} />
                                        <div>
                                          <div className="text-sm font-medium">{network.name}</div>
                                          <div className="text-xs text-muted-foreground">
                                            {networkConfig.chainNameReadable}
                                          </div>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        {networkInfo.isTestnet && (
                                          <div className="px-1.5 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                                            Test
                                          </div>
                                        )}
                                        {isCurrentNetwork && (
                                          <Check className="h-3 w-3 text-emerald-500" />
                                        )}
                                      </div>
                                    </div>
                                  </DropdownMenuItem>
                                )
                              })}
                              
                              {/* Solana Network - Clickable */}
                              <DropdownMenuItem
                                onClick={() => {
                                  // Handle Solana connection logic here
                                  console.log("Switching to Solana network");
                                }}
                                className="cursor-pointer rounded-lg p-2 transition-all duration-200 hover:bg-purple-50 dark:hover:bg-purple-950/20"
                              >
                                <div className="flex items-center justify-between w-full">
                                  <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-purple-500" />
                                    <div>
                                      <div className="text-sm font-medium">Solana</div>
                                      <div className="text-xs text-muted-foreground">
                                        Solana Mainnet
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <div className="px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                                      Live
                                    </div>
                                  </div>
                                </div>
                              </DropdownMenuItem>

                              {/* Coming Soon Networks - Non-clickable */}
                              <div className="px-2 py-1 mt-3">
                                <div className="text-xs text-muted-foreground mb-2">Coming Soon</div>
                                <div className="space-y-1">
                                  {/* Stellar Network - Non-clickable */}
                                  <div className="rounded-lg p-2 opacity-50 cursor-not-allowed bg-gray-50 dark:bg-gray-900/30">
                                    <div className="flex items-center justify-between w-full">
                                      <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-gray-400" />
                                        <div>
                                          <div className="text-sm font-medium">Stellar</div>
                                          <div className="text-xs text-muted-foreground">
                                            Stellar Network
                                          </div>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <div className="px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400">
                                          Soon
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Avalanche Network - Non-clickable */}
                                  <div className="rounded-lg p-2 opacity-50 cursor-not-allowed bg-gray-50 dark:bg-gray-900/30">
                                    <div className="flex items-center justify-between w-full">
                                      <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-gray-400" />
                                        <div>
                                          <div className="text-sm font-medium">Avalanche</div>
                                          <div className="text-xs text-muted-foreground">
                                            Avalanche C-Chain
                                          </div>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <div className="px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400">
                                          Soon
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                          
                          {/* Network Status Footer */}
                          <DropdownMenuSeparator className="bg-border/50" />
                          <div className="px-2 py-2">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">Status:</span>
                              <span className={cn(
                                "font-medium px-2 py-0.5 rounded-full",
                                isCurrentNetworkSupported 
                                  ? "text-emerald-700 bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-900/30" 
                                  : "text-amber-700 bg-amber-100 dark:text-amber-400 dark:bg-amber-900/30"
                              )}>
                                {isCurrentNetworkSupported ? "Connected" : "Unsupported"}
                              </span>
                            </div>
                          </div>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  
                  {/* Demo Mode Toggle Button */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-1 border rounded-xl px-3 py-1.5 bg-background relative flex-shrink-0">
                        <Label htmlFor="demo-mode-switch" className="text-xs cursor-pointer whitespace-nowrap">Demo</Label>
                        <Switch id="demo-mode-switch" checked={isDemoMode} onCheckedChange={toggleDemoMode} />
                        <HelpCircle className="h-3 w-3 text-muted-foreground ml-1" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent><p className="max-w-xs text-xs">Toggle Demo Mode. Live data is coming soon!</p></TooltipContent>
                  </Tooltip>
                  
                  {/* Easy Mode Toggle Button */} 
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-1 border rounded-xl px-3 py-1.5 bg-background relative flex-shrink-0">
                        <Label htmlFor="easy-mode-switch" className="text-xs cursor-pointer whitespace-nowrap">Easy Mode</Label>
                        <Switch id="easy-mode-switch" checked={isEasyMode} onCheckedChange={toggleEasyMode} />
                        <HelpCircle className="h-3 w-3 text-muted-foreground ml-1" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent><p className="max-w-xs text-xs">Switch to Easy Mode for a simplified interface.</p></TooltipContent>
                  </Tooltip>
                  
                  {/* Connect Wallet Button - Moved from header */}
                  <ConnectWalletButton className="w-full md:w-auto flex-shrink-0" />

                </div>
              </div>
            </div>
          </div>
          
          {/* Network Status Display - Moved to separate row for better mobile layout */}
          {isConnected && (
            <div className="w-full">
              {isCurrentNetworkSupported ? (
                <div className="p-2 border rounded-md bg-background">
                  <p className="text-xs text-muted-foreground">{networkConfig.chainNameReadable} Status:</p>
                  {isLoadingBlockNumber && <p className="text-sm">Fetching block number...</p>}
                  {blockNumberError && <p className="text-sm text-red-500">Error fetching block number: {blockNumberError.shortMessage || blockNumberError.message}</p>}
                  {blockNumber && <p className="text-sm">Current Block: {blockNumber.toString()}</p>}
                </div>
              ) : (
                <div className="p-2 border rounded-md bg-amber-500/10">
                  <p className="text-sm text-amber-700">Network Debug Info:</p>
                  <p className="text-xs">Detected Chain ID: {currentChainId}</p>
                  <p className="text-xs">Detected Chain Name: {chain?.name}</p>
                  <p className="text-xs">Supported Networks: {supportedNetworks.map(n => `${n.name} (${n.id})`).join(', ')}</p>
                  <p className="text-xs mt-1">Please switch to a supported network to access Peridot features.</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Position Management Quick Actions - Show if user has positions */}
        <PositionManagementCard
          userPositions={userPositions}
          isDemoMode={isDemoMode}
          userHealthFactor={userHealthFactor}
          onNavigateToPortfolio={() => setActiveTab("portfolio")}
          onOpenSupplyModal={() => {
            const firstSupplyAsset = supplyData.find(asset => 
              userPositions.some(p => p.asset.symbol === asset.symbol && p.type === "supply")
            )
            if (firstSupplyAsset) {
              handleOpenDetailModal(firstSupplyAsset, true)
            }
          }}
          onOpenBorrowModal={() => {
            const firstBorrowAsset = borrowData.find(asset => 
              userPositions.some(p => p.asset.symbol === asset.symbol && p.type === "borrow")
            )
            if (firstBorrowAsset) {
              handleOpenDetailModal(firstBorrowAsset, false)
            }
          }}
        />

        {/* Lending Section with Tabs - ENHANCED WITH PROFESSIONAL ANIMATIONS */}
        <Tabs defaultValue="lending" value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="relative w-full md:w-auto mb-4">
            <TabsList className="relative grid grid-cols-3 w-full md:w-auto bg-white/5 dark:bg-black/5 backdrop-blur-xl rounded-xl p-1 border border-emerald-500/10 shadow-2xl shadow-emerald-500/5">
              {/* Dynamic active indicator */}
              <motion.div
                                  className="absolute top-1 bottom-1 bg-white/10 dark:bg-black/10 backdrop-blur-sm rounded-lg shadow-md border border-emerald-500/20 z-0"
                animate={{
                  x: activeTab === "lending" ? "0%" : 
                     activeTab === "portfolio" ? "100%" : "200%",
                  width: "calc(33.333% - 4px)",
                  opacity: 1
                }}
                transition={{
                  type: "spring",
                  stiffness: 300,
                  damping: 30
                }}
                style={{ left: "2px" }}
              />
              
              <TabsTrigger 
                value="lending" 
                className="relative overflow-hidden rounded-lg transition-all duration-300 ease-out hover:scale-[1.02] hover:shadow-lg hover:shadow-green-500/10 active:scale-[0.98] z-10 data-[state=active]:bg-transparent data-[state=active]:shadow-none group"
              >
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-green-500/10 via-emerald-500/10 to-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  initial={false}
                  animate={{ opacity: 0 }}
                  whileHover={{ opacity: activeTab === "lending" ? 0 : 1 }}
                />
                <motion.span 
                  className="relative z-10 font-medium"
                  whileHover={{ y: -1 }}
                  whileTap={{ y: 0 }}
                  transition={{ type: "spring", stiffness: 400, damping: 17 }}
                >
                  Lending
                </motion.span>
              </TabsTrigger>
              
              <TabsTrigger 
                value="portfolio"
                className="relative overflow-hidden rounded-lg transition-all duration-300 ease-out hover:scale-[1.02] hover:shadow-lg hover:shadow-purple-500/10 active:scale-[0.98] z-10 data-[state=active]:bg-transparent data-[state=active]:shadow-none group"
              >
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-purple-500/10 via-indigo-500/10 to-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  initial={false}
                  animate={{ opacity: 0 }}
                  whileHover={{ opacity: activeTab === "portfolio" ? 0 : 1 }}
                />
                <motion.span 
                  className="relative z-10 font-medium"
                  whileHover={{ y: -1 }}
                  whileTap={{ y: 0 }}
                  transition={{ type: "spring", stiffness: 400, damping: 17 }}
                >
                  Portfolio
                </motion.span>
              </TabsTrigger>
              
              <TabsTrigger 
                value="stake"
                className="relative overflow-hidden rounded-lg transition-all duration-300 ease-out hover:scale-[1.02] hover:shadow-lg hover:shadow-orange-500/10 active:scale-[0.98] z-10 data-[state=active]:bg-transparent data-[state=active]:shadow-none group"
              >
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-orange-500/10 via-red-500/10 to-pink-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  initial={false}
                  animate={{ opacity: 0 }}
                  whileHover={{ opacity: activeTab === "stake" ? 0 : 1 }}
                />
                <motion.span 
                  className="relative z-10 font-medium"
                  whileHover={{ y: -1 }}
                  whileTap={{ y: 0 }}
                  transition={{ type: "spring", stiffness: 400, damping: 17 }}
                >
                  Stake
                </motion.span>
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Lending Tab Content - OPTIMIZED FOR IMMEDIATE RENDERING */} 
          <TabsContent value="lending" className="space-y-6">


            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* Supply Markets Card */}
              <AnimatedCard>
                <Card className="overflow-hidden bg-white/5 dark:bg-black/5 backdrop-blur-xl border border-emerald-500/10 shadow-2xl shadow-emerald-500/5 hover:shadow-emerald-500/10 hover:border-emerald-500/20 transition-all duration-500">
                  <CardHeader className="pb-4 px-[0.1rem] md:px-6 py-[0.1rem] md:py-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-gradient-to-r from-green-500 to-emerald-500 shadow-lg">
                          <TrendingUp className="h-4 w-4 text-gray-900 dark:text-white" />
                        </div>
                        <div>
                          <CardTitle className="text-lg">Supply Markets</CardTitle>
                          <p className="text-xs text-muted-foreground">Earn yield on your assets</p>
                        </div>
                      </div>
                      
                      {/* Market Stats */}
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-xs text-muted-foreground">Best APY</div>
                          <div className="text-sm font-bold text-green-600">
                            {Math.max(...supplyData.map(asset => asset.apy || 0)).toFixed(2)}%
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg hover:bg-white/60 dark:hover:bg-white/10">
                                  <Search className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent><p>Search assets</p></TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg hover:bg-white/60 dark:hover:bg-white/10">
                                  <Filter className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent><p>Filter by APY</p></TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="pt-0 px-[0.1rem] md:px-6 pb-[0.1rem] md:pb-6">
                    <div className="space-y-2">
                      {/* Header Row */}
                      <div className="flex items-center justify-between text-xs font-medium text-muted-foreground px-3 py-2 bg-white/40 dark:bg-white/5 rounded-lg backdrop-blur-sm">
                        <div className="flex-1">Asset</div>
                        <div className="w-16 text-right">APY</div>
                        <div className="w-20 text-right">Balance</div>
                        <div className="w-20 text-center">Collateral</div>
                        <div className="w-16"></div>
                      </div>
                      
                      {/* Asset Rows */}
                      <div className="space-y-1">
                        {filteredSupplyData.map((asset, index) => (
                          <motion.div
                            key={asset.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.05 }}
                            className="group relative"
                          >
                            <div className="flex items-center justify-between p-3 rounded-xl bg-white/60 dark:bg-white/5 backdrop-blur-sm border border-white/20 hover:bg-white/80 dark:hover:bg-white/10 hover:shadow-lg hover:border-green-200 dark:hover:border-green-800 transition-all duration-300 cursor-pointer"
                                 onClick={() => handleOpenDetailModal(asset, true)}>
                              
                              {/* Asset Info */}
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <div className="relative">
                                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 flex items-center justify-center overflow-hidden">
                                    <Image
                                      src={asset.icon}
                                      alt={asset.name}
                                      width={32}
                                      height={32}
                                      className="rounded-full"
                                    />
                                  </div>
                                  {/* Live indicator */}
                                  <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white dark:border-gray-900 animate-pulse"></div>
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="font-semibold text-sm truncate">{asset.name}</div>
                                  <div className="text-xs text-muted-foreground">{asset.symbol}</div>
                                </div>
                              </div>
                              
                              {/* APY */}
                              <div className="w-16 text-right">
                                <div className="font-bold text-sm text-green-600">{asset.apy}%</div>
                                <div className="text-xs text-muted-foreground">APY</div>
                              </div>
                              
                              {/* Balance */}
                              <div className="w-20 text-right">
                                <div className="font-medium text-sm">{parseFloat(asset.wallet.split(" ")[0]).toFixed(2)}</div>
                                <div className="text-xs text-muted-foreground">{asset.symbol}</div>
                              </div>
                              
                              {/* Collateral Toggle */}
                              <div className="w-20 flex justify-center">
                                <motion.button
                                  className={cn(
                                    "w-10 h-5 rounded-full flex items-center transition-colors duration-200",
                                    asset.collateral ? "bg-green-500" : "bg-gray-300 dark:bg-gray-600",
                                    parseFloat(asset.wallet.split(" ")[0]) <= 0 && "opacity-50 cursor-not-allowed"
                                  )}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (parseFloat(asset.wallet.split(" ")[0]) > 0) {
                                      handleToggleCollateral(asset.id);
                                    }
                                  }}
                                  whileHover={parseFloat(asset.wallet.split(" ")[0]) > 0 ? { scale: 1.05 } : {}}
                                  whileTap={parseFloat(asset.wallet.split(" ")[0]) > 0 ? { scale: 0.95 } : {}}
                                >
                                  <motion.div
                                    className="w-4 h-4 bg-white rounded-full shadow-sm"
                                    animate={{
                                      x: asset.collateral ? 20 : 2
                                    }}
                                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                  />
                                </motion.button>
                              </div>
                              
                              {/* Quick Action */}
                              <div className="w-16 flex justify-end">
                                <motion.div
                                  initial={{ scale: 0, opacity: 0 }}
                                  animate={{ scale: 1, opacity: 1 }}
                                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <Button
                                    size="sm"
                                    className="h-7 px-2 bg-green-500 hover:bg-green-600 text-white text-xs rounded-lg"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleQuickSupplyClick(asset);
                                    }}
                                  >
                                    Supply
                                  </Button>
                                </motion.div>
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                      
                      {/* Summary Footer */}
                      <div className="mt-4 p-3 rounded-xl bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border border-green-200/50 dark:border-green-800/50">
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                            <span className="font-medium">Live Markets</span>
                          </div>
                          <div className="text-muted-foreground">
                            {filteredSupplyData.length} assets available
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </AnimatedCard>

              {/* Borrow Markets Card */}
              <AnimatedCard>
                <Card className="overflow-hidden bg-white/5 dark:bg-black/5 backdrop-blur-xl border border-blue-500/10 shadow-2xl shadow-blue-500/5 hover:shadow-blue-500/10 hover:border-blue-500/20 transition-all duration-500">
                  <CardHeader className="pb-4 px-[0.1rem] md:px-6 py-[0.1rem] md:py-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-gradient-to-r from-blue-500 to-purple-500 shadow-lg">
                          <TrendingDown className="h-4 w-4 text-gray-900 dark:text-white" />
                        </div>
                        <div>
                          <CardTitle className="text-lg">Borrow Markets</CardTitle>
                          <p className="text-xs text-muted-foreground">Access liquidity instantly</p>
                        </div>
                      </div>
                      
                      {/* Market Stats */}
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-xs text-muted-foreground">Best Rate</div>
                          <div className="text-sm font-bold text-blue-600">
                            {Math.min(...borrowData.map(asset => asset.apy || 0)).toFixed(2)}%
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg hover:bg-white/60 dark:hover:bg-white/10">
                                  <Search className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent><p>Search assets</p></TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg hover:bg-white/60 dark:hover:bg-white/10">
                                  <Filter className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent><p>Filter by rate</p></TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="pt-0 px-[0.1rem] md:px-6 pb-[0.1rem] md:pb-6">
                    <div className="space-y-2">
                      {/* Header Row */}
                      <div className="flex items-center justify-between text-xs font-medium text-muted-foreground px-3 py-2 bg-white/40 dark:bg-white/5 rounded-lg backdrop-blur-sm">
                        <div className="flex-1">Asset</div>
                        <div className="w-16 text-right">APY</div>
                        <div className="w-24 text-right">Liquidity</div>
                        <div className="w-20 text-center">Available</div>
                        <div className="w-16"></div>
                      </div>
                      
                      {/* Asset Rows */}
                      <div className="space-y-1">
                        {filteredBorrowData.map((asset, index) => (
                          <motion.div
                            key={asset.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.05 }}
                            className="group relative"
                          >
                            <div className="flex items-center justify-between p-3 rounded-xl bg-white/60 dark:bg-white/5 backdrop-blur-sm border border-white/20 hover:bg-white/80 dark:hover:bg-white/10 hover:shadow-lg hover:border-blue-200 dark:hover:border-blue-800 transition-all duration-300 cursor-pointer"
                                 onClick={() => handleOpenDetailModal(asset, false)}>
                              
                              {/* Asset Info */}
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <div className="relative">
                                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 flex items-center justify-center overflow-hidden">
                                    <Image
                                      src={asset.icon}
                                      alt={asset.name}
                                      width={32}
                                      height={32}
                                      className="rounded-full"
                                    />
                                  </div>
                                  {/* Live indicator */}
                                  <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-blue-500 rounded-full border-2 border-white dark:border-gray-900 animate-pulse"></div>
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="font-semibold text-sm truncate">{asset.name}</div>
                                  <div className="text-xs text-muted-foreground">{asset.symbol}</div>
                                </div>
                              </div>
                              
                              {/* APY */}
                              <div className="w-16 text-right">
                                <div className="font-bold text-sm text-blue-600">{asset.apy}%</div>
                                <div className="text-xs text-muted-foreground">APY</div>
                              </div>
                              
                              {/* Liquidity */}
                              <div className="w-24 text-right">
                                <div className="font-medium text-sm">{asset.liquidity}</div>
                                <div className="text-xs text-muted-foreground">Available</div>
                              </div>
                              
                              {/* Utilization Bar */}
                              <div className="w-20 flex justify-center">
                                <div className="w-12">
                                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 mb-1">
                                    <div 
                                      className="bg-gradient-to-r from-blue-500 to-purple-500 h-1.5 rounded-full transition-all duration-300" 
                                      style={{ width: `${Math.min((Math.random() * 80 + 10), 95)}%` }}
                                    ></div>
                                  </div>
                                  <div className="text-xs text-muted-foreground text-center">
                                    {Math.floor(Math.random() * 80 + 10)}%
                                  </div>
                                </div>
                              </div>
                              
                              {/* Quick Action */}
                              <div className="w-16 flex justify-end">
                                <motion.div
                                  initial={{ scale: 0, opacity: 0 }}
                                  animate={{ scale: 1, opacity: 1 }}
                                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <Button
                                    size="sm"
                                    className="h-7 px-2 bg-blue-500 hover:bg-blue-600 text-white text-xs rounded-lg"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenDetailModal(asset, false);
                                    }}
                                  >
                                    Borrow
                                  </Button>
                                </motion.div>
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                      
                      {/* Summary Footer */}
                      <div className="mt-4 p-3 rounded-xl bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 border border-blue-200/50 dark:border-blue-800/50">
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                            <span className="font-medium">Live Rates</span>
                          </div>
                          <div className="text-muted-foreground">
                            Total liquidity: $42.5M
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </AnimatedCard>
            </div>
          </TabsContent>



          {/* Placeholder Content for other tabs */}
         <TabsContent value="portfolio">
           <div className="space-y-6">
             {/* Portfolio Overview */}
             <AnimatedCard>
               <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                 <Card>
                   <CardHeader className="pb-2">
                     <CardTitle className="text-sm font-medium text-muted-foreground">Total Portfolio Value</CardTitle>
                   </CardHeader>
                   <CardContent>
                     <div className="text-3xl font-bold">
                       <AnimatedCounter value={portfolioSummary.totalValue} prefix="$" duration={1} />
                     </div>
                     <p className={cn(
                       "text-xs mt-1",
                       portfolioSummary.change24hValue >= 0 ? "text-green-500" : "text-red-500"
                     )}>
                       {portfolioSummary.change24hValue >= 0 ? "+" : ""}
                       <AnimatedCounter value={Math.abs(parseFloat(portfolioSummary.change24hValue.toFixed(2)))} prefix="$" duration={1} /> 
                       ({portfolioSummary.change24hPercentage.toFixed(2)}%) 24h
                     </p>
                   </CardContent>
                 </Card>
                 <Card className="md:col-span-2">
                   <CardHeader className="pb-2">
                     <CardTitle className="text-sm font-medium text-muted-foreground">Asset Allocation</CardTitle>
                   </CardHeader>
                   <CardContent className="flex flex-col sm:flex-row items-center justify-around pt-4">
                     {/* Simplified Donut Chart usage: Show for the largest asset or overall health metric */}
                     {/* For a true multi-segment chart, the DonutChart component would need an update */}
                     {/* For now, let's show the allocation of the top asset */}
                     {portfolioAssets.length > 0 && 
                         <DonutChart 
                             value={portfolioAssets[0].allocation} // Show allocation of the first (largest) asset
                             size={120} 
                             strokeWidth={12}
                             color={getColorForAsset(portfolioAssets[0].symbol)}
                         />
                     }
                     <div className="space-y-1 mt-3 sm:mt-0 sm:ml-4">
                       {portfolioAssets.slice(0, 4).map(asset => (
                         <div key={asset.id} className="flex items-center text-sm">
                           <span className="w-3 h-3 rounded-full mr-2 flex-shrink-0" style={{ backgroundColor: getColorForAsset(asset.symbol) }}></span>
                           <span className="font-medium mr-1">{asset.symbol}:</span> 
                           <span className="text-muted-foreground">{asset.allocation.toFixed(1)}%</span>
                         </div>
                       ))}
                       {portfolioAssets.length > 4 && (
                         <div className="text-xs text-muted-foreground pt-1">
                           + {portfolioAssets.length - 4} more
                         </div>
                       )}
                     </div>
                   </CardContent>
                 </Card>
               </div>
             </AnimatedCard>

             {/* User Positions */}
             <AnimatedCard>
               <UserPositionsCard
                 positions={userPositions}
                 isDemoMode={isDemoMode}
                 isLoading={isLoadingPositions}
                 onManagePosition={handleManagePosition}
                 onToggleCollateral={togglePositionCollateral}
               />
             </AnimatedCard>

             {/* Risk Management */}
             {(userTotalBorrowed > 0 || userPositions.some(p => p.type === "borrow")) && (
               <AnimatedCard>
                 <RiskManagementCard
                   riskData={riskData}
                   isDemoMode={isDemoMode}
                   onAddCollateral={handleAddCollateral}
                   onRepayDebt={handleRepayDebt}
                 />
               </AnimatedCard>
             )}

             {/* Market Insights */}
             <AnimatedCard>
               <MarketInsightsCard
                 markets={demoMarketData}
                 isDemoMode={isDemoMode}
                 selectedMarket={selectedMarketForInsights}
                 onMarketSelect={setSelectedMarketForInsights}
               />
             </AnimatedCard>

             {/* Legacy Portfolio Assets Table */}
             <AnimatedCard>
               <Card>
                 <CardHeader>
                   <CardTitle>Asset Holdings</CardTitle>
                 </CardHeader>
                 <CardContent className="p-0">
                   <div className="overflow-x-auto">
                     <Table>
                       <TableHeader>
                         <TableRow>
                           <TableHead className="w-[30%]">Asset</TableHead>
                           <TableHead className="text-right">Price</TableHead>
                           <TableHead className="text-right">Amount</TableHead>
                           <TableHead className="text-right">Value</TableHead>
                           <TableHead className="text-right w-[15%]">Allocation</TableHead>
                           <TableHead className="text-right w-[10%]">24h</TableHead>
                           <TableHead className="w-[5%]"></TableHead>
                         </TableRow>
                       </TableHeader>
                       <TableBody>
                         {portfolioAssets.map((asset) => (
                           <TableRow key={asset.id} className="group">
                             <TableCell>
                               <div className="flex items-center space-x-3">
                                 <Image src={asset.icon} alt={asset.name} width={28} height={28} className="rounded-full" />
                                 <div>
                                   <div className="font-medium">{asset.name}</div>
                                   <div className="text-xs text-muted-foreground">{asset.symbol}</div>
                                 </div>
                               </div>
                             </TableCell>
                             <TableCell className="text-right">${asset.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                             <TableCell className="text-right">{asset.amount.toLocaleString()}</TableCell>
                             <TableCell className="text-right font-medium">${asset.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                             <TableCell className="text-right">
                               <div className="flex items-center justify-end space-x-2">
                                 <span>{asset.allocation.toFixed(1)}%</span>
                                 <Progress value={asset.allocation} className="h-1.5 w-16 bg-primary/20 [&>div]:bg-primary" />
                               </div>
                             </TableCell>
                             <TableCell className={cn(
                               "text-right",
                               asset.change24h && asset.change24h >= 0 ? "text-green-500" : "text-red-500"
                             )}>
                               {asset.change24h ? `${asset.change24h >= 0 ? "+" : ""}${asset.change24h.toFixed(2)}%` : "N/A"}
                             </TableCell>
                             <TableCell className="opacity-0 group-hover:opacity-100 transition-opacity">
                               <Button variant="ghost" size="sm" className="rounded-full h-8 w-8 p-0">
                                 <TrendingUp className="h-4 w-4" /> {/* Or some other action icon */}
                               </Button>
                             </TableCell>
                           </TableRow>
                         ))}
                       </TableBody>
                     </Table>
                   </div>
                 </CardContent>
               </Card>
             </AnimatedCard>
           </div>
         </TabsContent>

         {/* Debug Tab Content */}
         <TabsContent value="debug">
           <div className="space-y-6">
             {/* Contract Information */}
             <AnimatedCard>
               <Card>
                 <CardHeader>
                   <CardTitle className="flex items-center gap-2">
                     <BarChart4 className="h-5 w-5" />
                     Contract Information
                   </CardTitle>
                 </CardHeader>
                 <CardContent className="space-y-4">
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div className="space-y-2">
                       <h4 className="text-sm font-medium text-muted-foreground">Peridottroller Proxy Address</h4>
                       <div className="font-mono text-sm bg-muted p-2 rounded">
                         {peridottrollerAddress || 'Not available'}
                       </div>
                     </div>
                     
                     <div className="space-y-2">
                       <h4 className="text-sm font-medium text-muted-foreground">Implementation Address</h4>
                       <div className="font-mono text-sm bg-muted p-2 rounded">
                         {isLoadingImplementation && "Loading..."}
                         {implementationError && <span className="text-red-500">Error: {implementationError.shortMessage}</span>}
                         {implementationAddress && String(implementationAddress)}
                         {!isLoadingImplementation && !implementationError && !implementationAddress && "Not available"}
                       </div>
                     </div>

                     <div className="space-y-2">
                       <h4 className="text-sm font-medium text-muted-foreground">Oracle Address</h4>
                       <div className="font-mono text-sm bg-muted p-2 rounded">
                         {isLoadingOracle && "Loading..."}
                         {oracleError && <span className="text-red-500">Error: {oracleError.shortMessage}</span>}
                         {oracleAddress && String(oracleAddress)}
                         {!isLoadingOracle && !oracleError && !oracleAddress && "Not available"}
                       </div>
                     </div>

                     <div className="space-y-2">
                       <h4 className="text-sm font-medium text-muted-foreground">Current Block Number</h4>
                       <div className="font-mono text-sm bg-muted p-2 rounded">
                         {isLoadingBlockNumber && "Loading..."}
                         {blockNumberError && <span className="text-red-500">Error: {blockNumberError.shortMessage}</span>}
                         {blockNumber && blockNumber.toString()}
                         {!isLoadingBlockNumber && !blockNumberError && !blockNumber && "Not available"}
                       </div>
                     </div>
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium text-muted-foreground">Current Block Number</h4>
                        <div className="font-mono text-sm bg-muted p-2 rounded">
                          {isLoadingBlockNumber && "Loading..."}
                          {blockNumberError && <span className="text-red-500">Error: {blockNumberError.shortMessage}</span>}
                          {blockNumber && blockNumber.toString()}
                          {!isLoadingBlockNumber && !blockNumberError && !blockNumber && "Not available"}
                        </div>
                      </div>
                    </div>

                    {/* All Markets */}
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-muted-foreground">All Markets</h4>
                      <div className="font-mono text-sm bg-muted p-2 rounded max-h-32 overflow-y-auto">
                        {isLoadingAllMarkets && "Loading..."}
                        {allMarketsError && <span className="text-red-500">Error: {allMarketsError.shortMessage}</span>}
                        {allMarkets && Array.isArray(allMarkets) && allMarkets.length > 0 && (
                          <div className="space-y-1">
                            {allMarkets.map((market, index) => (
                              <div key={index}>{String(market)}</div>
                            ))}
                          </div>
                        )}
                        {!isLoadingAllMarkets && !allMarketsError && (!allMarkets || !Array.isArray(allMarkets) || (Array.isArray(allMarkets) && allMarkets.length === 0)) && "No markets found"}
                      </div>
                    </div>

                    {/* PERC Market Information */}
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-muted-foreground">PERC Market Info (0x1DCb...b14F)</h4>
                      <div className="font-mono text-sm bg-muted p-2 rounded">
                        {isLoadingMarketInfo && "Loading..."}
                        {marketInfoError && <span className="text-red-500">Error: {marketInfoError.shortMessage}</span>}
                        {marketInfo && Array.isArray(marketInfo) && (
                          <div className="space-y-1">
                            <div>Listed: {marketInfo[0] ? "Yes" : "No"}</div>
                            <div>Collateral Factor: {marketInfo[1] ? (Number(marketInfo[1]) / 1e18 * 100).toFixed(2) + "%" : "0%"}</div>
                            <div>Is Peridoted: {marketInfo[2] ? "Yes" : "No"}</div>
                            <div className="text-amber-500 text-xs mt-2">⚠️ This is a PErc20Delegator (ERC20 token), not PEther (ETH)</div>
                          </div>
                        )}
                        {!isLoadingMarketInfo && !marketInfoError && !marketInfo && "Not available"}
                      </div>
                    </div>

                    {/* User Market Membership */}
                    {address && (
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium text-muted-foreground">Your Market Membership</h4>
                        <div className="font-mono text-sm bg-muted p-2 rounded">
                          {isLoadingCheckMembership && "Loading..."}
                          {checkMembershipError && <span className="text-red-500">Error: {checkMembershipError.shortMessage}</span>}
                          {typeof checkMembership === 'boolean' && (
                            <div className={checkMembership ? "text-green-500" : "text-red-500"}>
                              PERC Market: {checkMembership ? "Entered" : "Not Entered"}
                            </div>
                          )}
                          {!isLoadingCheckMembership && !checkMembershipError && typeof checkMembership !== 'boolean' && "Not available"}
                        </div>
                      </div>
                    )}

                    {/* User's Assets In Protocol */}
                    {address && (
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium text-muted-foreground">Your Assets in Protocol</h4>
                        <div className="font-mono text-sm bg-muted p-2 rounded max-h-32 overflow-y-auto">
                          {isLoadingAssetsIn && "Loading..."}
                          {assetsInError && <span className="text-red-500">Error: {assetsInError.shortMessage}</span>}
                          {assetsIn && Array.isArray(assetsIn) && assetsIn.length > 0 && (
                            <div className="space-y-1">
                              {assetsIn.map((asset, index) => (
                                <div key={index}>{String(asset)}</div>
                              ))}
                            </div>
                          )}
                          {assetsIn && Array.isArray(assetsIn) && assetsIn.length === 0 && "No assets entered"}
                          {!isLoadingAssetsIn && !assetsInError && !assetsIn && "Not available"}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </AnimatedCard>

              {/* Contract Functions */}
              <AnimatedCard>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Search className="h-5 w-5" />
                      Available Contract Functions ({getContractFunctions().length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {/* Function Categories */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                        <div className="text-center p-3 bg-green-500/10 rounded-lg">
                          <div className="text-2xl font-bold text-green-500">
                            {getContractFunctions().filter(f => f.stateMutability === 'view').length}
                          </div>
                          <div className="text-sm text-muted-foreground">View Functions</div>
                        </div>
                        <div className="text-center p-3 bg-blue-500/10 rounded-lg">
                          <div className="text-2xl font-bold text-blue-500">
                            {getContractFunctions().filter(f => f.stateMutability === 'nonpayable').length}
                          </div>
                          <div className="text-sm text-muted-foreground">Write Functions</div>
                        </div>
                        <div className="text-center p-3 bg-purple-500/10 rounded-lg">
                          <div className="text-2xl font-bold text-purple-500">
                            {getContractFunctions().filter(f => f.stateMutability === 'payable').length}
                          </div>
                          <div className="text-sm text-muted-foreground">Payable Functions</div>
                        </div>
                      </div>

                      {/* Functions List */}
                      <div className="max-h-96 overflow-y-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[30%]">Function Name</TableHead>
                              <TableHead className="w-[20%]">Type</TableHead>
                              <TableHead className="w-[25%]">Inputs</TableHead>
                              <TableHead className="w-[25%]">Outputs</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {getContractFunctions().map((func, index) => (
                              <TableRow key={index} className="group">
                                <TableCell className="font-mono text-sm">
                                  <div className="flex items-center gap-2">
                                    {func.stateMutability === 'view' && <Eye className="h-3 w-3 text-green-500" />}
                                    {func.stateMutability === 'nonpayable' && <Zap className="h-3 w-3 text-blue-500" />}
                                    {func.stateMutability === 'payable' && <CreditCard className="h-3 w-3 text-purple-500" />}
                                    {func.name}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Badge 
                                    variant={func.stateMutability === 'view' ? 'secondary' : 'default'}
                                    className={cn(
                                      "text-xs",
                                      func.stateMutability === 'view' && "bg-green-500/10 text-green-500",
                                      func.stateMutability === 'nonpayable' && "bg-blue-500/10 text-blue-500",
                                      func.stateMutability === 'payable' && "bg-purple-500/10 text-purple-500"
                                    )}
                                  >
                                    {func.stateMutability}
                                  </Badge>
                                </TableCell>
                                <TableCell className="font-mono text-xs">
                                  {func.inputs.length === 0 ? (
                                    <span className="text-muted-foreground">none</span>
                                  ) : (
                                    <div className="space-y-1">
                                      {func.inputs.slice(0, 2).map((input, i) => (
                                        <div key={i} className="truncate">
                                          {input.name || `param${i}`}: {input.type}
                                        </div>
                                      ))}
                                      {func.inputs.length > 2 && (
                                        <div className="text-muted-foreground">+{func.inputs.length - 2} more</div>
                                      )}
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell className="font-mono text-xs">
                                  {func.outputs.length === 0 ? (
                                    <span className="text-muted-foreground">none</span>
                                  ) : (
                                    <div className="space-y-1">
                                      {func.outputs.slice(0, 2).map((output, i) => (
                                        <div key={i} className="truncate">
                                          {output.name || `return${i}`}: {output.type}
                                        </div>
                                      ))}
                                      {func.outputs.length > 2 && (
                                        <div className="text-muted-foreground">+{func.outputs.length - 2} more</div>
                                      )}
                                    </div>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </AnimatedCard>

              {/* Connection Status */}
              <AnimatedCard>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Globe className="h-5 w-5" />
                      Connection Status
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium text-muted-foreground">Wallet Status</h4>
                        <div className={cn(
                          "px-3 py-2 rounded-lg text-sm font-medium",
                          isConnected ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
                        )}>
                          {isConnecting ? "Connecting..." : isConnected ? "Connected" : "Not Connected"}
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium text-muted-foreground">Network</h4>
                        <div className={cn(
                          "px-3 py-2 rounded-lg text-sm font-medium",
                          isCurrentNetworkSupported ? "bg-green-500/10 text-green-500" : "bg-amber-500/10 text-amber-500"
                        )}>
                          {chain ? `${chain.name} (${chain.id})` : "No Network"}
                        </div>
                      </div>

                      {address && (
                        <div className="space-y-2 md:col-span-2">
                          <h4 className="text-sm font-medium text-muted-foreground">Connected Address</h4>
                          <div className="font-mono text-sm bg-muted p-2 rounded break-all">
                            {address}
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </AnimatedCard>

              {/* Troubleshooting Guide */}

            </div>
          </TabsContent>

          {/* Stake Tab Content - Placeholder */}
          <TabsContent value="stake">
            <AnimatedCard>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <PiggyBank className="h-5 w-5 text-green-500" />
                    Staking (Coming Soon)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Staking functionality will be available soon.
                  </p>
                </CardContent>
              </Card>
            </AnimatedCard>
          </TabsContent>
        </Tabs>

        {/* Asset Detail Modal */} 
        <AnimatePresence>
          {selectedAsset && ( // Removed isDemoMode condition here to allow modal in live mode
            <AssetDetailCard
              asset={selectedAsset}
              onClose={handleCloseAssetDetail}
              isSupply={isDetailSupply}
              onTransaction={handleTransaction}
              isDemoMode={isDemoMode}
              focusAmountInput={focusAmountInputInModal}
              onAmountInputFocused={() => setFocusAmountInputInModal(false)}
            />
          )}
        </AnimatePresence>

        {/* Modal to confirm switching from Demo Mode */}
        <AnimatePresence>
         {showLiveModeComingSoon && (
           <motion.div
             className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm"
             initial={{ opacity: 0 }}
             animate={{ opacity: 1 }}
             exit={{ opacity: 0 }}
             onClick={handleCancelSwitchToLiveMode}
           >
             <motion.div
               className="bg-card border border-border/50 rounded-xl shadow-xl p-6 w-full max-w-sm"
               initial={{ scale: 0.9, opacity: 0 }}
               animate={{ scale: 1, opacity: 1 }}
               exit={{ scale: 0.9, opacity: 0 }}
               transition={{ type: "spring", damping: 20, stiffness: 250 }}
               onClick={(e) => e.stopPropagation()}
             >
               <div className="flex items-center justify-between mb-4">
                 <h3 className="text-lg font-semibold">Switch to Live Mode?</h3>
                 <Button variant="ghost" size="icon" className="rounded-full h-7 w-7 -mr-2" onClick={handleCancelSwitchToLiveMode}>
                   <X className="h-4 w-4" />
                 </Button>
               </div>
               <p className="text-sm text-muted-foreground mb-5">
                 Live Mode with real on-chain data and transactions is currently under development.
                 Are you sure you want to switch? You won't be able to interact with the platform.
               </p>
               <div className="flex gap-3">
                 <Button variant="outline" onClick={handleCancelSwitchToLiveMode} className="flex-1">
                   Stay in Demo
                 </Button>
                 <Button onClick={handleConfirmSwitchToLiveMode} className="flex-1 bg-primary hover:bg-primary/90">
                   Switch to Live
                 </Button>
               </div>
             </motion.div>
           </motion.div>
         )}
       </AnimatePresence>

        {/* Network Status Section */}
        {isConnected && (
          <div className="mt-2 p-3 border rounded-md bg-background">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground">Network Status</p>
              <NetworkSwitcher variant="compact" />
            </div>
            
            {isCurrentNetworkSupported && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">{networkConfig.chainNameReadable} Status:</p>
                {isLoadingBlockNumber && <p className="text-sm">Fetching block number...</p>}
                {blockNumberError && <p className="text-sm text-red-500">Error fetching block number: {blockNumberError.shortMessage || blockNumberError.message}</p>}
                {blockNumber && <p className="text-sm">Current Block: {blockNumber.toString()}</p>}
              </div>
            )}
            
            {!isCurrentNetworkSupported && (
              <div className="text-sm text-amber-700">
                <p>Unsupported network detected.</p>
                <p className="text-xs mt-1">Please switch to: {supportedNetworks.map(n => n.name).join(', ')}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}

// Extract all function names from the ABI for troubleshooting
const getContractFunctions = () => {
  return PeridottrollerABI
    .filter(item => item.type === 'function')
    .map(func => ({
      name: func.name,
      inputs: func.inputs || [],
      outputs: func.outputs || [],
      stateMutability: func.stateMutability
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
};

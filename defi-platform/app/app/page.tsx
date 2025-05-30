"use client"

import { TooltipTrigger } from "@/components/ui/tooltip"

import { useState, useEffect, useRef, useMemo } from "react"
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
  // useAccount returns chain info including id
  const { address, isConnected, isConnecting, chain } = useAccount() 
  const { switchChain, isPending: isSwitchingNetwork } = useSwitchChain()

  // Network configuration
  const currentChainId = chain?.id;
  const isCurrentNetworkSupported = currentChainId ? isSupportedNetwork(currentChainId) : false;
  
  // Add debugging to see what's happening with network detection
  console.log('Network Debug:', {
    chainId: currentChainId,
    chainName: chain?.name,
    isConnected,
    isCurrentNetworkSupported,
    supportedNetworkIds: supportedNetworks.map(n => n.id)
  });
  
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
  const [activeTab, setActiveTab] = useState("markets")
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

  // User positions hook
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
  } = useUserPositions({ isDemoMode, refreshTrigger: Date.now() });

  // Market insights state
  const [selectedMarketForInsights, setSelectedMarketForInsights] = useState("usdc");

  // Demo market data for insights
  const demoMarketData = useMemo(() => [
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
      userSupplied: isDemoMode ? 5000 : undefined, // Matches position data
      userBorrowed: isDemoMode ? 3500 : undefined, // Matches position data
      priceHistory: Array.from({ length: 30 }, (_, i) => ({
        timestamp: Date.now() - (29 - i) * 24 * 60 * 60 * 1000,
        price: 1.0 + (Math.random() - 0.5) * 0.01
      })),
      apyHistory: Array.from({ length: 30 }, (_, i) => ({
        timestamp: Date.now() - (29 - i) * 24 * 60 * 60 * 1000,
        supplyAPY: 4.25 + (Math.random() - 0.5) * 0.5,
        borrowAPY: 6.8 + (Math.random() - 0.5) * 0.8
      }))
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
      userSupplied: isDemoMode ? 10564 : undefined, // Matches position data (3 ETH * $3521.48)
      userBorrowed: undefined,
      priceHistory: Array.from({ length: 30 }, (_, i) => ({
        timestamp: Date.now() - (29 - i) * 24 * 60 * 60 * 1000,
        price: 3500 + (Math.random() - 0.5) * 200
      })),
      apyHistory: Array.from({ length: 30 }, (_, i) => ({
        timestamp: Date.now() - (29 - i) * 24 * 60 * 60 * 1000,
        supplyAPY: 3.85 + (Math.random() - 0.5) * 0.4,
        borrowAPY: 5.2 + (Math.random() - 0.5) * 0.6
      }))
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
      userSupplied: isDemoMode ? 22414 : undefined, // Matches position data (150.5 SOL * $148.93)
      userBorrowed: undefined,
      priceHistory: Array.from({ length: 30 }, (_, i) => ({
        timestamp: Date.now() - (29 - i) * 24 * 60 * 60 * 1000,
        price: 149 + (Math.random() - 0.5) * 20
      })),
      apyHistory: Array.from({ length: 30 }, (_, i) => ({
        timestamp: Date.now() - (29 - i) * 24 * 60 * 60 * 1000,
        supplyAPY: 5.2 + (Math.random() - 0.5) * 0.6,
        borrowAPY: 7.5 + (Math.random() - 0.5) * 0.9
      }))
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
      userBorrowed: isDemoMode ? 1200 : undefined, // Matches position data
      priceHistory: Array.from({ length: 30 }, (_, i) => ({
        timestamp: Date.now() - (29 - i) * 24 * 60 * 60 * 1000,
        price: 1.0 + (Math.random() - 0.5) * 0.008
      })),
      apyHistory: Array.from({ length: 30 }, (_, i) => ({
        timestamp: Date.now() - (29 - i) * 24 * 60 * 60 * 1000,
        supplyAPY: 3.1 + (Math.random() - 0.5) * 0.3,
        borrowAPY: 7.2 + (Math.random() - 0.5) * 0.8
      }))
    }
  ], [isDemoMode]);

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

  // Position management handlers
  const handleManagePosition = (position: UserPosition) => {
    console.log("Managing position:", position);
    // This would typically open a modal or navigate to a management page
    // For now, we'll just open the asset detail modal
    const asset = supplyData.find(a => a.symbol === position.asset.symbol) || 
                  borrowData.find(a => a.symbol === position.asset.symbol);
    if (asset) {
      setSelectedAsset(asset);
      setIsDetailSupply(position.type === "supply");
    }
  };

  const handleAddCollateral = () => {
    console.log("Add collateral clicked");
    // Navigate to supply page or open supply modal
    setActiveTab("markets");
  };

  const handleRepayDebt = () => {
    console.log("Repay debt clicked");
    // Navigate to repay page or open repay modal
    setActiveTab("markets");
  };

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
      console.log("Raw accountLiquidityData:", {
        errorCode: accountLiquidityData[0].toString(),
        liquidity: accountLiquidityData[1].toString(),
        shortfall: accountLiquidityData[2].toString(),
      });
    }
    if (accountLiquidityError) {
      console.error("accountLiquidityError:", accountLiquidityError);
    }
  }, [accountLiquidityData, accountLiquidityError]);

  useEffect(() => {
    // Update Easy Mode based on URL
    setIsEasyMode(pathname.includes("/easy"))
  }, [pathname])

  useEffect(() => {
    // Simulate loading data on mount
    setIsLoading(true)
    setTimeout(() => {
      setSupplyChartData(generateChartData(30, 0.05, true))
      setBorrowChartData(generateChartData(30, 0.08, true))
      setIsLoading(false)
    }, 1500)
  }, [])

  const handleRefresh = () => {
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
  }

  const handleOpenDetailModal = (assetForModal: Asset, isSupplyView: boolean) => {
    setSelectedAsset(assetForModal);
    setIsDetailSupply(isSupplyView);
    setFocusAmountInputInModal(false);
  }

  const handleQuickSupplyClick = (clickedAsset: Asset) => {
    setSelectedAsset(clickedAsset)
    setIsDetailSupply(true)
    setFocusAmountInputInModal(true)
  }

  const handleCloseAssetDetail = () => {
    setSelectedAsset(null)
    setFocusAmountInputInModal(false)
  }

  const toggleEasyMode = () => {
    setIsEasyMode(!isEasyMode)
  }

  const toggleDemoMode = () => {
    if (isDemoMode) {
      setShowLiveModeComingSoon(true)
    } else {
      setIsDemoMode(true)
      setShowLiveModeComingSoon(false)
    }
  }

  const handleConfirmSwitchToLiveMode = () => {
    setIsDemoMode(false)
    setShowLiveModeComingSoon(false)
  }

  const handleCancelSwitchToLiveMode = () => {
    setShowLiveModeComingSoon(false)
  }

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
                  {isSolanaConnected ? (
                    // Solana Network Display
                    <div className="flex items-center gap-2 border rounded-xl px-3 py-2 bg-gradient-to-r from-purple-500/10 to-violet-500/10 border-purple-500/20 flex-shrink-0">
                      <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></div>
                      <span className="text-sm font-medium bg-gradient-to-r from-purple-600 to-violet-600 bg-clip-text text-transparent whitespace-nowrap">
                        Solana Network
                      </span>
                      {isSwitchingNetwork && <Loader2 className="h-3 w-3 animate-spin text-purple-500" />}
                    </div>
                  ) : (
                    // EVM Network Switcher
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
                                          "w-2 h-2 rounded-full transition-colors",
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
                  )}
                  
                  {/* Demo Mode Toggle Button */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-1 border rounded-xl px-3 py-1.5 bg-background relative flex-shrink-0">
                        <Label htmlFor="demo-mode-switch" className="text-xs cursor-pointer whitespace-nowrap">Demo Mode</Label>
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
                  
                  {/* Refresh Button */}
                  <Button variant="outline" size="sm" onClick={handleRefresh} className="h-8 px-3 flex-shrink-0">
                    <RefreshCw className="h-3.5 w-3.5 mr-1" /> 
                    <span className="text-xs whitespace-nowrap">Refresh</span>
                  </Button>
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

        {/* Borrow Limit Progress Bar */ } 
        <Card className="bg-card border-border/50 overflow-hidden shadow-sm mb-4">
          <div className="p-3">
             <div className="flex items-center justify-between mb-1">
              <div className="flex items-center">
                <h3 className="text-sm font-medium">Borrow Limit</h3>
                 <Tooltip>
                   <TooltipTrigger asChild>
                     <span className="ml-1 cursor-pointer"><HelpCircle className="h-3 w-3 text-text/40" /></span>
                   </TooltipTrigger>
                   <TooltipContent side="right"><p className="text-xs max-w-[200px]">Limit based on collateral.</p></TooltipContent>
                 </Tooltip>
              </div>
              <span className="text-xs font-medium">{borrowLimitUsed.toFixed(0)}% Used</span>
            </div>
             <Progress value={borrowLimitUsed} className="h-1.5 w-full bg-green-900/30 [&>div]:bg-green-500" />
             <div className="flex justify-between text-xs text-text/40 mt-1">
              <span>0%</span>
              <span>80%</span>
              <span>100%</span>
            </div>
          </div>
        </Card>

        {/* Markets Section with Tabs */}
        <Tabs defaultValue="markets" value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid grid-cols-4 w-full md:w-auto mb-4">
            <TabsTrigger value="markets">Markets</TabsTrigger>
            <TabsTrigger value="cross-chain">Cross-Chain</TabsTrigger>
            <TabsTrigger value="portfolio">Portfolio</TabsTrigger>
            <TabsTrigger value="stake">Stake</TabsTrigger>
          </TabsList>

          {/* Markets Tab Content */} 
          <TabsContent value="markets" className="space-y-6">
            {/* User Guidance Banner */}
            {userPositions.length > 0 && (
              <AnimatedCard delay={0.1}>
                <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/20">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                          <Users className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                          <p className="font-medium text-blue-900 dark:text-blue-100">
                            You have {userPositions.length} active position{userPositions.length > 1 ? 's' : ''}
                          </p>
                          <p className="text-sm text-blue-700 dark:text-blue-300">
                            Go to Portfolio tab to manage withdrawals, repayments, and collateral settings
                          </p>
                        </div>
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setActiveTab("portfolio")}
                        className="border-blue-200 text-blue-700 hover:bg-blue-100"
                      >
                        Manage Positions
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </AnimatedCard>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* Supply Markets Card */}
              <AnimatedCard>
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle>Supply Markets</CardTitle>
                      <div className="flex gap-2">
                        {/* Add Filter/Search Icons if needed */}
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="outline" size="icon" className="h-8 w-8">
                                <Filter className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent><p>Filter</p></TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="outline" size="icon" className="h-8 w-8">
                                <Search className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent><p>Search</p></TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    {/* Add scroll wrapper for the table */}
                    <div className="overflow-x-auto">
                      <Table className="min-w-[600px]">
                        <TableHeader>
                          <TableRow>
                             {/* Add whitespace-nowrap to prevent wrapping */}
                            <TableHead className="w-[40%] whitespace-nowrap">Asset</TableHead>
                            <TableHead className="w-[20%] text-right whitespace-nowrap">APY</TableHead>
                            <TableHead className="w-[20%] text-right whitespace-nowrap">Wallet</TableHead>
                            <TableHead className="w-[20%] text-right whitespace-nowrap">Collateral</TableHead>
                            <TableHead className="w-[0%]"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredSupplyData.map((asset) => (
                            <AssetRow
                              key={asset.id}
                              asset={asset}
                              isSupply={true}
                              onOpenDetailModal={handleOpenDetailModal}
                              onToggleCollateral={handleToggleCollateral}
                              isDemoMode={isDemoMode}
                              onQuickSupplyClick={handleQuickSupplyClick}
                            />
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </AnimatedCard>

               {/* Borrow Markets Card */}
              <AnimatedCard delay={0.1}> 
                 <Card>
                   <CardHeader className="pb-2">
                     <div className="flex items-center justify-between">
                       <CardTitle>Borrow Markets</CardTitle>
                       <div className="flex gap-2">
                         {/* Add Filter/Search Icons if needed */}
                         <TooltipProvider>
                           <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="outline" size="icon" className="h-8 w-8">
                                <Filter className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent><p>Filter</p></TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="outline" size="icon" className="h-8 w-8">
                                <Search className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent><p>Search</p></TooltipContent>
                          </Tooltip>
                         </TooltipProvider>
                       </div>
                     </div>
                   </CardHeader>
                   <CardContent className="p-0">
                     {/* Add scroll wrapper for the table */}
                     <div className="overflow-x-auto">
                       <Table className="min-w-[600px]">
                         <TableHeader>
                           <TableRow>
                             {/* Add whitespace-nowrap to prevent wrapping */}
                             <TableHead className="w-[40%] whitespace-nowrap">Asset</TableHead>
                             <TableHead className="w-[20%] text-right whitespace-nowrap">APY</TableHead>
                             <TableHead className="w-[20%] text-right whitespace-nowrap">Liquidity</TableHead>
                             <TableHead className="w-[20%] whitespace-nowrap"></TableHead> 
                             <TableHead className="w-[0%]"></TableHead>
                           </TableRow>
                         </TableHeader>
                         <TableBody>
                           {filteredBorrowData.map((asset) => (
                             <AssetRow
                               key={asset.id}
                               asset={asset}
                               isSupply={false}
                               onOpenDetailModal={handleOpenDetailModal}
                               isDemoMode={isDemoMode}
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

          {/* Cross-Chain Tab Content */}
          <TabsContent value="cross-chain">
            <div className="space-y-6">


              {/* Cross-Chain Transaction Flow */}
              <AnimatedCard delay={0.1}>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <ArrowRight className="h-5 w-5 text-green-500" />
                      How Cross-Chain Lending Works
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div className="text-center">
                        <div className="w-16 h-16 mx-auto mb-3 bg-blue-500/10 rounded-full flex items-center justify-center">
                          <span className="text-2xl font-bold text-blue-500">1</span>
                        </div>
                        <h4 className="font-medium mb-2">Deposit on Spoke</h4>
                        <p className="text-sm text-muted-foreground">Supply assets on your preferred chain (Ethereum, Solana, etc.)</p>
                      </div>
                      
                      <div className="text-center">
                        <div className="w-16 h-16 mx-auto mb-3 bg-purple-500/10 rounded-full flex items-center justify-center">
                          <span className="text-2xl font-bold text-purple-500">2</span>
                        </div>
                        <h4 className="font-medium mb-2">Wormhole Message</h4>
                        <p className="text-sm text-muted-foreground">Assets and intent are bridged to the Hub chain via Wormhole</p>
                      </div>
                      
                      <div className="text-center">
                        <div className="w-16 h-16 mx-auto mb-3 bg-green-500/10 rounded-full flex items-center justify-center">
                          <span className="text-2xl font-bold text-green-500">3</span>
                        </div>
                        <h4 className="font-medium mb-2">Hub Processing</h4>
                        <p className="text-sm text-muted-foreground">Hub updates your vault and calculates global liquidity</p>
                      </div>
                      
                      <div className="text-center">
                        <div className="w-16 h-16 mx-auto mb-3 bg-orange-500/10 rounded-full flex items-center justify-center">
                          <span className="text-2xl font-bold text-orange-500">4</span>
                        </div>
                        <h4 className="font-medium mb-2">Borrow Anywhere</h4>
                        <p className="text-sm text-muted-foreground">Borrow assets on any connected Spoke chain</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </AnimatedCard>

              {/* Cross-Chain Asset Overview */}
              <AnimatedCard delay={0.2}>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BarChart4 className="h-5 w-5 text-green-500" />
                      Cross-Chain Asset Distribution
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {/* Asset by Chain */}
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="p-4 border rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-medium text-blue-500">Ethereum</h4>
                            <Badge variant="outline" className="text-xs">Spoke</Badge>
                          </div>
                          <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                              <span>USDC Supplied:</span>
                              <span className="font-medium">$5,420</span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span>ETH Supplied:</span>
                              <span className="font-medium">$3,210</span>
                            </div>
                            <div className="text-xs text-green-500 mt-2">Available for cross-chain borrowing</div>
                          </div>
                        </div>
                        
                        <div className="p-4 border rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-medium text-purple-500">Solana</h4>
                            <Badge variant="outline" className="text-xs">Spoke</Badge>
                          </div>
                          <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                              <span>SOL Supplied:</span>
                              <span className="font-medium">$2,890</span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span>USDT Borrowed:</span>
                              <span className="font-medium text-red-500">-$1,500</span>
                            </div>
                            <div className="text-xs text-blue-500 mt-2">Cross-chain collateral active</div>
                          </div>
                        </div>
                        
                        <div className="p-4 border rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-medium text-orange-500">Soneium</h4>
                            <Badge variant="outline" className="text-xs">Spoke</Badge>
                          </div>
                          <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                              <span>PERC Supplied:</span>
                              <span className="font-medium">$1,200</span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span>Available:</span>
                              <span className="font-medium">$980</span>
                            </div>
                            <div className="text-xs text-green-500 mt-2">Testing environment</div>
                          </div>
                        </div>
                        
                        <div className="p-4 border rounded-lg border-blue-500/50 bg-blue-500/5">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-medium text-blue-500">Sei (Hub)</h4>
                            <Badge className="text-xs bg-blue-500/10 text-blue-500">Hub</Badge>
                          </div>
                          <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                              <span>Total Collateral:</span>
                              <span className="font-medium">$11,720</span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span>Borrow Power:</span>
                              <span className="font-medium text-green-500">$8,790</span>
                            </div>
                            <div className="text-xs text-blue-500 mt-2">Global accounting & liquidations</div>
                          </div>
                        </div>
                      </div>
                      
                      {/* Quick Actions */}
                      <div className="border-t pt-4">
                        <h4 className="font-medium mb-3">Quick Cross-Chain Actions</h4>
                        <div className="flex gap-2 flex-wrap">
                          <Button size="sm" asChild>
                            <Link href="/app/bridge">
                              <ArrowUpRight className="h-4 w-4 mr-1" />
                              Bridge Assets
                            </Link>
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => setActiveTab("markets")}>
                            <Plus className="h-4 w-4 mr-1" />
                            Supply Assets
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => setActiveTab("markets")}>
                            <TrendingDown className="h-4 w-4 mr-1" />
                            Borrow Assets
                          </Button>
                          <Button variant="outline" size="sm">
                            <Eye className="h-4 w-4 mr-1" />
                            View Transactions
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </AnimatedCard>

              {/* Coming Soon Features */}
              <AnimatedCard delay={0.3}>
                <Card className="border-dashed">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-yellow-500" />
                      Coming Soon: Advanced Cross-Chain Features
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-3 bg-muted/50 rounded-lg">
                        <h4 className="font-medium mb-2">💱 Cross-Chain Yield Farming</h4>
                        <p className="text-sm text-muted-foreground">Optimize yields by automatically moving assets to the highest-yielding opportunities across all chains.</p>
                      </div>
                      <div className="p-3 bg-muted/50 rounded-lg">
                        <h4 className="font-medium mb-2">🔄 Auto-Rebalancing</h4>
                        <p className="text-sm text-muted-foreground">Automatically maintain optimal collateral ratios across your cross-chain positions.</p>
                      </div>
                      <div className="p-3 bg-muted/50 rounded-lg">
                        <h4 className="font-medium mb-2">⚡ Flash Cross-Chain Loans</h4>
                        <p className="text-sm text-muted-foreground">Execute complex arbitrage strategies across multiple chains in a single transaction.</p>
                      </div>
                      <div className="p-3 bg-muted/50 rounded-lg">
                        <h4 className="font-medium mb-2">🏛️ Cross-Chain Governance</h4>
                        <p className="text-sm text-muted-foreground">Vote on protocol proposals from any connected chain with your cross-chain voting power.</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </AnimatedCard>
            </div>

            {/* Market Insights for deeper analysis */}
            <div className="mt-6">
              <AnimatedCard delay={0.2}>
                <MarketInsightsCard
                  markets={demoMarketData}
                  isDemoMode={isDemoMode}
                  selectedMarket={selectedMarketForInsights}
                  onMarketSelect={setSelectedMarketForInsights}
                />
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
             <AnimatedCard delay={0.1}>
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
               <AnimatedCard delay={0.2}>
                 <RiskManagementCard
                   riskData={riskData}
                   isDemoMode={isDemoMode}
                   onAddCollateral={handleAddCollateral}
                   onRepayDebt={handleRepayDebt}
                 />
               </AnimatedCard>
             )}

             {/* Market Insights */}
             <AnimatedCard delay={0.3}>
               <MarketInsightsCard
                 markets={demoMarketData}
                 isDemoMode={isDemoMode}
                 selectedMarket={selectedMarketForInsights}
                 onMarketSelect={setSelectedMarketForInsights}
               />
             </AnimatedCard>

             {/* Legacy Portfolio Assets Table */}
             <AnimatedCard delay={0.4}>
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
              <AnimatedCard delay={0.1}>
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
              <AnimatedCard delay={0.2}>
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

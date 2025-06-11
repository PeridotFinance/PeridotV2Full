"use client"

import { TooltipTrigger } from "@/components/ui/tooltip"

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
import EasyMode from "@/components/app-modes/EasyMode"
import { usePathname } from "next/navigation"

// Define the types for our data
type Asset = {
  id: string
  name: string
  symbol: string
  icon: string
  apy: number
  wallet: string
  collateral?: boolean
  liquidity?: string
  change24h?: number
  price?: number
  marketCap?: string
  volume24h?: string
}

// Easy Mode types
type OnboardingStep = "welcome" | "profile" | "funding" | "invest" | "complete"
type PaymentMethod = "bank" | "card" | "paypal"
type EasyModeAction = "deposit" | "withdraw" | "earn" | "borrow"
type EasyModeTransaction = {
  id: string
  type: "deposit" | "withdrawal" | "interest" | "borrow" | "repayment"
  asset: string
  amount: number
  date: string
  status: "completed" | "pending" | "failed"
}

// Sample data for supply markets
const supplyMarkets: Asset[] = [
  {
    id: "sol",
    name: "Solana",
    symbol: "SOL",
    icon: "/tokenimages/app/solana-sol-logo.svg",
    apy: 3.42,
    wallet: "0 SOL",
    collateral: true,
    change24h: 4.78,
    price: 148.93,
    marketCap: "$67.2B",
    volume24h: "$3.8B",
  },
  {
    id: "peridot",
    name: "Peridot",
    symbol: "PDT",
    icon: "/logo.svg",
    apy: 8.64,
    wallet: "0 PDT",
    collateral: true,
    change24h: 7.21,
    price: 14.86,
    marketCap: "$742M",
    volume24h: "$56.3M",
  },
  {
    id: "stellar",
    name: "Stellar",
    symbol: "XLM",
    icon: "/tokenimages/app/stellar.svg",
    apy: 5.78,
    wallet: "0 SNM",
    collateral: true,
    change24h: 9.87,
    price: 2.47,
    marketCap: "$412M",
    volume24h: "$39M",
  },
  {
    id: "iota",
    name: "IOTA",
    symbol: "MIOTA",
    icon: "/tokenimages/app/iota-iota-logo.svg",
    apy: 4.36,
    wallet: "0 MIOTA",
    collateral: true,
    change24h: 3.65,
    price: 0.32,
    marketCap: "$895M",
    volume24h: "$64M",
  },
  {
    id: "usdc",
    name: "USD Coin",
    symbol: "USDC",
    icon: "/tokenimages/app/usd-coin-usdc-logo.svg",
    apy: 1.47,
    wallet: "0 USDC",
    collateral: true,
    change24h: 0.01,
    price: 1.0,
    marketCap: "$28.4B",
    volume24h: "$2.1B",
  },
  {
    id: "usdt",
    name: "Tether",
    symbol: "USDT",
    icon: "/tokenimages/app/tether-usdt-logo.svg",
    apy: 2.18,
    wallet: "0 USDT",
    collateral: false, // Example: USDT might not be collateral
    change24h: 0.02,
    price: 1.0,
    marketCap: "$83.2B",
    volume24h: "$42.5B",
  },
  {
    id: "eth",
    name: "Ether",
    symbol: "ETH",
    icon: "/tokenimages/app/ethereum-eth-logo.svg",
    apy: 0.02,
    wallet: "0 ETH",
    collateral: true,
    change24h: 2.34,
    price: 3521.48,
    marketCap: "$423B",
    volume24h: "$18.7B",
  },
]

// Sample data for borrow markets
const borrowMarkets: Asset[] = [
  {
    id: "sol",
    name: "Solana",
    symbol: "SOL",
    icon: "/tokenimages/app/solana-sol-logo.svg",
    apy: 3.42,
    wallet: "0 SOL",
    liquidity: "$3.8M",
    change24h: 4.78,
    price: 148.93,
    marketCap: "$67.2B",
    volume24h: "$3.8B",
  },
  {
    id: "peridot",
    name: "Peridot",
    symbol: "PDT",
    icon: "/logo.svg",
    apy: 8.64,
    wallet: "0 PDT",
    liquidity: "$562K",
    change24h: 7.21,
    price: 14.86,
    marketCap: "$742M",
    volume24h: "$56.3M",
  },
  {
    id: "Stellar",
    name: "stellar",
    symbol: "XLM",
    icon: "/tokenimages/app/stellar.svg",
    apy: 5.78,
    wallet: "0 SNM",
    liquidity: "$212K",
    change24h: 9.87,
    price: 2.47,
    marketCap: "$412M",
    volume24h: "$39M",
  },
  {
    id: "iota",
    name: "IOTA",
    symbol: "MIOTA",
    icon: "/tokenimages/app/iota-iota-logo.svg",
    apy: 4.36,
    wallet: "0 MIOTA",
    liquidity: "$124K",
    change24h: 3.65,
    price: 0.32,
    marketCap: "$895M",
    volume24h: "$64M",
  },
  {
    id: "usdt",
    name: "Tether",
    symbol: "USDT",
    icon: "/tokenimages/app/tether-usdt-logo.svg",
    apy: 2.18,
    wallet: "0 USDT",
    liquidity: "$1.2M",
    change24h: 0.02,
    price: 1.0,
    marketCap: "$83.2B",
    volume24h: "$42.5B",
  },
  {
    id: "usdc",
    name: "USD Coin",
    symbol: "USDC",
    icon: "/tokenimages/app/usd-coin-usdc-logo.svg",
    apy: 1.47,
    wallet: "0 USDC",
    liquidity: "$2.5M",
    change24h: 0.01,
    price: 1.0,
    marketCap: "$28.4B",
    volume24h: "$2.1B",
  },
  {
    id: "eth",
    name: "Ether",
    symbol: "ETH",
    icon: "/tokenimages/app/ethereum-eth-logo.svg",
    apy: 0.02,
    wallet: "0 ETH",
    liquidity: "$15.5B",
    change24h: 2.34,
    price: 3521.48,
    marketCap: "$423B",
    volume24h: "$18.7B",
  },
]

// Portfolio asset types
type PortfolioAsset = {
  id: string
  name: string
  symbol: string
  icon: string
  price: number
  amount: number
  value: number
  allocation: number
  change24h: number
}

// Staking asset types
type StakingAsset = {
  id: string
  name: string
  symbol: string
  icon: string
  apy: number
  staked: number
  rewards: number
  totalValue: number
  change24h: number
  lockPeriod?: string
  status: "active" | "pending" | "unlocking"
}

// Sample portfolio data
const portfolioAssets: PortfolioAsset[] = [
  {
    id: "sol",
    name: "Solana",
    symbol: "SOL",
    icon: "/tokenimages/app/solana-sol-logo.svg",
    price: 148.93,
    amount: 150.5,
    value: 22413.96,
    allocation: 40.1,
    change24h: 4.78,
  },
  {
    id: "peridot",
    name: "Peridot",
    symbol: "PDT",
    icon: "/logo.svg",
    price: 14.86,
    amount: 1200,
    value: 17832.00,
    allocation: 31.9,
    change24h: 7.21,
  },
  {
    id: "eth",
    name: "Ether",
    symbol: "ETH",
    icon: "/tokenimages/app/ethereum-eth-logo.svg",
    price: 3521.48,
    amount: 3,
    value: 10564.44,
    allocation: 18.9,
    change24h: 2.34,
  },
  {
    id: "usdc",
    name: "USD Coin",
    symbol: "USDC",
    icon: "/tokenimages/app/usd-coin-usdc-logo.svg",
    price: 1.0,
    amount: 5062.60,
    value: 5062.60,
    allocation: 9.1,
    change24h: 0.01,
  },
]

// Sample staking data
const stakingAssets: StakingAsset[] = [
  {
    id: "sol-stake",
    name: "Solana",
    symbol: "SOL",
    icon: "/tokenimages/app/solana-sol-logo.svg",
    apy: 6.8,
    staked: 500,
    rewards: 12.45,
    totalValue: 76345.50,
    change24h: 4.78,
    lockPeriod: "21 days",
    status: "active",
  },
  {
    id: "pdt-stake",
    name: "Peridot",
    symbol: "PDT",
    icon: "/logo.svg",
    apy: 12.5,
    staked: 2500,
    rewards: 156.25,
    totalValue: 39471.25,
    change24h: 7.21,
    lockPeriod: "14 days",
    status: "active",
  },
  {
    id: "eth-stake",
    name: "Ethereum",
    symbol: "ETH",
    icon: "/tokenimages/app/ethereum-eth-logo.svg",
    apy: 4.2,
    staked: 5,
    rewards: 0.35,
    totalValue: 17842.75,
    change24h: 2.34,
    lockPeriod: "32 days",
    status: "active",
  },
  {
    id: "xlm-stake",
    name: "Stellar",
    symbol: "XLM",
    icon: "/tokenimages/app/stellar.svg",
    apy: 8.7,
    staked: 10000,
    rewards: 435.0,
    totalValue: 25535.0,
    change24h: 9.87,
    lockPeriod: "7 days",
    status: "pending",
  },
]

// Sample chart data
const generateChartData = (days = 30, volatility = 0.1, uptrend = true) => {
  const data = []
  let value = 100

  for (let i = 0; i < days; i++) {
    const change = uptrend
      ? Math.random() * volatility - volatility * 0.3
      : Math.random() * volatility - volatility * 0.7

    value = Math.max(value * (1 + change), 10)
    data.push({ day: i, value: value })
  }

  return data
}

// Component for animated number counter
const AnimatedCounter = ({ 
  value, 
  prefix = "", 
  suffix = "", 
  duration = 1 
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
}) => {
  const [displayValue, setDisplayValue] = useState(0)

  useEffect(() => {
    let startTime: number | null = null
    let animationFrame: number | null = null

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp
      const progress = Math.min((timestamp - startTime) / (duration * 1000), 1)

      setDisplayValue(Math.floor(progress * value))

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate)
      }
    }

    animationFrame = requestAnimationFrame(animate)

    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame)
      }
    }
  }, [value, duration])

  return (
    <span>
      {prefix}
      {displayValue}
      {suffix}
    </span>
  )
}

// Mini chart component
const MiniChart = ({ 
  data, 
  color = "#22c55e", 
  height = 40, 
  width = 100 
}: {
  data: Array<{day: number; value: number}>;
  color?: string;
  height?: number;
  width?: number;
}) => {
  const pathRef = useRef(null)
  const isInView = useInView(pathRef, { once: true })

  // Normalize data for the chart
  const maxValue = Math.max(...data.map((d) => d.value))
  const minValue = Math.min(...data.map((d) => d.value))
  const range = maxValue - minValue

  // Create SVG path
  const createPath = () => {
    const points = data.map((d, i) => {
      const x = (i / (data.length - 1)) * width
      const y = height - ((d.value - minValue) / range) * height
      return `${x},${y}`
    })

    return `M${points.join(" L")}`
  }

  return (
    <svg width={width} height={height} className="overflow-visible">
      <motion.path
        ref={pathRef}
        d={createPath()}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={isInView ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }}
        transition={{ duration: 1.5, ease: "easeInOut" }}
      />
    </svg>
  )
}

// Animated card component
const AnimatedCard = ({ 
  children, 
  delay = 0, 
  ...props 
}: {
  children: React.ReactNode;
  delay?: number;
  [key: string]: any;
}) => {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, amount: 0.3 })

  return (
    <motion.div
      ref={ref}
      initial={{ y: 20, opacity: 0 }}
      animate={isInView ? { y: 0, opacity: 1 } : { y: 20, opacity: 0 }}
      transition={{
        duration: 0.5,
        delay: delay,
        ease: [0.22, 1, 0.36, 1],
      }}
      {...props}
    >
      {children}
    </motion.div>
  )
}

// Interactive donut chart component
const DonutChart = ({ 
  value, 
  max = 100, 
  size = 120, 
  strokeWidth = 10, 
  color = "var(--primary)" 
}: {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
}) => {
  const percentage = (value / max) * 100
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (percentage / 100) * circumference
  const [displayPercentage, setDisplayPercentage] = useState(0)

  useEffect(() => {
    let startTime: number | null = null
    let animationFrame: number | null = null

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp
      const progress = Math.min((timestamp - startTime) / 1500, 1)

      setDisplayPercentage(Math.round(progress * percentage))

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate)
      }
    }

    animationFrame = requestAnimationFrame(animate)

    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame)
      }
    }
  }, [percentage])

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="rotate-[-90deg]">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--secondary)"
          strokeWidth={strokeWidth}
        />

        {/* Progress circle */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 1.5, ease: "easeInOut" }}
          strokeLinecap="round"
        />
      </svg>

      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-lg font-bold">{displayPercentage}%</span>
      </div>
    </div>
  )
}

// Portfolio asset row component
const PortfolioAssetRow = ({
  asset,
  onViewDetails,
}: {
  asset: PortfolioAsset;
  onViewDetails: (asset: PortfolioAsset) => void;
}) => {
  const [isHovered, setIsHovered] = useState(false)
  const { theme } = useTheme()
  const isDark = theme === "dark"

  const chartData = generateChartData(30, 0.05, asset.change24h > 0)
  const chartColor = asset.change24h > 0 ? "#22c55e" : "#ef4444"

  return (
    <motion.tr
      className="relative group cursor-pointer"
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      whileHover={{
        backgroundColor: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
        transition: { duration: 0.2 },
      }}
      onClick={() => onViewDetails(asset)}
      layout
    >
      <TableCell className="relative whitespace-nowrap">
        <div className="flex items-center space-x-3">
          <motion.div
            className="w-10 h-10 rounded-full flex items-center justify-center relative overflow-hidden"
            whileHover={{ scale: 1.05 }}
            transition={{ type: "spring", stiffness: 400, damping: 10 }}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-accent/20 rounded-full blur-sm"></div>
            <div className="absolute inset-0 bg-card rounded-full"></div>
            <Image
              src={asset.icon}
              alt={asset.name}
              width={32}
              height={32}
              className="relative z-10"
            />
          </motion.div>
          <div>
            <div className="font-medium">{asset.name}</div>
            <div className="text-xs text-text/60">{asset.symbol}</div>
          </div>
        </div>

        <motion.div
          className="absolute left-0 top-0 bottom-0 w-[3px] bg-primary rounded-full"
          initial={{ height: 0, opacity: 0 }}
          animate={{
            height: isHovered ? "100%" : "0%",
            opacity: isHovered ? 1 : 0,
          }}
          transition={{ duration: 0.2 }}
        />
      </TableCell>

      <TableCell className="whitespace-nowrap">
        <div className="font-medium">${asset.price.toLocaleString()}</div>
      </TableCell>

      <TableCell className="whitespace-nowrap">
        <div className="font-medium">{asset.amount.toLocaleString()}</div>
      </TableCell>

      <TableCell className="whitespace-nowrap">
        <div className="font-medium">${asset.value.toLocaleString()}</div>
      </TableCell>

      <TableCell className="whitespace-nowrap">
        <div className="flex items-center space-x-2">
          <div className="flex flex-col">
            <span className="font-medium">{asset.allocation}%</span>
            <Progress 
              value={asset.allocation} 
              className="h-1 w-12 bg-muted [&>div]:bg-primary" 
            />
          </div>
        </div>
      </TableCell>

      <TableCell className="whitespace-nowrap">
        <div className="flex items-center space-x-2">
          <div
            className={cn(
              "flex items-center px-2 py-1 rounded-full text-xs font-medium",
              asset.change24h > 0 ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500",
            )}
          >
            {asset.change24h > 0 ? (
              <TrendingUp className="h-3 w-3 mr-1" />
            ) : (
              <TrendingDown className="h-3 w-3 mr-1" />
            )}
            {asset.change24h > 0 ? "+" : ""}{asset.change24h}%
          </div>
          <MiniChart data={chartData} color={chartColor} width={60} height={20} />
        </div>
      </TableCell>
    </motion.tr>
  )
}

// Staking asset row component
const StakingAssetRow = ({
  asset,
  onManageStake,
  onClaimRewards,
}: {
  asset: StakingAsset;
  onManageStake: (asset: StakingAsset) => void;
  onClaimRewards: (asset: StakingAsset) => void;
}) => {
  const [isHovered, setIsHovered] = useState(false)
  const { theme } = useTheme()
  const isDark = theme === "dark"

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active": return "bg-green-500/10 text-green-500"
      case "pending": return "bg-yellow-500/10 text-yellow-500"
      case "unlocking": return "bg-blue-500/10 text-blue-500"
      default: return "bg-gray-500/10 text-gray-500"
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "active": return <Check className="h-3 w-3 mr-1" />
      case "pending": return <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
      case "unlocking": return <History className="h-3 w-3 mr-1" />
      default: return null
    }
  }

  return (
    <motion.tr
      className="relative group"
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      whileHover={{
        backgroundColor: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
        transition: { duration: 0.2 },
      }}
      layout
    >
      <TableCell className="relative whitespace-nowrap">
        <div className="flex items-center space-x-3">
          <motion.div
            className="w-10 h-10 rounded-full flex items-center justify-center relative overflow-hidden"
            whileHover={{ scale: 1.05 }}
            transition={{ type: "spring", stiffness: 400, damping: 10 }}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-accent/20 rounded-full blur-sm"></div>
            <div className="absolute inset-0 bg-card rounded-full"></div>
            <Image
              src={asset.icon}
              alt={asset.name}
              width={32}
              height={32}
              className="relative z-10"
            />
          </motion.div>
          <div>
            <div className="font-medium">{asset.name}</div>
            <div className="text-xs text-text/60">{asset.symbol}</div>
          </div>
        </div>

        <motion.div
          className="absolute left-0 top-0 bottom-0 w-[3px] bg-primary rounded-full"
          initial={{ height: 0, opacity: 0 }}
          animate={{
            height: isHovered ? "100%" : "0%",
            opacity: isHovered ? 1 : 0,
          }}
          transition={{ duration: 0.2 }}
        />
      </TableCell>

      <TableCell className="whitespace-nowrap">
        <div className="flex flex-col">
          <div className="font-medium">{asset.apy}%</div>
          <div className="text-xs text-text/60">APY</div>
        </div>
      </TableCell>

      <TableCell className="whitespace-nowrap">
        <div className="flex flex-col">
          <div className="font-medium">{asset.staked.toLocaleString()}</div>
          <div className="text-xs text-green-500">+{asset.rewards.toFixed(2)} rewards</div>
        </div>
      </TableCell>

      <TableCell className="whitespace-nowrap">
        <div className="font-medium">${asset.totalValue.toLocaleString()}</div>
      </TableCell>

      <TableCell className="whitespace-nowrap">
        <div className={cn("px-2 py-1 rounded-full text-xs font-medium flex items-center w-fit", getStatusColor(asset.status))}>
          {getStatusIcon(asset.status)}
          {asset.status.charAt(0).toUpperCase() + asset.status.slice(1)}
        </div>
        {asset.lockPeriod && (
          <div className="text-xs text-text/60 mt-1">Lock: {asset.lockPeriod}</div>
        )}
      </TableCell>

      <TableCell className="opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="flex gap-1">
          <motion.div initial={{ x: 10, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.2 }}>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs rounded-full"
              onClick={(e) => {
                e.stopPropagation();
                onClaimRewards(asset);
              }}
              disabled={asset.rewards <= 0}
            >
              <Zap className="h-3 w-3 mr-1" />
              Claim
            </Button>
          </motion.div>
          <motion.div initial={{ x: 10, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.2, delay: 0.05 }}>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs rounded-full"
              onClick={(e) => {
                e.stopPropagation();
                onManageStake(asset);
              }}
            >
              <ArrowRight className="h-3 w-3 mr-1" />
              Manage
            </Button>
          </motion.div>
        </div>
      </TableCell>
    </motion.tr>
  )
}

// Interactive asset row component
const AssetRow = ({
  asset,
  isSupply = true,
  onToggleCollateral,
  isDemoMode,
  onQuickSupplyClick,
  onOpenDetailModal,
}: {
  asset: Asset;
  isSupply?: boolean;
  onToggleCollateral?: (assetId: string) => void;
  isDemoMode?: boolean;
  onQuickSupplyClick?: (asset: Asset) => void;
  onOpenDetailModal: (asset: Asset, isSupplyAction: boolean) => void;
}) => {
  const [isHovered, setIsHovered] = useState(false)
  const { theme } = useTheme()
  const isDark = theme === "dark"

  const chartData = generateChartData(30, 0.05, asset.change24h ? asset.change24h > 0 : true)
  const chartColor = asset.change24h && asset.change24h > 0 ? "#22c55e" : "#ef4444"

  return (
    <motion.tr
      className="relative group"
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      whileHover={{
        backgroundColor: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
        transition: { duration: 0.2 },
      }}
      layout
    >
      <TableCell className="relative whitespace-nowrap">
        <div className="flex items-center space-x-3">
          <motion.div
            className="w-10 h-10 rounded-full flex items-center justify-center relative overflow-hidden"
            whileHover={{ scale: 1.05 }}
            transition={{ type: "spring", stiffness: 400, damping: 10 }}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-accent/20 rounded-full blur-sm"></div>
            <div className="absolute inset-0 bg-card rounded-full"></div>
            <Image
              src={asset.icon}
              alt={asset.name}
              width={32}
              height={32}
              className="relative z-10"
            />
          </motion.div>
          <div>
            <div className="font-medium">{asset.name}</div>
            <div className="text-xs text-text/60">{asset.symbol}</div>
          </div>
        </div>

        {/* Hover effect line */}
        <motion.div
          className="absolute left-0 top-0 bottom-0 w-[3px] bg-primary rounded-full"
          initial={{ height: 0, opacity: 0 }}
          animate={{
            height: isHovered ? "100%" : "0%",
            opacity: isHovered ? 1 : 0,
          }}
          transition={{ duration: 0.2 }}
        />
      </TableCell>

      <TableCell className="whitespace-nowrap">
        <div className="flex flex-col">
          <div className="font-medium">{asset.apy}%</div>
          <div className="text-xs text-text/60">APY</div>
        </div>
      </TableCell>

      <TableCell className="whitespace-nowrap">
        <div className="flex items-center space-x-2">
          <div>{asset.wallet}</div>
          {isHovered && isSupply && isDemoMode && onQuickSupplyClick && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.2 }}
            >
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 rounded-full"
                onClick={(e) => {
                  e.stopPropagation();
                  onQuickSupplyClick(asset);
                }}
              >
                <Plus className="h-3 w-3" />
              </Button>
            </motion.div>
          )}
        </div>
      </TableCell>

      {isSupply ? (
        <TableCell className="whitespace-nowrap">
          <div className="flex items-center">
            <motion.div
              className={cn(
                "w-12 h-6 bg-secondary/20 rounded-full flex items-center cursor-pointer",
                asset.collateral ? "justify-start pl-1" : "justify-end pr-1",
                (!isDemoMode || !(parseFloat(asset.wallet.split(" ")[0]) > 0)) && "opacity-50 cursor-not-allowed"
              )}
              whileHover={{ scale: (isDemoMode && parseFloat(asset.wallet.split(" ")[0]) > 0) ? 1.05 : 1 }}
              whileTap={{ scale: (isDemoMode && parseFloat(asset.wallet.split(" ")[0]) > 0) ? 0.95 : 1 }}
              onClick={(e) => {
                if (isDemoMode && onToggleCollateral && asset.id && parseFloat(asset.wallet.split(" ")[0]) > 0) {
                  onToggleCollateral(asset.id);
                }
              }}
            >
              <motion.div
                className={cn("w-4 h-4 rounded-full", asset.collateral ? "bg-primary" : "bg-muted")}
                layout
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              />
            </motion.div>
          </div>
        </TableCell>
      ) : (
        <TableCell className="whitespace-nowrap">
          <div className="flex items-center space-x-2">
            <div>{asset.liquidity}</div>
            <MiniChart data={chartData} color={chartColor} />
          </div>
        </TableCell>
      )}

      <TableCell className="opacity-0 group-hover:opacity-100 transition-opacity">
        <motion.div initial={{ x: 10, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.2 }}>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 rounded-full"
            onClick={(e) => {
              e.stopPropagation();
              onOpenDetailModal(asset, isSupply);
            }}
          >
            <ArrowRight className="h-4 w-4 mr-1" />
            {isSupply ? "Supply" : "Borrow"}
          </Button>
        </motion.div>
      </TableCell>
    </motion.tr>
  )
}

// Portfolio Detail Modal component
const PortfolioDetailModal = ({
  asset,
  onClose,
  onTransaction,
  isDemoMode,
}: {
  asset: PortfolioAsset;
  onClose: () => void;
  onTransaction: (asset: PortfolioAsset, amount: number, type: "buy" | "sell") => void;
  isDemoMode: boolean;
}) => {
  const [amount, setAmount] = useState("")
  const [transactionType, setTransactionType] = useState<"buy" | "sell">("buy")
  const [showConfirmation, setShowConfirmation] = useState(false)

  const chartData = generateChartData(30, 0.05, asset.change24h > 0)
  const chartColor = asset.change24h > 0 ? "#22c55e" : "#ef4444"

  const handleTransaction = () => {
    if (!isDemoMode) return;

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      alert("Please enter a valid amount.");
      return;
    }

    onTransaction(asset, numericAmount, transactionType);
    setAmount("");
    setShowConfirmation(true);
    setTimeout(() => setShowConfirmation(false), 2000);
  };

  const currentValue = asset.value;
  const estimatedValue = parseFloat(amount) * asset.price || 0;

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-start justify-center bg-background/80 backdrop-blur-sm pt-30 pb-8 overflow-y-auto"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="bg-card border border-border/50 rounded-xl shadow-xl w-full max-w-3xl overflow-hidden"
        initial={{ scale: 0.9, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.9, y: 20, opacity: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-border/50 bg-gradient-to-r from-primary/5 to-accent/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <motion.div 
                className="w-16 h-16 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center"
                whileHover={{ scale: 1.05 }}
                transition={{ type: "spring", stiffness: 400, damping: 10 }}
              >
                <Image
                  src={asset.icon}
                  alt={asset.name}
                  width={48}
                  height={48}
                />
              </motion.div>
              <div>
                <h3 className="text-2xl font-bold">{asset.name}</h3>
                <div className="text-sm text-text/60">{asset.symbol}</div>
                <div className="flex items-center mt-1">
                  <Badge variant="secondary" className="mr-2">
                    {asset.allocation}% of portfolio
                  </Badge>
                  <div
                    className={cn(
                      "flex items-center px-2 py-1 rounded-full text-xs font-medium",
                      asset.change24h > 0 ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500",
                    )}
                  >
                    {asset.change24h > 0 ? (
                      <TrendingUp className="h-3 w-3 mr-1" />
                    ) : (
                      <TrendingDown className="h-3 w-3 mr-1" />
                    )}
                    {asset.change24h > 0 ? "+" : ""}{asset.change24h}%
                  </div>
                </div>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="rounded-full" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-muted/50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-text/60 mb-1">Current Price</h4>
                <div className="text-xl font-bold">${asset.price.toLocaleString()}</div>
              </div>
              <div className="bg-muted/50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-text/60 mb-1">Holdings</h4>
                <div className="text-xl font-bold">{asset.amount.toLocaleString()}</div>
              </div>
            </div>

            <div className="bg-muted/50 rounded-lg p-4">
              <h4 className="text-sm font-medium text-text/60 mb-1">Total Value</h4>
              <div className="text-2xl font-bold">${asset.value.toLocaleString()}</div>
              <div className="text-sm text-text/60 mt-1">
                {asset.allocation}% of your portfolio
              </div>
            </div>

            <div>
              <h4 className="text-sm font-medium text-text/60 mb-3">Price Chart (30 Days)</h4>
              <div className="h-[180px] w-full bg-card/50 rounded-lg border border-border/50 p-4 flex items-center justify-center">
                <MiniChart data={chartData} color={chartColor} height={140} width={300} />
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <h4 className="text-sm font-medium text-text/60 mb-3">Transaction Type</h4>
              <div className="flex space-x-2">
                <Button
                  variant={transactionType === "buy" ? "default" : "outline"}
                  onClick={() => setTransactionType("buy")}
                  className="flex-1"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Buy More
                </Button>
                <Button
                  variant={transactionType === "sell" ? "default" : "outline"}
                  onClick={() => setTransactionType("sell")}
                  className="flex-1"
                >
                  <ArrowRight className="h-4 w-4 mr-2" />
                  Sell
                </Button>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-medium text-text/60 mb-3">Amount</h4>
              <div className="relative">
                <input
                  type="text"
                  className="w-full px-4 py-3 rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={!isDemoMode}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center space-x-2">
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                    MAX
                  </Button>
                  <span className="text-sm font-medium">{asset.symbol}</span>
                </div>
              </div>

              {isDemoMode && estimatedValue > 0 && (
                <div className="mt-3 p-3 bg-primary/5 rounded-lg border border-primary/20">
                  <div className="text-sm text-text/60">
                    Estimated {transactionType === "buy" ? "cost" : "proceeds"}:
                  </div>
                  <div className="text-lg font-bold text-primary">${estimatedValue.toLocaleString()}</div>
                  {transactionType === "sell" && (
                    <div className="text-xs text-text/60 mt-1">
                      After transaction: {(asset.amount - parseFloat(amount)).toLocaleString()} {asset.symbol}
                    </div>
                  )}
                </div>
              )}
            </div>

            <Button
              className="w-full bg-primary text-background hover:bg-primary/90 h-12"
              onClick={handleTransaction}
              disabled={!isDemoMode || parseFloat(amount) <= 0 || isNaN(parseFloat(amount))}
            >
              {transactionType === "buy" ? "Buy" : "Sell"} {asset.symbol}
            </Button>

            {showConfirmation && isDemoMode && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-2 text-sm text-center text-green-500 flex items-center justify-center bg-green-500/10 rounded-lg p-3"
              >
                <Check className="h-4 w-4 mr-2" />
                Transaction Successful!
              </motion.div>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

// Staking Management Modal component
const StakingManageModal = ({
  asset,
  onClose,
  onStakeTransaction,
  onClaimRewards,
  isDemoMode,
  mode = "manage",
}: {
  asset: StakingAsset;
  onClose: () => void;
  onStakeTransaction: (asset: StakingAsset, amount: number, type: "stake" | "unstake") => void;
  onClaimRewards: (asset: StakingAsset) => void;
  isDemoMode: boolean;
  mode?: "manage" | "claim";
}) => {
  const [amount, setAmount] = useState("")
  const [transactionType, setTransactionType] = useState<"stake" | "unstake">("stake")
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [confirmationType, setConfirmationType] = useState<"stake" | "unstake" | "claim">("stake")

  const handleStakeTransaction = () => {
    if (!isDemoMode) return;

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      alert("Please enter a valid amount.");
      return;
    }

    onStakeTransaction(asset, numericAmount, transactionType);
    setAmount("");
    setConfirmationType(transactionType);
    setShowConfirmation(true);
    setTimeout(() => setShowConfirmation(false), 2000);
  };

  const handleClaimRewards = () => {
    if (!isDemoMode) return;
    onClaimRewards(asset);
    setConfirmationType("claim");
    setShowConfirmation(true);
    setTimeout(() => setShowConfirmation(false), 2000);
  };

  const estimatedYearlyRewards = parseFloat(amount) * (asset.apy / 100) || 0;

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-start justify-center bg-background/80 backdrop-blur-sm pt-20 pb-8 overflow-y-auto"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="bg-card border border-border/50 rounded-xl shadow-xl w-full max-w-3xl overflow-hidden"
        initial={{ scale: 0.9, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.9, y: 20, opacity: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-border/50 bg-gradient-to-r from-green-500/10 to-blue-500/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <motion.div 
                className="w-16 h-16 rounded-full bg-gradient-to-br from-green-500/20 to-blue-500/20 flex items-center justify-center"
                whileHover={{ scale: 1.05 }}
                transition={{ type: "spring", stiffness: 400, damping: 10 }}
              >
                <Image
                  src={asset.icon}
                  alt={asset.name}
                  width={48}
                  height={48}
                />
              </motion.div>
              <div>
                <h3 className="text-2xl font-bold">{asset.name} Staking</h3>
                <div className="text-sm text-text/60">{asset.symbol}</div>
                <div className="flex items-center mt-1 space-x-2">
                  <Badge variant="secondary">
                    {asset.apy}% APY
                  </Badge>
                  <div className={cn("px-2 py-1 rounded-full text-xs font-medium flex items-center", 
                    asset.status === "active" ? "bg-green-500/10 text-green-500" :
                    asset.status === "pending" ? "bg-yellow-500/10 text-yellow-500" :
                    "bg-blue-500/10 text-blue-500"
                  )}>
                    {asset.status === "active" && <Check className="h-3 w-3 mr-1" />}
                    {asset.status === "pending" && <RefreshCw className="h-3 w-3 mr-1 animate-spin" />}
                    {asset.status === "unlocking" && <History className="h-3 w-3 mr-1" />}
                    {asset.status.charAt(0).toUpperCase() + asset.status.slice(1)}
                  </div>
                </div>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="rounded-full" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-muted/50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-text/60 mb-1">Currently Staked</h4>
                <div className="text-xl font-bold">{asset.staked.toLocaleString()}</div>
                <div className="text-sm text-text/60">{asset.symbol}</div>
              </div>
              <div className="bg-muted/50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-text/60 mb-1">Total Value</h4>
                <div className="text-xl font-bold">${asset.totalValue.toLocaleString()}</div>
              </div>
            </div>

            <div className="bg-gradient-to-r from-green-500/10 to-blue-500/10 rounded-lg p-4 border border-green-500/20">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium text-green-500">Available Rewards</h4>
                <Zap className="h-4 w-4 text-green-500" />
              </div>
              <div className="text-2xl font-bold text-green-500 mb-2">
                {asset.rewards.toFixed(2)} {asset.symbol}
              </div>
              <Button
                onClick={handleClaimRewards}
                disabled={!isDemoMode || asset.rewards <= 0}
                className="w-full bg-green-500 hover:bg-green-600 text-white"
                size="sm"
              >
                <Zap className="h-4 w-4 mr-2" />
                Claim Rewards
              </Button>
            </div>

            <div className="bg-muted/50 rounded-lg p-4">
              <h4 className="text-sm font-medium text-text/60 mb-2">Staking Details</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>APY:</span>
                  <span className="font-medium">{asset.apy}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Lock Period:</span>
                  <span className="font-medium">{asset.lockPeriod || "Flexible"}</span>
                </div>
                <div className="flex justify-between">
                  <span>Status:</span>
                  <span className="font-medium capitalize">{asset.status}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <h4 className="text-sm font-medium text-text/60 mb-3">Action Type</h4>
              <div className="flex space-x-2">
                <Button
                  variant={transactionType === "stake" ? "default" : "outline"}
                  onClick={() => setTransactionType("stake")}
                  className="flex-1"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Stake More
                </Button>
                <Button
                  variant={transactionType === "unstake" ? "default" : "outline"}
                  onClick={() => setTransactionType("unstake")}
                  className="flex-1"
                  disabled={asset.status !== "active"}
                >
                  <ArrowRight className="h-4 w-4 mr-2" />
                  Unstake
                </Button>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-medium text-text/60 mb-3">Amount</h4>
              <div className="relative">
                <input
                  type="text"
                  className="w-full px-4 py-3 rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={!isDemoMode}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center space-x-2">
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                    MAX
                  </Button>
                  <span className="text-sm font-medium">{asset.symbol}</span>
                </div>
              </div>

              {isDemoMode && estimatedYearlyRewards > 0 && transactionType === "stake" && (
                <div className="mt-3 p-3 bg-green-500/5 rounded-lg border border-green-500/20">
                  <div className="text-sm text-text/60">
                    Estimated yearly rewards:
                  </div>
                  <div className="text-lg font-bold text-green-500">
                    {estimatedYearlyRewards.toFixed(2)} {asset.symbol}
                  </div>
                  <div className="text-xs text-text/60 mt-1">
                    At {asset.apy}% APY
                  </div>
                </div>
              )}
            </div>

            <Button
              className="w-full bg-primary text-background hover:bg-primary/90 h-12"
              onClick={handleStakeTransaction}
              disabled={!isDemoMode || parseFloat(amount) <= 0 || isNaN(parseFloat(amount))}
            >
              {transactionType === "stake" ? "Stake" : "Unstake"} {asset.symbol}
            </Button>

            {showConfirmation && isDemoMode && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "mt-2 text-sm text-center flex items-center justify-center rounded-lg p-3",
                  confirmationType === "claim" ? "text-green-500 bg-green-500/10" : "text-blue-500 bg-blue-500/10"
                )}
              >
                <Check className="h-4 w-4 mr-2" />
                {confirmationType === "claim" ? "Rewards Claimed!" : 
                 confirmationType === "stake" ? "Staking Successful!" : "Unstaking Initiated!"}
              </motion.div>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

// Asset detail modal component
const AssetDetailCard = ({
  asset,
  onClose,
  isSupply = true,
  onTransaction,
  isDemoMode,
  focusAmountInput,
  onAmountInputFocused,
}: {
  asset: Asset;
  onClose: () => void;
  isSupply?: boolean;
  onTransaction: (asset: Asset, amount: number, type: "supply" | "borrow") => void;
  isDemoMode: boolean;
  focusAmountInput?: boolean;
  onAmountInputFocused?: () => void;
}) => {
  const chartData = generateChartData(30, 0.05, asset.change24h ? asset.change24h > 0 : true)
  const chartColor = asset.change24h && asset.change24h > 0 ? "#22c55e" : "#ef4444"
  const [amount, setAmount] = useState("")
  const [showConfirmation, setShowConfirmation] = useState(false);
  const amountInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusAmountInput && amountInputRef.current) {
      amountInputRef.current.focus();
      if (onAmountInputFocused) {
        onAmountInputFocused();
      }
    }
  }, [focusAmountInput, onAmountInputFocused]);

  const handleAction = () => {
    if (!isDemoMode) return;

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      alert("Please enter a valid amount.");
      return;
    }

    onTransaction(asset, numericAmount, isSupply ? "supply" : "borrow");
    setAmount("");
    setShowConfirmation(true);
    setTimeout(() => setShowConfirmation(false), 2000);
  };

  const calculateForecast = () => {
    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0 || !asset.apy) {
      return null;
    }
    const yearlyYield = (numericAmount * asset.apy) / 100;
    return yearlyYield.toFixed(2);
  };

  const forecast = calculateForecast();

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-start justify-center bg-background/80 backdrop-blur-sm pt-20 pb-8 overflow-y-auto"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="bg-card border border-border/50 rounded-xl shadow-xl w-full max-w-2xl overflow-hidden"
        initial={{ scale: 0.9, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.9, y: 20, opacity: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-border/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                <Image
                  src={asset.icon}
                  alt={asset.name}
                  width={36}
                  height={36}
                />
              </div>
              <div>
                <h3 className="text-xl font-bold">{asset.name}</h3>
                <div className="text-sm text-text/60">{asset.symbol}</div>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <div
                className={cn(
                  "px-2 py-1 rounded-full text-xs font-medium flex items-center",
                  asset.change24h && asset.change24h > 0 ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500",
                )}
              >
                {asset.change24h && asset.change24h > 0 ? (
                  <TrendingUp className="h-3 w-3 mr-1" />
                ) : (
                  <TrendingDown className="h-3 w-3 mr-1" />
                )}
                {asset.change24h && asset.change24h > 0 ? "+" : ""}
                {asset.change24h}%
              </div>
              <Button variant="ghost" size="icon" className="rounded-full" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <div className="mb-4">
              <h4 className="text-sm font-medium text-text/60 mb-1">Current Price</h4>
              <div className="text-2xl font-bold">${asset.price?.toLocaleString() || "0.00"}</div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <h4 className="text-sm font-medium text-text/60 mb-1">Market Cap</h4>
                <div className="font-medium">{asset.marketCap}</div>
              </div>
              <div>
                <h4 className="text-sm font-medium text-text/60 mb-1">24h Volume</h4>
                <div className="font-medium">{asset.volume24h}</div>
              </div>
            </div>

            <div className="mb-6">
              <h4 className="text-sm font-medium text-text/60 mb-3">APY</h4>
              <div className="flex items-center space-x-3">
                <DonutChart value={asset.apy} max={15} color="var(--primary)" />
                <div>
                  <div className="text-2xl font-bold">{asset.apy}%</div>
                  <div className="text-sm text-text/60">Annual Percentage Yield</div>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-medium text-text/60 mb-2">
                {isSupply ? "Collateral Factor" : "Liquidity Available"}
              </h4>
              {isSupply ? (
                <div className="flex items-center space-x-3">
                  <div
                    className={cn(
                      "px-3 py-1 rounded-full text-sm font-medium",
                      asset.collateral ? "bg-primary/10 text-primary" : "bg-muted/50 text-text/60",
                    )}
                  >
                    {asset.collateral ? "Enabled" : "Disabled"}
                  </div>
                  <div className="text-sm text-text/60">
                    {asset.collateral
                      ? "This asset can be used as collateral"
                      : "This asset cannot be used as collateral"}
                  </div>
                </div>
              ) : (
                <div className="text-lg font-medium">{asset.liquidity}</div>
              )}
            </div>
          </div>

          <div>
            <h4 className="text-sm font-medium text-text/60 mb-4">Price History (30 Days)</h4>
            <div className="h-[200px] w-full bg-card/50 rounded-lg border border-border/50 p-4 flex items-center justify-center">
              <MiniChart data={chartData} color={chartColor} height={150} width={300} />
            </div>

            <div className="mt-6">
              <h4 className="text-sm font-medium text-text/60 mb-3">{isSupply ? "Supply" : "Borrow"} Amount</h4>
              <div className="relative">
                <input
                  ref={amountInputRef}
                  type="text"
                  className="w-full px-4 py-3 rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={!isDemoMode}
                  onFocus={onAmountInputFocused}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center space-x-2">
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                    MAX
                  </Button>
                  <span className="text-sm font-medium">{asset.symbol}</span>
                </div>
              </div>

              {isDemoMode && forecast && (
                <div className="mt-2 text-xs text-muted-foreground">
                  Estimated yearly {isSupply ? "earnings" : "cost"}: <span className="font-semibold">${forecast}</span> (at {asset.apy}% APY)
                </div>
              )}

              <Button
                className="w-full mt-4 bg-primary text-background hover:bg-primary/90"
                onClick={handleAction}
                disabled={!isDemoMode || parseFloat(amount) <= 0 || isNaN(parseFloat(amount))}
              >
                {isSupply ? "Supply" : "Borrow"} {asset.symbol}
              </Button>
              {showConfirmation && isDemoMode && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-2 text-sm text-center text-green-500 flex items-center justify-center"
                >
                  <Check className="h-4 w-4 mr-1" /> Transaction Successful!
                </motion.div>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

export default function AppPage() {
  const { theme } = useTheme()
  const isMobile = useMobile()
  const { address, isConnected, isConnecting } = useAccount()
  const [supplyData, setSupplyData] = useState<Asset[]>(supplyMarkets)
  const [borrowData, setBorrowData] = useState<Asset[]>(borrowMarkets)
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null)
  const [isDetailSupply, setIsDetailSupply] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [isEasyMode, setIsEasyMode] = useState(false)
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

  const heroRef = useRef<HTMLDivElement>(null)
  const summaryRef = useRef<HTMLDivElement>(null)
  const marketsRef = useRef<HTMLDivElement>(null)
  const heroInView = useInView(heroRef, { once: true, amount: 0.3 })
  const summaryInView = useInView(summaryRef, { once: true, amount: 0.3 })
  const marketsInView = useInView(marketsRef, { once: true, amount: 0.2 })
  const pathname = usePathname()

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
    if (!isDemoMode) return;

    let updatedSupplyData = supplyData.map(asset => {
      if (asset.id === assetId && typeof asset.collateral === 'boolean') {
        // Ensure the asset has a wallet balance to be used as collateral
        const suppliedAmount = parseFloat(asset.wallet.split(" ")[0]) || 0;
        if (suppliedAmount > 0) { // Only allow toggling if there's a balance
          return { ...asset, collateral: !asset.collateral };
        }
      }
      return asset;
    });
    
    setSupplyData(updatedSupplyData);
    const { newBorrowLimitUsedPercentage } = calculateBorrowLimitInfo(updatedSupplyData, totalBorrowed);
    setBorrowLimitUsed(newBorrowLimitUsedPercentage);
  };

  const handleTransaction = (
    targetAsset: Asset,
    numericAmount: number,
    type: "supply" | "borrow"
  ) => {
    if (!isDemoMode) return;

    if (type === "supply") {
      setTotalSupplied((prev) => prev + numericAmount);
      setSupplyData((prevData) =>
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
      setBorrowData((prevData) =>
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

    // Recalculate borrow limit after any transaction
    const currentSupplyForCalc = type === "supply" 
        ? supplyData.map(a => a.id === targetAsset.id 
            ? { ...a, wallet: `${(parseFloat(a.wallet.split(" ")[0]) || 0) + numericAmount} ${a.symbol}` } 
            : a) 
        : supplyData;
    const currentBorrowedForCalc = totalBorrowed + (type === "borrow" ? numericAmount : 0);

    const { newBorrowLimitUsedPercentage } = calculateBorrowLimitInfo(currentSupplyForCalc, currentBorrowedForCalc);
    setBorrowLimitUsed(newBorrowLimitUsedPercentage);
    
    // Net APY could be more dynamic, but for demo, major totals are enough
    // setNetAPY(...) 
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
            {/* Demo Mode Toggle Button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1 border rounded-xl px-3 py-1.5 bg-background relative">
                  <Label htmlFor="demo-mode-switch" className="text-xs cursor-pointer">Demo Mode</Label>
                  <Switch id="demo-mode-switch" checked={isDemoMode} onCheckedChange={toggleDemoMode} />
                  <HelpCircle className="h-3 w-3 text-muted-foreground ml-1" />
                </div>
              </TooltipTrigger>
              <TooltipContent><p className="max-w-xs text-xs">Toggle Demo Mode. Live data is coming soon!</p></TooltipContent>
            </Tooltip>
             {/* Easy Mode Toggle Button */} 
            <Tooltip>
              <TooltipTrigger asChild>
                 <div className="flex items-center gap-1 border rounded-xl px-3 py-1.5 bg-background relative">
                   <Label htmlFor="easy-mode-switch" className="text-xs cursor-pointer">Easy Mode</Label>
                   <Switch id="easy-mode-switch" checked={isEasyMode} onCheckedChange={toggleEasyMode} />
                   <HelpCircle className="h-3 w-3 text-muted-foreground ml-1" />
                 </div>
               </TooltipTrigger>
               <TooltipContent><p className="max-w-xs text-xs">Switch to Easy Mode for a simplified interface.</p></TooltipContent>
            </Tooltip>
             {/* Refresh Button */}
            <Button variant="outline" size="sm" onClick={handleRefresh} className="h-8 px-3">
               <RefreshCw className="h-3.5 w-3.5 mr-1" /> <span className="text-xs">Refresh</span>
             </Button>
             {/* Conditionally show Connect Button based on path if needed, or always show */}
            <ConnectWalletButton className="w-full md:w-auto" /> 
          </div>
        </div>

        {/* Summary Cards Section - Restoring Structure */} 
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-3 mb-3">
          {/* Supply Balance Card */}
          <Card className="bg-card border-border/50 overflow-hidden shadow-sm">
            <CardHeader className="p-3 pb-0">
              <CardTitle className="text-sm text-green-400 flex items-center justify-between">
                Supply Balance
                 {/* Add refresh icon if needed */}
                 <Button variant="ghost" size="icon" className="h-6 w-6 -mr-1 -mt-1">
                  <RefreshCw className="h-3 w-3" /> 
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-1">
              <div className="text-xl md:text-2xl font-bold">
                <AnimatedCounter value={totalSupplied} prefix="$" duration={0.8} />
              </div>
              <div className="flex items-center text-xs text-green-400">
                <TrendingUp className="h-3 w-3 mr-1" /> +2.14% last 24h
              </div>
            </CardContent>
          </Card>

          {/* Borrow Balance Card */} 
          <Card className="bg-card border-border/50 overflow-hidden shadow-sm">
             <CardHeader className="p-3 pb-0">
              <CardTitle className="text-sm text-green-400 flex items-center justify-between">
                Borrow Balance
                 <Button variant="ghost" size="icon" className="h-6 w-6 -mr-1 -mt-1">
                  <RefreshCw className="h-3 w-3" /> 
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-1">
               <div className="text-xl md:text-2xl font-bold">
                 <AnimatedCounter value={totalBorrowed} prefix="$" duration={0.8} />
               </div>
               <div className="flex items-center text-xs text-green-400">
                 +0.89% last 24h <TrendingUp className="h-3 w-3 ml-1" />
               </div>
             </CardContent>
          </Card>

          {/* Net APY Card */} 
          <Card className="col-span-2 md:col-span-1 bg-card border-border/50 overflow-hidden shadow-sm">
             <CardHeader className="p-3 pb-0 md:pb-0 md:text-center">
              <CardTitle className="text-sm flex items-center md:justify-center">
                Net APY
                 <Tooltip>
                   <TooltipTrigger asChild>
                     <span className="ml-1 cursor-pointer"><HelpCircle className="h-3 w-3 text-text/40" /></span>
                   </TooltipTrigger>
                   <TooltipContent side="top"><p className="text-xs max-w-[200px]">Net annual percentage yield.</p></TooltipContent>
                 </Tooltip>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-1 md:pt-0 flex flex-col items-center">
              <div className="text-xl font-bold mb-1">{netAPY.toFixed(1)}%</div>
              <Progress value={(netAPY / 10) * 100} className="h-1 w-24 bg-green-900/30 [&>div]:bg-green-500" />
              {/* Supply/Borrow APY Breakdown */}
              <div className="mt-2 grid grid-cols-2 gap-1 w-full">
                 <div className="flex flex-col items-center bg-green-500/10 rounded p-1">
                   <span className="text-xs text-green-500 font-medium">Supply APY</span>
                   <span className="text-sm font-bold">5.2%</span> 
                 </div>
                 <div className="flex flex-col items-center bg-amber-500/10 rounded p-1">
                   <span className="text-xs text-amber-500 font-medium">Borrow APY</span>
                   <span className="text-sm font-bold">2.1%</span> 
                 </div>
               </div>
            </CardContent>
          </Card>
        </div>

        {/* Borrow Limit Progress Bar */} 
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
               {/* Maybe add filter button back if needed */}
             </div>
             
             {/* Apply grid layout only on medium screens and up */}
             <div className="md:grid md:grid-cols-2 gap-6">
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
                      <Table className="min-w-[600px]"> { /* Ensure minimum width */}
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
                       <Table className="min-w-[600px]"> { /* Ensure minimum width */}
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

        {/* Asset Detail Modal */} 
        <AnimatePresence>
          {selectedAsset && isDemoMode && (
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

      </div>
    </TooltipProvider>
  )
}

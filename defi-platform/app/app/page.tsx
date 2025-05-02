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
import { useWallet } from "@/components/wallet/wallet-provider"
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
    id: "soneium",
    name: "Soneium",
    symbol: "SNM",
    icon: "/tokenimages/app/sonm-bep20-snm-logo.svg",
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
    id: "soneium",
    name: "Soneium",
    symbol: "SNM",
    icon: "/tokenimages/app/sonm-bep20-snm-logo.svg",
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

// Interactive asset row component
const AssetRow = ({ 
  asset, 
  isSupply = true, 
  onClick 
}: {
  asset: Asset;
  isSupply?: boolean;
  onClick: () => void;
}) => {
  const [isHovered, setIsHovered] = useState(false)
  const { theme } = useTheme()
  const isDark = theme === "dark"

  const chartData = generateChartData(30, 0.05, asset.change24h ? asset.change24h > 0 : true)
  const chartColor = asset.change24h && asset.change24h > 0 ? "#22c55e" : "#ef4444"

  return (
    <motion.tr
      className="cursor-pointer relative group"
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      onClick={onClick}
      whileHover={{
        backgroundColor: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
        transition: { duration: 0.2 },
      }}
      layout
    >
      <TableCell className="relative">
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

      <TableCell>
        <div className="flex flex-col">
          <div className="font-medium">{asset.apy}%</div>
          <div className="text-xs text-text/60">APY</div>
        </div>
      </TableCell>

      <TableCell>
        <div className="flex items-center space-x-2">
          <div>{asset.wallet}</div>
          {isHovered && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.2 }}
            >
              <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full">
                <Plus className="h-3 w-3" />
              </Button>
            </motion.div>
          )}
        </div>
      </TableCell>

      {isSupply ? (
        <TableCell>
          <div className="flex items-center">
            <motion.div
              className={cn(
                "w-12 h-6 bg-secondary/20 rounded-full flex items-center",
                asset.collateral ? "justify-start pl-1" : "justify-end pr-1",
              )}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
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
        <TableCell>
          <div className="flex items-center space-x-2">
            <div>{asset.liquidity}</div>
            <MiniChart data={chartData} color={chartColor} />
          </div>
        </TableCell>
      )}

      <TableCell className="opacity-0 group-hover:opacity-100 transition-opacity">
        <motion.div initial={{ x: 10, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.2 }}>
          <Button variant="ghost" size="sm" className="h-8 rounded-full">
            <ArrowRight className="h-4 w-4 mr-1" />
            {isSupply ? "Supply" : "Borrow"}
          </Button>
        </motion.div>
      </TableCell>
    </motion.tr>
  )
}

// Asset detail modal component
const AssetDetailCard = ({ 
  asset, 
  onClose, 
  isSupply = true 
}: {
  asset: Asset;
  onClose: () => void;
  isSupply?: boolean;
}) => {
  const chartData = generateChartData(30, 0.05, asset.change24h ? asset.change24h > 0 : true)
  const chartColor = asset.change24h && asset.change24h > 0 ? "#22c55e" : "#ef4444"

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
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
                  type="text"
                  className="w-full px-4 py-3 rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="0.00"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center space-x-2">
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                    MAX
                  </Button>
                  <span className="text-sm font-medium">{asset.symbol}</span>
                </div>
              </div>

              <Button className="w-full mt-4 bg-primary text-background hover:bg-primary/90">
                {isSupply ? "Supply" : "Borrow"} {asset.symbol}
              </Button>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

export default function AppPage() {
  const [activeTab, setActiveTab] = useState("markets")
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null)
  const [isAssetDetailOpen, setIsAssetDetailOpen] = useState(false)
  const [isSupplyMarket, setIsSupplyMarket] = useState(true)
  const [isEasyMode, setIsEasyMode] = useState(false)
  const { isConnected } = useWallet()
  const { theme } = useTheme()
  const isDarkMode = theme === "dark"
  const isMobile = useMobile()
  const assetDetailRef = useRef<HTMLDivElement>(null)
  const portfolioRef = useRef<HTMLDivElement>(null)
  const inView = useInView(portfolioRef, { once: true, amount: 0.2 })
  const pathname = usePathname()
  const isBridgePage = pathname === "/app/bridge"

  const handleRefresh = () => {
    // in a real app, this would fetch updated data
    console.log("Refreshing data...")
  }

  const handleAssetClick = (asset: Asset, isSupply: boolean) => {
    setSelectedAsset(asset)
    setIsSupplyMarket(isSupply)
    setIsAssetDetailOpen(true)
  }

  const handleCloseAssetDetail = () => {
    setIsAssetDetailOpen(false)
  }

  const toggleEasyMode = () => {
    setIsEasyMode(!isEasyMode)
  }

  // Render EasyMode if enabled
  if (isEasyMode) {
    return <EasyMode onExitEasyMode={toggleEasyMode} />
  }

  // Demo values for balances and APY
  const supplyBalance = "$15,423.82"
  const borrowBalance = "$4,971.50"
  const netAPY = 3
  const borrowLimit = 64

  return (
    <div className="container px-3 md:px-4 py-4 md:py-6 max-w-7xl mx-auto">
      {/* App header with improved Easy Mode toggle */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Peridot DeFi</h1>
          <p className="text-sm text-muted-foreground">
            Cross-chain lending and borrowing powered by Wormhole
          </p>
        </div>
        <div className="flex items-center gap-2 mt-2 md:mt-0">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1 border rounded-xl px-3 py-1.5 bg-background relative">
                  <Label htmlFor="easy-mode" className="text-xs cursor-pointer">Easy Mode</Label>
                  <Switch
                    id="easy-mode"
                    checked={isEasyMode}
                    onCheckedChange={toggleEasyMode}
                    aria-label="Toggle Easy Mode for simplified interface"
                  />
                  <HelpCircle className="h-3 w-3 text-muted-foreground ml-1" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <p className="text-xs">
                  Easy Mode provides a simplified experience with guided steps for beginners.
                  Toggle to switch between Easy and Advanced Modes.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefresh} 
            className="h-8 px-3"
            aria-label="Refresh data"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            <span className="text-xs">Refresh</span>
          </Button>
          {!isBridgePage && <ConnectWalletButton />}
        </div>
      </div>

      {/* Dashboard summary cards - more compact layout */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-3 mb-3">
        {/* Supply Balance */}
        <Card className="bg-card border-border/50 overflow-hidden shadow-sm">
          <CardHeader className="p-3 pb-0">
            <CardTitle className="text-sm text-green-400 flex items-center justify-between">
              Supply Balance
              <Button variant="ghost" size="icon" className="h-6 w-6 -mr-1 -mt-1">
                <RefreshCw className="h-3 w-3" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-1">
            <div className="text-xl md:text-2xl font-bold">{supplyBalance}</div>
            <div className="flex items-center text-xs text-green-400">
              <TrendingUp className="h-3 w-3 mr-1" />
              +2.14% <span className="ml-1 text-text/60">last 24h</span>
            </div>
          </CardContent>
        </Card>

        {/* Borrow Balance */}
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
            <div className="text-xl md:text-2xl font-bold">{borrowBalance}</div>
            <div className="flex items-center text-xs text-green-400">
              <span className="mr-1 text-text/60">last 24h</span>
              +0.89% <TrendingUp className="h-3 w-3 ml-1" />
            </div>
          </CardContent>
        </Card>

        {/* Net APY - Full width on mobile, normal on desktop */}
        <Card className="col-span-2 md:col-span-1 bg-card border-border/50 overflow-hidden shadow-sm">
          <div className="flex md:flex-col">
            <CardHeader className="p-3 pb-0 md:pb-0 md:text-center flex-1">
              <CardTitle className="text-sm flex items-center md:justify-center">
                Net APY
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="ml-1 cursor-pointer">
                        <HelpCircle className="h-3 w-3 text-text/40" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="text-xs max-w-[200px]">
                        Net annual percentage yield across all your supplied and borrowed positions
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-1 md:pt-0 flex items-center md:justify-center md:flex-1">
              {/* Desktop view with donut chart */}
              <div className="hidden md:flex flex-col items-center">
                <div className="text-xl font-bold mb-2">{netAPY}%</div>
                <div className="relative h-2 w-32 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div 
                    className="absolute h-full bg-green-500 left-0 top-0 rounded-full"
                    style={{ width: `${(netAPY/15)*100}%` }} 
                  />
                </div>
              </div>
              {/* Mobile view with simple progress bar */}
              <div className="md:hidden flex items-center">
                <div className="h-2 w-16 bg-green-900/20 rounded-full mr-2">
                  <div 
                    className="h-2 bg-green-500 rounded-full" 
                    style={{ width: `${(netAPY/15)*100}%` }} 
                  />
                </div>
                <span className="text-lg font-bold">{netAPY}%</span>
              </div>
            </CardContent>
          </div>
          {/* APY breakdown section - horizontally aligned */}
          <div className="px-3 pb-3 mt-1 grid grid-cols-2 gap-1">
            <div className="flex items-center justify-center bg-green-500/10 rounded p-1">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex flex-col items-center cursor-pointer">
                      <span className="text-xs text-green-500 font-medium">Supply APY</span>
                      <span className="text-sm font-bold">5.2%</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p className="text-xs">Interest earned on supplied assets</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="flex items-center justify-center bg-amber-500/10 rounded p-1">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex flex-col items-center cursor-pointer">
                      <span className="text-xs text-amber-500 font-medium">Borrow APY</span>
                      <span className="text-sm font-bold">2.1%</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p className="text-xs">Interest paid on borrowed assets</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </Card>
      </div>

      {/* Borrow Limit Progress Bar - more compact */}
      <Card className="bg-card border-border/50 overflow-hidden shadow-sm mb-4">
        <div className="p-3">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center">
              <h3 className="text-sm font-medium">Borrow Limit</h3>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="ml-1 cursor-pointer">
                      <HelpCircle className="h-3 w-3 text-text/40" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p className="text-xs max-w-[200px]">
                      Your borrow limit is calculated based on your collateral. Stay under this limit to avoid liquidation.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <span className="text-xs font-medium">{borrowLimit}% Used</span>
          </div>
          <div className="relative h-1.5 w-full bg-green-900/30 rounded-full overflow-hidden">
            <div 
              className="absolute h-full bg-green-500 left-0 top-0 rounded-full"
              style={{ width: `${borrowLimit}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-text/40 mt-1">
            <span>0%</span>
            <span>80%</span>
            <span>100%</span>
          </div>
        </div>
      </Card>

      {/* Tabs and rest of the app */}
      <Tabs
        defaultValue="markets"
        value={activeTab}
        onValueChange={setActiveTab}
        className="space-y-2"
      >
        <TabsList className="grid grid-cols-4 w-full md:w-[400px]">
          <TabsTrigger value="markets">Markets</TabsTrigger>
          <TabsTrigger value="portfolio">Portfolio</TabsTrigger>
          <TabsTrigger value="stake">Stake</TabsTrigger>
          <TabsTrigger value="bridge">Bridge</TabsTrigger>
        </TabsList>

        <TabsContent value="markets" className="space-y-4">
          {/* Markets tab content */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Supply Markets */}
            <AnimatedCard>
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle>Supply Markets</CardTitle>
                    <div className="flex gap-2">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="outline" size="icon" className="h-8 w-8">
                              <Filter className="h-4 w-4" />
                              <span className="sr-only">Filter</span>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Filter markets</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="outline" size="icon" className="h-8 w-8">
                              <Search className="h-4 w-4" />
                              <span className="sr-only">Search</span>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Search markets</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex text-xs text-muted-foreground justify-between px-2 py-1">
                      <div className="w-[40%]">Asset</div>
                      <div className="w-[20%] text-right">APY</div>
                      <div className="w-[20%] text-right">Wallet</div>
                      <div className="w-[20%] text-right"></div>
                    </div>
                    {supplyMarkets.map((asset) => (
                      <AssetRow
                        key={asset.id}
                        asset={asset}
                        isSupply={true}
                        onClick={() => handleAssetClick(asset, true)}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            </AnimatedCard>

            {/* Borrow Markets */}
            <AnimatedCard delay={0.2}>
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle>Borrow Markets</CardTitle>
                    <div className="flex gap-2">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="outline" size="icon" className="h-8 w-8">
                              <Filter className="h-4 w-4" />
                              <span className="sr-only">Filter</span>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Filter markets</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="outline" size="icon" className="h-8 w-8">
                              <Search className="h-4 w-4" />
                              <span className="sr-only">Search</span>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Search markets</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex text-xs text-muted-foreground justify-between px-2 py-1">
                      <div className="w-[40%]">Asset</div>
                      <div className="w-[20%] text-right">APY</div>
                      <div className="w-[20%] text-right">Liquidity</div>
                      <div className="w-[20%] text-right"></div>
                    </div>
                    {borrowMarkets.map((asset) => (
                      <AssetRow
                        key={asset.id}
                        asset={asset}
                        isSupply={false}
                        onClick={() => handleAssetClick(asset, false)}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            </AnimatedCard>
          </div>
        </TabsContent>

        <TabsContent value="portfolio" className="space-y-6">
          {/* Portfolio tab content */}
        </TabsContent>

        <TabsContent value="stake" className="space-y-6">
          {/* Stake tab content */}
        </TabsContent>

        <TabsContent value="bridge" className="space-y-6">
          <div className="flex flex-col space-y-4">
            <Card className="overflow-hidden">
              <CardHeader className="pb-2">
                <CardTitle>Cross-Chain Bridge</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col space-y-4">
                  <p className="text-muted-foreground">
                    Transfer your assets across multiple blockchains with our secure bridge powered by Wormhole.
                  </p>
                  <Button asChild className="w-full md:w-auto">
                    <Link href="/app/bridge">
                      Go to Bridge <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Asset Detail Modal */}
      <AnimatePresence>
        {isAssetDetailOpen && selectedAsset && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backdropFilter: "blur(4px)" }}
          >
            <div 
              className="absolute inset-0 bg-background/80 backdrop-blur-sm" 
              onClick={handleCloseAssetDetail}
            />
            <div 
              ref={assetDetailRef}
              className="z-10 w-full max-w-lg overflow-hidden"
            >
              <AssetDetailCard 
                asset={selectedAsset} 
                onClose={handleCloseAssetDetail}
                isSupply={isSupplyMarket}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

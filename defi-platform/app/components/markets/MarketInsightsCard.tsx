"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { 
  TrendingUp, 
  TrendingDown, 
  BarChart3,
  Info,
  Zap,
  DollarSign,
  Users
} from "lucide-react"
import Image from "next/image"
import { cn } from "@/lib/utils"
import { AnimatedCounter, MiniChart } from "../ui/ChartComponents"

interface MarketData {
  id: string
  asset: {
    name: string
    symbol: string
    icon: string
    chain: string
  }
  supplyAPY: number
  borrowAPY: number
  totalSupplied: number
  totalBorrowed: number
  totalReserves: number
  utilizationRate: number
  collateralFactor: number
  liquidationThreshold: number
  reserveFactor: number
  userSupplied?: number
  userBorrowed?: number
  priceHistory: Array<{ timestamp: number; price: number }>
  apyHistory: Array<{ timestamp: number; supplyAPY: number; borrowAPY: number }>
}

interface MarketInsightsCardProps {
  markets: MarketData[]
  isDemoMode: boolean
  isLoading?: boolean
  selectedMarket?: string
  onMarketSelect: (marketId: string) => void
}

export function MarketInsightsCard({ 
  markets, 
  isDemoMode, 
  isLoading = false,
  selectedMarket,
  onMarketSelect
}: MarketInsightsCardProps) {
  const [activeTab, setActiveTab] = useState("overview")
  
  const currentMarket = selectedMarket 
    ? markets.find(m => m.id === selectedMarket) 
    : markets[0]

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Market Insights</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted rounded w-1/3"></div>
            <div className="h-32 bg-muted rounded"></div>
            <div className="h-20 bg-muted rounded"></div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!currentMarket) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Market Insights</CardTitle>
        </CardHeader>
        <CardContent className="text-center py-8">
          <BarChart3 className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">No market data available</p>
        </CardContent>
      </Card>
    )
  }

  const getUtilizationColor = (rate: number) => {
    if (rate < 70) return "text-green-500"
    if (rate < 85) return "text-yellow-500"
    return "text-red-500"
  }

  const formatPercentage = (value: number, decimals: number = 2) => {
    return `${value.toFixed(decimals)}%`
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            Market Insights
            {isDemoMode && (
              <Badge variant="outline" className="text-xs">Demo</Badge>
            )}
          </CardTitle>
          
          {/* Market Selector */}
          <div className="flex gap-1">
            {markets.slice(0, 4).map((market) => (
              <Button
                key={market.id}
                variant={selectedMarket === market.id ? "default" : "ghost"}
                size="sm"
                onClick={() => onMarketSelect(market.id)}
                className="h-7 px-2"
              >
                <Image
                  src={market.asset.icon}
                  alt={market.asset.symbol}
                  width={16}
                  height={16}
                  className="mr-1"
                />
                <span className="text-xs">{market.asset.symbol}</span>
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="apy">APY Details</TabsTrigger>
            <TabsTrigger value="risk">Risk Metrics</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            {/* Asset Header */}
            <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
              <Image
                src={currentMarket.asset.icon}
                alt={currentMarket.asset.name}
                width={40}
                height={40}
                className="rounded-full"
              />
              <div>
                <h3 className="font-semibold">{currentMarket.asset.name}</h3>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{currentMarket.asset.symbol}</span>
                  <Badge variant="outline" className="text-xs">
                    {currentMarket.asset.chain}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Market Metrics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 border rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Supply APY</p>
                <p className="text-lg font-semibold text-green-600">
                  {formatPercentage(currentMarket.supplyAPY)}
                </p>
                <div className="flex items-center justify-center text-xs text-green-600">
                  <TrendingUp className="h-3 w-3 mr-1" />
                  +0.3% 24h
                </div>
              </div>

              <div className="text-center p-3 border rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Borrow APY</p>
                <p className="text-lg font-semibold text-red-600">
                  {formatPercentage(currentMarket.borrowAPY)}
                </p>
                <div className="flex items-center justify-center text-xs text-red-600">
                  <TrendingUp className="h-3 w-3 mr-1" />
                  +0.1% 24h
                </div>
              </div>

              <div className="text-center p-3 border rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Total Supplied</p>
                <p className="text-lg font-semibold">
                  <AnimatedCounter 
                    value={currentMarket.totalSupplied} 
                    prefix="$" 
                    duration={0.8}
                  />
                </p>
              </div>

              <div className="text-center p-3 border rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Total Borrowed</p>
                <p className="text-lg font-semibold">
                  <AnimatedCounter 
                    value={currentMarket.totalBorrowed} 
                    prefix="$" 
                    duration={0.8}
                  />
                </p>
              </div>
            </div>

            {/* Utilization Rate */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Utilization Rate</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs max-w-xs">
                        Percentage of supplied assets that are currently borrowed
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <span className={cn("text-sm font-medium", getUtilizationColor(currentMarket.utilizationRate))}>
                  {formatPercentage(currentMarket.utilizationRate)}
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className={cn(
                    "h-full transition-all duration-300",
                    currentMarket.utilizationRate < 70 ? "bg-green-500" :
                    currentMarket.utilizationRate < 85 ? "bg-yellow-500" : "bg-red-500"
                  )}
                  style={{ width: `${currentMarket.utilizationRate}%` }}
                />
              </div>
            </div>

            {/* User Position (if any) */}
            {(currentMarket.userSupplied || currentMarket.userBorrowed) && (
              <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <h4 className="font-medium mb-2 text-blue-700">Your Position</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {currentMarket.userSupplied && (
                    <div>
                      <p className="text-muted-foreground">Supplied</p>
                      <p className="font-medium text-green-600">
                        ${currentMarket.userSupplied.toLocaleString()}
                      </p>
                    </div>
                  )}
                  {currentMarket.userBorrowed && (
                    <div>
                      <p className="text-muted-foreground">Borrowed</p>
                      <p className="font-medium text-red-600">
                        ${currentMarket.userBorrowed.toLocaleString()}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </TabsContent>

          {/* APY Details Tab */}
          <TabsContent value="apy" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Supply APY Breakdown */}
              <div className="space-y-3">
                <h4 className="font-medium text-green-600">Supply APY Breakdown</h4>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Base APY</span>
                    <span className="font-medium">{formatPercentage(currentMarket.supplyAPY * 0.7)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Reward APY</span>
                    <span className="font-medium text-green-600">{formatPercentage(currentMarket.supplyAPY * 0.3)}</span>
                  </div>
                  <div className="border-t pt-2 flex justify-between text-sm font-medium">
                    <span>Total Supply APY</span>
                    <span className="text-green-600">{formatPercentage(currentMarket.supplyAPY)}</span>
                  </div>
                </div>

                {/* APY History Chart */}
                <div className="h-32 border rounded p-2">
                  <MiniChart 
                    data={currentMarket.apyHistory.map((item, index) => ({ day: index, value: item.supplyAPY }))}
                    color="#22c55e"
                    height={100}
                  />
                </div>
              </div>

              {/* Borrow APY Breakdown */}
              <div className="space-y-3">
                <h4 className="font-medium text-red-600">Borrow APY Breakdown</h4>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Base APY</span>
                    <span className="font-medium">{formatPercentage(currentMarket.borrowAPY * 0.8)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Reserve Factor</span>
                    <span className="font-medium">{formatPercentage(currentMarket.borrowAPY * 0.2)}</span>
                  </div>
                  <div className="border-t pt-2 flex justify-between text-sm font-medium">
                    <span>Total Borrow APY</span>
                    <span className="text-red-600">{formatPercentage(currentMarket.borrowAPY)}</span>
                  </div>
                </div>

                {/* APY History Chart */}
                <div className="h-32 border rounded p-2">
                  <MiniChart 
                    data={currentMarket.apyHistory.map((item, index) => ({ day: index, value: item.borrowAPY }))}
                    color="#ef4444"
                    height={100}
                  />
                </div>
              </div>
            </div>

            {/* APY Factors */}
            <div className="p-3 bg-muted/30 rounded-lg">
              <h4 className="font-medium mb-2">Factors Affecting APY</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <Users className="h-3 w-3 text-blue-500" />
                  <span>Utilization Rate: {formatPercentage(currentMarket.utilizationRate)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <DollarSign className="h-3 w-3 text-green-500" />
                  <span>Reserve Factor: {formatPercentage(currentMarket.reserveFactor)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Zap className="h-3 w-3 text-purple-500" />
                  <span>Protocol Rewards</span>
                </div>
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-3 w-3 text-orange-500" />
                  <span>Market Dynamics</span>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Risk Metrics Tab */}
          <TabsContent value="risk" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <h4 className="font-medium">Collateral Parameters</h4>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Collateral Factor</span>
                    <span className="font-medium">{formatPercentage(currentMarket.collateralFactor)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Liquidation Threshold</span>
                    <span className="font-medium text-orange-600">
                      {formatPercentage(currentMarket.liquidationThreshold)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Liquidation Penalty</span>
                    <span className="font-medium text-red-600">5.00%</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium">Risk Assessment</h4>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Volatility Risk</span>
                    <Badge variant="secondary" className="text-xs">Medium</Badge>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Liquidity Risk</span>
                    <Badge variant="default" className="text-xs">Low</Badge>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Smart Contract Risk</span>
                    <Badge variant="default" className="text-xs">Low</Badge>
                  </div>
                </div>
              </div>
            </div>

            {/* Risk Warnings */}
            <div className="space-y-2">
              <h4 className="font-medium text-orange-600">Risk Considerations</h4>
              <div className="text-xs text-muted-foreground space-y-1">
                <p>• Asset prices can be volatile and may result in liquidation</p>
                <p>• High utilization rates may affect withdrawal availability</p>
                <p>• Smart contract risks exist despite audits</p>
                <p>• Interest rates are variable and subject to market conditions</p>
              </div>
            </div>

            {/* Historical Performance */}
            <div className="space-y-2">
              <h4 className="font-medium">Historical Performance (30d)</h4>
              <div className="grid grid-cols-3 gap-4 text-xs">
                <div className="text-center p-2 border rounded">
                  <p className="text-muted-foreground mb-1">Avg Supply APY</p>
                  <p className="font-medium text-green-600">
                    {formatPercentage(currentMarket.supplyAPY * 0.95)}
                  </p>
                </div>
                <div className="text-center p-2 border rounded">
                  <p className="text-muted-foreground mb-1">Avg Borrow APY</p>
                  <p className="font-medium text-red-600">
                    {formatPercentage(currentMarket.borrowAPY * 1.05)}
                  </p>
                </div>
                <div className="text-center p-2 border rounded">
                  <p className="text-muted-foreground mb-1">Avg Utilization</p>
                  <p className="font-medium">
                    {formatPercentage(currentMarket.utilizationRate * 0.9)}
                  </p>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Demo Mode Notice */}
        {isDemoMode && (
          <div className="mt-4 p-2 bg-blue-500/10 border border-blue-500/20 rounded text-xs text-blue-700">
            Demo Mode: Market data is simulated. Live mode will show real-time market metrics.
          </div>
        )}
      </CardContent>
    </Card>
  )
} 
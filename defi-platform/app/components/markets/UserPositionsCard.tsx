"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  Shield, 
  DollarSign,
  Info,
  ArrowUpRight,
  ArrowDownRight,
  ChevronRight,
  Zap,
  Target
} from "lucide-react"
import Image from "next/image"
import { cn } from "@/lib/utils"
import { AnimatedCounter } from "../ui/ChartComponents"

export interface UserPosition {
  id: string
  asset: {
    name: string
    symbol: string
    icon: string
    chain: string
    contractAddress?: `0x${string}` // For smart contract integration
    pTokenAddress?: `0x${string}`   // For pToken contract calls
  }
  type: "supply" | "borrow"
  amount: number
  amountUSD: number
  apy: number
  startDate: string
  accruedInterest: number
  accruedInterestUSD: number
  healthFactor?: number
  liquidationPrice?: number
  collateralEnabled?: boolean
}

interface UserPositionsCardProps {
  positions: UserPosition[]
  isDemoMode: boolean
  isLoading?: boolean
  onManagePosition: (position: UserPosition) => void
  onToggleCollateral?: (positionId: string) => void
}

export function UserPositionsCard({ 
  positions, 
  isDemoMode, 
  isLoading = false,
  onManagePosition,
  onToggleCollateral 
}: UserPositionsCardProps) {
  const [activeTab, setActiveTab] = useState<"all" | "supply" | "borrow">("all")
  
  const supplyPositions = positions.filter(p => p.type === "supply")
  const borrowPositions = positions.filter(p => p.type === "borrow")
  
  const totalSupplied = supplyPositions.reduce((sum, p) => sum + p.amountUSD, 0)
  const totalBorrowed = borrowPositions.reduce((sum, p) => sum + p.amountUSD, 0)
  const totalInterestEarned = supplyPositions.reduce((sum, p) => sum + p.accruedInterestUSD, 0)
  const totalInterestPaid = borrowPositions.reduce((sum, p) => sum + p.accruedInterestUSD, 0)
  
  const netPosition = totalSupplied - totalBorrowed
  const netInterest = totalInterestEarned - totalInterestPaid
  
  // Calculate weighted average APYs
  const avgSupplyAPY = totalSupplied > 0 
    ? supplyPositions.reduce((sum, p) => sum + (p.apy * p.amountUSD), 0) / totalSupplied 
    : 0
  const avgBorrowAPY = totalBorrowed > 0 
    ? borrowPositions.reduce((sum, p) => sum + (p.apy * p.amountUSD), 0) / totalBorrowed 
    : 0

  const filteredPositions = activeTab === "all" 
    ? positions 
    : positions.filter(p => p.type === activeTab)

  const getHealthFactorColor = (healthFactor?: number) => {
    if (!healthFactor) return "text-muted-foreground"
    if (healthFactor >= 2) return "text-emerald-400"
    if (healthFactor >= 1.5) return "text-yellow-400"
    if (healthFactor >= 1.2) return "text-orange-400"
    return "text-red-400"
  }

  const getHealthFactorLabel = (healthFactor?: number) => {
    if (!healthFactor) return "Safe"
    if (healthFactor >= 2) return "Very Safe"
    if (healthFactor >= 1.5) return "Safe"
    if (healthFactor >= 1.2) return "Moderate Risk"
    return "High Risk"
  }

  if (isLoading) {
    return (
      <Card className="bg-black/20 dark:bg-black/40 backdrop-blur-xl border border-emerald-500/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-emerald-100">
            <Target className="h-4 w-4 text-emerald-500" />
            Your Positions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-16 bg-emerald-500/5 rounded-lg border border-emerald-500/10"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (positions.length === 0) {
    return (
      <Card className="bg-black/20 dark:bg-black/40 backdrop-blur-xl border border-emerald-500/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-emerald-100">
            <Target className="h-4 w-4 text-emerald-500" />
            Your Positions
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 bg-emerald-500/10 rounded-full flex items-center justify-center border border-emerald-500/20">
            <DollarSign className="h-8 w-8 text-emerald-500" />
          </div>
          <h3 className="font-medium mb-2 text-emerald-100">No Active Positions</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Start lending or borrowing to track your positions
          </p>
          {isDemoMode && (
            <Badge variant="outline" className="text-xs border-emerald-500/30 text-emerald-400 bg-emerald-500/10">
              Demo Mode
            </Badge>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="bg-black/20 dark:bg-black/40 backdrop-blur-xl border border-emerald-500/20 shadow-lg shadow-emerald-500/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-emerald-100">
            <Target className="h-4 w-4 text-emerald-500" />
            Your Positions
            {isDemoMode && (
              <Badge variant="outline" className="text-xs border-emerald-500/30 text-emerald-400 bg-emerald-500/10">
                Demo
              </Badge>
            )}
          </CardTitle>
          
          {/* Compact Tab Pills */}
          <div className="flex gap-1 bg-black/30 p-1 rounded-lg border border-emerald-500/20">
            {[
              { key: "all", label: "All", count: positions.length },
              { key: "supply", label: "Supply", count: supplyPositions.length },
              { key: "borrow", label: "Borrow", count: borrowPositions.length }
            ].map((tab) => (
              <Button
                key={tab.key}
                variant={activeTab === tab.key ? "default" : "ghost"}
                size="sm"
                onClick={() => setActiveTab(tab.key as any)}
                className={cn(
                  "h-6 px-2 text-xs font-medium transition-all",
                  activeTab === tab.key 
                    ? "bg-emerald-500/20 text-emerald-100 border-emerald-500/30" 
                    : "text-muted-foreground hover:text-emerald-300 hover:bg-emerald-500/5"
                )}
              >
                {tab.label} ({tab.count})
              </Button>
            ))}
          </div>
        </div>
        
        {/* Compact Stats Row */}
        <div className="grid grid-cols-3 gap-3 mt-3">
          <div className="bg-emerald-500/5 rounded-lg p-3 border border-emerald-500/20">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-3 w-3 text-emerald-400" />
              <span className="text-xs text-emerald-300">Supplied</span>
            </div>
            <p className="text-lg font-bold text-emerald-100">
              <AnimatedCounter value={totalSupplied} prefix="$" duration={0.8} />
            </p>
            <p className="text-xs text-emerald-400">{avgSupplyAPY.toFixed(2)}% APY</p>
          </div>
          
          <div className="bg-red-500/5 rounded-lg p-3 border border-red-500/20">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="h-3 w-3 text-red-400" />
              <span className="text-xs text-red-300">Borrowed</span>
            </div>
            <p className="text-lg font-bold text-red-100">
              <AnimatedCounter value={totalBorrowed} prefix="$" duration={0.8} />
            </p>
            <p className="text-xs text-red-400">{avgBorrowAPY.toFixed(2)}% APY</p>
          </div>
          
          <div className="bg-purple-500/5 rounded-lg p-3 border border-purple-500/20">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="h-3 w-3 text-purple-400" />
              <span className="text-xs text-purple-300">Net</span>
            </div>
            <p className={cn("text-lg font-bold", netPosition >= 0 ? "text-emerald-100" : "text-red-100")}>
              <AnimatedCounter value={Math.abs(netPosition)} prefix={netPosition >= 0 ? "$" : "-$"} duration={0.8} />
            </p>
            <p className="text-xs text-muted-foreground">
              {netPosition >= 0 ? "Lender" : "Borrower"}
            </p>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0 space-y-2">
        {/* Compact Position List */}
        {filteredPositions.map((position, index) => (
          <div
            key={position.id}
            className={cn(
              "group relative bg-card/20 backdrop-blur-sm border rounded-lg p-3 transition-all hover:bg-card/30 hover:border-emerald-500/30 cursor-pointer",
              "border-border/30 hover:shadow-lg hover:shadow-emerald-500/5"
            )}
            onClick={() => onManagePosition(position)}
          >
            {/* Position Header */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Image
                    src={position.asset.icon}
                    alt={position.asset.name}
                    width={24}
                    height={24}
                    className="rounded-full border border-emerald-500/20"
                  />
                  <div className={cn(
                    "absolute -top-1 -right-1 w-3 h-3 rounded-full flex items-center justify-center",
                    position.type === "supply" 
                      ? "bg-emerald-500" 
                      : "bg-red-500"
                  )}>
                    {position.type === "supply" ? (
                      <ArrowUpRight className="h-1.5 w-1.5 text-white" />
                    ) : (
                      <ArrowDownRight className="h-1.5 w-1.5 text-white" />
                    )}
                  </div>
                </div>
                
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{position.asset.symbol}</span>
                    <Badge variant="outline" className="text-xs h-4 px-1 border-emerald-500/30 text-emerald-400">
                      {position.asset.chain}
                    </Badge>
                    {position.type === "supply" && position.collateralEnabled && (
                      <Badge className="text-xs h-4 px-1 bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
                        Collateral
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{position.amount.toLocaleString()} {position.asset.symbol}</span>
                    <span>•</span>
                    <span className={cn(
                      "font-medium",
                      position.type === "supply" ? "text-emerald-400" : "text-red-400"
                    )}>
                      {position.apy.toFixed(2)}% APY
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="text-right">
                <p className="text-sm font-bold">${position.amountUSD.toLocaleString()}</p>
                <p className={cn(
                  "text-xs font-medium",
                  position.type === "supply" ? "text-emerald-400" : "text-red-400"
                )}>
                  {position.type === "supply" ? "+" : "-"}${position.accruedInterestUSD.toFixed(2)}
                </p>
              </div>
              
              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-emerald-400 transition-colors" />
            </div>
            
            {/* Health Factor Warning */}
            {position.type === "borrow" && position.healthFactor && position.healthFactor < 1.5 && (
              <div className="flex items-center gap-2 mt-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded">
                <AlertTriangle className="h-3 w-3 text-amber-500" />
                <span className="text-xs text-amber-300">
                  Health Factor: {position.healthFactor.toFixed(2)} - {getHealthFactorLabel(position.healthFactor)}
                </span>
              </div>
            )}
            
                         {/* Progress bar for health factor */}
             {position.type === "borrow" && position.healthFactor && (
               <div className="mt-2">
                 <div className="w-full bg-red-500/20 rounded-full h-1">
                   <div 
                     className={cn(
                       "h-1 rounded-full transition-all",
                       position.healthFactor >= 2 ? "bg-emerald-500" :
                       position.healthFactor >= 1.5 ? "bg-yellow-500" :
                       position.healthFactor >= 1.2 ? "bg-orange-500" : "bg-red-500"
                     )}
                     style={{ width: `${Math.min(position.healthFactor * 50, 100)}%` }}
                   />
                 </div>
               </div>
             )}
          </div>
        ))}
      </CardContent>
    </Card>
  )
} 
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
  ArrowDownRight
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
    if (healthFactor >= 2) return "text-green-500"
    if (healthFactor >= 1.5) return "text-yellow-500"
    if (healthFactor >= 1.2) return "text-orange-500"
    return "text-red-500"
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
      <Card>
        <CardHeader>
          <CardTitle>Your Positions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted rounded w-1/3"></div>
            <div className="h-20 bg-muted rounded"></div>
            <div className="h-20 bg-muted rounded"></div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (positions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Your Positions</CardTitle>
        </CardHeader>
        <CardContent className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 bg-muted rounded-full flex items-center justify-center">
            <DollarSign className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="font-medium mb-2">No Positions Yet</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Start lending or borrowing to see your positions here
          </p>
          {isDemoMode && (
            <Badge variant="outline" className="text-xs">
              Demo Mode - Sample data will appear here in live mode
            </Badge>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            Your Positions
            {isDemoMode && (
              <Badge variant="outline" className="text-xs">Demo</Badge>
            )}
          </CardTitle>
          <div className="flex gap-1">
            <Button
              variant={activeTab === "all" ? "default" : "ghost"}
              size="sm"
              onClick={() => setActiveTab("all")}
              className="h-7 px-2 text-xs"
            >
              All ({positions.length})
            </Button>
            <Button
              variant={activeTab === "supply" ? "default" : "ghost"}
              size="sm"
              onClick={() => setActiveTab("supply")}
              className="h-7 px-2 text-xs"
            >
              Supply ({supplyPositions.length})
            </Button>
            <Button
              variant={activeTab === "borrow" ? "default" : "ghost"}
              size="sm"
              onClick={() => setActiveTab("borrow")}
              className="h-7 px-2 text-xs"
            >
              Borrow ({borrowPositions.length})
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Position Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted/30 rounded-lg">
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-1">Total Supplied</p>
            <p className="font-semibold text-green-600">
              <AnimatedCounter value={totalSupplied} prefix="$" duration={0.8} />
            </p>
            <p className="text-xs text-green-600">
              {avgSupplyAPY.toFixed(2)}% APY
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-1">Total Borrowed</p>
            <p className="font-semibold text-red-600">
              <AnimatedCounter value={totalBorrowed} prefix="$" duration={0.8} />
            </p>
            <p className="text-xs text-red-600">
              {avgBorrowAPY.toFixed(2)}% APY
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-1">Net Position</p>
            <p className={cn("font-semibold", netPosition >= 0 ? "text-green-600" : "text-red-600")}>
              <AnimatedCounter value={Math.abs(netPosition)} prefix={netPosition >= 0 ? "$" : "-$"} duration={0.8} />
            </p>
            <p className="text-xs text-muted-foreground">
              {netPosition >= 0 ? "Net Lender" : "Net Borrower"}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-1">Net Interest</p>
            <p className={cn("font-semibold", netInterest >= 0 ? "text-green-600" : "text-red-600")}>
              <AnimatedCounter value={Math.abs(netInterest)} prefix={netInterest >= 0 ? "$" : "-$"} duration={0.8} />
            </p>
            <p className="text-xs text-muted-foreground">
              {netInterest >= 0 ? "Earned" : "Paid"}
            </p>
          </div>
        </div>

        {/* Individual Positions */}
        <div className="space-y-3">
          {filteredPositions.map((position) => (
            <div
              key={position.id}
              className="border rounded-lg p-4 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Image
                      src={position.asset.icon}
                      alt={position.asset.name}
                      width={32}
                      height={32}
                      className="rounded-full"
                    />
                    <div className={cn(
                      "absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-xs",
                      position.type === "supply" 
                        ? "bg-green-500 text-white" 
                        : "bg-red-500 text-white"
                    )}>
                      {position.type === "supply" ? (
                        <ArrowUpRight className="h-2 w-2" />
                      ) : (
                        <ArrowDownRight className="h-2 w-2" />
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium">{position.asset.symbol}</h4>
                      <Badge variant="outline" className="text-xs">
                        {position.asset.chain}
                      </Badge>
                      {position.type === "supply" && (
                        <Badge 
                          variant={position.collateralEnabled ? "default" : "secondary"}
                          className="text-xs"
                        >
                          {position.collateralEnabled ? "Collateral" : "Not Collateral"}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{position.asset.name}</p>
                  </div>
                </div>
                
                <div className="text-right">
                  <p className="font-semibold">
                    {position.amount.toLocaleString()} {position.asset.symbol}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    ${position.amountUSD.toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground mb-1">APY</p>
                  <div className="flex items-center gap-1">
                    <span className={cn(
                      "font-medium",
                      position.type === "supply" ? "text-green-600" : "text-red-600"
                    )}>
                      {position.apy.toFixed(2)}%
                    </span>
                    {position.type === "supply" ? (
                      <TrendingUp className="h-3 w-3 text-green-600" />
                    ) : (
                      <TrendingDown className="h-3 w-3 text-red-600" />
                    )}
                  </div>
                </div>

                <div>
                  <p className="text-muted-foreground mb-1">
                    {position.type === "supply" ? "Interest Earned" : "Interest Paid"}
                  </p>
                  <p className={cn(
                    "font-medium",
                    position.type === "supply" ? "text-green-600" : "text-red-600"
                  )}>
                    ${position.accruedInterestUSD.toFixed(2)}
                  </p>
                </div>

                <div>
                  <p className="text-muted-foreground mb-1">Duration</p>
                  <p className="font-medium">
                    {Math.ceil((Date.now() - new Date(position.startDate).getTime()) / (1000 * 60 * 60 * 24))} days
                  </p>
                </div>

                <div>
                  {position.type === "borrow" && position.healthFactor && (
                    <>
                      <div className="flex items-center gap-1 mb-1">
                        <p className="text-muted-foreground">Health Factor</p>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs max-w-xs">
                              Health factor indicates liquidation risk. Below 1.0 means liquidation.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={cn("font-medium", getHealthFactorColor(position.healthFactor))}>
                          {position.healthFactor.toFixed(2)}
                        </span>
                        {position.healthFactor < 1.5 && (
                          <AlertTriangle className="h-3 w-3 text-orange-500" />
                        )}
                        {position.healthFactor >= 2 && (
                          <Shield className="h-3 w-3 text-green-500" />
                        )}
                      </div>
                      <p className={cn("text-xs", getHealthFactorColor(position.healthFactor))}>
                        {getHealthFactorLabel(position.healthFactor)}
                      </p>
                    </>
                  )}
                  {position.type === "supply" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onToggleCollateral?.(position.id)}
                      className="h-auto p-1 text-xs"
                    >
                      {position.collateralEnabled ? "Disable Collateral" : "Enable Collateral"}
                    </Button>
                  )}
                </div>
              </div>

              {/* Liquidation Warning for High Risk Positions */}
              {position.type === "borrow" && position.healthFactor && position.healthFactor < 1.5 && (
                <div className="mt-3 p-2 bg-orange-500/10 border border-orange-500/20 rounded flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-500 flex-shrink-0" />
                  <div className="text-xs">
                    <p className="font-medium text-orange-700">Liquidation Risk Warning</p>
                    <p className="text-orange-600">
                      Your position is at risk. Consider adding more collateral or repaying part of your loan.
                      {position.liquidationPrice && (
                        <> Liquidation price: ${position.liquidationPrice.toFixed(2)}</>
                      )}
                    </p>
                  </div>
                </div>
              )}

              <div className="mt-3 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onManagePosition(position)}
                  className="text-xs"
                >
                  {position.type === "supply" ? "Withdraw" : "Repay"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onManagePosition(position)}
                  className="text-xs"
                >
                  {position.type === "supply" ? "Add More" : "Borrow More"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
} 
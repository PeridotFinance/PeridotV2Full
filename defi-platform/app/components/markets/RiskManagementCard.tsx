"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { 
  AlertTriangle, 
  Shield, 
  Activity,
  Info,
  TrendingDown,
  Zap
} from "lucide-react"
import { cn } from "@/lib/utils"
import { AnimatedCounter } from "../ui/ChartComponents"

interface RiskData {
  healthFactor: number | null
  liquidationRisk: "low" | "medium" | "high" | null
  totalCollateral: number
  totalBorrowed: number
  borrowLimit: number
  borrowLimitUsed: number // percentage
  liquidationThreshold: number // percentage
  priceImpactRisk: "low" | "medium" | "high"
}

interface RiskManagementCardProps {
  riskData: RiskData
  isDemoMode: boolean
  isLoading?: boolean
  onAddCollateral?: () => void
  onRepayDebt?: () => void
}

export function RiskManagementCard({ 
  riskData, 
  isDemoMode, 
  isLoading = false,
  onAddCollateral,
  onRepayDebt
}: RiskManagementCardProps) {
  
  const getHealthFactorColor = (healthFactor: number | null) => {
    if (!healthFactor) return "text-muted-foreground"
    if (healthFactor >= 2) return "text-green-500"
    if (healthFactor >= 1.5) return "text-yellow-500"
    if (healthFactor >= 1.2) return "text-orange-500"
    return "text-red-500"
  }

  const getHealthFactorBgColor = (healthFactor: number | null) => {
    if (!healthFactor) return "bg-muted/30"
    if (healthFactor >= 2) return "bg-green-500/10"
    if (healthFactor >= 1.5) return "bg-yellow-500/10"
    if (healthFactor >= 1.2) return "bg-orange-500/10"
    return "bg-red-500/10"
  }

  const getRiskBadgeVariant = (risk: "low" | "medium" | "high" | null) => {
    switch (risk) {
      case "low": return "default"
      case "medium": return "secondary"
      case "high": return "destructive"
      default: return "outline"
    }
  }

  const getRiskIcon = (risk: "low" | "medium" | "high" | null) => {
    switch (risk) {
      case "low": return <Shield className="h-4 w-4" />
      case "medium": return <Activity className="h-4 w-4" />
      case "high": return <AlertTriangle className="h-4 w-4" />
      default: return <Shield className="h-4 w-4" />
    }
  }

  const getBorrowLimitColor = (used: number) => {
    if (used < 50) return "bg-green-500"
    if (used < 75) return "bg-yellow-500"
    if (used < 90) return "bg-orange-500"
    return "bg-red-500"
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Risk Management</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted rounded w-1/2"></div>
            <div className="h-16 bg-muted rounded"></div>
            <div className="h-16 bg-muted rounded"></div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            Risk Management
            {isDemoMode && (
              <Badge variant="outline" className="text-xs">Demo</Badge>
            )}
          </CardTitle>
          {riskData.liquidationRisk && (
            <Badge variant={getRiskBadgeVariant(riskData.liquidationRisk)} className="text-xs">
              {getRiskIcon(riskData.liquidationRisk)}
              <span className="ml-1 capitalize">{riskData.liquidationRisk} Risk</span>
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Health Factor Section */}
        {riskData.healthFactor !== null && (
          <div className={cn(
            "p-4 rounded-lg border",
            getHealthFactorBgColor(riskData.healthFactor)
          )}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h3 className="font-medium">Health Factor</h3>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="text-xs max-w-xs space-y-1">
                      <p>Health factor indicates your position's safety:</p>
                      <p>• Above 2.0: Very Safe</p>
                      <p>• 1.5-2.0: Safe</p>
                      <p>• 1.2-1.5: Moderate Risk</p>
                      <p>• Below 1.2: High Risk</p>
                      <p>• Below 1.0: Liquidation occurs</p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="text-right">
                <span className={cn("text-2xl font-bold", getHealthFactorColor(riskData.healthFactor))}>
                  {riskData.healthFactor.toFixed(2)}
                </span>
              </div>
            </div>
            
            {/* Health Factor Visual Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Liquidation</span>
                <span>Safe Zone</span>
              </div>
              <div className="relative h-2 bg-muted rounded-full overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-red-500 via-orange-500 via-yellow-500 to-green-500"></div>
                <div 
                  className="absolute top-0 h-full w-1 bg-white border border-gray-800 rounded-full"
                  style={{ left: `${Math.min(Math.max((riskData.healthFactor - 1) * 50, 0), 95)}%` }}
                ></div>
              </div>
              <div className="flex justify-between text-xs">
                <span>1.0</span>
                <span>2.0+</span>
              </div>
            </div>

            {/* Warnings */}
            {riskData.healthFactor < 1.5 && (
              <div className="mt-3 p-2 bg-orange-500/10 border border-orange-500/20 rounded flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-orange-500 flex-shrink-0" />
                <div className="text-xs">
                  {riskData.healthFactor < 1.2 ? (
                    <p className="text-orange-700 font-medium">
                      Critical: Your position is at high risk of liquidation. Take action immediately.
                    </p>
                  ) : (
                    <p className="text-orange-700">
                      Warning: Your position is approaching risky levels. Consider adding collateral.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Borrow Limit Usage */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">Borrow Limit Usage</h3>
            <span className="text-sm font-medium">
              {riskData.borrowLimitUsed.toFixed(1)}% Used
            </span>
          </div>
          
          <div className="space-y-2">
            <Progress 
              value={riskData.borrowLimitUsed} 
              className="h-2"
              style={{
                backgroundColor: "rgb(var(--muted))"
              }}
            >
              <div 
                className={cn("h-full transition-all", getBorrowLimitColor(riskData.borrowLimitUsed))}
                style={{ width: `${riskData.borrowLimitUsed}%` }}
              />
            </Progress>
            
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>$0</span>
              <span>${riskData.borrowLimit.toLocaleString()}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Total Borrowed</p>
              <p className="font-medium">
                <AnimatedCounter value={riskData.totalBorrowed} prefix="$" duration={0.8} />
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Available to Borrow</p>
              <p className="font-medium text-green-600">
                <AnimatedCounter 
                  value={riskData.borrowLimit - riskData.totalBorrowed} 
                  prefix="$" 
                  duration={0.8} 
                />
              </p>
            </div>
          </div>
        </div>

        {/* Risk Factors */}
        <div className="space-y-3">
          <h3 className="font-medium">Risk Factors</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-3 border rounded-lg">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">Liquidation Threshold</span>
                <span className="text-sm">{riskData.liquidationThreshold}%</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Your loan will be liquidated if collateral value drops below this threshold
              </p>
            </div>
            
            <div className="p-3 border rounded-lg">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">Price Impact Risk</span>
                <Badge variant={getRiskBadgeVariant(riskData.priceImpactRisk)} className="text-xs">
                  {riskData.priceImpactRisk}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Risk of significant losses due to asset price volatility
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        {(riskData.healthFactor && riskData.healthFactor < 2) || riskData.borrowLimitUsed > 75 ? (
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-orange-700">Recommended Actions</h4>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onAddCollateral}
                className="flex-1"
              >
                <Zap className="h-4 w-4 mr-2" />
                Add Collateral
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onRepayDebt}
                className="flex-1"
              >
                <TrendingDown className="h-4 w-4 mr-2" />
                Repay Debt
              </Button>
            </div>
          </div>
        ) : (
          <div className="p-3 bg-green-500/10 border border-green-500/20 rounded flex items-center gap-2">
            <Shield className="h-4 w-4 text-green-500" />
            <p className="text-sm text-green-700">
              Your position is healthy. No immediate action required.
            </p>
          </div>
        )}

        {/* Demo Mode Notice */}
        {isDemoMode && (
          <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded">
            <p className="text-xs text-blue-700">
              Demo Mode: Risk calculations are simulated. In live mode, real-time oracle prices and contract data will be used.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
} 
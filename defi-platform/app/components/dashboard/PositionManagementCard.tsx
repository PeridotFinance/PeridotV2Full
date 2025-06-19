import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { 
  Users, 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  Zap, 
  Info,
  ArrowUpDown,
  Plus,
  Minus,
  Eye
} from "lucide-react"
import { AnimatedCard } from "../ui/ChartComponents"
import type { UserPosition } from "../markets/UserPositionsCard"
import { cn } from "@/lib/utils"

interface PositionManagementCardProps {
  userPositions: UserPosition[]
  isDemoMode: boolean
  userHealthFactor?: number
  onNavigateToPortfolio: () => void
  onOpenSupplyModal: () => void
  onOpenBorrowModal: () => void
}

export function PositionManagementCard({
  userPositions,
  isDemoMode,
  userHealthFactor,
  onNavigateToPortfolio,
  onOpenSupplyModal,
  onOpenBorrowModal
}: PositionManagementCardProps) {
  // Don't render if no positions
  if (userPositions.length === 0) {
    return null
  }

  const supplyPositions = userPositions.filter(p => p.type === "supply")
  const borrowPositions = userPositions.filter(p => p.type === "borrow")
  const totalSuppliedUSD = supplyPositions.reduce((sum, p) => sum + p.amountUSD, 0)
  const totalBorrowedUSD = borrowPositions.reduce((sum, p) => sum + p.amountUSD, 0)

  // Calculate weighted average APY for supply positions
  const weightedSupplyAPY = supplyPositions.length > 0 
    ? supplyPositions.reduce((sum, p) => sum + (p.apy * p.amountUSD), 0) / totalSuppliedUSD 
    : 0

  // Calculate borrow limit (80% of collateral)
  const borrowLimit = totalSuppliedUSD * 0.8
  const borrowUtilization = borrowLimit > 0 ? (totalBorrowedUSD / borrowLimit) * 100 : 0

  const getHealthFactorColor = (factor?: number) => {
    if (!factor) return "text-emerald-400"
    if (factor >= 2) return "text-emerald-400"
    if (factor >= 1.5) return "text-yellow-400"
    if (factor >= 1.2) return "text-orange-400"
    return "text-red-400"
  }

  const getHealthFactorBg = (factor?: number) => {
    if (!factor) return "bg-emerald-500/10 border-emerald-500/20"
    if (factor >= 2) return "bg-emerald-500/10 border-emerald-500/20"
    if (factor >= 1.5) return "bg-yellow-500/10 border-yellow-500/20"
    if (factor >= 1.2) return "bg-orange-500/10 border-orange-500/20"
    return "bg-red-500/10 border-red-500/20"
  }

  const getUtilizationColor = (utilization: number) => {
    if (utilization < 50) return "from-emerald-500 to-teal-500"
    if (utilization < 75) return "from-yellow-500 to-orange-500"
    return "from-orange-500 to-red-500"
  }

  return (
    <AnimatedCard delay={0.6}>
      <Card className="mb-4 bg-white/[0.02] dark:bg-black/[0.02] backdrop-blur-2xl border border-white/10 dark:border-white/5 shadow-lg shadow-black/10 hover:shadow-xl hover:shadow-black/15 hover:border-white/20 dark:hover:border-white/10 transition-all duration-700 overflow-hidden">
        {/* Glassmorphism overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.08] via-transparent to-transparent dark:from-white/[0.02] pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-emerald-500/[0.02] to-transparent pointer-events-none" />
        
        <CardHeader className="pb-3 relative z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 backdrop-blur-sm">
                <Users className="h-3.5 w-3.5 text-emerald-400" />
              </div>
              <div>
                <CardTitle className="text-sm font-medium text-gray-900 dark:text-white">Portfolio</CardTitle>
                {isDemoMode && (
                  <Badge variant="outline" className="text-xs h-4 px-1.5 mt-0.5 border-emerald-500/30 text-emerald-400 bg-emerald-500/5">Demo</Badge>
                )}
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3 w-3 text-emerald-400/60 hover:text-emerald-400 cursor-help transition-colors" />
                </TooltipTrigger>
                <TooltipContent 
                  side="top" 
                  className="max-w-xs bg-black/40 backdrop-blur-xl border border-emerald-500/20 shadow-2xl shadow-emerald-500/10 rounded-xl p-4"
                  sideOffset={8}
                >
                  <div className="space-y-2 text-xs">
                    <p className="font-medium text-emerald-300">Portfolio Management</p>
                    <ul className="space-y-1 text-emerald-100/80">
                      <li>• Supply assets to earn interest</li>
                      <li>• Borrow against your collateral</li>
                      <li>• Keep health factor above 1.5</li>
                    </ul>
                  </div>
                </TooltipContent>
              </Tooltip>
            </div>
            <Button 
              size="sm" 
              variant="ghost"
              onClick={onNavigateToPortfolio}
              className="text-xs h-6 px-2 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
            >
              <Eye className="h-3 w-3 mr-1" />
              View
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-4 relative z-10">
          {/* Main Portfolio Layout - Liquid Glass Design */}
          <div className="relative">
            {/* Mobile Layout */}
            <div className="block lg:hidden">
              <div className="flex gap-4 items-center min-h-[160px]">
                {/* Left Side - APY Circle (Mobile) */}
                <div className="flex-shrink-0">
                  <div className="relative">
                    {/* Outer Glow Ring */}
                    <div className="absolute inset-0 rounded-full bg-gradient-to-r from-emerald-500/30 to-teal-500/30 blur-xl animate-pulse" />
                    
                    {/* Main Circle */}
                    <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-emerald-500/[0.15] to-teal-500/[0.08] border-2 border-emerald-500/30 backdrop-blur-xl flex items-center justify-center shadow-2xl shadow-emerald-500/20 hover:shadow-emerald-500/30 transition-all duration-500 group">
                      <div className="absolute inset-0 rounded-full bg-gradient-to-br from-white/[0.12] via-transparent to-transparent dark:from-white/[0.03] pointer-events-none" />
                      <div className="relative z-10 text-center">
                        <div className="text-xs font-medium text-emerald-400 mb-1">SUPPLY APY</div>
                        <div className="text-lg font-bold text-gray-900 dark:text-white">
                          +{weightedSupplyAPY.toFixed(1)}%
                        </div>
                      </div>
                      
                      {/* Rotating Border Effect */}
                      <div className="absolute inset-0 rounded-full bg-gradient-to-r from-emerald-500/50 via-transparent to-emerald-500/50 opacity-0 group-hover:opacity-100 transition-opacity duration-500 animate-spin-slow" style={{ animationDuration: '3s' }} />
                    </div>
                  </div>
                </div>

                {/* Right Side - Stacked Balances (Mobile) */}
                <div className="flex-1 space-y-4">
                  {/* Supply Balance */}
                  <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-emerald-500/[0.08] to-teal-500/[0.04] p-4 backdrop-blur-xl">
                    <div className="absolute inset-0 bg-gradient-to-br from-white/[0.08] via-transparent to-transparent dark:from-white/[0.02] pointer-events-none" />
                    <div className="relative z-10">
                      <h3 className="text-xs font-medium text-emerald-300 uppercase tracking-wide mb-1">SUPPLY BALANCE</h3>
                      <p className="text-xl font-bold text-gray-900 dark:text-white">
                        ${totalSuppliedUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>

                  {/* Borrow Balance */}
                  <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-orange-500/[0.08] to-red-500/[0.04] p-4 backdrop-blur-xl">
                    <div className="absolute inset-0 bg-gradient-to-br from-white/[0.08] via-transparent to-transparent dark:from-white/[0.02] pointer-events-none" />
                    <div className="relative z-10">
                      <h3 className="text-xs font-medium text-orange-300 uppercase tracking-wide mb-1">BORROW BALANCE</h3>
                      <p className="text-xl font-bold text-gray-900 dark:text-white">
                        ${totalBorrowedUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Desktop Layout */}
            <div className="hidden lg:block">
              <div className="grid grid-cols-3 gap-4 items-center min-h-[140px]">
                
                {/* Left Side - Supply */}
                <div className="col-span-1 flex justify-start">
                  {supplyPositions.length > 0 ? (
                    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500/[0.08] to-teal-500/[0.04] p-4 backdrop-blur-xl hover:from-emerald-500/[0.12] hover:to-teal-500/[0.08] transition-all duration-500 group w-full max-w-xs">
                      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.08] via-transparent to-transparent dark:from-white/[0.02] pointer-events-none" />
                      <div className="relative z-10">
                        <div className="text-left space-y-2">
                          <h3 className="text-xs font-medium text-emerald-300 uppercase tracking-wide">SUPPLY BALANCE</h3>
                          <div className="space-y-1">
                            <p className="text-2xl font-bold text-gray-900 dark:text-white">
                              ${totalSuppliedUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                            <p className="text-xs text-emerald-400/80">{totalSuppliedUSD.toFixed(2)} PDOT supplied</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-left text-gray-500 dark:text-gray-400 p-4 w-full max-w-xs">
                      <div className="space-y-2">
                        <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide">SUPPLY BALANCE</h3>
                        <p className="text-2xl font-bold">$0.00</p>
                        <p className="text-xs text-gray-500">0.00 PDOT supplied</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Center - APY Circle */}
                <div className="col-span-1 flex justify-center">
                  <div className="relative">
                    {/* Outer Glow Ring */}
                    <div className="absolute inset-0 rounded-full bg-gradient-to-r from-emerald-500/30 to-teal-500/30 blur-xl animate-pulse" />
                    
                    {/* Main Circle */}
                    <div className="relative w-28 h-28 rounded-full bg-gradient-to-br from-emerald-500/[0.15] to-teal-500/[0.08] border-2 border-emerald-500/30 backdrop-blur-xl flex items-center justify-center shadow-2xl shadow-emerald-500/20 hover:shadow-emerald-500/30 transition-all duration-500 group">
                      <div className="absolute inset-0 rounded-full bg-gradient-to-br from-white/[0.12] via-transparent to-transparent dark:from-white/[0.03] pointer-events-none" />
                      <div className="relative z-10 text-center">
                        <div className="text-xs font-medium text-emerald-400 mb-1">SUPPLY APY</div>
                        <div className="text-xl font-bold text-gray-900 dark:text-white">
                          +{weightedSupplyAPY.toFixed(1)}%
                        </div>
                      </div>
                      
                      {/* Rotating Border Effect */}
                      <div className="absolute inset-0 rounded-full bg-gradient-to-r from-emerald-500/50 via-transparent to-emerald-500/50 opacity-0 group-hover:opacity-100 transition-opacity duration-500 animate-spin-slow" style={{ animationDuration: '3s' }} />
                    </div>
                  </div>
                </div>

                {/* Right Side - Borrow */}
                <div className="col-span-1 flex justify-end">
                  {borrowPositions.length > 0 ? (
                    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-orange-500/[0.08] to-red-500/[0.04] p-4 backdrop-blur-xl hover:from-orange-500/[0.12] hover:to-red-500/[0.08] transition-all duration-500 group w-full max-w-xs">
                      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.08] via-transparent to-transparent dark:from-white/[0.02] pointer-events-none" />
                      <div className="relative z-10">
                        <div className="text-right space-y-2">
                          <h3 className="text-xs font-medium text-orange-300 uppercase tracking-wide">BORROW BALANCE</h3>
                          <div className="space-y-1">
                            <p className="text-2xl font-bold text-gray-900 dark:text-white">
                              ${totalBorrowedUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                            <p className="text-xs text-orange-400/80">No active loans</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-right text-gray-500 dark:text-gray-400 p-4 w-full max-w-xs">
                      <div className="space-y-2">
                        <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide">BORROW BALANCE</h3>
                        <p className="text-2xl font-bold">$0.00</p>
                        <p className="text-xs text-gray-500">No active loans</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Bottom - Borrow Limit Progress Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Borrow Limit (80% of collateral)
              </span>
              <div className="text-right">
                <div className="text-sm font-medium text-emerald-400">
                  ${borrowLimit > 0 ? (borrowLimit - totalBorrowedUSD).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'} available
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  ${totalBorrowedUSD.toFixed(2)} borrowed • ${(borrowLimit || 0).toFixed(2)} max
                </div>
              </div>
            </div>
            
            {/* Progress Bar */}
            <div className="relative h-3 bg-gray-200/50 dark:bg-gray-800/50 rounded-full overflow-hidden backdrop-blur-sm border border-white/10">
              <div className="absolute inset-0 bg-gradient-to-r from-white/[0.05] to-transparent pointer-events-none" />
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-700 ease-out relative overflow-hidden",
                  `bg-gradient-to-r ${getUtilizationColor(borrowUtilization)}`
                )}
                style={{ width: `${Math.min(borrowUtilization, 100)}%` }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-white/20 via-transparent to-transparent" />
                {borrowUtilization > 5 && (
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-pulse" />
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </AnimatedCard>
  )
} 
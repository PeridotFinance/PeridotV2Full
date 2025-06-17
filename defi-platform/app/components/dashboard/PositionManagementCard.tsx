import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { 
  Users, 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  Zap, 
  Info,
  ArrowUpDown
} from "lucide-react"
import { AnimatedCard } from "../ui/ChartComponents"
import type { UserPosition } from "../markets/UserPositionsCard"

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

  return (
    <AnimatedCard delay={0.6}>
      <Card className="mb-4 bg-white/10 dark:bg-black/10 backdrop-blur-xl border border-emerald-500/20 shadow-lg shadow-emerald-500/5 hover:shadow-emerald-500/10 transition-all duration-300">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-emerald-500" />
              <CardTitle className="text-sm">Position Management</CardTitle>
              {isDemoMode && (
                <Badge variant="outline" className="text-xs h-5 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5">Demo</Badge>
              )}
            </div>
            <Button 
              size="sm" 
              variant="outline"
              onClick={onNavigateToPortfolio}
              className="text-xs h-6 px-2 hidden md:flex border-emerald-500/20 hover:border-emerald-500/40 hover:bg-emerald-500/5"
            >
              View All
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pb-3">
          {/* Mobile: Horizontal scrollable cards */}
          <div className="md:hidden">
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scroll-smooth">
              {/* Supply Positions Summary */}
              {supplyPositions.length > 0 && (
                <div className="flex-none w-32 p-2 border border-border/30 rounded-lg bg-card/50 backdrop-blur-sm hover:border-emerald-500/30 transition-colors">
                  <div className="flex items-center gap-1 mb-1">
                    <TrendingUp className="h-3 w-3 text-emerald-500" />
                    <span className="text-xs font-medium">Supply</span>
                  </div>
                  <p className="text-lg font-bold leading-none mb-1">
                    {supplyPositions.length}
                  </p>
                  <p className="text-xs text-muted-foreground mb-2 leading-none">
                    ${(totalSuppliedUSD / 1000).toFixed(1)}k
                  </p>
                  <Button 
                    size="sm" 
                    variant="outline"
                    className="w-full text-xs h-5 border-emerald-500/20 hover:border-emerald-500/40 hover:bg-emerald-500/5"
                    onClick={onNavigateToPortfolio}
                  >
                    Manage
                  </Button>
                </div>
              )}

              {/* Borrow Positions Summary */}
              {borrowPositions.length > 0 && (
                <div className="flex-none w-32 p-2 border border-border/30 rounded-lg bg-card/30 backdrop-blur-sm hover:border-emerald-500/30 transition-colors">
                  <div className="flex items-center gap-1 mb-1">
                    <TrendingDown className="h-3 w-3 text-emerald-500" />
                    <span className="text-xs font-medium">Borrow</span>
                  </div>
                  <p className="text-lg font-bold leading-none mb-1">
                    {borrowPositions.length}
                  </p>
                  <p className="text-xs text-muted-foreground mb-2 leading-none">
                    ${(totalBorrowedUSD / 1000).toFixed(1)}k
                  </p>
                  <Button 
                    size="sm" 
                    variant="outline"
                    className="w-full text-xs h-5 border-emerald-500/20 hover:border-emerald-500/40 hover:bg-emerald-500/5"
                    onClick={onNavigateToPortfolio}
                  >
                    Manage
                  </Button>
                </div>
              )}

              {/* Health Factor Warning */}
              {userHealthFactor && userHealthFactor < 1.5 && (
                <div className="flex-none w-32 p-2 border border-amber-400/30 rounded-lg bg-amber-500/5 backdrop-blur-sm">
                  <div className="flex items-center gap-1 mb-1">
                    <AlertTriangle className="h-3 w-3 text-amber-500" />
                    <span className="text-xs font-medium">Health</span>
                  </div>
                  <p className="text-lg font-bold leading-none mb-1">
                    {userHealthFactor.toFixed(2)}
                  </p>
                  <p className="text-xs text-muted-foreground mb-2 leading-none">
                    Factor
                  </p>
                  <Button 
                    size="sm" 
                    variant="default"
                    className="w-full text-xs h-5 bg-amber-500 hover:bg-amber-600 text-white"
                    onClick={onNavigateToPortfolio}
                  >
                    Fix
                  </Button>
                </div>
              )}

              {/* Quick Actions */}
              <div className="flex-none w-32 p-2 border border-border/30 rounded-lg bg-card/30 backdrop-blur-sm hover:border-emerald-500/30 transition-colors">
                <div className="flex items-center gap-1 mb-1">
                  <Zap className="h-3 w-3 text-emerald-500" />
                  <span className="text-xs font-medium">Actions</span>
                </div>
                <div className="space-y-1">
                  <Button 
                    size="sm" 
                    variant="outline"
                    className="w-full text-xs h-5 border-emerald-500/20 hover:border-emerald-500/40 hover:bg-emerald-500/5"
                    onClick={onOpenSupplyModal}
                  >
                    Add
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    className="w-full text-xs h-5 border-emerald-500/20 hover:border-emerald-500/40 hover:bg-emerald-500/5"
                    onClick={onOpenBorrowModal}
                  >
                    Repay
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Desktop: Smart Combined Layout */}
          <div className="hidden md:grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Combined Positions Overview */}
            <div className="p-4 border border-border/30 rounded-lg bg-card/50 backdrop-blur-sm hover:border-emerald-500/30 hover:bg-card/70 transition-all duration-300">
              <div className="flex items-center gap-2 mb-3">
                <ArrowUpDown className="h-4 w-4 text-emerald-500" />
                <span className="text-sm font-medium">Portfolio Overview</span>
              </div>
              
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="text-center p-2 bg-emerald-500/5 rounded border border-emerald-500/10">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <TrendingUp className="h-3 w-3 text-emerald-500" />
                    <span className="text-xs text-emerald-400">Supply</span>
                  </div>
                  <p className="text-lg font-bold">{supplyPositions.length}</p>
                  <p className="text-xs text-muted-foreground">${totalSuppliedUSD.toLocaleString()}</p>
                </div>
                
                <div className="text-center p-2 bg-red-500/5 rounded border border-red-500/10">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <TrendingDown className="h-3 w-3 text-red-500" />
                    <span className="text-xs text-red-400">Borrow</span>
                  </div>
                  <p className="text-lg font-bold">{borrowPositions.length}</p>
                  <p className="text-xs text-muted-foreground">${totalBorrowedUSD.toLocaleString()}</p>
                </div>
              </div>
              
              <Button 
                size="sm" 
                variant="outline"
                className="w-full text-xs h-6 border-emerald-500/20 hover:border-emerald-500/40 hover:bg-emerald-500/5"
                onClick={onNavigateToPortfolio}
              >
                Manage Portfolio
              </Button>
            </div>

            {/* AI-Powered Actions */}
            <div className="p-4 border border-border/30 rounded-lg bg-card/30 backdrop-blur-sm hover:border-emerald-500/30 hover:bg-card/50 transition-all duration-300">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="h-4 w-4 text-emerald-500" />
                <span className="text-sm font-medium">AI Assistant</span>
              </div>
              
              {/* Health Factor with AI Optimization */}
              {userHealthFactor && userHealthFactor < 1.5 && (
                <div className="mb-3 p-2 bg-amber-500/10 border border-amber-500/20 rounded flex items-center gap-2">
                  <AlertTriangle className="h-3 w-3 text-amber-500" />
                  <div className="flex-1">
                    <span className="text-xs text-amber-300">Health: {userHealthFactor.toFixed(2)}</span>
                  </div>
                </div>
              )}
              
              <div className="space-y-2">
                {userHealthFactor && userHealthFactor < 1.5 ? (
                  <Button 
                    size="sm" 
                    variant="default"
                    className="w-full text-xs h-6 bg-emerald-500 hover:bg-emerald-600 text-white"
                    onClick={onNavigateToPortfolio}
                  >
                    🤖 AI Optimize Risk
                  </Button>
                ) : (
                  <Button 
                    size="sm" 
                    variant="outline"
                    className="w-full text-xs h-6 border-emerald-500/20 hover:border-emerald-500/40 hover:bg-emerald-500/5"
                    onClick={onOpenSupplyModal}
                  >
                    🤖 AI Suggest Actions
                  </Button>
                )}
                
                <Button 
                  size="sm" 
                  variant="outline"
                  className="w-full text-xs h-6 border-emerald-500/20 hover:border-emerald-500/40 hover:bg-emerald-500/5"
                  onClick={onOpenBorrowModal}
                >
                  🤖 Smart Rebalance
                </Button>
              </div>
            </div>
          </div>

          {/* Compact educational note for mobile */}
          <div className="mt-2 p-2 bg-muted/50 border border-border/30 rounded-lg md:hidden backdrop-blur-sm">
            <div className="flex items-start gap-2">
              <Info className="h-3 w-3 text-emerald-500 flex-shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="font-medium mb-1">Position Management Tips:</p>
                <ul className="space-y-0.5 text-muted-foreground">
                  <li>• Supply assets to earn interest and use them as collateral</li>
                  <li>• Borrow assets for leverage, arbitrage, or liquidity needs</li>
                  <li>• Keep your health factor above 1.5 to maintain healthy positions</li>
                  <li>• Go to Portfolio tab for detailed position management</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Compact educational note for desktop */}
          <div className="hidden md:block mt-3 p-2 bg-muted/50 border border-border/30 rounded-lg backdrop-blur-sm">
            <div className="flex items-start gap-2">
              <Info className="h-3 w-3 text-emerald-500 flex-shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="font-medium mb-1">Position Management Tips:</p>
                <ul className="space-y-0.5 text-muted-foreground">
                  <li>• Supply assets to earn interest and use them as collateral</li>
                  <li>• Borrow assets for leverage, arbitrage, or liquidity needs</li>
                  <li>• Keep your health factor above 1.5 to maintain healthy positions</li>
                  <li>• Go to Portfolio tab for detailed position management</li>
                </ul>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </AnimatedCard>
  )
} 
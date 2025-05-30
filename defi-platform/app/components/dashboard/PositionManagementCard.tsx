import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { 
  Users, 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  Zap, 
  Info 
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
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <CardTitle className="text-sm">Position Management</CardTitle>
              {isDemoMode && (
                <Badge variant="outline" className="text-xs h-5">Demo</Badge>
              )}
            </div>
            <Button 
              size="sm" 
              variant="outline"
              onClick={onNavigateToPortfolio}
              className="text-xs h-6 px-2 hidden md:flex"
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
                <div className="flex-none w-32 p-2 border rounded-md bg-green-50/50 dark:bg-green-950/20">
                  <div className="flex items-center gap-1 mb-1">
                    <TrendingUp className="h-3 w-3 text-green-600" />
                    <span className="text-xs font-medium text-green-700">Supply</span>
                  </div>
                  <p className="text-lg font-bold text-green-700 leading-none mb-1">
                    {supplyPositions.length}
                  </p>
                  <p className="text-xs text-green-600 mb-2 leading-none">
                    ${(totalSuppliedUSD / 1000).toFixed(1)}k
                  </p>
                  <Button 
                    size="sm" 
                    variant="outline"
                    className="w-full text-xs h-5"
                    onClick={onNavigateToPortfolio}
                  >
                    Manage
                  </Button>
                </div>
              )}

              {/* Borrow Positions Summary */}
              {borrowPositions.length > 0 && (
                <div className="flex-none w-32 p-2 border rounded-md bg-blue-50/50 dark:bg-blue-950/20">
                  <div className="flex items-center gap-1 mb-1">
                    <TrendingDown className="h-3 w-3 text-blue-600" />
                    <span className="text-xs font-medium text-blue-700">Borrow</span>
                  </div>
                  <p className="text-lg font-bold text-blue-700 leading-none mb-1">
                    {borrowPositions.length}
                  </p>
                  <p className="text-xs text-blue-600 mb-2 leading-none">
                    ${(totalBorrowedUSD / 1000).toFixed(1)}k
                  </p>
                  <Button 
                    size="sm" 
                    variant="outline"
                    className="w-full text-xs h-5"
                    onClick={onNavigateToPortfolio}
                  >
                    Manage
                  </Button>
                </div>
              )}

              {/* Health Factor Warning */}
              {userHealthFactor && userHealthFactor < 1.5 && (
                <div className="flex-none w-32 p-2 border rounded-md bg-amber-50/50 dark:bg-amber-950/20 border-amber-200">
                  <div className="flex items-center gap-1 mb-1">
                    <AlertTriangle className="h-3 w-3 text-amber-600" />
                    <span className="text-xs font-medium text-amber-700">Health</span>
                  </div>
                  <p className="text-lg font-bold text-amber-700 leading-none mb-1">
                    {userHealthFactor.toFixed(2)}
                  </p>
                  <p className="text-xs text-amber-600 mb-2 leading-none">
                    Factor
                  </p>
                  <Button 
                    size="sm" 
                    variant="default"
                    className="w-full text-xs h-5 bg-amber-600 hover:bg-amber-700"
                    onClick={onNavigateToPortfolio}
                  >
                    Fix
                  </Button>
                </div>
              )}

              {/* Quick Actions */}
              <div className="flex-none w-32 p-2 border rounded-md bg-purple-50/50 dark:bg-purple-950/20">
                <div className="flex items-center gap-1 mb-1">
                  <Zap className="h-3 w-3 text-purple-600" />
                  <span className="text-xs font-medium text-purple-700">Actions</span>
                </div>
                <div className="space-y-1">
                  <Button 
                    size="sm" 
                    variant="outline"
                    className="w-full text-xs h-5"
                    onClick={onOpenSupplyModal}
                  >
                    Add
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    className="w-full text-xs h-5"
                    onClick={onOpenBorrowModal}
                  >
                    Repay
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Desktop: Grid layout */}
          <div className="hidden md:grid grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Supply Positions Summary */}
            {supplyPositions.length > 0 && (
              <div className="p-3 border rounded-lg bg-green-50/50 dark:bg-green-950/20">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium text-green-700">Supply</span>
                </div>
                <p className="text-xl font-bold text-green-700 leading-none mb-1">
                  {supplyPositions.length}
                </p>
                <p className="text-xs text-green-600 mb-2">
                  ${totalSuppliedUSD.toLocaleString()} supplied
                </p>
                <Button 
                  size="sm" 
                  variant="outline"
                  className="w-full text-xs h-6"
                  onClick={onNavigateToPortfolio}
                >
                  Manage Supplies
                </Button>
              </div>
            )}

            {/* Borrow Positions Summary */}
            {borrowPositions.length > 0 && (
              <div className="p-3 border rounded-lg bg-blue-50/50 dark:bg-blue-950/20">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingDown className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-700">Borrow</span>
                </div>
                <p className="text-xl font-bold text-blue-700 leading-none mb-1">
                  {borrowPositions.length}
                </p>
                <p className="text-xs text-blue-600 mb-2">
                  ${totalBorrowedUSD.toLocaleString()} borrowed
                </p>
                <Button 
                  size="sm" 
                  variant="outline"
                  className="w-full text-xs h-6"
                  onClick={onNavigateToPortfolio}
                >
                  Manage Borrows
                </Button>
              </div>
            )}

            {/* Health Factor Warning */}
            {userHealthFactor && userHealthFactor < 1.5 && (
              <div className="p-3 border rounded-lg bg-amber-50/50 dark:bg-amber-950/20 border-amber-200">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <span className="text-sm font-medium text-amber-700">Health Monitor</span>
                </div>
                <p className="text-xl font-bold text-amber-700 leading-none mb-1">
                  {userHealthFactor.toFixed(2)}
                </p>
                <p className="text-xs text-amber-600 mb-2">
                  Health factor
                </p>
                <Button 
                  size="sm" 
                  variant="default"
                  className="w-full text-xs h-6 bg-amber-600 hover:bg-amber-700"
                  onClick={onNavigateToPortfolio}
                >
                  Optimize
                </Button>
              </div>
            )}

            {/* Quick Actions */}
            <div className="p-3 border rounded-lg bg-purple-50/50 dark:bg-purple-950/20">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="h-4 w-4 text-purple-600" />
                <span className="text-sm font-medium text-purple-700">Actions</span>
              </div>
              <div className="space-y-1">
                <Button 
                  size="sm" 
                  variant="outline"
                  className="w-full text-xs h-6"
                  onClick={onNavigateToPortfolio}
                >
                  View All
                </Button>
                <Button 
                  size="sm" 
                  variant="outline"
                  className="w-full text-xs h-6"
                  onClick={onOpenSupplyModal}
                >
                  Add Collateral
                </Button>
              </div>
            </div>
          </div>

          {/* Compact educational note for mobile */}
          <div className="mt-2 p-2 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 rounded-md md:hidden">
            <div className="flex items-start gap-2">
              <Info className="h-3 w-3 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-blue-700">
                <p className="font-medium mb-1">Position Management Tips:</p>
                <ul className="space-y-0.5">
                  <li>• Supply assets to earn interest and use them as collateral</li>
                  <li>• Borrow assets for leverage, arbitrage, or liquidity needs</li>
                  <li>• Keep your health factor above 1.5 to maintain healthy positions</li>
                  <li>• Go to Portfolio tab for detailed position management</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Compact educational note for desktop */}
          <div className="hidden md:block mt-3 p-2 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 rounded-lg">
            <div className="flex items-start gap-2">
              <Info className="h-3 w-3 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-blue-700">
                <p className="font-medium mb-1">Position Management Tips:</p>
                <ul className="space-y-0.5">
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
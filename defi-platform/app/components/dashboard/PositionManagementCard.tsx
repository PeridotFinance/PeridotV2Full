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
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Position Management
            {isDemoMode && (
              <Badge variant="outline" className="text-xs">Demo</Badge>
            )}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Quick actions to manage your active lending and borrowing positions
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Supply Positions Summary */}
            {supplyPositions.length > 0 && (
              <div className="p-4 border rounded-lg bg-green-50/50 dark:bg-green-950/20">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="h-4 w-4 text-green-600" />
                  <span className="font-medium text-green-700">Supply Positions</span>
                </div>
                <p className="text-2xl font-bold text-green-700 mb-1">
                  {supplyPositions.length}
                </p>
                <p className="text-xs text-green-600 mb-3">
                  ${totalSuppliedUSD.toLocaleString()} supplied
                </p>
                <Button 
                  size="sm" 
                  variant="outline"
                  className="w-full text-xs h-7"
                  onClick={onNavigateToPortfolio}
                >
                  Manage Supplies
                </Button>
              </div>
            )}

            {/* Borrow Positions Summary */}
            {borrowPositions.length > 0 && (
              <div className="p-4 border rounded-lg bg-red-50/50 dark:bg-red-950/20">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingDown className="h-4 w-4 text-red-600" />
                  <span className="font-medium text-red-700">Borrow Positions</span>
                </div>
                <p className="text-2xl font-bold text-red-700 mb-1">
                  {borrowPositions.length}
                </p>
                <p className="text-xs text-red-600 mb-3">
                  ${totalBorrowedUSD.toLocaleString()} borrowed
                </p>
                <Button 
                  size="sm" 
                  variant="outline"
                  className="w-full text-xs h-7"
                  onClick={onNavigateToPortfolio}
                >
                  Manage Borrows
                </Button>
              </div>
            )}

            {/* Health Factor Warning */}
            {userHealthFactor && userHealthFactor < 1.5 && (
              <div className="p-4 border rounded-lg bg-orange-50/50 dark:bg-orange-950/20 border-orange-200">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4 text-orange-600" />
                  <span className="font-medium text-orange-700">Risk Alert</span>
                </div>
                <p className="text-2xl font-bold text-orange-700 mb-1">
                  {userHealthFactor.toFixed(2)}
                </p>
                <p className="text-xs text-orange-600 mb-3">
                  Health factor - Action needed
                </p>
                <Button 
                  size="sm" 
                  variant="default"
                  className="w-full text-xs h-7 bg-orange-600 hover:bg-orange-700"
                  onClick={onNavigateToPortfolio}
                >
                  Reduce Risk
                </Button>
              </div>
            )}

            {/* Quick Actions */}
            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="h-4 w-4 text-blue-600" />
                <span className="font-medium text-blue-700">Quick Actions</span>
              </div>
              <div className="space-y-2">
                <Button 
                  size="sm" 
                  variant="outline"
                  className="w-full text-xs h-7"
                  onClick={onNavigateToPortfolio}
                >
                  View All Positions
                </Button>
                <Button 
                  size="sm" 
                  variant="outline"
                  className="w-full text-xs h-7"
                  onClick={onOpenSupplyModal}
                >
                  Add Collateral
                </Button>
                <Button 
                  size="sm" 
                  variant="outline"
                  className="w-full text-xs h-7"
                  onClick={onOpenBorrowModal}
                >
                  Repay Loan
                </Button>
              </div>
            </div>
          </div>

          {/* Educational Note */}
          <div className="mt-4 p-3 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 rounded-lg">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-blue-700">
                <p className="font-medium mb-1">Position Management Tips:</p>
                <ul className="space-y-1 text-blue-600">
                  <li>• Supply assets to earn interest and use them as collateral</li>
                  <li>• Borrow against your collateral while monitoring your health factor</li>
                  <li>• Keep your health factor above 1.5 to avoid liquidation risk</li>
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
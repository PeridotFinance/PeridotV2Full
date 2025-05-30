import { AnimatedCard } from "../ui/ChartComponents"
import { MarketInsightsCard } from "../markets/MarketInsightsCard"

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
  priceHistory: Array<{
    timestamp: number
    price: number
  }>
  apyHistory: Array<{
    timestamp: number
    supplyAPY: number
    borrowAPY: number
  }>
}

interface MarketInsightsWrapperProps {
  markets: MarketData[]
  isDemoMode: boolean
  selectedMarket: string
  onMarketSelect: (marketId: string) => void
  delay?: number
}

export function MarketInsightsWrapper({
  markets,
  isDemoMode,
  selectedMarket,
  onMarketSelect,
  delay = 0.7
}: MarketInsightsWrapperProps) {
  return (
    <AnimatedCard delay={delay}>
      <MarketInsightsCard
        markets={markets}
        isDemoMode={isDemoMode}
        selectedMarket={selectedMarket}
        onMarketSelect={onMarketSelect}
      />
    </AnimatedCard>
  )
} 
export type MarketPromo = {
  label: string
  tooltip?: string
  rewardsApy?: number | null
  variant?: "default" | "secondary" | "destructive" | "outline"
  glow?: "default" | "gold" | "purple" | "green" | "blue" | "red" | "orange" | "none"
}

// Keep this small and localized; future: fetch from CMS or DB.
export const MARKET_PROMOTIONS: Record<string, MarketPromo | undefined> = {
  "morpho-boosted-usdc": { 
    label: "🔥 Hot Asset", 
    tooltip: "Featured asset with tasty terms", 
    variant: "outline", 
    glow: "orange" 
  },
}



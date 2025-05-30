// Asset Types
export interface Asset {
  id: string
  name: string
  symbol: string
  icon: string
  apy: number
  wallet: string
  collateral?: boolean
  price?: number
  marketCap?: string
  volume24h?: string
  change24h?: number
  liquidity?: string
  pTokenAddress?: `0x${string}`
}

// Portfolio Types
export interface PortfolioAsset {
  id: string
  name: string
  symbol: string
  icon: string
  amount: number
  price: number
  value: number
  allocation: number // percentage
  change24h?: number // percentage
}

export interface PortfolioSummary {
  totalValue: number
  change24hValue: number
  change24hPercentage: number
}

// Staking Types
export interface StakingPool {
  id: string
  assetName: string
  assetSymbol: string
  assetIcon: string
  apy: number
  totalStaked: number // in USD value
  userStakedAmount: number // in asset amount
  userStakedValue: number // in USD value
  rewardsEarned: number // in asset amount
  rewardsEarnedValue: number // in USD value
  lockupPeriod?: string // e.g., "30 days", "Flexible"
}

export interface StakingSummary {
  totalStakedValue: number
  totalRewardsValue: number
  averageApy: number // weighted average or simple average
}

// Easy Mode types
export type OnboardingStep = "welcome" | "profile" | "funding" | "invest" | "complete"
export type PaymentMethod = "bank" | "card" | "paypal"
export type EasyModeAction = "deposit" | "withdraw" | "earn" | "borrow"

export interface EasyModeTransaction {
  id: string
  type: "deposit" | "withdrawal" | "interest" | "borrow" | "repayment"
  asset: string
  amount: number
  date: string
  status: "completed" | "pending" | "failed"
}

// Transaction status types
export type TransactionStatus = "idle" | "pendingSignature" | "transactionPending" | "success" | "error"

// Live data response types
export interface LiveAccountData {
  totalSupplied: number
  totalBorrowed: number
  netAPY: number
  borrowLimitUsed: number
  accountLiquidity: number
  percBalance: number
}

export interface LiveMarketData {
  supplyMarkets: Asset[]
  borrowMarkets: Asset[]
}

export interface LivePortfolioData {
  summary: PortfolioSummary
  assets: PortfolioAsset[]
} 
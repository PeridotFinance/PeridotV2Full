// Asset types
export interface Asset {
  id: string;
  name: string;
  symbol: string;
  icon: string;
  supplyApy: number;
  borrowApy: number;
  wallet: string;
  change24h: number;
  price: number;
  marketCap: string;
  volume24h: string;
  liquidity: string;
  utilizationRate?: number;
  liquidationThreshold?: number;
  liquidationPenalty?: number;
  maxLTV?: number;
  oraclePrice?: number;
  hasSmartContract?: boolean;
  isBorrowable?: boolean;
  chain?: string;
  apy?: number;
  canBeCollateral?: boolean;
  decimals?: number;
  category?: "crypto" | "stock" | "boosted"; // Asset category for filtering
  availableOnChainId?: number;
  canAutoWrap?: boolean; // New: Flag for assets that can be wrapped from native (e.g. MON -> WMON)
  nativeSymbol?: string; // New: Symbol of the native token (e.g. MON)
}

// Easy Mode types
export type OnboardingStep = "welcome" | "profile" | "funding" | "invest" | "complete"
export type PaymentMethod = "bank" | "card" | "paypal"

// Portfolio asset types
export type PortfolioAsset = {
  id: string
  name: string
  symbol: string
  icon: string
  price: number
  amount: number
  value: number
  allocation: number
  change24h: number
  category?: "crypto" | "stock" | "boosted" // Asset category for filtering and display
}

// Staking asset types
export type StakingAsset = {
  id: string
  name: string
  symbol: string
  icon: string
  apy: number
  staked: number
  rewards: number
  totalValue: number
  change24h: number
  lockPeriod?: string
  status: "active" | "pending" | "unlocking"
}

// Chart data type
export type ChartData = Array<{day: number; value: number}>

// Component prop types
export type AnimatedCounterProps = {
  value: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
}

export type MiniChartProps = {
  data: ChartData;
  color?: string;
  height?: number;
  width?: number;
}

export type AnimatedCardProps = {
  children: React.ReactNode;
  delay?: number;
  [key: string]: any;
}

export type DonutChartProps = {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
} 
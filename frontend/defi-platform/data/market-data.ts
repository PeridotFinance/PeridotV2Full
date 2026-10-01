import { Asset } from "@/types/markets"
import {
  getChainConfig,
  CHAIN_IDS,
  stellarSorobanMainnetContracts,
} from "@/config/contracts"
import { FEATURE_FLAGS } from "../config/featureFlags"

const BSC_ONLY_ASSET_IDS = new Set(["cake", "aster", "doge"])

// Combined market data
export const combinedMarkets: Asset[] = [
  // New tokens with smart contracts available

  {
    id: "bnb",
    name: "BNB",
    symbol: "BNB",
    icon: "/tokenimages/app/bnb-logo.svg",
    supplyApy: 3.78,
    borrowApy: 4.95,
    wallet: "0 BNB",
    change24h: 2.18,
    price: 682.45,
    marketCap: "$1K",
    volume24h: "$1K",
    liquidity: "$1K",
    utilizationRate: 62.1,
    liquidationThreshold: 85.0,
    liquidationPenalty: 5.0,
    maxLTV: 80.0,
    oraclePrice: 682.45,
    hasSmartContract: true,
  },
  {
    id: "cake",
    name: "PancakeSwap",
    symbol: "CAKE",
    icon: "/tokenimages/app/pancakeswap-cake-logo.svg",
    supplyApy: 3.42,
    borrowApy: 4.58,
    wallet: "0 CAKE",
    change24h: 1.87,
    price: 2.15,
    marketCap: "$1K",
    volume24h: "$1K",
    liquidity: "$1K",
    utilizationRate: 54.6,
    liquidationThreshold: 80.0,
    liquidationPenalty: 8.0,
    maxLTV: 75.0,
    oraclePrice: 2.15,
    hasSmartContract: true,
  },
  {
    id: "aster",
    name: "Aster",
    symbol: "ASTER",
    icon: "/tokenimages/app/Aster-Dex-Logo-1.jpg",
    supplyApy: 5.12,
    borrowApy: 6.48,
    wallet: "0 ASTER",
    change24h: 4.32,
    price: 0.86,
    marketCap: "$128M",
    volume24h: "$14.8M",
    liquidity: "$205K",
    utilizationRate: 49.3,
    liquidationThreshold: 80.0,
    liquidationPenalty: 8.0,
    maxLTV: 75.0,
    oraclePrice: 0.86,
    hasSmartContract: true,
  },
  {
    id: "usdc",
    name: "USD Coin",
    symbol: "USDC",
    icon: "/tokenimages/app/usd-coin-usdc-logo.svg",
    supplyApy: 1.47,
    borrowApy: 2.18,
    wallet: "0 USDC",
    change24h: 0.01,
    price: 1.0,
    marketCap: "$28.4B",
    volume24h: "$2.1B",
    liquidity: "$2.5M",
    utilizationRate: 85.3,
    liquidationThreshold: 90.0,
    liquidationPenalty: 4.0,
    maxLTV: 85.0,
    oraclePrice: 1.0,
    hasSmartContract: true,
  },
  {
    id: "usdt",
    name: "Tether",
    symbol: "USDT",
    icon: "/tokenimages/app/tether-usdt-logo.svg",
    supplyApy: 2.18,
    borrowApy: 3.42,
    wallet: "0 USDT",
    change24h: 0.02,
    price: 1.0,
    marketCap: "$83.2B",
    volume24h: "$42.5B",
    liquidity: "$1.2M",
    utilizationRate: 78.9,
    liquidationThreshold: 90.0,
    liquidationPenalty: 4.0,
    maxLTV: 85.0,
    oraclePrice: 1.0,
    hasSmartContract: true,
  },
  {
    id: "wbtc",
    name: "Wrapped BTC",
    symbol: "WBTC",
    icon: "/tokenimages/app/btc-logo-trans.png",
    supplyApy: 0,
    borrowApy: 0,
    wallet: "0 WBTC",
    change24h: 0,
    price: 0,
    marketCap: "0",
    volume24h: "0",
    liquidity: "0",
    utilizationRate: 0,
    liquidationThreshold: 85.0,
    liquidationPenalty: 5.0,
    maxLTV: 80.0,
    oraclePrice: 0,
    hasSmartContract: true,
    decimals: 8,
  }
]

// BSC Testnet specific markets
export const bscTestnetMarkets: Asset[] = [
  {
    id: "bnb",
    name: "BNB",
    symbol: "BNB",
    icon: "/tokenimages/app/bnb-logo.svg",
    supplyApy: 0,
    borrowApy: 0,
    wallet: "0 BNB",
    change24h: 0,
    price: 0,
    marketCap: "0",
    volume24h: "0",
    liquidity: "0",
    utilizationRate: 0,
    liquidationThreshold: 85.0,
    liquidationPenalty: 5.0,
    maxLTV: 80.0,
    oraclePrice: 0,
    hasSmartContract: true,
    decimals: 18,
  },
  {
    id: "axl-wbnb",
    name: "Axelar WBNB",
    symbol: "WBNB",
    icon: "/tokenimages/app/bnb-logo.svg",
    supplyApy: 4.2,
    borrowApy: 5.8,
    wallet: "0 WBNB",
    change24h: 0,
    price: 0,
    marketCap: "0",
    volume24h: "0",
    liquidity: "0",
    utilizationRate: 45.2,
    liquidationThreshold: 85.0,
    liquidationPenalty: 5.0,
    maxLTV: 80.0,
    oraclePrice: 0,
    hasSmartContract: true,
    decimals: 18,
  },
  {
    id: "axl-ausdc",
    name: "Axelar aUSDC",
    symbol: "aUSDC",
    icon: "/tokenimages/app/usd-coin-usdc-logo.svg",
    supplyApy: 3.1,
    borrowApy: 4.5,
    wallet: "0 aUSDC",
    change24h: 0,
    price: 1.0,
    marketCap: "0",
    volume24h: "0",
    liquidity: "0",
    utilizationRate: 38.7,
    liquidationThreshold: 90.0,
    liquidationPenalty: 4.0,
    maxLTV: 85.0,
    oraclePrice: 1.0,
    hasSmartContract: true,
    decimals: 6,
  },
  {
    id: "axl-wavax",
    name: "Axelar WAVAX",
    symbol: "WAVAX",
    icon: "/tokenimages/app/avax.png",
    supplyApy: 5.7,
    borrowApy: 7.2,
    wallet: "0 WAVAX",
    change24h: 0,
    price: 0,
    marketCap: "0",
    volume24h: "0",
    liquidity: "0",
    utilizationRate: 52.1,
    liquidationThreshold: 85.0,
    liquidationPenalty: 5.0,
    maxLTV: 80.0,
    oraclePrice: 0,
    hasSmartContract: true,
    decimals: 18,
  },
  {
    id: "link",
    name: "Chainlink",
    symbol: "LINK",
    icon: "/tokenimages/link.png", // Using USDT icon as placeholder
    supplyApy: 2.85,
    borrowApy: 3.95,
    wallet: "0 PUSD",
    change24h: 0.15,
    price: 18.08,
    marketCap: "$1.2B",
    volume24h: "$85.4M",
    liquidity: "$425K",
    utilizationRate: 65.2,
    liquidationThreshold: 90.0,
    liquidationPenalty: 5.0,
    maxLTV: 85.0,
    oraclePrice: 18.08,
    hasSmartContract: true,
  },
    {
      id: "peridot",
      name: "Peridot",
      symbol: "PDT",
      icon: "/logo.svg",
      supplyApy: 8.64,
      borrowApy: 9.21,
      wallet: "0 PDT",
      change24h: 7.21,
      price: 0.10,
      marketCap: "0",
      volume24h: "0",
      liquidity: "0",
      utilizationRate: 72.3,
      liquidationThreshold: 80.0,
      liquidationPenalty: 10.0,
      maxLTV: 75.0,
      oraclePrice: 0.10,
      hasSmartContract: true,
    },
    {
      id: "btcb",
      name: "Bitcoin Binance",
      symbol: "BTCB",
      icon: "/tokenimages/app/btc-logo-trans.png",
      supplyApy: 8.64,
      borrowApy: 9.21,
      wallet: "0 BTCB",
      change24h: 7.21,
      price: 117864.95,
      marketCap: "0",
      volume24h: "0",
      liquidity: "0",
      utilizationRate: 72.3,
      liquidationThreshold: 80.0,
      liquidationPenalty: 10.0,
      maxLTV: 75.0,
      oraclePrice: 14.86,
      hasSmartContract: true,
    },
    {
      id: "usdc",
      name: "USDC",
      symbol: "USDC",
      icon: "/tokenimages/app/usd-coin-usdc-logo.svg",
      supplyApy: 8.64,
      borrowApy: 9.21,
      wallet: "0 BTCB",
      change24h: 7.21,
      price: 1.0,
      marketCap: "0",
      volume24h: "0",
      liquidity: "0",
      utilizationRate: 72.3,
      liquidationThreshold: 80.0,
      liquidationPenalty: 10.0,
      maxLTV: 75.0,
      oraclePrice: 14.86,
      hasSmartContract: true,
    },
    {
      id: "usdt",
      name: "USDT",
      symbol: "USDT",
      icon: "/tokenimages/app/tether-usdt-logo.svg",
      supplyApy: 8.64,
      borrowApy: 9.21,
      wallet: "0 BTCB",
      change24h: 7.21,
      price: 1.0,
      marketCap: "$742M",
      volume24h: "$56.3M",
      liquidity: "$562K",
      utilizationRate: 72.3,
      liquidationThreshold: 80.0,
      liquidationPenalty: 10.0,
      maxLTV: 75.0,
      oraclePrice: 14.86,
      hasSmartContract: true,
    }
]

// BSC Mainnet specific markets
export const bscMainnetMarkets: Asset[] = [
  {
    id: "weth",
    name: "Wrapped Ether",
    symbol: "WETH",
    icon: "/tokenimages/eth.png",
    supplyApy: 0,
    borrowApy: 0,
    wallet: "0 WETH",
    change24h: 0,
    price: 0,
    marketCap: "0",
    volume24h: "0",
    liquidity: "0",
    utilizationRate: 0,
    liquidationThreshold: 85.0,
    liquidationPenalty: 5.0,
    maxLTV: 80.0,
    oraclePrice: 0,
    hasSmartContract: true,
    decimals: 18,
    category: "crypto" as const,
  },
  {
    id: "usdc",
    name: "USD Coin",
    symbol: "USDC",
    icon: "/tokenimages/app/usd-coin-usdc-logo.svg",
    supplyApy: 0,
    borrowApy: 0,
    wallet: "0 USDC",
    change24h: 0,
    price: 1.0,
    marketCap: "0",
    volume24h: "0",
    liquidity: "0",
    utilizationRate: 0,
    liquidationThreshold: 90.0,
    liquidationPenalty: 4.0,
    maxLTV: 85.0,
    oraclePrice: 1.0,
    hasSmartContract: true,
    decimals: 18,
    category: "crypto" as const,
  },
  {
    id: "wbnb",
    name: "Wrapped BNB",
    symbol: "WBNB",
    icon: "/tokenimages/app/bnb-logo.svg",
    supplyApy: 0,
    borrowApy: 0,
    wallet: "0 WBNB",
    change24h: 0,
    price: 0,
    marketCap: "0",
    volume24h: "0",
    liquidity: "0",
    utilizationRate: 0,
    liquidationThreshold: 85.0,
    liquidationPenalty: 5.0,
    maxLTV: 80.0,
    oraclePrice: 0,
    hasSmartContract: true,
    decimals: 18,
    category: "crypto" as const,
  },
  {
    id: "usdt",
    name: "Tether",
    symbol: "USDT",
    icon: "/tokenimages/app/tether-usdt-logo.svg",
    supplyApy: 0,
    borrowApy: 0,
    wallet: "0 USDT",
    change24h: 0.0,
    price: 1.0,
    marketCap: "0",
    volume24h: "0",
    liquidity: "0",
    utilizationRate: 0,
    liquidationThreshold: 90.0,
    liquidationPenalty: 4.0,
    maxLTV: 85.0,
    oraclePrice: 1.0,
    hasSmartContract: true,
    decimals: 18,
  },
  {
    id: "wbtc",
    name: "Wrapped BTC",
    symbol: "WBTC",
    icon: "/tokenimages/app/wrapped-btc.svg",
    supplyApy: 0,
    borrowApy: 0,
    wallet: "0 WBTC",
    change24h: 0,
    price: 0,
    marketCap: "0",
    volume24h: "0",
    liquidity: "0",
    utilizationRate: 0,
    liquidationThreshold: 85.0,
    liquidationPenalty: 5.0,
    maxLTV: 80.0,
    oraclePrice: 0,
    hasSmartContract: true,
    decimals: 8,
    category: "crypto" as const,
  },
  {
    id: "cake",
    name: "PancakeSwap",
    symbol: "CAKE",
    icon: "/tokenimages/app/pancakeswap-cake-logo.svg",
    supplyApy: 0,
    borrowApy: 0,
    wallet: "0 CAKE",
    change24h: 0,
    price: 0,
    marketCap: "0",
    volume24h: "0",
    liquidity: "0",
    utilizationRate: 0,
    liquidationThreshold: 80.0,
    liquidationPenalty: 8.0,
    maxLTV: 75.0,
    oraclePrice: 0,
    hasSmartContract: true,
    decimals: 18,
    category: "crypto" as const,
  },
  {
    id: "aster",
    name: "Aster",
    symbol: "ASTER",
    icon: "/tokenimages/app/Aster-Dex-Logo-1.jpg",
    supplyApy: 0,
    borrowApy: 0,
    wallet: "0 ASTER",
    change24h: 0,
    price: 0,
    marketCap: "0",
    volume24h: "0",
    liquidity: "0",
    utilizationRate: 0,
    liquidationThreshold: 80.0,
    liquidationPenalty: 8.0,
    maxLTV: 75.0,
    oraclePrice: 0,
    hasSmartContract: true,
    decimals: 18,
  },
  {
    id: "doge",
    name: "Doge",
    symbol: "DOGE",
    icon: "/tokenimages/app/dogecoin-doge-logo.svg",
    supplyApy: 0,
    borrowApy: 0,
    wallet: "0 DOGE",
    change24h: 0,
    price: 0,
    marketCap: "0",
    volume24h: "0",
    liquidity: "0",
    utilizationRate: 0,
    liquidationThreshold: 80.0,
    liquidationPenalty: 8.0,
    maxLTV: 75.0,
    oraclePrice: 0,
    hasSmartContract: true,
    decimals: 8,
    category: "crypto" as const,
  },
  // Tokenized stocks (Ondo)
  {
    id: "aaplon",
    name: "Apple (Ondo)",
    symbol: "AAPLon",
    icon: "/stockimages/Apple_logo_black.svg",
    supplyApy: 0,
    borrowApy: 0,
    wallet: "0 AAPLon",
    change24h: 0,
    price: 0,
    marketCap: "0",
    volume24h: "0",
    liquidity: "0",
    utilizationRate: 0,
    liquidationThreshold: 85.0,
    liquidationPenalty: 5.0,
    maxLTV: 80.0,
    oraclePrice: 0,
    hasSmartContract: true,
    decimals: 18,
    category: "stock" as const,
  },
  {
    id: "nvdaon",
    name: "NVIDIA (Ondo)",
    symbol: "NVDAon",
    icon: "/stockimages/nvidia.svg",
    supplyApy: 0,
    borrowApy: 0,
    wallet: "0 NVDAon",
    change24h: 0,
    price: 0,
    marketCap: "0",
    volume24h: "0",
    liquidity: "0",
    utilizationRate: 0,
    liquidationThreshold: 85.0,
    liquidationPenalty: 5.0,
    maxLTV: 80.0,
    oraclePrice: 0,
    hasSmartContract: true,
    decimals: 18,
    category: "stock" as const,
  },
  {
    id: "googlon",
    name: "Alphabet Class A (Ondo)",
    symbol: "GOOGLon",
    icon: "/stockimages/google.svg",
    supplyApy: 0,
    borrowApy: 0,
    wallet: "0 GOOGLon",
    change24h: 0,
    price: 0,
    marketCap: "0",
    volume24h: "0",
    liquidity: "0",
    utilizationRate: 0,
    liquidationThreshold: 85.0,
    liquidationPenalty: 5.0,
    maxLTV: 80.0,
    oraclePrice: 0,
    hasSmartContract: true,
    decimals: 18,
    category: "stock" as const,
  },
  {
    id: "tslaon",
    name: "Tesla (Ondo)",
    symbol: "TSLAon",
    icon: "/stockimages/tesla.svg",
    supplyApy: 0,
    borrowApy: 0,
    wallet: "0 TSLAon",
    change24h: 0,
    price: 0,
    marketCap: "0",
    volume24h: "0",
    liquidity: "0",
    utilizationRate: 0,
    liquidationThreshold: 85.0,
    liquidationPenalty: 5.0,
    maxLTV: 80.0,
    oraclePrice: 0,
    hasSmartContract: true,
    decimals: 18,
    category: "stock" as const,
  },
  {
    id: "msfton",
    name: "Microsoft (Ondo)",
    symbol: "MSFTon",
    icon: "/stockimages/Microsoft_logo.svg",
    supplyApy: 0,
    borrowApy: 0,
    wallet: "0 MSFTon",
    change24h: 0,
    price: 0,
    marketCap: "0",
    volume24h: "0",
    liquidity: "0",
    utilizationRate: 0,
    liquidationThreshold: 85.0,
    liquidationPenalty: 5.0,
    maxLTV: 80.0,
    oraclePrice: 0,
    hasSmartContract: true,
    decimals: 18,
    category: "stock" as const,
  },
]

// Arbitrum Sepolia specific cross-chain markets (source side, pools on BSC)
export const arbitrumSepoliaMarkets: Asset[] = [
  {
    id: "axl-wbnb",
    name: "Axelar WBNB",
    symbol: "WBNB",
    icon: "/tokenimages/app/bnb-logo.svg",
    supplyApy: 0,
    borrowApy: 0,
    wallet: "0 WBNB",
    change24h: 0,
    price: 0,
    marketCap: "0",
    volume24h: "0",
    liquidity: "0",
    utilizationRate: 0,
    liquidationThreshold: 85.0,
    liquidationPenalty: 5.0,
    maxLTV: 80.0,
    oraclePrice: 0,
    hasSmartContract: true,
    decimals: 18,
  },
  {
    id: "axl-ausdc",
    name: "Axelar aUSDC",
    symbol: "aUSDC",
    icon: "/tokenimages/app/usd-coin-usdc-logo.svg",
    supplyApy: 0,
    borrowApy: 0,
    wallet: "0 aUSDC",
    change24h: 0,
    price: 1.0,
    marketCap: "0",
    volume24h: "0",
    liquidity: "0",
    utilizationRate: 0,
    liquidationThreshold: 90.0,
    liquidationPenalty: 4.0,
    maxLTV: 85.0,
    oraclePrice: 1.0,
    hasSmartContract: true,
    decimals: 6,
  },
  {
    id: "axl-wavax",
    name: "Axelar WAVAX",
    symbol: "WAVAX",
    icon: "/tokenimages/app/avax.png",
    supplyApy: 0,
    borrowApy: 0,
    wallet: "0 WAVAX",
    change24h: 0,
    price: 0,
    marketCap: "0",
    volume24h: "0",
    liquidity: "0",
    utilizationRate: 0,
    liquidationThreshold: 85.0,
    liquidationPenalty: 5.0,
    maxLTV: 80.0,
    oraclePrice: 0,
    hasSmartContract: true,
    decimals: 18,
  },
]

// Helper: identify cross-chain Axelar asset IDs
export const AXELAR_CROSS_CHAIN_ASSET_IDS = new Set<string>()

// Helper: map assetId to Axelar symbol expected by PeridotSpoke
export const AXELAR_ASSET_ID_TO_SYMBOL: Record<string, string> = {
  "axl-wbnb": "WBNB",
  "axl-ausdc": "aUSDC",
  "axl-wavax": "WAVAX",
}

// Populate cross-chain Axelar asset ids
AXELAR_CROSS_CHAIN_ASSET_IDS.add('axl-wbnb')
AXELAR_CROSS_CHAIN_ASSET_IDS.add('axl-ausdc')
AXELAR_CROSS_CHAIN_ASSET_IDS.add('axl-wavax')

// Somneia Minato Testnet specific markets
export const somniaTestnetMarkets: Asset[] = [
  {
    id: "usdt",
    name: "USDT",
    symbol: "USDT",
    icon: "/tokenimages/app/tether-usdt-logo.svg",
    supplyApy: 0,
    borrowApy: 0,
    wallet: "0 USDT",
    change24h: 0,
    price: 1.0,
    marketCap: "0",
    volume24h: "0",
    liquidity: "0",
    utilizationRate: 0,
    liquidationThreshold: 90.0,
    liquidationPenalty: 4.0,
    maxLTV: 85.0,
    oraclePrice: 1.0,
    hasSmartContract: true,
    decimals: 18,
  },
  {
    id: "som",
    name: "Somnia",
    symbol: "SOM",
    icon: "/tokenimages/app/somnia_logo_color.jpg",
    supplyApy: 0,
    borrowApy: 0,
    wallet: "0 SOM",
    change24h: 0,
    price: 0,
    marketCap: "0",
    volume24h: "0",
    liquidity: "0",
    utilizationRate: 0,
    liquidationThreshold: 80.0,
    liquidationPenalty: 5.0,
    maxLTV: 75.0,
    oraclePrice: 0,
    hasSmartContract: true,
    decimals: 18,
  },

]

// Monad Testnet specific markets
export const monadTestnetMarkets: Asset[] = [
  {
    id: "usdc",
    name: "USDC",
    symbol: "USDC",
    icon: "/tokenimages/app/usd-coin-usdc-logo.svg",
    supplyApy: 3.5,
    borrowApy: 4.5,
    wallet: "0 USDC",
    change24h: 0.0,
    price: 1.0,
    marketCap: "$25B",
    volume24h: "$5B",
    liquidity: "0",
    liquidationThreshold: 85.0,
    liquidationPenalty: 5.0,
    maxLTV: 80.0,
    oraclePrice: 1.0,
    hasSmartContract: true,
    decimals: 6,
  },
  {
    id: "usdt",
    name: "Tether",
    symbol: "USDT",
    icon: "/tokenimages/app/tether-usdt-logo.svg",
    supplyApy: 2.18,
    borrowApy: 3.42,
    wallet: "0 USDT",
    change24h: 0.02,
    price: 1.0,
    marketCap: "$83.2B",
    volume24h: "$42.5B",
    liquidity: "0",
    liquidationThreshold: 90.0,
    liquidationPenalty: 4.0,
    maxLTV: 85.0,
    oraclePrice: 1.0,
    hasSmartContract: true,
    decimals: 6,
  },
  {
    id: "weth",
    name: "Wrapped Ether",
    symbol: "WETH",
    icon: "/tokenimages/eth.png",
    supplyApy: 0,
    borrowApy: 0,
    wallet: "0 WETH",
    change24h: 0,
    price: 0,
    marketCap: "0",
    volume24h: "0",
    liquidity: "0",
    utilizationRate: 0,
    liquidationThreshold: 85.0,
    liquidationPenalty: 5.0,
    maxLTV: 80.0,
    oraclePrice: 0,
    hasSmartContract: true,
    decimals: 18,
  },
  {
    id: "wbtc",
    name: "Wrapped BTC",
    symbol: "WBTC",
    icon: "/tokenimages/app/btc-logo-trans.png",
    supplyApy: 0,
    borrowApy: 0,
    wallet: "0 WBTC",
    change24h: 0,
    price: 0,
    marketCap: "0",
    volume24h: "0",
    liquidity: "0",
    utilizationRate: 0,
    liquidationThreshold: 85.0,
    liquidationPenalty: 5.0,
    maxLTV: 80.0,
    oraclePrice: 0,
    hasSmartContract: true,
    decimals: 8,
  },
  {
    id: "link",
    name: "Chainlink",
    symbol: "LINK",
    icon: "/tokenimages/link.png",
    supplyApy: 0,
    borrowApy: 0,
    wallet: "0 LINK",
    change24h: 0,
    price: 0,
    marketCap: "0",
    volume24h: "0",
    liquidity: "0",
    utilizationRate: 0,
    liquidationThreshold: 80.0,
    liquidationPenalty: 8.0,
    maxLTV: 75.0,
    oraclePrice: 0,
    hasSmartContract: true,
    decimals: 18,
  },
  {
    id: "peridot",
    name: "Peridot",
    symbol: "$P",
    icon: "/logo.svg",
    supplyApy: 0,
    borrowApy: 0,
    wallet: "0 PDT",
    change24h: 0,
    price: 0,
    marketCap: "0",
    volume24h: "0",
    liquidity: "0",
    utilizationRate: 0,
    liquidationThreshold: 80.0,
    liquidationPenalty: 10.0,
    maxLTV: 75.0,
    oraclePrice: 0,
    hasSmartContract: true,
    decimals: 18,
  },
  {
    id: "pusd",
    name: "PUSD",
    symbol: "$PUSD",
    icon: "/tokenimages/app/PUSD-1.png",
    supplyApy: 0,
    borrowApy: 0,
    wallet: "0 PUSD",
    change24h: 0,
    price: 0,
    marketCap: "0",
    volume24h: "0",
    liquidity: "0",
    utilizationRate: 0,
    liquidationThreshold: 80.0,
    liquidationPenalty: 10.0,
    maxLTV: 75.0,
    oraclePrice: 0,
    hasSmartContract: true,
    decimals: 18,
  },
  {
    id: "rusdc",
    name: "Relend USDC",
    symbol: "$rUSDC",
    icon: "/tokenimages/app/rusdc-logo.png",
    supplyApy: 0,
    borrowApy: 0,
    wallet: "0 rUSDC",
    change24h: 0,
    price: 1.0,
    marketCap: "0",
    volume24h: "0",
    liquidity: "0",
    utilizationRate: 0,
    liquidationThreshold: 80.0,
    liquidationPenalty: 10.0,
    maxLTV: 75.0,
    oraclePrice: 1.0,
    hasSmartContract: true,
    decimals: 6,
  },
  {
    id: "gmon",
    name: "Magma MONAD",
    symbol: "$gMON",
    icon: "/tokenimages/app/gMonad.svg",
    supplyApy: 0,
    borrowApy: 0,
    wallet: "0 gMON",
    change24h: 0,
    price: 0.04,
    marketCap: "0",
    volume24h: "0",
    liquidity: "0",
    utilizationRate: 0,
    liquidationThreshold: 80.0,
    liquidationPenalty: 10.0,
    maxLTV: 75.0,
    oraclePrice: 0.04,
    hasSmartContract: true,
    decimals: 18,
  }
]

// Monad Mainnet specific markets
export const monadMainnetMarkets: Asset[] = [
  {
    id: "usdc",
    name: "USDC",
    symbol: "USDC",
    icon: "/tokenimages/app/usd-coin-usdc-logo.svg",
    supplyApy: 0,
    borrowApy: 0,
    wallet: "0 USDC",
    change24h: 0,
    price: 1.0,
    marketCap: "0",
    volume24h: "0",
    liquidity: "0",
    utilizationRate: 0,
    liquidationThreshold: 85.0,
    liquidationPenalty: 5.0,
    maxLTV: 80.0,
    oraclePrice: 1.0,
    hasSmartContract: true,
    decimals: 6,
  },
  {
    id: "ausd",
    name: "Agora USD",
    symbol: "AUSD",
    icon: "/tokenimages/app/agora.svg",
    supplyApy: 0,
    borrowApy: 0,
    wallet: "0 AUSD",
    change24h: 0,
    price: 1.0,
    marketCap: "0",
    volume24h: "0",
    liquidity: "0",
    utilizationRate: 0,
    liquidationThreshold: 80.0,
    liquidationPenalty: 5.0,
    maxLTV: 75.0,
    oraclePrice: 1.0,
    hasSmartContract: true,
    decimals: 6,
  },
  {
    id: "earnausd",
    name: "Earn AUSD",
    symbol: "earnAUSD",
    icon: "/tokenimages/app/earnAUSD.svg",
    supplyApy: 0,
    borrowApy: 0,
    wallet: "0 earnAUSD",
    change24h: 0,
    price: 1.0,
    marketCap: "0",
    volume24h: "0",
    liquidity: "0",
    utilizationRate: 0,
    liquidationThreshold: 80.0,
    liquidationPenalty: 5.0,
    maxLTV: 75.0,
    oraclePrice: 1.0,
    hasSmartContract: true,
    decimals: 6,
  },
  {
    id: "gmon",
    name: "Magma MONAD",
    symbol: "gMON",
    icon: "/tokenimages/app/gMonad.svg",
    supplyApy: 0,
    borrowApy: 0,
    wallet: "0 gMON",
    change24h: 0,
    price: 0.05,
    marketCap: "0",
    volume24h: "0",
    liquidity: "0",
    utilizationRate: 0,
    liquidationThreshold: 80.0,
    liquidationPenalty: 10.0,
    maxLTV: 75.0,
    oraclePrice: 0.05,
    hasSmartContract: true,
    decimals: 18,
  },
  {
    id: "mon",
    name: "Monad",
    symbol: "MON",
    icon: "/tokenimages/app/Monad-Logo.svg",
    supplyApy: 0,
    borrowApy: 0,
    wallet: "0 MON",
    change24h: 0,
    price: 0.05,
    marketCap: "0",
    volume24h: "0",
    liquidity: "0",
    utilizationRate: 0,
    liquidationThreshold: 75.0,
    liquidationPenalty: 12.0,
    maxLTV: 70.0,
    oraclePrice: 0.05,
    hasSmartContract: true,
    decimals: 18,
  },
  {
    id: "morpho-boosted-ausd",
    name: "Morpho Boosted AUSD",
    symbol: "AUSD",
    icon: "/tokenimages/app/agora.svg", // Use AUSD icon with boosted styling
    supplyApy: 0,
    borrowApy: 0,
    wallet: "0 pAUSD",
    change24h: 0,
    price: 1.0,
    marketCap: "0",
    volume24h: "0",
    liquidity: "0",
    utilizationRate: 0,
    liquidationThreshold: 80.0,
    liquidationPenalty: 5.0,
    maxLTV: 75.0,
    oraclePrice: 1.0,
    hasSmartContract: true,
    decimals: 6,
    category: "boosted",
  },
  {
    id: "morpho-boosted-usdc",
    name: "Morpho Boosted USDC",
    symbol: "USDC",
    icon: "/tokenimages/app/usd-coin-usdc-logo.svg", // Use USDC icon with boosted styling
    supplyApy: 0,
    borrowApy: 0,
    wallet: "0 pUSDC",
    change24h: 0,
    price: 1.0,
    marketCap: "0",
    volume24h: "0",
    liquidity: "0",
    utilizationRate: 0,
    liquidationThreshold: 80.0,
    liquidationPenalty: 5.0,
    maxLTV: 75.0,
    oraclePrice: 1.0,
    hasSmartContract: true,
    decimals: 6,
    category: "boosted",
  },
  {
    id: "pancake-boosted-lp-ausd-usdc",
    name: "LP Boosted AUSD/USDC",
    symbol: "pLP-AUSD/USDC",
    icon: "/tokenimages/app/pancakeswap-cake-logo.svg", // Use PancakeSwap icon
    supplyApy: 0,
    borrowApy: 0,
    wallet: "0 pLP-AUSD/USDC",
    change24h: 0,
    price: 1.0, // Approximate LP token price
    marketCap: "0",
    volume24h: "0",
    liquidity: "0",
    utilizationRate: 0,
    liquidationThreshold: 80.0,
    liquidationPenalty: 5.0,
    maxLTV: 75.0,
    oraclePrice: 1.0,
    hasSmartContract: true,
    decimals: 18,
    category: "boosted",
  },
  {
    id: "magma-boosted-wmon",
    name: "Magma Staked WMON",
    symbol: "MON",
    icon: "/tokenimages/app/Monad-Logo.svg",
    supplyApy: 0,
    borrowApy: 0,
    wallet: "0 WMON",
    change24h: 0,
    price: 2.85, // Placeholder price, updated via oracle/live feed
    marketCap: "0",
    volume24h: "0",
    liquidity: "0",
    utilizationRate: 0,
    liquidationThreshold: 80.0,
    liquidationPenalty: 5.0,
    maxLTV: 75.0,
    oraclePrice: 2.85,
    hasSmartContract: true,
    decimals: 18,
    category: "boosted",
    canAutoWrap: true,
    nativeSymbol: "MON",
  }
]

// Function to get markets based on chain ID
function isBscChain(chainId?: number) {
  return chainId === CHAIN_IDS.BSC_MAINNET || chainId === CHAIN_IDS.BSC_TESTNET
}

function filterBscExclusiveAssets(markets: Asset[], chainId?: number) {
  if (isBscChain(chainId)) return markets

  // Filter out BSC-only assets when not on BSC, but keep foreign assets
  let filtered = markets.filter(asset => {
    // Keep foreign assets (they have availableOnChainId)
    if (asset.availableOnChainId) return true
    // Filter out BSC-only assets that are local to non-BSC chains
    return !BSC_ONLY_ASSET_IDS.has(asset.id)
  })

  // Additionally filter out WBNB when on Base chain
  if (chainId === CHAIN_IDS.BASE_MAINNET) {
    filtered = filtered.filter(asset => asset.id !== 'wbnb')
  }

  return filtered
}

function getDefaultChainIdFromEnv(): number | undefined {
  const preset = process.env.NEXT_PUBLIC_NETWORK_PRESET
  const envDefault = process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID
  if (preset === 'mainnet-bsc-only') return CHAIN_IDS.BSC_MAINNET
  if (envDefault) {
    const id = Number(envDefault)
    if (!Number.isNaN(id)) return id
  }
  // fallback to BSC testnet by default in test deployments
  return CHAIN_IDS.BSC_TESTNET
}

// Helper to adjust decimals for EVM spoke chains where USDC/USDT are 6 decimals (unlike BSC's 18)
function adjustDecimalsForSpokeChain(markets: Asset[]): Asset[] {
  return markets.map(asset => {
    if (asset.id === 'usdc' || asset.id === 'usdt') {
      return { ...asset, decimals: 6 }
    }
    return asset
  })
}

export function getMarketsForChain(chainId?: number): Asset[] {
  if (!chainId) {
    const defaultChainId = getDefaultChainIdFromEnv()
    switch (defaultChainId) {
      case CHAIN_IDS.BSC_MAINNET:
        return bscMainnetMarkets
      case CHAIN_IDS.BSC_TESTNET:
        return bscTestnetMarkets
      case CHAIN_IDS.MONAD_TESTNET:
        return monadTestnetMarkets
      case CHAIN_IDS.SOMNIA_TESTNET:
        return somniaTestnetMarkets
      case CHAIN_IDS.MONAD_MAINNET:
        return monadMainnetMarkets
      default:
        // Generic fallback for unknown chain IDs — show the cross-chain
        // stable + blue-chip slice from combinedMarkets.
        return combinedMarkets.filter(asset =>
          ['usdt', 'usdc', 'weth', 'wbtc'].includes(asset.id)
        );
    }
  }

  switch (chainId) {
    case 1:
      // On Ethereum mainnet, show BSC markets (hub) to keep TVL/liq/incentive data consistent
      return adjustDecimalsForSpokeChain(filterBscExclusiveAssets(bscMainnetMarkets, chainId))
    case CHAIN_IDS.ARBITRUM_MAINNET:
      // On Arbitrum mainnet, show BSC markets (hub) to keep TVL/liq/incentive data consistent
      return adjustDecimalsForSpokeChain(filterBscExclusiveAssets(bscMainnetMarkets, chainId))
    case CHAIN_IDS.ARBITRUM_SEPOLIA:
      // Testnet spoke chain: show only 3 Axelar tokens
      return filterBscExclusiveAssets(arbitrumSepoliaMarkets, chainId)
    case CHAIN_IDS.BASE_SEPOLIA:
      // Testnet spoke chain: show only 3 Axelar tokens
      return filterBscExclusiveAssets(arbitrumSepoliaMarkets, chainId)
    case CHAIN_IDS.ETHEREUM_SEPOLIA:
      // Testnet spoke chain: show only 3 Axelar tokens
      return filterBscExclusiveAssets(arbitrumSepoliaMarkets, chainId)
    case CHAIN_IDS.BSC_TESTNET:
      return filterBscExclusiveAssets(bscTestnetMarkets, chainId);
    case CHAIN_IDS.BSC_MAINNET:
      return filterBscExclusiveAssets(bscMainnetMarkets, chainId);
    case CHAIN_IDS.MONAD_TESTNET:
      // For Monad testnet, show only Monad markets; do not bleed Axelar assets in
      return filterBscExclusiveAssets(monadTestnetMarkets, chainId);
    case CHAIN_IDS.MONAD_MAINNET:
      // For Monad mainnet, show only Monad markets
      return filterBscExclusiveAssets(monadMainnetMarkets, chainId);
    case CHAIN_IDS.SOMNIA_TESTNET:
      // For Somnia testnet, show only Somnia markets
      return filterBscExclusiveAssets(somniaTestnetMarkets, chainId);
    case CHAIN_IDS.POLYGON_MAINNET:
      // On Polygon mainnet, show BSC markets (hub) to keep TVL/liq/incentive data consistent
      return adjustDecimalsForSpokeChain(filterBscExclusiveAssets(bscMainnetMarkets, chainId))
    case CHAIN_IDS.AVALANCHE_MAINNET:
      // On Avalanche mainnet, show BSC markets (hub) to keep TVL/liq/incentive data consistent
      return adjustDecimalsForSpokeChain(filterBscExclusiveAssets(bscMainnetMarkets, chainId))
    case CHAIN_IDS.BASE_MAINNET:
      // On Base mainnet, show BSC markets (hub) to keep TVL/liq/incentive data consistent
      return adjustDecimalsForSpokeChain(filterBscExclusiveAssets(bscMainnetMarkets, chainId))
    default:
      return filterBscExclusiveAssets(
        combinedMarkets.filter(asset => !asset.hasSmartContract),
        chainId
      ); // Show only coming soon markets
  }
}

// Helper to get hub chain IDs based on environment
export const getHubChainIds = (isTestnet: boolean) => {
  return isTestnet 
    ? [CHAIN_IDS.BSC_TESTNET, CHAIN_IDS.MONAD_TESTNET, CHAIN_IDS.SOMNIA_TESTNET]
    : [CHAIN_IDS.BSC_MAINNET, CHAIN_IDS.MONAD_MAINNET];
}

// Priority order for assets within each chain (most important first).
// Includes ids that no longer live in combinedMarkets but still exist as
// per-chain entries (peridot, pusd, link, rusdc on bscTestnet/monadTestnet) —
// removing them here would push those per-chain rows to the end of the sort.
const ASSET_PRIORITY_ORDER = [
  'usdc', 'usdt', 'ausd', 'earnausd', 'wbnb', 'bnb', 'weth', 'wbtc', 'peridot', 'pusd', 'link',
  'cake', 'aster', 'mon', 'rusdc', 'gmon', 'btcb', 'som', 'doge',
  'aaplon', 'nvdaon', 'googlon', 'tslaon', 'msfton', // tokenized stocks
];

// Helper function to sort assets by priority
function sortAssetsByPriority(assets: Asset[]): Asset[] {
  return [...assets].sort((a, b) => {
    const aIndex = ASSET_PRIORITY_ORDER.indexOf(a.id);
    const bIndex = ASSET_PRIORITY_ORDER.indexOf(b.id);

    // Assets not in priority list go to the end
    const aPriority = aIndex === -1 ? ASSET_PRIORITY_ORDER.length : aIndex;
    const bPriority = bIndex === -1 ? ASSET_PRIORITY_ORDER.length : bIndex;

    return aPriority - bPriority;
  });
}

// Function to get all markets with network-specific prioritization and foreign markets
export function getMarketsWithPrioritization(chainId?: number): Asset[] {
  if (!chainId) {
    const defaultChainId = getDefaultChainIdFromEnv()
    return sortAssetsByPriority(getMarketsForChain(defaultChainId))
  }

  // 1. Get active markets for the current chain and sort by priority
  const localMarkets = sortAssetsByPriority(getMarketsForChain(chainId));
  const localMarketIds = new Set(localMarkets.map(m => m.id));

  // 2. Identify if we are in Testnet or Mainnet mode to show relevant hubs
  const testnetChainIds = new Set<number>([
    CHAIN_IDS.BSC_TESTNET,
    CHAIN_IDS.MONAD_TESTNET,
    CHAIN_IDS.SOMNIA_TESTNET,
    CHAIN_IDS.ARBITRUM_SEPOLIA,
    CHAIN_IDS.BASE_SEPOLIA,
    CHAIN_IDS.ETHEREUM_SEPOLIA
  ]);
  const isTestnet = chainId ? testnetChainIds.has(chainId) : false;

  const hubChainIds = getHubChainIds(isTestnet);
  const foreignAssets: Asset[] = [];

  // 3. Foreign market collection removed to focus on current chain's native markets
  // This prevents the table from showing assets from other hub chains (e.g. showing Somnia assets while on Monad)
  /*
  hubChainIds.forEach(hubId => {
    // Skip if the hub is the current chain
    if (hubId === chainId) return;

    const hubMarkets = sortAssetsByPriority(getMarketsForChain(hubId));

    hubMarkets.forEach(asset => {
      // Only add if not already present locally
      if (!localMarketIds.has(asset.id)) {
        // Check if we haven't already added this asset from another hub
        // (e.g. if an asset exists on 2 other hubs, pick the first one we find)
        if (!foreignAssets.some(fa => fa.id === asset.id)) {
          foreignAssets.push({
            ...asset,
            hasSmartContract: false, // Disable interaction
            availableOnChainId: hubId, // Tag with source chain
          });
        }
      }
    });
  });
  */

  // 4. Sort foreign assets by priority as well
  const sortedForeignAssets = sortAssetsByPriority(foreignAssets);

  // 5. Get generic "Coming Soon" markets (no smart contract anywhere)
  // These are assets in `combinedMarkets` that don't exist in local or foreign sets
  const purelyComingSoon = combinedMarkets.filter(m =>
    !m.hasSmartContract &&
    !localMarketIds.has(m.id) &&
    !sortedForeignAssets.some(fa => fa.id === m.id)
  );

  // Combine all lists - local markets first, then foreign, then coming soon
  const result = [...localMarkets, ...sortedForeignAssets, ...purelyComingSoon];

  // Apply legacy filtering (e.g. for spoke chains)
  return filterBscExclusiveAssets(result, chainId);
}

// Stellar Soroban: audited mainnet launch surface — XLM + USDC + EURC.
export function getStellarSorobanMarkets(): Asset[] {
  const m = stellarSorobanMainnetContracts.markets
  // A market is treated as boosted only when (a) the feature flag is on and
  // (b) a DeFindex vault address is configured for it. The on-chain admin
  // call set_boosted_vault must already have happened — until then the user
  // sees no boost contribution because the worker writes 0 to the DB.
  const usdcBoosted =
    FEATURE_FLAGS.STELLAR_BOOSTED_MARKETS && Boolean((m.USDC as any).boostedVault)
  const eurcBoosted =
    FEATURE_FLAGS.STELLAR_BOOSTED_MARKETS && Boolean((m.EURC as any).boostedVault)
  const xlmBoosted =
    FEATURE_FLAGS.STELLAR_BOOSTED_MARKETS && Boolean((m.XLM as any).boostedVault)

  const xlm: Asset = {
    id: "xlm-stellar",
    // m.XLM.name is the pToken (receipt token) name from the vault contract —
    // surfacing it as the asset list label produces "Peridot XLM" everywhere.
    // Use the underlying asset's user-facing name instead, matching the EVM
    // entries (which never reference pToken names in the list).
    name: "Stellar Lumens",
    symbol: m.XLM.symbol,
    icon: "/tokenimages/app/stellar.svg",
    supplyApy: 0,
    borrowApy: 0,
    wallet: `0 ${m.XLM.symbol}`,
    change24h: 0,
    price: 0,
    marketCap: "0",
    volume24h: "0",
    liquidity: "0",
    utilizationRate: 0,
    liquidationThreshold: 92.0,
    liquidationPenalty: 4.0,
    maxLTV: 90.0, // matches CF 0.90 (mirrors USDC/EURC after the rebalance)
    oraclePrice: 0,
    hasSmartContract: true,
    decimals: m.XLM.decimals,
    ...(xlmBoosted ? { category: "boosted" as const } : {}),
  }

  const usdc: Asset = {
    id: "usdc-stellar",
    name: "USD Coin",
    symbol: m.USDC.symbol,
    icon: "/tokenimages/app/usd-coin-usdc-logo.svg",
    supplyApy: 0,
    borrowApy: 0,
    wallet: `0 ${m.USDC.symbol}`,
    change24h: 0,
    price: 0,
    marketCap: "0",
    volume24h: "0",
    liquidity: "0",
    utilizationRate: 0,
    liquidationThreshold: 92.0,
    liquidationPenalty: 4.0,
    maxLTV: 90.0, // matches CF 0.90
    oraclePrice: 1.0,
    hasSmartContract: true,
    decimals: m.USDC.decimals,
    ...(usdcBoosted ? { category: "boosted" as const } : {}),
  }

  const eurc: Asset = {
    id: "eurc-stellar",
    name: "Euro Coin",
    symbol: m.EURC.symbol,
    icon: "/tokenimages/app/eurc.svg",
    supplyApy: 0,
    borrowApy: 0,
    wallet: `0 ${m.EURC.symbol}`,
    change24h: 0,
    price: 0,
    marketCap: "0",
    volume24h: "0",
    liquidity: "0",
    utilizationRate: 0,
    liquidationThreshold: 92.0,
    liquidationPenalty: 4.0,
    maxLTV: 90.0,
    oraclePrice: 0,
    hasSmartContract: true,
    decimals: m.EURC.decimals,
    ...(eurcBoosted ? { category: "boosted" as const } : {}),
  }

  return [xlm, usdc, eurc]
}

// Function to get contract addresses for an asset on a specific chain
export function getAssetContractAddresses(assetId: string, chainId: number) {
  const chainConfig = getChainConfig(chainId)
  if (!chainConfig || !("markets" in chainConfig)) {
    return null
  }

  const markets = chainConfig.markets as any

  // Map asset IDs to market keys
  const assetToMarketKey: { [key: string]: string } = {
    pusd: "PUSD",
    usdc: "USDC",
    usdt: "USDT",
    link: "LINK",
    peridot: "PDT",
    monad: "WMON",
    mon: "MON", // Monad native token
    gmon: "gMON",
    weth: "WETH",
    wbtc: "WBTC",
    wbnb: "WBNB",
    ausd: "AUSD",
    earnausd: "earnAUSD", // Updated mapping
    rusdc: "rUSDC",
    "morpho-boosted-ausd": "MORPHO_BOOSTED_AUSD",
    "morpho-boosted-usdc": "MORPHO_BOOSTED_USDC",
    "magma-boosted-wmon": "MAGMA_BOOSTED_WMON",
    "pancake-boosted-lp-ausd-usdc": "PANCAKE_BOOSTED_LP_AUSD_USDC",
    btcb: "BTCB",
    bnb: "BNB",
    cake: "CAKE",
    aster: "ASTER",
    doge: "DOGE",
    som: "SOM", // Somnia native token
    somi: "SOM", // Alternative mapping for consistency
    // Tokenized stocks
    aaplon: "AAPLon",
    nvdaon: "NVDAon",
    googlon: "GOOGLon",
    tslaon: "TSLAon",
    msfton: "MSFTon",
    // Axelar cross-chain assets
    "axl-wbnb": "AXL_WBNB",
    "axl-ausdc": "AXL_USDC", 
    "axl-wavax": "AXL_WAVAX",
  }

  const marketKey = assetToMarketKey[assetId]
  if (marketKey && markets[marketKey]) {
    const market = markets[marketKey]
    const isNative = Boolean(market.isNative)
    return {
      pTokenAddress: market.pToken,
      underlyingAddress: market.underlying,
      isNative,
    }
  }

  return null
} 

export function getAssetById(assetId: string): Asset | undefined {
  const stellarMarket = getStellarSorobanMarkets().find(market => market.id === assetId)
  if (stellarMarket) return stellarMarket

  return (
    combinedMarkets.find(market => market.id === assetId) ||
    bscMainnetMarkets.find(market => market.id === assetId) ||
    bscTestnetMarkets.find(market => market.id === assetId) ||
    arbitrumSepoliaMarkets.find(market => market.id === assetId) ||
    monadTestnetMarkets.find(market => market.id === assetId) ||
    monadMainnetMarkets.find(market => market.id === assetId) ||
    somniaTestnetMarkets.find(market => market.id === assetId)
  )
} 

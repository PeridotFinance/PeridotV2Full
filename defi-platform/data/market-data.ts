import { Asset } from "@/types/markets"
import { getChainConfig, CHAIN_IDS } from "@/config/contracts"

// Combined market data
export const combinedMarkets: Asset[] = [
  // New tokens with smart contracts available
  {
    id: "xdc",
    name: "XDC Network",
    symbol: "XDC",
    icon: "/tokenimages/app/XDC-Primary-Color-Logo.svg",
    supplyApy: 4.25,
    borrowApy: 5.50,
    wallet: "0 XDC",
    change24h: 3.45,
    price: 0.045,
    marketCap: "$612M",
    volume24h: "$28.4M",
    liquidity: "$425K",
    utilizationRate: 58.2,
    liquidationThreshold: 80.0,
    liquidationPenalty: 8.0,
    maxLTV: 75.0,
    oraclePrice: 0.045,
    hasSmartContract: true,
  },
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
    marketCap: "$104B",
    volume24h: "$1.2B",
    liquidity: "$2.8M",
    utilizationRate: 62.1,
    liquidationThreshold: 85.0,
    liquidationPenalty: 5.0,
    maxLTV: 80.0,
    oraclePrice: 682.45,
    hasSmartContract: true,
  },
  {
    id: "monad",
    name: "Monad",
    symbol: "MONAD",
    icon: "/tokenimages/app/Monad-Logo.svg",
    supplyApy: 6.85,
    borrowApy: 8.12,
    wallet: "0 MONAD",
    change24h: 12.45,
    price: 2.85,
    marketCap: "$285M",
    volume24h: "$45.7M",
    liquidity: "$187K",
    utilizationRate: 41.8,
    liquidationThreshold: 75.0,
    liquidationPenalty: 12.0,
    maxLTV: 70.0,
    oraclePrice: 2.85,
    hasSmartContract: true,
  },
  // Existing tokens without smart contracts (greyed out)
  {
    id: "sol",
    name: "Solana",
    symbol: "SOL",
    icon: "/tokenimages/app/solana-sol-logo.svg",
    supplyApy: 3.42,
    borrowApy: 4.78,
    wallet: "0 SOL",
    change24h: 4.78,
    price: 148.93,
    marketCap: "$67.2B",
    volume24h: "$3.8B",
    liquidity: "$3.8M",
    utilizationRate: 65.5,
    liquidationThreshold: 85.0,
    liquidationPenalty: 5.0,
    maxLTV: 90.0,
    oraclePrice: 148.93,
    hasSmartContract: false,
  },
  {
    id: "peridot",
    name: "Peridot",
    symbol: "$P",
    icon: "/logo.svg",
    supplyApy: 8.64,
    borrowApy: 9.21,
    wallet: "0 PDT",
    change24h: 7.21,
    price: 14.86,
    marketCap: "$742M",
    volume24h: "$56.3M",
    liquidity: "$562K",
    utilizationRate: 72.3,
    liquidationThreshold: 80.0,
    liquidationPenalty: 10.0,
    maxLTV: 75.0,
    oraclePrice: 14.86,
    hasSmartContract: true,
  },
  {
    id: "stellar",
    name: "Stellar",
    symbol: "XLM",
    icon: "/tokenimages/app/stellar.svg",
    supplyApy: 5.78,
    borrowApy: 6.87,
    wallet: "0 XLM",
    change24h: 9.87,
    price: 2.47,
    marketCap: "$412M",
    volume24h: "$39M",
    liquidity: "$212K",
    utilizationRate: 45.2,
    liquidationThreshold: 85.0,
    liquidationPenalty: 5.0,
    maxLTV: 80.0,
    oraclePrice: 2.47,
    hasSmartContract: false,
  },
  {
    id: "iota",
    name: "IOTA",
    symbol: "MIOTA",
    icon: "/tokenimages/app/iota-iota-logo.svg",
    supplyApy: 4.36,
    borrowApy: 5.65,
    wallet: "0 MIOTA",
    change24h: 3.65,
    price: 0.32,
    marketCap: "$895M",
    volume24h: "$64M",
    liquidity: "$124K",
    utilizationRate: 38.7,
    liquidationThreshold: 75.0,
    liquidationPenalty: 15.0,
    maxLTV: 70.0,
    oraclePrice: 0.32,
    hasSmartContract: false,
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
    id: "eth",
    name: "Ether",
    symbol: "ETH",
    icon: "/tokenimages/app/ethereum-eth-logo.svg",
    supplyApy: 0.02,
    borrowApy: 2.34,
    wallet: "0 ETH",
    change24h: 2.34,
    price: 3521.48,
    marketCap: "$423B",
    volume24h: "$18.7B",
    liquidity: "$15.5M",
    utilizationRate: 55.8,
    liquidationThreshold: 85.0,
    liquidationPenalty: 5.0,
    maxLTV: 80.0,
    oraclePrice: 3521.48,
    hasSmartContract: false,
  },
  {
    id: "link",
    name: "Chainlink",
    symbol: "LINK",
    icon: "/tokenimages/link.png",
    supplyApy: 4.25,
    borrowApy: 5.50,
    wallet: "0 LINK",
    change24h: 3.45,
    price: 15.42,
    marketCap: "$9.8B",
    volume24h: "$584M",
    liquidity: "$425K",
    utilizationRate: 58.2,
    liquidationThreshold: 80.0,
    liquidationPenalty: 8.0,
    maxLTV: 75.0,
    oraclePrice: 15.42,
    hasSmartContract: true,
  },
]

// BSC Testnet specific markets
export const bscTestnetMarkets: Asset[] = [
  {
    id: "pusd",
    name: "PUSD (BNB)",
    symbol: "PUSD",
    icon: "/tokenimages/app/tether-usdt-logo.svg", // Using USDT icon as placeholder
    supplyApy: 2.85,
    borrowApy: 3.95,
    wallet: "0 PUSD",
    change24h: 0.15,
    price: 1.0,
    marketCap: "$1.2B",
    volume24h: "$85.4M",
    liquidity: "$425K",
    utilizationRate: 65.2,
    liquidationThreshold: 90.0,
    liquidationPenalty: 5.0,
    maxLTV: 85.0,
    oraclePrice: 1.0,
    hasSmartContract: true,
  },
  {
    id: "peridot",
    name: "Peridot (BSC)",
    symbol: "PDT",
    icon: "/logo.svg",
    supplyApy: 8.64,
    borrowApy: 9.21,
    wallet: "0 PDT",
    change24h: 7.21,
    price: 14.86,
    marketCap: "$742M",
    volume24h: "$56.3M",
    liquidity: "$562K",
    utilizationRate: 72.3,
    liquidationThreshold: 80.0,
    liquidationPenalty: 10.0,
    maxLTV: 75.0,
    oraclePrice: 14.86,
    hasSmartContract: true,
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
    icon: "/tokenimages/app/bitcoin-btc-logo.svg",
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
]

// Function to get markets based on chain ID
export function getMarketsForChain(chainId?: number): Asset[] {
  if (!chainId) {
    // When no wallet is connected, show active tokens first, then coming soon tokens
    const activeTokens = combinedMarkets.filter(asset => 
      ['usdt', 'usdc', 'link', 'peridot'].includes(asset.id)
    );
    const comingSoonTokens = combinedMarkets.filter(asset => 
      ['sol', 'stellar', 'iota', 'eth'].includes(asset.id)
    );
    return [...activeTokens, ...comingSoonTokens];
  }

  switch (chainId) {
    case CHAIN_IDS.BSC_TESTNET:
      return bscTestnetMarkets;
    case CHAIN_IDS.MONAD_TESTNET:
      // For Monad testnet, show only the 5 supported tokens at the top
      return monadTestnetMarkets;
    default:
      return combinedMarkets.filter(asset => !asset.hasSmartContract); // Show only coming soon markets
  }
}

// Function to get all markets with network-specific prioritization
export function getMarketsWithPrioritization(chainId?: number): Asset[] {
  if (!chainId) {
    // When no wallet is connected, show active tokens first, then coming soon tokens
    const activeTokens = combinedMarkets.filter(asset => 
      ['usdt', 'usdc', 'link', 'peridot'].includes(asset.id)
    );
    const comingSoonTokens = combinedMarkets.filter(asset => 
      ['sol', 'stellar', 'iota', 'eth'].includes(asset.id)
    );
    return [...activeTokens, ...comingSoonTokens];
  }

  const networkSpecificMarkets = getMarketsForChain(chainId);
  
  switch (chainId) {
    case CHAIN_IDS.MONAD_TESTNET:
      // Show Monad markets first, then others as "coming soon"
      const comingSoonMarkets = combinedMarkets
        .filter(asset => !asset.hasSmartContract)
        .filter(asset => !monadTestnetMarkets.some(m => m.id === asset.id));
      return [...networkSpecificMarkets, ...comingSoonMarkets];
      
    case CHAIN_IDS.BSC_TESTNET:
      // Show BSC markets first, then others as "coming soon"
      const bscComingSoonMarkets = combinedMarkets
        .filter(asset => !asset.hasSmartContract)
        .filter(asset => !bscTestnetMarkets.some(m => m.id === asset.id));
      return [...networkSpecificMarkets, ...bscComingSoonMarkets];
      
    default:
      return combinedMarkets.filter(asset => !asset.hasSmartContract);
  }
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
    weth: "WETH",
    wbtc: "WBTC",
  }

  const marketKey = assetToMarketKey[assetId]
  if (marketKey && markets[marketKey]) {
    return {
      pTokenAddress: markets[marketKey].pToken,
      underlyingAddress: markets[marketKey].underlying,
    }
  }

  return null
} 
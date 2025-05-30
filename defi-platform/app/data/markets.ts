// Define the types for our data
export type Asset = {
  id: string
  name: string
  symbol: string
  icon: string
  apy: number
  wallet: string
  collateral?: boolean
  liquidity?: string
  change24h?: number
  price?: number
  marketCap?: string
  volume24h?: string
  pTokenAddress?: `0x${string}`; // Address of the corresponding PToken contract
}

// Sample data for supply markets - Updated with realistic APYs and demo wallet amounts
export const supplyMarkets: Asset[] = [
  {
    id: "usdc",
    name: "USD Coin",
    symbol: "USDC", 
    icon: "/tokenimages/app/usd-coin-usdc-logo.svg",
    apy: 4.25, // Realistic supply rate
    wallet: "5000.00 USDC", // User has supplied $5,000 USDC in demo
    collateral: true,
    change24h: 0.01,
    price: 1.0,
    marketCap: "$28.4B",
    volume24h: "$2.1B",
  },
  {
    id: "eth",
    name: "Ethereum",
    symbol: "ETH",
    icon: "/tokenimages/app/ethereum-eth-logo.svg",
    apy: 3.85, // ETH supply rate
    wallet: "3.00 ETH", // User has supplied 3 ETH (~$10,564)
    collateral: true,
    change24h: 2.34,
    price: 3521.48,
    marketCap: "$423B",
    volume24h: "$18.7B",
    pTokenAddress: "0xB911C192ed1d6428A12F2Cf8F636B00c34e68a2a" as `0x${string}`, // pEther address for Soneium Minato
  },
  {
    id: "sol",
    name: "Solana",
    symbol: "SOL",
    icon: "/tokenimages/app/solana-sol-logo.svg",
    apy: 5.20, // SOL supply rate
    wallet: "150.50 SOL", // User has supplied ~150.5 SOL (~$22,414)
    collateral: true, // User enabled as collateral 
    change24h: 4.78,
    price: 148.93,
    marketCap: "$67.2B",
    volume24h: "$3.8B",
  },
  {
    id: "peridot",
    name: "Peridot",
    symbol: "PDT",
    icon: "/logo.svg",
    apy: 6.50, // Higher rate for project token
    wallet: "0 PDT", // User hasn't supplied any PDT yet
    collateral: true,
    change24h: 7.21,
    price: 14.86,
    marketCap: "$742M",
    volume24h: "$56.3M",
    pTokenAddress: "0x1DCb19949fC0a68cbdAa53Cce898B60D7436b14F", // pToken for Peridot (PDT)
  },
  {
    id: "usdt",
    name: "Tether",
    symbol: "USDT",
    icon: "/tokenimages/app/tether-usdt-logo.svg",
    apy: 3.80, // USDT supply rate (lower than borrow)
    wallet: "0 USDT", // User hasn't supplied USDT
    collateral: true,
    change24h: 0.02,
    price: 1.0,
    marketCap: "$83.2B",
    volume24h: "$42.5B",
  },
  {
    id: "stellar",
    name: "Stellar",
    symbol: "XLM",
    icon: "/tokenimages/app/stellar.svg",
    apy: 4.15, // XLM supply rate
    wallet: "0 XLM",
    collateral: true,
    change24h: 9.87,
    price: 2.47,
    marketCap: "$412M",
    volume24h: "$39M",
  },
  {
    id: "iota",
    name: "IOTA",
    symbol: "MIOTA",
    icon: "/tokenimages/app/iota-iota-logo.svg",
    apy: 4.85, // IOTA supply rate
    wallet: "0 MIOTA",
    collateral: true,
    change24h: 3.65,
    price: 0.32,
    marketCap: "$895M",
    volume24h: "$64M",
  },
]

// Sample data for borrow markets - Borrow rates higher than supply rates
export const borrowMarkets: Asset[] = [
  {
    id: "usdt",
    name: "Tether",
    symbol: "USDT",
    icon: "/tokenimages/app/tether-usdt-logo.svg",
    apy: 7.20, // Higher borrow rate than supply (3.80%)
    wallet: "1200.00 USDT", // User has borrowed $1,200 USDT  
    liquidity: "$1.2M",
    change24h: 0.02,
    price: 1.0,
    marketCap: "$83.2B",
    volume24h: "$42.5B",
  },
  {
    id: "usdc",
    name: "USD Coin",
    symbol: "USDC",
    icon: "/tokenimages/app/usd-coin-usdc-logo.svg",
    apy: 6.80, // Higher borrow rate than supply (4.25%)
    wallet: "3500.00 USDC", // User has borrowed $3,500 USDC
    liquidity: "$2.5M",
    change24h: 0.01,
    price: 1.0,
    marketCap: "$28.4B",
    volume24h: "$2.1B",
  },
  {
    id: "eth",
    name: "Ethereum",
    symbol: "ETH",
    icon: "/tokenimages/app/ethereum-eth-logo.svg",
    apy: 5.20, // Higher borrow rate than supply (3.85%)
    wallet: "0 ETH", // User hasn't borrowed ETH
    liquidity: "$15.5M",
    change24h: 2.34,
    price: 3521.48,
    marketCap: "$423B",
    volume24h: "$18.7B",
  },
  {
    id: "sol",
    name: "Solana",
    symbol: "SOL",
    icon: "/tokenimages/app/solana-sol-logo.svg",
    apy: 7.50, // Higher borrow rate than supply (5.20%)
    wallet: "0 SOL", // User hasn't borrowed SOL
    liquidity: "$3.8M",
    change24h: 4.78,
    price: 148.93,
    marketCap: "$67.2B",
    volume24h: "$3.8B",
  },
  {
    id: "peridot",
    name: "Peridot",
    symbol: "PDT",
    icon: "/logo.svg",
    apy: 8.90, // Higher borrow rate than supply (6.50%)
    wallet: "0 PDT", // User hasn't borrowed PDT
    liquidity: "$562K",
    change24h: 7.21,
    price: 14.86,
    marketCap: "$742M",
    volume24h: "$56.3M",
  },
  {
    id: "stellar",
    name: "Stellar",
    symbol: "XLM",
    icon: "/tokenimages/app/stellar.svg",
    apy: 6.45, // Higher borrow rate than supply (4.15%)
    wallet: "0 XLM",
    liquidity: "$212K",
    change24h: 9.87,
    price: 2.47,
    marketCap: "$412M",
    volume24h: "$39M",
  },
  {
    id: "iota",
    name: "IOTA",
    symbol: "MIOTA",
    icon: "/tokenimages/app/iota-iota-logo.svg",
    apy: 7.25, // Higher borrow rate than supply (4.85%)
    wallet: "0 MIOTA",
    liquidity: "$124K",
    change24h: 3.65,
    price: 0.32,
    marketCap: "$895M",
    volume24h: "$64M",
  },
] 
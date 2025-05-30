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

// Sample data for supply markets
export const supplyMarkets: Asset[] = [
  {
    id: "sol",
    name: "Solana",
    symbol: "SOL",
    icon: "/tokenimages/app/solana-sol-logo.svg",
    apy: 3.42,
    wallet: "0 SOL",
    collateral: true,
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
    apy: 8.64,
    wallet: "0 PDT",
    collateral: true,
    change24h: 7.21,
    price: 14.86,
    marketCap: "$742M",
    volume24h: "$56.3M",
    pTokenAddress: "0x1DCb19949fC0a68cbdAa53Cce898B60D7436b14F", // pToken for Peridot (PDT)
  },
  {
    id: "stellar",
    name: "Stellar",
    symbol: "XLM",
    icon: "/tokenimages/app/stellar.svg",
    apy: 5.78,
    wallet: "0 SNM",
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
    apy: 4.36,
    wallet: "0 MIOTA",
    collateral: true,
    change24h: 3.65,
    price: 0.32,
    marketCap: "$895M",
    volume24h: "$64M",
  },
  {
    id: "usdc",
    name: "USD Coin",
    symbol: "USDC",
    icon: "/tokenimages/app/usd-coin-usdc-logo.svg",
    apy: 1.47,
    wallet: "0 USDC",
    collateral: true,
    change24h: 0.01,
    price: 1.0,
    marketCap: "$28.4B",
    volume24h: "$2.1B",
  },
  {
    id: "usdt",
    name: "Tether",
    symbol: "USDT",
    icon: "/tokenimages/app/tether-usdt-logo.svg",
    apy: 2.18,
    wallet: "0 USDT",
    collateral: false, // Example: USDT might not be collateral
    change24h: 0.02,
    price: 1.0,
    marketCap: "$83.2B",
    volume24h: "$42.5B",
  },
  {
    id: "eth",
    name: "Ether",
    symbol: "ETH",
    icon: "/tokenimages/app/ethereum-eth-logo.svg",
    apy: 0.02,
    wallet: "0 ETH",
    collateral: true,
    change24h: 2.34,
    price: 3521.48,
    marketCap: "$423B",
    volume24h: "$18.7B",
    pTokenAddress: "0xB911C192ed1d6428A12F2Cf8F636B00c34e68a2a" as `0x${string}`, // pEther address for Soneium Minato
  },
]

// Sample data for borrow markets
export const borrowMarkets: Asset[] = [
  {
    id: "sol",
    name: "Solana",
    symbol: "SOL",
    icon: "/tokenimages/app/solana-sol-logo.svg",
    apy: 3.42,
    wallet: "0 SOL",
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
    apy: 8.64,
    wallet: "0 PDT",
    liquidity: "$562K",
    change24h: 7.21,
    price: 14.86,
    marketCap: "$742M",
    volume24h: "$56.3M",
  },
  {
    id: "Stellar",
    name: "stellar",
    symbol: "XLM",
    icon: "/tokenimages/app/stellar.svg",
    apy: 5.78,
    wallet: "0 SNM",
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
    apy: 4.36,
    wallet: "0 MIOTA",
    liquidity: "$124K",
    change24h: 3.65,
    price: 0.32,
    marketCap: "$895M",
    volume24h: "$64M",
  },
  {
    id: "usdt",
    name: "Tether",
    symbol: "USDT",
    icon: "/tokenimages/app/tether-usdt-logo.svg",
    apy: 2.18,
    wallet: "0 USDT",
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
    apy: 1.47,
    wallet: "0 USDC",
    liquidity: "$2.5M",
    change24h: 0.01,
    price: 1.0,
    marketCap: "$28.4B",
    volume24h: "$2.1B",
  },
  {
    id: "eth",
    name: "Ether",
    symbol: "ETH",
    icon: "/tokenimages/app/ethereum-eth-logo.svg",
    apy: 0.02,
    wallet: "0 ETH",
    liquidity: "$15.5B",
    change24h: 2.34,
    price: 3521.48,
    marketCap: "$423B",
    volume24h: "$18.7B",
  },
] 
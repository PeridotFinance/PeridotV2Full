import { PortfolioAsset } from "@/types/markets"

// Sample portfolio data
export const portfolioAssets: PortfolioAsset[] = [
  {
    id: "sol",
    name: "Solana",
    symbol: "SOL",
    icon: "/tokenimages/app/solana-sol-logo.svg",
    price: 148.93,
    amount: 150.5,
    value: 22413.96,
    allocation: 40.1,
    change24h: 4.78,
  },
  {
    id: "peridot",
    name: "Peridot",
    symbol: "PDT",
    icon: "/logo.svg",
    price: 14.86,
    amount: 1200,
    value: 17832.00,
    allocation: 31.9,
    change24h: 7.21,
  },
  {
    id: "eth",
    name: "Ether",
    symbol: "ETH",
    icon: "/tokenimages/app/ethereum-eth-logo.svg",
    price: 3521.48,
    amount: 3,
    value: 10564.44,
    allocation: 18.9,
    change24h: 2.34,
  },
  {
    id: "usdc",
    name: "USD Coin",
    symbol: "USDC",
    icon: "/tokenimages/app/usd-coin-usdc-logo.svg",
    price: 1.0,
    amount: 5062.60,
    value: 5062.60,
    allocation: 9.1,
    change24h: 0.01,
  },
] 
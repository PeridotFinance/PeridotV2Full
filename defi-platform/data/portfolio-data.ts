import { PortfolioAsset } from "@/types/markets"

// Sample portfolio data
export const portfolioAssets: PortfolioAsset[] = [
  {
    id: "sol",
    name: "Solana",
    symbol: "SOL",
    icon: "/tokenimages/app/solana-sol-logo.svg",
    price: 148.93,
    amount: 0,
    value: 0,
    allocation: 0,
    change24h: 4.78,
  },
  {
    id: "stellar",
    name: "Stellar",
    symbol: "XLM",
    icon: "/tokenimages/app/stellar.svg",
    price: 0.42,
    amount: 0,
    value: 0,
    allocation: 0,
    change24h: 1.23,
  },
] 
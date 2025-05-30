"use client"

import { useState, useEffect, useMemo } from "react"
import { useAccount } from "wagmi"
import type { UserPosition } from "../components/markets/UserPositionsCard"

// Demo data for user positions - consistent with portfolio data
const DEMO_POSITIONS: UserPosition[] = [
  {
    id: "position-1",
    asset: {
      name: "USD Coin",
      symbol: "USDC",
      icon: "/tokenimages/app/usd-coin-usdc-logo.svg",
      chain: "Ethereum",
      contractAddress: "0xA0b86a33E6441ecBb6C118a3BcEAb8f5Bfbc9e8E" as `0x${string}`,
      pTokenAddress: "0x9e3c7A8f0a5e4a2e3B9f8c1e0D5a7c2b8F1e4D3a" as `0x${string}`
    },
    type: "supply",
    amount: 5000,
    amountUSD: 5000,
    apy: 4.25,
    startDate: "2024-01-15",
    accruedInterest: 87.5, // Realistic 30-day interest
    accruedInterestUSD: 87.5,
    collateralEnabled: true
  },
  {
    id: "position-2", 
    asset: {
      name: "Ethereum",
      symbol: "ETH",
      icon: "/tokenimages/app/ethereum-eth-logo.svg",
      chain: "Ethereum",
      contractAddress: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" as `0x${string}`,
      pTokenAddress: "0xB911C192ed1d6428A12F2Cf8F636B00c34e68a2a" as `0x${string}`
    },
    type: "supply",
    amount: 3.0, // Matches portfolio data
    amountUSD: 10564.44, // 3.0 * 3521.48
    apy: 3.85,
    startDate: "2024-01-20",
    accruedInterest: 0.025, // Realistic 25-day interest
    accruedInterestUSD: 87.9,
    collateralEnabled: true
  },
  {
    id: "position-3",
    asset: {
      name: "Solana",
      symbol: "SOL", 
      icon: "/tokenimages/app/solana-sol-logo.svg",
      chain: "Solana",
      contractAddress: "So11111111111111111111111111111111111111112" as `0x${string}`,
      pTokenAddress: "0x7c2b1A8f3e4D5c6B9a0E1F2c8D3e9A4b7C0f5E8d" as `0x${string}`
    },
    type: "supply",
    amount: 150.5, // Matches portfolio data
    amountUSD: 22413.96, // 150.5 * 148.93
    apy: 5.2,
    startDate: "2024-02-01",
    accruedInterest: 2.1, // Realistic 15-day interest
    accruedInterestUSD: 312.8,
    collateralEnabled: true
  },
  {
    id: "position-4",
    asset: {
      name: "USD Coin",
      symbol: "USDC",
      icon: "/tokenimages/app/usd-coin-usdc-logo.svg", 
      chain: "Solana",
      contractAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" as `0x${string}`,
      pTokenAddress: "0x2f1a5B8C9e0D3a7F4c6E9b1A8d5C2f0e3B7a9C4d" as `0x${string}`
    },
    type: "borrow",
    amount: 3500,
    amountUSD: 3500,
    apy: 6.8,
    startDate: "2024-02-05",
    accruedInterest: -32.4, // Realistic 12-day interest cost
    accruedInterestUSD: -32.4,
    healthFactor: 2.8,
    liquidationPrice: 2800
  },
  {
    id: "position-5",
    asset: {
      name: "Tether USD",
      symbol: "USDT",
      icon: "/tokenimages/app/tether-usdt-logo.svg",
      chain: "Ethereum", 
      contractAddress: "0xdAC17F958D2ee523a2206206994597C13D831ec7" as `0x${string}`,
      pTokenAddress: "0x8a9c8F1b4e5D2f7A3c6B0e9d8F4a7C2e5B1D8f9a" as `0x${string}`
    },
    type: "borrow",
    amount: 1200,
    amountUSD: 1200,
    apy: 7.2,
    startDate: "2024-02-10",
    accruedInterest: -9.8, // Realistic 7-day interest cost
    accruedInterestUSD: -9.8,
    healthFactor: 1.3,
    liquidationPrice: 1850
  }
]

// Contract interaction types for live mode
interface ContractPosition {
  tokenAddress: `0x${string}`
  pTokenAddress: `0x${string}`
  balance: bigint
  borrowBalance: bigint
  exchangeRate: bigint
  isCollateral: boolean
  underlyingPrice: bigint
}

interface UseUserPositionsProps {
  isDemoMode: boolean
  refreshTrigger?: number
}

interface UseUserPositionsReturn {
  positions: UserPosition[]
  isLoading: boolean
  error: string | null
  refetch: () => void
  toggleCollateral: (positionId: string) => void
  // Summary data - consistent with main app
  totalSupplied: number
  totalBorrowed: number
  netAPY: number
  healthFactor: number | null
  liquidationRisk: "low" | "medium" | "high" | null
  // Portfolio summary matching main app
  portfolioValue: number
  portfolioChange24h: number
  portfolioChangePercentage: number
}

export function useUserPositions({ 
  isDemoMode, 
  refreshTrigger 
}: UseUserPositionsProps): UseUserPositionsReturn {
  const { address, isConnected, chain } = useAccount()
  
  // State management
  const [positions, setPositions] = useState<UserPosition[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Contract interaction functions for live mode
  const mapContractToUserPosition = (contractPos: ContractPosition, marketData: any): UserPosition => {
    // This would map contract data to our UserPosition interface
    // TODO: Implement when contracts are integrated
    const hasSupply = contractPos.balance > BigInt(0)
    const hasBorrow = contractPos.borrowBalance > BigInt(0)
    
    // Convert BigInt values to numbers (handle decimals properly)
    const supplyAmount = Number(contractPos.balance) / 1e18 // Adjust for token decimals
    const borrowAmount = Number(contractPos.borrowBalance) / 1e18
    const price = Number(contractPos.underlyingPrice) / 1e18
    
    const positions: UserPosition[] = []
    
    if (hasSupply) {
      positions.push({
        id: `supply-${contractPos.tokenAddress}`,
        asset: {
          name: marketData.name,
          symbol: marketData.symbol,
          icon: marketData.icon,
          chain: marketData.chain,
          contractAddress: contractPos.tokenAddress,
          pTokenAddress: contractPos.pTokenAddress
        },
        type: "supply",
        amount: supplyAmount,
        amountUSD: supplyAmount * price,
        apy: marketData.supplyAPY,
        startDate: new Date().toISOString(), // Would need to track this
        accruedInterest: 0, // Calculate from contract
        accruedInterestUSD: 0,
        collateralEnabled: contractPos.isCollateral
      })
    }
    
    if (hasBorrow) {
      positions.push({
        id: `borrow-${contractPos.tokenAddress}`,
        asset: {
          name: marketData.name,
          symbol: marketData.symbol,
          icon: marketData.icon,
          chain: marketData.chain,
          contractAddress: contractPos.tokenAddress,
          pTokenAddress: contractPos.pTokenAddress
        },
        type: "borrow",
        amount: borrowAmount,
        amountUSD: borrowAmount * price,
        apy: marketData.borrowAPY,
        startDate: new Date().toISOString(),
        accruedInterest: 0, // Calculate from contract
        accruedInterestUSD: 0,
        healthFactor: 1.5, // Calculate from account liquidity
        liquidationPrice: price * 0.8 // Calculate based on collateral factor
      })
    }
    
    return positions[0] // Return first position or modify to return array
  }

  // Fetch live data function
  const fetchLivePositions = async (): Promise<UserPosition[]> => {
    if (!address || !isConnected) {
      return []
    }

    try {
      setIsLoading(true)
      setError(null)

      // TODO: Replace with actual contract calls
      // This would involve:
      // 1. Getting user's pToken balances for all markets
      // 2. Getting user's borrow balances for all markets  
      // 3. Getting market data (APYs, prices, etc.)
      // 4. Calculating health factors and liquidation prices
      
      /*
      Example contract integration:
      
      const marketAddresses = await getMarketAddresses()
      const userPositions = await Promise.all(
        marketAddresses.map(async (market) => {
          const [balance, borrowBalance, exchangeRate, accountLiquidity] = await Promise.all([
            readContract({
              address: market.pTokenAddress,
              abi: pTokenABI,
              functionName: 'balanceOf',
              args: [address]
            }),
            readContract({
              address: market.pTokenAddress,
              abi: pTokenABI,
              functionName: 'borrowBalanceStored',
              args: [address]
            }),
            readContract({
              address: market.pTokenAddress,
              abi: pTokenABI,
              functionName: 'exchangeRateStored'
            }),
            readContract({
              address: comptrollerAddress,
              abi: comptrollerABI,
              functionName: 'getAccountLiquidity',
              args: [address]
            })
          ])
          
          return mapContractToUserPosition({
            tokenAddress: market.tokenAddress,
            pTokenAddress: market.pTokenAddress,
            balance,
            borrowBalance,
            exchangeRate,
            isCollateral: await checkCollateralStatus(address, market.pTokenAddress),
            underlyingPrice: await getPrice(market.tokenAddress)
          }, market)
        })
      )
      
      return userPositions.flat().filter(pos => pos.amountUSD > 0.01) // Filter dust
      */

      // Simulated API call for now
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // For now, return empty array in live mode until contracts are integrated
      return []
      
    } catch (err) {
      console.error("Error fetching user positions:", err)
      setError(err instanceof Error ? err.message : "Failed to fetch positions")
      return []
    } finally {
      setIsLoading(false)
    }
  }

  // Toggle collateral for a position
  const toggleCollateral = async (positionId: string) => {
    if (isDemoMode) {
      // Demo mode: just update local state
      setPositions(prev => prev.map(position => 
        position.id === positionId && position.type === "supply"
          ? { ...position, collateralEnabled: !position.collateralEnabled }
          : position
      ))
      return
    }

    // Live mode: make actual contract call
    try {
      setIsLoading(true)
      const position = positions.find(p => p.id === positionId)
      if (!position || position.type !== "supply") return

      // TODO: Implement actual contract interaction
      /*
      if (position.collateralEnabled) {
        await writeContract({
          address: comptrollerAddress,
          abi: comptrollerABI,
          functionName: 'exitMarket',
          args: [position.asset.pTokenAddress]
        })
      } else {
        await writeContract({
          address: comptrollerAddress,
          abi: comptrollerABI,
          functionName: 'enterMarkets',
          args: [[position.asset.pTokenAddress]]
        })
      }
      */

      // Refetch positions after toggle
      await refetch()
    } catch (err) {
      console.error("Error toggling collateral:", err)
      setError(err instanceof Error ? err.message : "Failed to toggle collateral")
    } finally {
      setIsLoading(false)
    }
  }

  // Refetch positions
  const refetch = async () => {
    if (isDemoMode) {
      setPositions(DEMO_POSITIONS)
    } else {
      const livePositions = await fetchLivePositions()
      setPositions(livePositions)
    }
  }

  // Load initial data
  useEffect(() => {
    refetch()
  }, [isDemoMode, address, isConnected, chain, refreshTrigger])

  // Calculate summary data - consistent with main app
  const summaryData = useMemo(() => {
    const supplyPositions = positions.filter(p => p.type === "supply")
    const borrowPositions = positions.filter(p => p.type === "borrow")
    
    const totalSupplied = supplyPositions.reduce((sum, p) => sum + p.amountUSD, 0)
    const totalBorrowed = borrowPositions.reduce((sum, p) => sum + p.amountUSD, 0)
    
    // Calculate weighted average APYs
    const supplyAPY = totalSupplied > 0 
      ? supplyPositions.reduce((sum, p) => sum + (p.apy * p.amountUSD), 0) / totalSupplied 
      : 0
    const borrowAPY = totalBorrowed > 0 
      ? borrowPositions.reduce((sum, p) => sum + (p.apy * p.amountUSD), 0) / totalBorrowed 
      : 0
    
    // Net APY calculation (supply earning - borrow cost, weighted by position sizes)
    const totalPositionValue = totalSupplied + totalBorrowed
    const netAPY = totalPositionValue > 0
      ? ((supplyAPY * totalSupplied) - (borrowAPY * totalBorrowed)) / totalPositionValue
      : 0

    // Overall health factor (lowest among all borrow positions)
    const healthFactors = borrowPositions
      .map(p => p.healthFactor)
      .filter((hf): hf is number => hf !== undefined)
    const healthFactor = healthFactors.length > 0 ? Math.min(...healthFactors) : null

    // Liquidation risk assessment
    let liquidationRisk: "low" | "medium" | "high" | null = null
    if (healthFactor !== null) {
      if (healthFactor >= 2) liquidationRisk = "low"
      else if (healthFactor >= 1.5) liquidationRisk = "medium" 
      else liquidationRisk = "high"
    }

    // Portfolio calculations - consistent with main app DEMO_DATA
    const portfolioValue = totalSupplied - totalBorrowed + 38048.77 // Other assets not in lending
    const portfolioChange24h = 1234.56 // From demo data
    const portfolioChangePercentage = 2.25 // From demo data

    return {
      totalSupplied,
      totalBorrowed,
      netAPY,
      healthFactor,
      liquidationRisk,
      portfolioValue,
      portfolioChange24h,
      portfolioChangePercentage
    }
  }, [positions])

  return {
    positions,
    isLoading,
    error,
    refetch,
    toggleCollateral,
    ...summaryData
  }
}

// Helper function to calculate days since position start
export function getDaysSinceStart(startDate: string): number {
  const start = new Date(startDate)
  const now = new Date()
  const diffTime = Math.abs(now.getTime() - start.getTime())
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
}

// Helper function to format APY with appropriate color
export function formatAPY(apy: number, type: "supply" | "borrow"): {
  value: string
  colorClass: string
} {
  return {
    value: `${apy.toFixed(2)}%`,
    colorClass: type === "supply" ? "text-green-600" : "text-red-600"
  }
}

// Helper function to calculate estimated earnings/costs
export function calculateEstimatedEarnings(
  position: UserPosition,
  days: number = 365
): number {
  const dailyRate = position.apy / 365 / 100
  const estimatedAmount = position.amountUSD * dailyRate * days
  return position.type === "supply" ? estimatedAmount : -estimatedAmount
}

// Export consistent demo totals for use in main app
export const DEMO_TOTALS = {
  totalSupplied: 37978.40, // Sum of all supply positions
  totalBorrowed: 4700.00,  // Sum of all borrow positions
  netAPY: 4.2, // Weighted average
  borrowLimitUsed: 32.5, // Based on collateral ratios
} 
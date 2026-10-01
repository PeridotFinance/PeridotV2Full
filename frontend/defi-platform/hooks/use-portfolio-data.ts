import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { useActiveWallet } from '@/hooks/use-active-wallet'
import { useAuthedFetch } from '@/hooks/use-authed-fetch'

export interface PortfolioData {
  portfolio: {
    currentValue: number
    totalSupplied: number
    totalBorrowed: number
    netApy: number
    healthFactor: number
  }
  growth: {
    portfolio24h: number
    portfolio7d: number
    portfolio30d: number
    portfolio24hPercent: number
    portfolio7dPercent: number
    portfolio30dPercent: number
  }
  earnings: {
    totalLifetimeEarnings: number
    monthlyEarnings: number
    dailyAverageEarnings: number
    effectiveApy: number
  }
  transactions: {
    totalCount: number
    supplyCount: number
    borrowCount: number
    repayCount: number
    redeemCount: number
    totalSupplyValue: number
    totalBorrowValue: number
    netTransactionValue: number
  }
  assets: Array<{
    assetId: string
    supplied: number
    borrowed: number
    net: number
    percentage: number
  }>
  userStats: {
    totalPoints: number
    supplyCount: number
    borrowCount: number
    lastUpdated?: string
  }
  dataQuality: {
    hasTransactions: boolean
    hasBalanceHistory: boolean
    hasPortfolioApy: boolean
    lastTransactionDate?: string
    lastBalanceSnapshot?: string
  }
}

export function usePortfolioData() {
  const { address } = useActiveWallet()
  const { authedFetch, authReady } = useAuthedFetch()
  const [data, setData] = useState<PortfolioData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!address) {
      setData(null)
      setIsLoading(false)
      return
    }
    // Wait for the Privy token before calling the now-authenticated endpoint;
    // staying in the loading state avoids a tokenless 401 flash on first paint.
    if (!authReady) {
      setIsLoading(true)
      return
    }

    const abortController = new AbortController()

    const fetchPortfolioData = async () => {
      try {
        setIsLoading(true)
        setError(null)

        const response = await authedFetch(`/api/user/portfolio-data?address=${address}`, {
          signal: abortController.signal,
        })
        if (!response.ok) {
          throw new Error('Failed to fetch portfolio data')
        }

        const result = await response.json()
        if (result.success) {
          setData(result.data)
        } else {
          throw new Error(result.error || 'Unknown error')
        }
      } catch (error) {
        if ((error as Error).name === 'AbortError') return
        console.error('Error fetching portfolio data:', error)
        setError(error instanceof Error ? error.message : 'Unknown error')
      } finally {
        if (!abortController.signal.aborted) {
          setIsLoading(false)
        }
      }
    }

    fetchPortfolioData()

    return () => abortController.abort()
  }, [address, authReady, authedFetch])

  return { data, isLoading, error }
}

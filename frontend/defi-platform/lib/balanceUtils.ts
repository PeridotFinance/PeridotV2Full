import React from 'react'
import { usePrivy } from '@privy-io/react-auth'

export interface WalletBalance {
  chain: string
  asset: string
  raw_value: string
  raw_value_decimals: number
  display_values: {
    [key: string]: string
  }
}

export interface BalanceResponse {
  balances: WalletBalance[]
}

/**
 * Hook to fetch wallet balance using Privy API
 */
export const useWalletBalance = (walletId: string | null, chain: string = 'base', asset: string = 'eth') => {
  const { getAccessToken } = usePrivy()
  const [balance, setBalance] = React.useState<WalletBalance | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const fetchBalance = React.useCallback(async () => {
    if (!walletId || !getAccessToken) {
      setBalance(null)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const accessToken = await getAccessToken()
      
      const response = await fetch(`https://api.privy.io/v1/wallets/${walletId}/balance?chain=${chain}&asset=${asset}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'privy-app-id': process.env.NEXT_PUBLIC_PRIVY_APP_ID || '',
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch balance: ${response.status}`)
      }

      const data: BalanceResponse = await response.json()
      const walletBalance = data.balances.find(b => b.chain === chain && b.asset === asset)
      setBalance(walletBalance || null)
    } catch (err) {
      console.error('Error fetching wallet balance:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch balance')
      setBalance(null)
    } finally {
      setLoading(false)
    }
  }, [walletId, chain, asset, getAccessToken])

  React.useEffect(() => {
    fetchBalance()
  }, [fetchBalance])

  return {
    balance,
    loading,
    error,
    refetch: fetchBalance
  }
}

/**
 * Hook to fetch multiple wallet balances
 */
export const useMultipleWalletBalances = (walletId: string | null, chains: string[] = ['base'], assets: string[] = ['eth']) => {
  const { getAccessToken } = usePrivy()
  const [balances, setBalances] = React.useState<WalletBalance[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const fetchBalances = React.useCallback(async () => {
    if (!walletId || !getAccessToken) {
      setBalances([])
      return
    }

    setLoading(true)
    setError(null)

    try {
      const accessToken = await getAccessToken()
      
      // Build query parameters for multiple chains and assets
      const chainParams = chains.map(c => `chain=${c}`).join('&')
      const assetParams = assets.map(a => `asset=${a}`).join('&')
      const queryParams = `${chainParams}&${assetParams}`
      
      const response = await fetch(`https://api.privy.io/v1/wallets/${walletId}/balance?${queryParams}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'privy-app-id': process.env.NEXT_PUBLIC_PRIVY_APP_ID || '',
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch balances: ${response.status}`)
      }

      const data: BalanceResponse = await response.json()
      setBalances(data.balances)
    } catch (err) {
      console.error('Error fetching wallet balances:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch balances')
      setBalances([])
    } finally {
      setLoading(false)
    }
  }, [walletId, chains, assets, getAccessToken])

  React.useEffect(() => {
    fetchBalances()
  }, [fetchBalances])

  return {
    balances,
    loading,
    error,
    refetch: fetchBalances
  }
}

/**
 * Utility function to format balance for display
 */
export const formatBalance = (balance: WalletBalance | null, currency: string = 'eth'): string => {
  if (!balance) return '0.00'
  
  const displayValue = balance.display_values[currency]
  if (displayValue) {
    return parseFloat(displayValue).toFixed(4)
  }
  
  // Fallback to raw value calculation
  const rawValue = BigInt(balance.raw_value)
  const decimals = balance.raw_value_decimals
  const divisor = BigInt(10 ** decimals)
  const wholePart = rawValue / divisor
  const fractionalPart = rawValue % divisor
  
  if (fractionalPart === 0n) {
    return wholePart.toString()
  }
  
  const fractionalStr = fractionalPart.toString().padStart(decimals, '0')
  const trimmedFractional = fractionalStr.replace(/0+$/, '')
  
  return `${wholePart}.${trimmedFractional}`
}

/**
 * Utility function to get USD value if available
 */
export const getUSDValue = (balance: WalletBalance | null): string | null => {
  if (!balance) return null
  return balance.display_values.usd || null
}

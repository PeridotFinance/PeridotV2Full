import React from 'react'
import { formatEther } from 'viem'
import { getChainConfig } from '@/config/contracts'
import { CHAIN_UTILS } from './network-ids'


export interface ChainBalance {
  chainId: number
  chainName: string
  balance: string
  balanceFormatted: string
  nativeSymbol: string
  rpcUrl: string
}

export interface MultiChainBalanceResult {
  balances: ChainBalance[]
  totalUSDValue?: string
  loading: boolean
  error: string | null
  refetch: () => void
}

/**
 * Get enabled network chain IDs from environment variable
 */
export const getEnabledChainIds = (): number[] => {
  const enabledNetworks = process.env.NEXT_PUBLIC_ENABLED_NETWORKS || ""
  return enabledNetworks
    .split(",")
    .map(s => s.trim())
    .filter(Boolean)
    .map(id => parseInt(id, 10))
    .filter(id => !isNaN(id))
}

/**
 * Hook to fetch wallet balance from all enabled chains using RPC calls
 */
export const useMultiChainBalance = (walletAddress: string | null): MultiChainBalanceResult => {
  const [balances, setBalances] = React.useState<ChainBalance[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const fetchBalances = React.useCallback(async () => {
    if (!walletAddress) {
      setBalances([])
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const enabledChainIds = getEnabledChainIds()
      // Filter to only chains that have RPC URLs configured - silently skip others
      const chainsWithRpc = enabledChainIds.filter((chainId) => {
        const cfg = getChainConfig(chainId)
        return !!(cfg as any)?.rpcUrl
      })
      
      const balancePromises = chainsWithRpc.map(async (chainId) => {
        try {
          const cfg = getChainConfig(chainId)
          const rpcUrl = (cfg as any)?.rpcUrl
          
          // This should never happen since we filtered above, but keep as safety check
          if (!rpcUrl) {
            return null // Return null instead of throwing
          }

          const body = { 
            jsonrpc: '2.0', 
            id: 1, 
            method: 'eth_getBalance', 
            params: [walletAddress, 'latest'] 
          }
          
          const res = await fetch(rpcUrl, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify(body) 
          })
          
          const json = await res.json()
          const hex = (json?.result || '0x0') as string
          const balanceWei = BigInt(hex)
          const balanceFormatted = formatEther(balanceWei)
          
          // Format to 4 decimal places for display
          const formattedBalance = parseFloat(balanceFormatted).toFixed(4)
          const nativeSymbol = CHAIN_UTILS.getNativeTokenSymbol(chainId)
          
          return {
            chainId,
            chainName: formatChainName(cfg?.chainNameReadable || `Chain ${chainId}`, chainId),
            balance: hex,
            balanceFormatted: formattedBalance,
            nativeSymbol,
            rpcUrl
          }
        } catch (err) {
          // Silently skip chains that fail - don't log errors in production
          // Only log in development mode
          if (process.env.NODE_ENV === 'development') {
            console.error(`Failed to fetch balance for chain ${chainId}:`, err)
          }
          return null // Return null for failed fetches
        }
      })

      const results = await Promise.all(balancePromises)
      // Filter out null results (chains without RPC or failed fetches)
      setBalances(results.filter((r): r is ChainBalance => r !== null))
    } catch (err) {
      console.error('Error fetching multi-chain balances:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch balances')
      setBalances([])
    } finally {
      setLoading(false)
    }
  }, [walletAddress])

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
 * Utility function to get total balance across all chains
 */
export const getTotalBalance = (balances: ChainBalance[]): string => {
  const totalWei = balances.reduce((total, balance) => {
    return total + BigInt(balance.balance)
  }, BigInt(0))
  
  return formatEther(totalWei)
}

/**
 * Utility function to format chain name for display
 */
export const formatChainName = (chainName: string, chainId?: number): string => {
  const nameMap: Record<string, string> = {
    'Ethereum': 'Ethereum',
    'BSC': 'BSC',
    'Arbitrum One': 'Arbitrum',
    'Base': 'Base',
    'Linea': 'Linea',
    'Optimism': 'Optimism',
    'Polygon': 'Polygon',
    'zkSync Era': 'zkSync',
  }

  // First try to map the chain name
  const mappedName = nameMap[chainName]
  if (mappedName) return mappedName

  // If we have a chain ID, try to map that
  if (chainId) {
    const chainIdMap: Record<number, string> = {
      // Mainnets
      1: 'Ethereum',
      56: 'BSC',
      42161: 'Arbitrum',
      8453: 'Base',
      59144: 'Linea',
      10: 'Optimism',
      137: 'Polygon',
      324: 'zkSync',
      // Testnets
      97: 'BSC Testnet',
      421614: 'Arbitrum Sepolia',
      84532: 'Base Sepolia',
      11155111: 'Ethereum Sepolia',
      10143: 'Monad Testnet',
      1075: 'IOTA EVM Testnet',
      50312: 'Somnia Testnet',
    }
    return chainIdMap[chainId] || chainName
  }

  return chainName
}

/**
 * Utility function to get the native token symbol for a chain
 */
export const getNativeTokenSymbol = (chainId: number): string => {
  return CHAIN_UTILS.getNativeTokenSymbol(chainId)
}

import { useState, useCallback, useEffect, useRef } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { useMultipleWalletBalances } from './balanceUtils'
import { getChainConfig } from '@/config/contracts'
import { CHAIN_UTILS } from './network-ids'

interface WalletBalance {
  chain: string
  asset: string
  raw_value: string
  raw_value_decimals: number
  display_values: {
    [key: string]: string
  }
}

interface ChainAssetBalances {
  isExpanded: boolean
  expand: () => void
  collapse: () => void
  balances: WalletBalance[]
  loading: boolean
  error: string | null
}

export const useChainAssetBalances = (walletId: string | null, chainId: number): ChainAssetBalances => {
  const { getAccessToken } = usePrivy()
  const [isExpanded, setIsExpanded] = useState(false)
  const [balances, setBalances] = useState<WalletBalance[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Get chain info
  const chainConfig = getChainConfig(chainId)
  const availableAssets = (chainConfig as any)?.tokens ? Object.keys((chainConfig as any).tokens) : []

  // Map contract tokens to Privy asset names
  const privyAssets = availableAssets.map(symbol => {
    const assetMap: Record<string, string> = {
      'WETH': 'eth', 'WBNB': 'bnb', 'WBTC': 'btc', 'USDC': 'usdc',
      'USDT': 'usdt', 'DAI': 'dai', 'CAKE': 'cake', 'DOGE': 'doge',
      'LINK': 'link', 'BTCB': 'btc', 'PDT': 'pdt', 'PUSD': 'pusd',
      'rUSDC': 'rusdc', 'pgMON': 'pgmon', 'WMON': 'wmon'
    }
    return assetMap[symbol] || symbol.toLowerCase()
  })

  const chainName = CHAIN_UTILS.getPrivyChainName(chainId)

  // Fetch additional asset balances with backoff when expanded
  useEffect(() => {
    if (!isExpanded || !walletId || privyAssets.length === 0) {
      setBalances([])
      return
    }

    // Cancel any ongoing requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllerRef.current = new AbortController()

    const fetchBalancesWithBackoff = async () => {
      setLoading(true)
      setError(null)

      try {
        const results: WalletBalance[] = []

        // Fetch each asset with 300ms backoff between calls
        for (let i = 0; i < privyAssets.length; i++) {
          if (abortControllerRef.current?.signal.aborted) break

          try {
            const asset = privyAssets[i]
            console.log(`Fetching ${asset} balance for ${chainName}...`)

            // Add 300ms backoff between calls (except for the first one)
            if (i > 0) {
              await new Promise(resolve => setTimeout(resolve, 300))
            }

            const response = await fetch(`https://api.privy.io/v1/wallets/${walletId}/balance?chain=${chainName}&asset=${asset}`, {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${await getAccessToken()}`,
                'privy-app-id': process.env.NEXT_PUBLIC_PRIVY_APP_ID || '',
                'Content-Type': 'application/json',
              },
              signal: abortControllerRef.current?.signal
            })

            if (!response.ok) {
              throw new Error(`Failed to fetch ${asset} balance: ${response.status}`)
            }

            const data = await response.json()
            const assetBalance = data.balances.find((b: WalletBalance) => b.chain === chainName && b.asset === asset)

            if (assetBalance) {
              results.push(assetBalance)
            }
          } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') {
              console.log(`Aborted fetching asset balance`)
              return
            }
            console.error(`Error fetching asset balance:`, err)
            // Continue with other assets even if one fails
          }
        }

        if (!abortControllerRef.current?.signal.aborted) {
          setBalances(results)
        }
      } catch (err) {
        if (!abortControllerRef.current?.signal.aborted) {
          console.error('Error in fetchBalancesWithBackoff:', err)
          setError(err instanceof Error ? err.message : 'Failed to fetch balances')
        }
      } finally {
        if (!abortControllerRef.current?.signal.aborted) {
          setLoading(false)
        }
      }
    }

    fetchBalancesWithBackoff()

    // Cleanup function
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [isExpanded, walletId, chainName, privyAssets.length, getAccessToken])


  const expand = useCallback(() => setIsExpanded(true), [])
  const collapse = useCallback(() => setIsExpanded(false), [])

  return {
    isExpanded,
    expand,
    collapse,
    balances,
    loading: loading && isExpanded,
    error
  }
}

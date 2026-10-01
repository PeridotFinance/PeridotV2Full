"use client"

import { useAccount, useReadContracts } from 'wagmi'
import { useEffect, useMemo } from 'react'
import { erc20Abi, formatUnits } from 'viem'
import { getAssetContractAddresses, getMarketsForChain } from '@/data/market-data'
import { chainConfigs } from '@/config/contracts'
import { networks } from '@/config'
import { useActiveWallet } from '@/hooks/use-active-wallet'

interface ChainWalletBalance {
  chainId: number
  chainName: string
  balance: number
  symbol: string
}

interface WalletReadChainConfig {
  chainId: number
  chainNameReadable: string
}

const isEvmHexAddress = (value: string | undefined | null): value is `0x${string}` =>
  typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value)

export function useCrossChainWalletBalances(assetId: string, evmAddressOverride?: string) {
  const { address, isConnected } = useActiveWallet()
  const { isConnected: isWagmiConnected } = useAccount()

  const targetAddress = useMemo(() => {
    if (isEvmHexAddress(evmAddressOverride)) return evmAddressOverride
    if (isEvmHexAddress(address)) return address
    return undefined
  }, [evmAddressOverride, address])

  const shouldUseOverrideConnection = isEvmHexAddress(evmAddressOverride)
  const isSourceConnected = shouldUseOverrideConnection ? isWagmiConnected : isConnected
  
  const enabledChainIds = useMemo(() => {
    const networkList = networks as Array<{ id: number }>
    return new Set<number>(networkList.map((network) => network.id))
  }, [])

  const allChains = useMemo(() => {
    return Object.entries(chainConfigs)
      .map((entry) => entry[1] as Partial<WalletReadChainConfig>)
      .filter((config): config is WalletReadChainConfig => {
        const cid = config.chainId
        // Scan all enabled networks, not just hubs
        return typeof cid === 'number' && enabledChainIds.has(cid) && typeof config.chainNameReadable === 'string'
      })
  }, [enabledChainIds])

  const calls = useMemo(() => {
    if (!targetAddress || !isSourceConnected || !assetId) return []

    const contractCalls: Array<{
      address: `0x${string}`
      abi: typeof erc20Abi
      functionName: 'balanceOf'
      args: [`0x${string}`]
      chainId: number
    }> = []
    allChains.forEach(chain => {
      const addresses = getAssetContractAddresses(assetId, chain.chainId)
      if (addresses?.underlyingAddress && !addresses.isNative) {
        contractCalls.push({
          address: addresses.underlyingAddress as `0x${string}`,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [targetAddress],
          chainId: chain.chainId,
        })
      }
    })
    return contractCalls
  }, [targetAddress, isSourceConnected, assetId, allChains])

  const { data: results, isLoading, refetch } = useReadContracts({
    contracts: calls,
    query: {
      enabled: calls.length > 0,
      refetchInterval: 30000,
    }
  })

  // Force-refresh wallet balances right after a successful transaction.
  // A single refetch is sufficient — React Query's staleTime handles subsequent
  // revalidation. The previous double-refetch (immediate + 1500ms setTimeout)
  // fired two full multicall rounds against every configured chain.
  useEffect(() => {
    if (!calls.length) return
    const refresh = () => { try { refetch?.() } catch {} }
    try {
      window.addEventListener('peridot:tx-success' as any, refresh)
    } catch {}
    return () => {
      try { window.removeEventListener('peridot:tx-success' as any, refresh) } catch {}
    }
  }, [calls.length, refetch])

  const balances = useMemo(() => {
    const list: ChainWalletBalance[] = []
    if (!results) return list

    let resultIndex = 0
    allChains.forEach(chain => {
      const addresses = getAssetContractAddresses(assetId, chain.chainId)
      if (addresses?.underlyingAddress && !addresses.isNative) {
        const res = results[resultIndex++]
        if (res?.status === 'success') {
          const market = getMarketsForChain(chain.chainId).find(m => m.id === assetId)
          const balance = Number(formatUnits(res.result as bigint, market?.decimals || 18))
          if (balance > 0) {
            list.push({
              chainId: chain.chainId,
              chainName: chain.chainNameReadable,
              balance,
              symbol: market?.symbol || ''
            })
          }
        }
      }
    })

    return list
  }, [results, allChains, assetId])

  return { balances, isLoading }
}

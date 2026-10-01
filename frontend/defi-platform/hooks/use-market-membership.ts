import React from 'react'
import { useAccount, useReadContract } from 'wagmi'
import { getAssetContractAddresses } from '@/data/market-data'
import { getChainConfig, isEvmAddress, isStellarNetwork, resolveHubReadChainId } from '@/config/contracts'
import combinedAbi from '@/app/abis/combinedAbi.json'
import { useActiveWallet } from '@/hooks/use-active-wallet'
import { useNetworkContext } from '@/context'
import { getStellarVaultConfig, stellarGetUserMarkets } from '@/lib/stellar-soroban-lending'

interface UseMarketMembershipProps {
  assetId: string
}

export function useMarketMembership({ assetId }: UseMarketMembershipProps) {
  const { selectedNetworkId } = useNetworkContext()
  const { chainId } = useAccount()
  const { address } = useActiveWallet()
  const useStellarMembership = isStellarNetwork(selectedNetworkId)
  const evmAddress = isEvmAddress(address) ? (address as `0x${string}`) : undefined
  const stellarConfig = React.useMemo(
    () => (useStellarMembership ? getStellarVaultConfig(assetId) : null),
    [useStellarMembership, assetId]
  )
  const [stellarAssetsIn, setStellarAssetsIn] = React.useState<string[]>([])
  const [stellarLoading, setStellarLoading] = React.useState(false)
  const [stellarError, setStellarError] = React.useState<Error | null>(null)
  
  // Determine effective chain (route ALL membership reads to BSC hub when on any Axelar spoke chain)
  const effectiveChainId = React.useMemo(() => resolveHubReadChainId(chainId), [chainId]) as number | null

  // Get contract addresses for the asset
  const contractAddresses = effectiveChainId ? getAssetContractAddresses(assetId, effectiveChainId) : null
  
  // Get chain config for controller address
  const chainConfig = effectiveChainId ? getChainConfig(effectiveChainId) : null
  const controllerAddress = chainConfig && 'unitrollerProxy' in chainConfig ? chainConfig.unitrollerProxy : null

  // Check if user has entered this market (enabled as collateral)
  const { 
    data: isCollateralEnabled, 
    isLoading, 
    error,
    refetch 
  } = useReadContract({
    address: controllerAddress as `0x${string}`,
    abi: combinedAbi,
    functionName: 'checkMembership',
    args: [evmAddress as `0x${string}`, contractAddresses?.pTokenAddress as `0x${string}`],
    chainId: effectiveChainId as any,
    query: {
      enabled:
        !useStellarMembership &&
        !!controllerAddress &&
        !!evmAddress &&
        !!contractAddresses?.pTokenAddress &&
        !(typeof window !== 'undefined' && (window as any).__PERIDOT_TX_ACTIVE),
      refetchInterval: 60000, // Reduced from 30s to 60s
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    }
  })

  // Get all assets user has entered (for overview)
  const { 
    data: assetsIn,
    isLoading: isAssetsInLoading,
    refetch: refetchAssetsIn
  } = useReadContract({
    address: controllerAddress as `0x${string}`,
    abi: combinedAbi,
    functionName: 'getAssetsIn',
    args: [evmAddress as `0x${string}`],
    chainId: effectiveChainId as any,
    query: {
      enabled:
        !useStellarMembership &&
        !!controllerAddress &&
        !!evmAddress &&
        !(typeof window !== 'undefined' && (window as any).__PERIDOT_TX_ACTIVE),
      refetchInterval: 60000, // Reduced from 30s to 60s
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    }
  })

  const fetchStellarMembership = React.useCallback(async () => {
    if (!useStellarMembership) return []
    if (!address) {
      setStellarAssetsIn([])
      setStellarError(null)
      return []
    }
    setStellarLoading(true)
    try {
      const markets = await stellarGetUserMarkets(address)
      setStellarAssetsIn(markets)
      setStellarError(null)
      return markets
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err))
      setStellarError(errorObj)
      setStellarAssetsIn([])
      return []
    } finally {
      setStellarLoading(false)
    }
  }, [useStellarMembership, address])

  // Keep a stable ref so the interval/listener never needs to be torn down and
  // re-created just because fetchStellarMembership got a new reference.
  const fetchStellarMembershipRef = React.useRef(fetchStellarMembership)
  React.useEffect(() => { fetchStellarMembershipRef.current = fetchStellarMembership }, [fetchStellarMembership])

  React.useEffect(() => {
    if (!useStellarMembership) return
    void fetchStellarMembershipRef.current()
    const interval = window.setInterval(() => {
      void fetchStellarMembershipRef.current()
    }, 60000)
    const onTxSuccess = () => { void fetchStellarMembershipRef.current() }
    window.addEventListener('peridot:tx-success', onTxSuccess as EventListener)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('peridot:tx-success', onTxSuccess as EventListener)
    }
  }, [useStellarMembership]) // removing fetchStellarMembership from deps — accessed via stable ref

  const isStellarCollateralEnabled = React.useMemo(() => {
    if (!stellarConfig) return false
    const target = stellarConfig.vaultId.toLowerCase()
    return stellarAssetsIn.some((market) => market.toLowerCase() === target)
  }, [stellarConfig, stellarAssetsIn])

  return {
    isCollateralEnabled: useStellarMembership ? isStellarCollateralEnabled : Boolean(isCollateralEnabled),
    assetsIn: useStellarMembership ? stellarAssetsIn : (assetsIn as string[]) || [],
    isLoading: useStellarMembership ? stellarLoading : isLoading,
    isAssetsInLoading: useStellarMembership ? stellarLoading : isAssetsInLoading,
    error: useStellarMembership ? stellarError : error,
    refetch: useStellarMembership ? fetchStellarMembership : refetch,
    refetchAssetsIn: useStellarMembership ? fetchStellarMembership : refetchAssetsIn,
    contractAddresses,
    controllerAddress,
  }
}

// Hook to get all market memberships for the user
export function useAllMarketMemberships() {
  const { selectedNetworkId } = useNetworkContext()
  const { chainId } = useAccount()
  const { address } = useActiveWallet()
  const useStellarMembership = isStellarNetwork(selectedNetworkId)
  const evmAddress = isEvmAddress(address) ? (address as `0x${string}`) : undefined
  const [stellarAssetsIn, setStellarAssetsIn] = React.useState<string[]>([])
  const [stellarLoading, setStellarLoading] = React.useState(false)
  const [stellarError, setStellarError] = React.useState<Error | null>(null)
  
  // Get chain config for controller address
  const effectiveChainId = React.useMemo(() => resolveHubReadChainId(chainId), [chainId]) as number | null
  const chainConfig = effectiveChainId ? getChainConfig(effectiveChainId) : null
  const controllerAddress = chainConfig && 'unitrollerProxy' in chainConfig ? chainConfig.unitrollerProxy : null

  // Get all assets user has entered (enabled as collateral)
  const { 
    data: assetsIn,
    isLoading,
    error,
    refetch
  } = useReadContract({
    address: controllerAddress as `0x${string}`,
    abi: combinedAbi,
    functionName: 'getAssetsIn',
    args: [evmAddress as `0x${string}`],
    chainId: effectiveChainId as any,
    query: {
      enabled: !useStellarMembership && !!controllerAddress && !!evmAddress,
      refetchInterval: 60000, // Reduced from 30s to 60s
    }
  })

  const fetchStellarMembership = React.useCallback(async () => {
    if (!useStellarMembership) return []
    if (!address) {
      setStellarAssetsIn([])
      setStellarError(null)
      return []
    }
    setStellarLoading(true)
    try {
      const markets = await stellarGetUserMarkets(address)
      setStellarAssetsIn(markets)
      setStellarError(null)
      return markets
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err))
      setStellarError(errorObj)
      setStellarAssetsIn([])
      return []
    } finally {
      setStellarLoading(false)
    }
  }, [useStellarMembership, address])

  React.useEffect(() => {
    if (!useStellarMembership) return
    void fetchStellarMembership()
    const interval = window.setInterval(() => {
      void fetchStellarMembership()
    }, 60000)
    return () => {
      window.clearInterval(interval)
    }
  }, [useStellarMembership, fetchStellarMembership])

  return {
    assetsIn: useStellarMembership ? stellarAssetsIn : (assetsIn as string[]) || [],
    isLoading: useStellarMembership ? stellarLoading : isLoading,
    error: useStellarMembership ? stellarError : error,
    refetch: useStellarMembership ? fetchStellarMembership : refetch,
    controllerAddress,
    hasCollateralAssets: useStellarMembership
      ? stellarAssetsIn.length > 0
      : ((assetsIn as string[]) || []).length > 0,
  }
} 

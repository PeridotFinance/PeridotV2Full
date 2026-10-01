import { useAccount, useReadContract } from 'wagmi'
import { erc20Abi, formatUnits } from 'viem'
import { getAssetContractAddresses, AXELAR_CROSS_CHAIN_ASSET_IDS } from '@/data/market-data'
import { CHAIN_IDS, isAxelarSpokeChain, getConfiguredUnderlyingDecimals, resolveHubReadChainId } from '@/config/contracts'
import combinedAbi from '@/app/abis/combinedAbi.json'
import { useMemo, useEffect, useState } from 'react'
import { useActiveWallet } from '@/hooks/use-active-wallet'
import { getStellarVaultConfig, stellarGetExchangeRate, stellarGetPtokenBalance } from '@/lib/stellar-soroban-lending'
import { useStellarWallet } from '@/hooks/use-stellar-wallet'

interface UsePTokenBalanceProps {
  assetId: string
  enabled?: boolean
  fetchPTokenDecimals?: boolean
}

function pow10(exp: number): bigint {
  let result = BigInt(1)
  for (let i = 0; i < Math.max(0, exp); i += 1) {
    result *= BigInt(10)
  }
  return result
}

export function usePTokenBalance({ assetId, enabled = true, fetchPTokenDecimals = false }: UsePTokenBalanceProps) {
  const { chainId } = useAccount()
  const { address: evmAddress } = useActiveWallet()

  // Same fix as `useWalletBalance`: a Soroban asset id is unambiguously
  // Stellar, so neither the selected network nor `useActiveWallet`'s address
  // may gate it. On the Stellar-only host the chain picker is hidden, so
  // `selectedNetworkId` is stuck at the preset default and this read fell
  // through to the EVM branch — reporting a zero position, which made
  // Withdraw claim "nothing supplied" right after a successful deposit.
  const stellarConfig = getStellarVaultConfig(assetId)
  const useStellarBalance = stellarConfig !== null
  const stellarWallet = useStellarWallet()
  const address = useStellarBalance ? stellarWallet.address : evmAddress
  
  // Determine effective chain for Axelar cross-chain assets:
  // When on Arbitrum Sepolia and the asset is Axelar-bridged, read positions from BSC hub
  const effectiveChainId = useMemo(() => resolveHubReadChainId(chainId ?? null) ?? null, [chainId]) as number | null

  // Get contract addresses for the asset on the effective chain
  const contractAddresses = effectiveChainId ? getAssetContractAddresses(assetId, effectiveChainId) : null
  const isNative = Boolean((contractAddresses as any)?.isNative)

  const [stellarPtokenBalance, setStellarPtokenBalance] = useState<string>("0")
  const [stellarUnderlyingBalance, setStellarUnderlyingBalance] = useState<string>("0")
  const [stellarExchangeRate, setStellarExchangeRate] = useState<string>("1000000")
  const [stellarLoading, setStellarLoading] = useState(false)

  // Drop the previous asset's position the moment the asset (or wallet) changes.
  // Long-lived hosts — the manage dialog, the sheet — keep this hook mounted and
  // just swap `assetId`, so without this the old position lingers until the
  // refetch resolves. That number drives the withdraw MAX button, and pre-filling
  // MAX with another market's balance sends the user into a doomed transaction.
  // Done during render rather than in an effect so no frame ever shows the
  // stale value.
  const stellarKey = `${assetId}:${address ?? ""}`
  const [lastStellarKey, setLastStellarKey] = useState(stellarKey)
  if (stellarKey !== lastStellarKey) {
    setLastStellarKey(stellarKey)
    setStellarPtokenBalance("0")
    setStellarUnderlyingBalance("0")
    setStellarExchangeRate("1000000")
    setStellarLoading(useStellarBalance && !!address)
  }

  useEffect(() => {
    if (!useStellarBalance || !stellarConfig || !address) return
    let cancelled = false
    setStellarLoading(true)
    const fetchStellarBalances = async () => {
      const [pRawStr, rateRawStr] = await Promise.all([
        stellarGetPtokenBalance(stellarConfig.vaultId, address),
        stellarGetExchangeRate(stellarConfig.vaultId),
      ])
      const pRaw = BigInt(pRawStr)
      const rateRaw = BigInt(rateRawStr)
      const exchangeScale = BigInt(1000000)
      const underlyingRaw = rateRaw > BigInt(0)
        ? (pRaw * rateRaw) / exchangeScale
        : BigInt(0)
      return {
        pRaw: pRaw.toString(),
        underlyingRaw: underlyingRaw.toString(),
        rateRaw: rateRaw.toString(),
      }
    }
    fetchStellarBalances()
      .then(({ pRaw, underlyingRaw, rateRaw }) => {
        if (cancelled) return
        setStellarPtokenBalance(pRaw)
        setStellarUnderlyingBalance(underlyingRaw)
        setStellarExchangeRate(rateRaw)
      })
      .catch(() => {
        if (cancelled) return
        setStellarPtokenBalance("0")
        setStellarUnderlyingBalance("0")
      })
      .finally(() => {
        if (!cancelled) setStellarLoading(false)
      })
    return () => { cancelled = true }
  }, [useStellarBalance, stellarConfig?.vaultId, stellarConfig?.decimals, address])

  useEffect(() => {
    if (!useStellarBalance || !stellarConfig || !address) return
    const onTxSuccess = async () => {
      try {
        const [pRawStr, rateRawStr] = await Promise.all([
          stellarGetPtokenBalance(stellarConfig.vaultId, address),
          stellarGetExchangeRate(stellarConfig.vaultId),
        ])
        const pRaw = BigInt(pRawStr)
        const rateRaw = BigInt(rateRawStr)
      const exchangeScale = BigInt(1000000)
      const underlyingRaw = rateRaw > BigInt(0)
        ? (pRaw * rateRaw) / exchangeScale
        : BigInt(0)
        setStellarPtokenBalance(pRaw.toString())
        setStellarUnderlyingBalance(underlyingRaw.toString())
        setStellarExchangeRate(rateRaw.toString())
      } catch {
        // no-op
      }
    }
    window.addEventListener("peridot:tx-success" as any, onTxSuccess)
    return () => window.removeEventListener("peridot:tx-success" as any, onTxSuccess)
  }, [useStellarBalance, stellarConfig?.vaultId, stellarConfig?.decimals, address])
  
  const pTokenContract = {
    address: contractAddresses?.pTokenAddress as `0x${string}`,
    abi: combinedAbi,
  } as const

  const underlyingTokenContract = {
    address: contractAddresses?.underlyingAddress as `0x${string}`,
    abi: erc20Abi,
  } as const

  // Prefer configured decimals from contracts map when available
  const configuredDecimals = useMemo(() => {
    if (!effectiveChainId) return undefined as any
    return getConfiguredUnderlyingDecimals(effectiveChainId as number, {
      underlyingAddress: (contractAddresses as any)?.underlyingAddress,
      symbol: (contractAddresses as any)?.symbol,
    })
  }, [effectiveChainId, contractAddresses]) as number | undefined
  
  const {
    data: pBalance,
    isLoading: isLoadingPBalance,
    error: errorPBalance,
    refetch: refetchPBalance,
  } = useReadContract({
    address: pTokenContract.address,
    abi: pTokenContract.abi,
    functionName: 'balanceOf',
    args: [address!],
    chainId: effectiveChainId as any,
    query: { enabled: enabled && !useStellarBalance && !!contractAddresses?.pTokenAddress && !!address && !!effectiveChainId && !(typeof window !== 'undefined' && (window as any).__PERIDOT_TX_ACTIVE), refetchInterval: 60000, refetchOnWindowFocus: false, refetchOnReconnect: false }
  } as any)

  const {
    data: pUnderlyingBalance,
    isLoading: isLoadingUnderlying,
    error: errorUnderlying,
    refetch: refetchUnderlying,
  } = useReadContract({
    address: pTokenContract.address,
    abi: pTokenContract.abi,
    functionName: 'balanceOfUnderlying',
    args: [address!],
    chainId: effectiveChainId as any,
    query: { enabled: enabled && !useStellarBalance && !!contractAddresses?.pTokenAddress && !!address && !!effectiveChainId && !(typeof window !== 'undefined' && (window as any).__PERIDOT_TX_ACTIVE), refetchInterval: 60000, refetchOnWindowFocus: false, refetchOnReconnect: false }
  } as any)

  const {
    data: pDecimals,
    isLoading: isLoadingPDecimals,
    error: errorPDecimals,
    refetch: refetchPDecimals,
  } = useReadContract({
    address: pTokenContract.address,
    abi: pTokenContract.abi,
    functionName: 'decimals',
    chainId: effectiveChainId as any,
    query: { enabled: enabled && !useStellarBalance && fetchPTokenDecimals && !!contractAddresses?.pTokenAddress && !!effectiveChainId && !(typeof window !== 'undefined' && (window as any).__PERIDOT_TX_ACTIVE), staleTime: 24 * 60 * 60 * 1000, gcTime: 24 * 60 * 60 * 1000, refetchOnWindowFocus: false, refetchOnReconnect: false }
  } as any)

  const {
    data: uDecimals,
    isLoading: isLoadingUDecimals,
    error: errorUDecimals,
    refetch: refetchUDecimals,
  } = useReadContract({
    address: underlyingTokenContract.address,
    abi: underlyingTokenContract.abi,
    functionName: 'decimals',
    chainId: effectiveChainId as any,
    query: { enabled: enabled && !useStellarBalance && !configuredDecimals && !isNative && !!contractAddresses?.underlyingAddress && !!effectiveChainId && !(typeof window !== 'undefined' && (window as any).__PERIDOT_TX_ACTIVE), staleTime: 24 * 60 * 60 * 1000, gcTime: 24 * 60 * 60 * 1000, refetchOnWindowFocus: false, refetchOnReconnect: false }
  } as any)

  const pTokenBalance = useMemo(() => (pBalance as bigint | undefined), [pBalance])
  const underlyingBalance = useMemo(() => (pUnderlyingBalance as bigint | undefined), [pUnderlyingBalance])
  const pTokenDecimals = useMemo(() => (pDecimals as number | undefined), [pDecimals])
  const maybeUnderlyingDecimals = useMemo(() => (uDecimals as number | undefined), [uDecimals])

  const underlyingDecimals = isNative ? 18 : (configuredDecimals ?? (maybeUnderlyingDecimals as number | undefined))

  const decimals = (underlyingDecimals as number | undefined) || 18 // Default to 18 if not available

  // Format the balance to a readable string
  const formatBalance = (balance: bigint | undefined, decimals: number | undefined): string => {
    if (!balance || decimals === undefined) return '0.00'
    
    const numericBalance = parseFloat(formatUnits(balance, decimals))
    
    if (numericBalance === 0) return '0.00'
    
    // Clamp dust to a friendly string and avoid scientific notation
    if (numericBalance < 0.000001) {
      return '< 0.000001'
    }
    if (numericBalance < 0.01) {
      // For small non-dust values, increase precision without scientific notation
      return parseFloat(numericBalance.toFixed(6)).toString()
    }
    
    return numericBalance.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    })
  }
  
  // Use a dust threshold for UI state decisions, but preserve raw values for tx logic
  const numericUnderlying = useMemo(() => {
    if (!underlyingBalance) return 0
    try {
      return parseFloat(formatUnits(underlyingBalance as bigint, decimals))
    } catch {
      return 0
    }
  }, [underlyingBalance, decimals])
  const DUST_THRESHOLD = 0.000001
  
  // Memoize the return object to prevent unnecessary re-renders
  const isLoading = isLoadingPBalance || isLoadingUnderlying || isLoadingPDecimals || isLoadingUDecimals
  const error = errorPBalance || errorUnderlying || errorPDecimals || errorUDecimals
  const refetch = async () => {
    await Promise.all([
      refetchPBalance?.(),
      refetchUnderlying?.(),
      refetchPDecimals?.(),
      refetchUDecimals?.()
    ])
  }

  const evmResult = useMemo(() => ({
    pTokenBalance: pTokenBalance as bigint | undefined,
    underlyingBalance: underlyingBalance as bigint | undefined,
    decimals: underlyingDecimals as number | undefined,
    pTokenDecimals: pTokenDecimals as number | undefined,
    formattedBalance: formatBalance(underlyingBalance as bigint | undefined, decimals),
    numericBalance: numericUnderlying,
    isLoading,
    error,
    refetch,
    hasBalance: numericUnderlying >= DUST_THRESHOLD,
    contractAddresses,
  }), [
    pTokenBalance,
    underlyingBalance,
    underlyingDecimals,
    pTokenDecimals,
    decimals,
    isLoading,
    error,
    refetch,
    contractAddresses,
    numericUnderlying
  ])

  const stellarResult = useMemo(() => {
    if (!useStellarBalance || !stellarConfig) return null
    const pRaw = BigInt(stellarPtokenBalance)
    const uRaw = BigInt(stellarUnderlyingBalance)
    const decimals = stellarConfig.decimals
    const numericUnderlyingStellar = Number(uRaw) / Math.pow(10, decimals)
    const formatted = formatBalance(uRaw, decimals)

    const refetch = async () => {
      if (!address) return
      const [pRawStr, rateRawStr] = await Promise.all([
        stellarGetPtokenBalance(stellarConfig.vaultId, address),
        stellarGetExchangeRate(stellarConfig.vaultId),
      ])
      const p = BigInt(pRawStr)
      const rate = BigInt(rateRawStr)
      const exchangeScale = BigInt(1000000)
      const underlying = rate > BigInt(0)
        ? (p * rate) / exchangeScale
        : BigInt(0)
      setStellarPtokenBalance(p.toString())
      setStellarUnderlyingBalance(underlying.toString())
      setStellarExchangeRate(rate.toString())
    }

    return {
      pTokenBalance: pRaw > BigInt(0) ? pRaw : undefined,
      underlyingBalance: uRaw > BigInt(0) ? uRaw : undefined,
      decimals,
      pTokenDecimals: 6,
      formattedBalance: formatted,
      numericBalance: numericUnderlyingStellar,
      isLoading: stellarLoading,
      error: null,
      refetch,
      hasBalance: numericUnderlyingStellar >= DUST_THRESHOLD,
      contractAddresses: null,
      exchangeRateRaw: stellarExchangeRate,
    }
  }, [
    useStellarBalance,
    stellarConfig,
    stellarPtokenBalance,
    stellarUnderlyingBalance,
    stellarExchangeRate,
    stellarLoading,
    address,
  ])

  return stellarResult ?? evmResult
} 

// Proactive refresh after transactions complete
// Listen for global tx lifecycle events and trigger immediate refetches
export function usePTokenBalanceTxRefresh(refetch: (() => Promise<any>) | undefined) {
  useEffect(() => {
    if (!refetch) return
    const doBurstyRefetch = () => {
      try {
        refetch()
        // Reduced burstiness: only one retry after 2 seconds
        setTimeout(() => refetch().catch(() => {}), 2000)
      } catch {}
    }
    const onSuccess = () => doBurstyRefetch()
    const onIdle = () => {
      // Throttled idle refetch
      try { setTimeout(() => refetch().catch(() => {}), 1000) } catch {}
    }
    const onBiconomyPhase = (e: any) => {
      try {
        const phase = e?.detail?.phase
        if (phase === 'execute-ok') {
          doBurstyRefetch()
          setTimeout(() => refetch().catch(() => {}), 8000)
        }
      } catch {}
    }
    try {
      window.addEventListener('peridot:tx-success' as any, onSuccess)
      window.addEventListener('peridot:tx-idle' as any, onIdle)
      window.addEventListener('peridot:biconomy-phase' as any, onBiconomyPhase)
    } catch {}
    return () => {
      try {
        window.removeEventListener('peridot:tx-success' as any, onSuccess)
        window.removeEventListener('peridot:tx-idle' as any, onIdle)
        window.removeEventListener('peridot:biconomy-phase' as any, onBiconomyPhase)
      } catch {}
    }
  }, [refetch])
}

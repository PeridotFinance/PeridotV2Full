import { useAccount, useBalance, useReadContract } from 'wagmi'
import { erc20Abi, formatUnits } from 'viem'
import { getAssetContractAddresses } from '@/data/market-data'
import { TOKENS as BICONOMY_TOKENS } from '@/biconomy/constants'
import { useMemo, useEffect, useState, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getConfiguredUnderlyingDecimals } from '@/config/contracts'
import { useActiveWallet } from '@/hooks/use-active-wallet'
import { getStellarVaultConfig, stellarGetTokenBalance, stellarGetNativeXlmBalance } from '@/lib/stellar-soroban-lending'
import { useStellarWallet } from '@/hooks/use-stellar-wallet'

interface UseWalletBalanceProps {
  assetId: string
}

export function useWalletBalance({ assetId }: UseWalletBalanceProps) {
  const { chainId } = useAccount()
  const { address } = useActiveWallet()

  // A Soroban asset id is unambiguously Stellar — read it from the Stellar
  // wallet no matter which EVM network happens to be selected, and never fall
  // through to the EVM branch (where it has no contract and always reads 0).
  //
  // Both gates used to be wrong here. The network gate broke the Stellar-only
  // host, where the chain picker is hidden so `selectedNetworkId` stays at the
  // preset default ("bnb") and can't be changed. And `useActiveWallet` hands
  // back the *EVM* address whenever the user also has an EVM signer, so the
  // balance call ran against a `0x…` address. Either one zeroed the wallet
  // chip, which in turn disabled the percent chips and the deposit CTA.
  // The Stellar tx hooks already bypass `useActiveWallet` for this same reason.
  const stellarConfig = getStellarVaultConfig(assetId)
  const useStellarBalance = stellarConfig !== null
  const stellarWallet = useStellarWallet()
  const stellarAddress = stellarWallet.address || null

  const [lastKnownStellarBalance, setLastKnownStellarBalance] = useState<string | null>(null)

  const {
    data: stellarRawBalance,
    isLoading: stellarLoading,
    error: stellarError,
    refetch: refetchStellar,
    isSuccess: stellarSuccess,
  } = useQuery({
    queryKey: ["stellar-wallet-balance", assetId, stellarAddress],
    enabled: useStellarBalance && !!stellarAddress && !!stellarConfig,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: true,
    retry: 1,
    queryFn: async () => {
      const a = (stellarAddress || "").trim()
      if (!a || !stellarConfig) return "0"
      const [wrapped, native] = await Promise.all([
        stellarGetTokenBalance(stellarConfig.underlying, a),
        assetId === "xlm-stellar" ? stellarGetNativeXlmBalance(a) : Promise.resolve("0"),
      ])
      const w = BigInt(wrapped)
      const n = BigInt(native)
      return w > n ? wrapped : native
    },
  })

  useEffect(() => {
    setLastKnownStellarBalance(null)
  }, [assetId, stellarAddress])

  useEffect(() => {
    if (!useStellarBalance) return
    if (stellarSuccess && stellarRawBalance != null) {
      try {
        if (BigInt(stellarRawBalance) > 0n) {
          setLastKnownStellarBalance(stellarRawBalance)
        }
      } catch {}
    }
  }, [useStellarBalance, stellarSuccess, stellarRawBalance])

  useEffect(() => {
    if (!useStellarBalance) return
    const handler = () => {
      try { refetchStellar() } catch {}
    }
    window.addEventListener("peridot:tx-success" as any, handler)
    return () => window.removeEventListener("peridot:tx-success" as any, handler)
  }, [useStellarBalance, refetchStellar])
  
  // Get contract addresses for the asset
  const contractAddresses = chainId ? getAssetContractAddresses(assetId, chainId) : null
  
  // Fallback underlying address for spoke chains (e.g., Arbitrum): map assetId to chain token
  const symbolUpper = useMemo(() => {
    const map: Record<string, string> = {
      usdc: 'USDC',
      usdt: 'USDT',
      weth: 'WETH',
      wbtc: 'WBTC',
      ausd: 'AUSD',
      wbnb: 'WBNB',
      // Boosted markets should show balance of underlying token
      'morpho-boosted-ausd': 'AUSD',
      'morpho-boosted-usdc': 'USDC',
      'pancake-boosted-lp-ausd-usdc': 'USDC', // Show USDC balance for LP
    }
    return map[assetId]
  }, [assetId])

  const biconomyNetKey = useMemo(() => {
    switch (chainId) {
      case 1: return 'mainnet'
      case 42161: return 'arbitrum'
      case 10: return 'optimism'
      case 137: return 'polygon'
      case 8453: return 'base'
      case 43114: return 'avalanche'
      default: return undefined
    }
  }, [chainId]) as keyof typeof BICONOMY_TOKENS | undefined

  const fallbackUnderlyingAddress = useMemo(() => {
    if (!biconomyNetKey || !symbolUpper) return undefined
    const byNet = (BICONOMY_TOKENS as any)[biconomyNetKey]
    return (byNet ? byNet[symbolUpper] : undefined) as `0x${string}` | undefined
  }, [biconomyNetKey, symbolUpper])
  
  const isNative = Boolean((contractAddresses as any)?.isNative)

  // Read user's wallet balance
  const nativeBalance = useBalance({
    address,
    chainId,
    query: {
      enabled: !!address && !!chainId && isNative,
      refetchInterval: 60000, // Reduced frequency to prevent RPC rate limits
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    }
  })

  const { 
    data: rawBalance, 
    isLoading, 
    error,
    refetch 
  } = useReadContract({
    address: (contractAddresses?.underlyingAddress || fallbackUnderlyingAddress) as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address!],
    chainId: chainId as any,
    query: {
      enabled: !!(contractAddresses?.underlyingAddress || fallbackUnderlyingAddress) && !!address && !!chainId && !isNative,
      refetchInterval: 60000, // Reduced frequency to prevent RPC rate limits
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    }
  } as any)

  // Read token decimals (usually 18 for most tokens)
  const { 
    data: tokenDecimals, 
  } = useReadContract({
    address: (contractAddresses?.underlyingAddress || fallbackUnderlyingAddress) as `0x${string}`,
    abi: erc20Abi,
    functionName: 'decimals',
    args: [],
    chainId: chainId as any,
    query: {
      enabled: !!(contractAddresses?.underlyingAddress || fallbackUnderlyingAddress) && !!chainId,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    }
  } as any)

  // Prefer configured decimals from contracts config when available
  const configuredDecimals = useMemo(() => {
    if (!chainId) return undefined
    return getConfiguredUnderlyingDecimals(chainId, {
      underlyingAddress: (contractAddresses as any)?.underlyingAddress,
      symbol: (contractAddresses as any)?.symbol,
    })
  }, [chainId, contractAddresses])

  const decimals = isNative ? 18 : (configuredDecimals ?? tokenDecimals ?? 18)
  const evmRefetch = isNative ? (nativeBalance.refetch as any) : refetch

  // Format the balance to a readable string (avoid scientific notation)
  const formatBalance = (balance: bigint | undefined, decimals: number | undefined): string => {
    if (!balance || decimals === undefined) return '0.00'
    const numericBalance = parseFloat(formatUnits(balance, decimals))
    if (numericBalance === 0) return '0.00'
    // Dust handling
    if (numericBalance < 0.000001) return '< 0.000001'
    if (numericBalance < 0.01) return numericBalance.toFixed(6)
    return numericBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })
  }

  // Get numeric balance for calculations
  const getNumericBalance = (): number => {
    if (isNative) {
      return nativeBalance.data ? parseFloat(nativeBalance.data.formatted) : 0
    }
    if (!rawBalance) return 0
    const formattedBalance = formatUnits(rawBalance, decimals)
    return parseFloat(formattedBalance)
  }

  const formattedBalance = useMemo(() => {
    if (isNative) {
      if (!nativeBalance.data) return '0.00'
      const numeric = parseFloat(nativeBalance.data.formatted)
      if (numeric === 0) return '0.00'
      if (numeric < 0.000001) return '< 0.000001'
      if (numeric < 0.01) return numeric.toFixed(6)
      return numeric.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })
    }
    return formatBalance(rawBalance as bigint, decimals)
  }, [rawBalance, decimals, isNative, nativeBalance.data])

  // Memoize the return object to prevent unnecessary re-renders
  // When Stellar: return stellar balance; otherwise EVM balance
  const evmResult = useMemo(() => ({
    rawBalance: isNative ? (nativeBalance.data ? (nativeBalance.data.value as unknown as bigint) : undefined) : rawBalance,
    decimals,
    formattedBalance,
    numericBalance: getNumericBalance(),
    isLoading: isNative ? nativeBalance.isLoading : isLoading,
    error: isNative ? (nativeBalance.error as any) : error,
    refetch: isNative ? (nativeBalance.refetch as any) : refetch,
    hasBalance: isNative ? (nativeBalance.data ? nativeBalance.data.value > BigInt(0) : false) : ((rawBalance as bigint || BigInt(0)) > BigInt(0)),
    contractAddresses,
  }), [
    rawBalance,
    nativeBalance.data,
    decimals,
    formattedBalance,
    isNative,
    nativeBalance.isLoading,
    nativeBalance.error,
    nativeBalance.refetch,
    contractAddresses
  ])

  const stellarResult = useMemo(() => {
    if (!useStellarBalance || !stellarConfig) return null
    const rawString = stellarRawBalance ?? lastKnownStellarBalance ?? "0"
    const raw = BigInt(rawString)
    const divisor = Math.pow(10, stellarConfig.decimals)
    const numeric = Number(raw) / divisor
    const formatted =
      numeric === 0 ? "0.00" :
      numeric < 0.000001 ? "< 0.000001" :
      numeric < 0.01 ? numeric.toFixed(6) :
      numeric.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })
    return {
      rawBalance: raw > 0n ? raw : undefined,
      decimals: stellarConfig.decimals,
      formattedBalance: formatted,
      numericBalance: numeric,
      isLoading: stellarLoading,
      error: stellarError ?? null,
      refetch: refetchStellar,
      hasBalance: raw > 0n,
      contractAddresses: null,
    }
  }, [useStellarBalance, stellarConfig, stellarRawBalance, lastKnownStellarBalance, stellarLoading, stellarError, refetchStellar])

  // EVM balances also need immediate reconciliation after tx success.
  useEffect(() => {
    if (useStellarBalance || !evmRefetch) return
    const refresh = () => {
      try {
        evmRefetch()
        setTimeout(() => { try { evmRefetch() } catch {} }, 1500)
      } catch {}
    }
    const onBiconomyPhase = (e: any) => {
      try {
        if (e?.detail?.phase === 'execute-ok') refresh()
      } catch {}
    }
    try {
      window.addEventListener('peridot:tx-success' as any, refresh)
      window.addEventListener('peridot:biconomy-phase' as any, onBiconomyPhase)
    } catch {}
    return () => {
      try {
        window.removeEventListener('peridot:tx-success' as any, refresh)
        window.removeEventListener('peridot:biconomy-phase' as any, onBiconomyPhase)
      } catch {}
    }
  }, [useStellarBalance, evmRefetch])

  return stellarResult ?? evmResult
} 

// Proactive refresh after transactions complete
export function useWalletBalanceTxRefresh(refetch: (() => Promise<any>) | undefined) {
  const refetchRef = useRef(refetch)
  useEffect(() => { refetchRef.current = refetch }, [refetch])

  useEffect(() => {
    const pendingTimers: ReturnType<typeof setTimeout>[] = []
    const schedule = (fn: () => void, ms: number) => {
      const id = setTimeout(fn, ms)
      pendingTimers.push(id)
      return id
    }

    const doBurstyRefetch = () => {
      try {
        refetchRef.current?.()
        schedule(() => refetchRef.current?.().catch(() => {}), 2000)
      } catch {}
    }
    const onSuccess = () => doBurstyRefetch()
    const onIdle = () => {
      try { schedule(() => refetchRef.current?.().catch(() => {}), 1000) } catch {}
    }
    const onBiconomyPhase = (e: any) => {
      try {
        if (e?.detail?.phase === 'execute-ok') {
          doBurstyRefetch()
          schedule(() => refetchRef.current?.().catch(() => {}), 8000)
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
      while (pendingTimers.length) clearTimeout(pendingTimers.pop())
    }
  }, []) // stable — refetch accessed via ref
}

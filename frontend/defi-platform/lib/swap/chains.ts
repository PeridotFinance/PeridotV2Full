import { BITGET_CHAIN_IDS } from './bitget-chains'

/** Chain metadata for the swap UI */
export interface SwapChain {
  chainId: string
  name: string
  icon: string
  nativeSymbol: string
  nativeDecimals: number
  type: 'evm' | 'cosmos' | 'sui' | 'stellar'
  /** Whether Bitget supports this chain (100% fee retention) */
  bitgetSupported: boolean
}

/** Token with chain context for the swap UI */
export interface SwapToken {
  address: string
  symbol: string
  name: string
  decimals: number
  chainId: string
  logoURI: string
  usdPrice?: number
}

const SQUID_API = 'https://apiplus.squidrouter.com'
const SQUID_INTEGRATOR_ID = 'peridot.finance-1f83383f-3e72-494a-8e88-ab93fb91a312'

// In-memory cache
let chainsCache: SwapChain[] | null = null
let tokensByChainCache: Record<string, SwapToken[]> | null = null
let cacheTimestamp = 0
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

function isCacheValid() {
  return Date.now() - cacheTimestamp < CACHE_TTL
}

/** Fetch all supported chains from Squid API */
export async function fetchSwapChains(): Promise<SwapChain[]> {
  if (chainsCache && isCacheValid()) return chainsCache

  const resp = await fetch(`${SQUID_API}/v2/chains`, {
    headers: { 'x-integrator-id': SQUID_INTEGRATOR_ID },
  })

  if (!resp.ok) throw new Error('Failed to fetch chains')

  const data = await resp.json()
  const chains: SwapChain[] = (data.chains ?? []).map((c: any) => ({
    chainId: String(c.chainId ?? c.id),
    name: c.networkName ?? c.chainName,
    icon: c.chainIconURI ?? c.nativeCurrency?.icon ?? '',
    nativeSymbol: c.nativeCurrency?.symbol ?? '',
    nativeDecimals: c.nativeCurrency?.decimals ?? 18,
    type: c.chainType ?? c.type ?? 'evm',
    bitgetSupported: BITGET_CHAIN_IDS.has(Number(c.chainId)),
  }))

  // Sort: EVM first, then by name. Bitget-supported chains at top.
  chains.sort((a, b) => {
    if (a.type === 'evm' && b.type !== 'evm') return -1
    if (a.type !== 'evm' && b.type === 'evm') return 1
    if (a.bitgetSupported && !b.bitgetSupported) return -1
    if (!a.bitgetSupported && b.bitgetSupported) return 1
    return a.name.localeCompare(b.name)
  })

  chainsCache = chains
  cacheTimestamp = Date.now()
  return chains
}

/** Fetch all tokens from Squid, grouped by chain */
export async function fetchSwapTokens(): Promise<Record<string, SwapToken[]>> {
  if (tokensByChainCache && isCacheValid()) return tokensByChainCache

  const resp = await fetch(`${SQUID_API}/v2/tokens`, {
    headers: { 'x-integrator-id': SQUID_INTEGRATOR_ID },
  })

  if (!resp.ok) throw new Error('Failed to fetch tokens')

  const data = await resp.json()
  const grouped: Record<string, SwapToken[]> = {}

  for (const t of data.tokens ?? []) {
    const chainId = String(t.chainId)
    const token: SwapToken = {
      address: t.address ?? '',
      symbol: t.symbol ?? '',
      name: t.name ?? t.symbol ?? '',
      decimals: t.decimals ?? 18,
      chainId,
      logoURI: t.logoURI ?? '',
      usdPrice: t.usdPrice,
    }

    if (!grouped[chainId]) grouped[chainId] = []
    grouped[chainId].push(token)
  }

  // Sort tokens within each chain: stablecoins first, then by USD price desc
  const stablecoins = new Set(['USDC', 'USDT', 'USDC.e', 'USDbC', 'DAI', 'BUSD', 'FRAX'])
  for (const chainId of Object.keys(grouped)) {
    grouped[chainId].sort((a, b) => {
      const aStable = stablecoins.has(a.symbol) ? 0 : 1
      const bStable = stablecoins.has(b.symbol) ? 0 : 1
      if (aStable !== bStable) return aStable - bStable
      return (b.usdPrice ?? 0) - (a.usdPrice ?? 0)
    })
  }

  tokensByChainCache = grouped
  return grouped
}

/** Fetch both chains and tokens in parallel */
export async function fetchSwapData() {
  const [chains, tokensByChain] = await Promise.all([
    fetchSwapChains(),
    fetchSwapTokens(),
  ])
  return { chains, tokensByChain }
}

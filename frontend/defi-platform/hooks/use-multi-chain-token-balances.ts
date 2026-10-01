'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useQueries } from '@tanstack/react-query'
import { createPublicClient, http, fallback, erc20Abi, formatUnits, type Address } from 'viem'
import { getChainConfig } from '@/config/contracts'

// Reliable public RPCs per chain. Env vars (set in .env.local) take precedence,
// then chain-config value, then these fallbacks. Public `drpc.org` endpoints
// return intermittent 500s under load — never use them as the sole URL.
function rpcUrlsFor(chainId: number): string[] {
  const env = (k: string) => (process.env[k] || '').trim() || null
  const cfg = (getChainConfig(chainId) as any)?.rpcUrl as string | undefined
  const envKey: Record<number, string> = {
    1: 'NEXT_PUBLIC_RPC_ETHEREUM_MAINNET',
    56: 'NEXT_PUBLIC_RPC_BSC_MAINNET',
    97: 'NEXT_PUBLIC_RPC_BSC_TESTNET',
    137: 'NEXT_PUBLIC_RPC_POLYGON_MAINNET',
    143: 'NEXT_PUBLIC_RPC_MONAD_MAINNET',
    8453: 'NEXT_PUBLIC_RPC_BASE_MAINNET',
    10143: 'NEXT_PUBLIC_RPC_MONAD_TESTNET',
    42161: 'NEXT_PUBLIC_RPC_ARBITRUM_MAINNET',
    43114: 'NEXT_PUBLIC_RPC_AVALANCHE_MAINNET',
    50312: 'NEXT_PUBLIC_RPC_SOMNIA_TESTNET',
    84532: 'NEXT_PUBLIC_RPC_BASE_SEPOLIA',
    421614: 'NEXT_PUBLIC_RPC_ARBITRUM_SEPOLIA',
    11155111: 'NEXT_PUBLIC_RPC_ETHEREUM_SEPOLIA',
  }
  const extras: Record<number, string[]> = {
    // Every entry here is reachable AND present in the nginx CSP connect-src.
    // A URL the CSP forbids is not a fallback, it is a dead branch: the browser
    // refuses it before the request leaves. LlamaRPC was dropped in full when
    // its public endpoints stopped resolving (polygon/arbitrum/binance NXDOMAIN,
    // eth/base 521), as was polygon-rpc.com once it started answering 401.
    1: ['https://ethereum.drpc.org', 'https://ethereum-rpc.publicnode.com', 'https://cloudflare-eth.com'],
    56: ['https://bsc-dataseed.binance.org', 'https://bsc-dataseed1.binance.org', 'https://bsc-rpc.publicnode.com'],
    97: ['https://data-seed-prebsc-1-s1.binance.org:8545/', 'https://bsc-testnet-rpc.publicnode.com'],
    137: ['https://polygon.drpc.org', 'https://polygon-bor-rpc.publicnode.com'],
    143: ['https://rpc3.monad.xyz'],
    8453: ['https://mainnet.base.org', 'https://base.drpc.org', 'https://base-rpc.publicnode.com'],
    10143: ['https://testnet-rpc.monad.xyz/'],
    42161: ['https://arb1.arbitrum.io/rpc', 'https://arbitrum.drpc.org', 'https://arbitrum-one-rpc.publicnode.com'],
    43114: ['https://api.avax.network/ext/bc/C/rpc', 'https://avalanche-c-chain-rpc.publicnode.com'],
    50312: ['https://dream-rpc.somnia.network/'],
    84532: ['https://sepolia.base.org', 'https://base-sepolia-rpc.publicnode.com'],
    421614: ['https://sepolia-rollup.arbitrum.io/rpc', 'https://arbitrum-sepolia.publicnode.com'],
    11155111: ['https://sepolia.drpc.org', 'https://ethereum-sepolia-rpc.publicnode.com'],
  }
  const out: string[] = []
  const ek = envKey[chainId]
  if (ek) {
    const v = env(ek)
    if (v) out.push(v)
  }
  if (cfg && !out.includes(cfg)) out.push(cfg)
  for (const u of extras[chainId] || []) if (!out.includes(u)) out.push(u)
  return out
}

export type TokenBalance = {
  symbol: string
  displaySymbol: string
  address: Address | null
  balance: bigint
  balanceFormatted: string
  decimals: number
  isNative: boolean
  logoUrl: string
}

export type ChainAssets = {
  chainId: number
  chainName: string
  chainLogoUrl: string
  nativeSymbol: string
  rpcUrls: string[]
  tokens: TokenBalance[]
  isLoading: boolean
  isError: boolean
}

/** A specific token on a specific chain — used to preselect an asset for sending. */
export type PreselectedSendToken = {
  chainId: number
  chainName: string
  chainLogoUrl: string
  token: TokenBalance
}

type TokenSpec = {
  symbol: string
  displaySymbol: string
  address?: Address
  decimals: number
  isNative?: boolean
  logoUrl: string
}

type ChainSpec = {
  chainId: number
  chainName: string
  chainLogoUrl: string
  nativeSymbol: string
  rpcUrls: string[]
  tokens: TokenSpec[]
}

const LOGO = {
  bnb: '/tokenimages/app/bnb-logo.svg',
  eth: '/tokenimages/app/ethereum-eth-logo.svg',
  monad: '/tokenimages/app/Monad-Logo.svg',
  polygon: '/tokenimages/app/polygon-matic-logo.svg',
  avax: '/tokenimages/app/avax.png',
  arbitrum: '/tokenimages/app/arbitrum-logo.svg',
  base: '/tokenimages/app/base-logo.svg',
  somnia: '/tokenimages/app/somnia_logo_color.jpg',
  usdc: '/tokenimages/app/usd-coin-usdc-logo.svg',
  usdt: '/tokenimages/app/tether-usdt-logo.svg',
}

const isMainnetPreset = (): boolean => {
  const preset = process.env.NEXT_PUBLIC_NETWORK_PRESET || 'testnet'
  return preset.startsWith('mainnet')
}

function getTokenFromChainConfig(
  chainId: number,
  key: 'USDC' | 'USDT' | 'WETH' | 'WBNB' | 'WMON'
): { address: Address; decimals: number } | null {
  const cfg = getChainConfig(chainId) as any
  if (!cfg) return null
  const tokens = cfg.tokens as Record<string, string> | undefined
  const markets = cfg.markets as Record<string, any> | undefined
  const address = tokens?.[key] as Address | undefined
  if (!address) {
    // Fall back to axelar-mapped testnet spoke entries
    if (key === 'USDC' && markets?.AXL_USDC?.underlying) {
      return { address: markets.AXL_USDC.underlying as Address, decimals: markets.AXL_USDC.decimals ?? 6 }
    }
    if (key === 'WBNB' && markets?.AXL_WBNB?.underlying) {
      return { address: markets.AXL_WBNB.underlying as Address, decimals: markets.AXL_WBNB.decimals ?? 18 }
    }
    return null
  }
  const mk = markets?.[key]
  const decimals =
    typeof mk?.decimals === 'number'
      ? mk.decimals
      : key === 'USDC' || key === 'USDT'
      ? 6
      : 18
  return { address, decimals }
}

function addToken(
  list: TokenSpec[],
  chainId: number,
  key: 'USDC' | 'USDT' | 'WETH' | 'WBNB' | 'WMON',
  opts: { displaySymbol: string; logoUrl: string; override?: { address: Address; decimals: number } }
) {
  const found = opts.override ?? getTokenFromChainConfig(chainId, key)
  if (!found) return
  list.push({
    symbol: key,
    displaySymbol: opts.displaySymbol,
    address: found.address,
    decimals: found.decimals,
    logoUrl: opts.logoUrl,
  })
}

function buildMainnetChainSpecs(): ChainSpec[] {
  const specs: ChainSpec[] = []

  // BSC Mainnet — BNB + USDC + USDT + WETH + WBNB
  {
    const tokens: TokenSpec[] = [
      { symbol: 'BNB', displaySymbol: 'BNB', decimals: 18, isNative: true, logoUrl: LOGO.bnb },
    ]
    addToken(tokens, 56, 'USDC', { displaySymbol: 'USDC', logoUrl: LOGO.usdc })
    addToken(tokens, 56, 'USDT', { displaySymbol: 'USDT', logoUrl: LOGO.usdt })
    addToken(tokens, 56, 'WETH', { displaySymbol: 'WETH', logoUrl: LOGO.eth })
    addToken(tokens, 56, 'WBNB', { displaySymbol: 'WBNB', logoUrl: LOGO.bnb })
    specs.push({
      chainId: 56,
      chainName: 'BNB Chain',
      chainLogoUrl: LOGO.bnb,
      nativeSymbol: 'BNB',
      rpcUrls: rpcUrlsFor(56),
      tokens,
    })
  }

  // Arbitrum Mainnet
  {
    const tokens: TokenSpec[] = [
      { symbol: 'ETH', displaySymbol: 'ETH', decimals: 18, isNative: true, logoUrl: LOGO.eth },
    ]
    addToken(tokens, 42161, 'USDC', { displaySymbol: 'USDC', logoUrl: LOGO.usdc })
    addToken(tokens, 42161, 'USDT', { displaySymbol: 'USDT', logoUrl: LOGO.usdt })
    addToken(tokens, 42161, 'WETH', { displaySymbol: 'WETH', logoUrl: LOGO.eth })
    specs.push({
      chainId: 42161,
      chainName: 'Arbitrum',
      chainLogoUrl: LOGO.arbitrum,
      nativeSymbol: 'ETH',
      rpcUrls: rpcUrlsFor(42161),
      tokens,
    })
  }

  // Ethereum Mainnet
  {
    const tokens: TokenSpec[] = [
      { symbol: 'ETH', displaySymbol: 'ETH', decimals: 18, isNative: true, logoUrl: LOGO.eth },
    ]
    addToken(tokens, 1, 'USDC', { displaySymbol: 'USDC', logoUrl: LOGO.usdc })
    addToken(tokens, 1, 'USDT', { displaySymbol: 'USDT', logoUrl: LOGO.usdt })
    addToken(tokens, 1, 'WETH', { displaySymbol: 'WETH', logoUrl: LOGO.eth })
    specs.push({
      chainId: 1,
      chainName: 'Ethereum',
      chainLogoUrl: LOGO.eth,
      nativeSymbol: 'ETH',
      rpcUrls: rpcUrlsFor(1),
      tokens,
    })
  }

  // Polygon Mainnet (no tokens in config → hardcode canonical addresses)
  specs.push({
    chainId: 137,
    chainName: 'Polygon',
    chainLogoUrl: LOGO.polygon,
    nativeSymbol: 'POL',
    rpcUrls: rpcUrlsFor(137),
    tokens: [
      { symbol: 'POL', displaySymbol: 'POL', decimals: 18, isNative: true, logoUrl: LOGO.polygon },
      { symbol: 'USDC', displaySymbol: 'USDC', address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', decimals: 6, logoUrl: LOGO.usdc },
      { symbol: 'USDT', displaySymbol: 'USDT', address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6, logoUrl: LOGO.usdt },
      { symbol: 'WETH', displaySymbol: 'WETH', address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', decimals: 18, logoUrl: LOGO.eth },
    ],
  })

  // Base Mainnet
  specs.push({
    chainId: 8453,
    chainName: 'Base',
    chainLogoUrl: LOGO.base,
    nativeSymbol: 'ETH',
    rpcUrls: rpcUrlsFor(8453),
    tokens: [
      { symbol: 'ETH', displaySymbol: 'ETH', decimals: 18, isNative: true, logoUrl: LOGO.eth },
      { symbol: 'USDC', displaySymbol: 'USDC', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6, logoUrl: LOGO.usdc },
      { symbol: 'USDT', displaySymbol: 'USDT', address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', decimals: 6, logoUrl: LOGO.usdt },
      { symbol: 'WETH', displaySymbol: 'WETH', address: '0x4200000000000000000000000000000000000006', decimals: 18, logoUrl: LOGO.eth },
    ],
  })

  // Avalanche Mainnet
  specs.push({
    chainId: 43114,
    chainName: 'Avalanche',
    chainLogoUrl: LOGO.avax,
    nativeSymbol: 'AVAX',
    rpcUrls: rpcUrlsFor(43114),
    tokens: [
      { symbol: 'AVAX', displaySymbol: 'AVAX', decimals: 18, isNative: true, logoUrl: LOGO.avax },
      { symbol: 'USDC', displaySymbol: 'USDC', address: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E', decimals: 6, logoUrl: LOGO.usdc },
      { symbol: 'USDT', displaySymbol: 'USDT', address: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7', decimals: 6, logoUrl: LOGO.usdt },
      { symbol: 'WETH', displaySymbol: 'WETH', address: '0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB', decimals: 18, logoUrl: LOGO.eth },
    ],
  })

  // Monad Mainnet
  {
    const cfg = getChainConfig(143) as any
    if (cfg) {
      const tokens: TokenSpec[] = [
        { symbol: 'MON', displaySymbol: 'MON', decimals: 18, isNative: true, logoUrl: LOGO.monad },
      ]
      addToken(tokens, 143, 'USDC', { displaySymbol: 'USDC', logoUrl: LOGO.usdc })
      specs.push({
        chainId: 143,
        chainName: 'Monad',
        chainLogoUrl: LOGO.monad,
        nativeSymbol: 'MON',
        rpcUrls: rpcUrlsFor(143),
        tokens,
      })
    }
  }

  return specs
}

function buildTestnetChainSpecs(): ChainSpec[] {
  const specs: ChainSpec[] = []

  // BSC Testnet
  {
    const tokens: TokenSpec[] = [
      { symbol: 'BNB', displaySymbol: 'BNB', decimals: 18, isNative: true, logoUrl: LOGO.bnb },
    ]
    addToken(tokens, 97, 'USDC', { displaySymbol: 'USDC', logoUrl: LOGO.usdc })
    addToken(tokens, 97, 'USDT', { displaySymbol: 'USDT', logoUrl: LOGO.usdt })
    addToken(tokens, 97, 'WBNB', { displaySymbol: 'WBNB', logoUrl: LOGO.bnb })
    specs.push({
      chainId: 97,
      chainName: 'BNB Testnet',
      chainLogoUrl: LOGO.bnb,
      nativeSymbol: 'BNB',
      rpcUrls: rpcUrlsFor(97),
      tokens,
    })
  }

  // Arbitrum Sepolia
  {
    const tokens: TokenSpec[] = [
      { symbol: 'ETH', displaySymbol: 'ETH', decimals: 18, isNative: true, logoUrl: LOGO.eth },
    ]
    addToken(tokens, 421614, 'USDC', { displaySymbol: 'USDC', logoUrl: LOGO.usdc })
    addToken(tokens, 421614, 'WBNB', { displaySymbol: 'WBNB', logoUrl: LOGO.bnb })
    specs.push({
      chainId: 421614,
      chainName: 'Arbitrum Sepolia',
      chainLogoUrl: LOGO.arbitrum,
      nativeSymbol: 'ETH',
      rpcUrls: rpcUrlsFor(421614),
      tokens,
    })
  }

  // Base Sepolia
  {
    const tokens: TokenSpec[] = [
      { symbol: 'ETH', displaySymbol: 'ETH', decimals: 18, isNative: true, logoUrl: LOGO.eth },
    ]
    addToken(tokens, 84532, 'USDC', { displaySymbol: 'USDC', logoUrl: LOGO.usdc })
    addToken(tokens, 84532, 'WBNB', { displaySymbol: 'WBNB', logoUrl: LOGO.bnb })
    specs.push({
      chainId: 84532,
      chainName: 'Base Sepolia',
      chainLogoUrl: LOGO.base,
      nativeSymbol: 'ETH',
      rpcUrls: rpcUrlsFor(84532),
      tokens,
    })
  }

  // Ethereum Sepolia
  {
    const tokens: TokenSpec[] = [
      { symbol: 'ETH', displaySymbol: 'ETH', decimals: 18, isNative: true, logoUrl: LOGO.eth },
    ]
    addToken(tokens, 11155111, 'USDC', { displaySymbol: 'USDC', logoUrl: LOGO.usdc })
    addToken(tokens, 11155111, 'WBNB', { displaySymbol: 'WBNB', logoUrl: LOGO.bnb })
    specs.push({
      chainId: 11155111,
      chainName: 'Ethereum Sepolia',
      chainLogoUrl: LOGO.eth,
      nativeSymbol: 'ETH',
      rpcUrls: rpcUrlsFor(11155111),
      tokens,
    })
  }

  // Monad Testnet
  {
    const tokens: TokenSpec[] = [
      { symbol: 'MON', displaySymbol: 'MON', decimals: 18, isNative: true, logoUrl: LOGO.monad },
    ]
    addToken(tokens, 10143, 'USDC', { displaySymbol: 'USDC', logoUrl: LOGO.usdc })
    addToken(tokens, 10143, 'USDT', { displaySymbol: 'USDT', logoUrl: LOGO.usdt })
    addToken(tokens, 10143, 'WETH', { displaySymbol: 'WETH', logoUrl: LOGO.eth })
    addToken(tokens, 10143, 'WMON', { displaySymbol: 'WMON', logoUrl: LOGO.monad })
    specs.push({
      chainId: 10143,
      chainName: 'Monad Testnet',
      chainLogoUrl: LOGO.monad,
      nativeSymbol: 'MON',
      rpcUrls: rpcUrlsFor(10143),
      tokens,
    })
  }

  // Somnia Testnet
  {
    const tokens: TokenSpec[] = [
      { symbol: 'STT', displaySymbol: 'STT', decimals: 18, isNative: true, logoUrl: LOGO.somnia },
    ]
    addToken(tokens, 50312, 'USDC', { displaySymbol: 'USDC', logoUrl: LOGO.usdc })
    addToken(tokens, 50312, 'USDT', { displaySymbol: 'USDT', logoUrl: LOGO.usdt })
    addToken(tokens, 50312, 'WETH', { displaySymbol: 'WETH', logoUrl: LOGO.eth })
    specs.push({
      chainId: 50312,
      chainName: 'Somnia Testnet',
      chainLogoUrl: LOGO.somnia,
      nativeSymbol: 'STT',
      rpcUrls: rpcUrlsFor(50312),
      tokens,
    })
  }

  return specs
}

async function fetchChainAssets(address: Address, spec: ChainSpec): Promise<TokenBalance[]> {
  if (spec.rpcUrls.length === 0) return []
  const transports = spec.rpcUrls.map((url) => http(url, { batch: { batchSize: 20, wait: 10 }, retryCount: 0 }))
  const client = createPublicClient({
    transport: transports.length > 1 ? fallback(transports, { rank: false, retryCount: 0 }) : transports[0],
  })

  const results = await Promise.all(
    spec.tokens.map(async (t): Promise<TokenBalance | null> => {
      try {
        let balance: bigint
        if (t.isNative) {
          balance = await client.getBalance({ address })
        } else if (t.address) {
          balance = (await client.readContract({
            address: t.address,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [address],
          })) as bigint
        } else {
          return null
        }
        return {
          symbol: t.symbol,
          displaySymbol: t.displaySymbol,
          address: t.address ?? null,
          balance,
          balanceFormatted: formatUnits(balance, t.decimals),
          decimals: t.decimals,
          isNative: !!t.isNative,
          logoUrl: t.logoUrl,
        }
      } catch {
        return null
      }
    })
  )

  return results.filter((r): r is TokenBalance => r !== null)
}

/**
 * Fetches native + stablecoin (USDC/USDT) + wrapped-gas-token (WETH/WBNB/WMON) balances
 * for the connected wallet across every hub and spoke chain, in parallel.
 *
 * Each chain has its own React Query entry so one slow RPC never blocks the others —
 * cards stream into the UI as they resolve.
 */
export function useMultiChainTokenBalances(address: string | null | undefined) {
  const chainSpecs = useMemo(() => (isMainnetPreset() ? buildMainnetChainSpecs() : buildTestnetChainSpecs()), [])

  const queries = useQueries({
    queries: chainSpecs.map((spec) => ({
      queryKey: ['multi-chain-token-balances', spec.chainId, address],
      enabled: !!address && spec.rpcUrls.length > 0,
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 2,
      queryFn: () => fetchChainAssets(address as Address, spec),
    })),
  })

  const chains = useMemo<ChainAssets[]>(() => {
    return chainSpecs.map((spec, i) => {
      const q = queries[i]
      return {
        chainId: spec.chainId,
        chainName: spec.chainName,
        chainLogoUrl: spec.chainLogoUrl,
        nativeSymbol: spec.nativeSymbol,
        rpcUrls: spec.rpcUrls,
        tokens: (q.data as TokenBalance[] | undefined) ?? [],
        isLoading: q.isLoading,
        isError: q.isError,
      }
    })
  }, [chainSpecs, queries])

  const isLoading = queries.some((q) => q.isLoading)
  const hasAnyLoaded = queries.some((q) => q.isSuccess)
  const refetch = () => {
    queries.forEach((q) => q.refetch())
  }

  // Refresh balances when any transaction elsewhere in the app succeeds (e.g. a
  // send completed in the wallet dialog). A ref keeps the listener stable while
  // still pointing at the current set of queries.
  const queriesRef = useRef(queries)
  queriesRef.current = queries
  useEffect(() => {
    const handler = () => {
      queriesRef.current.forEach((q) => {
        try {
          q.refetch()
        } catch {
          /* refetch is best-effort */
        }
      })
    }
    window.addEventListener('peridot:tx-success', handler)
    return () => window.removeEventListener('peridot:tx-success', handler)
  }, [])

  return { chains, isLoading, hasAnyLoaded, refetch }
}

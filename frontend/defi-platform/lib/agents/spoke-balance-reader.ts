/**
 * Reads idle wallet balances of bridgeable tokens (USDC/USDT/WETH/…) across
 * supported spoke chains. Surfaces them to Perry's context so he can route
 * "deposit my USDT" to `execute_cross_chain_supply` on the correct chain
 * instead of guessing same-chain + failing preflight.
 *
 * Kept intentionally separate from portfolio-reader.ts because:
 *  - Portfolio-reader = Peridot positions (supplied / borrowed via pTokens)
 *  - Spoke-balance-reader = idle ERC-20s in the wallet on non-hub chains
 *  - Different chains, different contracts, different cadence for updates
 */

import { createPublicClient, http, formatUnits, type Chain } from 'viem'
import { mainnet, arbitrum, optimism, polygon, base, avalanche } from 'viem/chains'
import type { WalletBalance } from '@/types/agents'
import { TOKENS } from '@/biconomy/constants'

interface SpokeChainConfig {
  chain: Chain
  /** Decimals for each listed asset; we rely on the most common values for
   *  well-known ERC-20s so a single read per token is enough. */
  decimals: Record<string, number>
}

const SPOKE_CHAINS: Record<number, SpokeChainConfig> = {
  1: {
    chain: mainnet,
    decimals: { USDC: 6, USDT: 6, WETH: 18, WBTC: 8 },
  },
  42161: {
    chain: arbitrum,
    decimals: { USDC: 6, USDT: 6, WETH: 18, WBTC: 8 },
  },
  10: {
    chain: optimism,
    decimals: { USDC: 6, USDT: 6, WETH: 18 },
  },
  137: {
    chain: polygon,
    decimals: { USDC: 6, USDT: 6, WETH: 18 },
  },
  8453: {
    chain: base,
    decimals: { USDC: 6, WETH: 18 },
  },
  43114: {
    chain: avalanche,
    decimals: { USDC: 6, USDT: 6 },
  },
}

const CHAIN_NAME_MAP: Record<number, keyof typeof TOKENS> = {
  1: 'mainnet',
  42161: 'arbitrum',
  10: 'optimism',
  137: 'polygon',
  8453: 'base',
  43114: 'avalanche',
}

// Per-chain RPC env-var override. Mirrors the convention from
// `hooks/use-multi-chain-token-balances.ts` so configuring a single env var
// (e.g. NEXT_PUBLIC_RPC_ARBITRUM_MAINNET) flips both client- and server-side
// reads to the same provider. Fallback URLs match `config/contracts.ts` and
// are used when the env override is unset.
const RPC_ENV: Record<number, { envKey: string; fallback: string }> = {
  1: { envKey: 'NEXT_PUBLIC_RPC_ETHEREUM_MAINNET', fallback: 'https://eth.drpc.org' },
  42161: { envKey: 'NEXT_PUBLIC_RPC_ARBITRUM_MAINNET', fallback: 'https://arbitrum.drpc.org' },
  10: { envKey: 'NEXT_PUBLIC_RPC_OPTIMISM_MAINNET', fallback: 'https://optimism.drpc.org' },
  137: { envKey: 'NEXT_PUBLIC_RPC_POLYGON_MAINNET', fallback: 'https://polygon.drpc.org' },
  8453: { envKey: 'NEXT_PUBLIC_RPC_BASE_MAINNET', fallback: 'https://base.drpc.org' },
  43114: { envKey: 'NEXT_PUBLIC_RPC_AVALANCHE_MAINNET', fallback: 'https://avalanche.drpc.org' },
}

function rpcFor(chainId: number): string | undefined {
  const entry = RPC_ENV[chainId]
  if (!entry) return undefined
  return process.env[entry.envKey] || entry.fallback
}

const BALANCE_OF_ABI = [
  {
    type: 'function' as const,
    name: 'balanceOf',
    stateMutability: 'view' as const,
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

const STABLECOINS = new Set(['USDC', 'USDT', 'DAI', 'AUSD', 'BUSD'])

async function readSpokeChain(
  userAddress: string,
  chainId: number,
): Promise<WalletBalance[]> {
  const config = SPOKE_CHAINS[chainId]
  const chainName = CHAIN_NAME_MAP[chainId]
  if (!config || !chainName) return []

  const tokenMap = TOKENS[chainName] as Record<string, string> | undefined
  if (!tokenMap) return []

  const client = createPublicClient({
    chain: config.chain,
    transport: http(rpcFor(chainId)),
    batch: { multicall: true },
  })

  // Build one balanceOf call per known bridgeable token on this chain.
  const entries = Object.entries(tokenMap).filter(
    ([symbol]) => symbol in config.decimals,
  ) as Array<[string, `0x${string}`]>
  if (entries.length === 0) return []

  const contracts = entries.map(([, addr]) => ({
    address: addr,
    abi: BALANCE_OF_ABI,
    functionName: 'balanceOf' as const,
    args: [userAddress as `0x${string}`] as const,
  }))

  const results = await Promise.allSettled(
    contracts.map((c) => client.readContract(c)),
  )

  const balances: WalletBalance[] = []
  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    if (result.status !== 'fulfilled') continue
    const raw = result.value as bigint
    if (raw === BigInt(0)) continue
    const [symbol, tokenAddress] = entries[i]
    const decimals = config.decimals[symbol]
    const amount = formatUnits(raw, decimals)
    balances.push({
      assetSymbol: symbol,
      chainId,
      amount,
      tokenAddress,
      amountUsd: STABLECOINS.has(symbol) ? Number(amount) : undefined,
    })
  }

  return balances
}

/**
 * Read the user's idle bridgeable-token balances across all spoke chains.
 * Returns an empty array when nothing is held — caller merges into the
 * portfolio view. Per-chain timeout ensures one slow/dead RPC never stalls
 * the whole portfolio response beyond the budget.
 */
export async function readSpokeWalletBalances(
  userAddress: string,
  { perChainTimeoutMs = 6000 }: { perChainTimeoutMs?: number } = {},
): Promise<WalletBalance[]> {
  // Stellar-only callers pass a G-address (Stufe 1) — EVM-only reads, return
  // empty rather than throwing on a non-EVM address cast into `balanceOf`. A
  // Stellar address starts with 'G', never '0x'.
  if (!userAddress.startsWith('0x')) return []
  const chainIds = Object.keys(SPOKE_CHAINS).map(Number)
  const results = await Promise.allSettled(
    chainIds.map((cid) =>
      Promise.race<WalletBalance[]>([
        readSpokeChain(userAddress, cid),
        new Promise<WalletBalance[]>((resolve) =>
          setTimeout(() => resolve([]), perChainTimeoutMs),
        ),
      ]),
    ),
  )
  const merged: WalletBalance[] = []
  for (const r of results) {
    if (r.status === 'fulfilled') merged.push(...r.value)
  }
  return merged
}

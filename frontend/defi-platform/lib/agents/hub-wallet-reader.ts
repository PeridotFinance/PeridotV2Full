/**
 * Reads idle ERC-20 balances in the user's wallet on HUB chains (BSC, Monad).
 *
 * Parallel to `spoke-balance-reader.ts` which handles spokes. Kept separate
 * because hub chains use different token registries (Peridot's own underlying
 * map) and don't need the Biconomy-specific token list. Output shape is the
 * identical `WalletBalance` so the portfolio tool concatenates both sources
 * into one list.
 *
 * Why we need this: after a withdraw the user's USDT sits idle in the BSC
 * wallet. Routing would otherwise miss it entirely and suggest a cross-chain
 * supply from a smaller spoke balance. See routing.ts for the planner.
 */

import { createPublicClient, http, formatUnits, type Chain } from 'viem'
import { bsc } from 'viem/chains'
import type { WalletBalance } from '@/types/agents'
import { BSC_UNDERLYING_TOKENS } from '@/biconomy/constants'

interface HubChainConfig {
  chain: Chain
  decimals: Record<string, number>
  tokens: Record<string, `0x${string}`>
}

// Per-chain RPC env-var override. Same convention as spoke-balance-reader
// and `hooks/use-multi-chain-token-balances.ts` — set NEXT_PUBLIC_RPC_BSC_MAINNET
// once and both client + server reads use it.
const RPC_ENV: Record<number, { envKey: string; fallback: string }> = {
  56: { envKey: 'NEXT_PUBLIC_RPC_BSC_MAINNET', fallback: 'https://bsc-dataseed.binance.org' },
}

function rpcFor(chainId: number): string | undefined {
  const entry = RPC_ENV[chainId]
  if (!entry) return undefined
  return process.env[entry.envKey] || entry.fallback
}

// BSC token decimals — binance-peg USDT and USDC are 18 decimals, unlike the
// 6-decimal versions on every other chain. WBTC, WBNB, WETH also 18.
const HUB_CHAINS: Record<number, HubChainConfig> = {
  56: {
    chain: bsc,
    decimals: { USDC: 18, USDT: 18, WETH: 18, WBTC: 18, WBNB: 18, AUSD: 6 },
    tokens: {
      USDC: BSC_UNDERLYING_TOKENS.USDC,
      USDT: BSC_UNDERLYING_TOKENS.USDT,
      WETH: BSC_UNDERLYING_TOKENS.WETH,
      WBTC: BSC_UNDERLYING_TOKENS.WBTC,
      WBNB: BSC_UNDERLYING_TOKENS.WBNB,
      AUSD: BSC_UNDERLYING_TOKENS.AUSD,
    },
  },
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

async function readHubChain(
  userAddress: string,
  chainId: number,
): Promise<WalletBalance[]> {
  const config = HUB_CHAINS[chainId]
  if (!config) return []

  const client = createPublicClient({
    chain: config.chain,
    transport: http(rpcFor(chainId)),
    batch: { multicall: true },
  })

  const entries = Object.entries(config.tokens) as Array<[string, `0x${string}`]>
  if (entries.length === 0) return []

  const results = await Promise.allSettled(
    entries.map(([, addr]) =>
      client.readContract({
        address: addr,
        abi: BALANCE_OF_ABI,
        functionName: 'balanceOf',
        args: [userAddress as `0x${string}`],
      }),
    ),
  )

  const balances: WalletBalance[] = []
  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    if (result.status !== 'fulfilled') continue
    const raw = result.value as bigint
    if (raw === BigInt(0)) continue
    const [symbol, tokenAddress] = entries[i]
    const decimals = config.decimals[symbol] ?? 18
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
 * Read the user's idle ERC-20 balances across all hub chains. Combine with
 * `readSpokeWalletBalances` in the portfolio tool for the full picture.
 */
export async function readHubWalletBalances(
  userAddress: string,
  { perChainTimeoutMs = 6000 }: { perChainTimeoutMs?: number } = {},
): Promise<WalletBalance[]> {
  // Stellar-only callers pass a G-address (Stufe 1). These are EVM-only reads;
  // casting a non-EVM address into `balanceOf` would throw at the RPC. A
  // Stellar address starts with 'G', never '0x', so short-circuit to empty.
  if (!userAddress.startsWith('0x')) return []
  const chainIds = Object.keys(HUB_CHAINS).map(Number)
  const results = await Promise.allSettled(
    chainIds.map((cid) =>
      Promise.race<WalletBalance[]>([
        readHubChain(userAddress, cid),
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

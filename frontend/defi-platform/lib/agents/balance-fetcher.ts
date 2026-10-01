/**
 * Server-side balance fetcher used by `/api/agents/execute` preflight.
 *
 * Reads a single ERC-20 or native-token balance on a hub chain. Deliberately
 * lightweight — this runs on the hot path before every agent tx, so we skip
 * multicall and just do one targeted RPC call.
 *
 * If the RPC fails or the chain is unsupported, we return `null` — the
 * preflight check in `lib/agents/preflight.ts` treats an absent balance as
 * "skip balance check" (the on-chain call will revert later if insufficient,
 * but the UX is still acceptable).
 */

import { createPublicClient, http, type Chain } from 'viem'
import { bsc, bscTestnet, monadTestnet } from 'viem/chains'
import { defineChain } from 'viem'
import { getAssetContractAddresses } from '@/data/market-data'

// Keep in sync with portfolio-reader.ts — Monad mainnet is not in viem/chains yet.
const monadMainnet = defineChain({
  id: 143,
  name: 'Monad',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_RPC_MONAD_MAINNET ?? 'https://rpc3.monad.xyz'],
    },
  },
})

const CHAIN_MAP: Record<number, Chain> = {
  56: bsc,
  97: bscTestnet,
  143: monadMainnet,
  10143: monadTestnet,
}

const ERC20_BALANCE_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

export interface BalanceFetchInput {
  userAddress: string
  assetId: string
  chainId: number
}

export interface BalanceFetchResult {
  /** Base units (wei or token's smallest denomination). Null when unable to fetch. */
  balance: bigint | null
  /** Whether the asset is the chain's native token (BNB, MON, …) */
  isNative: boolean
  /** Token decimals; null on failure */
  decimals: number | null
}

/**
 * Fetch a user's spendable balance for a given Peridot-supported asset.
 * Returns `balance: null` on any failure so callers can gracefully skip the check.
 */
export async function fetchUserBalance(
  input: BalanceFetchInput,
): Promise<BalanceFetchResult> {
  const chain = CHAIN_MAP[input.chainId]
  if (!chain) {
    return { balance: null, isNative: false, decimals: null }
  }

  const contracts = getAssetContractAddresses(input.assetId, input.chainId)
  if (!contracts) {
    return { balance: null, isNative: false, decimals: null }
  }

  const client = createPublicClient({ chain, transport: http() })

  try {
    if (contracts.isNative) {
      const bal = await client.getBalance({
        address: input.userAddress as `0x${string}`,
      })
      return {
        balance: bal,
        isNative: true,
        decimals: chain.nativeCurrency?.decimals ?? 18,
      }
    }

    const bal = (await client.readContract({
      address: contracts.underlyingAddress as `0x${string}`,
      abi: ERC20_BALANCE_ABI,
      functionName: 'balanceOf',
      args: [input.userAddress as `0x${string}`],
    })) as bigint

    // Try to pull decimals from the market entry, fall back to 18
    let decimals = 18
    try {
      const { getMarketsForChain } = await import('@/data/market-data')
      const markets = getMarketsForChain(input.chainId)
      const market = markets.find((m) => m.id === input.assetId)
      if (market?.decimals) decimals = market.decimals
    } catch {
      // market metadata missing → 18 is the common-case default
    }

    return { balance: bal, isNative: false, decimals }
  } catch {
    return { balance: null, isNative: false, decimals: null }
  }
}

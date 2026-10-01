// Server-side BSC USDC/USDT balance reader for Meld onramp reconciliation.
//
// Mirrors the viem setup in lib/agents/hub-wallet-reader.ts (same RPC env
// convention, same 18-decimal note for binance-peg stables). Used only by the
// reconcile endpoint to detect funding that landed after the user's tab closed.

import { createPublicClient, http, formatUnits } from "viem"
import { bsc } from "viem/chains"
import { BSC_UNDERLYING_TOKENS } from "@/biconomy/constants"
import type { MeldAsset } from "@/lib/onramp/meld"

// Same env override as hub-wallet-reader / use-multi-chain-token-balances.
const BSC_RPC =
  process.env.NEXT_PUBLIC_RPC_BSC_MAINNET || "https://bsc-dataseed.binance.org"

// Binance-peg USDC/USDT are 18 decimals (unlike 6 on most other chains).
const BSC_TOKENS: Record<MeldAsset, { address: `0x${string}`; decimals: number }> = {
  usdc: { address: BSC_UNDERLYING_TOKENS.USDC, decimals: 18 },
  usdt: { address: BSC_UNDERLYING_TOKENS.USDT, decimals: 18 },
}

/** The exact ERC-20 contract we read balanceOf on (for QA / mismatch checks). */
export function bscTokenAddressFor(asset: MeldAsset): `0x${string}` | undefined {
  return BSC_TOKENS[asset]?.address
}

const BALANCE_OF_ABI = [
  {
    type: "function" as const,
    name: "balanceOf",
    stateMutability: "view" as const,
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const

// Typed loosely on purpose: the fully-parameterised PublicClient type makes
// `readContract` inference blow up (TS2589). We only call balanceOf.
let cachedClient: any = null
function client() {
  if (!cachedClient) {
    cachedClient = createPublicClient({ chain: bsc, transport: http(BSC_RPC) })
  }
  return cachedClient
}

/**
 * Read an address's BSC USDC or USDT balance as a decimal number.
 * Currently only `eip155:56` is supported (the only confirmed Meld route).
 * Returns null on RPC failure so the caller can retry on the next sweep.
 */
export async function readBscStableBalance(
  chain: string,
  asset: MeldAsset,
  address: string,
): Promise<number | null> {
  if (chain !== "eip155:56") return null
  const token = BSC_TOKENS[asset]
  if (!token) return null
  try {
    const raw = (await client().readContract({
      address: token.address,
      abi: BALANCE_OF_ABI,
      functionName: "balanceOf",
      args: [address as `0x${string}`],
    })) as bigint
    return Number(formatUnits(raw, token.decimals))
  } catch (err) {
    console.error("[onramp/evm-balance] balanceOf failed", { chain, asset, err })
    return null
  }
}

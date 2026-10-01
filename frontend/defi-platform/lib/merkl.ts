// MERKL reward distribution helpers (Angle Protocol)
// Docs: https://docs.merkl.xyz
// Distributor ABI: claim(address[] users, address[] tokens, uint256[] amounts, bytes32[][] proofs)

export const MERKL_API_BASE = 'https://api.merkl.xyz'

// BSC-only for now; extend when Monad is supported
export const MERKL_DISTRIBUTOR: Record<number, `0x${string}`> = {
  56: '0x3Ef3D8bA38EBe18DB133cEc108f4D14CE00Dd9Ae', // BSC Mainnet
}

export const MERKL_DISTRIBUTOR_ABI = [
  {
    name: 'claim',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'users',  type: 'address[]' },
      { name: 'tokens', type: 'address[]' },
      { name: 'amounts', type: 'uint256[]' },
      { name: 'proofs', type: 'bytes32[][]' },
    ],
    outputs: [],
  },
  {
    name: 'claimed',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'user',  type: 'address' },
      { name: 'token', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

// ─── API response types ───────────────────────────────────────────────────────

export interface MerklTokenReward {
  symbol: string
  decimals: number
  /** Total accumulated (including already-claimed) */
  accumulated: string
  /** Still claimable (not yet claimed on-chain) */
  unclaimed: string
  /** Merkle proof for this token */
  proof: string[]
  /** Token address */
  tokenAddress?: string
}

// v4 response shape: { [chainId: string]: { [tokenAddress: string]: MerklTokenReward } }
export type MerklApiResponse = Record<string, Record<string, MerklTokenReward>>

export interface ParsedMerklReward {
  tokenAddress: string
  symbol: string
  decimals: number
  unclaimed: bigint
  unclaimedDisplay: string
  proof: `0x${string}`[]
}

export interface MerklClaimPayload {
  users: `0x${string}`[]
  tokens: `0x${string}`[]
  amounts: bigint[]
  proofs: `0x${string}`[][]
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────

export async function fetchMerklRewards(
  address: string,
  chainId: number
): Promise<ParsedMerklReward[]> {
  const url = `${MERKL_API_BASE}/v4/users/${address}/rewards?chainId=${chainId}`
  const res = await fetch(url, {
    next: { revalidate: 60 }, // cache 60s on the server
  })

  if (!res.ok) {
    if (res.status === 404) return [] // no rewards yet — normal
    throw new Error(`MERKL API error ${res.status}`)
  }

  const data: MerklApiResponse = await res.json()
  const chainData = data[String(chainId)]
  if (!chainData) return []

  const results: ParsedMerklReward[] = []

  for (const [tokenAddr, reward] of Object.entries(chainData)) {
    const unclaimed = BigInt(reward.unclaimed ?? '0')
    if (unclaimed === BigInt(0)) continue

    // BigInt(10) ** BigInt(decimals) via loop (ES6 compat — no ** on bigint or n suffix)
    let divisor = BigInt(1)
    for (let i = 0; i < reward.decimals; i++) divisor *= BigInt(10)
    const whole = unclaimed / divisor
    const frac = unclaimed % divisor
    const fracStr = frac.toString().padStart(reward.decimals, '0').slice(0, 4)
    const unclaimedDisplay = `${whole}.${fracStr}`

    results.push({
      tokenAddress: tokenAddr,
      symbol: reward.symbol,
      decimals: reward.decimals,
      unclaimed,
      unclaimedDisplay,
      proof: (reward.proof ?? []) as `0x${string}`[],
    })
  }

  return results
}

/** Build the calldata arrays for the MERKL Distributor claim() function */
export function buildClaimPayload(
  userAddress: `0x${string}`,
  rewards: ParsedMerklReward[]
): MerklClaimPayload {
  return {
    users:  rewards.map(() => userAddress),
    tokens: rewards.map(r => r.tokenAddress as `0x${string}`),
    amounts: rewards.map(r => r.unclaimed),
    proofs: rewards.map(r => r.proof),
  }
}

/** Sum total claimable USDC (6 decimals) across all rewards, returns human-readable */
export function sumUsdcDisplay(rewards: ParsedMerklReward[]): string {
  const usdc = rewards.find(r => r.symbol.toUpperCase() === 'USDC')
  if (!usdc) return '0.00'
  const million = BigInt(1_000_000)
  const whole = usdc.unclaimed / million
  const frac = (usdc.unclaimed % million).toString().padStart(6, '0').slice(0, 2)
  return `${whole}.${frac}`
}

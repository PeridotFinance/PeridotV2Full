/**
 * Network-preset chain filtering for the agent.
 *
 * The pool registry stores both mainnet and testnet pools side-by-side
 * (filtered only by `is_active`). On a mainnet deployment we must never
 * propose a testnet pool to a real user — they'd allocate real capital
 * to an empty market. This helper centralises the chain-allow-list so
 * tool executors (strategy builder, comparison) all agree on what
 * "active for this deployment" means.
 *
 * The hub list mirrors `config/contracts.ts`; we duplicate the small set
 * here to avoid pulling that 1200-line file (and its viem chain configs)
 * into the agent server runtime.
 */

const MAINNET_HUB_CHAINS = new Set<number>([
  56, // BSC mainnet
  143, // Monad mainnet (when live)
  56457, // Stellar mainnet (Soroban) — first-class hub, signed via Freighter
])

const STELLAR_CHAIN_ID = 56457

const MAINNET_SPOKE_CHAINS = new Set<number>([
  1, // Ethereum
  10, // Optimism
  137, // Polygon
  8453, // Base
  42161, // Arbitrum
  43114, // Avalanche
])

const TESTNET_CHAINS = new Set<number>([
  97, // BSC testnet
  10143, // Monad testnet
  50312, // Somnia testnet
])

const MAINNET_ALL = new Set<number>([
  ...MAINNET_HUB_CHAINS,
  ...MAINNET_SPOKE_CHAINS,
])

export function isTestnetChain(chainId: number): boolean {
  return TESTNET_CHAINS.has(chainId)
}

export function isStellarChain(chainId: number): boolean {
  return chainId === STELLAR_CHAIN_ID
}

export function isMainnetPreset(): boolean {
  const preset = (process.env.NEXT_PUBLIC_NETWORK_PRESET || 'testnet').toLowerCase()
  return preset.startsWith('mainnet')
}

/**
 * Returns the chain IDs the agent is allowed to propose for the current
 * deployment. On mainnet: mainnet hubs + spokes only. On testnet: testnet
 * chains only. Falls back to "no filter" if the preset is unrecognised,
 * so misconfigured environments degrade to today's behaviour instead of
 * silently returning an empty pool set.
 */
export function resolveNetworkPresetChainIds(): number[] | null {
  const preset = (process.env.NEXT_PUBLIC_NETWORK_PRESET || 'testnet').toLowerCase()
  if (preset.startsWith('mainnet')) return Array.from(MAINNET_ALL)
  if (preset === 'testnet') return Array.from(TESTNET_CHAINS)
  return null
}

import { createConfig } from '@privy-io/wagmi'
import { http } from 'wagmi'
import { fallback } from 'viem'
import { networks } from './index'

// Somnia Testnet — always included regardless of network preset because the
// margin trading module requires it for on-chain reads and tx receipt polling.
const SOMNIA_CHAIN_ID = 50312
const SOMNIA_RPC = 'https://dream-rpc.somnia.network/'
const SOMNIA_RPC_FALLBACK = 'https://dream-rpc.somnia.network/'

const somniaChainDef = {
  id: SOMNIA_CHAIN_ID,
  name: 'Somnia Testnet',
  nativeCurrency: { name: 'STT', symbol: 'STT', decimals: 18 },
  rpcUrls: {
    default: { http: [SOMNIA_RPC] },
    public:  { http: [SOMNIA_RPC] },
  },
  blockExplorers: {
    default: { name: 'Somnia Explorer', url: 'https://shannon-explorer.somnia.network/' },
  },
  testnet: true,
} as const

// Build the full chain list: start from the preset, then append Somnia if absent.
const hasSomnia = (networks as any[]).some((n) => n.id === SOMNIA_CHAIN_ID)
const allChains = hasSomnia ? (networks as any[]) : [...(networks as any[]), somniaChainDef]

// Build wagmi transports from the same networks list used by AppKit
function buildTransports() {
  const transports: Record<number, ReturnType<typeof http>> = {}
  for (const chain of allChains) {
    try {
      const urls: string[] | undefined = (chain?.rpcUrls?.default?.http as any)
      const url = Array.isArray(urls) && urls.length > 0 ? urls[0] : undefined
      if (typeof chain?.id === 'number' && url) {
        transports[chain.id] = http(url)
      }
    } catch {}
  }
  // Somnia gets a fallback transport; rank: false disables latency-based
  // ranking since both URLs are the same until a real secondary is available.
  transports[SOMNIA_CHAIN_ID] = fallback([http(SOMNIA_RPC), http(SOMNIA_RPC_FALLBACK)], { rank: false }) as any
  return transports
}

// Create wagmi config using @privy-io/wagmi's createConfig
// This ensures proper Privy integration and connector state management
export const wagmiConfig = createConfig({
  chains: allChains as any,
  transports: buildTransports() as any,
  // No need for connectors when using Privy - it handles this automatically
  ssr: true,
})

// Export the config for use in providers
export default wagmiConfig

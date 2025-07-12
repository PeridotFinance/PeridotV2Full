import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'

import {
  mainnet,
  arbitrum,
  monadTestnet,
  bscTestnet,
} from "@reown/appkit/networks"

// Custom XDC Testnet network configuration
const xdcTestnet = {
  id: 51,
  name: 'XDC Testnet',
  nativeCurrency: { name: 'XDC', symbol: 'XDC', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.apothem.network'] },
    public: { http: ['https://rpc.apothem.network'] },
  },
  blockExplorers: {
    default: { name: 'BlocksScan', url: 'https://apothem.blocksscan.io' },
  },
  testnet: true,
} as const

// Get projectId from https://cloud.reown.com
export const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID

if (!projectId) {
  throw new Error('Project ID is not defined in .env.local')
}

// Reorder networks to prioritize Monad Testnet first, which helps with network detection
export const networks = [
  // Monad testnet first (primary network for this platform)
  monadTestnet,
  // Other EVM networks
  mainnet, 
  arbitrum, 
  bscTestnet,
  xdcTestnet,
]

// Set up the Wagmi Adapter (Config)
export const wagmiAdapter = new WagmiAdapter({
  ssr: true, // Enable SSR support
  projectId,
  networks
})

// Export the underlying wagmi config for the WagmiProvider
export const wagmiConfig = wagmiAdapter.wagmiConfig 
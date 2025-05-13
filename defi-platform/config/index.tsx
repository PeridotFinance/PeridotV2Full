import { cookieStorage, createStorage } from '@wagmi/core'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'

import {
  mainnet,
  arbitrum,
  solana,
  solanaTestnet,
  solanaDevnet,
} from "@reown/appkit/networks"

// Get projectId from https://cloud.reown.com
export const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID

if (!projectId) {
  throw new Error('Project ID is not defined in .env.local')
}

export const networks = [mainnet, arbitrum, solana, solanaTestnet, solanaDevnet]

// Set up the Wagmi Adapter (Config)
export const wagmiAdapter = new WagmiAdapter({
  // Using cookieStorage for SSR compatibility
  storage: createStorage({
    storage: cookieStorage
  }),
  ssr: true, // Enable SSR support
  projectId,
  networks
})

// Export the underlying wagmi config for the WagmiProvider
export const wagmiConfig = wagmiAdapter.wagmiConfig 
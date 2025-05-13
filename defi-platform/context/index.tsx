'use client'

import { wagmiAdapter, wagmiConfig, projectId } from '@/config'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createAppKit } from '@reown/appkit/react'
import { SolanaAdapter } from '@reown/appkit-adapter-solana'
import {
  mainnet,
  arbitrum,
  solana,
  solanaTestnet,
  solanaDevnet,
} from "@reown/appkit/networks"
import React, { type ReactNode } from 'react'
import { cookieToInitialState, WagmiProvider, type Config } from 'wagmi'

// Set up queryClient
const queryClient = new QueryClient()

if (!projectId) {
  // This check is redundant due to the check in config/index.tsx,
  // but ensures projectId is treated as defined in this scope.
  throw new Error('Project ID is not defined')
}

// Set up metadata
const metadata = {
  name: 'Peridot Finance',
  description: 'Peridot Finance is a DeFi lending and borrowing platform',
  url: typeof window !== 'undefined' ? window.location.origin : 'https://perdidot.finance', // Use actual origin on client
  icons: typeof window !== 'undefined' ? [`${window.location.origin}/logo.png`] : []
}

// Create Solana adapter instance
const solanaWeb3JsAdapter = new SolanaAdapter()

// Create the AppKit modal instance
createAppKit({
  adapters: [wagmiAdapter, solanaWeb3JsAdapter],
  projectId,
  networks: [mainnet, arbitrum, solana, solanaTestnet, solanaDevnet] as any,
  metadata: metadata,
  features: {
    analytics: true // Optional - defaults to your Cloud configuration
  },
  themeVariables: {
    '--w3m-accent': '#5E7945', // Bright green
    '--w3m-color-mix': '#5E7945',
    '--w3m-color-mix-strength': 50,
  }
})

// Context Provider Component
function ContextProvider({ children, cookies }: { children: ReactNode; cookies: string | null }) {
  // Get initial state from cookies for SSR hydration
  const initialState = cookieToInitialState(wagmiConfig as Config, cookies)

  return (
    <WagmiProvider config={wagmiConfig as Config} initialState={initialState}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  )
}

export default ContextProvider 
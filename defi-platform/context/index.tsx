'use client'

import React, { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider, cookieToInitialState, type Config } from 'wagmi'
import { createAppKit } from '@reown/appkit/react'
import { config, evmNetworks, solanaNetworks, projectId, wagmiAdapter, solanaAdapter } from '../config'
import { mainnet } from '@reown/appkit/networks'

const queryClient = new QueryClient()

const metadata = {
  name: 'Peridot Finance',
  description: 'Peridot Finance is a DeFi lending and borrowing platform that supports both EVM and Solana networks',
  url: typeof window !== 'undefined' ? window.location.origin : 'https://peridot.finance',
  icons: typeof window !== 'undefined' ? [`${window.location.origin}/logo.svg`] : ['/logo.svg'],
}

if (!projectId) {
  console.error("AppKit Initialization Error in Context: Project ID is missing.");
} else {
  createAppKit({
    adapters: [wagmiAdapter, solanaAdapter],
    projectId: projectId!,
    networks: [...evmNetworks, ...solanaNetworks],
    defaultNetwork: mainnet,
    metadata,
    features: { analytics: true },
    themeVariables: {
      '--w3m-accent': '#5E7945',
      '--w3m-color-mix': '#5E7945',
      '--w3m-color-mix-strength': 50,
    }
  })
}

export default function ContextProvider({
  children,
  cookies,
}: {
  children: ReactNode
  cookies: string | null
}) {
  const initialState = cookieToInitialState(config as Config, cookies)

  return (
    <WagmiProvider config={config as Config} initialState={initialState}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  )
} 
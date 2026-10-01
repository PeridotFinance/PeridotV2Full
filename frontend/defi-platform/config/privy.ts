// Import createConfig from @privy-io/wagmi, not wagmi directly
import { createConfig } from '@privy-io/wagmi'
import { http } from 'wagmi'
import { networks } from '@/config'

// Build wagmi transports from the same networks list used by AppKit
function buildTransports() {
  const transports: Record<number, ReturnType<typeof http>> = {}
  for (const chain of networks as any[]) {
    try {
      const urls: string[] | undefined = (chain?.rpcUrls?.default?.http as any)
      const url = Array.isArray(urls) && urls.length > 0 ? urls[0] : undefined
      if (typeof chain?.id === 'number' && url) {
        transports[chain.id] = http(url)
      }
    } catch {}
  }
  return transports
}

export async function getPrivyWagmiConfig() {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID
  if (!appId) {
    throw new Error('NEXT_PUBLIC_PRIVY_APP_ID is not defined')
  }

  // Custom storage that prevents reconnect to Phantom-only environments
  const storage = {
    getItem: (key: string) => {
      try {
        if (typeof window === 'undefined') return null
        if (key === 'wagmi.recentConnectorId') {
          const w = window as any
          const phantomEthereum = w?.phantom?.ethereum
          const injected = w?.ethereum
          const providers: any[] | undefined = injected?.providers
          const hasOnlyPhantom = (() => {
            try {
              if (!phantomEthereum) return false
              if (!injected) return true
              if (Array.isArray(providers) && providers.length > 0) {
                return providers.every((p) => p === phantomEthereum || p?.isPhantom)
              }
              return injected === phantomEthereum && !injected.isMetaMask && !injected.isBraveWallet && !injected.isCoinbaseWallet
            } catch { return false }
          })()
          if (hasOnlyPhantom) return null
        }
        return window.localStorage.getItem(key)
      } catch { return null }
    },
    setItem: (key: string, value: string) => {
      try {
        if (typeof window === 'undefined') return
        if (key === 'wagmi.recentConnectorId' && /injected/i.test(value)) {
          const w = window as any
          const phantomEthereum = w?.phantom?.ethereum
          const injected = w?.ethereum
          const providers: any[] | undefined = injected?.providers
          const hasOnlyPhantom = (() => {
            try {
              if (!phantomEthereum) return false
              if (!injected) return true
              if (Array.isArray(providers) && providers.length > 0) {
                return providers.every((p) => p === phantomEthereum || p?.isPhantom)
              }
              return injected === phantomEthereum && !injected.isMetaMask && !injected.isBraveWallet && !injected.isCoinbaseWallet
            } catch { return false }
          })()
          if (hasOnlyPhantom) return
        }
        window.localStorage.setItem(key, value)
      } catch {}
    },
    removeItem: (key: string) => {
      try {
        if (typeof window === 'undefined') return
        window.localStorage.removeItem(key)
      } catch {}
    }
  }

  const config = createConfig({
    chains: networks as any,
    transports: buildTransports() as any,
    // No need for connectors when using Privy - it handles this automatically
    storage: storage as any,
    ssr: true,
  })

  return { config, appId }
}



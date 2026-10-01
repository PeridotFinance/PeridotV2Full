'use client'

import { wagmiAdapter, projectId, networks } from '@/config'
import { CHAIN_IDS, STELLAR_NETWORK_ID } from '@/config/contracts'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/react-query'
import { createAppKit } from '@reown/appkit/react'
import React, { type ReactNode, createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react'
import { cookieToInitialState, type Config, useAccount } from 'wagmi'
// Import WagmiProvider from @privy-io/wagmi for proper Privy integration
import { WagmiProvider } from '@privy-io/wagmi'
import { reconnect } from '@wagmi/core'
import { useReferral } from '@/hooks/use-referral'
import { useStellarWallet } from '@/hooks/use-stellar-wallet'
import { toast } from 'sonner'
import { FEATURE_FLAGS } from '@/config/featureFlags'
import { isStellarOnlyHost, useStellarOnly } from '@/config/stellarOnly'
import { PrivyProvider } from '@privy-io/react-auth'
import { SmartWalletsProvider } from '@privy-io/react-auth/smart-wallets'
import { toSolanaWalletConnectors } from '@privy-io/react-auth/solana'
import { wagmiConfig } from '@/config/wagmiConfig'
import { ALL_LOGIN_METHODS } from '@/config/privyLogin'
import { StellarSignerBridge } from '@/components/wallet/StellarSignerBridge'
import { EmbeddedWalletLinkSync } from '@/components/wallet/EmbeddedWalletLinkSync'

// Network context for tracking UI network selection when no wallet is connected
interface NetworkContextType {
  selectedNetworkId: string
  setSelectedNetworkId: (networkId: string) => void
  getChainIdFromNetworkId: (networkId: string) => number | undefined
  // Wallet management
  activeWalletAddress: string | null
  setActiveWalletAddress: (address: string | null) => void
  isWalletManagementOpen: boolean
  setWalletManagementOpen: (open: boolean) => void
  // Smart wallet preferences
  smartWalletEnabled: boolean
  setSmartWalletEnabled: (enabled: boolean) => void
}

export const NetworkContext = createContext<NetworkContextType | undefined>(undefined)

const useNetworkContext = () => {
  const context = useContext(NetworkContext)
  if (!context) {
    throw new Error('useNetworkContext must be used within NetworkProvider')
  }
  return context
}

// Helper component to contain the referral logic for cleanliness
const ReferralTracker = () => {
  const { address, isConnected } = useAccount()
  const { trackReferral } = useReferral({ autoFetch: false })
  const [isTracking, setIsTracking] = useState(false)

  useEffect(() => {
    const track = async () => {
      // Proceed only if connected, have an address, and not already tracking
      if (isConnected && address && !isTracking) {
        const refCode = sessionStorage.getItem('referralCode')
        const isTracked = sessionStorage.getItem('referralTracked')

        if (refCode && !isTracked) {
          setIsTracking(true) // Set lock
          try {
            await trackReferral(refCode, address)
          } finally {
            // After the attempt, set the session flag to prevent future calls
            sessionStorage.setItem('referralTracked', 'true')
            setIsTracking(false) // Release lock
          }
        }
      }
    }

    track()
  }, [isConnected, address, trackReferral, isTracking])

  return null // This component does not render anything to the DOM
}

// The Stellar half of the same job.
//
// The Ambassador Program pays out on Stellar, so a Freighter-only visitor
// arriving on an invite link is exactly the user it is aimed at — and they have
// no EVM address at all, so `ReferralTracker` above never fires for them and
// their referral was silently dropped before it was ever written.
//
// Kept as a separate component rather than folding `useActiveWallet` into the
// one above because `usePrivy` (which the Stellar wallet hook calls) is only
// available inside the PrivyProvider branches of the tree.
//
// Both write the same `referralTracked` session flag, so whichever wallet the
// user connects first claims the referral and the other becomes a no-op.
const StellarReferralTracker = () => {
  const { address, isConnected } = useStellarWallet()
  const { trackReferral } = useReferral({ autoFetch: false })
  const [isTracking, setIsTracking] = useState(false)

  useEffect(() => {
    const track = async () => {
      if (!isConnected || !address || isTracking) return
      const refCode = sessionStorage.getItem('referralCode')
      if (!refCode || sessionStorage.getItem('referralTracked')) return

      setIsTracking(true)
      try {
        await trackReferral(refCode, address)
      } finally {
        sessionStorage.setItem('referralTracked', 'true')
        setIsTracking(false)
      }
    }
    track()
  }, [isConnected, address, trackReferral, isTracking])

  return null
}

/** Last network the user (or an in-app auto-switch) selected. */
const SELECTED_NETWORK_STORAGE_KEY = 'peridot.selectedNetworkId'

// Map chainId to our short network id used in UI
export function getNetworkIdFromChainId(chainId: number): string | undefined {
  switch (chainId) {
    case CHAIN_IDS.STELLAR_MAINNET: return STELLAR_NETWORK_ID
    case 10143: return 'monad'
    case 143: return 'monad'
    case 97:
    case 56: return 'bnb'
    case 42161: return 'arbitrum'
    case 421614: return 'arbitrum'
    case 8453: return 'base'
    case 84532: return 'base'
    case 11155111: return 'eth'
    case 1: return 'eth'
    case 137: return 'polygon'
    case 43114: return 'avalanche'
    case 50312: return 'somnia'
    case CHAIN_IDS.ROBINHOOD_MAINNET: return 'robinhood'
    default: return undefined
  }
}


// Set up metadata (dynamic base URL per deployment)
const appBaseUrl = typeof window !== 'undefined'
  ? window.location.origin
  : (process.env.NEXT_PUBLIC_APP_BASE_URL || 'https://peridot.finance')

const metadata = {
  name: 'Peridot Finance',
  description: 'Peridot Finance is a DeFi lending and borrowing platform',
  url: appBaseUrl,
  icons: [`${appBaseUrl}/Peridot-Icon-Only-Mint-Green.svg`]
}

const hasOnlyPhantomInjected = () => {
  if (typeof window === 'undefined') return false

  try {
    const w = window as any
    const phantomEthereum = w?.phantom?.ethereum
    if (!phantomEthereum) return false

    const injected = w?.ethereum
    if (!injected) return true

    const providers: any[] | undefined = injected.providers
    if (Array.isArray(providers) && providers.length > 0) {
      return providers.every((provider) => provider === phantomEthereum || provider?.isPhantom)
    }

    return injected === phantomEthereum && !injected.isMetaMask && !injected.isBraveWallet && !injected.isCoinbaseWallet
  } catch {
    return false
  }
}

// --- Support Chat Sync Helper ---
const SupportChatSync = () => {
  const { address } = useAccount()
  const network = useContext(NetworkContext)
  const chainId = network?.getChainIdFromNetworkId(network?.selectedNetworkId || '') || null

  useEffect(() => {
    // Dispatch a custom event that SupportChat can listen to
    if (typeof window !== 'undefined') {
      const event = new CustomEvent('peridot_support_wallet_sync', { 
        detail: { address: address || null, chainId: chainId || null } 
      })
      window.dispatchEvent(event)
    }
  }, [address, chainId])

  return null
}

// Manages reconnect & desync recovery for the AppKit (legacy) wallet path.
// When Privy is active, Privy + @privy-io/wagmi own wallet lifecycle — render nothing.
// Extracted to module scope so React keeps a stable component identity across renders.
function ConnectionRecovery({ wagmiCfg }: { wagmiCfg: Config }) {
  const { isConnected } = useAccount()
  const promptedRef = React.useRef(false)
  const wasConnectedRef = React.useRef(false)

  // All hooks must be called unconditionally (Rules of Hooks).
  // Under Privy the effects simply no-op via the guard inside each one.
  const isPrivy = FEATURE_FLAGS.WALLET_PRIVY_EXPERIMENT

  // Proactively attempt wagmi reconnect on mount
  useEffect(() => {
    if (isPrivy) return
    const getCookie = (name: string) => {
      try {
        const m = document.cookie.split('; ').find(r => r.startsWith(`${name}=`))
        return m ? decodeURIComponent(m.split('=')[1]) : null
      } catch { return null }
    }

    const clearRecentConnector = () => {
      try {
        document.cookie = `wagmi.recentConnectorId=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; SameSite=Lax`
        try { window.localStorage.removeItem('wagmi.recentConnectorId') } catch {}
      } catch {}
    }

    const tryReconnect = async () => {
      try {
        const skipOnce = getCookie('peridot.skipReconnect')
        if (skipOnce === '1') return

        const recent = getCookie('wagmi.recentConnectorId') || (() => {
          try { return window.localStorage.getItem('wagmi.recentConnectorId') } catch { return null }
        })()

        const phantomOnly = hasOnlyPhantomInjected()
        const isIncompatible = !!recent && (/phantom/i.test(recent) || (recent === 'injected' && phantomOnly))
        if (isIncompatible) {
          clearRecentConnector()
          if (!promptedRef.current) {
            promptedRef.current = true
            toast(
              'Switch wallet to a compatible EVM wallet',
              {
                description: 'Phantom is not supported on the selected networks. Choose MetaMask or another EVM wallet, or change network.',
                action: {
                  label: 'Open Wallet',
                  onClick: () => {
                    try {
                      const btn = document.querySelector('appkit-button') as HTMLElement | null
                      if (btn) btn.click()
                    } catch {}
                  }
                }
              }
            )
          }
          return
        }

        await reconnect(wagmiCfg as any)
      } catch {
        // no-op; connectors may be unavailable or session absent
      }
    }
    tryReconnect()
  }, [isPrivy, wagmiCfg])

  // Desync recovery: if still disconnected shortly after mount, retry then clear stale wagmi storage
  const isConnectedRef = React.useRef(isConnected)
  isConnectedRef.current = isConnected

  useEffect(() => {
    if (isPrivy) return
    if (typeof window === 'undefined') return
    if (isConnected) return

    let cleared = false
    const retry = setTimeout(async () => {
      try {
        await reconnect(wagmiCfg as any)
      } catch {}

      setTimeout(() => {
        if (cleared) return
        // Use ref to read current value, not the stale closure from effect creation
        if (isConnectedRef.current) return
        try {
          const cookies = document.cookie.split('; ')
          for (const c of cookies) {
            if (c.startsWith('wagmi.')) {
              const name = c.split('=')[0]
              document.cookie = `${name}=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; SameSite=Lax`
            }
          }
          try {
            for (let i = window.localStorage.length - 1; i >= 0; i--) {
              const k = window.localStorage.key(i)
              if (k && k.startsWith('wagmi.')) {
                window.localStorage.removeItem(k)
              }
            }
          } catch {}
        } catch {}
        cleared = true
      }, 600)
    }, 600)

    return () => {
      clearTimeout(retry)
    }
  }, [isPrivy, isConnected, wagmiCfg])

  // Wallet switch prompt for incompatible last connector
  useEffect(() => {
    if (isPrivy) return
    if (typeof window === 'undefined') return
    if (isConnected) return
    if (promptedRef.current) return

    const getCookie = (name: string) => {
      try {
        const m = document.cookie.split('; ').find(r => r.startsWith(`${name}=`))
        return m ? decodeURIComponent(m.split('=')[1]) : null
      } catch { return null }
    }

    const recent = getCookie('wagmi.recentConnectorId') || (() => {
      try { return window.localStorage.getItem('wagmi.recentConnectorId') } catch { return null }
    })()

    const phantomOnly = hasOnlyPhantomInjected()

    if (recent && (/phantom/i.test(recent) || (recent === 'injected' && phantomOnly))) {
      promptedRef.current = true
      toast(
        'Switch wallet to a compatible EVM wallet',
        {
          description: 'Phantom is not supported on the selected networks. Choose MetaMask or another EVM wallet, or change network.',
          action: {
            label: 'Open Wallet',
            onClick: () => {
              try {
                const btn = document.querySelector('appkit-button') as HTMLElement | null
                if (btn) btn.click()
              } catch {}
            }
          }
        }
      )
    }
  }, [isPrivy, isConnected])

  // When a user disconnects, set a short-lived skip flag
  useEffect(() => {
    if (isPrivy) return
    if (typeof window === 'undefined') return
    if (isConnected) {
      wasConnectedRef.current = true
      try { document.cookie = `peridot.skipReconnect=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; SameSite=Lax` } catch {}
      return
    }
    if (wasConnectedRef.current && !isConnected) {
      try { document.cookie = `peridot.skipReconnect=1; Max-Age=60; Path=/; SameSite=Lax` } catch {}
      wasConnectedRef.current = false
    }
  }, [isPrivy, isConnected])

  return null
}

// Context Provider Component
function ContextProvider({ children, cookies }: { children: ReactNode; cookies: string | null }) {
  // Suppress Privy origin mismatch warnings in development
  useEffect(() => {
    if (typeof window === 'undefined') return

    // Suppress console errors for Privy origin mismatches
    const originalError = console.error
    const originalWarn = console.warn
    
    const shouldSuppress = (args: any[]): boolean => {
      // Check all arguments for the error message
      const allArgs = args.map(arg => {
        if (typeof arg === 'string') return arg
        if (arg?.toString) return arg.toString()
        if (arg?.message) return arg.message
        if (arg?.stack) return arg.stack
        return ''
      }).join(' ')

      // Suppress Privy origin mismatch errors/warnings
      if (allArgs.includes('origins don\'t match') || allArgs.includes('origins don\'t match')) {
        if (allArgs.includes('auth.privy.io') || allArgs.includes('localhost') || allArgs.includes('privy') || allArgs.includes('chrome-extension://')) {
          return true
        }
      }

      // Also check for the specific error pattern
      if (allArgs.includes('auth.privy.io') && allArgs.includes('localhost')) {
        return true
      }

      // Suppress errors from browser extensions related to Privy
      if (allArgs.includes('chrome-extension://') &&
          (allArgs.includes('privy') || allArgs.includes('origins don\'t match'))) {
        return true
      }

      // Suppress RPC polling failures from registered-but-idle chains.
      // These are wagmi/viem background block-number polls, not actionable in prod.
      // Keep this list in step with the endpoints actually configured: a host that
      // is silenced here but no longer used just hides nothing, while a live one
      // that is missing spams the console on every poll.
      const RPC_HOSTS = [
        'drpc.org',
        'publicnode.com',
        'cloudflare-eth.com',
        'ankr.com',
        'binance.org',
        'avax.network',
        'mainnet.base.org',
        'alchemy.com',
        'somnia.network',
        'monad.xyz',
        'monad-testnet',
      ]
      if (RPC_HOSTS.some(host => allArgs.includes(host))) return true

      // Suppress React missing-key warning from third-party libraries (Privy /
      // Reown login modals render chain/provider lists without explicit keys).
      // This is library noise, not something we can fix in our code.
      if (allArgs.includes('Each child in a list should have a unique "key" prop')) {
        return true
      }

      // Suppress generic wagmi/viem RPC transport errors in production
      if (process.env.NODE_ENV === 'production') {
        if (
          allArgs.includes('HttpRequestError') ||
          allArgs.includes('HTTP request failed') ||
          allArgs.includes('eth_blockNumber') ||
          allArgs.includes('eth_chainId') ||
          allArgs.includes('Failed to fetch') ||
          allArgs.includes('Request failed') ||
          (allArgs.includes('WebSocket') && allArgs.includes('wss://'))
        ) return true
      }

      return false
    }

    console.error = (...args: any[]) => {
      if (!shouldSuppress(args)) {
        originalError.apply(console, args)
      }
    }

    console.warn = (...args: any[]) => {
      if (!shouldSuppress(args)) {
        originalWarn.apply(console, args)
      }
    }

    // Also suppress unhandled errors
    const handleError = (event: ErrorEvent) => {
      const message = event.message || ''
      const filename = event.filename || ''
      const errorString = message + ' ' + filename
      
      if ((errorString.includes('origins don\'t match') || errorString.includes('origins don\'t match')) && 
          (errorString.includes('auth.privy.io') || errorString.includes('localhost') || errorString.includes('privy'))) {
        event.preventDefault()
        return false
      }
    }

    // Also handle unhandled promise rejections
    const handleRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason?.toString() || ''
      if ((reason.includes('origins don\'t match') || reason.includes('origins don\'t match')) &&
          (reason.includes('auth.privy.io') || reason.includes('localhost') || reason.includes('privy'))) {
        event.preventDefault()
        return false
      }
      // Suppress RPC polling rejections from wagmi background block-number fetches
      if (shouldSuppress([reason])) {
        event.preventDefault()
        return false
      }
    }

    window.addEventListener('error', handleError)
    window.addEventListener('unhandledrejection', handleRejection)

    return () => {
      console.error = originalError
      console.warn = originalWarn
      window.removeEventListener('error', handleError)
      window.removeEventListener('unhandledrejection', handleRejection)
    }
  }, [])

  // Prefer EVM-compatible injected providers (MetaMask/Brave/Coinbase) when multiple exist.
  // Skip under Privy — Privy handles provider detection and multi-wallet selection itself;
  // overriding window.ethereum before Privy initializes can break its wallet discovery.
  useEffect(() => {
    if (FEATURE_FLAGS.WALLET_PRIVY_EXPERIMENT) return
    if (typeof window === 'undefined') return

    const w = window as any
    const { ethereum } = w

    if (ethereum?.providers?.length) {
      const preferred = ethereum.providers.find((provider: any) =>
        provider?.isMetaMask || provider?.isBraveWallet || provider?.isCoinbaseWallet
      )

      if (preferred && ethereum !== preferred) {
        w.ethereum = preferred
      }
    }
  }, [])

  // Initialize AppKit only when Privy experiment is OFF
  useEffect(() => {
    if (FEATURE_FLAGS.WALLET_PRIVY_EXPERIMENT) return
    createAppKit({
      adapters: [wagmiAdapter],
      projectId,
      networks: networks as any,
      metadata: metadata,
      features: {
        analytics: true, // Optional - defaults to your Cloud configuration

      },
      excludeWalletIds: [
        "a797aa35c0fadbfc1a53e7f675162ed5226968b44a19ee3d24385c64d1d3c393"
      ],
      themeVariables: {
        '--w3m-accent': '#33C47C',
        '--w3m-color-mix': '#33C47C',
        '--w3m-color-mix-strength': 40,
      }
    })
  }, [])

  // Use the proper wagmi config for Privy integration
  const activeWagmiConfig = FEATURE_FLAGS.WALLET_PRIVY_EXPERIMENT
    ? wagmiConfig
    : (wagmiAdapter.wagmiConfig as Config)

  // One-time cleanup of stale AppKit data when running under Privy
  useEffect(() => {
    if (!FEATURE_FLAGS.WALLET_PRIVY_EXPERIMENT) return

    // Only clean up AppKit leftovers once per browser session
    const cleaned = sessionStorage.getItem('peridot.appkitCleaned')
    if (cleaned) return
    sessionStorage.setItem('peridot.appkitCleaned', '1')

    try { window.localStorage.removeItem('appkit.recentWallet') } catch {}
  }, [])

  // Get initial state from cookies for SSR hydration
  const initialState = cookieToInitialState(activeWagmiConfig as any, cookies)
  
  // Determine default network from env/preset, fallback to first configured network
  const envDefaultChainId = typeof process !== 'undefined' && process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID ? Number(process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID) : undefined
  const preset = typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_NETWORK_PRESET : undefined
  const evmDefaultNetworkId = (() => {
    if (preset === 'mainnet-bsc-only') return 'bnb'
    if (envDefaultChainId && !Number.isNaN(envDefaultChainId)) {
      const found = getNetworkIdFromChainId(envDefaultChainId)
      if (found) return found
    }
    // fallback: derive from first enabled network
    const first = (networks as any[])[0]
    const derived = first ? getNetworkIdFromChainId(first.id) : undefined
    return derived || 'bnb'
  })()

  // The public host presents Stellar markets only (see `config/stellarOnly`),
  // but the preset default put every session on BSC — and `useActiveWallet`
  // only takes the Stellar branch on a Stellar network. A user who had ever
  // linked an EVM wallet was therefore treated as an EVM user on a host with
  // no EVM markets, so surfaces asked him for MetaMask and Freighter in turn.
  // The host decides the default here instead.
  //
  // `isStellarOnlyHost(null)` is the SSR-safe answer (it honours the env
  // override and otherwise hides EVM), so server and client agree on the
  // public host. The `v1.*` / localhost correction happens after mount, where
  // briefly showing Stellar first costs nothing.
  const stellarOnly = useStellarOnly()
  const initialNetworkId = isStellarOnlyHost(null) ? STELLAR_NETWORK_ID : evmDefaultNetworkId
  // Network selection state for UI fallback
  const [selectedNetworkId, setSelectedNetworkIdState] = useState<string>(initialNetworkId)
  // Set once the selection came from the user (or an in-app auto-switch), so
  // the restore effect below never overwrites a live choice.
  const networkTouchedRef = React.useRef(false)

  const isKnownNetworkId = useCallback((id: string): boolean => {
    if (id === STELLAR_NETWORK_ID) return true
    return (networks as any[]).some((n) => getNetworkIdFromChainId(n.id) === id)
  }, [])

  // Persisting the selection is what keeps a reload from silently changing the
  // wallet identity: without it every page load restarted at the preset
  // default, which on `v1.*` means BSC even for a Stellar-only user.
  const setSelectedNetworkId = useCallback((networkId: string) => {
    networkTouchedRef.current = true
    setSelectedNetworkIdState(networkId)
    try { window.localStorage.setItem(SELECTED_NETWORK_STORAGE_KEY, networkId) } catch {}
  }, [])

  useEffect(() => {
    if (networkTouchedRef.current) return
    let stored: string | null = null
    try {
      const raw = window.localStorage.getItem(SELECTED_NETWORK_STORAGE_KEY)
      if (raw && isKnownNetworkId(raw)) stored = raw
    } catch {}
    // A Stellar-only host must never restore an EVM selection — that is exactly
    // the state this fix exists to prevent.
    const next = stellarOnly ? STELLAR_NETWORK_ID : (stored || evmDefaultNetworkId)
    setSelectedNetworkIdState((current) => (current === next ? current : next))
  }, [stellarOnly, evmDefaultNetworkId, isKnownNetworkId])
  
  // Wallet management state
  const [activeWalletAddress, setActiveWalletAddress] = useState<string | null>(null)
  const [isWalletManagementOpen, setWalletManagementOpen] = useState<boolean>(false)
  const [smartWalletEnabled, setSmartWalletEnabled] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('smart-wallet-enabled') !== 'false'
    }
    return true // Default to enabled for existing users
  })

  const handleSetSmartWalletEnabled = (enabled: boolean) => {
    setSmartWalletEnabled(enabled)
    if (typeof window !== 'undefined') {
      localStorage.setItem('smart-wallet-enabled', enabled.toString())
    }
  }

  // Conditionally enable smart wallets based on user preference
  const shouldEnableSmartWallets = FEATURE_FLAGS.WALLET_PRIVY_EXPERIMENT && smartWalletEnabled

  // Stable reference for Solana wallet-standard connectors (Phantom, Solflare, Backpack, ...).
  // Privy calls onMount/onUnmount on this object, so it must not be re-created every render.
  const solanaConnectors = useMemo(() => toSolanaWalletConnectors(), [])
  
  // Memoize getChainIdFromNetworkId to prevent cascading re-renders
  const getChainIdFromNetworkId = useCallback((networkId: string): number | undefined => {
    // Stellar Soroban (non-EVM) uses a sentinel chain_id for DB lookups
    if (networkId === STELLAR_NETWORK_ID) return CHAIN_IDS.STELLAR_MAINNET
    // Resolve using enabled networks to avoid hardcoding
    for (const chain of networks as any[]) {
      const id = getNetworkIdFromChainId(chain.id)
      if (id === networkId) return chain.id
    }
    return undefined
  }, []) // networks is imported constant, so empty deps is safe

  // Find the active chain object for Privy initialization
  const currentDefaultChain = useMemo(() => {
    const cid = getChainIdFromNetworkId(selectedNetworkId)
    return (networks as any[]).find(n => n.id === cid) || networks[0]
  }, [selectedNetworkId, networks])

  const networkContextValue: NetworkContextType = {
    selectedNetworkId,
    setSelectedNetworkId,
    getChainIdFromNetworkId,
    // Wallet management
    activeWalletAddress,
    setActiveWalletAddress,
    isWalletManagementOpen,
    setWalletManagementOpen,
    // Smart wallet preferences
    smartWalletEnabled,
    setSmartWalletEnabled: handleSetSmartWalletEnabled,
  }

  return (
    <NetworkContext.Provider value={networkContextValue}>
      {FEATURE_FLAGS.WALLET_PRIVY_EXPERIMENT ? (
        <PrivyProvider
          appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID || ''}
          config={{
            appearance: {
              LandingHeader: 'Peridot Finance',
              // Overrides whatever logo the Privy dashboard has set (we were
              // seeing a broken image — the dashboard URL is dead). Privy
              // requires an absolute URL; we derive it the same way wallet-
              // connect metadata above does so dev (localhost) and prod both
              // resolve to a real asset. We use the wordmark variant (viewBox
              // 1368×360) rather than the icon-only square — Privy's modal
              // squashes square SVGs without explicit width/height to 0×0.
              logo: `${appBaseUrl}/Peridot-Logo-Green-White-Typeface.svg`,
              // A bare login() (no chooser in front of it) leads with email and
              // socials; wallets stay one tap away under "Continue with a wallet".
              showWalletLoginFirst: false,
              walletChainType: 'ethereum-and-solana',
              // Unified list across EVM + Solana — Privy hides any wallet not listed
              // here (even if `externalWallets.solana.connectors` is wired up).
              // Phantom's EVM-injected path stays neutralized by the storage filter
              // in `config/privy.ts`; here it surfaces only as a Solana option.
              walletList: [
                'metamask',
                'coinbase_wallet',
                'rainbow',
                'rabby_wallet',
                'zerion',
                'wallet_connect',
                'bitget_wallet',
                'detected_ethereum_wallets',
                'phantom',
                'solflare',
                'backpack',
                'detected_solana_wallets',
              ] as any,
            },
            // The union of both chooser branches (config/privyLogin.ts). Each
            // entry point narrows it per call with login({ loginMethods }), so
            // the email path never lists wallets and the wallet path opens
            // straight on the wallet list.
            loginMethods: ALL_LOGIN_METHODS,
            externalWallets: {
              solana: { connectors: solanaConnectors },
            },
            embeddedWallets: {
              ethereum: { createOnLogin: 'users-without-wallets' },
              solana: { createOnLogin: 'users-without-wallets' },
            },
            // Configure supported chains for embedded wallets and smart accounts
            defaultChain: currentDefaultChain as any,
            supportedChains: networks as any,
          } as any}
        >
          {shouldEnableSmartWallets ? (
            <SmartWalletsProvider>
              {/* No paymasterContext override — Privy's built-in defaults are used.
                  The old Biconomy V2 sponsorshipInfo context is incompatible with
                  Biconomy Nexus paymaster endpoints (/v2/). Privy 3.x + permissionless
                  0.2.x use Nexus accounts; overriding with V2 context causes AA21. */}
              <QueryClientProvider client={queryClient}>
                <WagmiProvider config={activeWagmiConfig as Config} initialState={initialState}>
                  <SupportChatSync />
                  <ConnectionRecovery wagmiCfg={activeWagmiConfig as Config} />
                  <ReferralTracker />
                  <StellarReferralTracker />
                  <StellarSignerBridge />
                  <EmbeddedWalletLinkSync />
                  {children}
                </WagmiProvider>
              </QueryClientProvider>
            </SmartWalletsProvider>
          ) : (
            <QueryClientProvider client={queryClient}>
              <WagmiProvider config={activeWagmiConfig as Config} initialState={initialState}>
                <SupportChatSync />
                <ConnectionRecovery wagmiCfg={activeWagmiConfig as Config} />
                <ReferralTracker />
                <StellarReferralTracker />
                <StellarSignerBridge />
                <EmbeddedWalletLinkSync />
                {children}
              </WagmiProvider>
            </QueryClientProvider>
          )}
        </PrivyProvider>
      ) : (
        <QueryClientProvider client={queryClient}>
          <WagmiProvider config={activeWagmiConfig as Config} initialState={initialState}>
            <SupportChatSync />
            <ConnectionRecovery wagmiCfg={activeWagmiConfig as Config} />
            <ReferralTracker />
            {children}
          </WagmiProvider>
        </QueryClientProvider>
      )}
    </NetworkContext.Provider>
  )
}

export { ContextProvider, useNetworkContext } 

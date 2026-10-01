import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { cookieStorage, createStorage } from '@wagmi/core'

import {
  monadTestnet as monadTestnetDefault,
  bscTestnet,
  bsc,
  mainnet,
  arbitrum,
  arbitrumSepolia,
  base,
  baseSepolia,
  sepolia,
  polygon,
  avalanche,
} from "@reown/appkit/networks"
import { FEATURE_FLAGS } from "./featureFlags"
import { robinhoodMainnet } from "./robinhood"

const monadTestnet = {
  ...monadTestnetDefault,
  rpcUrls: {
    default: {
      http: [
        "https://monad-testnet.drpc.org/",
        "https://testnet-rpc.monad.xyz/",
        "https://rpc.ankr.com/monad_testnet/",
        
      ],
    },
    public: {
      http: [
        "https://monad-testnet.drpc.org/",
        "https://testnet-rpc.monad.xyz/",
        "https://rpc.ankr.com/monad_testnet/",
        
      ],
    },
  },
};

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

// Custom Somnia Testnet network configuration
const somniaTestnet = {
  id: 50312,
  name: 'Somnia Testnet',
  nativeCurrency: { name: 'STT', symbol: 'STT', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://dream-rpc.somnia.network/'] },
    public: { http: ['https://dream-rpc.somnia.network/'] },
  },
  blockExplorers: {
    default: { name: 'Somnia Explorer', url: 'https://shannon-explorer.somnia.network//' },
  },
  testnet: true,
} as const

// Public endpoints often rate limit writes. Allow overriding with env-provided RPCs.
const arbitrumSepoliaCustom = {
  ...arbitrumSepolia,
  rpcUrls: {
    default: {
      http: [
        process.env.NEXT_PUBLIC_RPC_ARBITRUM_SEPOLIA || "https://sepolia-rollup.arbitrum.io/rpc",
      ],
    },
    public: {
      http: [
        process.env.NEXT_PUBLIC_RPC_ARBITRUM_SEPOLIA || "https://sepolia-rollup.arbitrum.io/rpc",
      ],
    },
  },
}

const baseSepoliaCustom = {
  ...baseSepolia,
  rpcUrls: {
    default: {
      http: [
        process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA || "https://sepolia.base.org",
      ],
    },
    public: {
      http: [
        process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA || "https://sepolia.base.org",
      ],
    },
  },
}

const sepoliaCustom = {
  ...sepolia,
  rpcUrls: {
    default: {
      http: [
        process.env.NEXT_PUBLIC_RPC_ETHEREUM_SEPOLIA || "https://sepolia.drpc.org",
      ],
    },
    public: {
      http: [
        process.env.NEXT_PUBLIC_RPC_ETHEREUM_SEPOLIA || "https://sepolia.drpc.org",
      ],
    },
  },
}

const bscTestnetCustom = {
  ...bscTestnet,
  rpcUrls: {
    default: {
      http: [
        process.env.NEXT_PUBLIC_RPC_BSC_TESTNET || "https://data-seed-prebsc-1-s1.binance.org:8545/",
      ],
    },
    public: {
      http: [
        process.env.NEXT_PUBLIC_RPC_BSC_TESTNET || "https://data-seed-prebsc-1-s1.binance.org:8545/",
      ],
    },
  },
}

const bscMainnetCustom = {
  ...bsc,
  rpcUrls: {
    default: {
      http: [
        process.env.NEXT_PUBLIC_RPC_BSC_MAINNET || "https://bsc-dataseed.binance.org",
        "https://bsc-dataseed1.binance.org",
        "https://bsc-rpc.publicnode.com",
      ],
    },
    public: {
      http: [
        process.env.NEXT_PUBLIC_RPC_BSC_MAINNET || "https://bsc-dataseed.binance.org",
        "https://bsc-dataseed1.binance.org",
        "https://bsc-rpc.publicnode.com",
      ],
    },
  },
}

const arbitrumMainnetCustom = {
  ...arbitrum,
  rpcUrls: {
    default: {
      http: [
        process.env.NEXT_PUBLIC_RPC_ARBITRUM_MAINNET || "https://arbitrum.drpc.org",
      ],
    },
    public: {
      http: [
        process.env.NEXT_PUBLIC_RPC_ARBITRUM_MAINNET || "https://arbitrum.drpc.org",
      ],
    },
  },
}

const ethereumMainnetCustom = {
  ...mainnet,
  rpcUrls: {
    default: {
      http: [
        process.env.NEXT_PUBLIC_RPC_ETHEREUM_MAINNET || "https://ethereum.drpc.org",
        "https://ethereum-rpc.publicnode.com",
      ],
    },
    public: {
      http: [
        process.env.NEXT_PUBLIC_RPC_ETHEREUM_MAINNET || "https://ethereum.drpc.org",
        "https://ethereum-rpc.publicnode.com",
      ],
    },
  },
}

const polygonMainnetCustom = {
  ...polygon,
  rpcUrls: {
    default: {
      http: [
        process.env.NEXT_PUBLIC_RPC_POLYGON_MAINNET || "https://polygon.drpc.org",
        "https://polygon-bor-rpc.publicnode.com",
      ],
    },
    public: {
      http: [
        process.env.NEXT_PUBLIC_RPC_POLYGON_MAINNET || "https://polygon.drpc.org",
        "https://polygon-bor-rpc.publicnode.com",
      ],
    },
  },
}

const avalancheMainnetCustom = {
  ...avalanche,
  rpcUrls: {
    default: {
      http: [
        process.env.NEXT_PUBLIC_RPC_AVALANCHE_MAINNET || "https://avalanche.drpc.org",
      ],
    },
    public: {
      http: [
        process.env.NEXT_PUBLIC_RPC_AVALANCHE_MAINNET || "https://avalanche.drpc.org",
      ],
    },
  },
}

const baseMainnetCustom = {
  ...base,
  rpcUrls: {
    default: {
      http: [
        process.env.NEXT_PUBLIC_RPC_BASE_MAINNET || "https://mainnet.base.org",
      ],
    },
    public: {
      http: [
        process.env.NEXT_PUBLIC_RPC_BASE_MAINNET || "https://mainnet.base.org",
      ],
    },
  },
}

const monadMainnetCustom = {
  id: 143,
  name: 'Monad Mainnet',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.NEXT_PUBLIC_RPC_MONAD_MAINNET || `https://monad-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`] },
    public: { http: [process.env.NEXT_PUBLIC_RPC_MONAD_MAINNET || `https://monad-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`] },
  },
  blockExplorers: {
    default: { name: 'Monad Explorer', url: 'https://monadvision.com/' },
  },
  testnet: false,
} as const

// Get projectId from https://cloud.reown.com
export const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || ''

if (!projectId) {
  throw new Error('WalletConnect project ID is not defined. Set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID in your env')
}

// Build enabled networks from env-driven presets/overrides
function getEnabledNetworks() {
  const PRESET = process.env.NEXT_PUBLIC_NETWORK_PRESET || "testnet"

  const PRESETS: Record<string, any[]> = {
    testnet: [
      monadTestnet,
      bscTestnetCustom,
      arbitrumSepoliaCustom,
      baseSepoliaCustom,
      sepoliaCustom,
      xdcTestnet,
      somniaTestnet,
    ],
    "mainnet-bsc-only": [
      bscMainnetCustom,
    ],
    "mainnet-bsc-arbitrum": [
      bscMainnetCustom,
      arbitrumMainnetCustom,
    ],
    "mainnet-bsc-ethereum": [
      bscMainnetCustom,
      ethereumMainnetCustom,
    ],
    "mainnet-bsc-ethereum-arbitrum": [
      bscMainnetCustom,
      ethereumMainnetCustom,
      arbitrumMainnetCustom,
    ],
    "mainnet-bsc-polygon": [
      bscMainnetCustom,
      polygonMainnetCustom,
    ],
    "mainnet-bsc-avalanche": [
      bscMainnetCustom,
      avalancheMainnetCustom,
    ],
    "mainnet-bsc-base": [
      bscMainnetCustom,
      baseMainnetCustom,
    ],
    "mainnet-bsc-ethereum-arbitrum-polygon": [
      bscMainnetCustom,
      ethereumMainnetCustom,
      arbitrumMainnetCustom,
      polygonMainnetCustom,
    ],
    "mainnet-bsc-ethereum-arbitrum-polygon-avalanche": [
      bscMainnetCustom,
      ethereumMainnetCustom,
      arbitrumMainnetCustom,
      polygonMainnetCustom,
      avalancheMainnetCustom,
    ],
    "mainnet-bsc-ethereum-arbitrum-polygon-avalanche-base": [
      bscMainnetCustom,
      ethereumMainnetCustom,
      arbitrumMainnetCustom,
      polygonMainnetCustom,
      avalancheMainnetCustom,
      baseMainnetCustom,
    ],
    "mainnet-bsc-ethereum-arbitrum-polygon-avalanche-base-monad": [
      bscMainnetCustom,
      ethereumMainnetCustom,
      arbitrumMainnetCustom,
      polygonMainnetCustom,
      avalancheMainnetCustom,
      baseMainnetCustom,
      monadMainnetCustom,
    ],
  }

  const presetList = withRobinhood(PRESETS[PRESET] || PRESETS["testnet"])

  const overrideIds = (process.env.NEXT_PUBLIC_ENABLED_NETWORKS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean)

  if (overrideIds.length === 0) return presetList

  // Allow selecting by numeric id string
  const allKnown = [
    monadTestnet,
    bscTestnetCustom,
    arbitrumSepoliaCustom,
    baseSepoliaCustom,
    sepoliaCustom,
    xdcTestnet,
    somniaTestnet,
    bscMainnetCustom,
    arbitrumMainnetCustom,
    ethereumMainnetCustom,
    polygonMainnetCustom,
    avalancheMainnetCustom,
    baseMainnetCustom,
    monadMainnetCustom,
    robinhoodMainnet,
  ]
  const byId = new Map<string, any>(allKnown.map(n => [String(n.id), n]))
  return withRobinhood(overrideIds.map(id => byId.get(id)).filter(Boolean))
}

// Robinhood Chain rides along with every preset, the way Somnia did for the old
// margin module: the wallet has to be able to switch there regardless of which
// lending preset the deploy runs. It is appended last so it never becomes the
// default chain, and the network switchers do not know its id, so it stays out
// of the menu until the margin UI ships.
function withRobinhood(list: any[]): any[] {
  if (!FEATURE_FLAGS.ROBINHOOD_CHAIN) return list
  if (list.some((n) => n?.id === robinhoodMainnet.id)) return list
  return [...list, robinhoodMainnet]
}

// Networks array - ordered alphabetically to avoid automatic switching preferences
export const networks = getEnabledNetworks()

// Hybrid storage: prefer cookies (SSR-friendly), but fall back to localStorage to migrate existing sessions
const hybridBrowserStorage = {
  getItem: (key: string): string | null => {
    try {
      if (typeof window === 'undefined') return null
      // 1) Try cookies (wagmi stores under `wagmi.${key}`)
      const cookieName = `wagmi.${key}`
      const cookieMatch = document.cookie
        .split('; ')
        .find((row) => row.startsWith(`${cookieName}=`))
      if (cookieMatch) return decodeURIComponent(cookieMatch.split('=')[1])
      // 2) Fallback: try localStorage under both `wagmi.${key}` and raw `key`
      const ls1 = window.localStorage.getItem(`wagmi.${key}`)
      if (ls1) return ls1
      const ls2 = window.localStorage.getItem(key)
      if (ls2) return ls2
      return null
    } catch {
      return null
    }
  },
  setItem: (key: string, value: string): void => {
    try {
      if (typeof window === 'undefined') return
      // Write cookie (180 days), path=/, SameSite=Lax
      const cookieName = `wagmi.${key}`
      const expires = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toUTCString()
      document.cookie = `${cookieName}=${encodeURIComponent(value)}; Expires=${expires}; Path=/; SameSite=Lax`
      // Also mirror into localStorage for smoother migration
      try { window.localStorage.setItem(`wagmi.${key}`, value) } catch {}
    } catch {}
  },
  removeItem: (key: string): void => {
    try {
      if (typeof window === 'undefined') return
      const cookieName = `wagmi.${key}`
      document.cookie = `${cookieName}=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; SameSite=Lax`
      try { window.localStorage.removeItem(`wagmi.${key}`) } catch {}
      try { window.localStorage.removeItem(key) } catch {}
    } catch {}
  },
}

// Set up the Wagmi Adapter (Config)
export const wagmiAdapter = new WagmiAdapter({
  storage: createStorage({
    storage: typeof window === 'undefined' ? cookieStorage : (hybridBrowserStorage as any),
  }),
  ssr: true, // Enable SSR support
  projectId,
  networks,
  batch: {
    multicall: {
      wait: 250, // Wait 250ms to aggregate more calls
      batchSize: 1024, // Allow large batches
    },
  },
})

// Export the underlying wagmi config for the WagmiProvider
export const wagmiConfig = wagmiAdapter.wagmiConfig 
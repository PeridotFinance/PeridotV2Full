export interface ChainTheme {
  id: string
  name: string
  chainId: number
  colors: {
    primary: string
    secondary: string
    accent: string
    background: string
    foreground: string
    muted: string
    'muted-foreground': string
    border: string
    card: string
    'card-foreground': string
  }
  darkColors: {
    primary: string
    secondary: string
    accent: string
    background: string
    foreground: string
    muted: string
    'muted-foreground': string
    border: string
    card: string
    'card-foreground': string
  }
  copy: {
    welcome?: string
    tagline?: string
    connectedTagline?: string
    networkSpecificTerms?: Record<string, string>
  }
}

// Default Peridot theme (when no chain is active or unsupported chain)
export const defaultTheme: ChainTheme = {
  id: 'default',
  name: 'Peridot',
  chainId: 0,
  colors: {
    primary: '150, 59%, 48%',
    secondary: '96 31% 88%',
    accent: '95 33% 76%',
    background: '0 0% 100%',
    foreground: '240 10% 3.9%',
    muted: '0 0% 92%',
    'muted-foreground': '240 3.8% 46.1%',
    border: '0 0% 85%',
    card: '0 0% 98%',
    'card-foreground': '240 10% 3.9%',
  },
  darkColors: {
    primary: '150, 59%, 48%',
    secondary: '96 31% 28%',
    accent: '95 33% 36%',
    background: '90 25% 3%',
    foreground: '94 23% 94%',
    muted: '90 25% 10%',
    'muted-foreground': '94 10% 75%',
    border: '90 25% 15%',
    card: '90 25% 5%',
    'card-foreground': '94 23% 94%',
  },
  copy: {
    welcome: 'Welcome to Peridot Finance',
    tagline: 'Cross-chain DeFi lending made simple',
    connectedTagline: 'Supply, borrow, and earn with Peridot.'
  }
}

// Monad theme - Purple
export const monadTheme: ChainTheme = {
  id: 'monad',
  name: 'Monad',
  chainId: 10143,
  colors: {
    primary: '280, 85%, 65%', // Vibrant purple
    secondary: '280 70% 75%', // Light purple
    accent: '300, 75%, 70%', // Lighter purple accent
    background: '0 0% 100%',
    foreground: '240 10% 3.9%',
    muted: '280 20% 95%', // Very light purple tint
    'muted-foreground': '280 15% 45%',
    border: '280 30% 85%', // Light purple border
    card: '280 10% 98%', // Very subtle purple card background
    'card-foreground': '240 10% 3.9%',
  },
  darkColors: {
    primary: '280, 85%, 65%', // Same vibrant purple for consistency
    secondary: '280 60% 35%', // Dark purple secondary
    accent: '300, 70%, 55%', // Darker purple accent
    background: '280 20% 5%', // Dark purple-tinted background
    foreground: '280 10% 95%', // Light text on dark background
    muted: '280 15% 15%', // Dark purple muted areas
    'muted-foreground': '280 10% 65%',
    border: '280 20% 20%', // Dark purple borders
    card: '280 15% 8%', // Dark purple card background
    'card-foreground': '280 10% 95%',
  },
  copy: {
    welcome: 'Monad Lending',
    tagline: 'Parallel execution, infinite possibilities',
    connectedTagline: 'Supply assets, borrow funds, and optimize your yield',
    networkSpecificTerms: {
      'fast': 'lightning-fast',
      'efficient': 'parallel-powered',
      'scalable': 'infinitely scalable'
    }
  }
}

// BSC theme - Yellow/Gold
export const bscTheme: ChainTheme = {
  id: 'bnb',
  name: 'BSC',
  chainId: 97,
  colors: {
    primary: '45, 100%, 50%', // Bright yellow/gold
    secondary: '45 80% 70%', // Light yellow
    accent: '45, 90%, 55%', // Golden accent
    background: '0 0% 100%',
    foreground: '240 10% 3.9%',
    muted: '45 20% 95%', // Very light yellow tint
    'muted-foreground': '45 15% 45%',
    border: '45 30% 85%', // Light yellow border
    card: '45 10% 98%', // Very subtle yellow card background
    'card-foreground': '240 10% 3.9%',
  },
  darkColors: {
    primary: '45, 100%, 50%', // Same bright yellow for consistency
    secondary: '45 70% 35%', // Dark yellow secondary
    accent: '45, 85%, 45%', // Darker golden accent
    background: '45 25% 5%', // Dark yellow-tinted background
    foreground: '45 10% 95%', // Light text on dark background
    muted: '45 15% 15%', // Dark yellow muted areas
    'muted-foreground': '45 10% 65%',
    border: '45 20% 20%', // Dark yellow borders
    card: '45 15% 8%', // Dark yellow card background
    'card-foreground': '45 10% 95%',
  },
  copy: {
    welcome: 'Peridot Lending',
    tagline: 'Smart Chain, smarter finance',
    connectedTagline: 'Supply assets, borrow funds, and optimize your yield',
    networkSpecificTerms: {
      'fast': 'BNB-speed',
      'efficient': 'Smart Chain powered',
      'low-cost': 'ultra low-cost'
    }
  }
}

// Somnia theme - Purple and teal gradient inspired by Somnia logo
export const somniaTheme: ChainTheme = {
  id: 'somnia',
  name: 'Somnia',
  chainId: 50312,
  colors: {
    primary: '280, 85%, 65%', // Vibrant purple from Somnia logo
    secondary: '180, 60%, 45%', // Teal accent from Somnia logo
    accent: '300, 70%, 70%', // Lighter purple for accents
    background: '0 0% 100%',
    foreground: '240 10% 3.9%',
    muted: '280 20% 95%', // Very light purple tint
    'muted-foreground': '280 15% 45%',
    border: '280 30% 85%', // Light purple border
    card: '280 10% 98%', // Very subtle purple card background
    'card-foreground': '240 10% 3.9%',
  },
  darkColors: {
    primary: '280, 85%, 65%', // Same vibrant purple for consistency
    secondary: '180, 60%, 45%', // Same teal for consistency
    accent: '300, 70%, 70%', // Lighter purple for accents
    background: '280 20% 5%', // Dark purple-tinted background
    foreground: '280 10% 95%', // Light text on dark background
    muted: '280 15% 15%', // Dark purple muted areas
    'muted-foreground': '280 10% 65%',
    border: '280 20% 20%', // Dark purple borders
    card: '280 15% 8%', // Dark purple card background
    'card-foreground': '280 10% 95%',
  },
  copy: {
    welcome: 'Somnia Lending',
    tagline: 'Next-generation blockchain, next-level DeFi',
    connectedTagline: 'Supply assets, borrow funds, and optimize your yield',
    networkSpecificTerms: {
      'fast': 'lightning-fast',
      'efficient': 'Somnia-powered',
      'scalable': 'infinitely scalable'
    }
  }
}

// Arbitrum theme - Cyan/Teal Blue
export const arbitrumTheme: ChainTheme = {
  id: 'arbitrum',
  name: 'Arbitrum',
  chainId: 42161,
  colors: {
    primary: '195, 100%, 50%', // Bright cyan
    secondary: '195 80% 70%', // Light cyan
    accent: '200, 90%, 60%', // Teal accent
    background: '0 0% 100%',
    foreground: '240 10% 3.9%',
    muted: '195 20% 95%', // Very light cyan tint
    'muted-foreground': '195 15% 45%',
    border: '195 30% 85%', // Light cyan border
    card: '195 10% 98%', // Very subtle cyan card background
    'card-foreground': '240 10% 3.9%',
  },
  darkColors: {
    primary: '195, 100%, 50%', // Same bright cyan for consistency
    secondary: '195 70% 35%', // Dark cyan secondary
    accent: '200, 85%, 45%', // Darker teal accent
    background: '195 25% 5%', // Dark cyan-tinted background
    foreground: '195 10% 95%', // Light text on dark background
    muted: '195 15% 15%', // Dark cyan muted areas
    'muted-foreground': '195 10% 65%',
    border: '195 20% 20%', // Dark cyan borders
    card: '195 15% 8%', // Dark cyan card background
    'card-foreground': '195 10% 95%',
  },
  copy: {
    welcome: 'Arbitrum Lending',
    tagline: 'Layer 2 scaling, infinite possibilities',
    connectedTagline: 'Supply assets, borrow funds, and optimize your yield',
    networkSpecificTerms: {
      'fast': 'lightning-fast',
      'efficient': 'Arbitrum-powered',
      'low-cost': 'ultra low-cost'
    }
  }
}

// Ethereum theme - Deep Blue/Purple
export const ethereumTheme: ChainTheme = {
  id: 'eth',
  name: 'Ethereum',
  chainId: 1,
  colors: {
    primary: '240, 70%, 55%', // Deep blue
    secondary: '250 60% 70%', // Light blue-purple
    accent: '230, 75%, 60%', // Bright blue accent
    background: '0 0% 100%',
    foreground: '240 10% 3.9%',
    muted: '240 20% 95%', // Very light blue tint
    'muted-foreground': '240 15% 45%',
    border: '240 30% 85%', // Light blue border
    card: '240 10% 98%', // Very subtle blue card background
    'card-foreground': '240 10% 3.9%',
  },
  darkColors: {
    primary: '240, 70%, 55%', // Same deep blue for consistency
    secondary: '240 60% 35%', // Dark blue secondary
    accent: '230, 70%, 50%', // Darker blue accent
    background: '240 25% 5%', // Dark blue-tinted background
    foreground: '240 10% 95%', // Light text on dark background
    muted: '240 15% 15%', // Dark blue muted areas
    'muted-foreground': '240 10% 65%',
    border: '240 20% 20%', // Dark blue borders
    card: '240 15% 8%', // Dark blue card background
    'card-foreground': '240 10% 95%',
  },
  copy: {
    welcome: 'Ethereum Lending',
    tagline: 'The foundation of DeFi',
    connectedTagline: 'Supply assets, borrow funds, and optimize your yield',
    networkSpecificTerms: {
      'fast': 'secure',
      'efficient': 'Ethereum-powered',
      'reliable': 'battle-tested'
    }
  }
}

// Polygon theme - Vibrant Purple/Blue
export const polygonTheme: ChainTheme = {
  id: 'polygon',
  name: 'Polygon',
  chainId: 137,
  colors: {
    primary: '260, 90%, 60%', // Vibrant purple-blue
    secondary: '260 75% 75%', // Light purple-blue
    accent: '270, 85%, 65%', // Bright purple accent
    background: '0 0% 100%',
    foreground: '240 10% 3.9%',
    muted: '260 20% 95%', // Very light purple tint
    'muted-foreground': '260 15% 45%',
    border: '260 30% 85%', // Light purple border
    card: '260 10% 98%', // Very subtle purple card background
    'card-foreground': '240 10% 3.9%',
  },
  darkColors: {
    primary: '260, 90%, 60%', // Same vibrant purple-blue for consistency
    secondary: '260 70% 35%', // Dark purple-blue secondary
    accent: '270, 80%, 50%', // Darker purple accent
    background: '260 25% 5%', // Dark purple-tinted background
    foreground: '260 10% 95%', // Light text on dark background
    muted: '260 15% 15%', // Dark purple muted areas
    'muted-foreground': '260 10% 65%',
    border: '260 20% 20%', // Dark purple borders
    card: '260 15% 8%', // Dark purple card background
    'card-foreground': '260 10% 95%',
  },
  copy: {
    welcome: 'Polygon Lending',
    tagline: 'Scalable DeFi, infinite potential',
    connectedTagline: 'Supply assets, borrow funds, and optimize your yield',
    networkSpecificTerms: {
      'fast': 'lightning-fast',
      'efficient': 'Polygon-powered',
      'low-cost': 'ultra low-cost'
    }
  }
}

// Avalanche theme - Red/Orange
export const avalancheTheme: ChainTheme = {
  id: 'avalanche',
  name: 'Avalanche',
  chainId: 43114,
  colors: {
    primary: '0, 90%, 55%', // Bright red
    secondary: '15 85% 70%', // Light red-orange
    accent: '10, 90%, 58%', // Bright orange-red accent
    background: '0 0% 100%',
    foreground: '240 10% 3.9%',
    muted: '0 20% 95%', // Very light red tint
    'muted-foreground': '0 15% 45%',
    border: '0 30% 85%', // Light red border
    card: '0 10% 98%', // Very subtle red card background
    'card-foreground': '240 10% 3.9%',
  },
  darkColors: {
    primary: '0, 90%, 55%', // Same bright red for consistency
    secondary: '0 70% 35%', // Dark red secondary
    accent: '10, 85%, 45%', // Darker orange-red accent
    background: '0 25% 5%', // Dark red-tinted background
    foreground: '0 10% 95%', // Light text on dark background
    muted: '0 15% 15%', // Dark red muted areas
    'muted-foreground': '0 10% 65%',
    border: '0 20% 20%', // Dark red borders
    card: '0 15% 8%', // Dark red card background
    'card-foreground': '0 10% 95%',
  },
  copy: {
    welcome: 'Avalanche Lending',
    tagline: 'Fast, low-cost, and reliable',
    connectedTagline: 'Supply assets, borrow funds, and optimize your yield',
    networkSpecificTerms: {
      'fast': 'lightning-fast',
      'efficient': 'Avalanche-powered',
      'reliable': 'high-performance'
    }
  }
}

// Base theme - Bright Blue (Coinbase blue)
export const baseTheme: ChainTheme = {
  id: 'base',
  name: 'Base',
  chainId: 8453,
  colors: {
    primary: '210, 100%, 50%', // Bright blue
    secondary: '210 85% 70%', // Light blue
    accent: '215, 90%, 60%', // Bright blue accent
    background: '0 0% 100%',
    foreground: '240 10% 3.9%',
    muted: '210 20% 95%', // Very light blue tint
    'muted-foreground': '210 15% 45%',
    border: '210 30% 85%', // Light blue border
    card: '210 10% 98%', // Very subtle blue card background
    'card-foreground': '240 10% 3.9%',
  },
  darkColors: {
    primary: '210, 100%, 50%', // Same bright blue for consistency
    secondary: '210 70% 35%', // Dark blue secondary
    accent: '215, 85%, 45%', // Darker blue accent
    background: '210 25% 5%', // Dark blue-tinted background
    foreground: '210 10% 95%', // Light text on dark background
    muted: '210 15% 15%', // Dark blue muted areas
    'muted-foreground': '210 10% 65%',
    border: '210 20% 20%', // Dark blue borders
    card: '210 15% 8%', // Dark blue card background
    'card-foreground': '210 10% 95%',
  },
  copy: {
    welcome: 'Base Lending',
    tagline: 'Built on Coinbase, powered by optimism',
    connectedTagline: 'Supply assets, borrow funds, and optimize your yield',
    networkSpecificTerms: {
      'fast': 'lightning-fast',
      'efficient': 'Base-powered',
      'secure': 'Coinbase-backed'
    }
  }
}

// Chain themes mapping (includes both mainnet and testnet chain IDs)
export const chainThemes: Record<number, ChainTheme> = {
  // Hub chains - Mainnet
  [bscTheme.chainId]: bscTheme, // 97 (BSC Testnet)
  56: { ...bscTheme, chainId: 56 }, // BSC Mainnet
  [monadTheme.chainId]: monadTheme, // 10143 (Monad Testnet)
  143: { ...monadTheme, chainId: 143 }, // Monad Mainnet
  [somniaTheme.chainId]: somniaTheme, // 50312 (Somnia Testnet)
  1868: { ...somniaTheme, chainId: 1868 }, // Somnia Mainnet
  
  // Spoke chains - Mainnet
  [arbitrumTheme.chainId]: arbitrumTheme, // 42161 (Arbitrum Mainnet)
  421614: { ...arbitrumTheme, chainId: 421614 }, // Arbitrum Sepolia
  [ethereumTheme.chainId]: ethereumTheme, // 1 (Ethereum Mainnet)
  11155111: { ...ethereumTheme, chainId: 11155111 }, // Ethereum Sepolia
  [polygonTheme.chainId]: polygonTheme, // 137 (Polygon Mainnet)
  [avalancheTheme.chainId]: avalancheTheme, // 43114 (Avalanche Mainnet)
  [baseTheme.chainId]: baseTheme, // 8453 (Base Mainnet)
  84532: { ...baseTheme, chainId: 84532 }, // Base Sepolia
}

// Get theme by chain ID
export function getChainTheme(chainId?: number): ChainTheme {
  if (!chainId) return defaultTheme
  return chainThemes[chainId] || defaultTheme
}

// Get theme by network ID (for UI network selection)
export function getThemeByNetworkId(networkId: string): ChainTheme {
  switch (networkId) {
    case "stellar-soroban-mainnet":
      // Stellar is non-EVM; use default theme to avoid EVM chain colors
      return defaultTheme
    case 'monad':
      return monadTheme
    case 'bnb':
      return bscTheme
    case 'somnia':
      return somniaTheme
    case 'arbitrum':
      return arbitrumTheme
    case 'eth':
      return ethereumTheme
    case 'polygon':
      return polygonTheme
    case 'avalanche':
      return avalancheTheme
    case 'base':
      return baseTheme
    default:
      return defaultTheme
  }
} 
const CHAIN_ID_TO_NETWORK_ID: Record<number, string> = {
  // Mainnets
  1: "eth",
  56: "bnb",
  42161: "arbitrum",
  8453: "base",
  59144: "linea",
  10: "optimism",
  137: "polygon",
  324: "zksync",
  1868: "somnia",
  43114: "avalanche",
  4663: "robinhood",

  // Testnets
  97: "bnb",
  421614: "arbitrum",
  84532: "base",
  11155111: "eth",
  10143: "monad",
  1075: "iotaevm",
  50312: "somnia",
}

// Consolidated chain utilities
export const CHAIN_UTILS = {
  // Network ID mapping
  networkIdFromChainId: (chainId: number | null | undefined): string | undefined => {
    if (typeof chainId !== "number") return undefined
    return CHAIN_ID_TO_NETWORK_ID[chainId]
  },

  // Privy chain name mapping
  getPrivyChainName: (chainId: number): string => {
    const privyMap: Record<number, string> = {
      // Mainnets
      1: 'ethereum',
      56: 'bsc',
      42161: 'arbitrum',
      8453: 'base',
      59144: 'linea',
      10: 'optimism',
      137: 'polygon',
      324: 'zksync',
      1868: 'somnia',
      43114: 'avalanche',
      4663: 'robinhood',
      // Testnets
      97: 'bsc-testnet',
      421614: 'arbitrum-sepolia',
      84532: 'base-sepolia',
      11155111: 'ethereum-sepolia',
      10143: 'monad-testnet',
      1075: 'iotaevm-testnet',
      50312: 'somnia-testnet',
    }
    return privyMap[chainId] || 'ethereum'
  },

  // Native token symbol mapping
  getNativeTokenSymbol: (chainId: number): string => {
    const symbolMap: Record<number, string> = {
      // Mainnets
      1: 'ETH',      // Ethereum
      56: 'BNB',     // BSC
      42161: 'ETH',  // Arbitrum
      8453: 'ETH',   // Base
      59144: 'ETH',  // Linea
      10: 'ETH',     // Optimism
      137: 'MATIC',  // Polygon
      324: 'ETH',    // zkSync Era
      1868: 'SOMI',   // Somneia
      43114: 'AVAX', // Avalanche
      4663: 'ETH',   // Robinhood Chain
      // Testnets
      97: 'BNB',     // BSC Testnet
      421614: 'ETH', // Arbitrum Sepolia
      84532: 'ETH',  // Base Sepolia
      11155111: 'ETH', // Sepolia
      10143: 'MON', // Monad Testnet
      143: 'MON',   // Monad Mainnet
      1075: 'IOTA',  // IOTA EVM Testnet
      50312: 'SOMI',   // Somneia Minato Testnet
    }
    return symbolMap[chainId] || 'ETH'
  }
}

// Legacy export for backward compatibility
export function networkIdFromChainId(chainId: number | null | undefined): string | undefined {
  return CHAIN_UTILS.networkIdFromChainId(chainId)
}

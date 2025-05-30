import { type Chain } from 'viem';

// Chain Definitions
export const soneiumMinato = {
  id: 1946,
  name: 'Soneium Minato',
  nativeCurrency: {
    decimals: 18,
    name: 'Soneium Ether',
    symbol: 'sETH',
  },
  rpcUrls: {
    public: { http: ['https://rpc.minato.soneium.org/'] },
    default: { http: ['https://rpc.minato.soneium.org/'] },
  },
  blockExplorers: {
    default: { name: 'Soneium Minato Explorer', url: 'https://soneium-minato.blockscout.com/' },
  },
  testnet: true,
} as const satisfies Chain;

export const arbitrumSepolia = {
  id: 421614,
  name: 'Arbitrum Sepolia',
  nativeCurrency: {
    decimals: 18,
    name: 'Arbitrum ETH',
    symbol: 'ETH',
  },
  rpcUrls: {
    public: { http: ['https://sepolia-rollup.arbitrum.io/rpc'] },
    default: { http: ['https://sepolia-rollup.arbitrum.io/rpc'] },
  },
  blockExplorers: {
    default: { name: 'Arbiscan', url: 'https://sepolia.arbiscan.io' },
  },
  testnet: true,
} as const satisfies Chain;

export const baseSepolia = {
  id: 84532,
  name: 'Base Sepolia',
  nativeCurrency: {
    decimals: 18,
    name: 'Base ETH',
    symbol: 'ETH',
  },
  rpcUrls: {
    public: { http: ['https://sepolia.base.org'] },
    default: { http: ['https://sepolia.base.org'] },
  },
  blockExplorers: {
    default: { name: 'BaseScan', url: 'https://sepolia.basescan.org' },
  },
  testnet: true,
} as const satisfies Chain;

// Contract Addresses for each network
export const networkContracts = {
  [soneiumMinato.id]: {
    chainNameWormhole: "SoneiumMinato",
    chainNameReadable: "Soneium Minato Testnet",
    peridotToken: "0x28fE679719e740D15FC60325416bB43eAc50cD15" as `0x${string}`,
    oracle: "0xC54eEC89EA82D82b4D75B6ccffe28633e52e1550" as `0x${string}`,
    usdt: "0xeAEdaF63CbC1d00cB6C14B5c4DE161d68b7C63A0" as `0x${string}`,
    peridottrollerG7Impl: "0xa41D586530BC7BC872095950aE03a780d5114445" as `0x${string}`,
    peridottrollerG7Proxy: "0xB911C192ed1d6428A12F2Cf8F636B00c34e68a2a" as `0x${string}`,
    jumpRateModelV2: "0xf79b3af6954bCbeDfE0F6BE34DD1153A391E8083" as `0x${string}`,
    pErc20DelegateImpl: "0xf66037a2b7aDA645f22523E0dDb461c9012125d1" as `0x${string}`,
    pErc20DelegatorProxy: "0x1DCb19949fC0a68cbdAa53Cce898B60D7436b14F" as `0x${string}`,
    // pToken addresses for different assets
    pTokens: {
      PERC: "0x1DCb19949fC0a68cbdAa53Cce898B60D7436b14F" as `0x${string}`,
    }
  },
  [arbitrumSepolia.id]: {
    chainNameWormhole: "ArbitrumSepolia",
    chainNameReadable: "Arbitrum Sepolia",
    oracle: "0xdefE2f4D1Bf069C7167f9b093F2ee9f01D557812" as `0x${string}`,
    mockUSDC: "0xDEe566b3Fe99F8d9934BAAEEdDA298D5B76B8868" as `0x${string}`,
    peridotToken: "0x49B73557Cd9E307bB0846e6DDDf884Bca3064a00" as `0x${string}`,
    usdtNtt: "0x3ed59D5D0a2236cDAd22aDFFC5414df74Ccb3040" as `0x${string}`,
    unitrollerProxy: "0xfB3f8837B1Ad7249C1B253898b3aa7FaB22E68aD" as `0x${string}`,
    peridottrollerG7Impl: "0x56f8868EFAe647c3DDc64C1be9C099FC11C6FB93" as `0x${string}`,
    peridottrollerG7Proxy: "0xfB3f8837B1Ad7249C1B253898b3aa7FaB22E68aD" as `0x${string}`, // Using unitroller proxy as main proxy
    jumpRateModelV2: "0xcf26c1EcB6482a9A626d986A8E3c87fb68f2F8f3" as `0x${string}`,
    hub: "0x953a25eC35963bC517a41e0Bc187298ee692a477" as `0x${string}`,
    proxyHub: "0x8F9d1f504B13726d0977216CF81fB1e7d81a497C" as `0x${string}`,
    pUSDCDelegatorProxy: "0xFb08502090318eA69595ad5D80Ff854B87f457eb" as `0x${string}`,
    pUSDCDelegate: "0x80ad5825dc4bC647F19b81311abBD354823AEA8B" as `0x${string}`,
    pTokens: {
      USDC: "0xFb08502090318eA69595ad5D80Ff854B87f457eb" as `0x${string}`,
    }
  },
  [baseSepolia.id]: {
    chainNameWormhole: "BaseSepolia",
    chainNameReadable: "Base Sepolia",
    spoke: "0xc55c86ef14Dc7A058895659CC11c97C344bF6e7B" as `0x${string}`,
    peridotSpokeProxy: "0x35280b6EA83Fd265D316037432e62870409eaC5b" as `0x${string}`,
    peridotToken: "0x12436e56cFb5a277e9647EBA3587435D69e2b8FB" as `0x${string}`,
    wrappedMockUSDC: "0x266e5B7fb5D918E5A3b2aEde73c2C694cF58E537" as `0x${string}`,
    usdtNtt: "0x0fAc9Bcf3B1e358574aBE7862Ec8bBC071EeAf0c" as `0x${string}`,
    // Note: Base Sepolia is a spoke chain, main peridottroller operations would be on hub
    pTokens: {
      USDC: "0x266e5B7fb5D918E5A3b2aEde73c2C694cF58E537" as `0x${string}`, // Using wrapped mock USDC for now
    }
  }
} as const;

// Supported Networks
export const supportedNetworks = [soneiumMinato, arbitrumSepolia, baseSepolia] as const;

// Network Type Guards and Utilities
export function isSupportedNetwork(chainId: number): chainId is keyof typeof networkContracts {
  return chainId in networkContracts;
}

export function getNetworkConfig(chainId: number) {
  if (!isSupportedNetwork(chainId)) {
    throw new Error(`Unsupported network: ${chainId}`);
  }
  return networkContracts[chainId];
}

export function getChainById(chainId: number): Chain | undefined {
  return supportedNetworks.find(chain => chain.id === chainId);
}

// Get peridottroller address for a given network
export function getPeridottrollerAddress(chainId: number): `0x${string}` | undefined {
  if (!isSupportedNetwork(chainId)) return undefined;
  
  const config = networkContracts[chainId];
  // Different networks may have different contract structures
  if ('peridottrollerG7Proxy' in config && config.peridottrollerG7Proxy) {
    return config.peridottrollerG7Proxy;
  }
  if ('unitrollerProxy' in config && config.unitrollerProxy) {
    return config.unitrollerProxy;
  }
  return undefined;
}

// Get network display info
export function getNetworkDisplayInfo(chainId: number) {
  if (!isSupportedNetwork(chainId)) {
    return {
      name: 'Unsupported Network',
      readable: 'Unsupported Network',
      isSupported: false
    };
  }
  
  const config = networkContracts[chainId];
  const chain = getChainById(chainId);
  
  return {
    name: chain?.name || 'Unknown',
    readable: config.chainNameReadable,
    isSupported: true,
    isTestnet: chain?.testnet || false
  };
}

// Export current active network (for now, Soneium Minato)
export const currentActiveNetwork = soneiumMinato;
export const currentActiveNetworkContracts = networkContracts[soneiumMinato.id]; 
export const arbitrumSepoliaContracts = {
  chainNameWormhole: "ArbitrumSepolia", // Wormhole Connect specific chain name
  chainNameReadable: "Arbitrum Sepolia",
  chainId: 421614, // Standard chain ID for reference
  oracle: "0xdefE2f4D1Bf069C7167f9b093F2ee9f01D557812",
  mockUSDC: "0xDEe566b3Fe99F8d9934BAAEEdDA298D5B76B8868",
  peridotToken: "0x49B73557Cd9E307bB0846e6DDDf884Bca3064a00",
  usdtNtt: "0x3ed59D5D0a2236cDAd22aDFFC5414df74Ccb3040",
  unitrollerProxy: "0xfB3f8837B1Ad7249C1B253898b3aa7FaB22E68aD",
  peridottrollerG7Impl: "0x56f8868EFAe647c3DDc64C1be9C099FC11C6FB93",
  jumpRateModelV2: "0xcf26c1EcB6482a9A626d986A8E3c87fb68f2F8f3",
  hub: "0x953a25eC35963bC517a41e0Bc187298ee692a477",
  proxyHub: "0x8F9d1f504B13726d0977216CF81fB1e7d81a497C",
  pUSDCDelagatorProxy: "0xFb08502090318eA69595ad5D80Ff854B87f457eb",
  pUSDCDelagate: "0x80ad5825dc4bC647F19b81311abBD354823AEA8B",
};

export const baseSepoliaContracts = {
  chainNameWormhole: "BaseSepolia", // Wormhole Connect specific chain name
  chainNameReadable: "Base Sepolia",
  chainId: 84532, // Standard chain ID for reference
  spoke: "0xc55c86ef14Dc7A058895659CC11c97C344bF6e7B",
  peridotSpokeProxy: "0x35280b6EA83Fd265D316037432e62870409eaC5b",
  peridotToken: "0x12436e56cFb5a277e9647EBA3587435D69e2b8FB",
  wrappedMockUSDC: "0x266e5B7fb5D918E5A3b2aEde73c2C694cF58E537",
  usdtNtt: "0x0fAc9Bcf3B1e358574aBE7862Ec8bBC071EeAf0c",
};

export const iotaEVMTestnetContracts = {
  chainNameWormhole: "IotaEvm",   // custom placeholder – see note below
  chainNameReadable: "IOTA EVM Testnet",
  chainId: 1075,                  // EIP-155 chain ID
  rpcUrl: "https://json-rpc.evm.testnet.iotaledger.net",
  explorer: "https://explorer.evm.testnet.iotaledger.net",
  usdt: "0x28fE679719e740D15FC60325416bB43eAc50cD15",
  simpleOracle: "0xeAEdaF63CbC1d00cB6C14B5c4DE161d68b7C63A0",
  peridotToken: "0x0aF1232eA8ec20aa4Ed29715787c74d2eacCb716",
  peridottrollerProxy: "0xB911C192ed1d6428A12F2Cf8F636B00c34e68a2a",
  jumpRateModelV2: "0xf79b3af6954bCbeDfE0F6BE34DD1153A391E8083",
  pPeridotProxy: "0x1DCb19949fC0a68cbdAa53Cce898B60D7436b14F",
  pPeridotImpl: "0xf66037a2b7aDA645f22523E0dDb461c9012125d1",
};


export const soneiumMainnetContracts = {
  chainNameWormhole: "Soneium",          // custom until Wormhole adds support
  chainNameReadable: "Soneium Mainnet",
  chainId: 1868,
  rpcUrl: "https://rpc.soneium.org/",
  explorer: "https://soneium.blockscout.com/",
  peridotTokenSymbolP: "0x96650BebC549456F253974c11Fc6cBE28172A2d2",
  simplePriceOracle: "0x6D208789f0a978aF789A3C8Ba515749598940716",
  peridottrollerG7Impl: "0x93E175EB3E133AE0246Bd384f9cDbf651Fb9B516",
  peridottrollerG7Proxy: "0x86EA66356156d6F3BF66C531A25E661135F5D951",
  jumpRateModelV2: "0xc1306A30490C8566D09f617e85BB503B55B547eC",
  peridotHubLogic: "0x92Fa9A9A0CD6d78A15Bb6DBb67A17bb5C4C1120b",
  peridotHubProxy: "0x5800B480382e23cbe3553590169b78A42809D22c",
};

export const soneiumMinatoTestnetContracts = {
  chainNameWormhole: "SoneiumMinato",    // distinct label; still custom
  chainNameReadable: "Soneium Minato Testnet",
  chainId: 1946,
  rpcUrl: "https://rpc.minato.soneium.org/",
  explorer: "https://soneium-minato.blockscout.com/",
  peridotToken: "0x28fE679719e740D15FC60325416bB43eAc50cD15",
  oracle: "0xC54eEC89EA82D82b4D75B6ccffe28633e52e1550",
  usdt: "0xeAEdaF63CbC1d00cB6C14B5c4DE161d68b7C63A0",
  peridottrollerG7Impl: "0xa41D586530BC7BC872095950aE03a780d5114445",
  peridottrollerG7Proxy: "0xB911C192ed1d6428A12F2Cf8F636B00c34e68a2a",
  jumpRateModelV2: "0xf79b3af6954bCbeDfE0F6BE34DD1153A391E8083",
  pErc20DelegateImpl: "0xf66037a2b7aDA645f22523E0dDb461c9012125d1",
  pErc20DelegatorProxy: "0x1DCb19949fC0a68cbdAa53Cce898B60D7436b14F",
};


export const solanaTestnetContracts = {
  chainNameWormhole: "Solana", // Wormhole Connect specific chain name
  chainNameReadable: "Solana Testnet", // Updated to reflect it's devnet
  rpcUrl: "https://api.devnet.solana.com", // Solana devnet RPC endpoint
  prdtSplTokenMint: "FTmRNssUmboCLqRjuNVErLVPKnwpu9Fe2Nav4mFKBJuw", // Updated Peridot token address for devnet
  prdtSplTokenAccount: "AiKy7k3zyMu5gJ7MobHTfjTZKEaajHHwKhyKZaeTUYea",
  prdtNttManagerPda: "8WRCfaAMASji1kWKBe9VuYKJr4wNoVz8NYYRa6Nw5Efq",
  usdtSplTokenMint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  usdtNttManagerPda: "8WRCfaAMASji1kWKBe9VuYKJr4wNoVz8NYYRa6Nw5Efq",
};

export const monadTestnetContracts = {
  chainNameWormhole: "MonadTestnet",
  chainNameReadable: "Monad Testnet",
  chainId: 10143, // Monad Testnet chain ID (official)
  rpcUrl: "https://testnet-rpc.monad.xyz/",
  explorer: "https://testnet-explorer.monad.xyz/",
  
  // Core contracts
  peridotToken: "0x28fE679719e740D15FC60325416bB43eAc50cD15",
  oracle: "0xeAEdaF63CbC1d00cB6C14B5c4DE161d68b7C63A0",
  
  // Controller contracts
  unitrollerProxy: "0xa41D586530BC7BC872095950aE03a780d5114445",
  peridottrollerG7Impl: "0xf79b3af6954bCbeDfE0F6BE34DD1153A391E8083",
  peridottrollerG7Proxy: "0xa41D586530BC7BC872095950aE03a780d5114445", // Same as unitroller
  
  // Interest rate model
  jumpRateModelV2: "0x2d271dEb2596d78aaa2551695Ebfa9Cd440713aC",
  
  // pToken implementations and proxies
  pErc20DelegateImpl: "0xECdF5834016e605d9E6Ff36bd2a1e3f7f189A140",
  
  // pToken delegator proxies (main contracts to interact with)
  pUSDCDelegatorProxy: "0x46de2583b5CCC7C8169608f5cA168389f1e4b5b9",
  pWMONDelegatorProxy: "0x8b5055bff2f35FE6d4C84585901A4FeF9803aabe",
  pUSDTDelegatorProxy: "0x8547F1e3B77b9585247a1b9a605Fe3297F975a00",
  pLINKDelegatorProxy: "0x06827a2dB9047219b3989E926e811808233C95AC",
  
  // pToken delegate implementations
  pWMONDelegate: "0x72ca55dF01A84a78c24D07Aea3eEc857FA5fdcc8",
  pUSDTDelegate: "0xEDdC65ECaF2e67c301a01fDc1da6805084f621D0",
  pLINKDelegate: "0x58Ca60610Bf8962d01fc275452F5fA9179940CC9",
  
  // Underlying token contracts
  tokens: {
    LINK: "0x6fE981Dbd557f81ff66836af0932cba535Cbc343",
    WMON: "0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701",
    USDC: "0xf817257fed379853cDe0fa4F97AB987181B1E5Ea",
    USDT: "0x88b8E2161DEDC77EF4ab7585569D2415a1C1055D",
    WBTC: "0xcf5a6076cfa32686c0Df13aBaDa2b40dec133F1d",
    WETH: "0xB5a30b0FDc42e3E9760Cb8449Fb37"
  },
  
  // Market mappings for easy access
  markets: {
    USDC: {
      pToken: "0x46de2583b5CCC7C8169608f5cA168389f1e4b5b9",
      underlying: "0xf817257fed379853cDe0fa4F97AB987181B1E5Ea",
      symbol: "pUSDC"
    },
    WMON: {
      pToken: "0x8b5055bff2f35FE6d4C84585901A4FeF9803aabe",
      underlying: "0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701",
      symbol: "pWMON"
    },
    USDT: {
      pToken: "0x8547F1e3B77b9585247a1b9a605Fe3297F975a00",
      underlying: "0x88b8E2161DEDC77EF4ab7585569D2415a1C1055D",
      symbol: "pUSDT"
    },
    LINK: {
      pToken: "0x06827a2dB9047219b3989E926e811808233C95AC",
      underlying: "0x6fE981Dbd557f81ff66836af0932cba535Cbc343",
      symbol: "pLINK"
    }
  }
};

export const bscTestnetContracts = {
  chainNameWormhole: "BSCTestnet",
  chainNameReadable: "BSC Testnet",
  chainId: 97, // BSC Testnet chain ID
  rpcUrl: "https://data-seed-prebsc-1-s1.binance.org:8545/",
  explorer: "https://testnet.bscscan.com/",
  
  // Core contracts
  peridotToken: "0xB911C192ed1d6428A12F2Cf8F636B00c34e68a2a",
  
  // Oracle contracts
  simplePriceOracle: "0xf79b3af6954bCbeDfE0F6BE34DD1153A391E8083",
  pythContract: "0x5744Cbf430D99456a0A8771208b674F27f8EF0Fb",
  mockOracle: "0x82BF1C5516F6A91d4bF1E0aB62aF373dB049Df91",
  priceStaleThreshold: 60, // seconds
  
  // Controller contracts
  unitrollerProxy: "0xe797A0001A3bC1B2760a24c3D7FDD172906bCCd6",
  peridottrollerG7Impl: "0x3e1C0dd89FF970a4022C3d5F9189634FB02C064c",
  peridottrollerG7Proxy: "0xe797A0001A3bC1B2760a24c3D7FDD172906bCCd6", // Same as unitroller
  comptrollerOwner: "0xF450B38cccFdcfAD2f98f7E4bB533151a2fB00E9",
  
  // Interest rate model
  jumpRateModelV2: "0xf66037a2b7aDA645f22523E0dDb461c9012125d1",
  
  // pToken implementations and proxies
  pErc20DelegateImpl: "0x78B0f1E4ed8a17c7541EF954f046911E3E94566D",
  
  // pToken delegator proxies (main contracts to interact with)
  pPUSDDelegatorProxy: "0xEDdC65ECaF2e67c301a01fDc1da6805084f621D0",
  
  // pToken admin
  pTokenAdmin: "0x1804c8AB1F12E6bbf3894d4083f33e07309d1f38",
  
  // Underlying token contracts
  tokens: {
    PUSD: "0xa41D586530BC7BC872095950aE03a780d5114445", // PayPal USD
  },
  
  // Market mappings for easy access
  markets: {
    PUSD: {
      pToken: "0xEDdC65ECaF2e67c301a01fDc1da6805084f621D0",
      underlying: "0xa41D586530BC7BC872095950aE03a780d5114445",
      symbol: "pPUSD",
      name: "Peridot PUSD",
      decimals: 8,
      initialExchangeRateMantissa: "20000000000000000"
    }
  }
};

// Note: For chains not listed in Wormhole Connect's default mainnet/testnet configurations
// (e.g., potentially Soneium, IotaEVM depending on the exact name),
// you might need to provide additional chain configuration details to Wormhole Connect.
// Refer to Wormhole Connect and SDK documentation for adding custom chains. 

// Chain configuration mapping for easy access
export const chainConfigs = {
  arbitrumSepolia: arbitrumSepoliaContracts,
  baseSepolia: baseSepoliaContracts,
  iotaEVMTestnet: iotaEVMTestnetContracts,
  soneiumMainnet: soneiumMainnetContracts,
  soneiumMinatoTestnet: soneiumMinatoTestnetContracts,
  solanaTestnet: solanaTestnetContracts,
  monadTestnet: monadTestnetContracts,
  bscTestnet: bscTestnetContracts,
} as const;

// Helper function to get chain config by chain ID
export function getChainConfig(chainId: number) {
  return Object.values(chainConfigs).find(config => 'chainId' in config && config.chainId === chainId);
}

// Helper function to get chain config by name
export function getChainConfigByName(chainName: keyof typeof chainConfigs) {
  return chainConfigs[chainName];
}

// Export all chain IDs for easy reference
export const CHAIN_IDS = {
  ARBITRUM_SEPOLIA: 421614,
  BASE_SEPOLIA: 84532,
  IOTA_EVM_TESTNET: 1075,
  SONEIUM_MAINNET: 1868,
  SONEIUM_MINATO_TESTNET: 1946,
  MONAD_TESTNET: 10143,
  BSC_TESTNET: 97,
} as const; 
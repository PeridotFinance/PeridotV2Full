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
  chainNameReadable: "Solana Testnet",
  // chainId: ???, // Solana doesn't use numeric chain IDs in the same way as EVM
  prdtSplTokenMint: "9znRz6rDCxhE5nYGZqTwmLHKy2ycPxu2yE3S5k2qmvuR",
  prdtSplTokenAccount: "AiKy7k3zyMu5gJ7MobHTfjTZKEaajHHwKhyKZaeTUYea", // Associated Token Account for the PDA, for reference
  prdtNttManagerPda: "8WRCfaAMASji1kWKBe9VuYKJr4wNoVz8NYYRa6Nw5Efq", // This is likely the manager address for NTT

  // Placeholders for USDT on Solana Testnet - Please fill these in if available
  usdtSplTokenMint: "PLACEHOLDER_USDT_SPL_TOKEN_MINT_ON_SOLANA_TESTNET",
  usdtNttManagerPda: "PLACEHOLDER_USDT_NTT_MANAGER_PDA_ON_SOLANA_TESTNET",
};

// Note: For chains not listed in Wormhole Connect's default mainnet/testnet configurations
// (e.g., potentially Soneium, IotaEVM depending on the exact name),
// you might need to provide additional chain configuration details to Wormhole Connect.
// Refer to Wormhole Connect and SDK documentation for adding custom chains. 
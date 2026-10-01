import {
  ROBINHOOD_CHAIN_ID,
  ROBINHOOD_DEFAULT_RPC_URL,
  ROBINHOOD_EXPLORER_URL,
  ROBINHOOD_MARGIN,
  ROBINHOOD_TOKENS,
} from "./robinhood";

export const arbitrumSepoliaContracts = {
  chainNameWormhole: "ArbitrumSepolia", // Wormhole Connect specific chain name
  chainNameReadable: "Arbitrum Sepolia",
  chainId: 421614, // Standard chain ID for reference
  rpcUrl: "https://sepolia-rollup.arbitrum.io/rpc",
  // Axelar cross-chain spoke + tokens on Arbitrum Sepolia (source chain)
  // Per FRONTEND_INTEGRATION.md
  peridotSpoke: "0x367fe5290E85eE88288cc0C8Bd4f0B4696D603a7",

  // Minimal markets mapping for approvals on Arbitrum side
  markets: {
    AXL_WBNB: {
      underlying: "0x109E2C78C68F6388F6f50841C9A175BaC139B3d7",
      symbol: "WBNB",
      name: "Axelar WBNB (Source)",
      decimals: 18,
    },
    AXL_USDC: {
      underlying: "0xA2Ba06a76eC793d1Faf23Cc8220A887402b27331",
      symbol: "aUSDC",
      name: "Axelar aUSDC (Source)",
      decimals: 6,
    },
    AXL_WAVAX: {
      underlying: "0x12e5E00075acd8dBfa00576Da30ea81b8c3038a0",
      symbol: "WAVAX",
      name: "Axelar WAVAX (Source)",
      decimals: 18,
    },
  },
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
  rpcUrl: "https://sepolia.base.org",
  // Axelar cross-chain spoke + tokens on Base Sepolia (source chain)
  peridotSpoke: "0x5Ace095d973677e4e167B26832648cEd5d115B4b",
  // Minimal markets mapping for approvals on Base side
  markets: {
    AXL_WBNB: {
      underlying: "0xA9A2D8F279ABC436a18DBB1df3FB233039935D0A",
      symbol: "WBNB",
      name: "Axelar WBNB (Source)",
      decimals: 18,
    },
    AXL_USDC: {
      underlying: "0x254d06f33bDc5b8ee05b2ea472107E300226659A",
      symbol: "aUSDC",
      name: "Axelar aUSDC (Source)",
      decimals: 6,
    },
    AXL_WAVAX: {
      underlying: "0x2a87806561C550ba2dA9677c5323413E6e539740",
      symbol: "WAVAX",
      name: "Axelar WAVAX (Source)",
      decimals: 18,
    },
  },
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


export const somniaMainnetContracts = {
  chainNameWormhole: "Somnia",          // custom until Wormhole adds support
  chainNameReadable: "Somnia Mainnet",
  chainId: 1868,
  rpcUrl: "https://rpc.somnia.org/",
  explorer: "https://somnia.blockscout.com/",
  
  // Dual Investment contracts (Mainnet placeholders - update on deployment)
  dualInvestment: {
    erc1155DualPosition: "0x0000000000000000000000000000000000000000",
    vaultExecutor: "0x0000000000000000000000000000000000000000",
    settlementEngine: "0x0000000000000000000000000000000000000000",
    compoundBorrowRouter: "0x0000000000000000000000000000000000000000",
    riskGuard: "0x0000000000000000000000000000000000000000",
    managerImplementation: "0x0000000000000000000000000000000000000000",
    managerProxy: "0x0000000000000000000000000000000000000000",
  },
  peridotTokenSymbolP: "0x96650BebC549456F253974c11Fc6cBE28172A2d2",
  simplePriceOracle: "0x6D208789f0a978aF789A3C8Ba515749598940716",
  peridottrollerG7Impl: "0x93E175EB3E133AE0246Bd384f9cDbf651Fb9B516",
  peridottrollerG7Proxy: "0x86EA66356156d6F3BF66C531A25E661135F5D951",
  jumpRateModelV2: "0xc1306A30490C8566D09f617e85BB503B55B547eC",
  peridotHubLogic: "0x92Fa9A9A0CD6d78A15Bb6DBb67A17bb5C4C1120b",
  peridotHubProxy: "0x5800B480382e23cbe3553590169b78A42809D22c",
};

// Robinhood Chain hosts the NVDA/USDG isolated-margin product, not a Peridot
// lending pool: its two boosted markets (pUSDG, pNVDA) exist only as margin
// collateral and position legs, so `markets` stays empty and the chain is
// neither a hub nor a spoke. Everything the margin UI needs is in
// config/robinhood.ts; this entry exists so chain-keyed helpers
// (getChainConfig, wallet balance scans, explorers) know the chain.
export const robinhoodMainnetContracts = {
  chainNameWormhole: "Robinhood", // no Wormhole route; label only
  chainNameReadable: "Robinhood Chain",
  chainId: ROBINHOOD_CHAIN_ID,
  rpcUrl: ROBINHOOD_DEFAULT_RPC_URL,
  explorer: ROBINHOOD_EXPLORER_URL,
  peridotSpoke: null,
  markets: {},
  tokens: ROBINHOOD_TOKENS,
  margin: ROBINHOOD_MARGIN,
} as const;

export const somniaTestnetContracts = {
  chainNameWormhole: "SomniaTestnet",    // distinct label; still custom
  chainNameReadable: "Somnia Testnet",
  chainId: 50312,
  rpcUrl: "https://dream-rpc.somnia.network/",
  explorer: "https://shannon-explorer.somnia.network/",
  
  // Core contracts (updated with user-provided addresses)
  peridotToken: "0xB911C192ed1d6428A12F2Cf8F636B00c34e68a2a", // $P
  oracle: "0xa41D586530BC7BC872095950aE03a780d5114445", // DiaOracle
  peridottrollerG7Impl: "0xC4FE7BD6b9EdD67bF2ba5daa317D7cd80E1913bb", // PeridottrollerG7 (Implementation)
  jumpRateModelV2: "0x60a8BD81f90526560344C63279210BC067a489a5", // JumpRateModelV2
  
  // Controller contracts
  // NOTE: Somnia uses the implementation directly (no proxy pattern)
  // Both proxy fields point to the implementation address for direct calls
  unitrollerProxy: "0xC4FE7BD6b9EdD67bF2ba5daa317D7cd80E1913bb", // Using implementation directly
  peridottrollerG7Proxy: "0xC4FE7BD6b9EdD67bF2ba5daa317D7cd80E1913bb", // Same as unitroller (implementation address)
  
  // pToken implementations and proxies
  pErc20DelegateImpl: "0xf66037a2b7aDA645f22523E0dDb461c9012125d1",
  
  // pToken delegator proxies (main contracts to interact with)
  pWETHDelegatorProxy: "0x7b677747d8d8069d82AEC1e70263C3c2CeC39074", // pWETH
  pUSDCDelegatorProxy: "0xBFCB07d4279cAb8Bd81bdDCD49aE005F8514AceC", // pUSDC
  pUSDTDelegatorProxy: "0xFaF7b3d46Ffd22129A0792859026965826386D23", // pUSDT
  pSOMDelegatorProxy: "0xA72b43Bd60E5a9a13B99d0bDbEd36a9041269246", // Placeholder - needs actual pSOM address
  
  // pToken delegate implementations
  pWETHDelegate: "0x0000000000000000000000000000000000000000", // Placeholder
  pUSDCDelegate: "0x0000000000000000000000000000000000000000", // Placeholder
  pUSDTDelegate: "0x0000000000000000000000000000000000000000", // Placeholder
  pSOMDelegate: "0x0000000000000000000000000000000000000000", // Placeholder
  
  // Underlying token contracts
  tokens: {
    WETH: "0xd2480162Aa7F02Ead7BF4C127465446150D58452",
    USDC: "0xE9CC37904875B459Fa5D0FE37680d36F1ED55e38",
    USDT: "0xa568bD70068A940910d04117c36Ab1A0225FD140", // USDT (18 decimals)
    SOM: "0xB911C192ed1d6428A12F2Cf8F636B00c34e68a2a", // Native Somnia token
  },
  
  // Markets configuration
  markets: {
    WETH: {
      pToken: "0x7b677747d8d8069d82AEC1e70263C3c2CeC39074", // pWETH
      underlying: "0xd2480162Aa7F02Ead7BF4C127465446150D58452", // WETH
      symbol: "pWETH",
      name: "Peridot WETH",
      decimals: 18,
    },
    USDC: {
      pToken: "0xBFCB07d4279cAb8Bd81bdDCD49aE005F8514AceC", // pUSDC
      underlying: "0xE9CC37904875B459Fa5D0FE37680d36F1ED55e38", // USDC
      symbol: "pUSDC",
      name: "Peridot USDC",
      decimals: 6,
    },
    USDT: {
      pToken: "0xFaF7b3d46Ffd22129A0792859026965826386D23", // pUSDT
      underlying: "0xa568bD70068A940910d04117c36Ab1A0225FD140", // USDT (18 decimals)
      symbol: "pUSDT",
      name: "Peridot USDT",
      decimals: 18,
    },
    SOM: {
      pToken: "0xA72b43Bd60E5a9a13B99d0bDbEd36a9041269246", // Using PEther temporarily for SOMI
      underlying: "0x0000000000000000000000000000000000000000", // Zero address for native token
      symbol: "pSOM",
      name: "Peridot SOM",
      decimals: 18,
      isNative: true, // Key flag for native token handling
    },
  },

  // Legacy fields for compatibility
  pEther: "0xA72b43Bd60E5a9a13B99d0bDbEd36a9041269246", // PEther (Somnia) - for WETH
  pSOM: "0xA72b43Bd60E5a9a13B99d0bDbEd36a9041269246", // Using PEther temporarily for SOMI
  weth: "0xd2480162Aa7F02Ead7BF4C127465446150D58452", // WETH (18 decimals)
  usdc: "0xE9CC37904875B459Fa5D0FE37680d36F1ED55e38", // USDC (6 decimals)
  pErc20DelegatorProxy: "0x1DCb19949fC0a68cbdAa53Cce898B60D7436b14F",
};

// Stellar Soroban (MAINNET) – production lending markets on Stellar.
// Launch surface per audited deployment: XLM, USDC, EURC core lending only.
// Soroswap/DeFIndex vaults and Aquarius router are intentionally NOT wired
// into the lending UI — kept here as reference for future swap-adapter work.
export const stellarSorobanMainnetContracts = {
  chainNameReadable: "Stellar Soroban Mainnet",
  // Primary + fallbacks, consumed through `lib/stellar-rpc.ts`, which fails
  // over on transport errors. The old default was an Alchemy URL with the
  // key committed in this file; once its monthly cap was hit every Soroban
  // read in the app returned 0 with no error anywhere. A paid endpoint goes
  // in NEXT_PUBLIC_STELLAR_MAINNET_RPC_URL; the public ones stay as backup.
  rpcUrl:
    process.env.NEXT_PUBLIC_STELLAR_MAINNET_RPC_URL ||
    "https://mainnet.sorobanrpc.com",
  // Spread across independent operators, best first. These are shared public
  // endpoints, so the budget that matters is requests per burst, not per month:
  // onfinality allows one request per second and goes last for that reason.
  // All of them must also appear in the nginx CSP `connect-src`.
  rpcFallbackUrls: [
    "https://mainnet.sorobanrpc.com",
    "https://soroban-rpc.mainnet.stellar.gateway.fm",
    "https://soroban-rpc.creit.tech",
    "https://rpc.ankr.com/stellar_soroban",
    "https://stellar.api.onfinality.io/public",
  ],
  networkPassphrase:
    process.env.NEXT_PUBLIC_STELLAR_MAINNET_NETWORK_PASSPHRASE ||
    "Public Global Stellar Network ; September 2015",

  controller: "CCVUFGXKFVPAHWMMDDL6HXKUN2B2G73Z27VRM3WXZBBSQEUTNLI6YPEX",
  oracle: "CAFJZQWSED6YAWZU3GWRTOCNPPCGBN32L7QV43XX5LZLFTK6JLN34DLN",
  peridotToken: "CDNJSOJKURHQUDBO7OHK7Z64R2CNMIAWXENHM24ALK7Y3H56EU6PUOKR",
  jumpRateModelVolatile: "CCPJFBH5WSNZVMCUQCBM4X5334L6ZL3W4Q33XJAK45RCDHJ2JGJ5AP6A", // XLM
  jumpRateModelStable: "CCI5LBBNYOASPQ62GIRY54PDEYWWURJB75HNRAFOU4LTOU3XBC73IB5I",   // USDC + EURC

  // Underlying Stellar Asset Contracts (SACs) used by the vaults.
  tokens: {
    XLM: "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA",
    USDC: "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75",
    EURC: "CDTKPWPLOURQA2SGTKTUQOWRCBZEORB4BWBOMJ3D3ZTQQSGE5F6JBQLV",
  },

  // Classic Stellar Asset codes (Issuer-Code form) for Horizon/trustline reads.
  // NOT used for Soroban contract calls — those use the SAC IDs in `tokens`.
  classicAssets: {
    USDC: { code: "USDC", issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN" },
    EURC: { code: "EURC", issuer: "GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2" },
  },

  // ReceiptVault markets — all 7-decimal underlying assets on Stellar mainnet.
  markets: {
    XLM: {
      vaultId: "CBU4Y7CJFOUZZE3QBOXTKM54UTUYW3SDJWTNMDGJBNCR5HS5UCEKV3BE",
      underlying: "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA",
      symbol: "XLM",
      name: "Peridot XLM",
      decimals: 7,
      collateralFactor: BigInt(700000), // scaled by 1e6 → 0.70
      rateModel: "CCPJFBH5WSNZVMCUQCBM4X5334L6ZL3W4Q33XJAK45RCDHJ2JGJ5AP6A",
      boostedVault: "CCB2AR5X3KP4WQKE7HNSUSDS7SHFMC2WPVSZ2ZXJ6DHXOKHFFKOZE6GK",
    },
    USDC: {
      vaultId: "CBVUJJIJTRJNOORPPCVH72DP7YDCOMDHI6WYKP3WOFVEPSCVP3TBXHIN",
      underlying: "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75",
      symbol: "USDC",
      name: "Peridot USDC",
      decimals: 7,
      collateralFactor: BigInt(900000), // 0.90
      rateModel: "CCI5LBBNYOASPQ62GIRY54PDEYWWURJB75HNRAFOU4LTOU3XBC73IB5I",
      // DeFindex vault that the ReceiptVault forwards idle underlying into for
      // additional yield. Strategy: usdc_blend_autocompound_fixed.
      boostedVault: "CAB4JOLSCNELJVDQKZLVGHKWJCLXFDBZZMITJAFL4GBGTHIKWO47PYFH",
    },
    EURC: {
      vaultId: "CD3WN3PLW63HFZXE56OTRLMBV46WG54TFPGRL4RDQ43HQTTWVB4RPO3G",
      underlying: "CDTKPWPLOURQA2SGTKTUQOWRCBZEORB4BWBOMJ3D3ZTQQSGE5F6JBQLV",
      symbol: "EURC",
      name: "Peridot EURC",
      decimals: 7,
      collateralFactor: BigInt(900000), // 0.90
      rateModel: "CCI5LBBNYOASPQ62GIRY54PDEYWWURJB75HNRAFOU4LTOU3XBC73IB5I",
      boostedVault: "CBP2R5KYAWJCOCVDTSNTEVL3O6JBTWOOH7SZOX7DX5DLGVZCAMLBDZM3",
    },
  },

  // Out-of-launch-scope adapters kept for reference — NOT wired into lending UI.
  external: {
    soroswapDefindexUsdcVault: "CA2FIPJ7U6BG3N7EOZFI74XPJZOEOD4TYWXFVCIO5VDCHTVAGS6F4UKK",
    soroswapDefindexEurcVault: "CCKTLDG6I2MMJCKFWXXBXMA42LJ3XN2IOW6M7TK6EWNPJTS736ETFF2N",
    aquariusRouter: "CBQDHNBFBZYE4MKPWBSJOPIYLW4SFSXAXUTSXJN76GNKYVYPCKWC6QUK",
  },
} as const;

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
  oracle: "0x023C03e97a685F5196d9616A1BbC00bBe148B969",
  
  // Controller contracts
  unitrollerProxy: "0xa41D586530BC7BC872095950aE03a780d5114445",
  peridottrollerG7Impl: "0xf79b3af6954bCbeDfE0F6BE34DD1153A391E8083",
  peridottrollerG7Proxy: "0xa41D586530BC7BC872095950aE03a780d5114445", // Same as unitroller
  
  // Interest rate model
  jumpRateModelV2: "0x2d271dEb2596d78aaa2551695Ebfa9Cd440713aC",
  
  // pToken implementations and proxies
  pErc20DelegateImpl: "0xECdF5834016e605d9E6Ff36bd2a1e3f7f189A140",
  
  // pToken delegator proxies (main contracts to interact with)
  pUSDCDelegatorProxy: "0xA72b43Bd60E5a9a13B99d0bDbEd36a9041269246",
  pWMONDelegatorProxy: "0x8b5055bff2f35FE6d4C84585901A4FeF9803aabe",
  pUSDTDelegatorProxy: "0xa568bD70068A940910d04117c36Ab1A0225FD140",
  pLINKDelegatorProxy: "0x06827a2dB9047219b3989E926e811808233C95AC",
  pPDTDelegatorProxy: "0xF73e2d1B5C7fe43351212f6559DabB32da71F237",
  pPUSDDelegatorProxy: "0x06A08324a1bDa9a89aa8C4E81D6529F583beff1e",
  prUSDCDelegatorProxy: "0xD2d72FdBCbd7C89a4dCA2c9516e5Cb54F76b808b",
  pgMONDelegatorProxy: "0x0A33eFCb5E2436e386bBFd377ee5c430132Dad40",
  
  // pToken delegate implementations
  pUSDCDelegate: "0xAb39F3822a1e71505c23334e9C8933e061806385", // Placeholder
  pWMONDelegate: "0x72ca55dF01A84a78c24D07Aea3eEc857FA5fdcc8",
  pUSDTDelegate: "0xEDdC65ECaF2e67c301a01fDc1da6805084f621D0",
  pLINKDelegate: "0x58Ca60610Bf8962d01fc275452F5fA9179940CC9",
  pPDTDelegate: "0xaCD0736723BE61f223Ffa37077f2dec0Fb8ceDBC",
  pPUSDDelegate: "0xAb39F3822a1e71505c23334e9C8933e061806385",
  prUSDCDelegate: "0x887C4A5D984B472CdDa699F1b5158D5f217b54Aa",
  pgMONDelegate: "0x37F4061480c00AaCc4721E9EbE20D1cCE3DD6AEB",
  
  // Underlying token contracts - moving these into the markets object
  // to ensure they are picked up by the verifier.
  tokens: {
    LINK: "0x6fE981Dbd557f81ff66836af0932cba535Cbc343",
    WMON: "0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701",
    USDC: "0xf817257fed379853cDe0fa4F97AB987181B1E5Ea",
    USDT: "0x88b8E2161DEDC77EF4ab7585569D2415a1C1055D",
    WBTC: "0xcf5a6076cfa32686c0Df13aBaDa2b40dec133F1d",
    WETH: "0xB5a30b0FDc5EA94A52fDc42e3E9760Cb8449Fb37",
    PDT: "0x28fE679719e740D15FC60325416bB43eAc50cD15",
    PUSD: "0xc55c86ef14Dc7A058895659CC11c97C344bF6e7B",
    rUSDC: "0x400A417fEDEef43Fc5b8be0D8cD6DF687847Ee8D",
    pgMON: "0xaEef2f6B429Cb59C9B2D7bB2141ADa993E8571c3"
  },
  
  // Market mappings for easy access
  markets: {
    USDC: {
      pToken: "0xA72b43Bd60E5a9a13B99d0bDbEd36a9041269246",
      underlying: "0xf817257fed379853cDe0fa4F97AB987181B1E5Ea",
      symbol: "pUSDC",
      name: "Peridot USDC",
      decimals: 6,
    },
    WMON: {
      pToken: "0x8b5055bff2f35FE6d4C84585901A4FeF9803aabe",
      underlying: "0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701",
      symbol: "pWMON",
      name: "Peridot WMON",
      decimals: 18,
    },
    USDT: {
      pToken: "0xa568bD70068A940910d04117c36Ab1A0225FD140",
      underlying: "0x88b8E2161DEDC77EF4ab7585569D2415a1C1055D",
      symbol: "pUSDT",
      name: "Peridot USDT",
      decimals: 6,
    },
    LINK: {
      pToken: "0x06827a2dB9047219b3989E926e811808233C95AC",
      underlying: "0x6fE981Dbd557f81ff66836af0932cba535Cbc343",
      symbol: "pLINK",
      name: "Peridot LINK",
      decimals: 18,
    },
    PDT: {
      pToken: "0xF73e2d1B5C7fe43351212f6559DabB32da71F237", // Using peridotToken address as placeholder
      underlying: "0x28fE679719e740D15FC60325416bB43eAc50cD15",
      symbol: "pPDT",
      name: "Peridot PDT",
      decimals: 18,
    },
    WETH: {
      pToken: "0xd3167fBADd8Eac1b1b60A5adfCF504d15dC56005",
      underlying: "0xB5a30b0FDc5EA94A52fDc42e3E9760Cb8449Fb37",
      symbol: "pWETH",
      name: "Peridot WETH",
      decimals: 18,
    },
    WBTC: {
      pToken: "0x8f11d42EeaA6B454A040c2390501AFE16D150eB4",
      underlying: "0xcf5a6076cfa32686c0Df13aBaDa2b40dec133F1d",
      symbol: "pWBTC",
      name: "Peridot WBTC",
      decimals: 8,
    },
    PUSD: {
      pToken: "0x06A08324a1bDa9a89aa8C4E81D6529F583beff1e",
      underlying: "0xc55c86ef14Dc7A058895659CC11c97C344bF6e7B",
      symbol: "pPUSD",
      name: "Peridot PUSD",
      decimals: 18,
    },
    rUSDC: {
      pToken: "0xD2d72FdBCbd7C89a4dCA2c9516e5Cb54F76b808b",
      underlying: "0x400A417fEDEef43Fc5b8be0D8cD6DF687847Ee8D",
      symbol: "prUSDC",
      name: "Relend USDC",
      decimals: 6,
    },
    gMON: {
      pToken: "0x0A33eFCb5E2436e386bBFd377ee5c430132Dad40",
      underlying: "0xaEef2f6B429Cb59C9B2D7bB2141ADa993E8571c3",
      symbol: "pgMON",
      name: "Magma MONAD",
      decimals: 18,
    },
  }
};

export const monadMainnetContracts = {
  chainNameWormhole: "Monad",
  chainNameReadable: "Monad Mainnet",
  chainId: 143,
  rpcUrl: process.env.NEXT_PUBLIC_RPC_MONAD_MAINNET || "https://rpc3.monad.xyz",
  explorer: "https://monadvision.com/",

  // Core contracts
  peridotTokenSymbolP: "0x96650BebC549456F253974c11Fc6cBE28172A2d2",
  
  // Oracles
  simplePriceOracle: "0x5800B480382e23cbe3553590169b78A42809D22c",
  hybridOracle: "0x5800B480382e23cbe3553590169b78A42809D22c",
  oracle: "0x5800B480382e23cbe3553590169b78A42809D22c",


  // Controller contracts
  peridottrollerG7Impl: "0x81C0533c8132Bc20c3A53f599925AB01c7dA2B3A",
  peridottrollerG7Proxy: "0x6D208789f0a978aF789A3C8Ba515749598940716",
  unitrollerProxy: "0x6D208789f0a978aF789A3C8Ba515749598940716",

  // Interest rate model
  jumpRateModelV2: "0x1FB287E1c4F7B4c6b511f4d190523814593Ad84e",

  // pToken implementations (PErc20Delegate)
  pAUSDDelegate: "0xf4C857c0c04E551d062254AAf6EB0dE8748756df",
  pUSDCDelegate: "0xcc63D360305c43DB30CE27365cCF76b0F08f3B07",
  pUSDCBoostedDelegate: "0x737DAEF1e65712C544b50320D12F89e3f0Ab6423",
  pEarnAUSDDelegate: "0xF80E3d43CE1d3cbe340Ec17c90355965b99a2f4E",
  pgMONDelegate: "0x520b703fb54e4111187962EC4B540F27Ecd16723",
  pMagmaBoostedDelegate: "0xA6fdD71773AA01eF007fbFBe263D1170CCd4e812",

  // Delegator proxies (PErc20Delegator)
  pAUSDDelegatorProxy: "0x5b5397d6EB59bB23e300e7559f07e04778fa930c",
  pUSDCDelegatorProxy: "0xc37f3869720B672addFE5F9E22a9459e0E851372",
  pUSDCBoostedDelegatorProxy: "0x085FbF880F88f861B8A09e6aaB1E4618d79Ba1D4",
  pEarnAUSDDelegatorProxy: "0x02aD5b78c7e2aB317BA991E6607C4A38eEA10f06",
  pgMONDelegatorProxy: "0xA5a7f20604130a715815F4a6769bcF71366cAcB4",
  pMagmaBoostedDelegatorProxy: "0xaf4aa7870954112ff86ff59f409DF36A4C8f4112",

  // Underlying tokens
  tokens: {
    USDC: "0x754704Bc059F8C67012fEd69BC8A327a5aafb603",
    AUSD: "0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a", 
    earnAUSD: "0x103222f020e98Bba0AD9809A011FDF8e6F067496", 
    gMON: "0x8498312A6B3CbD158bf0c93AbdCF29E6e4F55081",
    MON: "0x0000000000000000000000000000000000000000", // Zero address for native token
    WMON: "0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A",
  },

  // Markets
  markets: {
    USDC: {
      pToken: "0xc37f3869720B672addFE5F9E22a9459e0E851372",
      underlying: "0x754704Bc059F8C67012fEd69BC8A327a5aafb603",
      symbol: "pUSDC",
      name: "Peridot USDC",
      decimals: 6,
    },
    AUSD: {
      pToken: "0x5b5397d6EB59bB23e300e7559f07e04778fa930c",
      underlying: "0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a", 
      symbol: "pAUSD",
      name: "Peridot AUSD",
      decimals: 6,
    },
    earnAUSD: {
      pToken: "0x02aD5b78c7e2aB317BA991E6607C4A38eEA10f06",
      underlying: "0x103222f020e98Bba0AD9809A011FDF8e6F067496",
      symbol: "pearnAUSD",
      name: "Peridot Earn AUSD",
      decimals: 6,
    },
    gMON: {
      pToken: "0xA5a7f20604130a715815F4a6769bcF71366cAcB4",
      underlying: "0x8498312A6B3CbD158bf0c93AbdCF29E6e4F55081",
      symbol: "pgMON",
      name: "Magma MONAD",
      decimals: 18,
    },
    MON: {
      pToken: "0x2FB2861402A22244464435773dd1C6951735CdF7", // PEther (Monad)
      underlying: "0x0000000000000000000000000000000000000000", // Zero address for native
      symbol: "pMON",
      name: "Peridot MON",
      decimals: 18,
      isNative: true, // CRITICAL: This flag enables native token handling
    },
    MAGMA_BOOSTED_WMON: {
      pToken: "0xaf4aa7870954112ff86ff59f409DF36A4C8f4112",
      underlying: "0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A",
      symbol: "pWMON",
      name: "Magma Boosted WMON",
      decimals: 18,
      isBoosted: true,
      boostedType: "magma",
    },
    // Boosted Markets (Monad Mainnet)
    MORPHO_BOOSTED_AUSD: {
      pToken: "0x4dd205ffc43627629B80A5FAC6feE421f3070ea9",
      underlying: "0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a", // AUSD
      symbol: "pAUSD",
      name: "Morpho Boosted AUSD",
      decimals: 6,
      isBoosted: true,
      boostedType: "morpho",
      vaultAddress: "0xbeeffeA75cFC4128ebe10C8D7aE22016D215060D",
    },
    MORPHO_BOOSTED_USDC: {
      pToken: "0x085FbF880F88f861B8A09e6aaB1E4618d79Ba1D4",
      underlying: "0x754704Bc059F8C67012fEd69BC8A327a5aafb603", // USDC
      symbol: "pUSDC",
      name: "Morpho Boosted USDC",
      decimals: 6,
      isBoosted: true,
      boostedType: "morpho",
      vaultAddress: "0xbeEFf443C3CbA3E369DA795002243BeaC311aB83", 
    },
    PANCAKE_BOOSTED_LP_AUSD_USDC: {
      pToken: "0x76d0A860e020f99b68d36adA91f2ab143db4ABf1",
      underlying: "0x26043eE1E8Fa30FA7e0fF9afC02135ab71c20339", // V3LPVault4626
      symbol: "pLP-AUSD/USDC",
      name: "Pancake V3 LP Boosted AUSD/USDC",
      decimals: 18,
      isBoosted: true,
      boostedType: "lp",
      vaultAddress: "0x26043eE1E8Fa30FA7e0fF9afC02135ab71c20339",
      oracleAddress: "0x06624E8d03A13F28828b8523bACa9568D154044E",
      poolAddress: "0xE84765B4e2634f3bD8a91c89e432F6B81f0647Bc",
      underlyingTokens: [
        "0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a", // AUSD
        "0x754704Bc059F8C67012fEd69BC8A327a5aafb603", // USDC
      ],
    },
  },
};

export const bscTestnetContracts = {
  chainNameWormhole: "BSCTestnet",
  chainNameReadable: "BSC Testnet",
  chainId: 97, // BSC Testnet chain ID
  rpcUrl: "https://data-seed-prebsc-1-s1.binance.org:8545/",
  explorer: "https://testnet.bscscan.com/",
  
  // Core contracts
  peridotToken: "0x5A5063a749fCF050CE58Cae6bB76A29bb37BA4Ed",
  
  // Dual Investment contracts (Testnet)
  dualInvestment: {
    erc1155DualPosition: "0x62E2A9de47c6df9E1e23bDB47fB4Abb177E0992B",
    vaultExecutor: "0x419e2b8F3333E3fb8fCB5b8D6902f1bE3Ae0Ba4F",
    settlementEngine: "0x9AFb26e5F7337D95c6E11b3e3b32f0ce8AEbC147",
    compoundBorrowRouter: "0xC0062533E7d52388b8A5BC22F52A8E8Ea54DFa94",
    riskGuard: "0x4d6973E4f4e968D86290e1c750Ee0eF4C2eB8054",
    managerImplementation: "0xBC382B5fE68A6BcaBCF32000C8F61ce5d89adAD6",
    managerProxy: "0xcf0fE6c3ECd1f6d4c0BF8B361e6D262a8902Bd34",
  },
  // Oracle contracts
  oracle: "0xBfEaDDA58d0583f33309AdE83F35A680824E397f",
  pythContract: "0x5744Cbf430D99456a0A8771208b674F27f8EF0Fb",
  priceStaleThreshold: 60, // seconds
  
  // Controller contracts
  unitrollerProxy: "0xe8F09917d56Cc5B634f4DE091A2c82189dc41b54",
  peridottrollerG7Impl: "0x699A3c45249C7D3b742B025BB57a1aAee3e34EF8",
  peridottrollerG7Proxy: "0xe8F09917d56Cc5B634f4DE091A2c82189dc41b54", // Same as unitroller
  comptrollerOwner: "0xF450B38cccFdcfAD2f98f7E4bB533151a2fB00E9",
  
  // Interest rate model
  jumpRateModelV2: "0xE83d1578AAD5E7DeA8cDcb73FD83dEcfD35C70b4",
  
  // pToken implementations and proxies
  pErc20DelegateImpl: "0x78B0f1E4ed8a17c7541EF954f046911E3E94566D",
  
  // pToken delegator proxies (main contracts to interact with)
  
  
  // pToken admin
  pTokenAdmin: "0x1804c8AB1F12E6bbf3894d4083f33e07309d1f38",
  
  // Underlying token contracts
  tokens: {
    LINK: "0x84b9B910527Ad5C03A9Ca831909E21e236EA7b06",
    BTCB: "0x6ce8dA28E2f864420840cF74474eFf5fD80E65B8",
    PDT: "0x5A5063a749fCF050CE58Cae6bB76A29bb37BA4Ed",
    USDC: "0x64544969ed7EBf5f083679233325356EbE738930",
    USDT: "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd",
    AXL_WBNB: "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd",
    AXL_USDC: "0xc2fA98faB811B785b81c64Ac875b31CC9E40F9D2",
    AXL_WAVAX: "0x1B29EC62efC689c462b4E0512457175793cEc9e6",
  },


  pLINKDelegatorProxy: "0x06827a2dB9047219b3989E926e811808233C95AC",
  pPDTDelegatorProxy: "0xF73e2d1B5C7fe43351212f6559DabB32da71F237",
  pWBTCDelegatorProxy: "0x06A08324a1bDa9a89aa8C4E81D6529F583beff1e",
  pUSDTDelegatorProxy: "0xC4FE7BD6b9EdD67bF2ba5daa317D7cd80E1913bb",
  pUSDCDelegatorProxy: "0xF0a6303cA0A99d9235979b317E3a78083162a88B",
  
  
  // pToken delegate implementations
  pLINKDelegate: "0x58Ca60610Bf8962d01fc275452F5fA9179940CC9",
  pPDTDelegate: "0xaCD0736723BE61f223Ffa37077f2dec0Fb8ceDBC",
  pWBTCDelegate: "0x887C4A5D984B472CdDa699F1b5158D5f217b54Aa",
  pUSDTDelegate: "0x77ddA1A85cA5058dd4563853fc69d8Da805Da1EB",
  pUSDCDelegate: "0x4a90b754BbB14a74Dc00CFC4c11c3784B0E644B5",
  
  
  // Market mappings for easy access
  markets: {
    LINK: {
      pToken: "0xfB68C6469A67873f7FA2Df6CeAcC5da12abF6c8c",
      underlying: "0x84b9B910527Ad5C03A9Ca831909E21e236EA7b06",
      symbol: "pLINK",
      name: "Peridot LINK",
      decimals: 18,
    },
    AXL_WBNB: {
      pToken: "0xB3bA5A82263728c0128649BBeF634f64c2865F86",
      underlying: "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd",
      symbol: "pWBNB",
      name: "Axelar WBNB",
      decimals: 18,
    },
    BNB: {
      // Native BNB market (PEther-style). Treat as native for deposit/withdraw.
      pToken: "0xa568bD70068A940910d04117c36Ab1A0225FD140",
      symbol: "pBNB",
      name: "Peridot BNB",
      decimals: 18,
      isNative: true as any,
    },
    AXL_USDC: {
      pToken: "0x9f048D221cC49e9C6f9C05D3EC670148108A0A01",
      underlying: "0xc2fA98faB811B785b81c64Ac875b31CC9E40F9D2",
      symbol: "paUSDC",
      name: "Axelar aUSDC",
      decimals: 6,
    },
    AXL_WAVAX: {
      pToken: "0xcb27822678e02005CD4fce6eb3Cd27180289E041",
      underlying: "0x1B29EC62efC689c462b4E0512457175793cEc9e6",
      symbol: "pWAVAX",
      name: "Axelar WAVAX",
      decimals: 18,
    },
    PDT: {
      pToken: "0x342c7E29919429c6A708E10AeF42706ef211B4B6", // Using peridotToken address as placeholder
      underlying: "0x5A5063a749fCF050CE58Cae6bB76A29bb37BA4Ed",
      symbol: "pPDT",
      name: "Peridot PDT",
      decimals: 18,
      initialExchangeRateMantissa: "20000000000000000"
    },
    BTCB: {
      pToken: "0x08eD77C8A3A48c03fE38A4AdEC2F4204Cf4Fbf1F",
      underlying: "0x6ce8dA28E2f864420840cF74474eFf5fD80E65B8",
      symbol: "pBTCB",
      name: "Bitcoin Binance",
      decimals: 18,
    },
    USDC: {
      pToken: "0xF0a6303cA0A99d9235979b317E3a78083162a88B",
      underlying: "0x64544969ed7EBf5f083679233325356EbE738930",
      symbol: "pUSDC",
      name: "Peridot USDC",
      decimals: 18,
    },
    USDT: {
      pToken: "0xC4FE7BD6b9EdD67bF2ba5daa317D7cd80E1913bb",
      underlying: "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd",
      symbol: "pUSDT",
      name: "Peridot USDT",
      decimals: 18,
    },
  }
};

export const ethereumMainnetContracts = {
  chainNameWormhole: "Ethereum",
  chainNameReadable: "Ethereum Mainnet",
  chainId: 1,
  // Must be CORS-friendly and present in the nginx CSP connect-src, or the
  // native-balance fetches (useMultiChainBalance) throw "Failed to fetch" for
  // Ethereum. LlamaRPC used to sit here and now serves 521. Env override
  // available, matching the pattern of the other spoke chains.
  rpcUrl: process.env.NEXT_PUBLIC_RPC_ETHEREUM_MAINNET || "https://ethereum.drpc.org",
  explorer: "https://etherscan.io/",

  // Core tokens
  peridotTokenSymbolP: "0x96650BebC549456F253974c11Fc6cBE28172A2d2",

  // Oracles
  simplePriceOracle: "0x42D5B37CD3682eDD0a3dBb242C579bDCB108f47C",
  oracle: "0x42D5B37CD3682eDD0a3dBb242C579bDCB108f47C",

  // Controller contracts
  peridottrollerG7Impl: "0x7e2A23fDEe775CB8e03f29E62278a457ff928d0F",
  peridottrollerG7Proxy: "0x6fC0c15531CB5901ac72aB3CFCd9dF6E99552e14",
  unitrollerProxy: "0x6fC0c15531CB5901ac72aB3CFCd9dF6E99552e14",

  // Interest rate model
  jumpRateModelV2: "0x8334A3ec5c9Cf105E57B8b4B68386B8A8043DD36",

  // pToken implementations and proxies
  pWETHDelegate: "0x5b5397d6EB59bB23e300e7559f07e04778fa930c",
  pUSDCDelegate: "0x2337b591f5A98A1232d89E4f682077b3960Ad17A",
  pWBNBDelegate: "0x47470B4af6c387F5993f0c7600f70B0F90787317",
  pUSDTDelegate: "0xcc63D360305c43DB30CE27365cCF76b0F08f3B07",
  pWBTCDelegate: "0xc00B22114ab51e594c2a5C190cB7EcE13C09f3a2",
  pAUSDDelegate: "0xD5c4080a60E244ee3CC36Cf4161aCfE460D255a4",
  pCAKEDelegate: "0xDa205725f210261a97E1d412aB6FEb518db52C27",
  pASTERDelegate: "0xd7B1D615526CC897883AFC646F609d5C126804dc",
  pDOGEDelegate: "0x486bb6efC9476Faf6740e26224F05093E2f0E4cd",

  // Delegator proxies (use these to interact)
  pWETHDelegatorProxy: "0x28E4F2Bb64ac79500ec3CAa074A3C30721B6bC84",
  pUSDCDelegatorProxy: "0x1A726369Bfc60198A0ce19C66726C8046c0eC17e",
  pWBNBDelegatorProxy: "0xD9fDF5E2c7a2e7916E7f10Da276D95d4daC5a3c3",
  pUSDTDelegatorProxy: "0xc37f3869720B672addFE5F9E22a9459e0E851372",
  pWBTCDelegatorProxy: "0xdCAbDc1F0B5e603b9191be044a912A8A2949e212",
  pAUSDDelegatorProxy: "0x7A9940B77c0B6DFCcA2028b9F3CCa88E5DC36ebb",
  pCAKEDelegatorProxy: "0x8D31F6b1D8076f13B6A04a977F5919f6EF21eC6E",
  pASTERDelegatorProxy: "0x5c013C8Ee5B99fAaD3Af336E9142451F89eF7774",
  pDOGEDelegatorProxy: "0x66468B168Ea8289982EBEd6617dFCFA981d1EF0C",

  // Underlying token contracts
  tokens: {
    WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    WBTC: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599",
    USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    WBNB: "0x418d75f65a02b3d53b2418fb8e1fe493759c7605",
    DAI: "0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3",
    USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    CAKE: "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82",
    ASTER: "0x000Ae314E2A2172a039B26378814C252734f556A",
    DOGE: "0xba2ae424d960c26247dd6c32edc70b295c744c43",
  },

  // Market mappings for easy access
  markets: {
    WETH: {
      pToken: "0x28E4F2Bb64ac79500ec3CAa074A3C30721B6bC84",
      underlying: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      symbol: "pWETH",
      name: "Peridot WETH",
      decimals: 18,
    },
    USDC: {
      pToken: "0x1A726369Bfc60198A0ce19C66726C8046c0eC17e",
      underlying: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      symbol: "pUSDC",
      name: "Peridot USDC",
      decimals: 6,
    },
    WBNB: {
      pToken: "0xD9fDF5E2c7a2e7916E7f10Da276D95d4daC5a3c3",
      underlying: "0x418d75f65a02b3d53b2418fb8e1fe493759c7605",
      symbol: "pWBNB",
      name: "Peridot WBNB",
      decimals: 18,
    },
    USDT: {
      pToken: "0xc37f3869720B672addFE5F9E22a9459e0E851372",
      underlying: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      symbol: "pUSDT",
      name: "Peridot USDT",
      decimals: 6,
    },
    WBTC: {
      pToken: "0xdCAbDc1F0B5e603b9191be044a912A8A2949e212",
      underlying: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599",
      symbol: "pWBTC",
      name: "Peridot WBTC",
      decimals: 8,
    },
    AUSD: {
      pToken: "0x7A9940B77c0B6DFCcA2028b9F3CCa88E5DC36ebb",
      underlying: "0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a",
      symbol: "pAUSD",
      name: "Peridot AUSD",
      decimals: 6,
    },
    CAKE: {
      pToken: "0x8D31F6b1D8076f13B6A04a977F5919f6EF21eC6E",
      underlying: "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82",
      symbol: "pCAKE",
      name: "Peridot CAKE",
      decimals: 18,
    },
    ASTER: {
      pToken: "0x5c013C8Ee5B99fAaD3Af336E9142451F89eF7774",
      underlying: "0x000Ae314E2A2172a039B26378814C252734f556A",
      symbol: "pASTER",
      name: "Peridot ASTER",
      decimals: 18,
    },
    DOGE: {
      pToken: "0x66468B168Ea8289982EBEd6617dFCFA981d1EF0C",
      underlying: "0xba2ae424d960c26247dd6c32edc70b295c744c43",
      symbol: "pDOGE",
      name: "Peridot DOGE",
      decimals: 8,
    },
  }
};

export const arbitrumMainnetContracts = {
  chainNameWormhole: "Arbitrum",
  chainNameReadable: "Arbitrum Mainnet",
  chainId: 42161,
  rpcUrl: process.env.NEXT_PUBLIC_RPC_ARBITRUM_MAINNET || "https://arbitrum.drpc.org",
  explorer: "https://arbiscan.io/",

  // Core tokens
  peridotTokenSymbolP: "0x96650BebC549456F253974c11Fc6cBE28172A2d2",

  // Oracles
  simplePriceOracle: "0x42D5B37CD3682eDD0a3dBb242C579bDCB108f47C",
  oracle: "0x42D5B37CD3682eDD0a3dBb242C579bDCB108f47C",

  // Controller contracts
  peridottrollerG7Impl: "0x7e2A23fDEe775CB8e03f29E62278a457ff928d0F",
  peridottrollerG7Proxy: "0x6fC0c15531CB5901ac72aB3CFCd9dF6E99552e14",
  unitrollerProxy: "0x6fC0c15531CB5901ac72aB3CFCd9dF6E99552e14",

  // Interest rate model
  jumpRateModelV2: "0x8334A3ec5c9Cf105E57B8b4B68386B8A8043DD36",

  // pToken implementations and proxies
  pWETHDelegate: "0x5b5397d6EB59bB23e300e7559f07e04778fa930c",
  pUSDCDelegate: "0x2337b591f5A98A1232d89E4f682077b3960Ad17A",
  pWBNBDelegate: "0x47470B4af6c387F5993f0c7600f70B0F90787317",
  pUSDTDelegate: "0xcc63D360305c43DB30CE27365cCF76b0F08f3B07",
  pWBTCDelegate: "0xc00B22114ab51e594c2a5C190cB7EcE13C09f3a2",
  pAUSDDelegate: "0xD5c4080a60E244ee3CC36Cf4161aCfE460D255a4",
  pCAKEDelegate: "0xDa205725f210261a97E1d412aB6FEb518db52C27",
  pASTERDelegate: "0xd7B1D615526CC897883AFC646F609d5C126804dc",
  pDOGEDelegate: "0x486bb6efC9476Faf6740e26224F05093E2f0E4cd",

  // Delegator proxies (use these to interact)
  pWETHDelegatorProxy: "0x28E4F2Bb64ac79500ec3CAa074A3C30721B6bC84",
  pUSDCDelegatorProxy: "0x1A726369Bfc60198A0ce19C66726C8046c0eC17e",
  pWBNBDelegatorProxy: "0xD9fDF5E2c7a2e7916E7f10Da276D95d4daC5a3c3",
  pUSDTDelegatorProxy: "0xc37f3869720B672addFE5F9E22a9459e0E851372",
  pWBTCDelegatorProxy: "0xdCAbDc1F0B5e603b9191be044a912A8A2949e212",
  pAUSDDelegatorProxy: "0x7A9940B77c0B6DFCcA2028b9F3CCa88E5DC36ebb",
  pCAKEDelegatorProxy: "0x8D31F6b1D8076f13B6A04a977F5919f6EF21eC6E",
  pASTERDelegatorProxy: "0x5c013C8Ee5B99fAaD3Af336E9142451F89eF7774",
  pDOGEDelegatorProxy: "0x66468B168Ea8289982EBEd6617dFCFA981d1EF0C",

  // Underlying token contracts
  tokens: {
    WETH: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    WBTC: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f",
    USDC: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    WBNB: "0xa9004A5421372E1D83fB1f85b0FC986c912f91f",
    DAI: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
    USDT: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
    CAKE: "0x1b896893dfc86b2c4c4c4f5b7c7cf4855d6d9e",
    ASTER: "0x0c5c1c5c1c5c1c5c1c5c1c5c1c5c1c5c1c5c1c5",
    DOGE: "0x4425742D2bEfA6315586d4A562C4c4A6c4c4c4c4",
  },

  // Market mappings for easy access
  markets: {
    WETH: {
      pToken: "0x28E4F2Bb64ac79500ec3CAa074A3C30721B6bC84",
      underlying: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
      symbol: "pWETH",
      name: "Peridot WETH",
      decimals: 18,
    },
    USDC: {
      pToken: "0x1A726369Bfc60198A0ce19C66726C8046c0eC17e",
      underlying: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      symbol: "pUSDC",
      name: "Peridot USDC",
      decimals: 6,
    },
    WBNB: {
      pToken: "0xD9fDF5E2c7a2e7916E7f10Da276D95d4daC5a3c3",
      underlying: "0xa9004A5421372E1D83fB1f85b0FC986c912f91f",
      symbol: "pWBNB",
      name: "Peridot WBNB",
      decimals: 18,
    },
    USDT: {
      pToken: "0xc37f3869720B672addFE5F9E22a9459e0E851372",
      underlying: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
      symbol: "pUSDT",
      name: "Peridot USDT",
      decimals: 6,
    },
    WBTC: {
      pToken: "0xdCAbDc1F0B5e603b9191be044a912A8A2949e212",
      underlying: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f",
      symbol: "pWBTC",
      name: "Peridot WBTC",
      decimals: 8,
    },
    AUSD: {
      pToken: "0x7A9940B77c0B6DFCcA2028b9F3CCa88E5DC36ebb",
      underlying: "0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a",
      symbol: "pAUSD",
      name: "Peridot AUSD",
      decimals: 6,
    },
    CAKE: {
      pToken: "0x8D31F6b1D8076f13B6A04a977F5919f6EF21eC6E",
      underlying: "0x1b896893dfc86b2c4c4c4f5b7c7cf4855d6d9e",
      symbol: "pCAKE",
      name: "Peridot CAKE",
      decimals: 18,
    },
    ASTER: {
      pToken: "0x5c013C8Ee5B99fAaD3Af336E9142451F89eF7774",
      underlying: "0x0c5c1c5c1c5c1c5c1c5c1c5c1c5c1c5c1c5c1c5",
      symbol: "pASTER",
      name: "Peridot ASTER",
      decimals: 18,
    },
    DOGE: {
      pToken: "0x66468B168Ea8289982EBEd6617dFCFA981d1EF0C",
      underlying: "0x4425742D2bEfA6315586d4A562C4c4A6c4c4c4c4",
      symbol: "pDOGE",
      name: "Peridot DOGE",
      decimals: 8,
    },
  }
};

export const bscMainnetContracts = {
  chainNameWormhole: "BSC",
  chainNameReadable: "BSC Mainnet",
  chainId: 56,
  rpcUrl: process.env.NEXT_PUBLIC_RPC_BSC_MAINNET || "https://bsc-dataseed.bnbchain.org",
  explorer: "https://bscscan.com/",

  // Core tokens
  peridotTokenSymbolP: "0x96650BebC549456F253974c11Fc6cBE28172A2d2",

  // Oracles
  simplePriceOracle: "0x42D5B37CD3682eDD0a3dBb242C579bDCB108f47C",
  // Some hooks expect 'oracle' key; alias to simplePriceOracle for compatibility
  oracle: "0x42D5B37CD3682eDD0a3dBb242C579bDCB108f47C",

  // Controller contracts
  peridottrollerG7Impl: "0x7e2A23fDEe775CB8e03f29E62278a457ff928d0F",
  peridottrollerG7Proxy: "0x6fC0c15531CB5901ac72aB3CFCd9dF6E99552e14",
  // Add unitrollerProxy alias used across hooks/components
  unitrollerProxy: "0x6fC0c15531CB5901ac72aB3CFCd9dF6E99552e14",

  // Interest rate model
  jumpRateModelV2: "0x8334A3ec5c9Cf105E57B8b4B68386B8A8043DD36",

  // Delegate implementations (per-market)
  pWETHDelegate: "0x5b5397d6EB59bB23e300e7559f07e04778fa930c",
  pUSDCDelegate: "0x2337b591f5A98A1232d89E4f682077b3960Ad17A",
  pWBNBDelegate: "0x47470B4af6c387F5993f0c7600f70B0F90787317",
  pUSDTDelegate: "0xcc63D360305c43DB30CE27365cCF76b0F08f3B07",
  pWBTCDelegate: "0xc00B22114ab51e594c2a5C190cB7EcE13C09f3a2",
  pAUSDDelegate: "0xD5c4080a60E244ee3CC36Cf4161aCfE460D255a4",
  pCAKEDelegate: "0xDa205725f210261a97E1d412aB6FEb518db52C27",
  pASTERDelegate: "0xd7B1D615526CC897883AFC646F609d5C126804dc",
  pDOGEDelegate: "0x486bb6efC9476Faf6740e26224F05093E2f0E4cd",
  // Tokenized stock delegates
  pAAPLonDelegate: "0xD755412E04666ea5C3e9b011F102C2d66bF745aa",
  pNVDAonDelegate: "0x6dC2F1f7A0Bb86fdD2439d09b9bFcFf2C8Fa4e64",
  pGOOGLonDelegate: "0x6F9e822ffb32c6494021500C95fCB4B2C792Adb0",
  pTSLAonDelegate: "0x8b7512951135167F9C6a1d53dB6F34c4973FeE50",
  pMSFTonDelegate: "0x6835B95F1C5591E4B760A3d92b276Cd9362bB701",

  // Delegator proxies (use these to interact)
  pWETHDelegatorProxy: "0x28E4F2Bb64ac79500ec3CAa074A3C30721B6bC84",
  pUSDCDelegatorProxy: "0x1A726369Bfc60198A0ce19C66726C8046c0eC17e",
  pWBNBDelegatorProxy: "0xD9fDF5E2c7a2e7916E7f10Da276D95d4daC5a3c3",
  pUSDTDelegatorProxy: "0xc37f3869720B672addFE5F9E22a9459e0E851372",
  pWBTCDelegatorProxy: "0xdCAbDc1F0B5e603b9191be044a912A8A2949e212",
  pAUSDDelegatorProxy: "0x7A9940B77c0B6DFCcA2028b9F3CCa88E5DC36ebb",
  pCAKEDelegatorProxy: "0x8D31F6b1D8076f13B6A04a977F5919f6EF21eC6E",
  pASTERDelegatorProxy: "0x5c013C8Ee5B99fAaD3Af336E9142451F89eF7774",
  pDOGEDelegatorProxy: "0x66468B168Ea8289982EBEd6617dFCFA981d1EF0C",
  // Tokenized stock delegator proxies (use these to interact)
  pAAPLonDelegatorProxy: "0x4bbD9eea36a06642CFB0587B952EBbccfE0bc173",
  pNVDAonDelegatorProxy: "0x65Ef95DeaA390B2ac34c27c16168ad4369f02AfB",
  pGOOGLonDelegatorProxy: "0x742011cA7BCa4c0aB8A8Aafb96627E9fC1FF0916",
  pTSLAonDelegatorProxy: "0x973a8a497ff07265E7Fb62A9318Af9e5EfC50923",
  pMSFTonDelegatorProxy: "0xC59022e41D377554191351Deaaf5546012Ed906b",

  // Underlying token contracts
  tokens: {
    WETH: "0x2170Ed0880ac9A755fd29B2688956BD959F933F8",
    WBTC: "0x0555E30da8f98308EdB960aa94C0Db47230d2B9c",
    USDC: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
    WBNB: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
    DAI: "0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3",
    USDT: "0x55d398326f99059fF775485246999027B3197955",
    CAKE: "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82",
    ASTER: "0x000Ae314E2A2172a039B26378814C252734f556A",
    DOGE: "0xba2ae424d960c26247dd6c32edc70b295c744c43",
    // Tokenized stocks (Ondo)
    AAPLon: "0x390a684EF9cADE28A7AD0DFa61AB1Eb3842618c4",
    NVDAon: "0xA9eE28C80f960B889dFbd1902055218cBa016F75",
    GOOGLon: "0x091FC7778e6932d4009B087B191D1EE3bac5729A",
    TSLAon: "0x2494b603319d4D9F9715c9f4496d9E0364B59d93",
    MSFTon: "0x6bfe75d1ad432050ea973c3a3dcd88f02e2444c3",
  },

  // Market mappings for easy access
  markets: {
    WETH: {
      pToken: "0x28E4F2Bb64ac79500ec3CAa074A3C30721B6bC84",
      underlying: "0x2170Ed0880ac9A755fd29B2688956BD959F933F8",
      symbol: "pWETH",
      name: "Peridot WETH",
      decimals: 18,
    },
    USDC: {
      pToken: "0x1A726369Bfc60198A0ce19C66726C8046c0eC17e",
      underlying: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
      symbol: "pUSDC",
      name: "Peridot USDC",
      decimals: 18,
    },
    WBNB: {
      pToken: "0xD9fDF5E2c7a2e7916E7f10Da276D95d4daC5a3c3",
      underlying: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
      symbol: "pWBNB",
      name: "Peridot WBNB",
      decimals: 18,
    },
    USDT: {
      pToken: "0xc37f3869720B672addFE5F9E22a9459e0E851372",
      underlying: "0x55d398326f99059fF775485246999027B3197955",
      symbol: "pUSDT",
      name: "Peridot USDT",
      decimals: 18,
    },
    WBTC: {
      pToken: "0xdCAbDc1F0B5e603b9191be044a912A8A2949e212",
      underlying: "0x0555E30da8f98308EdB960aa94C0Db47230d2B9c",
      symbol: "pWBTC",
      name: "Peridot WBTC",
      decimals: 8,
    },
    AUSD: {
      pToken: "0x7A9940B77c0B6DFCcA2028b9F3CCa88E5DC36ebb",
      underlying: "0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a",
      symbol: "pAUSD",
      name: "Peridot AUSD",
      decimals: 6,
    },
    CAKE: {
      pToken: "0x8D31F6b1D8076f13B6A04a977F5919f6EF21eC6E",
      underlying: "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82",
      symbol: "pCAKE",
      name: "Peridot CAKE",
      decimals: 18,
    },
    ASTER: {
      pToken: "0x5c013C8Ee5B99fAaD3Af336E9142451F89eF7774",
      underlying: "0x000Ae314E2A2172a039B26378814C252734f556A",
      symbol: "pASTER",
      name: "Peridot ASTER",
      decimals: 18,
    },
    DOGE: {
      pToken: "0x66468B168Ea8289982EBEd6617dFCFA981d1EF0C",
      underlying: "0xba2ae424d960c26247dd6c32edc70b295c744c43",
      symbol: "pDOGE",
      name: "Peridot DOGE",
      decimals: 8,
    },
    // Tokenized stocks (Ondo)
    AAPLon: {
      pToken: "0x4bbD9eea36a06642CFB0587B952EBbccfE0bc173",
      underlying: "0x390a684EF9cADE28A7AD0DFa61AB1Eb3842618c4",
      symbol: "pAAPLon",
      name: "Peridot Apple (Ondo)",
      decimals: 18,
    },
    NVDAon: {
      pToken: "0x65Ef95DeaA390B2ac34c27c16168ad4369f02AfB",
      underlying: "0xA9eE28C80f960B889dFbd1902055218cBa016F75",
      symbol: "pNVDAon",
      name: "Peridot NVIDIA (Ondo)",
      decimals: 18,
    },
    GOOGLon: {
      pToken: "0x742011cA7BCa4c0aB8A8Aafb96627E9fC1FF0916",
      underlying: "0x091FC7778e6932d4009B087B191D1EE3bac5729A",
      symbol: "pGOOGLon",
      name: "Peridot Alphabet Class A (Ondo)",
      decimals: 18,
    },
    TSLAon: {
      pToken: "0x973a8a497ff07265E7Fb62A9318Af9e5EfC50923",
      underlying: "0x2494b603319d4D9F9715c9f4496d9E0364B59d93",
      symbol: "pTSLAon",
      name: "Peridot Tesla (Ondo)",
      decimals: 18,
    },
    MSFTon: {
      pToken: "0xC59022e41D377554191351Deaaf5546012Ed906b",
      underlying: "0x6bfe75d1ad432050ea973c3a3dcd88f02e2444c3",
      symbol: "pMSFTon",
      name: "Peridot Microsoft (Ondo)",
      decimals: 18,
    },
  }
};


// Note: For chains not listed in Wormhole Connect's default mainnet/testnet configurations
// (e.g., potentially Somneia, IotaEVM depending on the exact name),
// you might need to provide additional chain configuration details to Wormhole Connect.
// Refer to Wormhole Connect and SDK documentation for adding custom chains. 

// Chain configuration mapping for easy access
export const chainConfigs = {
  // Mainnets
  ethereumMainnet: ethereumMainnetContracts,
  arbitrumMainnet: arbitrumMainnetContracts,
  bscMainnet: bscMainnetContracts,
  somniaMainnet: somniaMainnetContracts,
  monadMainnet: monadMainnetContracts,
  robinhoodMainnet: robinhoodMainnetContracts,
  baseMainnet: {
    chainNameWormhole: "Base",
    chainNameReadable: "Base",
    chainId: 8453,
    rpcUrl: "https://mainnet.base.org",
    peridotSpoke: null,
    markets: {},
  },
  polygonMainnet: {
    chainNameWormhole: "Polygon",
    chainNameReadable: "Polygon",
    chainId: 137,
    rpcUrl: "https://polygon.drpc.org",
    peridotSpoke: null,
    markets: {},
  },
  avalancheMainnet: {
    chainNameWormhole: "Avalanche",
    chainNameReadable: "Avalanche",
    chainId: 43114,
    rpcUrl: "https://api.avax.network/ext/bc/C/rpc",
    peridotSpoke: null,
    markets: {},
  },

  // Testnets
  arbitrumSepolia: arbitrumSepoliaContracts,
  baseSepolia: baseSepoliaContracts,
  ethereumSepolia: {
    chainNameWormhole: "EthereumSepolia",
    chainNameReadable: "Ethereum Sepolia",
    chainId: 11155111,
    rpcUrl: "https://sepolia.drpc.org",
    peridotSpoke: "0xB4fc887D43B7acdff1139FeCb27c97b000945b64",
    markets: {
      AXL_WBNB: {
        underlying: "0xA9A2D8F279ABC436a18DBB1df3FB233039935D0A",
        symbol: "WBNB",
        name: "Axelar WBNB (Source)",
        decimals: 18,
      },
      AXL_USDC: {
        underlying: "0x254d06f33bDc5b8ee05b2ea472107E300226659A",
        symbol: "aUSDC",
        name: "Axelar aUSDC (Source)",
        decimals: 6,
      },
      AXL_WAVAX: {
        underlying: "0x2a87806561C550ba2dA9677c5323413E6e539740",
        symbol: "WAVAX",
        name: "Axelar WAVAX (Source)",
        decimals: 18,
      },
    },
  },
  iotaEVMTestnet: iotaEVMTestnetContracts,
  somniaTestnet: somniaTestnetContracts,
  stellarSorobanMainnet: stellarSorobanMainnetContracts,
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

// Helper function to get oracle address for a given chain ID
export function getOracleAddress(chainId: number): string | null {
  const chainConfig = getChainConfig(chainId);
  if (!chainConfig) return null;
  
  // Handle different oracle property names across chains
  if ('oracle' in chainConfig) return chainConfig.oracle;
  if ('simplePriceOracle' in chainConfig) return chainConfig.simplePriceOracle;
  
  return null;
}

// Helper function to get the default hub chain ID based on environment
export function getDefaultHubChainId(selectedNetworkId?: string): number {
  const preset = process.env.NEXT_PUBLIC_NETWORK_PRESET || 'testnet';
  
  // Check if user has selected a specific network that is a hub chain
  if (selectedNetworkId) {
    // Import the network context function dynamically to avoid circular dependencies
    try {
      const { getChainIdFromNetworkId } = require('@/context');
      const chainId = getChainIdFromNetworkId(selectedNetworkId);
      if (isHubChain(chainId)) {
        return chainId;
      }
    } catch (e) {
      // Fallback if context is not available
    }
  }

  if (preset.startsWith('mainnet')) {
    return CHAIN_IDS.BSC_MAINNET;
  }
  
  return CHAIN_IDS.BSC_TESTNET;
}

// Helper function to get network-aware chain ID for metrics
export function getNetworkAwareChainId(
  isConnected: boolean, 
  walletChainId?: number, 
  selectedNetworkId?: string
): number {
  // If wallet is connected, use the wallet's chain ID
  if (isConnected && walletChainId) {
    return walletChainId;
  }
  
  // Otherwise, use the selected network's chain ID
  if (selectedNetworkId) {
    try {
      const { getChainIdFromNetworkId } = require('@/context');
      const chainId = getChainIdFromNetworkId(selectedNetworkId);
      if (chainId) {
        return chainId;
      }
    } catch (e) {
      // Fallback if context is not available
    }
  }
  
  // Final fallback to default hub chain
  return getDefaultHubChainId(selectedNetworkId);
}

// Helper to get Dual Investment addresses for a given chain ID
export type DualInvestmentAddresses = {
  erc1155DualPosition: string
  vaultExecutor: string
  settlementEngine: string
  compoundBorrowRouter: string
  riskGuard: string
  managerImplementation: string
  managerProxy: string
}

export function getDualInvestmentAddresses(chainId: number): DualInvestmentAddresses | null {
  const chainConfig = getChainConfig(chainId) as any
  if (!chainConfig || !('dualInvestment' in chainConfig)) return null
  return chainConfig.dualInvestment as DualInvestmentAddresses
}

// Export all chain IDs for easy reference
export const CHAIN_IDS = {
  ARBITRUM_SEPOLIA: 421614,
  BASE_SEPOLIA: 84532,
  ETHEREUM_SEPOLIA: 11155111,
  IOTA_EVM_TESTNET: 1075,
  SOMNIA_MAINNET: 1868,
  SOMNIA_TESTNET: 50312,
  MONAD_TESTNET: 10143,
  MONAD_MAINNET: 143,
  BSC_TESTNET: 97,
  BSC_MAINNET: 56,
  ARBITRUM_MAINNET: 42161,
  ETHEREUM_MAINNET: 1,
  POLYGON_MAINNET: 137,
  AVALANCHE_MAINNET: 43114,
  BASE_MAINNET: 8453,
  /** Stellar Soroban Mainnet (non-EVM; sentinel chain_id for DB lookups) */
  STELLAR_MAINNET: 56457,
  /** Robinhood Chain mainnet: NVDA/USDG isolated margin (config/robinhood.ts) */
  ROBINHOOD_MAINNET: ROBINHOOD_CHAIN_ID,
} as const;

// Axelar spoke chains (source chains) that initiate cross-chain actions to BSC hub
export const AXELAR_SPOKE_CHAIN_IDS = new Set<number>([
  CHAIN_IDS.ARBITRUM_SEPOLIA,
  CHAIN_IDS.BASE_SEPOLIA,
  CHAIN_IDS.ETHEREUM_SEPOLIA,
])

export function isAxelarSpokeChain(chainId?: number | null): boolean {
  return typeof chainId === 'number' && AXELAR_SPOKE_CHAIN_IDS.has(chainId)
}

// WMON Magma boosted market on Monad: supply temporarily disabled (market not working properly)
export function isWmonMagmaSupplyDisabledOnMonad(assetId: string, chainId?: number | null): boolean {
  if (!chainId) return false
  const isMonad = chainId === CHAIN_IDS.MONAD_MAINNET || chainId === CHAIN_IDS.MONAD_TESTNET
  return assetId === 'magma-boosted-wmon' && isMonad
}

/** Network ID for Stellar Soroban Mainnet (non-EVM). Single Stellar network on the platform. */
export const STELLAR_NETWORK_ID = "stellar-soroban-mainnet" as const;

/** True when the selected network is Stellar Soroban. */
export function isStellarNetwork(networkId: string | null | undefined): boolean {
  return networkId === STELLAR_NETWORK_ID;
}

/** True when the address is an EVM address (0x + 40 hex). EVM-only APIs should skip Stellar (G...) addresses. */
export function isEvmAddress(address: string | null | undefined): boolean {
  return typeof address === "string" && /^0x[a-fA-F0-9]{40}$/.test(address)
}

// Identify hub chains that don't need cross-chain dialog
export function isHubChain(chainId?: number | null): boolean {
  if (!chainId) return false
  return chainId === 56 ||  // BSC_MAINNET
         chainId === 97 ||  // BSC_TESTNET
         chainId === 10143 ||  // MONAD_TESTNET
         chainId === 143 ||      // MONAD_MAINNET
         chainId === 50312 ||  // SOMNIA_TESTNET
         chainId === 1868     // SOMNIA_MAINNET
}

// Identify chains that have their own markets (not just showing hub chain markets)
export function hasOwnMarkets(chainId?: number | null): boolean {
  if (!chainId) return false
  
  // Hub chains always have their own markets
  if (isHubChain(chainId)) return true
  
  // Testnet spoke chains have their own markets (Axelar tokens) but disable actions for safety
  if (chainId === CHAIN_IDS.ARBITRUM_SEPOLIA ||
      chainId === CHAIN_IDS.BASE_SEPOLIA ||
      chainId === CHAIN_IDS.ETHEREUM_SEPOLIA) {
    return false // Disable supply/borrow actions for safety
  }
  
  // Mainnet spoke chains show hub chain markets (BSC) but don't have their own
  // They use Biconomy to interact with BSC pool
  return false
}

// Central resolver: when reading protocol data on spoke chains, route reads to hub chain
// Extend this mapping as we add more spoke→hub routes
export function resolveHubReadChainId(baseChainId?: number | null): number | null {
  if (!baseChainId) return null
  // Testnet Axelar spokes route to BSC testnet hub
  if (isAxelarSpokeChain(baseChainId)) return CHAIN_IDS.BSC_TESTNET
  // Arbitrum mainnet (Biconomy spoke) routes to BSC mainnet hub
  if (baseChainId === CHAIN_IDS.ARBITRUM_MAINNET) return CHAIN_IDS.BSC_MAINNET
  // Polygon mainnet (Biconomy spoke) routes to BSC mainnet hub for reads
  if (baseChainId === CHAIN_IDS.POLYGON_MAINNET) return CHAIN_IDS.BSC_MAINNET
  // Ethereum mainnet (Biconomy spoke) routes to BSC mainnet hub for reads
  if (baseChainId === 1) return CHAIN_IDS.BSC_MAINNET
  // Avalanche mainnet (Biconomy spoke) routes to BSC mainnet hub for reads
  if (baseChainId === CHAIN_IDS.AVALANCHE_MAINNET) return CHAIN_IDS.BSC_MAINNET
  // Base mainnet (Biconomy spoke) routes to BSC mainnet hub for reads
  if (baseChainId === CHAIN_IDS.BASE_MAINNET) return CHAIN_IDS.BSC_MAINNET
  return baseChainId
}

// Resolve configured underlying token decimals for a given chain.
// Prefer matching by underlying address; fall back to market symbol if provided.
export function getConfiguredUnderlyingDecimals(
  chainId: number,
  opts: { underlyingAddress?: string | null; symbol?: string | null }
): number | undefined {
  const config = getChainConfig(chainId) as any
  if (!config || !config.markets) return undefined
  const markets = config.markets as Record<string, any>

  const uAddr = (opts.underlyingAddress || '').toLowerCase()
  if (uAddr) {
    for (const key of Object.keys(markets)) {
      const m = markets[key]
      const mUnderlying = (m?.underlying || '').toLowerCase()
      if (mUnderlying && mUnderlying === uAddr && typeof m?.decimals === 'number') {
        return m.decimals as number
      }
    }
  }

  const sym = (opts.symbol || '').toUpperCase()
  if (sym && markets[sym] && typeof markets[sym].decimals === 'number') {
    return markets[sym].decimals as number
  }

  return undefined
}
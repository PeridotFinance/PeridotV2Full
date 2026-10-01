import { TOKENS } from "@/biconomy/constants";

/**
 * Circle CCTP V2 — native USDC from EVM chains into our Stellar (Soroban) markets.
 *
 * Why CCTP at all: our lending markets moved to Stellar, but almost every user
 * arrives holding USDC on an EVM chain. CCTP burns the USDC on the source chain
 * and mints *native* USDC on Stellar — no wrapped asset, no bridge liquidity
 * pool, no depeg surface. That is the whole reason it is worth the extra
 * plumbing over a generic bridge.
 *
 * The transfer is addressed by Circle's own "domain" numbering, which has
 * nothing to do with EVM chain IDs — hence the explicit maps below rather than
 * anything derived. A wrong domain burns real USDC into a chain nobody can mint
 * it back on, so these values are copied from Circle's docs and must not be
 * "cleaned up" against chain lists.
 *
 * Preset-aware exactly like `config/contracts.ts`: `NEXT_PUBLIC_NETWORK_PRESET`
 * decides testnet vs mainnet, everything else reads through the resolved
 * constants so no call site has to branch.
 */

/** `true` when the app runs against the testnet preset (default, as in contracts.ts). */
const IS_MAINNET_PRESET = (process.env.NEXT_PUBLIC_NETWORK_PRESET || "testnet").startsWith("mainnet");

/**
 * Stellar's CCTP domain. Same number on mainnet and testnet — Circle keys the
 * domain to the chain, not to the network.
 */
export const STELLAR_CCTP_DOMAIN = 27 as const;

/**
 * The EVM-side V2 contracts are deployed at the SAME address on every domain
 * we support (CREATE2), so they are not part of the per-chain map. If a future
 * chain ever breaks that pattern, it needs its own entry rather than a
 * silently wrong default.
 */
const TOKEN_MESSENGER_V2 = "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d";
const MESSAGE_TRANSMITTER_V2 = "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64";

export type CctpContracts = {
  /** Soroban contract IDs on the Stellar side (destination). */
  stellar: {
    /** Burns/mints USDC and owns the token minter. */
    tokenMessengerMinter: string;
    /** Verifies Circle's attestation and delivers the message. */
    messageTransmitter: string;
    /**
     * Circle's forwarder: lets a mint be delivered to a recipient that has no
     * USDC trustline yet, which is the normal state for a wallet whose owner
     * has only ever held USDC on an EVM chain.
     */
    cctpForwarder: string;
  };
  /** EVM-side V2 contracts, identical across all supported source domains. */
  evm: {
    tokenMessengerV2: string;
    messageTransmitterV2: string;
  };
};

const CCTP_CONTRACTS_MAINNET: CctpContracts = {
  stellar: {
    tokenMessengerMinter: "CAE2G5Z77UP7GYPYGFOWFGW7C7J6I4YP2AFGSADRKQY62SYUFLPNFTXL",
    messageTransmitter: "CACMENFFJPJMSDAJQLX4R7K3SFZIW2LJSE3R2UMLGSWHFHS353FVXAZV",
    cctpForwarder: "CBZL2IH7F6BIDAA3WBNXYKIXSATJGMSW7K5P5MJ6STX5RXN47TZJDF5T",
  },
  evm: {
    tokenMessengerV2: TOKEN_MESSENGER_V2,
    messageTransmitterV2: MESSAGE_TRANSMITTER_V2,
  },
};

const CCTP_CONTRACTS_TESTNET: CctpContracts = {
  stellar: {
    tokenMessengerMinter: "CDNG7HXAPBWICI2E3AUBP3YZWZELJLYSB6F5CC7WLDTLTHVM74SLRTHP",
    messageTransmitter: "CBJ6MTCKKZG73PMDZCJMSFRD7DQEMI4FKDH7CGDSV4W6FHCRBCQAVVJY",
    cctpForwarder: "CA66Q2WFBND6V4UEB7RD4SAXSVIWMD6RA4X3U32ELVFGXV5PJK4T4VSZ",
  },
  evm: {
    tokenMessengerV2: TOKEN_MESSENGER_V2,
    messageTransmitterV2: MESSAGE_TRANSMITTER_V2,
  },
};

/** Contracts for the active preset. */
export const CCTP_CONTRACTS: CctpContracts = IS_MAINNET_PRESET
  ? CCTP_CONTRACTS_MAINNET
  : CCTP_CONTRACTS_TESTNET;

/** Both sets stay exported so tooling/scripts can address a network explicitly. */
export { CCTP_CONTRACTS_MAINNET, CCTP_CONTRACTS_TESTNET };

/**
 * chainId → Circle domain.
 *
 * !! BNB Chain / BSC IS NOT A CCTP DOMAIN. !!
 * This is the most common wrong assumption in this repo: BSC is our *hub* for
 * the EVM lending markets, so it turns up in every other chain list — but
 * Circle has never issued native USDC on BSC and there is no CCTP domain for
 * it. BSC USDC must never be offered as a CCTP source; a deposit from there has
 * to go through the existing Biconomy/Squid paths instead. Do not add 56 or 97
 * to these maps, whatever number seems to "fit".
 */
const CCTP_EVM_DOMAINS_MAINNET: Readonly<Record<number, number>> = {
  1: 0, // Ethereum
  43114: 1, // Avalanche C-Chain
  10: 2, // OP Mainnet
  42161: 3, // Arbitrum One
  8453: 6, // Base
  137: 7, // Polygon PoS
  130: 10, // Unichain
  59144: 11, // Linea
};

const CCTP_EVM_DOMAINS_TESTNET: Readonly<Record<number, number>> = {
  11155111: 0, // Ethereum Sepolia
  43113: 1, // Avalanche Fuji
  11155420: 2, // OP Sepolia
  421614: 3, // Arbitrum Sepolia
  84532: 6, // Base Sepolia
  80002: 7, // Polygon Amoy
};

/** Domain map for the active preset. */
export const CCTP_EVM_DOMAINS: Readonly<Record<number, number>> = IS_MAINNET_PRESET
  ? CCTP_EVM_DOMAINS_MAINNET
  : CCTP_EVM_DOMAINS_TESTNET;

export { CCTP_EVM_DOMAINS_MAINNET, CCTP_EVM_DOMAINS_TESTNET };

/**
 * USDC token addresses per supported source chain.
 *
 * CCTP burns **native, Circle-issued** USDC only — a bridged variant (USDC.e)
 * has a different contract and the burn simply reverts. That is why the OP
 * entry is NOT taken from `biconomy/constants`: the address stored there is the
 * bridged USDC.e, correct for swap routing and wrong for CCTP.
 *
 * The five chains we already carry are reused from the Biconomy token map so
 * there is one place where a USDC address can be wrong; the rest are literals.
 * Every address here was checked against Circle's published contract list
 * (developers.circle.com/stablecoins/usdc-contract-addresses) — a wrong token
 * address sends real money nowhere, so nothing goes in on memory alone.
 */
export const CCTP_USDC_ADDRESSES_MAINNET: Readonly<Record<number, string>> = {
  1: TOKENS.mainnet.USDC, // 0xA0b8…eB48
  43114: TOKENS.avalanche.USDC, // 0xB97E…8a6E
  42161: TOKENS.arbitrum.USDC, // 0xaf88…5831
  8453: TOKENS.base.USDC, // 0x8335…2913
  137: TOKENS.polygon.USDC, // 0x3c49…3359
  10: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", // OP Mainnet — NOT TOKENS.optimism.USDC (that is USDC.e)
  130: "0x078D782b760474a361dDA0AF3839290b0EF57AD6", // Unichain
  59144: "0x176211869cA2b568f2A7D4EE941E073a821EE1ff", // Linea
};

/**
 * Testnet USDC is Circle's own faucet token, not the mock ERC-20 our own
 * testnet markets use — CCTP can only burn the former.
 */
export const CCTP_USDC_ADDRESSES_TESTNET: Readonly<Record<number, string>> = {
  11155111: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", // Ethereum Sepolia
  43113: "0x5425890298aed601595a70AB815c96711a31Bc65", // Avalanche Fuji
  11155420: "0x5fd84259d66Cd46123540766Be93DFE6D43130D7", // OP Sepolia
  421614: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d", // Arbitrum Sepolia
  84532: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia
  80002: "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582", // Polygon Amoy
};

/** USDC addresses for the active preset. */
export const CCTP_USDC_ADDRESSES: Readonly<Record<number, string>> = IS_MAINNET_PRESET
  ? CCTP_USDC_ADDRESSES_MAINNET
  : CCTP_USDC_ADDRESSES_TESTNET;

/**
 * The classic Stellar asset a CCTP mint actually lands as — the recipient must
 * trust it *before* the burn or the forward leg reverts inside `mint_and_forward`
 * and the money sits at the forwarder until someone re-drives it.
 *
 * Not a guess: `TokenMessengerMinter.get_local_token(6, <Base USDC>)` was
 * simulated against both deployed contracts. Mainnet answers the SAC
 * `CCW67TSZ…` — byte-for-byte the `markets.USDC.underlying` in
 * `config/contracts.ts` — which wraps `USDC:GA5ZSEJY…`. So CCTP mints exactly
 * the asset the Peridot market lends and the deposit needs no swap leg.
 * Testnet answers `CBIELTK6…` = Circle's testnet issuer `GBBD47IF…`, which no
 * Peridot market uses (the Stellar markets are mainnet-only).
 */
export const CCTP_STELLAR_ASSET: Readonly<{ code: string; issuer: string }> = IS_MAINNET_PRESET
  ? { code: "USDC", issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN" }
  : { code: "USDC", issuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5" };

/**
 * Below this, Circle's fast-transfer fee plus the source-chain gas eats enough
 * of the deposit that the user would be better off not sending it at all. It is
 * a product floor, not a protocol limit — the contracts happily move 1 cent.
 */
export const CCTP_MIN_TRANSFER_USD = 10;

/** Circle domain for an EVM chain, or `undefined` when the chain has none (BSC!). */
export function chainIdToCctpDomain(chainId: number): number | undefined {
  return CCTP_EVM_DOMAINS[chainId];
}

/**
 * `true` when a deposit may be routed from this chain via CCTP. Needs both a
 * domain *and* a known native-USDC address — a domain alone is not enough to
 * build the burn.
 */
export function isCctpSourceChain(chainId: number): boolean {
  return chainIdToCctpDomain(chainId) !== undefined && Boolean(CCTP_USDC_ADDRESSES[chainId]);
}

/** Native USDC on a CCTP source chain, or `undefined` if we have not verified one. */
export function cctpUsdcAddress(chainId: number): string | undefined {
  return CCTP_USDC_ADDRESSES[chainId];
}

/** Every chain currently usable as a CCTP source under the active preset. */
export function listCctpSourceChainIds(): number[] {
  return Object.keys(CCTP_EVM_DOMAINS)
    .map(Number)
    .filter(isCctpSourceChain);
}

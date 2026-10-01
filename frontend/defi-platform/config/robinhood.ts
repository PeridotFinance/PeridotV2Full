/**
 * Robinhood Chain (mainnet, chain id 4663): the NVDA/USDG isolated-margin
 * deployment described in docs/robinhood-margin/GUIDE.md.
 *
 * Every address, pair tuple, decimal and enum here comes from the handout's
 * manifest.json (app/abis/robinhood/manifest.json), which the deployer signed
 * with SHA256SUMS. Nothing in this file re-types an address by hand, so a new
 * handout is a file swap plus the checksum test in tests/robinhood-config.test.ts.
 *
 * This module has no imports from the rest of config/ on purpose: config/index.tsx
 * and config/contracts.ts both pull from it, and a cycle there breaks the
 * networks list at module-evaluation time.
 */
import manifest from "@/app/abis/robinhood/manifest.json"

type Hex = `0x${string}`

export const ROBINHOOD_CHAIN_ID = 4663 as const

if (manifest.chainId !== ROBINHOOD_CHAIN_ID) {
  throw new Error(
    `Robinhood manifest chainId ${manifest.chainId} does not match ROBINHOOD_CHAIN_ID ${ROBINHOOD_CHAIN_ID}`,
  )
}

/** Public RPC from the handout. A paid endpoint goes in NEXT_PUBLIC_RPC_ROBINHOOD_MAINNET. */
export const ROBINHOOD_DEFAULT_RPC_URL = manifest.rpcURL
export const ROBINHOOD_EXPLORER_URL = manifest.explorerURL

/**
 * Same-origin JSON-RPC proxy (app/api/robinhood/rpc/route.ts). The browser's
 * read client puts it last in its transport list, so a missing CSP entry or a
 * throttled public endpoint degrades to a slower read instead of no read.
 */
export const ROBINHOOD_RPC_PROXY_PATH = "/api/robinhood/rpc"

/** Canonical Multicall3, verified deployed on 4663 (eth_getCode non-empty, 2026-09-21). */
export const ROBINHOOD_MULTICALL3: Hex = "0xcA11bde05977b3631167028862bE2a173976CA11"

export function getRobinhoodRpcUrls(): string[] {
  const override = process.env.NEXT_PUBLIC_RPC_ROBINHOOD_MAINNET?.trim()
  return override && override !== ROBINHOOD_DEFAULT_RPC_URL
    ? [override, ROBINHOOD_DEFAULT_RPC_URL]
    : [ROBINHOOD_DEFAULT_RPC_URL]
}

/**
 * viem/wagmi chain definition. Shaped like the custom chains in config/index.tsx
 * (Somnia, Monad) so the same transport builders accept it. Gas is ETH.
 */
export const robinhoodMainnet = {
  id: ROBINHOOD_CHAIN_ID,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: manifest.gasSymbol, decimals: 18 },
  rpcUrls: {
    default: { http: getRobinhoodRpcUrls() },
    public: { http: getRobinhoodRpcUrls() },
  },
  blockExplorers: {
    default: { name: "Robinhood Blockscout", url: ROBINHOOD_EXPLORER_URL },
  },
  contracts: {
    multicall3: { address: ROBINHOOD_MULTICALL3 },
  },
  testnet: false,
} as const

/** Underlying tokens and the two boosted lending markets. */
export const ROBINHOOD_TOKENS = {
  USDG: manifest.existingAddresses.usd as Hex,
  NVDA: manifest.existingAddresses.stock as Hex,
  pUSDG: manifest.existingAddresses.pUsd as Hex,
  pNVDA: manifest.existingAddresses.pStock as Hex,
  /** Peridottroller wiring the markets to the isolated risk hook. ABI not in the bundle. */
  controller: manifest.existingAddresses.controller as Hex,
  /** Pair price feed and guard behind GuardedMarginPriceSource. ABIs not in the bundle. */
  feed: manifest.existingAddresses.feed as Hex,
  guard: manifest.existingAddresses.guard as Hex,
} as const

/** Margin contracts. Proxy addresses are the call targets; never call an implementation. */
export const ROBINHOOD_MARGIN = {
  executor: manifest.marginAddresses.executor as Hex,
  marginVault: manifest.marginAddresses.marginVault as Hex,
  config: manifest.marginAddresses.config as Hex,
  riskEngine: manifest.marginAddresses.riskEngine as Hex,
  quoter: manifest.marginAddresses.quoter as Hex,
  liquidator: manifest.marginAddresses.liquidator as Hex,
  oracle: manifest.marginAddresses.oracle as Hex,
  guardedSource: manifest.marginAddresses.guardedSource as Hex,
  flashVault: manifest.marginAddresses.flashVault as Hex,
  router: manifest.marginAddresses.router as Hex,
  swapModule: manifest.marginAddresses.swapModule as Hex,
  accountFactory: manifest.marginAddresses.accountFactory as Hex,
  insuranceFund: manifest.marginAddresses.insuranceFund as Hex,
  feeDistributor: manifest.marginAddresses.feeDistributor as Hex,
} as const

export type RobinhoodMarginSide = 0 | 1

export interface RobinhoodPair {
  marginPToken: Hex
  positionPToken: Hex
  debtPToken: Hex
  side: RobinhoodMarginSide
}

/**
 * Direction tuples exactly as the executor expects them. Long: margin and
 * debt are pUSDG, the position is pNVDA. Short: margin and position are pUSDG,
 * the debt is pNVDA. Read these instead of rebuilding them from symbols.
 */
export const ROBINHOOD_PAIRS: { long: RobinhoodPair; short: RobinhoodPair } = {
  long: {
    marginPToken: manifest.pairs.long.marginPToken as Hex,
    positionPToken: manifest.pairs.long.positionPToken as Hex,
    debtPToken: manifest.pairs.long.debtPToken as Hex,
    side: manifest.pairs.long.side as RobinhoodMarginSide,
  },
  short: {
    marginPToken: manifest.pairs.short.marginPToken as Hex,
    positionPToken: manifest.pairs.short.positionPToken as Hex,
    debtPToken: manifest.pairs.short.debtPToken as Hex,
    side: manifest.pairs.short.side as RobinhoodMarginSide,
  },
}

/**
 * Units. USDG is 6 decimals, NVDA 18, every pToken share 8, and every oracle
 * price or risk-engine USD figure 18. Leverage is x100 (500 = 5x), ratios are
 * basis points, health is bps / 10000.
 */
export const ROBINHOOD_DECIMALS = {
  USDG: manifest.decimals.usd,
  NVDA: manifest.decimals.stock,
  pToken: manifest.decimals.pToken,
  usd18: manifest.decimals.usdRiskValues,
} as const

export const ROBINHOOD_POSITION_STATUS = manifest.positionStatus
export type RobinhoodPositionStatus =
  (typeof ROBINHOOD_POSITION_STATUS)[keyof typeof ROBINHOOD_POSITION_STATUS]

/** First block to scan for executor PositionOpened logs (from the guide). */
export const ROBINHOOD_EXECUTOR_DEPLOY_BLOCK = 66_431_911n

/** Keeper wallet from the guide, for display only. It never signs for a user. */
export const ROBINHOOD_KEEPER_WALLET: Hex = "0x16aEC17597E5224998e2043C9c83C4a35dD95A86"

/**
 * Snapshot of the risk settings the handout was written against. The live
 * values come from config.getPairRisk on every quote; these exist so the UI
 * can render sensible defaults before the first read and so a test can catch
 * a manifest that silently changed them.
 */
export const ROBINHOOD_RECORDED_RISK = {
  maxLeverageX100: manifest.requestedFinalState.maxLeverageX100,
  initialMarginBps: manifest.requestedFinalState.initialMarginBps,
  maintenanceMarginBps: manifest.requestedFinalState.maintenanceMarginBps,
  maxPositionValueUsd18: BigInt(manifest.requestedFinalState.maxPositionValueUsd18),
  maxDebtValueUsd18: BigInt(manifest.requestedFinalState.maxDebtValueUsd18),
} as const

export const ROBINHOOD_MANIFEST = manifest

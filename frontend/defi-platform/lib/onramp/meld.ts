// Meld (Privy Funding Kit) onramp routing — single source of truth.
//
// Replaces the per-component `getSwapperConfig` copies that mapped the user's
// *connected* chain → a USDC address and silently defaulted to Base. Here we
// route by the *pool/asset being funded* and land directly on the correct
// chain. BSC is the lending hub, so consumer stables land on BSC (no bridge).
//
// `destination.chain` is a generic CAIP-2 id in Privy's SDK, so any chain
// compiles — BSC support is a runtime Meld-coverage fact (probe-confirmed on
// prod, June 2026). See docs/onramp-meld-integration-plan.md §4.

import { FEATURE_FLAGS } from "@/config/featureFlags"

// CAIP-2 chain ids Meld can route to. BSC USDC is probe-confirmed.
export const MELD_CHAIN = {
  bsc: "eip155:56",
  base: "eip155:8453",
  ethereum: "eip155:1",
  arbitrum: "eip155:42161",
  optimism: "eip155:10",
  polygon: "eip155:137",
  avalanche: "eip155:43114",
} as const

export type MeldChainKey = keyof typeof MELD_CHAIN
export type MeldAsset = "usdc" | "usdt"
export type MeldFiat = "eur" | "usd"

// Minimum on-chain balance increase (in token units) that counts as a Meld
// settlement. Floors out dust / formatUnits rounding so a near-zero delta never
// records a bogus "settled" event. Meld's own minimums are far above this.
export const MELD_MIN_SETTLE_DELTA = 0.01

/**
 * What a Meld card purchase actually delivers for a given market.
 *
 * - `direct` — Meld's providers sell the market's own asset on BSC, so the
 *   purchase lands as exactly what the user wants to deposit.
 * - `cash`   — no provider sells the asset on BSC (checked June 2026 across
 *   MoonPay/Transak/Ramp/Mercuryo: BSC carries USDT, USDC and native BNB only;
 *   no WBTC/BTCB, pegged ETH is Ramp-only). The purchase lands as USDC cash
 *   instead and the deposit needs a swap step — surfaces must say so.
 */
export type MeldFundMode = "direct" | "cash"

export function meldFundMode(assetId: string | undefined): MeldFundMode {
  const id = (assetId ?? "").toLowerCase()
  return id === "usdc" || id === "usdt" ? "direct" : "cash"
}

export interface MeldDestination {
  /** Meld crypto asset symbol. */
  asset: MeldAsset
  /** CAIP-2 chain id passed to Privy `fund()`. */
  chain: `${string}:${string}`
  /** Destination EVM address (the embedded Privy EVM wallet). */
  address: string
  /** Chain key for our own event/logging — never shown to users. */
  chainKey: MeldChainKey
}

export const isEvmAddress = (a?: string | null): a is string =>
  !!a && /^0x[a-fA-F0-9]{40}$/.test(a)

const isEvm = isEvmAddress

/**
 * Resolve the EVM address the Meld card should fund.
 *
 * CRITICAL: this must be the *same* address the subsequent deposit spends from,
 * or the user funds one wallet and the deposit reads another ("I paid but it
 * still says insufficient"). So we prefer the **active** wallet when it's EVM
 * (what the app transacts with — an embedded Privy EOA for email/social users,
 * or a connected external EOA), and only fall back to the embedded Privy EVM
 * wallet when the active wallet isn't EVM (e.g. Stellar-only mode) or is absent.
 */
export function resolveMeldEvmAddress(
  activeAddress: string | undefined,
  wallets: Array<{ address?: string; walletClientType?: string }> | undefined,
): string | undefined {
  if (isEvm(activeAddress)) return activeAddress
  return pickEmbeddedEvmAddress(wallets)
}

/** BSC if the sub-flag is on, otherwise fall back to Base (USDC only). */
function evmStableDestination(asset: MeldAsset, address: string): MeldDestination {
  if (FEATURE_FLAGS.FIAT_ONRAMP_MELD_BSC) {
    return { asset, chain: MELD_CHAIN.bsc, address, chainKey: "bsc" }
  }
  // BSC disabled → Base only carries USDC.
  return { asset: "usdc", chain: MELD_CHAIN.base, address, chainKey: "base" }
}

/**
 * Resolve the Meld card destination for a market/asset id.
 *
 * Returns `null` when there is no Meld card route — i.e. Stellar pools, the
 * Meld flag is off, or the EVM address is missing/invalid. Callers must treat
 * `null` as "no card option" and fall back to Bridge SEPA.
 */
export function meldDestinationForAsset(
  assetId: string | undefined,
  evmAddress: string | undefined,
): MeldDestination | null {
  if (!FEATURE_FLAGS.FIAT_ONRAMP_MELD) return null
  if (!isEvm(evmAddress)) return null

  const id = (assetId ?? "").toLowerCase()

  // Stellar pools have no Meld route → caller falls back to SEPA.
  if (id.endsWith("-stellar")) return null

  // BSC hub stables (bare ids in data/market-data) → land directly on the hub.
  if (id === "usdc" || id === "usdt") {
    return evmStableDestination(id as MeldAsset, evmAddress)
  }

  // Any other EVM/unknown asset → default to the hub stable (USDC).
  return evmStableDestination("usdc", evmAddress)
}

/** Generic surfaces with no specific pool → default to the BSC hub (USDC). */
export function meldDefaultDestination(
  evmAddress: string | undefined,
): MeldDestination | null {
  return meldDestinationForAsset("usdc", evmAddress)
}

/** Pick the embedded Privy EVM wallet address from a `useWallets()` list. */
export function pickEmbeddedEvmAddress(
  wallets: Array<{ address?: string; walletClientType?: string }> | undefined,
): string | undefined {
  const evm = (wallets ?? []).filter((w) => isEvm(w?.address))
  const embedded = evm.find((w) => w?.walletClientType === "privy")
  return (embedded ?? evm[0])?.address
}

/**
 * Which cross-chain legs the app offers, and which rail carries each one.
 *
 * Pure (no React, no fetch), shared by the proxy routes, the cron and the
 * hooks, so the server can never accept a leg the UI would not offer and the
 * other way round.
 *
 * Token addresses are deliberately not listed here. SODAX's own token list
 * (`/api/crosschain/tokens`) is the source for them, filtered through
 * `isOfferedToken`, because a hand-kept address table is exactly how a bridged
 * USDC.e ends up next to the native one. Decimals come from that list too: USDC
 * and USDT on BNB Smart Chain have 18, everywhere else 6.
 *
 * Every leg has one Stellar side today: "in" ends in the user's Stellar wallet,
 * "out" starts there. That Stellar address is also who owns the transfer row
 * (`authorizeStellarAddress`). EVM to EVM (USDG on Robinhood Chain from Base,
 * stage X5) needs an EVM owner and is refused here until then.
 */
import {
  EVM_CHAIN_ID_TO_SODAX_KEY,
  SODAX_CHAIN_KEYS,
  SODAX_NATIVE_EVM_TOKEN,
  type SodaxChainKey,
  type SodaxToken,
} from "@/lib/crosschain/sodax"

/** A chain as the app names it: `"stellar"`, or an EVM chain id. */
export type XcChain = "stellar" | number

export type XcDirection = "in" | "out"

export type XcRail = "sodax" | "cctp"

/** EVM networks with a SODAX spoke that the wagmi config can sign on. */
export const XC_EVM_CHAIN_IDS = [56, 8453, 42161, 1, 137, 43114, 4663] as const

/** Stablecoins, valued at $1 for limits and sorting. */
export const XC_STABLE_SYMBOLS = new Set(["USDC", "USDT", "USDG"])

/** What may leave or reach an EVM wallet: the stables and each chain's native coin. */
const XC_EVM_SYMBOLS = new Set(["USDC", "USDT", "USDG", "ETH", "BNB", "POL", "AVAX"])

/**
 * Stellar tokens the app moves, keyed by the Peridot market they feed. SODAX
 * delivers the exact SAC each market lends (checked in Phase 0), so arrival
 * needs no swap on Stellar. The EURC market has no entry: SODAX lists no EURC
 * on Stellar, so its picker offers the Stellar wallet only.
 */
export const XC_STELLAR_MARKET_SYMBOL: Record<string, string> = {
  "usdc-stellar": "USDC",
  "xlm-stellar": "XLM",
}

const XC_STELLAR_SYMBOLS = new Set(Object.values(XC_STELLAR_MARKET_SYMBOL))

/**
 * Below about $5 SODAX refuses the quote ("Input amount too low"); $5 worked on
 * every leg measured on 2026-09-28.
 */
export const XC_MIN_USD = 5

/**
 * Roll-out cap per transfer, raised as real transfers pass. Build-time so the
 * button and the server agree; above roughly $10,000 the solver finds no path
 * anyway, which is where CCTP takes over (stage X6).
 */
export function xcMaxUsd(): number {
  const raw = Number(process.env.NEXT_PUBLIC_CROSSCHAIN_MAX_USD)
  return Number.isFinite(raw) && raw > 0 ? raw : 500
}

/** Slippage the engine quotes with unless a caller asks otherwise. */
export const XC_DEFAULT_SLIPPAGE_BPS = 100
export const XC_MAX_SLIPPAGE_BPS = 500

export function isStellar(chain: XcChain): chain is "stellar" {
  return chain === "stellar"
}

export function isOfferedEvmChain(chain: XcChain): chain is number {
  return typeof chain === "number" && (XC_EVM_CHAIN_IDS as readonly number[]).includes(chain)
}

export function sodaxKeyFor(chain: XcChain): SodaxChainKey | null {
  if (isStellar(chain)) return SODAX_CHAIN_KEYS.stellar
  if (!isOfferedEvmChain(chain)) return null
  return EVM_CHAIN_ID_TO_SODAX_KEY[chain] ?? null
}

/** Parse a chain as it travels in a query string or a JSON body. */
export function parseXcChain(raw: unknown): XcChain | null {
  if (raw === "stellar") return "stellar"
  const n = typeof raw === "number" ? raw : typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : NaN
  return isOfferedEvmChain(n) ? n : null
}

export function isNativeToken(chain: XcChain, token: Pick<SodaxToken, "address">): boolean {
  return !isStellar(chain) && token.address.toLowerCase() === SODAX_NATIVE_EVM_TOKEN
}

/** Whether a token from SODAX's list for `chain` is one the app offers. */
export function isOfferedToken(chain: XcChain, token: Pick<SodaxToken, "symbol">): boolean {
  return isStellar(chain) ? XC_STELLAR_SYMBOLS.has(token.symbol) : XC_EVM_SYMBOLS.has(token.symbol)
}

export function isStableSymbol(symbol: string): boolean {
  return XC_STABLE_SYMBOLS.has(symbol)
}

/** "in" when the leg ends on Stellar, "out" when it starts there, null otherwise. */
export function directionOf(src: XcChain, dst: XcChain): XcDirection | null {
  if (isStellar(dst) && isOfferedEvmChain(src)) return "in"
  if (isStellar(src) && isOfferedEvmChain(dst)) return "out"
  return null
}

export interface XcLeg {
  src: XcChain
  dst: XcChain
  srcSymbol: string
  dstSymbol: string
}

export type RailChoice = { rail: XcRail; reason?: undefined } | { rail: null; reason: string }

/**
 * The rail for a leg. SODAX carries everything in the first release; the
 * function exists from day one so CCTP (native USDC in large tickets, stage X6)
 * plugs in here without touching a component.
 */
export function chooseRail(leg: XcLeg): RailChoice {
  const direction = directionOf(leg.src, leg.dst)
  if (!direction) return { rail: null, reason: "One side of the transfer has to be Stellar." }
  const stellarSymbol = direction === "in" ? leg.dstSymbol : leg.srcSymbol
  if (!XC_STELLAR_SYMBOLS.has(stellarSymbol)) {
    return { rail: null, reason: `${stellarSymbol} on Stellar has no route.` }
  }
  const evmSymbol = direction === "in" ? leg.srcSymbol : leg.dstSymbol
  if (!XC_EVM_SYMBOLS.has(evmSymbol)) return { rail: null, reason: `${evmSymbol} has no route.` }
  return { rail: "sodax" }
}

/** Minimum output for a quote at `slippageBps`, rounded down. */
export function minOutFor(quotedOut: bigint, slippageBps: number): bigint {
  const bps = Math.max(0, Math.min(XC_MAX_SLIPPAGE_BPS, Math.round(slippageBps)))
  return (quotedOut * BigInt(10_000 - bps)) / BigInt(10_000)
}

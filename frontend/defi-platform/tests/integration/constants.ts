/**
 * Shared constants for E2E integration tests.
 *
 * Addresses are re-exported from biconomy/constants.ts (single source of truth).
 * Test-specific amounts, timeouts, and market metadata live here.
 */

import { parseUnits } from 'viem'
import {
  PERIDOT_MARKETS,
  PERIDOT_CONTROLLER,
  BSC_UNDERLYING_TOKENS,
  TOKENS,
} from '../../biconomy/constants'

// Re-export for convenience
export { PERIDOT_MARKETS, PERIDOT_CONTROLLER, BSC_UNDERLYING_TOKENS, TOKENS }

// Oracle address (not in biconomy/constants)
export const ORACLE = '0x42D5B37CD3682eDD0a3dBb242C579bDCB108f47C' as const

// ─── Market metadata ─────────────────────────────────────────────────────────

export interface MarketConfig {
  pToken: `0x${string}`
  underlying: `0x${string}`
  decimals: number
  symbol: string
}

export const MARKETS: Record<string, MarketConfig> = {
  USDT: {
    pToken: PERIDOT_MARKETS.USDT,
    underlying: BSC_UNDERLYING_TOKENS.USDT,
    decimals: 18,
    symbol: 'USDT',
  },
  USDC: {
    pToken: PERIDOT_MARKETS.USDC,
    underlying: BSC_UNDERLYING_TOKENS.USDC,
    decimals: 18,
    symbol: 'USDC',
  },
} as const

// ─── Test amounts ────────────────────────────────────────────────────────────

export const TEST_AMOUNTS = {
  USDT: { supply: parseUnits('1', 18), borrow: parseUnits('0.5', 18) },
  USDC: { supply: parseUnits('1', 18), borrow: parseUnits('0.5', 18) },
} as const

// ─── Ignored underlyings ─────────────────────────────────────────────────────
// Markets whose underlying token we cannot source (e.g. dead oracle, delisted
// synthetic). These are skipped in oracle pre-flight checks.

export const IGNORED_UNDERLYINGS = new Set([
  '0xA9eE28C80f960B889dFbd1902055218cBa016F75'.toLowerCase(), // NVDA synthetic – dead feed
])

// ─── Misc ────────────────────────────────────────────────────────────────────

export const UINT256_MAX = 2n ** 256n - 1n
export const TX_TIMEOUT = 60_000
export const CROSS_CHAIN_TIMEOUT = 600_000

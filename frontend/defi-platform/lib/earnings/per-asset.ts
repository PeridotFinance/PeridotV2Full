/**
 * Map the earnings API's per-market breakdown onto the asset ids the app's
 * tables and sheets are keyed by.
 *
 * `/api/user/earnings` returns `perTokenBreakdown` keyed by the bare token
 * symbol from `verified_transactions` plus the chain id it happened on
 * (`{ tokenSymbol: "USDC", chainId: 56457 }`). Every consumer surface instead
 * addresses markets by asset id (`usdc-stellar`, `usdc`, `xlm-stellar`). The
 * translation is the `-stellar` suffix the API's own `apyAssetId()` applies in
 * the other direction, and getting it wrong is a silent bug rather than a
 * crash: the join simply misses and a real position reports zero interest.
 * That has happened before, so the rule lives in one place.
 *
 * Deliberately NOT exported as a number for every asset id: an id absent from
 * the map means "we have no verified trail for this market", which is not the
 * same as "this market earned nothing". The verified-transaction trail is
 * incomplete for Privy and cross-chain deposits, so callers must render
 * nothing for a missing entry instead of a confident $0.00 next to a real
 * balance.
 */

import { CHAIN_IDS } from "@/config/contracts"

export interface PerTokenEarnings {
  tokenSymbol: string
  chainId: number
  earnings: number
  currentApy?: number
  totalSupplied?: number
  totalRedeemed?: number
  firstSupplyDate?: string
}

/**
 * Below this the number is noise: a fraction of a cent renders as "+$0.00",
 * which reads as "this earned nothing" and is worse than showing no line.
 */
export const MIN_DISPLAYABLE_EARNINGS = 0.005

/** Asset id a breakdown entry belongs to, or null when it maps nowhere. */
function assetIdForEntry(entry: PerTokenEarnings): string | null {
  const symbol = (entry.tokenSymbol || "").trim().toLowerCase()
  if (!symbol) return null
  return entry.chainId === CHAIN_IDS.STELLAR_MAINNET ? `${symbol}-stellar` : symbol
}

/**
 * `{ "usdc-stellar": 3.12, "usdc": 0.44 }` — lifetime interest in USD per
 * market. Entries the caller cannot place are dropped rather than merged into
 * a neighbour, so a wrong number never lands next to the wrong balance.
 */
export function earningsByAssetId(
  breakdown: PerTokenEarnings[] | undefined | null
): Record<string, number> {
  const map: Record<string, number> = {}
  for (const entry of breakdown ?? []) {
    const id = assetIdForEntry(entry)
    if (!id) continue
    const value = Number(entry.earnings)
    if (!Number.isFinite(value) || value <= 0) continue
    map[id] = (map[id] ?? 0) + value
  }
  return map
}

/**
 * Sum of several markets' interest, for the rows that aggregate more than one
 * of them (the USD row covers Stellar USDC plus, off the Stellar-only host,
 * BSC USDC and USDT). Pass exactly the ids whose balances the row adds up, so
 * the interest shown always belongs to the balance shown beside it.
 *
 * Returns `null` when none of the ids has a verified trail, which callers must
 * treat as "unknown", not "zero".
 */
export function sumEarningsForAssets(
  map: Record<string, number>,
  assetIds: string[]
): number | null {
  let total = 0
  let found = false
  for (const id of assetIds) {
    const value = map[id]
    if (value === undefined) continue
    found = true
    total += value
  }
  return found ? total : null
}

/** Shared formatting so the row, the sheet and any future surface agree. */
export function formatEarnedUsd(value: number): string {
  return `$${value.toFixed(2)}`
}

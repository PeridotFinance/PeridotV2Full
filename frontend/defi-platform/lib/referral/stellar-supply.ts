/**
 * Server-side read of how much USD a Stellar wallet has SUPPLIED to Peridot.
 *
 * This is the number the Ambassador milestone is judged on, so it is computed
 * the same way the markets UI computes a supply balance rather than read from
 * the controller's `portfolio` totals: those totals are collateral figures, and
 * a market the user never entered as collateral would silently score zero.
 *
 *   underlying_raw = ptoken_raw × exchange_rate / 1e6      (vault convention)
 *   supplied_usd   = Σ  underlying_raw / 10^decimals × oracle_price
 *
 * Idle wallet balance does NOT count — the program rewards deposits into the
 * protocol, not tokens parked in a wallet.
 *
 * The heavy @stellar/stellar-sdk import stays dynamic so route bundles that
 * merely touch referral code never pull it in. Exchange rates and prices are
 * per-vault/per-asset, not per-user, so they are cached for the length of a
 * sweep — a 200-referral pass makes six oracle reads, not twelve hundred.
 *
 * NOTHING here may answer a failed read with a number. A rate or price we could
 * not fetch is reported as `degraded`, never as a default, because the caller
 * cannot tell an under-counted balance from a withdrawal and would reset a
 * 29-day streak over an RPC hiccup. Only a genuinely zero pToken balance is
 * allowed to score zero.
 */

import { stellarSorobanMainnetContracts } from "@/config/contracts"

const STELLAR_ACCOUNT_RE = /^G[A-Z2-7]{55}$/

/** The three mainnet ReceiptVault markets, as (assetId, vault, decimals). */
const MARKETS = [
  { assetId: "xlm-stellar", ...stellarSorobanMainnetContracts.markets.XLM },
  { assetId: "usdc-stellar", ...stellarSorobanMainnetContracts.markets.USDC },
  { assetId: "eurc-stellar", ...stellarSorobanMainnetContracts.markets.EURC },
] as const

/**
 * One handle on the lending lib for the whole file. The import is dynamic so a
 * route that merely touches referral code never pulls @stellar/stellar-sdk into
 * its bundle, and memoised so the three readers below are demonstrably talking
 * to the same module instance rather than re-resolving it per call.
 */
type LendingLib = typeof import("@/lib/stellar-soroban-lending")
let lendingLib: Promise<LendingLib> | null = null
function lending(): Promise<LendingLib> {
  if (!lendingLib) lendingLib = import("@/lib/stellar-soroban-lending")
  return lendingLib
}

const EXCHANGE_SCALE = BigInt(1_000_000)
const CACHE_TTL_MS = 5 * 60_000
/**
 * How long a failed rate read stops us from retrying. Short, because the value
 * is unknown until it succeeds and every wallet in the pass is blocked on it —
 * but not zero, or one dead RPC would be re-dialled 2,400 times a sweep.
 */
const RATE_FAIL_BACKOFF_MS = 30_000

type Cached<T> = { value: T; expiresAt: number }
const rateCache = new Map<string, Cached<bigint>>()
const rateFailUntil = new Map<string, number>()
const priceCache = new Map<string, Cached<number | null>>()

/**
 * The vault's pToken→underlying rate, or null when it could not be read.
 *
 * Null matters: a ReceiptVault rate only ever grows above 1.0, so answering a
 * failed read with the 1e6 identity (as this once did) UNDER-counts every
 * position — and, because the wrong value was cached, under-counted every
 * wallet the sweep touched for the next five minutes. That silently resets
 * streaks. A stale-but-real rate is still fine to reuse; an absent one is not.
 */
async function exchangeRate(vaultId: string): Promise<bigint | null> {
  const now = Date.now()
  const hit = rateCache.get(vaultId)
  if (hit && hit.expiresAt > now) return hit.value

  // Still backing off from a failure: reuse the last good value if we ever had
  // one (a rate barely moves in minutes), otherwise stay honest about not
  // knowing.
  if ((rateFailUntil.get(vaultId) ?? 0) > now) return hit?.value ?? null

  const { stellarGetExchangeRate } = await lending()
  try {
    const raw = BigInt(await stellarGetExchangeRate(vaultId))
    if (raw <= BigInt(0)) throw new Error(`non-positive exchange rate for ${vaultId}`)
    rateCache.set(vaultId, { value: raw, expiresAt: now + CACHE_TTL_MS })
    rateFailUntil.delete(vaultId)
    return raw
  } catch {
    rateFailUntil.set(vaultId, now + RATE_FAIL_BACKOFF_MS)
    return hit?.value ?? null
  }
}

async function price(assetId: string): Promise<number | null> {
  const hit = priceCache.get(assetId)
  if (hit && hit.expiresAt > Date.now()) return hit.value
  const { stellarFetchPrice } = await lending()
  let value: number | null = null
  try {
    value = await stellarFetchPrice(assetId)
  } catch {
    value = null
  }
  if (value === null) {
    const stale = priceCache.get(assetId)
    if (stale?.value != null) return stale.value
  }
  priceCache.set(assetId, { value, expiresAt: Date.now() + CACHE_TTL_MS })
  return value
}

export interface StellarSupplyBreakdown {
  totalUsd: number
  byAsset: Array<{ symbol: string; amount: number; usd: number }>
  /** True when at least one market read threw — the total is a floor, not a fact. */
  degraded: boolean
}

/** Supplied USD for a single Stellar account across all Peridot markets. */
export async function getStellarSuppliedUsdForAddress(
  address: string
): Promise<StellarSupplyBreakdown> {
  if (!STELLAR_ACCOUNT_RE.test(address)) {
    return { totalUsd: 0, byAsset: [], degraded: false }
  }

  const { stellarGetPtokenBalance } = await lending()
  const byAsset: StellarSupplyBreakdown["byAsset"] = []
  let totalUsd = 0
  let degraded = false

  for (const market of MARKETS) {
    try {
      const [balanceRaw, rate, unitPrice] = await Promise.all([
        stellarGetPtokenBalance(market.vaultId, address),
        exchangeRate(market.vaultId),
        price(market.assetId),
      ])
      const ptokenRaw = BigInt(balanceRaw || "0")
      // A zero balance is the one honest zero: no position, nothing to price.
      if (ptokenRaw <= BigInt(0)) continue
      if (unitPrice == null || rate == null) {
        // A market we cannot price — or cannot convert — is unscoreable. Say so
        // rather than counting it as zero, which looks exactly like a
        // withdrawal and would reset a streak.
        degraded = true
        continue
      }
      const underlyingRaw = (ptokenRaw * rate) / EXCHANGE_SCALE
      const amount = Number(underlyingRaw) / Math.pow(10, market.decimals)
      const usd = amount * unitPrice
      if (!Number.isFinite(amount) || !Number.isFinite(usd)) {
        degraded = true
        continue
      }
      totalUsd += usd
      byAsset.push({ symbol: market.symbol, amount, usd })
    } catch {
      degraded = true
    }
  }

  return { totalUsd, byAsset, degraded }
}

/**
 * Supplied USD across every Stellar wallet an account owns. Users routinely
 * have both a Privy embedded Stellar wallet and an external Freighter one, and
 * the milestone is about the person, not one keypair.
 */
export async function getStellarSuppliedUsd(
  addresses: string[]
): Promise<StellarSupplyBreakdown> {
  const unique = [...new Set(addresses.map((a) => (a || "").trim().toUpperCase()))].filter((a) =>
    STELLAR_ACCOUNT_RE.test(a)
  )
  if (unique.length === 0) return { totalUsd: 0, byAsset: [], degraded: false }

  const results = await Promise.all(unique.map((a) => getStellarSuppliedUsdForAddress(a)))
  const merged = new Map<string, { symbol: string; amount: number; usd: number }>()
  let totalUsd = 0
  let degraded = false
  for (const r of results) {
    totalUsd += r.totalUsd
    degraded ||= r.degraded
    for (const entry of r.byAsset) {
      const prev = merged.get(entry.symbol)
      if (prev) {
        prev.amount += entry.amount
        prev.usd += entry.usd
      } else {
        merged.set(entry.symbol, { ...entry })
      }
    }
  }
  return { totalUsd, byAsset: [...merged.values()], degraded }
}

/** Test helper: drop the per-sweep rate/price memoisation. */
export function __resetSupplyCachesForTests(): void {
  lendingLib = null
  rateCache.clear()
  rateFailUntil.clear()
  priceCache.clear()
}

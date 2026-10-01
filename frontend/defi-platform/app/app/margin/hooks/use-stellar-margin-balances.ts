'use client'

/**
 * use-stellar-margin-balances
 *
 * Hydrates per-market state for the XLM / mock-USDT pair from on-chain reads:
 *   - price (1:1 fallback when the oracle returns null — spec §6)
 *   - collateral factor, exchange rate, market support / borrow-pause flags
 *   - margin-custody pToken balance (raw) + its underlying value
 *   - wallet underlying balance
 *
 * Replaces the EVM `use-margin-balances` multicall. No SMA concept on Stellar —
 * `marginCollateralUsd` is the aggregate of margin-custody value across markets.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  STELLAR_MARGIN_CONFIG as CFG,
  type StellarMarginAssetKey,
} from '../config/stellarMarginConfig'
import {
  getPriceUsd,
  getMarketCf,
  vaultGetExchangeRate,
  getMarginBalancePtokens,
  getMarginBalanceUnderlying,
  getTokenBalance,
  vaultGetPtokenBalance,
  vaultGetAvailableLiquidity,
  isMarketSupported,
  isBorrowPaused,
  formatUnitsToDecimal,
} from '@/lib/stellar-margin'
import type { StellarMarginAsset } from '../types/stellarMargin'

const ASSET_KEYS = Object.keys(CFG.assets) as StellarMarginAssetKey[]
const REFRESH_MS = 20_000

/**
 * Market shape (price feed config, collateral factor, support/pause flags, exchange
 * rate) is effectively static on this testnet pair, but it was being re-read on every
 * 20s cycle — 5 of the 9 RPC calls per asset, forever, even with no wallet connected.
 * Cache it per vault and refresh it on a much slower cadence than the balances.
 *
 * The exchange rate does drift (it accrues interest), which is why this is a TTL and
 * not a read-once: it only feeds the "stuck funds" underlying conversion, where a few
 * minutes of drift is invisible.
 */
const MARKET_TTL_MS = 300_000
type MarketShape = { price: Awaited<ReturnType<typeof getPriceUsd>>; cfRaw: bigint; rate: bigint; supported: boolean; paused: boolean }
const marketCache = new Map<string, { at: number; value: MarketShape }>()

async function readMarket(token: string, vault: string): Promise<MarketShape> {
  const hit = marketCache.get(vault)
  if (hit && Date.now() - hit.at < MARKET_TTL_MS) return hit.value
  const [price, cfRaw, rate, supported, paused] = await Promise.all([
    getPriceUsd(token),
    getMarketCf(vault),
    vaultGetExchangeRate(vault),
    isMarketSupported(vault),
    isBorrowPaused(vault),
  ])
  const value = { price, cfRaw, rate, supported, paused }
  marketCache.set(vault, { at: Date.now(), value })
  return value
}

function toHuman(raw: bigint, decimals: number): number {
  const n = parseFloat(formatUnitsToDecimal(raw, decimals))
  return Number.isFinite(n) ? n : 0
}

async function readAsset(key: StellarMarginAssetKey, user: string | null): Promise<StellarMarginAsset> {
  const cfg = CFG.assets[key]
  const { token, vault, decimals } = cfg

  const [{ price, cfRaw, rate, supported, paused }, marginPtokens, marginUnderlyingRaw, walletRaw, spotPtokens, liquidityRaw] =
    await Promise.all([
      readMarket(token, vault),
      user ? getMarginBalancePtokens(user, token) : Promise.resolve(BigInt(0)),
      user ? getMarginBalanceUnderlying(user, token) : Promise.resolve(BigInt(0)),
      user ? getTokenBalance(token, user) : Promise.resolve(BigInt(0)),
      // Spot pTokens held in the wallet (vault balance) — the "stuck funds" bucket
      // a half-finished collateral move leaves behind. Converted to underlying
      // below via the exchange rate (underlying per pToken, scaled 1e6).
      user ? vaultGetPtokenBalance(vault, user) : Promise.resolve(BigInt(0)),
      // NOT part of the 5-minute market cache: this is the one market number that
      // moves on its own, every time anyone borrows or repays, and it decides
      // whether an open position can be closed at all.
      vaultGetAvailableLiquidity(vault),
    ])

  // Oracle returns null for the 1:1-fallback testnet markets (spec §6).
  const priceUsd = price && price.scale > BigInt(0) ? Number(price.price) / Number(price.scale) : 1

  const spotUnderlyingRaw = (spotPtokens * rate) / CFG.constants.EXCHANGE_SCALE

  return {
    key,
    symbol: cfg.symbol,
    label: cfg.label,
    token,
    vault,
    decimals,
    priceUsd,
    collateralFactor: Number(cfRaw) / Number(CFG.constants.EXCHANGE_SCALE),
    exchangeRate: rate,
    walletBalance: toHuman(walletRaw, decimals),
    marginPtokensRaw: marginPtokens,
    marginUnderlying: toHuman(marginUnderlyingRaw, decimals),
    spotPtokensRaw: spotPtokens,
    spotUnderlying: toHuman(spotUnderlyingRaw, decimals),
    isSupported: supported,
    borrowPaused: paused,
    availableLiquidity: liquidityRaw == null ? null : toHuman(liquidityRaw, decimals),
  }
}

export interface UseStellarMarginBalancesResult {
  assets: StellarMarginAsset[]
  marginCollateralUsd: number
  isLoading: boolean
  refetch: () => void
}

export function useStellarMarginBalances(userAddress: string | null): UseStellarMarginBalancesResult {
  const [assets, setAssets] = useState<StellarMarginAsset[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [tick, setTick] = useState(0)
  const refetch = useCallback(() => setTick((t) => t + 1), [])

  // Keep latest address in a ref so the interval re-reads without re-subscribing.
  const addrRef = useRef(userAddress)
  addrRef.current = userAddress

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)

    const run = async () => {
      try {
        const next = await Promise.all(ASSET_KEYS.map((k) => readAsset(k, addrRef.current)))
        if (!cancelled) setAssets(next)
      } catch (e) {
        if (!cancelled) console.error('[useStellarMarginBalances]', e)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    run()

    // Only the user-scoped half of this read can change on its own, so with no
    // wallet connected there is nothing to poll for — the market shape is cached
    // above and the display price comes from the feed, not from here.
    if (!userAddress) return () => { cancelled = true }

    // A backgrounded tab was still burning a full read every 20s. Skip while hidden
    // and take one immediately on return, so coming back shows fresh numbers rather
    // than waiting out the rest of the interval.
    const tickRun = () => { if (!document.hidden) void run() }
    const onVisible = () => { if (!document.hidden) void run() }
    document.addEventListener('visibilitychange', onVisible)
    const id = setInterval(tickRun, REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [userAddress, tick])

  const marginCollateralUsd = assets.reduce((sum, a) => sum + a.marginUnderlying * a.priceUsd, 0)

  return { assets, marginCollateralUsd, isLoading, refetch }
}

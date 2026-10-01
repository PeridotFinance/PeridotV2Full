'use client'

/**
 * What price will this trade actually fill at?
 *
 * The panel's "XLM Price" is the price FEED. No trade fills there — it fills
 * against the Aquarius pool, and the pool's price moves with the size being
 * pushed through it. Measured on testnet, a long paid 0.68% over the feed at an
 * 80 USDT notional, 2.5% at 90, and 5.2% at 350. At 5× leverage a 5% gap is 25%
 * of the trader's equity, gone the moment the position opens — which is exactly
 * the "my position opened already down" report, and it was invisible because
 * every number on screen came from the feed.
 *
 * So quote the real thing, before they commit. This mirrors the open path's
 * sizing exactly (`computeBorrowAndFloor` with the same oracle prices and vault
 * rate, then `estimate_pool_swap`) so the number shown is the number the trade
 * will be built from — not a second, prettier model of it.
 *
 * Debounced, and it never blocks the panel: while a quote is in flight the last
 * one stays on screen, and a failure simply yields null (the row hides) rather
 * than an error state on an input the user is still typing into.
 */
import { useEffect, useRef, useState } from 'react'
import {
  vaultGetExchangeRate,
  getPriceUsd,
  estimatePoolSwap,
} from '@/lib/stellar-margin'
import { STELLAR_MARGIN_CONFIG as CFG, SIDE_MAPPING, type PositionSide } from '../config/stellarMarginConfig'
import { computeBorrowAndFloor, executionEntryPrice } from '../lib/marginMath'

const DEBOUNCE_MS = 450

export interface ExecutionQuote {
  /** USD per XLM the trade is expected to fill at. */
  entryPrice: number
  /** Signed % difference from the feed price. Positive = worse for the trader on
   *  both sides (a long pays more per XLM, a short receives less). */
  gapPct: number | null
}

export function useStellarExecutionQuote(params: {
  side: PositionSide
  /** Collateral in USDT (human units). Zero disables the quote. */
  collateral: number
  leverage: number
  /** Display-domain price the panel shows, for the comparison. */
  feedPrice: number
  enabled?: boolean
}): { quote: ExecutionQuote | null; isLoading: boolean } {
  const { side, collateral, leverage, feedPrice, enabled = true } = params
  // Only the executed price is fetched; the gap against the feed is derived at
  // render time. The feed ticks every couple of seconds, and depending on it
  // here would re-quote the pool on every tick — a request per tick, and a
  // debounce that never settles while the price moves.
  const [entryPrice, setEntryPrice] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  // Only the newest request may write state — a slow quote for an old size must
  // not overwrite a fast one for the current size.
  const runIdRef = useRef(0)

  useEffect(() => {
    if (!enabled || !(collateral > 0) || !(leverage > 0)) {
      setEntryPrice(null)
      return
    }
    const runId = ++runIdRef.current
    let cancelled = false
    const timer = setTimeout(async () => {
      setIsLoading(true)
      try {
        const usdt = CFG.assets.MOCK_USDT
        const xlm = CFG.assets.XLM
        const [rate, usdtPrice, xlmPrice] = await Promise.all([
          vaultGetExchangeRate(usdt.vault),
          getPriceUsd(usdt.token),
          getPriceUsd(xlm.token),
        ])
        if (!usdtPrice || !xlmPrice) throw new Error('no price')

        const collateralRaw = BigInt(Math.round(collateral * 10 ** usdt.decimals))
        const collateralPtokens = (collateralRaw * CFG.constants.EXCHANGE_SCALE) / rate
        const debtPrice = side === 'Long' ? usdtPrice : xlmPrice
        const positionPrice = side === 'Long' ? xlmPrice : usdtPrice
        const { borrowAmount, collateralUnderlying } = computeBorrowAndFloor({
          collateralPtokens,
          exchangeRate: rate,
          leverage,
          side,
          collateralPrice: { num: usdtPrice.price, den: usdtPrice.scale },
          debtPrice: { num: debtPrice.price, den: debtPrice.scale },
          positionPrice: { num: positionPrice.price, den: positionPrice.scale },
        })
        if (borrowAmount <= BigInt(0)) throw new Error('nothing to quote')

        const { swapInIdx, swapOutIdx } = SIDE_MAPPING[side]
        // The swap's own output: margin + borrow in for a Long, borrow only for
        // a Short (the same input the open hook quotes its min-out from).
        const swapOut = await estimatePoolSwap(
          swapInIdx,
          swapOutIdx,
          side === 'Long' ? collateralUnderlying + borrowAmount : borrowAmount,
        )

        const price = executionEntryPrice({
          side,
          collateralUnderlying,
          borrowAmount,
          // `executionEntryPrice` expects a Short's CUSTODIED total (margin +
          // proceeds), because that is the shape the contract's execution read
          // returns — so the margin goes back on here.
          positionAmount: side === 'Long' ? swapOut : collateralUnderlying + swapOut,
          usdtDecimals: usdt.decimals,
          xlmDecimals: xlm.decimals,
        })
        if (cancelled || runId !== runIdRef.current) return
        setEntryPrice(price != null && price > 0 ? price : null)
      } catch {
        if (!cancelled && runId === runIdRef.current) setEntryPrice(null)
      } finally {
        if (!cancelled && runId === runIdRef.current) setIsLoading(false)
      }
    }, DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [side, collateral, leverage, enabled])

  if (entryPrice == null) return { quote: null, isLoading }
  // A long fills ABOVE the feed and a short BELOW it; both are worse for the
  // trader, so the short's sign is flipped to keep "positive = costs you".
  const raw = feedPrice > 0 ? ((entryPrice - feedPrice) / feedPrice) * 100 : null
  return {
    quote: { entryPrice, gapPct: raw == null ? null : side === 'Long' ? raw : -raw },
    isLoading,
  }
}

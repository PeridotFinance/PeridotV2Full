'use client'

/**
 * Where is the POOL right now — not the feed?
 *
 * Every trade on this page fills against the Aquarius XLM/USDT pool, while every
 * number on screen (the chart, "XLM Price", TP/SL) comes from the Binance feed.
 * On testnet nobody arbitrages the pool back to the market, so the two have sat
 * as much as ~9% apart, and a trader who only sees the feed has no way to tell
 * where their position will actually open or close — until the PnL starts red.
 *
 * This hook quotes the pool at a deliberately tiny size in BOTH directions, so
 * the number is the pool's own mid-price with no size impact of its own:
 *
 *   bid — what selling XLM into the pool fetches (USDT per XLM), the short's side
 *   ask — what buying XLM from the pool costs, the long's side
 *
 * The chart draws the mid as a horizontal "Pool" line next to the feed's last
 * price, and the header states the gap. A size-dependent fill lives elsewhere
 * (`useStellarExecutionQuote` for opens, `useStellarPoolMarks` for exits); this
 * is the reference they diverge from.
 *
 * Polled slowly on purpose — two RPC simulations per refresh — and never carried
 * with the feed's drift: on testnet the pool does NOT follow the feed, and
 * pretending it does would hide exactly the gap this exists to show.
 */
import { useEffect, useState } from 'react'
import { estimatePoolSwap } from '@/lib/stellar-margin'
import { STELLAR_MARGIN_CONFIG as CFG, SIDE_MAPPING } from '../config/stellarMarginConfig'

const REFRESH_MS = 15_000
/** Probe sizes, human units — small enough that price impact is noise. */
const PROBE_XLM = 10
const PROBE_USDT = 2

export interface PoolPrice {
  /** USD per XLM the pool pays when XLM is sold into it. */
  bid: number
  /** USD per XLM the pool charges when XLM is bought from it. */
  ask: number
  mid: number
  /** Pool mid vs. the feed, signed, in % — negative = pool trades below the market. */
  gapPct: number | null
  updatedAt: number
}

export function useStellarPoolPrice(params: { feedPrice: number; enabled?: boolean }): PoolPrice | null {
  const { feedPrice, enabled = true } = params
  const [raw, setRaw] = useState<{ bid: number; ask: number; updatedAt: number } | null>(null)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    const xlm = CFG.assets.XLM
    const usdt = CFG.assets.MOCK_USDT
    const sellXlm = SIDE_MAPPING.Short // XLM → USDT
    const buyXlm = SIDE_MAPPING.Long // USDT → XLM

    const quote = async () => {
      try {
        const xlmIn = BigInt(Math.round(PROBE_XLM * 10 ** xlm.decimals))
        const usdtIn = BigInt(Math.round(PROBE_USDT * 10 ** usdt.decimals))
        const [usdtOut, xlmOut] = await Promise.all([
          estimatePoolSwap(sellXlm.swapInIdx, sellXlm.swapOutIdx, xlmIn),
          estimatePoolSwap(buyXlm.swapInIdx, buyXlm.swapOutIdx, usdtIn),
        ])
        const bid = Number(usdtOut) / 10 ** usdt.decimals / PROBE_XLM
        const ask = PROBE_USDT / (Number(xlmOut) / 10 ** xlm.decimals)
        if (cancelled || !(bid > 0) || !(ask > 0) || !Number.isFinite(ask)) return
        setRaw({ bid, ask, updatedAt: Date.now() })
      } catch {
        // Keep the last quote; a hole would flicker the line and the chip.
      }
    }

    void quote()
    const timer = setInterval(quote, REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [enabled])

  if (!raw) return null
  const mid = (raw.bid + raw.ask) / 2
  return {
    bid: raw.bid,
    ask: raw.ask,
    mid,
    gapPct: feedPrice > 0 ? ((mid - feedPrice) / feedPrice) * 100 : null,
    updatedAt: raw.updatedAt,
  }
}

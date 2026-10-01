'use client'

/**
 * What is this position worth if the trader closes it RIGHT NOW?
 *
 * The entry price on every position is the price its opening swap filled at
 * (`executionEntryPrice`) — the pool's price, not the feed's. Marking that entry
 * against the Binance feed measures the trade across two different price
 * domains, so a position that has not moved at all shows the execution gap as a
 * loss the instant it opens (+0.68% on an 80 USDT notional, +5.2% at 350 — at 5×
 * leverage that reads as −25% ROE on a trade that did nothing). That is the
 * "my position opened already down" report, and it survived stamping the entry
 * honestly: the entry became right, the mark stayed wrong.
 *
 * So quote the exit the same way the entry was quoted: run the closing swap
 * through `estimate_pool_swap` at the position's ACTUAL size and price it. Now
 * entry and mark are both pool prices, and a freshly opened position sits at
 * roughly minus the round-trip spread — which is what it is genuinely worth.
 *
 * Two things this deliberately does NOT do:
 *
 * - It doesn't poll at ticker speed. Each quote is an RPC simulation per open
 *   position; at the ticker's 2.5s cadence that is a request storm for a number
 *   that moves with pool depth, not with every tick. Quotes refresh on
 *   REFRESH_MS and the live feed's drift since the last quote is added on top,
 *   so the displayed mark still moves every tick — it just moves in the pool's
 *   domain instead of the feed's.
 * - It doesn't fall back to a fabricated basis. A position with no successful
 *   quote yet is simply absent from the map, and the caller keeps using the feed
 *   (the pre-existing behaviour) rather than a guess.
 */
import { useEffect, useRef, useState } from 'react'
import { estimatePoolSwap } from '@/lib/stellar-margin'
import { STELLAR_MARGIN_CONFIG as CFG, SIDE_MAPPING, type PositionSide } from '../config/stellarMarginConfig'
import { executionExitPrice } from '../lib/marginMath'

/** How often the pool is re-quoted. Slow on purpose — see the header. */
const REFRESH_MS = 20_000

export interface PoolMarkInput {
  id: string
  side: PositionSide
  /** Position-asset underlying amount (human) — the size the close would swap. */
  collateralAmount: number
}

interface Quote {
  /** Pool price for this position's exit, USD per XLM. */
  price: number
  /** Feed price at the moment of the quote, so later ticks can be added on top. */
  feedAtQuote: number
}

/**
 * positionId → mark price (USD per XLM) in the execution domain, or an empty map
 * while nothing has been quoted yet.
 */
export function useStellarPoolMarks(params: {
  positions: PoolMarkInput[]
  /** Live feed price, used only to carry the mark between quotes. */
  feedPrice: number
  enabled?: boolean
}): Record<string, number> {
  const { positions, feedPrice, enabled = true } = params
  const [quotes, setQuotes] = useState<Record<string, Quote>>({})

  // The effect must re-run when the SET of positions changes, not when the feed
  // ticks (that would re-quote every 2.5s) and not on every render of a new array
  // identity. Key off the ids+sizes that actually determine the quote.
  const positionKey = positions
    .map((p) => `${p.id}:${p.side}:${p.collateralAmount}`)
    .join('|')
  // Read inside the interval without making the interval depend on them.
  const positionsRef = useRef(positions)
  positionsRef.current = positions
  const feedRef = useRef(feedPrice)
  feedRef.current = feedPrice

  useEffect(() => {
    if (!enabled || positionsRef.current.length === 0) return
    let cancelled = false

    const quoteAll = async () => {
      const current = positionsRef.current
      const feed = feedRef.current
      const results = await Promise.all(
        current.map(async (p): Promise<[string, Quote] | null> => {
          if (!(p.collateralAmount > 0)) return null
          // The close swaps position asset → debt asset: the reverse of the open,
          // which is why the indices are read back-to-front here (mirrors
          // `swapAndFinish`).
          const { swapInIdx, swapOutIdx } = SIDE_MAPPING[p.side]
          const positionAsset = p.side === 'Long' ? CFG.assets.XLM : CFG.assets.MOCK_USDT
          const amountRaw = BigInt(Math.round(p.collateralAmount * 10 ** positionAsset.decimals))
          if (amountRaw <= BigInt(0)) return null
          try {
            const proceeds = await estimatePoolSwap(swapOutIdx, swapInIdx, amountRaw)
            const price = executionExitPrice({
              side: p.side,
              positionUnderlying: amountRaw,
              proceeds,
              usdtDecimals: CFG.assets.MOCK_USDT.decimals,
              xlmDecimals: CFG.assets.XLM.decimals,
            })
            if (price == null || !(price > 0)) return null
            return [p.id, { price, feedAtQuote: feed }]
          } catch {
            // A failed quote keeps the previous one (or no entry at all) — the
            // caller falls back to the feed rather than showing a hole.
            return null
          }
        }),
      )
      if (cancelled) return
      const fresh = Object.fromEntries(results.filter(Boolean) as Array<[string, Quote]>)
      // Merge rather than replace, and drop the positions that are gone: a single
      // failed quote must not wipe a mark that was fine a moment ago.
      setQuotes((prev) => {
        const live = new Set(current.map((p) => p.id))
        const next: Record<string, Quote> = {}
        for (const [id, q] of Object.entries({ ...prev, ...fresh })) {
          if (live.has(id)) next[id] = q
        }
        return next
      })
    }

    void quoteAll()
    const timer = setInterval(quoteAll, REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [enabled, positionKey])

  // Carry each quote forward with the feed's move since it was taken. The basis
  // (pool minus feed) is what changes slowly; the price itself does not, and a
  // mark frozen for 20s would make the live ticker look broken.
  //
  // Driven by the CURRENT positions rather than by whatever is in `quotes`: the
  // effect bails out early when there are no positions left to quote, so closing
  // the last one would otherwise leave its mark standing in the map forever.
  const marks: Record<string, number> = {}
  for (const p of positions) {
    const q = quotes[p.id]
    if (!q) continue
    const drift = feedPrice > 0 && q.feedAtQuote > 0 ? feedPrice - q.feedAtQuote : 0
    const mark = q.price + drift
    if (mark > 0) marks[p.id] = mark
  }
  return marks
}

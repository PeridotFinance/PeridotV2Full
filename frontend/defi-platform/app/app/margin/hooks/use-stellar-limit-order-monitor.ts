'use client'

/**
 * use-stellar-limit-order-monitor — fires resting limit orders from the tab.
 *
 * The sibling of use-stellar-tpsl-monitor, pointed at entries instead of exits:
 * while the margin page is open it watches the live feed, and the moment the
 * mark reaches an order's limit it runs the ordinary open flow with the order's
 * size, leverage, slippage and TP/SL. Same honest limits — resolution is the
 * feed's cadence, it only works while the page is open, and every order gets
 * exactly ONE attempt: a failed fire is recorded as `failed` with the reason
 * and never retried on its own, because retrying a leveraged open in a loop is
 * how a trader ends up with three positions they meant as one.
 *
 * Settlement first, then the trade: the order is moved out of `open` on the
 * server BEFORE the open flow starts. A settle that fails aborts the fire. That
 * ordering costs a rare "marked filled, open didn't land" (corrected to `failed`
 * right after) and buys the guarantee that two tabs — or a tab and its
 * reload — can never fire the same order twice: the second settle answers 409.
 */
import { useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useStellarMarginOpen, type OpenedInfo } from './use-stellar-margin-open'
import { isMarginFlowBusy } from '../lib/marginFlowLock'
import { evaluateLimitOrderTrigger, formatTriggerPrice } from '../lib/marginMath'
import { STELLAR_MARGIN_CONFIG as CFG } from '../config/stellarMarginConfig'
import type { LimitOrder, SettleLimitOrderInput } from './use-stellar-limit-orders'
import type { StellarMarginAsset } from '../types/stellarMargin'

interface Params {
  orders: LimitOrder[]
  assets: StellarMarginAsset[]
  /** Live XLM/USD feed price (from the chart's onLivePrice). */
  price: number
  enabled: boolean
  settle: (input: SettleLimitOrderInput) => Promise<boolean>
  /** A position was opened by an order (or a fire changed on-chain state). */
  onFilled?: (info?: OpenedInfo) => void
}

export interface LimitOrderMonitor {
  /** Orders currently resting and watched by this tab. */
  watchingCount: number
}

/** Pause after a fire before the next order may go, so a burst of triggered
 *  orders never overlaps the refetch that follows the previous open. */
const COOLDOWN_MS = 8_000

export function useStellarLimitOrderMonitor({ orders, assets, price, enabled, settle, onFilled }: Params): LimitOrderMonitor {
  // The open hook's callback is how the new position id reaches us; hold the
  // latest one in a ref because the hook fires it from inside its own flow.
  const openedRef = useRef<OpenedInfo | undefined>(undefined)
  const { openPosition } = useStellarMarginOpen((info) => {
    openedRef.current = info
    onFilled?.(info)
  })
  const firingRef = useRef(false)
  const handledRef = useRef<Set<number>>(new Set())
  const cooldownUntilRef = useRef(0)

  useEffect(() => {
    const live = new Set(orders.filter((o) => o.status === 'open').map((o) => o.id))
    handledRef.current.forEach((id) => { if (!live.has(id)) handledRef.current.delete(id) })
  }, [orders])

  const fire = useCallback(async (order: LimitOrder, mark: number) => {
    firingRef.current = true
    const label = `${order.side} ${order.leverage}× at $${formatTriggerPrice(order.limitPriceUsd)}`
    try {
      const usdt = assets.find((a) => a.key === 'MOCK_USDT')
      const available = usdt?.marginUnderlying ?? 0
      // The order was sized against a balance that may have been spent since.
      // Check before touching the server: a shortfall is a `failed` order with
      // a reason the trader can act on, not a trapped open.
      if (!usdt || usdt.exchangeRate <= BigInt(0)) {
        await settle({ id: order.id, status: 'failed', failReason: 'Your margin balance couldn’t be read when the order triggered.', firedPriceUsd: mark })
        return
      }
      if (available + 1e-9 < order.collateralUsdt) {
        await settle({
          id: order.id, status: 'failed', firedPriceUsd: mark,
          failReason: `Not enough margin when it triggered — the order needed ${order.collateralUsdt.toFixed(2)} USDT, you had ${available.toFixed(2)}.`,
        })
        toast.error(`Your limit order (${label}) triggered but you didn’t have enough margin for it.`, { id: `limit-fail-${order.id}`, duration: Infinity, closeButton: true })
        return
      }

      // Claim the order. A 409 means another tab already did.
      const claimed = await settle({ id: order.id, status: 'filled', firedPriceUsd: mark })
      if (!claimed) return

      toast.info(`Limit reached — opening your ${label} order`, { id: `limit-fire-${order.id}` })
      const SCALE = CFG.constants.EXCHANGE_SCALE
      const underlyingRaw = BigInt(Math.floor(order.collateralUsdt * 10 ** usdt.decimals))
      let collateralPtokens = (underlyingRaw * SCALE) / usdt.exchangeRate
      if (collateralPtokens > usdt.marginPtokensRaw) collateralPtokens = usdt.marginPtokensRaw

      openedRef.current = undefined
      const ok = await openPosition({
        side: order.side,
        collateralPtokens,
        leverage: order.leverage,
        slippageBps: order.slippageBps,
        takeProfit: order.takeProfitUsd,
        stopLoss: order.stopLossUsd,
      })
      if (ok) {
        const positionId = openedRef.current?.positionId ?? null
        // Re-settle with the position id; the row is already `filled`, so this
        // is a plain best-effort annotation (409 is fine).
        if (positionId) await settle({ id: order.id, status: 'filled', positionId, firedPriceUsd: mark })
        toast.success(`Limit order filled — your ${label} position is open.`, { id: `limit-fire-${order.id}` })
      } else {
        // The open hook already surfaced the specific reason in its own UI; the
        // row keeps a plain sentence so the Orders tab can say what happened.
        await settle({ id: order.id, status: 'failed', firedPriceUsd: mark, failReason: 'The order triggered but the position couldn’t be opened. Nothing was traded — check Unfinished if collateral looks locked.' })
        toast.error(`Your limit order (${label}) triggered but couldn’t open, and it won’t retry on its own. Place it again if you still want it.`, { id: `limit-fire-${order.id}`, duration: Infinity, closeButton: true })
      }
    } finally {
      cooldownUntilRef.current = Date.now() + COOLDOWN_MS
      firingRef.current = false
    }
  }, [assets, openPosition, settle])

  useEffect(() => {
    if (!enabled || !(price > 0) || firingRef.current || isMarginFlowBusy()) return
    if (Date.now() < cooldownUntilRef.current) return
    for (const o of orders) {
      if (o.status !== 'open' || handledRef.current.has(o.id)) continue
      if (Date.parse(o.expiresAt) <= Date.now()) continue // the server flips it on the next read
      if (evaluateLimitOrderTrigger({ side: o.side, limitPrice: o.limitPriceUsd, price })) {
        handledRef.current.add(o.id)
        void fire(o, price)
        break // one open at a time; the next tick handles the rest
      }
    }
  }, [price, orders, enabled, fire])

  const watchingCount = orders.reduce((n, o) => n + (o.status === 'open' && !handledRef.current.has(o.id) ? 1 : 0), 0)
  return { watchingCount }
}

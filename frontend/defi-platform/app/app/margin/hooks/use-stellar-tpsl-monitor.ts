'use client'

/**
 * use-stellar-tpsl-monitor — client-side Take-Profit / Stop-Loss watcher.
 *
 * While the margin page is open, this watches the live XLM/USD feed and auto-closes
 * any open position whose price has crossed its TP or SL trigger. It's the
 * "works-while-the-tab-is-open" execution layer — a true always-on keeper needs
 * server-side Stellar signing, which Privy doesn't offer (server-auth is eth/solana
 * only), so that path is blocked on a scoped Soroban session sub-key (contract work).
 *
 * Honest limits, by design:
 *   - Resolution is the chart feed's refetch cadence (the page passes `price` from
 *     `onLivePrice`), so triggers fire on the next feed tick, not instantly.
 *   - Real-mode close goes through the normal repay-only path (needs the debt asset
 *     in the wallet + a signature); reuses the close hook.
 *   - One attempt per crossing: a failed auto-close is NOT retried in a loop (no toast
 *     spam) — the user is told to close manually. It re-arms only if a NEW position id
 *     appears, never silently.
 */
import { useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useStellarMarginClose, isMarginCloseBusy } from './use-stellar-margin-close'
import { evaluateTpSlTrigger } from '../lib/marginMath'
import type { StellarMarginPosition } from '../types/stellarMargin'

type TpSlMap = Record<string, { takeProfit?: number | null; stopLoss?: number | null }>

interface Params {
  positions: StellarMarginPosition[]
  /** positionId → TP/SL triggers (joined from the journal). */
  tpSlByPosition?: TpSlMap
  /** Live XLM/USD feed price (from the chart's onLivePrice). */
  price: number
  enabled: boolean
  /** Called with the closed position id after a successful auto-close. */
  onClosed?: (positionId: string) => void
}

function resolveTp(p: StellarMarginPosition, map?: TpSlMap): number | null | undefined {
  return p.takeProfitUsd ?? map?.[p.id]?.takeProfit
}
function resolveSl(p: StellarMarginPosition, map?: TpSlMap): number | null | undefined {
  return p.stopLossUsd ?? map?.[p.id]?.stopLoss
}

export interface TpSlMonitor {
  /** Count of open positions currently being watched (have a TP or SL set). */
  armedCount: number
}

export function useStellarTpSlMonitor({ positions, tpSlByPosition, price, enabled, onClosed }: Params): TpSlMonitor {
  const { closePosition } = useStellarMarginClose(onClosed)
  // Position ids already actioned this session (fired once, win or lose).
  const handledRef = useRef<Set<string>>(new Set())
  // Serialize closes — never run two repay-only closes at once.
  const firingRef = useRef(false)
  // Last-seen TP/SL signature per id → re-arm when the user edits the triggers.
  const lastSigRef = useRef<Map<string, string>>(new Map())

  // Prune handled ids for positions that no longer exist (closed/reconciled), so a
  // brand-new position with the same logical setup can still arm.
  useEffect(() => {
    const live = new Set(positions.map((p) => p.id))
    handledRef.current.forEach((id) => { if (!live.has(id)) handledRef.current.delete(id) })
    lastSigRef.current.forEach((_, id) => { if (!live.has(id)) lastSigRef.current.delete(id) })
  }, [positions])

  // Re-arm a position whose TP/SL the user just changed (a value change only — not
  // the steady state right after a fire, which keeps the same signature).
  useEffect(() => {
    for (const p of positions) {
      const sig = `${resolveTp(p, tpSlByPosition) ?? ''}|${resolveSl(p, tpSlByPosition) ?? ''}`
      if (lastSigRef.current.get(p.id) !== sig) {
        lastSigRef.current.set(p.id, sig)
        handledRef.current.delete(p.id)
      }
    }
  }, [positions, tpSlByPosition])

  const fire = useCallback(async (p: StellarMarginPosition, kind: 'tp' | 'sl') => {
    if (firingRef.current) return
    firingRef.current = true
    try {
      toast.info(
        `${kind === 'tp' ? 'Take-profit' : 'Stop-loss'} hit — closing your ${p.side} ${p.leverage.toFixed(1)}× position`,
      )
      const ok = await closePosition(p)
      // On failure the close hook already surfaced the reason; we keep the id marked
      // (one-shot) so we don't loop error toasts. User can close manually.
      //
      // This notice does NOT expire. A stop-loss that failed to fire is the single
      // most consequential thing this page can tell a trader, and it used to say it
      // in a 4-second toast: miss it, and the position sits there looking protected
      // by a trigger that will never fire again this session. Say plainly that the
      // trigger is spent, and keep it on screen until dismissed.
      if (!ok) {
        toast.error(
          `Your ${kind === 'tp' ? 'take-profit' : 'stop-loss'} couldn’t close the position, and it won’t try again on its own. ` +
          'Close it from Positions, or re-save the trigger to arm it again.',
          { id: `margin-tpsl-failed-${p.id}`, duration: Infinity, closeButton: true },
        )
      }
    } finally {
      firingRef.current = false
    }
  }, [closePosition])

  useEffect(() => {
    // Also stand down while ANY close is running (manual, recovery banner, or this
    // monitor). Firing into a busy lock would be rejected outright, and because a
    // trigger is one-shot the position would end up marked handled without ever
    // having been closed. Deferring instead re-evaluates on the next feed tick.
    if (!enabled || !(price > 0) || firingRef.current || isMarginCloseBusy()) return
    for (const p of positions) {
      if (handledRef.current.has(p.id)) continue
      const hit = evaluateTpSlTrigger({
        side: p.side,
        takeProfit: resolveTp(p, tpSlByPosition),
        stopLoss: resolveSl(p, tpSlByPosition),
        price,
      })
      if (hit) {
        handledRef.current.add(p.id) // mark before firing → never double-fires
        void fire(p, hit)
        break // one close at a time; the next tick handles any others
      }
    }
  }, [price, positions, tpSlByPosition, enabled, fire])

  const armedCount = positions.reduce((n, p) => {
    const tp = resolveTp(p, tpSlByPosition)
    const sl = resolveSl(p, tpSlByPosition)
    return n + ((tp != null || sl != null) && !handledRef.current.has(p.id) ? 1 : 0)
  }, 0)

  return { armedCount }
}

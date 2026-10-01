'use client'

/**
 * Where you stand, while you are looking at something else.
 *
 * On a phone the layout is one column: order form, then a 420px chart, then the
 * activity panel. So the moment a trade is placed, the thing the trader most
 * wants to watch — their own position — is two screens below the fold, and the
 * app they are staring at is a chart that says nothing about them. They scroll
 * down, then back up to trade, then down again.
 *
 * This is the answer to "am I up?" without the round trip, and a way back to the
 * table in one tap. Desktop already answers it (the panel is beside the chart),
 * so the bar is mobile-only.
 *
 * Two things it will not do:
 *
 *   Print a zero it hasn't earned. A position has no PnL until its entry price
 *   and its pool mark are both known; until then this says "—", because "$0.00"
 *   is a claim about the trade and "we don't know yet" is not.
 *
 *   Compete with the recovery banners. Those are about money that is stuck and
 *   need a decision; this is ambient. It sits under them in the z-order and
 *   never opens anything by itself.
 */
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MARGIN_HEALTH_CRITICAL } from '../../lib/riskAlerts'

interface Props {
  count: number
  totalPnlUsd: number
  /** False while no position has a usable entry+mark yet — show "—", not zero. */
  anyPnl: boolean
  /** Lowest health factor across the open positions; null when unreadable. */
  worstHealth: number | null
  onView: () => void
}

/** Health below which the bar stops being ambient and turns amber. The same
 *  line the positions table paints red and the liquidation warnings fire on —
 *  three surfaces disagreeing about what "close" means would be worse than any
 *  one of them being slightly off. */
const HEALTH_WARN = MARGIN_HEALTH_CRITICAL

export function StellarMobilePositionBar({ count, totalPnlUsd, anyPnl, worstHealth, onView }: Props) {
  const atRisk = worstHealth != null && worstHealth < HEALTH_WARN
  const pnl = Math.round(totalPnlUsd * 100) / 100
  const up = pnl > 0

  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.div
          initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          data-testid="margin-mobile-position-bar"
          className="lg:hidden fixed inset-x-0 bottom-0 z-30 px-3 pb-3 pt-2 pointer-events-none"
        >
          <button
            onClick={onView}
            className={cn(
              'pointer-events-auto w-full flex items-center gap-3 rounded-2xl px-4 py-3 shadow-lg backdrop-blur-xl',
              'border transition-colors text-left',
              atRisk
                ? 'border-amber-500/40 bg-amber-500/15 hover:bg-amber-500/20'
                : 'border-white/12 bg-background/85 hover:bg-background/95',
            )}
          >
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-muted-foreground">
                {count} position{count === 1 ? '' : 's'} open
                {atRisk && <span className="text-amber-700 dark:text-amber-300 font-semibold"> · close to liquidation</span>}
              </p>
              <p className={cn(
                'text-base font-bold tabular-nums leading-tight',
                !anyPnl ? 'text-muted-foreground/60' : pnl === 0 ? 'text-foreground' : up ? 'text-emerald-400' : 'text-red-400',
              )}>
                {!anyPnl ? '—' : `${up ? '+' : ''}$${pnl.toFixed(2)}`}
              </p>
            </div>
            <span className="shrink-0 flex items-center gap-1 text-[11px] font-semibold text-primary">
              View <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

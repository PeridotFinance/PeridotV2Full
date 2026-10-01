'use client'

/**
 * StellarCloseResult — the payoff moment. When a position closes we surface the
 * realized PnL big and immediately, with a win/loss reaction (confetti on green),
 * instead of letting the number land silently in the History tab.
 *
 * PnL is computed client-side from the entry (recorded) vs the live exit price in
 * the same feed domain the ticker used — so the result matches what the trader
 * just watched move. Pure Framer Motion overlay.
 */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { PartyPopper, TrendingDown, Minus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PositionSide } from '../../types/stellarMargin'

export interface CloseResult {
  side: PositionSide
  pnlUsd: number
  roe: number
  /** What lands back in the margin account: the position's value minus its debt,
   *  as of the tick the close landed on. Optional so a caller that has no such
   *  figure simply omits the breakdown rather than printing a wrong one. */
  returnedUsd?: number
}

/**
 * Below this the result rounds to $0.00 on screen, so celebrating it (confetti,
 * "nice one!", green) claims a win the trader can't see in the number. Scratches
 * get their own neutral state.
 */
const FLAT_EPSILON = 0.005

/**
 * The overlay covers the whole page, so it must not depend on the user finding the
 * one way out. It now closes on a tap anywhere, on Escape, via an explicit button,
 * and on its own after this long — matching the open celebration, which has always
 * auto-dismissed. Longer than that one (3s) because there is a number to read here.
 */
const AUTO_DISMISS_MS = 6_000

const DOTS = Array.from({ length: 20 }, (_, i) => {
  const angle = (i / 20) * Math.PI * 2
  const distance = 80 + ((i * 13) % 60)
  return {
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance,
    rotate: (i * 137) % 360,
    isAmber: i % 3 === 0,
    delay: 0.04 + (i % 6) * 0.025,
  }
})

export function StellarCloseResult({ result, onDismiss }: { result: CloseResult; onDismiss: () => void }) {
  const outcome: 'win' | 'loss' | 'flat' =
    Math.abs(result.pnlUsd) < FLAT_EPSILON ? 'flat' : result.pnlUsd > 0 ? 'win' : 'loss'
  const win = outcome === 'win'
  const loss = outcome === 'loss'
  // Portal to <body> so the full-screen overlay escapes the panel's backdrop-blur
  // ancestor (a filtered/transformed parent traps `position: fixed`).
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  // Escape + auto-dismiss. Both call the same handler the tap does.
  //
  // `onDismiss` is an inline arrow in the parent, so it gets a new identity on every
  // render — and the parent re-renders on each price tick (~2.5s). Depending on it
  // directly meant the cleanup cancelled and restarted the 6s timer every 2.5s, so
  // it could never fire. Hold it in a ref and arm the timer exactly once.
  const dismissRef = useRef(onDismiss)
  dismissRef.current = onDismiss
  useEffect(() => {
    const fire = () => dismissRef.current()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') fire() }
    window.addEventListener('keydown', onKey)
    const t = setTimeout(fire, AUTO_DISMISS_MS)
    return () => { window.removeEventListener('keydown', onKey); clearTimeout(t) }
  }, [])

  if (!mounted) return null

  // Brand green (`primary`), not emerald — see the note in StellarOpenCelebration.
  const toneText = win ? 'text-primary' : loss ? 'text-red-400' : 'text-foreground/70'
  // Border and accent only — the card's own fill is opaque (see below). A 5%-tint
  // card over a blurred backdrop sounds nice and reads as a rendering fault: the
  // positions table showed straight through the number, "$-1.00" sitting on top of
  // "217.6735 XLM". The tint was never what carried the win/loss signal anyway; the
  // icon, the border and the colour of the figure do that.
  const toneBorder = win ? 'border-primary/30' : loss ? 'border-red-500/30' : 'border-white/15'
  const toneIconBg = win ? 'bg-primary/20 text-primary' : loss ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-muted-foreground'

  return createPortal((
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onDismiss}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-background/70 backdrop-blur-md cursor-pointer p-4"
    >
      {win && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          {DOTS.map((d, i) => (
            <motion.span
              key={i}
              initial={{ opacity: 0, x: 0, y: 0, scale: 0, rotate: 0 }}
              animate={{ opacity: [0, 1, 0], x: d.x, y: d.y, scale: [0, 1, 0.6], rotate: d.rotate }}
              transition={{ duration: 1.1, delay: d.delay, ease: [0.22, 0, 0.36, 1] }}
              className={cn('absolute w-2 h-2 rounded-sm', d.isAmber ? 'bg-amber-400' : 'bg-primary')}
            />
          ))}
        </div>
      )}

      <motion.div
        initial={{ scale: 0.7, y: 16, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        className={cn('relative flex flex-col items-center gap-3 rounded-2xl border px-8 py-7 text-center bg-background/95 backdrop-blur-xl shadow-2xl', toneBorder)}
      >
        {/* Explicit control — "tap anywhere" is discoverable only after you try it. */}
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="absolute right-2.5 top-2.5 grid h-7 w-7 place-items-center rounded-full text-muted-foreground/50 transition-colors hover:bg-white/10 hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1, rotate: win ? [0, -10, 10, 0] : 0 }}
          transition={{ scale: { delay: 0.1, type: 'spring', stiffness: 300, damping: 12 }, rotate: { delay: 0.1, duration: 0.55, ease: 'easeInOut' } }}
          className={cn('w-16 h-16 rounded-full flex items-center justify-center', toneIconBg)}
        >
          {win ? <PartyPopper className="w-8 h-8" /> : loss ? <TrendingDown className="w-8 h-8" /> : <Minus className="w-8 h-8" />}
        </motion.div>

        <div className="text-sm font-semibold text-muted-foreground/70">
          {win ? 'Position closed — nice one!' : loss ? 'Position closed' : 'Position closed — you broke even'}
        </div>

        <div className={cn('text-4xl font-black tabular-nums', toneText)}>
          {win ? '+' : ''}${result.pnlUsd.toFixed(2)}
        </div>
        <div className={cn('text-base font-bold tabular-nums', toneText, 'opacity-80')}>
          {result.roe >= 0 ? '+' : ''}{result.roe.toFixed(1)}% on margin
        </div>

        {/* Where the money went. A 1.2× position hands back close to its full value,
            and without this line that arrival reads as invented money rather than
            the trader's own stake coming home. Spelling out stake ± PnL = returned
            is the whole point; the PnL alone never explained the balance jump. */}
        {result.returnedUsd != null && (
          <div className="mt-1 w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5">
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-[11px] text-muted-foreground/70">Back in your account</span>
              <span className="text-sm font-bold tabular-nums">${result.returnedUsd.toFixed(2)}</span>
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-4 text-[10px] text-muted-foreground/50">
              <span>your stake ${Math.max(result.returnedUsd - result.pnlUsd, 0).toFixed(2)}</span>
              <span className={cn(result.pnlUsd >= 0 ? 'text-primary/70' : 'text-red-500/70')}>
                {result.pnlUsd >= 0 ? '+' : '−'}${Math.abs(result.pnlUsd).toFixed(2)} {result.pnlUsd >= 0 ? 'profit' : 'loss'}
              </span>
            </div>
          </div>
        )}

        <div className="text-[11px] text-muted-foreground/40 mt-1">tap anywhere to dismiss</div>
      </motion.div>
    </motion.div>
  ), document.body)
}

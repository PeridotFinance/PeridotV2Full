'use client'

/**
 * StellarOpenCelebration — the emotional beat the moment a leveraged position
 * goes live. A confetti burst + a card that snaps in with the side/leverage/size,
 * so opening *feels* like something instead of a button flipping green.
 *
 * Pure Framer Motion (confetti adapted from EasyModeTxStatus) — no extra dep.
 * One-shot: the parent renders it on the idle→success transition and clears it
 * after the auto-dismiss.
 *
 * Green here is the brand token (`primary`, hsl(150 59% 48%)), not Tailwind's
 * emerald. The two are far enough apart in hue that they read as two different
 * greens — and this card showed both at once, an emerald LONG badge beside a
 * brand-green leverage badge on the same row.
 */
import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, X, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PositionSide } from '../../types/stellarMargin'

interface Props {
  side: PositionSide
  leverage: number
  positionUsd: number
  onDismiss: () => void
}

// Radial confetti — deterministic spread so SSR/CSR don't drift.
const DOTS = Array.from({ length: 18 }, (_, i) => {
  const angle = (i / 18) * Math.PI * 2
  const distance = 70 + ((i * 11) % 50)
  return {
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance,
    rotate: (i * 137) % 360,
    isAmber: i % 3 === 0,
    delay: 0.04 + (i % 6) * 0.025,
  }
})

export function StellarOpenCelebration({ side, leverage, positionUsd, onDismiss }: Props) {
  const isLong = side === 'Long'

  // Escape, like the close result has. This overlay covers the whole order form
  // and swallows every click in it, so "tap to dismiss" cannot be the only exit.
  // `onDismiss` is an inline arrow in the parent, which re-renders on each price
  // tick — hold it in a ref so the listener is bound exactly once.
  const dismissRef = useRef(onDismiss)
  dismissRef.current = onDismiss
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') dismissRef.current() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // The fill is opaque rather than a tint: the backdrop-blur doesn't take here, so
  // at 70% the order form stayed legible straight through the message and the size
  // landed on top of the Take-Profit rows. Same fault the close result had.
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onDismiss}
      data-testid="margin-open-celebration"
      className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-background/95 backdrop-blur-md cursor-pointer"
    >
      {/* Confetti burst */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        {DOTS.map((d, i) => (
          <motion.span
            key={i}
            initial={{ opacity: 0, x: 0, y: 0, scale: 0, rotate: 0 }}
            animate={{ opacity: [0, 1, 0], x: d.x, y: d.y, scale: [0, 1, 0.6], rotate: d.rotate }}
            transition={{ duration: 1.0, delay: d.delay, ease: [0.22, 0, 0.36, 1] }}
            className={cn('absolute w-1.5 h-1.5 rounded-sm',
              d.isAmber ? 'bg-amber-400' : isLong ? 'bg-primary' : 'bg-red-400')}
          />
        ))}
      </div>

      <motion.div
        initial={{ scale: 0.7, y: 12, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 320, damping: 20 }}
        className="relative flex flex-col items-center gap-2 px-6 py-5 text-center"
      >
        {/* Explicit control — "tap anywhere" is only discoverable after you try it. */}
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="absolute -right-1 -top-1 grid h-7 w-7 place-items-center rounded-full text-muted-foreground/50 transition-colors hover:bg-white/10 hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1, rotate: [0, -8, 8, 0] }}
          transition={{ scale: { delay: 0.1, type: 'spring', stiffness: 300, damping: 12 }, rotate: { delay: 0.1, duration: 0.5, ease: 'easeInOut' } }}
          className={cn('w-14 h-14 rounded-full flex items-center justify-center mb-1',
            isLong ? 'bg-primary/20 text-primary' : 'bg-red-500/20 text-red-400')}
        >
          {isLong ? <TrendingUp className="w-7 h-7" /> : <TrendingDown className="w-7 h-7" />}
        </motion.div>
        <div className="text-lg font-black text-foreground">You&apos;re in! 🚀</div>
        <div className="flex items-center gap-2 text-sm font-bold">
          <span className={cn('px-2 py-0.5 rounded', isLong ? 'bg-primary/15 text-primary' : 'bg-red-500/15 text-red-400')}>
            {side.toUpperCase()}
          </span>
          <span className="px-2 py-0.5 rounded bg-primary/10 text-primary inline-flex items-center gap-1">
            <Zap className="w-3 h-3" />{leverage}× XLM
          </span>
        </div>
        <div className="text-2xl font-black tabular-nums text-foreground mt-1">${positionUsd.toFixed(2)}</div>
        <div className="text-[11px] text-muted-foreground/60">Position size · watch your PnL move below</div>
        <div className="text-[10px] text-muted-foreground/40 mt-2">tap to dismiss</div>
      </motion.div>
    </motion.div>
  )
}

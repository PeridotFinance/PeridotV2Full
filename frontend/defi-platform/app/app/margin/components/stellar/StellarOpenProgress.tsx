'use client'

/**
 * The "please wait, we're finalising your trade" overlay for the multi-step
 * open flow.
 *
 * Opening a leveraged position is three separate signed calls (begin → swap →
 * activate) and takes several seconds of real ledger time. Until now the only
 * signals that anything was happening were a spinner inside the button and a
 * 3px stepper bar — so the flow read as "nothing happened", people tapped away
 * mid-flight, and the trade landed as a stranded PendingOpen that then needed
 * the Finish banner. This overlay is the fix: it says plainly that work is in
 * flight, which of the three steps is running, and that the page should stay
 * open.
 *
 * It covers the viewport rather than the order form, deliberately: the same
 * flow is driven from two places — a fresh open in StellarOpenPanel and a
 * resume from the pending banner on the page, each with its own hook instance
 * — and a panel-scoped overlay would leave the resume with no feedback at all.
 *
 * It has no dismiss control on purpose. There is a signed transaction in
 * flight; offering an X would imply it can be called off, which it cannot. It
 * disappears when the flow leaves its loading states.
 *
 * Copy stays fintech, not crypto (no hashes, no gas, no "Soroban"), per the
 * house rule the rest of the margin surface follows.
 */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { Check, Loader2, TrendingDown, TrendingUp } from 'lucide-react'
import { useReducedMotion } from '@/lib/use-reduced-motion'
import { cn } from '@/lib/utils'
import type { OpenStep } from '../../hooks/use-stellar-margin-open'
import type { PositionSide } from '../../types/stellarMargin'

/** The three on-chain steps, in order, in the user's language. */
const STEPS = [
  // Not "Opening your position" — that is the heading above, and repeating it
  // as step 1 read as though the card were stuck on its own title.
  { key: 'beginning', label: 'Reserving your collateral', detail: 'Setting the margin aside for this trade' },
  { key: 'swapping', label: 'Building your exposure', detail: 'Converting at the best available price' },
  { key: 'activating', label: 'Locking it in', detail: 'Making the position live' },
] as const

/**
 * How far along each hook step is. `quoting` maps to 0 — nothing is signed yet,
 * so no step may show as done — while `success` maps past the end so all three
 * land on their tick during the hand-off to the celebration.
 */
const STEP_INDEX: Record<OpenStep, number> = {
  idle: 0,
  quoting: 0,
  beginning: 1,
  swapping: 2,
  activating: 3,
  success: 4,
  error: 0,
}

interface Props {
  step: OpenStep
  /** Colours the ring; omit when resuming, where the side is already on the banner. */
  side?: PositionSide
  /** "Finishing your position" reads better than "Opening" on a resume. */
  isResume?: boolean
}

export function StellarOpenProgress({ step, side, isResume = false }: Props) {
  const { prefersReducedMotion } = useReducedMotion()
  const current = STEP_INDEX[step]

  // Portalled to <body> because the order form it mounts inside carries
  // `backdrop-blur-xl` + `overflow-hidden`: a backdrop-filter makes that panel
  // the containing block for fixed descendants, so `fixed inset-0` would size
  // itself to the panel and then get clipped by it instead of covering the
  // viewport. Mounted client-side only — document doesn't exist during SSR.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null
  const isLong = side !== 'Short'
  const accent = side === 'Short' ? 'text-red-400' : 'text-primary'
  const accentBg = side === 'Short' ? 'bg-red-500/15' : 'bg-primary/15'
  const accentRing = side === 'Short' ? 'border-t-red-400' : 'border-t-primary'

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      data-testid="margin-open-progress"
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-background/92 backdrop-blur-md p-4"
    >
      <motion.div
        initial={{ scale: 0.94, y: 10, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 24 }}
        className="w-full max-w-sm rounded-2xl border border-foreground/10 bg-background/80 px-6 py-7 shadow-xl"
      >
        {/* Ring — one continuous sweep, so the wait always looks alive even
            while a single step sits on the network for several seconds. */}
        <div className="relative mx-auto mb-5 h-16 w-16">
          <div className="absolute inset-0 rounded-full border-2 border-foreground/10" />
          {!prefersReducedMotion && (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1.4, repeat: Infinity, ease: 'linear' }}
              className={cn('absolute inset-0 rounded-full border-2 border-transparent', accentRing)}
            />
          )}
          <motion.div
            animate={prefersReducedMotion ? undefined : { scale: [1, 1.08, 1] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            className={cn('absolute inset-2 grid place-items-center rounded-full', accentBg, accent)}
          >
            {isLong ? <TrendingUp className="h-6 w-6" /> : <TrendingDown className="h-6 w-6" />}
          </motion.div>
        </div>

        <h2 className="text-center text-base font-black text-foreground">
          {isResume ? 'Finishing your position' : 'Opening your position'}
        </h2>
        <p className="mt-1 text-center text-xs text-muted-foreground">
          This takes a few seconds — keep this page open.
        </p>

        <ol className="mt-5 space-y-2.5">
          {STEPS.map((s, i) => {
            const n = i + 1
            const done = current > n
            const active = current === n
            return (
              <li key={s.key} className="flex items-start gap-3">
                <span
                  className={cn(
                    'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[10px] font-bold transition-colors',
                    done && 'border-primary/40 bg-primary/15 text-primary',
                    active && cn('border-transparent', accentBg, accent),
                    !done && !active && 'border-foreground/15 text-muted-foreground/40',
                  )}
                >
                  {done ? (
                    <Check className="h-3 w-3" />
                  ) : active ? (
                    <Loader2 className={cn('h-3 w-3', !prefersReducedMotion && 'animate-spin')} />
                  ) : (
                    n
                  )}
                </span>
                <span className="min-w-0">
                  <span
                    className={cn(
                      'block text-sm font-semibold transition-colors',
                      active ? 'text-foreground' : done ? 'text-foreground/70' : 'text-muted-foreground/50',
                    )}
                  >
                    {s.label}
                  </span>
                  {/* Only the running step explains itself — showing all three
                      subtitles at once turns the card into a wall of text. */}
                  {active && (
                    <motion.span
                      initial={{ opacity: 0, y: -2 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="block text-[11px] text-muted-foreground"
                    >
                      {s.detail}
                    </motion.span>
                  )}
                </span>
              </li>
            )
          })}
        </ol>

        {/* Indeterminate bar: honest about progress (we can't predict ledger
            time) while still moving, which is what stops the wait feeling stuck. */}
        <div className="mt-5 h-1 overflow-hidden rounded-full bg-foreground/10">
          {prefersReducedMotion ? (
            <div
              className={cn('h-full rounded-full transition-all duration-500', side === 'Short' ? 'bg-red-400' : 'bg-primary')}
              style={{ width: `${Math.min(100, (current / STEPS.length) * 100)}%` }}
            />
          ) : (
            <motion.div
              animate={{ x: ['-100%', '250%'] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
              className={cn('h-full w-2/5 rounded-full', side === 'Short' ? 'bg-red-400' : 'bg-primary')}
            />
          )}
        </div>

        <p className="mt-3 text-center text-[10px] text-muted-foreground/50">
          Your wallet may ask you to confirm each step.
        </p>
      </motion.div>
    </motion.div>,
    document.body,
  )
}

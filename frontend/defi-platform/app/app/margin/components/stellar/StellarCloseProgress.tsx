'use client'

/**
 * The "please wait, we're settling your trade" overlay for the multi-step close.
 *
 * The open flow has had one since day one (StellarOpenProgress); the close — the
 * longer and more nerve-wracking of the two — had a 12px spinner inside a button,
 * and on desktop not even a label next to it. Closing is four signed calls plus
 * two deliberate waits for the ledger, so it regularly runs for the better part
 * of a minute with nothing on screen saying so. That silence is what produced the
 * report this component answers: a trader pressed Close twice, believing the
 * first press had done nothing.
 *
 * Same visual language as the open overlay on purpose — the two flows should not
 * feel like they were built by different people — with the close's own three steps
 * and its own reassurance ("your position stays exactly as it is until this
 * finishes"), which is the thing a closing trader actually wants to know.
 *
 * No dismiss control, for the same reason as the open: there are signed
 * transactions in flight and an X would imply they can be called off.
 */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { Check, Loader2, X } from 'lucide-react'
import { useReducedMotion } from '@/lib/use-reduced-motion'
import { cn } from '@/lib/utils'
import type { CloseStep } from '../../hooks/use-stellar-margin-close'

/** The three on-chain legs, in order, in the user's language. `prepare` covers
 *  what used to be two separate transactions (begin + withdraw), so the wording
 *  names both jobs it does. */
const STEPS = [
  { key: 'preparing', label: 'Releasing your collateral', detail: 'Fixing the terms and taking it out of the lending pool' },
  { key: 'swapping', label: 'Settling at market', detail: 'Converting back at the best available price' },
  { key: 'finishing', label: 'Returning your funds', detail: 'Repaying the loan and paying out what’s left' },
] as const

/**
 * How far along each hook step is. `checking` maps to 0 — the pre-flight signs
 * nothing, so no step may show as done while it runs — and the terminal states
 * map past the end so all three land on their tick before the overlay leaves.
 * `releasing` (the debt-free shortcut) runs none of these legs, so it sits at 0;
 * that flow is a single transaction and never renders this overlay for long.
 */
const STEP_INDEX: Record<CloseStep, number> = {
  idle: 0,
  checking: 0,
  preparing: 1,
  swapping: 2,
  finishing: 3,
  releasing: 0,
  settling: 4,
  success: 4,
  error: 0,
}

interface Props {
  step: CloseStep
  /** "Finishing your close" reads better than "Closing" on a recovery crank. */
  isRecovery?: boolean
}

export function StellarCloseProgress({ step, isRecovery = false }: Props) {
  const { prefersReducedMotion } = useReducedMotion()
  const current = STEP_INDEX[step]

  // Portalled to <body> for the same reason as the open overlay: the panel it
  // mounts inside carries `backdrop-blur-xl` + `overflow-hidden`, and a
  // backdrop-filter makes that panel the containing block for fixed descendants
  // — `fixed inset-0` would size itself to the panel and then be clipped by it.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      data-testid="margin-close-progress"
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
        {/* Ring — one continuous sweep, so the wait always looks alive even while
            a single leg sits on the network for several seconds. */}
        <div className="relative mx-auto mb-5 h-16 w-16">
          <div className="absolute inset-0 rounded-full border-2 border-foreground/10" />
          {!prefersReducedMotion && (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1.4, repeat: Infinity, ease: 'linear' }}
              className="absolute inset-0 rounded-full border-2 border-transparent border-t-foreground/60"
            />
          )}
          <motion.div
            animate={prefersReducedMotion ? undefined : { scale: [1, 1.08, 1] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute inset-2 grid place-items-center rounded-full bg-foreground/10 text-foreground/70"
          >
            <X className="h-6 w-6" />
          </motion.div>
        </div>

        <h2 className="text-center text-base font-black text-foreground">
          {isRecovery ? 'Finishing your close' : 'Closing your position'}
        </h2>
        <p className="mt-1 text-center text-xs text-muted-foreground">
          This takes up to a minute — keep this page open.
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
                    active && 'border-transparent bg-foreground/10 text-foreground/70',
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
                  {/* Only the running step explains itself — four subtitles at
                      once turn the card into a wall of text. */}
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

        {/* Indeterminate bar: honest about progress (ledger time isn't
            predictable) while still moving, which is what stops the wait feeling
            stuck. */}
        <div className="mt-5 h-1 overflow-hidden rounded-full bg-foreground/10">
          {prefersReducedMotion ? (
            <div
              className="h-full rounded-full bg-foreground/50 transition-all duration-500"
              style={{ width: `${Math.min(100, (current / STEPS.length) * 100)}%` }}
            />
          ) : (
            <motion.div
              animate={{ x: ['-100%', '250%'] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
              className="h-full w-2/5 rounded-full bg-foreground/50"
            />
          )}
        </div>

        {/* The one fact a closing trader wants and the spinner never gave them:
            nothing is half-gone while this runs. */}
        <p className="mt-3 text-center text-[10px] text-muted-foreground/60">
          Your position stays exactly as it is until this finishes.
        </p>
      </motion.div>
    </motion.div>,
    document.body,
  )
}

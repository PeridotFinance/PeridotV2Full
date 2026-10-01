'use client'

/**
 * The error moment: calm, specific, and one tap from a fix.
 *
 * The button the user pressed gives a short shake (`Shake`) and the card
 * slides in under it with the decoded sentence and, where one exists, the
 * one action that changes the outcome (lib/robinhood/moments.ts decides
 * which). A cancelled signature is not an error: it gets a quiet grey note
 * and the form simply works again. The form's inputs are never cleared.
 */
import { useEffect, useRef } from 'react'
import { motion, useAnimationControls, useReducedMotion } from 'framer-motion'
import { AlertCircle, RotateCcw, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { RobinhoodDecodedError } from '@/lib/robinhood/errors'
import { errorMoment, HAPTICS, REMEDY_LABEL, type ErrorRemedy } from '@/lib/robinhood/moments'
import { haptic } from './MomentSheet'

/** Shakes its child once whenever `trigger` changes to something truthy. */
export function Shake({ trigger, children, className }: { trigger: unknown; children: React.ReactNode; className?: string }) {
  const controls = useAnimationControls()
  const reduce = useReducedMotion()
  const last = useRef<unknown>(null)
  useEffect(() => {
    if (!trigger || trigger === last.current) return
    last.current = trigger
    if (reduce) return
    void controls.start({ x: [0, -7, 7, -5, 5, -2, 0], transition: { duration: 0.4, ease: 'easeInOut' } })
  }, [trigger, controls, reduce])
  return (
    <motion.div animate={controls} className={className}>
      {children}
    </motion.div>
  )
}

interface Props {
  error: RobinhoodDecodedError | null | undefined
  /** Handlers for the remedies this surface can perform; a missing one falls back to `onRetry`. */
  remedies?: Partial<Record<Exclude<ErrorRemedy, 'retry' | 'none'>, () => void>>
  /** Clears the flow so the main button works again. */
  onRetry: () => void
  className?: string
}

export function RobinhoodErrorCard({ error, remedies, onRetry, className }: Props) {
  const moment = error ? errorMoment(error.kind) : null
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // On a phone the card can land below the fold, under the button that was
    // just tapped; bring it up without jumping the page if it is visible.
    if (error) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    if (moment && !moment.quiet) haptic(HAPTICS.error)
    // Once per error object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error])
  if (!error || !moment) return null

  if (moment.quiet) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        ref={ref}
        className={cn('scroll-mb-4 flex items-center gap-2 rounded-xl bg-foreground/[0.04] px-3 py-2.5 text-xs text-muted-foreground', className)}
        role="status"
      >
        <Undo2 className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1">{moment.title}. Nothing new was sent.</span>
        <button type="button" onClick={onRetry} className="min-h-[36px] px-2 font-semibold text-foreground/80 hover:text-foreground">
          OK
        </button>
      </motion.div>
    )
  }

  const run =
    moment.remedy === 'retry' || moment.remedy === 'none'
      ? onRetry
      : () => {
          const fix = remedies?.[moment.remedy as Exclude<ErrorRemedy, 'retry' | 'none'>]
          onRetry()
          fix?.()
        }
  const label = moment.remedy !== 'retry' && moment.remedy !== 'none' && !remedies?.[moment.remedy] ? REMEDY_LABEL.retry : REMEDY_LABEL[moment.remedy]

  return (
    <motion.div
      initial={{ opacity: 0, y: -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 420, damping: 30 }}
      ref={ref}
      role="alert"
      className={cn('scroll-mb-4 space-y-2.5 rounded-xl border border-red-500/20 bg-red-500/[0.07] p-3', className)}
    >
      <div className="flex gap-2.5">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-semibold text-foreground">{moment.title}</p>
          <p className="text-xs text-muted-foreground">{error.message}</p>
        </div>
      </div>
      <Button size="sm" variant="outline" onClick={run} className="h-10 w-full font-semibold">
        {moment.remedy !== 'none' && <RotateCcw className="mr-1.5 h-3.5 w-3.5" />}
        {label}
      </Button>
    </motion.div>
  )
}

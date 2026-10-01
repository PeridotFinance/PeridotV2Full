'use client'

/**
 * One row per transaction of a running flow: approve, supply, deposit, open.
 * Each row owns its phase, so a failure names the step it happened in and a
 * completed approval stays visibly done when a later step fails (it is real
 * chain state, guide 12 "preserve any already-completed share deposit").
 */
import { Check, Loader2, X, Clock, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ROBINHOOD_EXPLORER_URL } from '@/config/robinhood'
import type { RobinhoodTxPhase, RobinhoodTxUpdate } from '@/lib/robinhood/tx'

const PHASE_COPY: Record<RobinhoodTxPhase, string> = {
  pending: 'Waiting',
  switching: 'Switching network',
  simulating: 'Checking',
  signing: 'Confirm in your wallet',
  submitted: 'Processing',
  confirmed: 'Done',
  failed: 'Failed',
  unconfirmed: 'Not confirmed yet',
}

function PhaseIcon({ phase }: { phase: RobinhoodTxPhase }) {
  if (phase === 'confirmed') return <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
  if (phase === 'failed') return <X className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
  if (phase === 'unconfirmed') return <Clock className="w-3.5 h-3.5 text-yellow-600 dark:text-yellow-400" />
  if (phase === 'pending') return <span className="w-1.5 h-1.5 rounded-full bg-foreground/30" />
  return <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
}

export function RobinhoodTxSteps({ steps, className }: { steps: RobinhoodTxUpdate[]; className?: string }) {
  if (steps.length === 0) return null
  return (
    <ol className={cn('space-y-1.5', className)}>
      {steps.map((step, i) => (
        <li
          key={step.callId}
          className="flex items-center gap-2.5 rounded-lg border border-foreground/[0.06] bg-foreground/[0.03] px-3 py-2 text-xs"
        >
          <span className="text-muted-foreground/50 tabular-nums w-3">{i + 1}</span>
          <span className="flex-1 font-medium">{step.label}</span>
          <span
            className={cn(
              'text-muted-foreground',
              step.phase === 'failed' && 'text-red-600 dark:text-red-400',
              step.phase === 'unconfirmed' && 'text-yellow-600 dark:text-yellow-400',
              step.phase === 'confirmed' && 'text-emerald-600 dark:text-emerald-400',
            )}
          >
            {PHASE_COPY[step.phase]}
          </span>
          {step.hash && (
            <a
              href={`${ROBINHOOD_EXPLORER_URL.replace(/\/$/, '')}/tx/${step.hash}`}
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground/60 hover:text-foreground"
              aria-label="View on explorer"
            >
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
          <PhaseIcon phase={step.phase} />
        </li>
      ))}
    </ol>
  )
}

/** Error line under a flow. `message` is the decoded, user-facing text. */
export function RobinhoodFlowError({ message, className }: { message: string | null | undefined; className?: string }) {
  if (!message) return null
  return (
    <div
      role="alert"
      className={cn(
        'rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-800 dark:text-red-300',
        className,
      )}
    >
      {message}
    </div>
  )
}

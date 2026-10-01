'use client'

import { Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { OnrampState } from '@/hooks/use-bridge-onramp'

/**
 * Persistent progress indicator for the bank-transfer on-ramp. Shown in every
 * state so the user always knows where they are and what happens next, plus a
 * one-line caption describing what is happening right now.
 */

const STEPS = ['Verify identity', 'Set up account', 'Add money'] as const

function stepIndexFor(state: OnrampState): number {
  switch (state) {
    case 'sepa_pending':
    case 'ready':
      return 1
    case 'active':
      return 2
    default:
      // not_started, tos_pending, kyc_in_progress, kyc_rejected
      return 0
  }
}

const CAPTIONS: Record<OnrampState, string> = {
  not_started: 'Step 1 of 3 — a quick one-time identity check to get started.',
  tos_pending:
    'Step 1 of 3 — accept our payment partner’s terms, then a quick identity check.',
  kyc_in_progress:
    'Verifying your identity with our payments partner. This page updates on its own.',
  kyc_rejected: "We couldn't verify your identity. See the details below.",
  sepa_pending: "Setting up bank transfers on your account — this is usually quick.",
  ready: "You're verified. Last step: set up your bank details to finish.",
  active: 'Your bank account is ready — transfer money from your bank any time.',
}

export function OnrampProgress({
  state,
  isFetching,
}: {
  state: OnrampState
  isFetching?: boolean
}) {
  const current = stepIndexFor(state)
  const isError = state === 'kyc_rejected'

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center">
        {STEPS.map((label, i) => {
          const done = i < current
          const active = i === current
          return (
            <div key={label} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={cn(
                    'h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors',
                    done && 'bg-emerald-500 text-white',
                    active && !isError && 'bg-primary text-primary-foreground',
                    active && isError &&
                      'bg-destructive/15 text-destructive border border-destructive/40',
                    !done && !active && 'bg-muted text-muted-foreground',
                  )}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </div>
                <span
                  className={cn(
                    'text-[10px] font-medium leading-none text-center',
                    active ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={cn(
                    'h-0.5 flex-1 mx-1.5 -mt-4 rounded-full transition-colors',
                    i < current ? 'bg-emerald-500' : 'bg-muted',
                  )}
                />
              )}
            </div>
          )
        })}
      </div>

      <div className="flex items-start gap-1.5 rounded-xl bg-muted/40 border border-border/40 px-3 py-2">
        {isFetching && (
          <Loader2 className="h-3.5 w-3.5 text-primary animate-spin shrink-0 mt-px" />
        )}
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {CAPTIONS[state]}
        </p>
      </div>
    </div>
  )
}

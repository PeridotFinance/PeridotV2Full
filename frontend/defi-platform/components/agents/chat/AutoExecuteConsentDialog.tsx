'use client'

import { useState } from 'react'
import { Sparkles, Shield, Clock, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * One-time opt-in modal asking whether Perry may execute small transactions
 * silently on the user's behalf.
 *
 * Three choices:
 *   - "Yes, up to $2"      → enabled=true, prompted_at=NOW
 *   - "Later"              → enabled=false, prompted_at stays NULL so we ask again
 *   - "Always ask me"      → enabled=false, prompted_at=NOW so we never nudge again
 *
 * Callers own `open` / `onResolve`. The dialog is intentionally decoupled from
 * the profile-write so it can be unit-tested without pulling in the network
 * layer. The parent maps the choice onto an `updateProfile({ ... })` call.
 */

export type ConsentChoice =
  | 'allow'       // enabled + mark prompted
  | 'defer'       // stay disabled, don't mark → will be asked again
  | 'deny_forever' // disabled + mark prompted so we never show again

interface AutoExecuteConsentDialogProps {
  open: boolean
  /** Proposed default limit shown in the "Yes" label, in USD. Default 2. */
  defaultLimitUsd?: number
  onResolve: (choice: ConsentChoice, limitUsd: number) => void
}

export function AutoExecuteConsentDialog({
  open,
  defaultLimitUsd = 2,
  onResolve,
}: AutoExecuteConsentDialogProps) {
  const [limitInput, setLimitInput] = useState<string>(defaultLimitUsd.toFixed(2))

  const handleAllow = () => {
    const n = Number(limitInput)
    const safe = Number.isFinite(n) && n > 0 ? Math.min(n, 10_000) : defaultLimitUsd
    onResolve('allow', safe)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onResolve('defer', defaultLimitUsd)}>
      <DialogContent
        className="sm:max-w-md"
        data-testid="auto-execute-consent-dialog"
      >
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <DialogTitle>Let Perry handle small amounts?</DialogTitle>
          </div>
          <DialogDescription>
            For quick deposits and withdrawals, Perry can handle the signing for
            you so you don't have to confirm every small transaction.
          </DialogDescription>
        </DialogHeader>

        {/* Features */}
        <div className="space-y-3 py-2">
          <Feature
            icon={<Shield className="w-4 h-4 text-emerald-500" />}
            title="Your funds stay safe"
            body="Borrow and strategy adjustments always require your confirmation."
          />
          <Feature
            icon={<Clock className="w-4 h-4 text-amber-500" />}
            title="2-second cancel window"
            body="You can stop any auto-action before it's sent."
          />
          <Feature
            icon={<X className="w-4 h-4 text-muted-foreground" />}
            title="Change your mind anytime"
            body="Turn it off or adjust the limit from your profile."
          />
        </div>

        {/* Limit input */}
        <label className="flex items-center gap-3 rounded-lg border border-border/40 bg-muted/20 px-3 py-2.5">
          <span className="text-sm text-muted-foreground">Auto-confirm up to</span>
          <div className="flex items-center gap-1">
            <span className="text-sm">$</span>
            <input
              type="number"
              step="0.50"
              min="0.50"
              max="1000"
              value={limitInput}
              onChange={(e) => setLimitInput(e.target.value)}
              className="w-20 bg-transparent border-b border-border/40 text-sm font-mono focus:outline-none focus:border-primary"
              data-testid="consent-limit-input"
            />
          </div>
          <span className="text-xs text-muted-foreground/60 ml-auto">per action</span>
        </label>

        <DialogFooter className="flex flex-col gap-2 sm:flex-col">
          <Button
            onClick={handleAllow}
            className="w-full"
            data-testid="consent-allow"
          >
            Yes — let Perry handle these
          </Button>
          <div className="flex gap-2 w-full">
            <Button
              variant="ghost"
              onClick={() => onResolve('defer', defaultLimitUsd)}
              className="flex-1"
              data-testid="consent-defer"
            >
              Maybe later
            </Button>
            <Button
              variant="ghost"
              onClick={() => onResolve('deny_forever', defaultLimitUsd)}
              className="flex-1 text-muted-foreground"
              data-testid="consent-deny"
            >
              No, always ask me
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Feature({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode
  title: string
  body: string
}) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div>
        <div className="font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{body}</div>
      </div>
    </div>
  )
}

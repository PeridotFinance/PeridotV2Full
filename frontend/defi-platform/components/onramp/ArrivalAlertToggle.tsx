'use client'

/**
 * "Notify me when it arrives" — shown under the IBAN a user is about to
 * transfer money to. A SEPA top-up takes hours to a day, and this tab will be
 * closed; the one thing the user wants from us in that gap is a ping when the
 * money lands. Rendering nothing when push isn't possible (unsupported
 * browser, missing keys) keeps the promise honest — the row only exists where
 * it can be kept.
 */
import { Bell, BellRing, Check, Loader2 } from 'lucide-react'
import { useBridgeArrivalAlerts } from '@/hooks/use-bridge-arrival-alerts'
import { cn } from '@/lib/utils'

export function ArrivalAlertToggle({ className }: { className?: string }) {
  const alerts = useBridgeArrivalAlerts()

  if (!alerts.supported) return null

  const rowBase = cn(
    'w-full flex items-center gap-2.5 rounded-2xl p-3 border text-left',
    className,
  )

  // A denial is a browser-level dead end — say so instead of re-asking.
  if (alerts.permission === 'denied') {
    return (
      <div className={cn(rowBase, 'border-border/50 bg-background/40')}>
        <Bell className="h-4 w-4 text-muted-foreground shrink-0" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          Notifications are blocked for this site in your browser, so we
          can&apos;t ping you when your money arrives.
        </p>
      </div>
    )
  }

  if (alerts.enabled) {
    return (
      <div className={cn(rowBase, 'border-emerald-500/30 bg-emerald-500/[0.07]')}>
        <Check className="h-4 w-4 text-emerald-500 shrink-0" />
        <p className="flex-1 text-xs text-muted-foreground leading-relaxed">
          We&apos;ll notify you on this device when your money arrives.
        </p>
        <button
          type="button"
          onClick={() => alerts.disable()}
          className="text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          Turn off
        </button>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => alerts.enable()}
      disabled={alerts.busy}
      className={cn(
        rowBase,
        'border-primary/25 bg-primary/[0.06] hover:bg-primary/10 transition-colors',
        'disabled:opacity-60 disabled:cursor-not-allowed',
      )}
    >
      {alerts.busy ? (
        <Loader2 className="h-4 w-4 text-primary shrink-0 animate-spin" />
      ) : (
        <BellRing className="h-4 w-4 text-primary shrink-0" />
      )}
      <span className="flex-1 text-xs font-medium text-foreground">
        Notify me when my money arrives
      </span>
      <span className="text-[11px] text-muted-foreground shrink-0">
        Even with this tab closed
      </span>
    </button>
  )
}

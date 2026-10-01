'use client'

/**
 * Pending-open recovery banner (V3).
 *
 * A PendingOpen means begin_open succeeded but the swap/activate tail didn't
 * complete. What the user can do depends on how far it got:
 *
 *   - swap NOT yet executed → resume (swap + activate) or cancel (releases the
 *     locked collateral — nothing was borrowed, so cancel is always safe).
 *     Expired pendings in this state can ONLY be cancelled.
 *   - swap executed (`hasExecution`) → the trade already holds the position
 *     asset; the ONLY way forward is activation. Cancel is hidden (the contract
 *     would reject it) and activation works even past the expiry timestamp.
 */
import { motion } from 'framer-motion'
import { Clock, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useTimeLeft } from '../../lib/pendingCountdown'
import type { StellarPendingOpenView } from '../../types/stellarMargin'

interface Props {
  pending: StellarPendingOpenView
  onResume: () => void
  onCancel: () => void
  isResuming: boolean
  isCancelling: boolean
  resumeLabel?: string
}

export function StellarPendingBanner({ pending, onResume, onCancel, isResuming, isCancelling, resumeLabel }: Props) {
  const timeLeft = useTimeLeft(pending.expiresAt)
  const busy = isResuming || isCancelling
  // Swapped pendings stay resumable forever; only un-swapped ones hard-expire.
  const expiredDeadEnd = pending.isExpired && !pending.hasExecution
  const canResume = !expiredDeadEnd
  const canCancel = !pending.hasExecution

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'mb-5 flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 rounded-xl border text-sm',
        expiredDeadEnd
          ? 'bg-red-500/10 border-red-500/25 text-red-800 dark:text-red-300'
          : 'bg-amber-500/10 border-amber-500/25 text-amber-800 dark:text-amber-300',
      )}
    >
      {expiredDeadEnd
        ? <AlertTriangle className="w-4 h-4 shrink-0" />
        : pending.hasExecution
          ? <CheckCircle2 className="w-4 h-4 shrink-0" />
          : <Clock className="w-4 h-4 shrink-0" />}
      <div className="flex-1">
        <span className="font-semibold">
          {expiredDeadEnd
            ? 'Pending position expired'
            : pending.hasExecution
              ? 'Almost there — one step left'
              : 'Unfinished position'}
        </span>{' '}
        <span className="opacity-80">
          {pending.hasExecution
            ? <>{pending.side} · your trade is swapped and just needs activating</>
            : <>
                {pending.side} · borrowing {pending.borrowAmount.toFixed(2)} {pending.side === 'Short' ? 'XLM' : 'USDT'}
                {!pending.isExpired && ` · ${timeLeft}`}
              </>}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {canResume && (
          <Button size="sm" onClick={onResume} disabled={busy}
            className="h-8 px-3 text-xs bg-amber-500 hover:bg-amber-600 text-white font-bold">
            {isResuming ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />{resumeLabel || 'Finishing…'}</> : 'Finish'}
          </Button>
        )}
        {canCancel && (
          <Button size="sm" variant="outline" onClick={onCancel} disabled={busy}
            className="h-8 px-3 text-xs border-foreground/20 bg-foreground/5 hover:bg-foreground/10 text-inherit">
            {isCancelling ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Cancelling…</> : 'Cancel & recover'}
          </Button>
        )}
      </div>
    </motion.div>
  )
}

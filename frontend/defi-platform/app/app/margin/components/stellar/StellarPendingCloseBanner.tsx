'use client'

/**
 * Pending-CLOSE recovery banner (V3 split close).
 *
 * A pending close means `prepare_close` landed but the swap/finish tail didn't
 * complete — the old atomic `close_position_v3` was split precisely so a heavy
 * close can't blow the Soroban compute budget, and each leg is independently
 * recoverable. What the user can do depends on how far it got:
 *
 *   - swap NOT yet executed → finish (swap + finish) or cancel (unwinds the
 *     prepare, collateral returns to the position). An expired pending in this
 *     state can be cleared with "Clear" (permissionless expire).
 *   - swap executed (`hasSwapped`) → the proceeds are in the controller; the
 *     ONLY way forward is finish (permissionless, valid past expiry). Cancel is
 *     hidden — the contract would reject it.
 *
 * "Repay shortfall" is the escape hatch for the one state that would otherwise be
 * a dead end: the swap landed but came in under the debt by more than the close
 * hook's automatic 2% dust allowance. Finish then fails on every attempt and
 * cancel is already off the table, so without a manual repayment the position
 * stays stuck. Offered wherever finish is the way forward, since that is exactly
 * where the shortfall can bite.
 */
import { useState } from 'react'
import { motion } from 'framer-motion'
import { Clock, Loader2, AlertTriangle, CheckCircle2, HandCoins } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { StellarCloseRepayDialog } from './StellarCloseRepayDialog'
import { useTimeLeft } from '../../lib/pendingCountdown'
import type { StellarMarginAsset, StellarPendingCloseView } from '../../types/stellarMargin'

interface Props {
  pending: StellarPendingCloseView
  onFinish: () => void
  onCancel: () => void
  onExpire: () => void
  /** True only while THIS banner's finish is running (not cancel/expire). */
  isFinishing: boolean
  /** True only while cancel or expire is running. */
  isCancelling: boolean
  /**
   * Any of the three actions is running — what every button disables on.
   *
   * Kept separate from the two flags above, which now drive only the per-button
   * spinner. Deriving it as `isFinishing || isCancelling` was fine while the
   * caller passed the same value for both, but that is exactly the bug: the
   * banner then showed "Cancelling…" and "Clearing…" during a finish.
   */
  busy?: boolean
  finishLabel?: string
  /** Market state — the repay dialog reads the wallet balance of the debt asset. */
  assets?: StellarMarginAsset[]
  /** A repayment landed: debt moved, so the pending needs re-reading. */
  onRepaid?: () => void
}

/**
 * What is actually parked in this pending, as a human amount.
 *
 * A position mid-close is rendered as THIS banner instead of its normal row, so
 * without a figure here the money is nowhere on screen — the trader sees a
 * warning strip where their collateral used to be and no confirmation that the
 * protocol still knows the size. Returns null rather than printing a confident
 * "0" if the pending reports nothing.
 */
function pendingStake(
  pending: StellarPendingCloseView,
  assets?: StellarMarginAsset[],
): { label: string; usd: number | null } | null {
  const raw = pending.collateralUnderlyingRaw
  if (!raw || raw <= BigInt(0)) return null
  const asset = assets?.find((a) => a.token === pending.positionToken)
  const decimals = asset?.decimals ?? 7
  const amount = Number(raw) / 10 ** decimals
  if (!Number.isFinite(amount) || amount <= 0) return null
  const symbol = asset?.label ?? ''
  return {
    label: `${amount.toLocaleString(undefined, { maximumFractionDigits: 4 })}${symbol ? ` ${symbol}` : ''}`,
    usd: asset?.priceUsd ? amount * asset.priceUsd : null,
  }
}

export function StellarPendingCloseBanner({ pending, onFinish, onCancel, onExpire, isFinishing, isCancelling, busy: busyProp, finishLabel, assets, onRepaid }: Props) {
  const [repayOpen, setRepayOpen] = useState(false)
  // Gates the repay dialog's dismissal while its transaction is in flight.
  const [repayBusy, setRepayBusy] = useState(false)
  const timeLeft = useTimeLeft(pending.expiresAt)
  const busy = busyProp ?? (isFinishing || isCancelling)
  // A pre-swap pending that timed out is a dead end for finish — clear it to
  // recover the collateral. A swapped pending can always be finished.
  const expiredDeadEnd = pending.isExpired && !pending.hasSwapped
  const canFinish = pending.hasSwapped || !pending.isExpired
  const canCancel = !pending.hasSwapped && !pending.isExpired
  const stake = pendingStake(pending, assets)

  return (
    <>
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
        : pending.hasSwapped
          ? <CheckCircle2 className="w-4 h-4 shrink-0" />
          : <Clock className="w-4 h-4 shrink-0" />}
      <div className="flex-1">
        <span className="font-semibold">
          {expiredDeadEnd
            ? 'Close timed out'
            : pending.hasSwapped
              ? 'Almost closed — one step left'
              : 'Unfinished close'}
        </span>{' '}
        <span className="opacity-80">
          {pending.hasSwapped
            ? <>{pending.side} · your position is settled and just needs finishing</>
            : <>
                {pending.side} · closing your position
                {!pending.isExpired && ` · ${timeLeft}`}
              </>}
        </span>
        {/* The amount, and the promise that nobody has to babysit it: the server
            sweeper cranks these same permissionless legs on a schedule, so a
            trader who closes the tab still gets their money back. */}
        <div className="mt-0.5 text-xs opacity-70">
          {stake && (
            <span className="font-semibold tabular-nums">
              {stake.label}
              {stake.usd != null && ` · $${stake.usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
            </span>
          )}
          {stake && ' — '}
          <span>held by the protocol, and {expiredDeadEnd ? 'returned to you' : 'finished'} automatically even if you close this page.</span>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {canFinish && (
          <Button size="sm" onClick={onFinish} disabled={busy}
            className="h-8 px-3 text-xs bg-amber-500 hover:bg-amber-600 text-white font-bold">
            {isFinishing ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />{finishLabel || 'Finishing…'}</> : 'Finish close'}
          </Button>
        )}
        {canCancel && (
          <Button size="sm" variant="outline" onClick={onCancel} disabled={busy}
            className="h-8 px-3 text-xs border-foreground/20 bg-foreground/5 hover:bg-foreground/10 text-inherit">
            {isCancelling ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Cancelling…</> : 'Cancel'}
          </Button>
        )}
        {expiredDeadEnd && (
          <Button size="sm" variant="outline" onClick={onExpire} disabled={busy}
            className="h-8 px-3 text-xs border-foreground/20 bg-foreground/5 hover:bg-foreground/10 text-inherit">
            {isCancelling ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Clearing…</> : 'Clear & recover'}
          </Button>
        )}
        {/* Quiet by design: the shortfall it answers is rare, and finish is what
            the trader should reach for first. */}
        {canFinish && (
          <Button size="sm" variant="ghost" onClick={() => setRepayOpen(true)} disabled={busy}
            title="Repay the debt this close is short of, from your wallet"
            className="h-8 px-2.5 text-xs text-inherit opacity-70 hover:opacity-100 hover:bg-foreground/10">
            <HandCoins className="w-3 h-3 mr-1" /> Repay
          </Button>
        )}
      </div>
    </motion.div>

    {/* Not dismissible mid-repayment — Escape / outside click / the X unmount the
        dialog, and the signing carried on with its status and errors gone. */}
    <Dialog open={repayOpen} onOpenChange={(o) => { if (!repayBusy) setRepayOpen(o) }}>
      <DialogContent
        data-testid="margin-close-repay-dialog"
        closeDisabled={repayBusy}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto overflow-x-hidden backdrop-blur-xl bg-background/90 border-white/10 p-0"
        onEscapeKeyDown={(e) => { if (repayBusy) e.preventDefault() }}
        onInteractOutside={(e) => { if (repayBusy) e.preventDefault() }}
      >
        <DialogHeader className="px-5 pt-5 pb-0">
          <DialogTitle className="text-xl font-bold">Repay to finish close</DialogTitle>
        </DialogHeader>
        <StellarCloseRepayDialog
          pending={pending}
          assets={assets}
          onDone={() => { setRepayOpen(false); onRepaid?.() }}
          onCancel={() => setRepayOpen(false)}
          onBusyChange={setRepayBusy}
        />
      </DialogContent>
    </Dialog>
    </>
  )
}

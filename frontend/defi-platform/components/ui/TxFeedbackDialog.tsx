'use client'

import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { FEATURE_FLAGS } from '@/config/featureFlags'
import { cn } from '@/lib/utils'
import { ExternalLink, Copy, Check, AlertCircle, ChevronRight, Loader2 } from 'lucide-react'
import { txToastCopy, isInsufficientFunds, shortfallHint, type TxAction } from '@/lib/tx/txCopy'

type ActionKind =
  | 'supply' | 'borrow' | 'repay' | 'withdraw' | 'redeem'
  | 'margin-enable' | 'margin-deposit' | 'margin-withdraw'
  | 'margin-borrow' | 'margin-repay' | 'margin-trade'
  | 'margin-open' | 'margin-close'

interface TxFeedbackDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  action: ActionKind
  step?: string | null
  statusMessage?: string | null
  txHash?: `0x${string}` | string | null
  explorerUrl?: string | null
  onRetry?: () => void
  onCheckStatus?: () => void
  // Cross-chain specific props
  trackingUrl?: string | null
  biconomyFee?: any
  biconomyFeeDetails?: {
    amount?: string
    token?: string
    chainId?: number
    paymentToken?: string
    paymentTokenWeiAmount?: string
    paymentTokenValue?: string
  }
  meeScanLink?: string | null
  isCrossChain?: boolean
  crossChainStatus?: 'idle' | 'pending' | 'executed' | 'failed' | 'refunded' | 'unknown'
  // Magma/Native specific
  isMagma?: boolean
  useNative?: boolean
}

// Plain, jargon-free action labels. Expert mode keeps the literal verb (it's a
// power-user surface) but never leaks chain / route / bridge wording.
const ACTION_LABEL: Record<ActionKind, string> = {
  supply: 'Supply',
  borrow: 'Borrow',
  repay: 'Repay',
  withdraw: 'Withdraw',
  redeem: 'Withdraw',
  'margin-enable': 'Margin account',
  'margin-deposit': 'Deposit',
  'margin-withdraw': 'Withdraw',
  'margin-borrow': 'Borrow',
  'margin-repay': 'Repay',
  'margin-trade': 'Trade',
  'margin-open': 'Open position',
  'margin-close': 'Close position',
}

// Map the display action onto the consumer-copy action vocabulary so the
// in-progress subtitle reuses the one shared copy source (`lib/tx/txCopy`).
function toTxAction(a: ActionKind): TxAction {
  if (a === 'withdraw' || a === 'redeem' || a === 'margin-withdraw') return 'withdraw'
  if (a === 'borrow' || a === 'margin-borrow') return 'borrow'
  if (a === 'repay' || a === 'margin-repay') return 'repay'
  return 'supply'
}

function resolveIsSuccess(step?: string | null, isCrossChain?: boolean, crossChainStatus?: string): boolean {
  if (!step) return false
  if (isCrossChain) return /success/i.test(step) && crossChainStatus === 'executed'
  return /success/i.test(step)
}

function resolveIsError(step?: string | null): boolean {
  if (!step) return false
  return /error|failed|reverted/i.test(step)
}

// Calm 0..1 progress for the cross-chain bar — no per-step jargon labels, just
// motion so a slow bridge reads as progress rather than a freeze.
function crossChainFraction(step?: string | null, statusMessage?: string | null, crossChainStatus?: string): number {
  const s = String(step || '').toLowerCase()
  const m = String(statusMessage || '').toLowerCase()
  if (crossChainStatus === 'executed') return 1
  if (s === 'success') return 0.9
  if (s.includes('submit') || m.includes('submit') || m.includes('supertransaction')) return 0.75
  if (s.includes('sign') || m.includes('sign')) return 0.55
  if (s.includes('quot') || m.includes('quot') || m.includes('fee')) return 0.35
  if (m.includes('prepar') || m.includes('compose') || m.includes('route')) return 0.15
  return 0.1
}

// Natural, premium easing (easeOutQuint-ish). The success reveal is staggered
// via explicit per-element transition delays rather than variant propagation —
// variant labels don't resolve reliably inside the Radix portal subtree.
const EASE_OUT = [0.22, 1, 0.36, 1] as const

export function TxFeedbackDialog(props: TxFeedbackDialogProps) {
  if (!FEATURE_FLAGS.INTERACTIVE_TX_DIALOG) return null
  return <TxFeedbackDialogInner {...props} />
}

function TxFeedbackDialogInner({
  open,
  onOpenChange,
  action,
  step,
  statusMessage,
  txHash,
  explorerUrl,
  onRetry,
  onCheckStatus,
  trackingUrl,
  biconomyFeeDetails,
  meeScanLink,
  isCrossChain = false,
  crossChainStatus,
}: TxFeedbackDialogProps) {
  const [copied, setCopied] = useState(false)
  const [showDetails, setShowDetails] = useState(false)

  const label = ACTION_LABEL[action] ?? 'Transaction'
  const isSuccess = resolveIsSuccess(step, isCrossChain, crossChainStatus)
  const isError = resolveIsError(step)
  const isPending = !isSuccess && !isError

  // ── Copy ──────────────────────────────────────────────────────────────────
  const rawError = `${step ?? ''} ${statusMessage ?? ''}`
  const errorInsufficient = isError && isInsufficientFunds(rawError)
  const shortfall = shortfallHint(statusMessage)

  const title = isSuccess ? `${label} complete` : isError ? `${label} didn’t go through` : label

  const subtitle = (() => {
    if (isSuccess) {
      return 'Confirmed — your balance updates shortly.'
    }
    if (isError) {
      if (errorInsufficient) {
        return shortfall
          ? `Not enough funds. Try reducing by ${shortfall} or top up first.`
          : 'Not enough funds for this transaction.'
      }
      return 'It didn’t go through. You can try again.'
    }
    // pending — reuse the shared, jargon-free phase copy
    return txToastCopy(step, statusMessage, { action: toTxAction(action) }).body
  })()

  const fraction = isCrossChain ? crossChainFraction(step, statusMessage, crossChainStatus) : null

  // ── Fee (calm row, only when known) ─────────────────────────────────────────
  const feeValue = biconomyFeeDetails?.paymentTokenValue
  const feeToken = biconomyFeeDetails?.paymentToken && !biconomyFeeDetails.paymentToken.startsWith('0x')
    ? biconomyFeeDetails.paymentToken
    : ''

  // Pending is neutral — never success-green. The brand green is earned only by a
  // confirmed tx. Errors keep their semantic amber (recoverable) / rose (failed).
  const ring =
    isError
      ? (errorInsufficient ? 'bg-amber-500/10 text-amber-500' : 'bg-rose-500/10 text-rose-500')
      : 'bg-muted text-foreground'

  const hasDetails = Boolean(txHash || explorerUrl || trackingUrl || meeScanLink)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-3xl border border-border bg-background p-0 shadow-2xl overflow-hidden focus:outline-none focus-visible:outline-none focus-visible:ring-0">
        <div className="p-6">
          {isSuccess ? (
            /* ── Success: choreographed, one beat at a time ──
               Explicit per-element initial/animate (NOT variant-label
               propagation — that doesn't resolve reliably inside the Radix
               portal subtree and left the content stuck at opacity 0). */
            <div>
              {/* Badge — clean checkmark + one soft ring expanding once.
                  Institutional, not mascot-led. Emerald is reserved strictly
                  for the confirmed/success state. */}
              <div className="mb-4 flex justify-center">
                <div className="relative flex h-14 w-14 items-center justify-center">
                  {[0, 0.12].map((delay) => (
                    <motion.span
                      key={delay}
                      className="absolute inset-0 rounded-full bg-primary/15"
                      initial={{ scale: 0.7, opacity: 0.6 }}
                      animate={{ scale: 1.7, opacity: 0 }}
                      transition={{ duration: 0.95, ease: 'easeOut', delay: 0.05 + delay }}
                    />
                  ))}
                  <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <motion.span
                      initial={{ scale: 0.4, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 360, damping: 17, delay: 0.05 }}
                    >
                      <Check className="h-7 w-7" strokeWidth={2.5} />
                    </motion.span>
                  </div>
                </div>
              </div>

              <motion.div initial={{ opacity: 1, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: EASE_OUT, delay: 0.12 }}>
                <DialogTitle className="text-center text-xl font-semibold tracking-tight text-foreground">
                  {title}
                </DialogTitle>
              </motion.div>

              <motion.p
                initial={{ opacity: 1, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: EASE_OUT, delay: 0.19 }}
                className="mt-1.5 text-center text-sm text-muted-foreground leading-snug"
              >
                Your balance updates in a moment.
              </motion.p>

              <motion.div
                initial={{ opacity: 1, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: EASE_OUT, delay: 0.26 }}
                className="mt-5"
              >
                <Button className="w-full rounded-xl" onClick={() => onOpenChange(false)}>
                  Done
                </Button>
              </motion.div>
            </div>
          ) : (
            /* ── Pending / error ── */
            <>
              <div className="flex justify-center mb-4">
                <div className={cn('relative flex h-14 w-14 items-center justify-center rounded-2xl', ring)}>
                  {isError ? <AlertCircle className="h-6 w-6" /> : <Loader2 className="h-6 w-6 animate-spin" />}
                </div>
              </div>

              <DialogTitle className="text-center text-lg font-semibold text-foreground">{title}</DialogTitle>
              <p className="mt-1.5 text-center text-sm text-muted-foreground leading-snug">{subtitle}</p>

              {/* Progress (cross-chain pending only) */}
              {isPending && fraction != null && (
                <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-muted">
                  <motion.div
                    className="h-full rounded-full bg-foreground/40"
                    initial={false}
                    animate={{ width: `${Math.round(fraction * 100)}%` }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                  />
                </div>
              )}
              {/* single-chain pending → calm indeterminate shimmer */}
              {isPending && fraction == null && (
                <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-muted">
                  <motion.div
                    className="h-full w-1/3 rounded-full bg-foreground/40"
                    initial={{ x: '-120%' }}
                    animate={{ x: ['-120%', '320%'] }}
                    transition={{ duration: 1.2, ease: 'easeInOut', repeat: Infinity }}
                  />
                </div>
              )}

              {/* Network fee (calm row) */}
              {feeValue && (
                <div className="mt-4 flex items-center justify-between rounded-xl border border-border bg-muted/40 px-3.5 py-2.5 text-sm">
                  <span className="text-muted-foreground">Network fee</span>
                  <span className="font-medium text-foreground tabular-nums">
                    {feeValue}{feeToken ? ` ${feeToken}` : ''}
                  </span>
                </div>
              )}

              {/* Footer actions */}
              <div className="mt-5 flex items-center gap-2">
                {isPending && (
                  <>
                    {/* Dismissals are ghost, not filled: "Hide" and "Close" walk
                        away from the flow, so they must not carry the same
                        weight as "Try again" / "Check status". */}
                    <Button variant="ghost" className="flex-1 rounded-xl text-muted-foreground" onClick={() => onOpenChange(false)}>
                      Hide
                    </Button>
                    {onCheckStatus && (
                      <Button variant="outline" className="flex-1 rounded-xl" onClick={onCheckStatus}>
                        Check status
                      </Button>
                    )}
                  </>
                )}
                {isError && (
                  <>
                    {onRetry && (
                      <Button className="flex-1 rounded-xl" onClick={onRetry}>
                        Try again
                      </Button>
                    )}
                    <Button variant="ghost" className="flex-1 rounded-xl text-muted-foreground" onClick={() => onOpenChange(false)}>
                      Close
                    </Button>
                  </>
                )}
              </div>
            </>
          )}

          {/* ── Details disclosure — power-user substance, demoted ── */}
          {hasDetails && (
            <div className="mt-3 border-t border-border pt-3">
              <button
                type="button"
                onClick={() => setShowDetails((s) => !s)}
                className="mx-auto flex items-center gap-1 text-[11px] text-muted-foreground/80 hover:text-foreground/80 transition-colors"
              >
                <ChevronRight size={11} className={cn('transition-transform', showDetails && 'rotate-90')} />
                {showDetails ? 'Hide details' : 'Details'}
              </button>

              {showDetails && (
                <div className="mt-2.5 space-y-2 text-[11px] text-muted-foreground">
                  {txHash && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono">{String(txHash).slice(0, 8)}…{String(txHash).slice(-6)}</span>
                      <button
                        type="button"
                        onClick={() => {
                          try { navigator.clipboard.writeText(String(txHash)); setCopied(true); window.setTimeout(() => setCopied(false), 1500) } catch {}
                        }}
                        className="rounded p-1 hover:bg-muted transition-colors"
                        aria-label="Copy transaction id"
                      >
                        {copied ? <Check className="h-3 w-3 text-primary" /> : <Copy className="h-3 w-3" />}
                      </button>
                    </div>
                  )}
                  {explorerUrl && (
                    <a className="flex items-center gap-1 hover:text-foreground/80 transition-colors" href={explorerUrl} target="_blank" rel="noreferrer">
                      View in explorer <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {trackingUrl && (
                    <a className="flex items-center gap-1 hover:text-foreground/80 transition-colors" href={trackingUrl} target="_blank" rel="noreferrer">
                      Track status <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {meeScanLink && (
                    <a className="flex items-center gap-1 hover:text-foreground/80 transition-colors" href={meeScanLink} target="_blank" rel="noreferrer">
                      Transaction trace <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {isError && statusMessage && (
                    <button
                      type="button"
                      onClick={() => { try { navigator.clipboard.writeText(statusMessage) } catch {} }}
                      className="hover:text-foreground/80 transition-colors"
                    >
                      Copy error message
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default TxFeedbackDialog

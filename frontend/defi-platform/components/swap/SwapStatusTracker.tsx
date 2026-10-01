'use client'

import { motion } from 'framer-motion'
import type { SwapStep } from '@/hooks/use-swap'
import { Check, Loader2, X, ExternalLink } from 'lucide-react'

interface SwapStatusTrackerProps {
  step: SwapStep
  error: string | null
  txHash: string | null
  explorerUrl: string | null
  receiveAmount: string | null
  toSymbol?: string
  fromChainId?: number
  onReset: () => void
}

const EXPLORER_BASE: Record<number, string> = {
  1: 'https://etherscan.io/tx/',
  56: 'https://bscscan.com/tx/',
  42161: 'https://arbiscan.io/tx/',
  137: 'https://polygonscan.com/tx/',
  8453: 'https://basescan.org/tx/',
  43114: 'https://snowscan.xyz/tx/',
  10: 'https://optimistic.etherscan.io/tx/',
}

const STEP_LABELS: Record<SwapStep, string> = {
  idle: '',
  creating_order: 'Creating order...',
  approving: 'Approve in wallet...',
  signing: 'Sign transaction...',
  submitting: 'Submitting...',
  polling: 'Confirming on-chain...',
  success: 'Swap complete!',
  failed: 'Swap failed',
}

const STEP_ORDER: SwapStep[] = [
  'creating_order',
  'approving',
  'signing',
  'submitting',
  'polling',
  'success',
]

export function SwapStatusTracker({
  step,
  error,
  txHash,
  explorerUrl,
  receiveAmount,
  toSymbol,
  fromChainId,
  onReset,
}: SwapStatusTrackerProps) {
  if (step === 'idle') return null

  const currentIdx = STEP_ORDER.indexOf(step)

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4 rounded-xl border border-border/50 bg-card p-4"
    >
      {/* Progress steps */}
      <div className="space-y-2">
        {STEP_ORDER.filter((s) => s !== 'success').map((s, idx) => {
          const isActive = s === step
          const isDone = currentIdx > idx || step === 'success'
          const isFailed = step === 'failed' && s === STEP_ORDER[currentIdx]

          return (
            <div
              key={s}
              className="flex items-center gap-3 text-sm"
            >
              <div className="flex h-6 w-6 shrink-0 items-center justify-center">
                {isDone ? (
                  <Check className="h-4 w-4 text-[#33C47C]" />
                ) : isFailed ? (
                  <X className="h-4 w-4 text-destructive" />
                ) : isActive ? (
                  <Loader2 className="h-4 w-4 animate-spin text-[#33C47C]" />
                ) : (
                  <div className="h-2 w-2 rounded-full bg-muted-foreground/30" />
                )}
              </div>
              <span
                className={
                  isDone
                    ? 'text-muted-foreground line-through'
                    : isActive
                      ? 'font-medium text-foreground'
                      : 'text-muted-foreground/50'
                }
              >
                {STEP_LABELS[s]}
              </span>
            </div>
          )
        })}
      </div>

      {/* Success state */}
      {step === 'success' && (
        <div className="rounded-lg bg-[#33C47C]/10 p-3 text-center">
          <p className="font-semibold text-[#33C47C]">Swap Complete!</p>
          {receiveAmount && toSymbol && (
            <p className="mt-1 text-sm text-muted-foreground">
              Received: {receiveAmount} {toSymbol}
            </p>
          )}
        </div>
      )}

      {/* Error state */}
      {step === 'failed' && error && (
        <div className="rounded-lg bg-destructive/10 p-3 text-center">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Explorer link */}
      {txHash && (
        <a
          href={explorerUrl ?? `${EXPLORER_BASE[fromChainId ?? 1] ?? 'https://etherscan.io/tx/'}${txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          View on explorer
          <ExternalLink className="h-3 w-3" />
        </a>
      )}

      {/* Reset button for terminal states */}
      {(step === 'success' || step === 'failed') && (
        <button
          type="button"
          onClick={onReset}
          className="w-full rounded-xl bg-muted/50 py-2 text-sm font-medium transition-colors hover:bg-muted"
        >
          {step === 'success' ? 'New Swap' : 'Try Again'}
        </button>
      )}
    </motion.div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * A small inline chat notice that appears when Perry has auto-executed a
 * transaction on the user's behalf. Renders below the last message for a
 * short window (10s), then fades. Separate from the Activity Panel in the
 * sidebar — this is the "just happened" flash; the panel is the history.
 *
 * Driven by the `peridot:agent-action-logged` custom event dispatched from
 * `use-agent-execution` on successful PATCH.
 */
interface AutoActionNoticeProps {
  /** How long to keep the notice visible (ms). Default 10s. */
  visibleForMs?: number
}

interface NoticeState {
  txHash?: string
  chainId?: number
  autoExecuted?: boolean
  shownAt: number
}

export function AutoActionNotice({ visibleForMs = 10_000 }: AutoActionNoticeProps) {
  const [state, setState] = useState<NoticeState | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as Partial<NoticeState> | undefined
      // Only render for auto-executed actions. Click-confirmed actions already
      // show their success state inside the ActionButtonBlock.
      if (!detail?.autoExecuted) return
      setState({
        txHash: detail.txHash,
        chainId: detail.chainId,
        autoExecuted: detail.autoExecuted,
        shownAt: Date.now(),
      })
    }

    window.addEventListener('peridot:agent-action-logged', handler)
    return () => window.removeEventListener('peridot:agent-action-logged', handler)
  }, [])

  useEffect(() => {
    if (!state) return
    const t = setTimeout(() => setState(null), visibleForMs)
    return () => clearTimeout(t)
  }, [state, visibleForMs])

  if (!state) return null

  return (
    <div
      data-testid="auto-action-notice"
      className={cn(
        'mx-auto mt-3 max-w-md rounded-xl border border-primary/30 bg-primary/5 px-4 py-3',
        'flex items-center gap-3 text-sm',
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2 text-primary">
        <Sparkles className="w-4 h-4" />
        <CheckCircle2 className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium">Perry handled it for you</div>
        <div className="text-xs text-muted-foreground">
          You can review it under “Perry's activity”.
        </div>
      </div>
    </div>
  )
}

export default AutoActionNotice

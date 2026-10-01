'use client'

/**
 * The one-glance answer to "is this position actually being watched?"
 *
 * Until now that answer lived two clicks deep, inside the TP/SL popover, and only
 * as the position of a toggle. A trader looking at their open positions could not
 * tell a stop-loss that runs while they sleep from one that dies with the tab,
 * and that distinction is the whole product.
 *
 * Renders nothing when there is no arm: absence of a chip means "not covered",
 * which is honest, whereas a grey "off" chip on every row would be noise.
 */
import { Shield, ShieldAlert, ShieldQuestion } from 'lucide-react'
import { cn } from '@/lib/utils'
// Shared with TermTip: a Tooltip on hover devices, a Popover on touch — where
// Radix tooltips never open at all, which hid the answer to "is this position
// actually being watched?" on every phone.
import { HintTip } from './TermTip'
import type { KeeperArmState } from '../../lib/keeperArmStatus'

const TONE = {
  ok: 'bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 border-emerald-500/20',
  warn: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25',
  alert: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/25',
} as const

const ICON = { ok: Shield, warn: ShieldQuestion, alert: ShieldAlert } as const

export function StellarKeeperChip({ state, className }: { state: KeeperArmState | null; className?: string }) {
  if (!state?.label) return null
  const Icon = ICON[state.tone]
  return (
    <HintTip tip={state.detail} side="top" contentClassName="max-w-[240px] text-[11px] leading-snug">
      <span
        tabIndex={0}
        data-testid="keeper-chip"
        data-tone={state.tone}
        className={cn(
          'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[9px] font-semibold leading-none whitespace-nowrap outline-none focus-visible:ring-1 focus-visible:ring-primary/40',
          TONE[state.tone],
          className,
        )}
      >
        <Icon className="w-2.5 h-2.5 shrink-0" />
        {state.label}
      </span>
    </HintTip>
  )
}

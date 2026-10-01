'use client'

/**
 * The return channel for always-on.
 *
 * Everything the keeper learns about a trader's stop-loss currently dies in a
 * cron log: it deferred because the pool was too thin, it expired last night, it
 * fired three days ago. The trader's own screen said nothing, and silence is
 * the one thing this feature cannot do.
 *
 * So: one line per position that has something to say, on the page they already
 * look at, dismissible per event. Dismissal is keyed by `updated_at`, so a NEW
 * event on the same position speaks up again instead of inheriting the old
 * dismissal.
 */
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ShieldAlert, ShieldCheck, ShieldQuestion, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { KeeperArmState } from '../../lib/keeperArmStatus'
import type { KeeperArmView } from '../../hooks/use-stellar-keeper-arms'

/**
 * Keyed per wallet. One shared key meant a second account inherited the first
 * one's dismissals — and every notice this component exists to deliver is about
 * one specific account's stop-loss.
 */
const storageKey = (address?: string | null) =>
  `peridot:margin:keeper-notice-dismissed:${address ?? 'anon'}`

/**
 * How many dismissals we keep per wallet. Anything dropped here comes BACK on
 * the next load, so the cap has to sit far above the number of positions anyone
 * holds at once — at 50 a busy account resurrected notices it had already read.
 */
const MAX_REMEMBERED = 400

const TONE = {
  ok: 'bg-emerald-500/10 border-emerald-500/25 text-emerald-800 dark:text-emerald-200',
  warn: 'bg-amber-500/10 border-amber-500/25 text-amber-900 dark:text-amber-200',
  alert: 'bg-red-500/10 border-red-500/25 text-red-800 dark:text-red-200',
} as const

const ICON = { ok: ShieldCheck, warn: ShieldQuestion, alert: ShieldAlert } as const

function loadDismissed(address?: string | null): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(storageKey(address))
    const arr = raw ? (JSON.parse(raw) as unknown) : []
    return new Set(Array.isArray(arr) ? arr.map(String) : [])
  } catch {
    return new Set()
  }
}

export function StellarKeeperNotice({
  items,
  address,
  openPositionIds,
  positionsWithTriggers,
}: {
  items: Array<{ arm: KeeperArmView; state: KeeperArmState }>
  /** Whose notices these are — the dismissal store is keyed by it. */
  address?: string | null
  /**
   * Positions currently on screen, and which of those still carry a trigger.
   *
   * The notice used to end every actionable line with "Open the position below
   * and choose 'Renew cover'" on the strength of the arm alone. But an arm
   * outlives what it was armed for: the position can be closed, or its levels
   * cleared. "Renew cover" is offered by the popover only when the position is
   * open AND has levels to re-sign (`canRenew` — renewing signs the CURRENT
   * triggers, so with none there is nothing to sign), which left the banner
   * pointing at a button that wasn't there. Seen live: an expired arm, a
   * position with no take-profit or stop-loss, and no Renew button anywhere.
   *
   * Omitted = assume the instruction holds, which is the old behaviour.
   */
  openPositionIds?: ReadonlySet<string>
  positionsWithTriggers?: ReadonlySet<string>
}) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  // Read after mount — localStorage during render would differ between the
  // server pass and the client one and blow up hydration. Re-read when the
  // wallet changes, so switching accounts loads that account's own dismissals
  // instead of carrying the previous set over.
  useEffect(() => setDismissed(loadDismissed(address)), [address])

  const dismiss = (key: string) => {
    const next = new Set(dismissed)
    next.add(key)
    setDismissed(next)
    try {
      window.localStorage.setItem(storageKey(address), JSON.stringify([...next].slice(-MAX_REMEMBERED)))
    } catch {
      /* private mode — the notice simply comes back next load */
    }
  }

  const visible = items.filter(({ arm }) => !dismissed.has(`${arm.position_id}:${arm.updated_at}`))
  if (!visible.length) return null

  return (
    <div className="mb-5 space-y-2">
      {visible.map(({ arm, state }) => {
        const key = `${arm.position_id}:${arm.updated_at}`
        const Icon = ICON[state.tone]
        // Is there still something the trader can do about this one?
        const stillOpen = openPositionIds ? openPositionIds.has(arm.position_id) : true
        const canRenew = positionsWithTriggers ? positionsWithTriggers.has(arm.position_id) : true
        // "Needs a look" has to mean there is something to look at. Cover that
        // lapsed on a position that has since been closed is history, not a task.
        const actionable = state.needsUser && stillOpen
        return (
          <motion.div
            key={key}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            data-testid="keeper-notice"
            data-tone={state.tone}
            className={cn('flex items-start gap-3 px-4 py-3 rounded-xl border text-sm', TONE[state.tone])}
          >
            <Icon className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <span className="font-semibold">
                {actionable ? 'Your automatic close needs a look' : 'About your automatic close'}
              </span>{' '}
              <span className="opacity-80">{state.detail}</span>
              {actionable && (
                <span className="opacity-80" data-testid="keeper-notice-action">
                  {' '}
                  {canRenew
                    ? 'Open the position below and choose “Renew cover” — your levels stay as they are.'
                    : 'Set a take-profit or stop-loss on the position below, then switch Always-on back on.'}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(key)}
              aria-label="Dismiss"
              className="shrink-0 opacity-50 hover:opacity-100 transition-opacity"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )
      })}
    </div>
  )
}

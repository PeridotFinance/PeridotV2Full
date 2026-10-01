'use client'

/**
 * "Warn me" — the switch for liquidation alerts.
 *
 * It sits in the page header rather than inside the positions table, because the
 * table is the thing a trader stops looking at, and this is the offer to stop
 * having to.
 *
 * It only appears when there is something to warn about (a connected wallet with
 * an open position). An always-present bell would be asking for a permission the
 * user has no reason to grant yet — and browsers only give one clean chance to
 * ask, so it is spent at the moment the answer is obviously yes.
 *
 * Denied is a dead end, and says so. Re-requesting a denied permission resolves
 * instantly with "denied" and shows nothing at all, so a button that kept
 * offering to try again would just look broken.
 */
import { motion } from 'framer-motion'
import { Bell, BellOff, BellRing } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AlertPermission } from '../../hooks/use-stellar-liquidation-alerts'

interface Props {
  enabled: boolean
  permission: AlertPermission
  onEnable: () => void
  onDisable: () => void
}

export function StellarAlertToggle({ enabled, permission, onEnable, onDisable }: Props) {
  if (permission === 'unsupported') return null

  const blocked = permission === 'denied'
  const Icon = blocked ? BellOff : enabled ? BellRing : Bell

  return (
    <motion.button
      data-testid="margin-alert-toggle"
      onClick={() => { if (blocked) return; if (enabled) onDisable(); else onEnable() }}
      whileHover={blocked ? undefined : { scale: 1.04 }}
      whileTap={blocked ? undefined : { scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 400, damping: 22 }}
      disabled={blocked}
      title={
        blocked
          ? 'Notifications are blocked for this site. Allow them in your browser’s site settings to get liquidation warnings.'
          : enabled
            ? 'You’ll be warned when a position gets close to liquidation. Click to turn off.'
            : 'Get warned when a position gets close to liquidation, even while this tab is in the background.'
      }
      className={cn(
        'group flex items-center gap-2 px-3.5 py-2 rounded-full border ring-1 ring-inset transition-colors shadow-sm',
        blocked
          ? 'cursor-not-allowed border-white/10 bg-white/5 ring-white/5 text-muted-foreground/60'
          : enabled
            ? 'cursor-pointer border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25 ring-emerald-500/10 text-emerald-800 dark:text-emerald-300'
            : 'cursor-pointer border-white/15 bg-white/5 hover:bg-white/10 ring-white/5 text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon className="w-4 h-4 transition-transform group-hover:scale-110" />
      <span className="text-xs font-bold">
        {blocked ? 'Alerts blocked' : enabled ? 'Warnings on' : 'Warn me'}
      </span>
    </motion.button>
  )
}

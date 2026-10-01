'use client'

import { Clock, UserRound } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Bridge's September 2026 account upgrade, told in consumer language: EUR
 * virtual accounts and payouts switch from Bridge's name to the customer's
 * own. Two phases, then gone — no second deploy needed to retire it:
 *
 *   heads-up      until the window opens — "address transfers to your name"
 *   maintenance   the announced window + delay margin — "expect a few hours"
 *   over          renders nothing
 *
 * Never says "Bridge": consumer surfaces don't name the payment partner.
 */

// Announced window: Sep 2, 8 AM–2 PM "EST". On Sep 2 the US east coast is
// actually on EDT (UTC-4); which one Bridge meant is ambiguous, so cover the
// union of both readings: 12:00–19:00 UTC.
const UPGRADE_STARTS = Date.UTC(2026, 8, 2, 12, 0)
// Worst-case window end (19:00 UTC) + the announced "up to 12 hours" of
// delayed on/offramps afterwards.
const UPGRADE_SETTLED = Date.UTC(2026, 8, 3, 7, 0)

type UpgradePhase = 'heads-up' | 'maintenance' | 'over'

function upgradePhase(now = Date.now()): UpgradePhase {
  if (now < UPGRADE_STARTS) return 'heads-up'
  if (now < UPGRADE_SETTLED) return 'maintenance'
  return 'over'
}

/** True only while transfers may actually be delayed — for inline one-liners. */
export function isBridgeUpgradeMaintenance(): boolean {
  return upgradePhase() === 'maintenance'
}

export function BridgeUpgradeNotice({ className }: { className?: string }) {
  const phase = upgradePhase()
  if (phase === 'over') return null
  const maintenance = phase === 'maintenance'

  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-2xl p-3 border',
        maintenance
          ? 'border-amber-500/30 bg-amber-500/[0.07]'
          : 'border-primary/25 bg-primary/[0.06]',
        className,
      )}
    >
      {maintenance ? (
        <Clock className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
      ) : (
        <UserRound className="h-4 w-4 text-primary shrink-0 mt-0.5" />
      )}
      <div className="min-w-0">
        <p className="text-xs font-semibold text-foreground">
          {maintenance
            ? 'Bank transfers are being upgraded'
            : 'Your account is getting your name'}
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
          {maintenance ? (
            <>
              Deposits and cash-outs may take a few hours longer today. Money
              already on its way is safe and arrives as soon as the upgrade
              completes.
            </>
          ) : (
            <>
              From September 2, deposits and payouts here carry your own name
              instead of our payment partner&apos;s. Address new bank transfers
              to your name — the old recipient name keeps working for 30 days.
              Around the upgrade, transfers may take a few hours longer.
            </>
          )}
        </p>
      </div>
    </div>
  )
}

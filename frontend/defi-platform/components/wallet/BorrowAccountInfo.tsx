"use client"

import { Badge } from '@/components/ui/badge'
import { FEATURE_FLAGS } from '@/config/featureFlags'
import type { AccountType } from '@/types/wallet'
import { cn } from '@/lib/utils'

type Props = {
  accountType: AccountType
  eligibleForSponsored: boolean
  reason?: string
  className?: string
}

export function BorrowAccountInfo({ accountType, eligibleForSponsored, reason, className }: Props) {
  if (!FEATURE_FLAGS.SMART_ACCOUNT_UPGRADES) return null

  const label = accountType === 'SMART_ACCOUNT'
    ? 'Smart account'
    : accountType === 'EOA_7702'
      ? 'EOA (7702-capable)'
      : 'EOA'

  const status = eligibleForSponsored ? 'Gasless ready' : 'Gasless not enabled'

  return (
    <div className={cn('flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-2 text-xs', className)}>
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className={cn(
          'bg-white/10 text-foreground backdrop-blur',
          accountType === 'SMART_ACCOUNT' && 'bg-emerald-500/20 text-emerald-100',
          accountType === 'EOA_7702' && 'bg-blue-500/20 text-blue-100',
        )}>
          {label}
        </Badge>
        <span className={cn(
          eligibleForSponsored ? 'text-emerald-500' : 'text-amber-500'
        )}>
          {status}
        </span>
      </div>
      {reason && !eligibleForSponsored && (
        <span className="text-muted-foreground/80">{reason}</span>
      )}
    </div>
  )
}

export default BorrowAccountInfo



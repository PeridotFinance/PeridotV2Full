"use client"

/**
 * UserPositionBadge — shows user's supplied + borrowed position inline in the row.
 *
 * Design decisions:
 * - Renders ONLY when wallet connected (component split ensures hooks
 *   don't fire for disconnected users — no wasted RPC calls).
 * - Shows: supplied value "$X.XX" in green, borrowed "$X.XX" in amber.
 *   Reason: Same color language as APY columns → instant context.
 * - Tiny (text-[10px]), sits below symbol label.
 *   Reason: Identity info (name/symbol) stays primary. Position is secondary.
 * - Skeleton while loading: avoids layout shift.
 * - Only shows non-zero positions. Zero = nothing shown (no clutter).
 */

import { usePTokenBalance } from '@/hooks/use-ptoken-balance'
import { useBorrowBalance } from '@/hooks/use-borrow-balance'
import { useActiveWallet } from '@/hooks/use-active-wallet'
import { cn } from '@/lib/utils'

interface UserPositionBadgeProps {
  assetId: string
  priceUsd: number
}

// Inner component — only mounts when connected (hooks don't fire for others)
function PositionBadgeInner({ assetId, priceUsd }: UserPositionBadgeProps) {
  const { numericBalance: supplied, isLoading: supplyLoading } = usePTokenBalance({ assetId })
  const { numericBalance: borrowed, isLoading: borrowLoading } = useBorrowBalance({ assetId })

  const suppliedUsd = (supplied ?? 0) * priceUsd
  const borrowedUsd = (borrowed ?? 0) * priceUsd

  const hasSupply = suppliedUsd > 0.001
  const hasBorrow = borrowedUsd > 0.001

  if (supplyLoading || borrowLoading) {
    return (
      <div className="flex gap-1.5 mt-0.5">
        <div className="h-3 w-10 rounded bg-white/[0.06] animate-pulse" />
      </div>
    )
  }

  if (!hasSupply && !hasBorrow) return null

  function fmt(usd: number) {
    if (usd >= 1000) return `$${(usd / 1000).toFixed(1)}K`
    if (usd >= 0.01) return `$${usd.toFixed(2)}`
    return '<$0.01'
  }

  return (
    <div className="flex items-center gap-1.5 mt-0.5">
      {hasSupply && (
        <span className={cn(
          "text-[10px] font-mono tabular-nums font-medium",
          "text-emerald-400/80 dark:text-emerald-400/70"
        )}>
          ↑ {fmt(suppliedUsd)}
        </span>
      )}
      {hasBorrow && (
        <span className={cn(
          "text-[10px] font-mono tabular-nums font-medium",
          "text-amber-400/70 dark:text-amber-400/60"
        )}>
          ↓ {fmt(borrowedUsd)}
        </span>
      )}
    </div>
  )
}

// Gate component — prevents hook initialization for disconnected users
export default function UserPositionBadge(props: UserPositionBadgeProps) {
  const { isConnected } = useActiveWallet()
  if (!isConnected) return null
  return <PositionBadgeInner {...props} />
}

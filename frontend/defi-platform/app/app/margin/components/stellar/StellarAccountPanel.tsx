'use client'

/**
 * Stellar margin account panel — collateral, debt, worst-position health.
 * No SMA / enable step on Stellar; an active account simply means a connected
 * wallet with margin collateral.
 */
import { motion } from 'framer-motion'
import { Wallet, Settings2, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { TermTip } from './TermTip'
import type { StellarMarginAccount } from '../../types/stellarMargin'

interface Props {
  account: StellarMarginAccount
  onManageCollateral?: () => void
  className?: string
}

function riskOf(hf: number | null): { stripe: string; hf: string; label: string } {
  if (hf === null) return { stripe: 'from-white/20 to-white/10', hf: 'text-muted-foreground', label: '—' }
  if (hf >= 2) return { stripe: 'from-emerald-500 to-teal-400', hf: 'text-emerald-400', label: 'Safe' }
  if (hf >= 1.5) return { stripe: 'from-yellow-400 to-amber-500', hf: 'text-yellow-400', label: 'Moderate' }
  if (hf >= 1.2) return { stripe: 'from-orange-500 to-red-400', hf: 'text-orange-400', label: 'High risk' }
  return { stripe: 'from-red-500 to-rose-600', hf: 'text-red-400', label: 'Critical' }
}

export function StellarAccountPanel({ account, onManageCollateral, className }: Props) {
  const r = riskOf(account.worstHealthFactor)
  const equity = account.marginCollateralUsd - account.borrowUsd
  const hfText = account.worstHealthFactor === null ? '—' : account.worstHealthFactor >= 99 ? '∞' : account.worstHealthFactor.toFixed(2)

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className={cn('relative overflow-hidden rounded-2xl backdrop-blur-xl border border-white/10 shadow-lg bg-white/5', className)}
    >
      <div className={cn('absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r', r.stripe)} />

      <div className="relative p-4 space-y-4 pt-5">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded-md bg-gradient-to-br from-primary/20 to-emerald-500/20 border border-primary/20">
            <Wallet className="w-3 h-3 text-primary" />
          </div>
          <TermTip tip="Your trading balance — move collateral here first, then it backs your positions." className="text-xs font-semibold text-foreground/70">Margin Account</TermTip>
          {account.isActive && (
            <Button variant="outline" size="sm" onClick={onManageCollateral}
              className="ml-auto h-7 gap-1 rounded-full border-white/15 bg-white/5 hover:bg-white/10 text-[11px]">
              <Settings2 className="w-3 h-3" /> Collateral
            </Button>
          )}
        </div>

        <div className="flex items-end justify-between">
          <div>
            <div className="text-2xl font-black leading-none tabular-nums">${equity.toFixed(2)}</div>
            <TermTip tip="Collateral minus borrowed — what's actually yours right now." className="text-[10px] text-muted-foreground/40 mt-1 block w-fit">equity</TermTip>
          </div>
          <div className="text-right">
            <div className={cn('text-2xl font-black leading-none tabular-nums', r.hf)}>{hfText}</div>
            <TermTip tip="How safe your riskiest position is. Below 1.0 it gets liquidated — add collateral or close to raise it." side="bottom" className="text-[10px] text-muted-foreground/40 mt-1 block w-fit ml-auto">health · {r.label}</TermTip>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/6">
          <div>
            <div className="text-sm font-semibold tabular-nums">${account.marginCollateralUsd.toFixed(2)}</div>
            <div className="text-[10px] text-muted-foreground/40">collateral</div>
          </div>
          <div className="text-right">
            <div className="text-sm font-semibold tabular-nums text-orange-400/80">${account.borrowUsd.toFixed(2)}</div>
            <div className="text-[10px] text-muted-foreground/40">borrowed</div>
          </div>
        </div>

        {account.worstHealthFactor !== null && account.worstHealthFactor < 1.2 && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-800 dark:text-red-300 text-xs">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 animate-pulse" />
            Near liquidation — repay debt or close a position.
          </div>
        )}
        {account.worstHealthFactor !== null && account.worstHealthFactor >= 1.2 && account.worstHealthFactor < 1.5 && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-800 dark:text-yellow-300/90 text-xs">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            Health is getting low — consider adding collateral.
          </div>
        )}
      </div>
    </motion.div>
  )
}

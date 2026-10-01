'use client'

/**
 * Repay dialog for a position that is stuck mid-CLOSE.
 *
 * `finish_close_position_v3` repays the debt out of the swap proceeds. When those
 * proceeds land short, finish reverts — and the close hook already covers the
 * ordinary case by quietly repaying the difference from the wallet and retrying.
 * That automatic fallback is deliberately capped at 2% of the debt, because
 * silently spending an unbounded amount of a user's wallet is not a thing a retry
 * button should do.
 *
 * Past that cap the position has no way out on its own: cancel is off the table
 * once the swap executed, and every finish attempt hits the same shortfall. This
 * dialog is that way out — the user decides how much to repay, which is exactly
 * the decision the automatic path is not allowed to make for them.
 *
 * No health/liquidation preview here, unlike the open-position repay dialog:
 * the collateral has already left the position, so those numbers describe
 * nothing. The only figure that matters is how much debt is left standing
 * between the user and a finished close.
 */
import { useEffect, useMemo, useState } from 'react'
import { Loader2, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useStellarMarginRepay } from '../../hooks/use-stellar-margin-repay'
import { assetByToken } from '../../config/stellarMarginConfig'
import { formatUnitsToDecimal } from '@/lib/stellar-margin'
import type { StellarMarginAsset, StellarPendingCloseView } from '../../types/stellarMargin'

interface Props {
  pending: StellarPendingCloseView
  /** Market state — supplies the wallet balance of the debt asset. */
  assets?: StellarMarginAsset[]
  onDone?: () => void
  onCancel?: () => void
  /** Mirrors "a repayment is signing" to the parent, which owns the dialog's
   *  dismissal — closing mid-flight unmounts this and every trace of it. */
  onBusyChange?: (busy: boolean) => void
}

const fmt = (n: number, symbol: string) => (symbol === 'XLM' ? n.toFixed(4) : n.toFixed(2))

export function StellarCloseRepayDialog({ pending, assets, onDone, onCancel, onBusyChange }: Props) {
  const [amount, setAmount] = useState('')
  const { repayPosition, statusMessage, error, isLoading } = useStellarMarginRepay(() => {
    setAmount('')
    onDone?.()
  })

  const debtCfg = assetByToken(pending.debtToken)
  const symbol = debtCfg?.label ?? ''
  const decimals = debtCfg?.decimals ?? 7
  const walletBalance = assets?.find((a) => a.token === pending.debtToken)?.walletBalance ?? 0

  // `debtAmountRaw` is 0 on builds where the contract doesn't expose it on the
  // pending. Treat that as "unknown" rather than "nothing owed": the hook re-reads
  // the live debt and clamps to it before signing, so an unknown here costs the
  // user a Max button, never a wrong repayment.
  const debtHuman = useMemo(() => {
    if (pending.debtAmountRaw <= BigInt(0)) return null
    return parseFloat(formatUnitsToDecimal(pending.debtAmountRaw, decimals)) || 0
  }, [pending.debtAmountRaw, decimals])

  const max = debtHuman != null ? Math.min(walletBalance, debtHuman) : walletBalance
  const amountNum = parseFloat(amount) || 0
  const exceedsWallet = amountNum > walletBalance + 1e-9
  const exceedsDebt = debtHuman != null && amountNum > debtHuman + 1e-9

  const noDebtAssetInWallet = walletBalance <= 0
  const canSubmit = amountNum > 0 && !exceedsWallet && !exceedsDebt && !isLoading

  // The parent owns dismissal and can't see the hook's state — tell it, and
  // release the guard if this ever unmounts while still busy.
  useEffect(() => { onBusyChange?.(isLoading) }, [isLoading, onBusyChange])
  useEffect(() => () => onBusyChange?.(false), [onBusyChange])

  const handleSubmit = async () => {
    if (!canSubmit) return
    // A pending close carries everything a repayment needs to identify itself.
    await repayPosition(
      { id: pending.id, positionId: pending.positionId, side: pending.side, debtToken: pending.debtToken },
      amount,
    )
  }

  return (
    <div className="p-5 space-y-4">
      <p className="text-[13px] text-muted-foreground leading-relaxed">
        The sale of your collateral came up short of the debt, so the final step keeps failing. Repay the
        difference from your wallet, then hit <strong className="text-foreground font-semibold">Finish close</strong>{' '}
        again.
      </p>

      <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {pending.side} · still owes
          </span>
          <span className="text-sm font-semibold tabular-nums">
            {debtHuman != null ? `${fmt(debtHuman, symbol)} ${symbol}` : `— ${symbol}`}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            <Wallet className="w-3 h-3" /> In your wallet
          </span>
          <span className={cn('text-sm font-semibold tabular-nums', noDebtAssetInWallet && 'text-amber-400')}>
            {fmt(walletBalance, symbol)} {symbol}
          </span>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs text-muted-foreground">Amount to repay</label>
          <button
            type="button"
            disabled={max <= 0}
            onClick={() => setAmount(String(Math.floor(max * 10 ** decimals) / 10 ** decimals))}
            className="px-1.5 py-0.5 rounded-md bg-white/5 border border-white/10 text-[10px] font-semibold text-muted-foreground hover:text-primary hover:border-primary/40 disabled:opacity-40 transition-colors"
          >
            Max
          </button>
        </div>
        <div className="relative">
          <Input
            type="number"
            min="0"
            step="any"
            placeholder="0.00"
            value={amount}
            data-testid="margin-close-repay-amount"
            onChange={(e) => setAmount(e.target.value)}
            className={cn(
              'pr-16 bg-white/5 border-white/10 text-sm font-mono focus:border-primary/50 focus:ring-0',
              (exceedsWallet || exceedsDebt) && 'border-red-500/50',
            )}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-muted-foreground bg-white/8 px-1.5 py-0.5 rounded-md">
            {symbol}
          </span>
        </div>
        {exceedsWallet ? (
          <p className="text-[10px] text-red-400 pl-1">More than the {symbol} in your wallet</p>
        ) : exceedsDebt ? (
          <p className="text-[10px] text-red-400 pl-1">More than this close still owes</p>
        ) : null}
      </div>

      {noDebtAssetInWallet && (
        <p className="text-[11px] text-amber-400">
          You have no {symbol} in your wallet. Add some to cover the shortfall — your collateral is held by the
          close and comes back as soon as it finishes.
        </p>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex items-center gap-2">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} disabled={isLoading} className="h-11 px-4 text-sm text-muted-foreground">
            Cancel
          </Button>
        )}
        <Button data-testid="margin-close-repay-submit" onClick={handleSubmit} disabled={!canSubmit} className="flex-1 h-11 font-bold text-sm">
          {isLoading ? (
            <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />{statusMessage || 'Processing…'}</>
          ) : (
            'Repay shortfall'
          )}
        </Button>
      </div>
    </div>
  )
}

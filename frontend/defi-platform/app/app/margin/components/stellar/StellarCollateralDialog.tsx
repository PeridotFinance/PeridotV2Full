'use client'

/**
 * Manage-collateral dialog: move underlying between the wallet and MarginController
 * custody. "Add" deposits + moves to margin (spec §8); "Withdraw" releases margin
 * pTokens + redeems to the wallet (spec §12 post-close).
 */
import { useEffect, useState } from 'react'
import { Loader2, Plus, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useStellarMarginCollateral } from '../../hooks/use-stellar-margin-collateral'
import { STELLAR_MARGIN_CONFIG as CFG } from '../../config/stellarMarginConfig'
import type { StellarMarginAsset, StellarMarginAssetKey } from '../../types/stellarMargin'

/**
 * Truncate, never round.
 *
 * `toFixed` rounds to nearest, and every asset here carries 7 decimals — so a
 * wallet holding 9998.9999900 XLM got "9999.0000" written into the field by its
 * own Max button, which the dialog's `exceeds` check (tolerance 1e-9) then
 * rejected: a red "Exceeds wallet balance" and a dead submit, produced by the
 * shortcut that exists to fill in a valid amount.
 */
const floorTo = (n: number, decimals: number) => {
  const f = 10 ** decimals
  return Math.floor(n * f) / f
}

interface Props {
  assets: StellarMarginAsset[]
  onDone?: () => void
  /** Mirrors "a transfer is in flight" to the parent, which owns the dialog's
   *  dismissal — closing mid-signature unmounts this component and with it every
   *  trace of what is happening. */
  onBusyChange?: (busy: boolean) => void
  /** Instant margin-balance reflection, reconciled by the next on-chain read.
   *  `delta` is signed underlying (+add, −withdraw) for the given asset. */
  onOptimistic?: (key: StellarMarginAssetKey, delta: number) => void
}

type Tab = 'add' | 'withdraw'

export function StellarCollateralDialog({ assets, onDone, onBusyChange, onOptimistic }: Props) {
  const [tab, setTab] = useState<Tab>('add')
  const [assetKey, setAssetKey] = useState<StellarMarginAssetKey>('MOCK_USDT')
  const [amount, setAmount] = useState('')

  const { moveToMargin, moveToSpot, step, statusMessage, error, isLoading } = useStellarMarginCollateral(() => {
    setAmount('')
    onDone?.()
  })

  const asset = assets.find((a) => a.key === assetKey) ?? assets[0]
  const max = tab === 'add' ? (asset?.walletBalance ?? 0) : (asset?.marginUnderlying ?? 0)
  const decimals = asset?.decimals ?? 7
  /** What Max fills in, and what the label above the field promises. */
  const maxSpendable = floorTo(max, decimals)
  const amountNum = parseFloat(amount) || 0
  const exceeds = amountNum > max + 1e-9
  const canSubmit = amountNum > 0 && !exceeds && !isLoading

  // The parent owns dismissal and can't see the hook's state — tell it.
  useEffect(() => { onBusyChange?.(isLoading) }, [isLoading, onBusyChange])
  // A dialog that unmounts while still flagged busy would lock the parent's guard
  // shut forever. Release it on the way out.
  useEffect(() => () => onBusyChange?.(false), [onBusyChange])

  const handleSubmit = async () => {
    if (!canSubmit || !asset) return
    if (tab === 'add') {
      const ok = await moveToMargin(assetKey, amount)
      if (ok) onOptimistic?.(assetKey, amountNum)
    } else {
      // Withdraw: convert the entered underlying back to the margin pToken amount,
      // clamped to the on-chain margin pToken balance to avoid dust/overdraw.
      const underlyingRaw = BigInt(Math.floor(amountNum * 10 ** asset.decimals))
      let ptokens = (underlyingRaw * CFG.constants.EXCHANGE_SCALE) / asset.exchangeRate
      if (ptokens > asset.marginPtokensRaw) ptokens = asset.marginPtokensRaw
      const ok = await moveToSpot(assetKey, ptokens)
      if (ok) onOptimistic?.(assetKey, -amountNum)
    }
  }

  return (
    <div className="p-5 space-y-4">
      {/* Active collateral held in the margin account */}
      <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 space-y-1.5">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">In Margin Account</p>
        {assets.map((a) => (
          <div key={a.key} className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{a.label}</span>
            <span className="text-sm font-semibold tabular-nums text-foreground">{(a.marginUnderlying ?? 0).toFixed(4)}</span>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-white/5 border border-white/10">
        {(['add', 'withdraw'] as const).map((t) => (
          <button key={t} onClick={() => { setTab(t); setAmount('') }}
            className={cn('flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors',
              tab === t ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground')}>
            {t === 'add' ? <Plus className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
            {t === 'add' ? 'Add' : 'Withdraw'}
          </button>
        ))}
      </div>

      {/* Asset selector */}
      <div className="flex gap-2">
        {assets.map((a) => (
          <button key={a.key} onClick={() => { setAssetKey(a.key); setAmount('') }}
            className={cn('flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors',
              assetKey === a.key ? 'border-primary/40 bg-primary/10 text-primary' : 'border-white/10 bg-white/5 text-muted-foreground hover:text-foreground')}>
            {a.label}
          </button>
        ))}
      </div>

      {/* Amount */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs text-muted-foreground">
            {tab === 'add' ? 'Amount to add' : 'Amount to withdraw'}
          </label>
          <button onClick={() => maxSpendable > 0 && setAmount(String(maxSpendable))} className="text-[10px] text-primary hover:text-primary/80 font-medium">
            {tab === 'add' ? 'Wallet' : 'Margin'}: {floorTo(max, 4).toFixed(4)} {asset?.label}
          </button>
        </div>
        <div className="relative">
          <Input type="number" min="0" step="any" placeholder="0.00" value={amount}
            data-testid="margin-collateral-amount"
            onChange={(e) => setAmount(e.target.value)}
            className={cn('pr-16 bg-white/5 border-white/10 text-sm font-mono focus:border-primary/50 focus:ring-0', exceeds && 'border-red-500/50')} />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-muted-foreground bg-white/8 px-1.5 py-0.5 rounded-md">{asset?.label}</span>
        </div>
        {exceeds && <p className="text-[10px] text-red-400 pl-1">Exceeds {tab === 'add' ? 'wallet' : 'margin'} balance</p>}
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}
      {isLoading && statusMessage && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" />{statusMessage}</p>
      )}

      <Button data-testid="margin-collateral-submit" onClick={handleSubmit} disabled={!canSubmit} className="w-full h-11 font-bold text-sm">
        {isLoading ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />{statusMessage || 'Processing…'}</>
          : tab === 'add' ? 'Add to Margin' : 'Withdraw to Wallet'}
      </Button>
    </div>
  )
}

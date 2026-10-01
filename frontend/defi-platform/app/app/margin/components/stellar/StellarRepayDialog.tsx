'use client'

/**
 * "Add margin" dialog for one open position (a partial debt repayment).
 *
 * Pays down a position's debt from the WALLET (`repay_margin_position_v3`), which
 * is the only way to make an already-open position safer without closing it:
 * moving more collateral into the margin account funds NEW positions but is
 * invisible to this one's liquidation maths, which reads only its own collateral
 * and its own debt. The surface says "Add margin" — the trader's word for exactly
 * this move — and the copy spells out that it works by paying down debt, because
 * topping up account collateral is what traders reach for first and it would not
 * have helped.
 *
 * Everything the trader is deciding between is a risk number, so the dialog leads
 * with the before → after of exactly those three: debt, health, liquidation price.
 */
import { useEffect, useMemo, useState } from 'react'
import { ArrowDownToLine, ArrowRight, Loader2, ShieldCheck, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useStellarMarginRepay } from '../../hooks/use-stellar-margin-repay'
import { useStellarMarginCollateral } from '../../hooks/use-stellar-margin-collateral'
import { STELLAR_MARGIN_CONFIG as CFG } from '../../config/stellarMarginConfig'
import { ceilMulDiv, parseAmountToUnits } from '@/lib/stellar-margin'
import { liquidationPrice, previewRepay } from '../../lib/marginMath'
import type { StellarMarginAsset, StellarMarginPosition } from '../../types/stellarMargin'

interface Props {
  position: StellarMarginPosition
  /** Market state — supplies the wallet balance of the debt asset. */
  assets?: StellarMarginAsset[]
  /** Live XLM/USD, so the liquidation preview shares the chart's price domain. */
  referencePrice?: number
  onDone?: () => void
  onCancel?: () => void
  /** Mirrors "a repayment is signing" to the parent, which owns the dialog's
   *  dismissal — closing mid-flight unmounts this and every trace of it. */
  onBusyChange?: (busy: boolean) => void
  /** Balances moved but the dialog stays open (the trading-account → wallet
   *  transfer below). Separate from `onDone`, which also closes it. */
  onBalancesChanged?: () => void
}

const QUICK_FRACTIONS = [0.25, 0.5, 1] as const

/** Truncate, never round: a quick-fill that rounds UP lands above the balance it
 *  was derived from and trips the dialog's own "more than you hold" guard. */
const floorTo = (n: number, decimals: number) => {
  const f = 10 ** decimals
  return Math.floor(n * f) / f
}

/** Debt amounts read very differently per asset: 41.2 USDT vs 0.0042 XLM. */
const fmtAmount = (n: number, symbol: string) => (symbol === 'XLM' ? n.toFixed(4) : n.toFixed(2))

const fmtHf = (hf: number) => (hf >= 99 ? '∞' : hf.toFixed(2))

function hfColor(hf: number): string {
  // Brand green for "healthy" — the rest of the dialog's chrome is `primary`.
  if (hf >= 2) return 'text-primary'
  if (hf >= 1.5) return 'text-yellow-400'
  if (hf >= 1.1) return 'text-orange-400'
  return 'text-red-400'
}

export function StellarRepayDialog({ position: p, assets, referencePrice, onDone, onCancel, onBusyChange, onBalancesChanged }: Props) {
  const [amount, setAmount] = useState('')
  const { repayPosition, statusMessage, error, isLoading } = useStellarMarginRepay(() => {
    setAmount('')
    onDone?.()
  })

  const debtAsset = assets?.find((a) => a.token === p.debtToken)
  const walletBalance = debtAsset?.walletBalance ?? 0
  // Same price the panel's Liq. Price column uses, so the "now" side of the
  // preview matches the row the trader opened this from.
  const price = referencePrice && referencePrice > 0 ? referencePrice : (assets?.find((a) => a.key === 'XLM')?.priceUsd ?? 1)
  const mm = CFG.constants.MAINTENANCE_MARGIN

  // You can't repay more than you hold, or more than the position owes.
  const max = Math.min(walletBalance, p.debtAmount)
  const amountNum = parseFloat(amount) || 0
  const exceedsWallet = amountNum > walletBalance + 1e-9
  const exceedsDebt = amountNum > p.debtAmount + 1e-9

  const currentLiq = useMemo(
    () => liquidationPrice({ side: p.side, collateralUsd: p.collateralUsd, debtUsd: p.debtUsd, maintenanceMargin: mm, price }),
    [p.side, p.collateralUsd, p.debtUsd, mm, price],
  )

  const preview = useMemo(
    () =>
      amountNum > 0
        ? previewRepay({
            side: p.side,
            collateralUsd: p.collateralUsd,
            debtAmount: p.debtAmount,
            debtUsd: p.debtUsd,
            healthFactor: p.healthFactor,
            repayAmount: Math.min(amountNum, p.debtAmount),
            maintenanceMargin: mm,
            price,
          })
        : null,
    [amountNum, p.side, p.collateralUsd, p.debtAmount, p.debtUsd, p.healthFactor, mm, price],
  )

  const noDebtAssetInWallet = walletBalance <= 0

  /**
   * "You have no USDT in your wallet" — said to a trader looking at 250 USDT on
   * the same page.
   *
   * Both statements are true: everything else on /app/margin reports the MARGIN
   * account (`marginUnderlying`), which is where the funding flow deposits, while
   * a repayment is paid out of the plain wallet balance. So the money the trader
   * can see is real, one transfer away, and the dialog used to send them off to
   * find it themselves — or, worse, to close a position they only wanted to make
   * safer. It moves the funds across instead.
   */
  const marginAvailable = debtAsset?.marginUnderlying ?? 0
  const marginPtokensRaw = debtAsset?.marginPtokensRaw ?? BigInt(0)
  const shortfall = Math.max(0, Math.min(p.debtAmount, walletBalance + marginAvailable) - walletBalance)
  const canTopUpFromMargin = shortfall > 0 && marginPtokensRaw > BigInt(0)

  const { moveToSpot, isLoading: isMoving } = useStellarMarginCollateral(() => {
    onBalancesChanged?.()
  })

  const handleMoveFromMargin = async () => {
    if (!debtAsset || !canTopUpFromMargin) return
    // Underlying → pTokens (spec §4 inverted), rounded UP so the transfer can
    // never land a hair under what was promised, and capped at what margin holds
    // so rounding up can't ask for pTokens that aren't there.
    const units = BigInt(parseAmountToUnits(String(shortfall), debtAsset.decimals))
    const rate = debtAsset.exchangeRate > BigInt(0) ? debtAsset.exchangeRate : CFG.constants.EXCHANGE_SCALE
    const wanted = ceilMulDiv(units, CFG.constants.EXCHANGE_SCALE, rate)
    await moveToSpot(debtAsset.key, wanted > marginPtokensRaw ? marginPtokensRaw : wanted)
  }

  const canSubmit = amountNum > 0 && !exceedsWallet && !exceedsDebt && !isLoading && !isMoving

  // The parent owns dismissal and can't see the hook's state — tell it, and
  // release the guard if this ever unmounts while still busy.
  useEffect(() => { onBusyChange?.(isLoading) }, [isLoading, onBusyChange])
  useEffect(() => () => onBusyChange?.(false), [onBusyChange])

  const handleSubmit = async () => {
    if (!canSubmit) return
    await repayPosition(p, amount)
  }

  return (
    <div className="p-5 space-y-4">
      {/* What's being repaid, and out of which pocket. */}
      <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {p.side} · owes
          </span>
          <span className="text-sm font-semibold tabular-nums">
            {fmtAmount(p.debtAmount, p.debtSymbol)} {p.debtSymbol}
            <span className="ml-1.5 text-[11px] font-normal text-muted-foreground/60">${p.debtUsd.toFixed(2)}</span>
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            <Wallet className="w-3 h-3" /> In your wallet
          </span>
          <span className={cn('text-sm font-semibold tabular-nums', noDebtAssetInWallet && 'text-amber-400')}>
            {fmtAmount(walletBalance, p.debtSymbol)} {p.debtSymbol}
          </span>
        </div>
      </div>

      {/* Amount + quick fractions of the outstanding debt */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs text-muted-foreground">Amount to add</label>
          <div className="flex items-center gap-1">
            {QUICK_FRACTIONS.map((f) => (
              <button
                key={f}
                type="button"
                disabled={max <= 0}
                onClick={() => setAmount(String(floorTo(max * f, debtAsset?.decimals ?? 7)))}
                className="px-1.5 py-0.5 rounded-md bg-white/5 border border-white/10 text-[10px] font-semibold text-muted-foreground hover:text-primary hover:border-primary/40 disabled:opacity-40 transition-colors"
              >
                {f === 1 ? 'Max' : `${f * 100}%`}
              </button>
            ))}
          </div>
        </div>
        <div className="relative">
          <Input
            type="number"
            min="0"
            step="any"
            placeholder="0.00"
            value={amount}
            data-testid="margin-repay-amount"
            onChange={(e) => setAmount(e.target.value)}
            className={cn(
              'pr-16 bg-white/5 border-white/10 text-sm font-mono focus:border-primary/50 focus:ring-0',
              (exceedsWallet || exceedsDebt) && 'border-red-500/50',
            )}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-muted-foreground bg-white/8 px-1.5 py-0.5 rounded-md">
            {p.debtSymbol}
          </span>
        </div>
        {exceedsWallet ? (
          <p className="text-[10px] text-red-400 pl-1">More than the {p.debtSymbol} in your wallet</p>
        ) : exceedsDebt ? (
          <p className="text-[10px] text-red-400 pl-1">More than this position owes</p>
        ) : null}
      </div>

      {/* Before → after on the three numbers a repayment exists to move. */}
      <div className="rounded-xl bg-white/5 border border-white/10 divide-y divide-white/5">
        <PreviewRow
          label="Debt"
          before={`${fmtAmount(p.debtAmount, p.debtSymbol)} ${p.debtSymbol}`}
          after={preview ? `${fmtAmount(preview.newDebtAmount, p.debtSymbol)} ${p.debtSymbol}` : null}
        />
        {/* An unknown health can't be projected: `previewRepay` scales the current
            value, so a 0 standing in for "the oracle didn't answer" would render
            a confident before/after pair built on a number that means nothing. */}
        <PreviewRow
          label="Health"
          before={p.healthUnknown ? '—' : fmtHf(p.healthFactor)}
          beforeClass={p.healthUnknown ? 'text-white/40' : hfColor(p.healthFactor)}
          after={preview && !p.healthUnknown ? fmtHf(preview.newHealthFactor) : null}
          afterClass={preview && !p.healthUnknown ? hfColor(preview.newHealthFactor) : undefined}
        />
        <PreviewRow
          label="Liq. Price"
          before={currentLiq ? `$${currentLiq.toFixed(4)}` : '—'}
          after={preview ? (preview.newLiqPrice ? `$${preview.newLiqPrice.toFixed(4)}` : 'none') : null}
        />
      </div>

      {preview?.clearsDebt && (
        <p className="flex items-start gap-1.5 text-[11px] text-primary">
          <ShieldCheck className="w-3.5 h-3.5 mt-px shrink-0" />
          This clears the debt entirely — the position can no longer be liquidated. Your {p.collateralSymbol} stays
          in it until you close.
        </p>
      )}

      {/* The misconception this feature exists to correct. */}
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Adding margin pays down this position’s debt straight from your wallet — that’s what raises its health.
        Moving collateral into your margin account instead funds new positions — it does not protect this one.
      </p>

      {canTopUpFromMargin ? (
        <div className="rounded-xl border border-primary/25 bg-primary/10 px-3 py-2.5 space-y-2">
          <p className="text-[11px] leading-relaxed text-foreground/90">
            Your {p.debtSymbol} is in your <span className="font-semibold">trading account</span>, not your wallet —
            that’s where deposits land, and a repayment is paid from the wallet. Move
            {' '}{fmtAmount(shortfall, p.debtSymbol)} {p.debtSymbol} across and you can add margin right here.
          </p>
          <Button
            variant="outline"
            onClick={handleMoveFromMargin}
            disabled={isMoving || isLoading}
            className="h-9 w-full rounded-lg text-xs font-bold"
          >
            {isMoving ? (
              <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Moving to wallet…</>
            ) : (
              <><ArrowDownToLine className="w-3.5 h-3.5 mr-1.5" />Move {fmtAmount(shortfall, p.debtSymbol)} {p.debtSymbol} to my wallet</>
            )}
          </Button>
        </div>
      ) : noDebtAssetInWallet ? (
        <p className="text-[11px] text-amber-400">
          You have no {p.debtSymbol} in your wallet or your trading account. Add some to add margin here, or close the
          position instead — closing settles the debt from the position itself and needs nothing in your wallet.
        </p>
      ) : null}

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex items-center gap-2">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} disabled={isLoading} className="h-11 px-4 text-sm text-muted-foreground">
            Cancel
          </Button>
        )}
        <Button data-testid="margin-repay-submit" onClick={handleSubmit} disabled={!canSubmit} className="flex-1 h-11 font-bold text-sm">
          {isLoading ? (
            <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />{statusMessage || 'Processing…'}</>
          ) : (
            'Add margin'
          )}
        </Button>
      </div>
    </div>
  )
}

function PreviewRow({
  label, before, after, beforeClass, afterClass,
}: {
  label: string
  before: string
  after: string | null
  beforeClass?: string
  afterClass?: string
}) {
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5 text-xs tabular-nums">
        <span className={cn(after ? 'text-muted-foreground/50 line-through decoration-muted-foreground/30' : 'font-semibold', beforeClass)}>
          {before}
        </span>
        {after && (
          <>
            <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
            <span className={cn('font-semibold', afterClass)}>{after}</span>
          </>
        )}
      </div>
    </div>
  )
}

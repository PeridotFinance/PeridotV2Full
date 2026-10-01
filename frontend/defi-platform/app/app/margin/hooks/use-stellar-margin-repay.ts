'use client'

/**
 * use-stellar-margin-repay
 *
 * Partial (or full) repayment of one position's debt:
 *
 *   repay_margin_position_v3(user, position_id, amount)
 *
 * The controller pulls `amount` of the DEBT asset out of the user's WALLET and
 * writes it against this position's debt. Collateral is untouched, so the debt
 * falling is the only thing that moves — equity, health factor and liquidation
 * price all improve as a consequence. Works on Open and Closing positions alike.
 *
 * Note what this is NOT: adding free margin (deposit_collateral +
 * transfer_spot_to_margin) funds NEW positions but does nothing for existing
 * ones — the liquidation maths reads only a position's own `collateral_ptokens`
 * and its debt, and ignores unrelated margin balance entirely. Repaying is the
 * only way to make an already-open position safer without closing it, which is
 * why the risk copy in the positions panel points here.
 *
 * Single on-chain call, so none of the split-flow choreography the open/close
 * paths need: no pending state to strand, nothing to recover, and a failure
 * leaves the position exactly as it was.
 *
 * Two clamps before anything is signed, both downward:
 *   - the user's wallet balance of the debt asset, and
 *   - the position's CURRENT on-chain debt, re-read here rather than trusted
 *     from the (polled, possibly stale) position row.
 * Clamping down is the safe direction: interest keeps accruing between the read
 * and the tx landing, so a repayment sized to the debt we just read can only
 * come in under it, never over.
 */
import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { usePrivy } from '@privy-io/react-auth'
import { useStellarWallet } from '@/hooks/use-stellar-wallet'
import { assetByToken } from '../config/stellarMarginConfig'
import { recordMarginTrade } from './use-stellar-margin-journal'
import {
  repayMarginPositionV3,
  vaultGetMarginBorrowBalance,
  getTokenBalance,
  parseAmountToUnits,
  formatUnitsToDecimal,
} from '@/lib/stellar-margin'
import { readableMarginError } from '../lib/stellarMarginErrors'
import type { StellarRepayTarget } from '../types/stellarMargin'

export type RepayStep = 'idle' | 'checking' | 'repaying' | 'success' | 'error'

function emit(step: string, statusMessage: string, hash?: string) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('peridot:tx-update', {
    detail: { action: 'margin-repay', step, statusMessage, txHash: hash },
  }))
}

export interface UseStellarMarginRepayResult {
  /** Repay `amountHuman` of the position's debt asset. Resolves false on failure.
   *  Accepts any {@link StellarRepayTarget}, so an open row and a stranded
   *  split-close both repay through this one path — as the contract allows. */
  repayPosition: (position: StellarRepayTarget, amountHuman: string) => Promise<boolean>
  step: RepayStep
  error: string | null
  statusMessage: string
  isLoading: boolean
  reset: () => void
}

export function useStellarMarginRepay(onRepaid?: (positionId: string) => void): UseStellarMarginRepayResult {
  const { address } = useStellarWallet()
  const { getAccessToken } = usePrivy()
  const [step, setStep] = useState<RepayStep>('idle')
  const [error, setError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState('')

  const fail = useCallback((e: unknown) => {
    const msg = readableMarginError(e)
    setError(msg); setStep('error'); setStatusMessage(msg)
    emit('error', msg)
    // Persistent, like the close path: a repay failure carries a reason the user
    // needs to read (wrong asset in the wallet, balance short) and a 4s toast
    // loses it before they've looked away from the amount field.
    toast.error(msg, { duration: Infinity })
    return false
  }, [])

  const repayPosition = useCallback(async (position: StellarRepayTarget, amountHuman: string): Promise<boolean> => {
    const debt = assetByToken(position.debtToken)
    if (!debt) { toast.error('Unsupported market.'); return false }

    const requested = parseFloat(amountHuman)
    if (!(requested > 0)) { toast.error('Enter an amount first.'); return false }

    if (!address) { toast.error('Connect your wallet first.'); return false }

    setError(null)
    try {
      setStep('checking'); setStatusMessage('Checking your balance…')
      emit('checking', 'Checking your balance…')

      const requestedUnits = BigInt(parseAmountToUnits(amountHuman, debt.decimals))
      if (requestedUnits <= BigInt(0)) { toast.error('Enter an amount first.'); setStep('idle'); return false }

      const [walletUnits, debtUnits] = await Promise.all([
        getTokenBalance(debt.token, address),
        vaultGetMarginBorrowBalance(debt.vault, position.positionId),
      ])

      if (debtUnits <= BigInt(0)) {
        setStep('idle')
        toast.info('This position has no debt left to repay.')
        onRepaid?.(position.id)
        return false
      }
      if (walletUnits <= BigInt(0)) {
        return fail(new Error(
          `You need ${debt.label} in your wallet to repay this position — a repayment is paid from your wallet, not from your margin balance.`,
        ))
      }

      // Clamp, never round up: min(asked, held, owed).
      let amountUnits = requestedUnits
      if (amountUnits > walletUnits) amountUnits = walletUnits
      if (amountUnits > debtUnits) amountUnits = debtUnits
      if (amountUnits <= BigInt(0)) { setStep('idle'); return false }

      // Neutral phrasing: this hook backs both the row's "Add Margin" dialog and
      // the stuck-close recovery's "Repay" — the mechanics are the same repayment.
      setStep('repaying'); setStatusMessage('Paying down debt…')
      emit('repaying', 'Paying down debt…')
      const res = await repayMarginPositionV3(address, position.positionId, amountUnits)

      const repaidHuman = parseFloat(formatUnitsToDecimal(amountUnits, debt.decimals)) || 0
      setStep('success'); setStatusMessage('Debt reduced.')
      emit('success', 'Debt reduced.', res.hash)
      toast.success(`Debt reduced by ${repaidHuman.toFixed(debt.label === 'XLM' ? 4 : 2)} ${debt.label}`)

      // Journalled so the position's funding cost, and (on a Short, whose debt IS
      // its XLM exposure) the PnL slice this repayment locks in, both stay right
      // for the rest of the trade's life. Best-effort like the other tx-success
      // writes: a dropped row costs history, never the repayment.
      void recordMarginTrade(getAccessToken, address, {
        positionId: position.id,
        eventType: 'repay',
        side: position.side,
        // `borrowAmount` is the journal's debt-denominated column — here, what
        // this repayment paid off.
        borrowAmount: repaidHuman,
        // XLM-denominated exposure retired. A Short owes XLM, so repaying closes
        // that much of the trade; a Long owes USDT and retires no exposure.
        xlmAmount: position.side === 'Short' ? repaidHuman : undefined,
        collateralSymbol: debt.label,
        collateralAmount: repaidHuman,
        txHash: res.hash,
      })

      onRepaid?.(position.id)
      setTimeout(() => setStep('idle'), 1500)
      return true
    } catch (e) {
      return fail(e)
    }
  }, [address, fail, onRepaid, getAccessToken])

  const reset = useCallback(() => {
    setStep('idle'); setError(null); setStatusMessage('')
  }, [])

  return {
    repayPosition,
    step, error, statusMessage,
    isLoading: step === 'checking' || step === 'repaying',
    reset,
  }
}

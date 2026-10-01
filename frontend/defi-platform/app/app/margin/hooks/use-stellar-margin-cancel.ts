'use client'

/**
 * use-stellar-margin-cancel
 *
 * Cancels an unfinished V3 open:
 *   cancel_pending_open_v3(user, position_id)
 *
 * A V3 pending carries NO wallet debt (the borrow only happens on-chain inside
 * swap_open_position_v3), so there is no repay amount, no wallet-balance check
 * and no "swap the debt back first" recovery case — cancel simply returns the
 * locked margin pTokens to the user's margin balance.
 *
 * The one guard that matters: once the swap step EXECUTED, the pending can no
 * longer be cancelled — the only way forward is activation (which the contract
 * allows even past the pending deadline). We check the execution read first and
 * steer the user to "Finish" instead of letting the contract revert on them.
 */
import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { usePrivy } from '@privy-io/react-auth'
import { useStellarWallet } from '@/hooks/use-stellar-wallet'
import { recordMarginTrade } from './use-stellar-margin-journal'
import {
  getPendingPerpsOpenExecution,
  cancelPendingOpenV3,
} from '@/lib/stellar-margin'
import { readableMarginError } from '../lib/stellarMarginErrors'
import type { StellarPendingOpenView } from '../types/stellarMargin'

export type CancelStep = 'idle' | 'checking' | 'cancelling' | 'success' | 'error'

function emit(step: CancelStep, statusMessage: string, hash?: string) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('peridot:tx-update', {
    detail: { action: 'margin-cancel-open', step, statusMessage, txHash: hash },
  }))
}

export interface UseStellarMarginCancelResult {
  cancelPending: (pending: StellarPendingOpenView) => Promise<boolean>
  step: CancelStep
  error: string | null
  isLoading: boolean
  reset: () => void
}

export function useStellarMarginCancel(onCancelled?: (positionId: string) => void): UseStellarMarginCancelResult {
  const { address } = useStellarWallet()
  const { getAccessToken } = usePrivy()
  const [step, setStep] = useState<CancelStep>('idle')
  const [error, setError] = useState<string | null>(null)

  const cancelPending = useCallback(async (pending: StellarPendingOpenView): Promise<boolean> => {
    if (!address) { toast.error('Connect your wallet first.'); return false }

    setError(null)
    try {
      // Guard: a pending whose swap already executed can only be ACTIVATED.
      // Re-read fresh (the list view may be up to one poll stale) so we never
      // send a cancel the contract is guaranteed to reject.
      setStep('checking'); emit('checking', 'Checking status…')
      const execution = await getPendingPerpsOpenExecution(pending.positionId)
      if (pending.hasExecution || execution) {
        throw new Error('This trade is already swapped — use "Finish" to activate it instead of cancelling.')
      }

      setStep('cancelling'); emit('cancelling', 'Cancelling…')
      const res = await cancelPendingOpenV3(address, pending.positionId)

      setStep('success'); emit('success', 'Cancelled. Collateral released.', res.hash)
      toast.success('Pending position cancelled')

      void recordMarginTrade(getAccessToken, address, {
        positionId: pending.id,
        eventType: 'cancel',
        side: pending.side,
        borrowAmount: pending.borrowAmount,
        txHash: res.hash,
      })

      onCancelled?.(pending.id)
      return true
    } catch (e) {
      const msg = readableMarginError(e)
      setError(msg); setStep('error'); emit('error', msg)
      toast.error(msg)
      return false
    }
  }, [address, onCancelled, getAccessToken])

  const reset = useCallback(() => { setStep('idle'); setError(null) }, [])

  return {
    cancelPending,
    step,
    error,
    isLoading: step === 'checking' || step === 'cancelling',
    reset,
  }
}

'use client'

/**
 * use-robinhood-margin-deposit
 *
 * USDG -> pUSDG -> margin vault, one signature per step (guide 6A). The hook
 * exposes each step as it runs so the UI can show "approve, supply, approve,
 * deposit" with its own progress, and a failure names the step it happened
 * in. Shares minted in an interrupted run stay in the wallet and are resumed
 * with `deposit({ shares })`, which starts at the vault approval.
 */
import { useCallback, useState } from 'react'
import { runRobinhoodDeposit, type RobinhoodDepositInput, type RobinhoodDepositResult } from '@/lib/robinhood/flows'
import type { RobinhoodDecodedError } from '@/lib/robinhood/errors'
import { RobinhoodTxError, type RobinhoodTxUpdate } from '@/lib/robinhood/tx'
import { decodeRobinhoodError } from '@/lib/robinhood/errors'
import { requestRobinhoodRefresh } from './use-robinhood-refresh'
import { useRobinhoodTxDeps } from './use-robinhood-tx-deps'

export type RobinhoodFlowStatus = 'idle' | 'running' | 'success' | 'error'

/** Keep one row per call id, updated in place, in the order the calls started. */
export function mergeRobinhoodStep(steps: RobinhoodTxUpdate[], update: RobinhoodTxUpdate): RobinhoodTxUpdate[] {
  const index = steps.findIndex((s) => s.callId === update.callId)
  if (index === -1) return [...steps, update]
  const next = steps.slice()
  next[index] = { ...next[index], ...update }
  return next
}

export function toRobinhoodFlowError(err: unknown): RobinhoodDecodedError {
  return err instanceof RobinhoodTxError ? err.decoded : decodeRobinhoodError(err)
}

export function useRobinhoodMarginDeposit() {
  const { deps, user, pending, reconcile } = useRobinhoodTxDeps()
  const [status, setStatus] = useState<RobinhoodFlowStatus>('idle')
  const [steps, setSteps] = useState<RobinhoodTxUpdate[]>([])
  const [error, setError] = useState<RobinhoodDecodedError | null>(null)
  const [result, setResult] = useState<RobinhoodDepositResult | null>(null)

  const reset = useCallback(() => {
    setStatus('idle')
    setSteps([])
    setError(null)
    setResult(null)
  }, [])

  const deposit = useCallback(
    async (input: RobinhoodDepositInput): Promise<RobinhoodDepositResult | null> => {
      if (!user) {
        setError({ kind: 'unknown', errorName: null, args: [], message: 'Connect a wallet first.', detail: 'no wallet' })
        setStatus('error')
        return null
      }
      // A hash still in flight from an earlier attempt is settled first, so a
      // timeout never turns into a second supply of the same funds.
      const open = await reconcile()
      if (open.length > 0) {
        setError({
          kind: 'network',
          errorName: null,
          args: [],
          message: 'An earlier transaction is still waiting for confirmation. Check it before sending another.',
          detail: open.map((e) => e.hash).join(','),
        })
        setStatus('error')
        return null
      }

      setStatus('running')
      setSteps([])
      setError(null)
      setResult(null)
      try {
        const res = await runRobinhoodDeposit(deps, user, input, (u) => setSteps((s) => mergeRobinhoodStep(s, u)))
        setResult(res)
        setStatus('success')
        return res
      } catch (err) {
        setError(toRobinhoodFlowError(err))
        setStatus('error')
        return null
      } finally {
        // Whatever confirmed before a failure (an approval, a mint) is real
        // chain state; the readers should show it.
        requestRobinhoodRefresh()
      }
    },
    [deps, user, reconcile],
  )

  return {
    deposit,
    reset,
    status,
    steps,
    error,
    result,
    pending,
    reconcile,
    isRunning: status === 'running',
  }
}

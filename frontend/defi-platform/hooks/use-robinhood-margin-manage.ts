'use client'

/**
 * use-robinhood-margin-manage
 *
 * Step 6 on the page: close (with a live close quote), add margin, repay,
 * the exit without prices, withdraw, convert to USDG and collect rewards.
 * Each action runs through `useRobinhoodAction`, which carries the same rules
 * as the deposit and open hooks: settle any remembered hash first, show one
 * row per signed call, and refresh the readers whatever happened, because a
 * confirmed approval before a failure is still real chain state.
 */
import { useCallback, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useAccount } from 'wagmi'
import type { Address } from 'viem'
import { getRobinhoodPublicClient } from '@/lib/robinhood/client'
import type { RobinhoodDecodedError } from '@/lib/robinhood/errors'
import type { RobinhoodFlowDeps } from '@/lib/robinhood/flows'
import {
  quoteRobinhoodClose,
  RobinhoodCloseRequoteError,
  runRobinhoodAddCollateral,
  runRobinhoodClose,
  runRobinhoodDebtFreeExit,
  runRobinhoodRedeem,
  runRobinhoodRepay,
  runRobinhoodSettleRewards,
  runRobinhoodWithdraw,
  type RobinhoodCloseQuote,
  type RobinhoodCloseQuoteInput,
} from '@/lib/robinhood/manage'
import type { RobinhoodPosition } from '@/lib/robinhood/reads'
import type { RobinhoodTxUpdate } from '@/lib/robinhood/tx'
import { reportRobinhoodPoints } from '@/lib/robinhood/points-client'
import { mergeRobinhoodStep, toRobinhoodFlowError } from './use-robinhood-margin-deposit'
import { requestRobinhoodRefresh } from './use-robinhood-refresh'
import { useRobinhoodTxDeps } from './use-robinhood-tx-deps'

export type RobinhoodActionStatus = 'idle' | 'running' | 'success' | 'error' | 'requote'

const noWallet: RobinhoodDecodedError = { kind: 'unknown', errorName: null, args: [], message: 'Connect a wallet first.', detail: 'no wallet' }

/** One flow at a time, with steps, a decoded error and the flow's own result. */
export function useRobinhoodAction<T>() {
  const { deps, user, reconcile } = useRobinhoodTxDeps()
  const [status, setStatus] = useState<RobinhoodActionStatus>('idle')
  const [steps, setSteps] = useState<RobinhoodTxUpdate[]>([])
  const [error, setError] = useState<RobinhoodDecodedError | null>(null)
  const [result, setResult] = useState<T | null>(null)
  const [closeRequote, setCloseRequote] = useState<RobinhoodCloseQuote | null>(null)

  const reset = useCallback(() => {
    setStatus('idle')
    setSteps([])
    setError(null)
    setResult(null)
    setCloseRequote(null)
  }, [])

  const run = useCallback(
    async (flow: (deps: RobinhoodFlowDeps, user: Address, onUpdate: (u: RobinhoodTxUpdate) => void) => Promise<T>): Promise<T | null> => {
      if (!user) {
        setError(noWallet)
        setStatus('error')
        return null
      }
      const stillOpen = await reconcile()
      if (stillOpen.length > 0) {
        setError({
          kind: 'network',
          errorName: null,
          args: [],
          message: 'An earlier transaction is still waiting for confirmation. Check it before sending another.',
          detail: stillOpen.map((e) => e.hash).join(','),
        })
        setStatus('error')
        return null
      }
      setStatus('running')
      setSteps([])
      setError(null)
      setResult(null)
      setCloseRequote(null)
      try {
        const res = await flow(deps, user, (u) => {
          setSteps((s) => mergeRobinhoodStep(s, u))
          reportRobinhoodPoints(u)
        })
        setResult(res)
        setStatus('success')
        return res
      } catch (err) {
        setError(toRobinhoodFlowError(err))
        if (err instanceof RobinhoodCloseRequoteError) {
          setCloseRequote(err.quote)
          setStatus('requote')
        } else {
          setStatus('error')
        }
        return null
      } finally {
        requestRobinhoodRefresh()
      }
    },
    [deps, user, reconcile],
  )

  return { run, reset, status, steps, error, result, closeRequote, isRunning: status === 'running' }
}

export function useRobinhoodCloseQuote(
  position: RobinhoodCloseQuoteInput['position'] | null,
  closeBps: number,
  options: { enabled?: boolean } = {},
) {
  const { address } = useAccount()
  const enabled = (options.enabled ?? true) && !!position && !!address && closeBps >= 1 && closeBps <= 10_000
  const query = useQuery({
    queryKey: ['robinhood', 'margin', 'close-quote', position?.id.toString() ?? null, closeBps, address?.toLowerCase() ?? null],
    queryFn: () => quoteRobinhoodClose(getRobinhoodPublicClient(), { position: position!, closeBps }, address as Address),
    enabled,
    staleTime: 5_000,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    placeholderData: keepPreviousData,
    retry: 1,
  })
  return {
    quote: query.data ?? null,
    isPlaceholder: query.isPlaceholderData,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
  }
}

type ClosePosition = RobinhoodCloseQuoteInput['position']
type RepayPosition = Pick<RobinhoodPosition, 'id' | 'account' | 'direction' | 'debtPToken'>

/** Thin, named entry points over `useRobinhoodAction`, so components read as what they do. */
export const robinhoodFlows = {
  close: (position: ClosePosition, accepted: RobinhoodCloseQuote) => (d: RobinhoodFlowDeps, u: Address, on: (x: RobinhoodTxUpdate) => void) =>
    runRobinhoodClose(d, u, position, accepted, on),
  addCollateral: (positionId: bigint, shares: bigint) => (d: RobinhoodFlowDeps, u: Address, on: (x: RobinhoodTxUpdate) => void) =>
    runRobinhoodAddCollateral(d, u, positionId, shares, on),
  repay: (position: RepayPosition, amount?: bigint) => (d: RobinhoodFlowDeps, u: Address, on: (x: RobinhoodTxUpdate) => void) =>
    runRobinhoodRepay(d, u, position, amount, on),
  exit: (position: Pick<RobinhoodPosition, 'id' | 'account' | 'debtPToken'>) => (d: RobinhoodFlowDeps, u: Address, on: (x: RobinhoodTxUpdate) => void) =>
    runRobinhoodDebtFreeExit(d, u, position, on),
  withdraw: (shares: bigint, redeem: boolean) => (d: RobinhoodFlowDeps, u: Address, on: (x: RobinhoodTxUpdate) => void) =>
    runRobinhoodWithdraw(d, u, shares, { redeem }, on),
  redeem: (shares: bigint) => (d: RobinhoodFlowDeps, u: Address, on: (x: RobinhoodTxUpdate) => void) => runRobinhoodRedeem(d, u, shares, on),
  settle: () => (d: RobinhoodFlowDeps, u: Address, on: (x: RobinhoodTxUpdate) => void) => runRobinhoodSettleRewards(d, u, on),
}

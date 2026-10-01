'use client'

/**
 * use-robinhood-margin-open
 *
 * `useRobinhoodOpenQuote(input)` keeps a live quote for the form (guide 6B):
 * margin value, requested notional, opening fee in USD and shares with the
 * ceiling the user accepts, flash leg and flash fee, the debt estimate
 * against the cap, and the minimum position output. It re-quotes every 15s
 * while visible; `params` is null whenever an issue blocks.
 *
 * `useRobinhoodMarginOpen().open(quote)` re-quotes once more, simulates the
 * exact call, asks for the signature and returns the decoded PositionOpened
 * (guide 6C). A fee that moved above the accepted ceiling comes back as
 * `requote` with the fresh quote instead of a higher limit on chain.
 */
import { useCallback, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useAccount } from 'wagmi'
import type { Address } from 'viem'
import { getRobinhoodPublicClient } from '@/lib/robinhood/client'
import type { RobinhoodDecodedError } from '@/lib/robinhood/errors'
import { RobinhoodRequoteError, runRobinhoodOpen, type RobinhoodOpenResult } from '@/lib/robinhood/flows'
import { quoteRobinhoodOpen, type RobinhoodOpenQuote, type RobinhoodOpenQuoteInput } from '@/lib/robinhood/open'
import type { RobinhoodTxUpdate } from '@/lib/robinhood/tx'
import { reportRobinhoodPoints } from '@/lib/robinhood/points-client'
import { mergeRobinhoodStep, toRobinhoodFlowError, type RobinhoodFlowStatus } from './use-robinhood-margin-deposit'
import { requestRobinhoodRefresh } from './use-robinhood-refresh'
import { useRobinhoodTxDeps } from './use-robinhood-tx-deps'

export const robinhoodOpenQuoteKey = (input: RobinhoodOpenQuoteInput | null, user: string | undefined) =>
  [
    'robinhood',
    'margin',
    'quote',
    input?.direction ?? null,
    input?.marginShares.toString() ?? null,
    input?.leverageX100 ?? null,
    input?.feeToleranceBps ?? null,
    user?.toLowerCase() ?? null,
  ] as const

export function useRobinhoodOpenQuote(
  input: RobinhoodOpenQuoteInput | null,
  options: { address?: Address; enabled?: boolean; refetchMs?: number } = {},
) {
  const { address: connected } = useAccount()
  const user = options.address ?? connected
  const valid = !!input && input.marginShares > 0n && input.leverageX100 > 100

  const query = useQuery({
    queryKey: robinhoodOpenQuoteKey(input, user),
    queryFn: () => quoteRobinhoodOpen(getRobinhoodPublicClient(), input as RobinhoodOpenQuoteInput, user ?? null),
    enabled: (options.enabled ?? true) && valid,
    staleTime: 5_000,
    refetchInterval: options.refetchMs ?? 15_000,
    refetchIntervalInBackground: false,
    placeholderData: keepPreviousData,
    retry: 1,
  })

  return {
    quote: query.data ?? null,
    /** True while the shown quote belongs to an earlier input. */
    isPlaceholder: query.isPlaceholderData,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  }
}

export type RobinhoodOpenStatus = RobinhoodFlowStatus | 'requote'

export function useRobinhoodMarginOpen() {
  const { deps, user, pending, reconcile } = useRobinhoodTxDeps()
  const [status, setStatus] = useState<RobinhoodOpenStatus>('idle')
  const [steps, setSteps] = useState<RobinhoodTxUpdate[]>([])
  const [error, setError] = useState<RobinhoodDecodedError | null>(null)
  const [result, setResult] = useState<RobinhoodOpenResult | null>(null)
  const [requote, setRequote] = useState<RobinhoodOpenQuote | null>(null)

  const reset = useCallback(() => {
    setStatus('idle')
    setSteps([])
    setError(null)
    setResult(null)
    setRequote(null)
  }, [])

  const open = useCallback(
    async (accepted: RobinhoodOpenQuote): Promise<RobinhoodOpenResult | null> => {
      if (!user) {
        setError({ kind: 'unknown', errorName: null, args: [], message: 'Connect a wallet first.', detail: 'no wallet' })
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
      setRequote(null)
      try {
        const res = await runRobinhoodOpen(deps, user, accepted, (u) => {
          setSteps((s) => mergeRobinhoodStep(s, u))
          reportRobinhoodPoints(u)
        })
        setResult(res)
        setStatus('success')
        requestRobinhoodRefresh()
        return res
      } catch (err) {
        if (err instanceof RobinhoodRequoteError) {
          setRequote(err.quote)
          setError(err.decoded)
          setStatus('requote')
          return null
        }
        setError(toRobinhoodFlowError(err))
        setStatus('error')
        requestRobinhoodRefresh()
        return null
      }
    },
    [deps, user, reconcile],
  )

  return {
    open,
    reset,
    status,
    steps,
    error,
    result,
    /** The fresh quote when the accepted one no longer fits; show it for approval. */
    requote,
    pending,
    reconcile,
    isRunning: status === 'running',
  }
}

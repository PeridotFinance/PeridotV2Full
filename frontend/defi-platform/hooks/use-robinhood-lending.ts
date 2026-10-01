'use client'

/**
 * use-robinhood-lending
 *
 * Reads and actions for the USDG / NVDA lending markets on Robinhood Chain
 * (lib/robinhood/lending.ts). Reads are live on-chain through the same
 * proxy-backed client the margin page uses; nothing here goes through the
 * APY or metrics tables, which the Python workers only fill for hub chains.
 *
 * The action hook runs one flow at a time with the same guarantees as the
 * margin deposit: a hash still waiting from an earlier attempt is reconciled
 * before anything new is sent, every step reports its own phase, and a
 * refresh fires whatever happened, because an approval that confirmed before
 * a failure is real chain state.
 */
import { useCallback, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAccount } from 'wagmi'
import type { Address } from 'viem'
import { getRobinhoodPublicClient } from '@/lib/robinhood/client'
import {
  readRobinhoodLendingAccount,
  readRobinhoodLendingMarkets,
  type RobinhoodLendingMarket,
} from '@/lib/robinhood/lending'
import {
  runRobinhoodLendingBorrow,
  runRobinhoodLendingCollateral,
  runRobinhoodLendingRepay,
  runRobinhoodLendingSupply,
  runRobinhoodLendingWithdraw,
  type RobinhoodLendingFlowInput,
  type RobinhoodLendingFlowResult,
} from '@/lib/robinhood/lending-flows'
import type { RobinhoodDecodedError } from '@/lib/robinhood/errors'
import type { RobinhoodTxUpdate } from '@/lib/robinhood/tx'
import { mergeRobinhoodStep, toRobinhoodFlowError, type RobinhoodFlowStatus } from './use-robinhood-margin-deposit'
import { requestRobinhoodRefresh, useRobinhoodRefreshListener } from './use-robinhood-refresh'
import { useRobinhoodTxDeps } from './use-robinhood-tx-deps'

export const ROBINHOOD_LENDING_MARKETS_KEY = ['robinhood', 'lending', 'markets'] as const
export const robinhoodLendingAccountKey = (user: string | undefined) =>
  ['robinhood', 'lending', 'account', user?.toLowerCase() ?? null] as const

export function useRobinhoodLendingMarkets(options: { enabled?: boolean } = {}) {
  useRobinhoodRefreshListener()
  const query = useQuery({
    queryKey: ROBINHOOD_LENDING_MARKETS_KEY,
    queryFn: () => readRobinhoodLendingMarkets(getRobinhoodPublicClient()),
    enabled: options.enabled ?? true,
    staleTime: 10_000,
    refetchInterval: 20_000,
    refetchIntervalInBackground: false,
    retry: 1,
  })
  return { data: query.data, isLoading: query.isLoading, error: query.error, dataUpdatedAt: query.dataUpdatedAt }
}

export function useRobinhoodLendingAccount(options: { enabled?: boolean } = {}) {
  const { address } = useAccount()
  const query = useQuery({
    queryKey: robinhoodLendingAccountKey(address),
    queryFn: () => readRobinhoodLendingAccount(getRobinhoodPublicClient(), address as Address),
    enabled: (options.enabled ?? true) && !!address,
    staleTime: 8_000,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    retry: 1,
  })
  return { user: address, data: query.data, isLoading: query.isLoading && !!address, error: query.error }
}

export type RobinhoodLendingActionKind = 'supply' | 'withdraw' | 'borrow' | 'repay' | 'collateral-on' | 'collateral-off'

export interface RobinhoodLendingActionInput extends Partial<RobinhoodLendingFlowInput> {
  market: RobinhoodLendingMarket
}

export function useRobinhoodLendingAction() {
  const { deps, user, reconcile } = useRobinhoodTxDeps()
  const [status, setStatus] = useState<RobinhoodFlowStatus>('idle')
  const [steps, setSteps] = useState<RobinhoodTxUpdate[]>([])
  const [error, setError] = useState<RobinhoodDecodedError | null>(null)
  const [lastAction, setLastAction] = useState<RobinhoodLendingActionKind | null>(null)

  const reset = useCallback(() => {
    setStatus('idle')
    setSteps([])
    setError(null)
    setLastAction(null)
  }, [])

  const run = useCallback(
    async (kind: RobinhoodLendingActionKind, input: RobinhoodLendingActionInput): Promise<RobinhoodLendingFlowResult | null> => {
      const fail = (message: string, kind: RobinhoodDecodedError['kind'], detail = message) => {
        setError({ kind, errorName: null, args: [], message, detail })
        setStatus('error')
        return null
      }
      if (!user) return fail('Connect a wallet first.', 'unknown')

      const open = await reconcile()
      if (open.length > 0) {
        return fail(
          'An earlier transaction is still waiting for confirmation. Check it before sending another.',
          'network',
          open.map((e) => e.hash).join(','),
        )
      }

      setLastAction(kind)
      setStatus('running')
      setSteps([])
      setError(null)
      const onUpdate = (u: RobinhoodTxUpdate) => setSteps((s) => mergeRobinhoodStep(s, u))
      const flow: RobinhoodLendingFlowInput = {
        market: input.market,
        amount: input.amount ?? 0n,
        all: input.all,
        enableCollateral: input.enableCollateral,
      }
      try {
        let res: RobinhoodLendingFlowResult
        switch (kind) {
          case 'supply':
            res = await runRobinhoodLendingSupply(deps, user, flow, onUpdate)
            break
          case 'withdraw':
            res = await runRobinhoodLendingWithdraw(deps, user, flow, onUpdate)
            break
          case 'borrow':
            res = await runRobinhoodLendingBorrow(deps, user, flow, onUpdate)
            break
          case 'repay':
            res = await runRobinhoodLendingRepay(deps, user, flow, onUpdate)
            break
          case 'collateral-on':
          case 'collateral-off':
            res = await runRobinhoodLendingCollateral(deps, user, { market: input.market, enable: kind === 'collateral-on' }, onUpdate)
            break
        }
        setStatus('success')
        return res
      } catch (err) {
        setError(toRobinhoodFlowError(err))
        setStatus('error')
        return null
      } finally {
        requestRobinhoodRefresh()
      }
    },
    [deps, user, reconcile],
  )

  return { run, reset, status, steps, error, lastAction, isRunning: status === 'running' }
}

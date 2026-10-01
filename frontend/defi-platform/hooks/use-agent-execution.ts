'use client'

import { useState, useCallback } from 'react'
import { usePrivy, useSendTransaction } from '@privy-io/react-auth'
import { useSmartExecution } from '@/hooks/use-smart-execution'
import { useActiveWallet } from '@/hooks/use-active-wallet'
import { useStellarWallet } from '@/hooks/use-stellar-wallet'
import { CHAIN_IDS } from '@/config/contracts'
import { shouldRetryWithoutSponsor } from '@/lib/agents/sponsor-fallback'
import { buildFailureAdvisory } from '@/lib/agents/failure-advisor'
import { createPublicClient, http, type Address, type Hex } from 'viem'
import { bsc, bscTestnet } from 'viem/chains'
import { defineChain } from 'viem'

interface TxCall {
  to: string
  data: string
  value?: string
}

interface TxPlan {
  calls: TxCall[]
  description: string
  chainId: number
  assetSymbol: string
  amount: string
  actionType: string
  isNative: boolean
}

interface CrossChainPayload {
  ownerAddress: string
  mode: string
  composeFlows: unknown[]
  description: string
  sourceChainId: number
  destinationChainId: number
  assetSymbol: string
  amount: string
}

interface ExecuteResponse {
  type: 'proposal' | 'single' | 'cross-chain' | 'stellar'
  proposalId?: string
  actionId?: string
  txPlans?: TxPlan[]
  payloads?: CrossChainPayload[]
  // Single action fields
  calls?: TxCall[]
  description?: string
  chainId?: number
  assetSymbol?: string
  amount?: string
  actionType?: string
  isNative?: boolean
  // Stellar action fields — the frontend builds+signs+submits via the Stellar
  // wallet (no server tx-plan). `assetId` is the Soroban market id (e.g. usdc-stellar).
  assetId?: string
  // Multi-position strategy proposals may include Stellar legs alongside EVM
  // tx plans. Each leg is signed sequentially via the Stellar wallet after
  // the EVM legs in `txPlans` finish.
  stellarLegs?: Array<{
    actionType: string
    assetId: string
    assetSymbol: string
    amount: string
    chainId: number
  }>
}

export type ExecutionStatus = 'idle' | 'fetching' | 'signing' | 'confirming' | 'verifying' | 'success' | 'error'

/**
 * Minimal Monad-mainnet chain def since viem doesn't ship one as of this version.
 * Kept in sync with portfolio-reader.ts / balance-fetcher.ts.
 */
const monadMainnet = defineChain({
  id: 143,
  name: 'Monad',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.NEXT_PUBLIC_RPC_MONAD_MAINNET ?? 'https://rpc3.monad.xyz'] },
  },
})

function chainForClient(chainId: number) {
  if (chainId === 56) return bsc
  if (chainId === 97) return bscTestnet
  if (chainId === 143) return monadMainnet
  return null
}

export interface ExecuteOptions {
  /**
   * When true, sign via Privy's embedded wallet with `sponsor: true + uiOptions.showWalletUIs: false`.
   * This is the agent auto-execute path — no popup, gas paid from Privy credits.
   * Callers must ensure the wallet-level gate (`canAutoSign`) and the consent
   * gate (`shouldAutoExecute`) are already satisfied.
   */
  useEmbeddedSponsor?: boolean
}

interface UseAgentExecutionReturn {
  status: ExecutionStatus
  txHash: string | null
  error: string | null
  pointsAwarded: number | null
  isCrossChain: boolean
  execute: (confirmationToken: string, options?: ExecuteOptions) => Promise<void>
  reset: () => void
}

/**
 * Hook for executing agent-proposed transactions.
 *
 * Flow:
 * 1. POST /api/agents/execute with confirmationToken → get TX params
 * 2. Execute via useSmartExecution (batch for smart accounts, sequential for EOA)
 * 3. PATCH /api/agents/execute with txHash to report result
 */
export function useAgentExecution(): UseAgentExecutionReturn {
  const { getAccessToken } = usePrivy()
  const { execute: smartExecute, isPending: smartPending } = useSmartExecution()
  const { sendTransaction: privySendTransaction } = useSendTransaction()
  const { isEmbeddedWallet, address: senderAddress } = useActiveWallet()
  const { address: stellarAddress } = useStellarWallet()

  const [status, setStatus] = useState<ExecutionStatus>('idle')
  const [txHash, setTxHash] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pointsAwarded, setPointsAwarded] = useState<number | null>(null)
  const [isCrossChain, setIsCrossChain] = useState(false)

  const reset = useCallback(() => {
    setStatus('idle')
    setTxHash(null)
    setError(null)
    setPointsAwarded(null)
    setIsCrossChain(false)
  }, [])

  const execute = useCallback(
    async (confirmationToken: string, options?: ExecuteOptions) => {
      const useEmbeddedSponsor = options?.useEmbeddedSponsor === true
      setStatus('fetching')
      setError(null)
      setTxHash(null)

      try {
        // 1. Fetch TX params from server
        const token = await getAccessToken()
        if (!token) throw new Error('Not authenticated')

        const res = await fetch('/api/agents/execute', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ confirmationToken }),
        })

        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || `Execute failed: ${res.status}`)
        }

        const response: ExecuteResponse = await res.json()

        // 2a. Cross-chain Biconomy flow
        if (response.type === 'cross-chain' && response.payloads?.length) {
          setIsCrossChain(true)

          // Guard against silent-failure: the agent-cross-chain event requires
          // an external listener (the Biconomy UI orchestrator) to actually
          // broadcast the UserOp. If no one is listening, the tx NEVER hits
          // the chain yet we used to mark success → user saw "Done" without
          // anything happening (silent failure).
          //
          // We prime an ack flag, dispatch the event, and require the
          // listener to respond back with `peridot:agent-cross-chain-ack`.
          // Without an ack within 2s we throw and surface the real state.
          const ackPromise = new Promise<void>((resolve, reject) => {
            const ackTimer = setTimeout(() => {
              window.removeEventListener('peridot:agent-cross-chain-ack', onAck)
              reject(
                new Error(
                  'Cross-chain bridge handler is not available. Please retry from the Bridge page.',
                ),
              )
            }, 2000)
            const onAck = () => {
              clearTimeout(ackTimer)
              window.removeEventListener('peridot:agent-cross-chain-ack', onAck)
              resolve()
            }
            window.addEventListener('peridot:agent-cross-chain-ack', onAck)
          })

          window.dispatchEvent(
            new CustomEvent('peridot:agent-cross-chain', {
              detail: {
                proposalId: response.proposalId,
                payloads: response.payloads,
                // Forward the token so the listener can write Action Timeline
                // transitions without needing its own proposal lookup.
                confirmationToken,
              },
            }),
          )

          // The action we're tracking as the source of truth for recovery.
          // Pre-declared so both the ACK race and the recovery helper can
          // reference the same token.
          let recoveredState:
            | Awaited<ReturnType<typeof import('@/lib/agents/cross-chain-recovery').recoverCrossChainState>>
            | null = null

          try {
            await ackPromise
          } catch (ackErr) {
            // ACK missed. Before surrendering, check whether the listener
            // actually picked up the event and moved the action past
            // 'proposed'. Three reasons this can happen:
            //   (a) Listener unmounted — action never started. Throw.
            //   (b) Listener ACKed but the browser dropped the event under
            //       load. Action IS in flight — recover.
            //   (c) Listener already finished. Use the terminal state.
            // See lib/agents/cross-chain-recovery.ts for the protocol.
            const { recoverCrossChainState } = await import('@/lib/agents/cross-chain-recovery')
            recoveredState = await recoverCrossChainState({
              confirmationToken,
              getAuthBearer: async () => token,
              attempts: 5,
              intervalMs: 500,
            })

            if (!recoveredState) {
              // Still 'proposed' after 2.5s of polling — listener really isn't
              // running. Fail with the original message.
              throw ackErr
            }

            // Terminal states short-circuit straight to success/error — the
            // listener finished its work before we recovered.
            if (recoveredState.status === 'succeeded') {
              setTxHash(recoveredState.primaryHash)
              setStatus('success')
              return
            }
            if (
              recoveredState.status === 'failed'
              || recoveredState.status === 'cancelled'
              || recoveredState.status === 'timeout'
            ) {
              throw new Error(
                recoveredState.errorMessage
                || 'Cross-chain transfer did not complete.',
              )
            }
            // Intermediate state (signing/pending/bridging/executing) — fall
            // through to the event-driven wait below.
          }

          setStatus('confirming')

          // Stay in 'confirming' and let the AgentCrossChainListener drive the
          // real outcome. The listener dispatches `peridot:agent-action-succeeded`
          // / `peridot:agent-action-failed` when the Biconomy MEE supertransaction
          // actually lands (or errors). If we pre-emptively marked success here
          // the user would see "Done" in the chat WHILE the wallet popup is still
          // opening — confusing, and the bug the user reported.
          //
          // Set up a one-shot race between success / failure events with a
          // generous timeout that covers compose + quote + user signing time
          // (cross-chain MEE usually resolves within 45s but we give 3min).
          const FINAL_TIMEOUT_MS = 180_000

          try {
            await new Promise<void>((resolve, reject) => {
              const timer = setTimeout(() => {
                cleanup()
                reject(new Error('This is taking longer than usual. Check the Activity panel for status.'))
              }, FINAL_TIMEOUT_MS)

              const onSuccess = () => {
                cleanup()
                resolve()
              }
              const onFailure = (evt: Event) => {
                cleanup()
                const detail = (evt as CustomEvent).detail
                reject(new Error(detail?.message || 'Cross-chain transfer failed'))
              }
              const cleanup = () => {
                clearTimeout(timer)
                window.removeEventListener('peridot:agent-action-succeeded', onSuccess)
                window.removeEventListener('peridot:agent-action-failed', onFailure)
              }
              window.addEventListener('peridot:agent-action-succeeded', onSuccess, { once: true })
              window.addEventListener('peridot:agent-action-failed', onFailure, { once: true })
            })
          } catch (finalErr) {
            // The listener already dispatched peridot:agent-action-failed with
            // a fintech message — don't duplicate the advisory; just propagate
            // to the outer catch so status flips to 'error'.
            throw finalErr
          }

          setStatus('success')
          return
        }

        // 2a-stellar. Stellar (Soroban) actions — the Stellar wallet builds +
        // signs + submits client-side, so there's no server tx-plan. We call
        // the same builders the Stellar UI uses, then PATCH + verify like EVM.
        if (response.type === 'stellar') {
          const assetId = response.assetId
          const amount = response.amount
          const actionType = response.actionType ?? 'deposit'
          if (!assetId || !amount) {
            throw new Error('Stellar action is missing its asset or amount.')
          }
          if (!stellarAddress) {
            throw new Error('Connect your Stellar wallet to confirm this action.')
          }

          setStatus('signing')
          const lending = await import('@/lib/stellar-soroban-lending')
          let hash: string
          if (actionType === 'withdraw') {
            // Withdraw is denominated in pTokens on-chain — convert the
            // human underlying amount the same way the redeem UI does.
            const ptokenAmount = await lending.stellarConvertUnderlyingToPtokenAmount(
              assetId,
              amount,
            )
            hash = await lending.stellarWithdraw(stellarAddress, assetId, ptokenAmount)
          } else if (actionType === 'pay_back' || actionType === 'repay') {
            hash = await lending.stellarRepay(stellarAddress, assetId, amount)
          } else {
            hash = await lending.stellarDeposit(stellarAddress, assetId, amount)
          }

          setTxHash(hash)
          setStatus('confirming')

          // Report back to close the timeline + action row. chainId tags it as
          // Stellar so the route skips the EVM leaderboard pre-verify.
          await fetch('/api/agents/execute', {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              actionId: response.actionId,
              txHash: hash,
              chainId: CHAIN_IDS.STELLAR_MAINNET,
              status: 'success',
            }),
          })

          // Leaderboard: the proven Stellar path (G-address + Soroban tx proof).
          setStatus('verifying')
          try {
            const { postStellarVerify } = await import('@/lib/stellar-leaderboard-verify')
            const verifyActionType =
              actionType === 'withdraw'
                ? 'redeem'
                : actionType === 'pay_back' || actionType === 'repay'
                  ? 'repay'
                  : 'supply'
            await postStellarVerify({
              walletAddress: stellarAddress,
              txHash: hash,
              actionType: verifyActionType,
              assetId,
              amount,
              privyAccessToken: token,
            })
          } catch {
            // Non-critical — don't fail the execution over a verify hiccup.
          }

          // Chat closure events (mirror the EVM success path).
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('peridot:agent-action-logged', {
                detail: { txHash: hash, chainId: CHAIN_IDS.STELLAR_MAINNET, autoExecuted: false },
              }),
            )
            const verbMap: Record<string, string> = {
              deposit: 'deposited',
              supply: 'deposited',
              withdraw: 'withdrew',
              pay_back: 'paid back',
              repay: 'paid back',
            }
            const verb = verbMap[actionType] ?? actionType
            const symbol = response.assetSymbol ?? assetId.split('-')[0]?.toUpperCase() ?? ''
            window.dispatchEvent(
              new CustomEvent('peridot:agent-action-succeeded', {
                detail: {
                  txHash: hash,
                  chainId: CHAIN_IDS.STELLAR_MAINNET,
                  message: `Done — ${verb} ${amount} ${symbol}.`.trim(),
                },
              }),
            )
          }

          setStatus('success')
          return
        }

        // 2b. Standard TX plans
        const plans: TxPlan[] =
          response.type === 'proposal' && response.txPlans
            ? response.txPlans
            : response.calls
              ? [
                  {
                    calls: response.calls,
                    description: response.description || 'Execute transaction',
                    chainId: response.chainId || 0,
                    assetSymbol: response.assetSymbol || '',
                    amount: response.amount || '',
                    actionType: response.actionType || 'supply',
                    isNative: response.isNative || false,
                  },
                ]
              : []

        // Stellar-only proposals carry zero EVM tx plans — that's valid; the
        // Stellar legs run below. Any other zero-plan response is an error.
        const isStellarOnlyProposal =
          response.type === 'proposal'
          && plans.length === 0
          && (response.stellarLegs?.length ?? 0) > 0
        if (plans.length === 0 && !isStellarOnlyProposal) {
          throw new Error('No transaction plans returned')
        }

        // 3. Execute each plan. Two signing paths:
        //    - useEmbeddedSponsor === true  → Privy EOA with { sponsor: true, uiOptions: { showWalletUIs: false } }
        //      (agent auto-execute — silent + gas paid from Privy credits)
        //    - otherwise                    → useSmartExecution (wagmi + smart wallet)
        setStatus('signing')

        let lastHash: string | null = null
        let lastChainId: number | undefined

        for (const plan of plans) {
          const calls = plan.calls.map((call) => ({
            to: call.to as Address,
            data: call.data as Hex,
            value: call.value ? BigInt(call.value) : undefined,
          }))

          let hash: string
          // For embedded wallets (Privy social-login users) we always route
          // through Privy's `useSendTransaction` — wagmi's send path tries
          // `wallet_sendTransaction` which Alchemy's BSC RPC rejects with
          // code -32600. The only difference between the auto path and the
          // click-confirm path is `uiOptions.showWalletUIs`.
          const shouldUsePrivyPath = useEmbeddedSponsor || isEmbeddedWallet
          if (shouldUsePrivyPath) {
            // Sequential single-call dispatch via Privy's embedded wallet.
            // Batch is unsupported on the EOA path — multi-call plans fall back
            // to N sequential silent signs; cumulative sponsorship cost stays
            // bounded by the consent limit because the caller only sets
            // useEmbeddedSponsor when the full plan sum fit the limit.
            //
            // Phase 2.1: if Privy's managed sponsorship is unavailable (credits
            // empty, chain not sponsored, policy rejected), retry ONCE without
            // `sponsor: true` so the user pays from their own balance. We use a
            // curated error classifier (`shouldRetryWithoutSponsor`) to avoid
            // retrying user-rejected tx.
            // Private-labelled Pimlico policy overrides Privy's managed default.
            // Privy's `sendTransaction({sponsor:true})` otherwise tries their own
            // paymaster layer which doesn't cover BSC — Pimlico does, via our
            // own policy ID. Reading from env so we never hard-code secrets.
            const pimlicoPolicyId = process.env.NEXT_PUBLIC_PIMLICO_SPONSORSHIP_POLICY_ID

            /**
             * Two-stage fallback for embedded-wallet sendTransaction:
             *   1. sponsor: true, silent  — ideal; Privy sponsors via Pimlico policy
             *   2. sponsor: false, popup  — user approves + pays their own gas
             *
             * We deliberately skip the "sponsor: false, silent" middle step —
             * Privy routes that through Alchemy BSC RPC's wallet_sendTransaction
             * which is rejected by the upstream provider. Popup is the reliable
             * path when sponsorship is unavailable.
             *
             * IMPORTANT: when `sponsor: false`, Privy does NOT auto-estimate gas.
             * The embedded wallet passes `gas: 0` to the RPC which rejects with
             * "intrinsic gas too low". We pre-estimate via a plain public client
             * and pass the limit explicitly on the fallback path.
             */
            const estimateGasForFallback = async (
              call: (typeof calls)[number],
            ): Promise<bigint | undefined> => {
              if (!senderAddress) return undefined
              const chain = chainForClient(plan.chainId)
              if (!chain) return undefined
              try {
                const publicClient = createPublicClient({
                  chain,
                  transport: http(),
                })
                const est = await publicClient.estimateGas({
                  account: senderAddress as Address,
                  to: call.to,
                  data: (call.data ?? '0x') as Hex,
                  value: call.value,
                })
                // 20 % safety buffer — contract state can shift between estimate and send
                return (est * BigInt(120)) / BigInt(100)
              } catch {
                // Non-fatal: fall back to Privy's default estimation path
                return undefined
              }
            }

            const attempt = async (
              call: (typeof calls)[number],
              withSponsor: boolean,
              withPopup: boolean,
            ): Promise<string> => {
              const options: any = {
                sponsor: withSponsor,
                uiOptions: { showWalletUIs: withPopup },
              }
              if (withSponsor && pimlicoPolicyId) {
                options.paymasterContext = { sponsorshipPolicyId: pimlicoPolicyId }
              }
              const txParams: any = {
                to: call.to,
                data: (call.data ?? '0x') as Hex,
                value: call.value,
                chainId: plan.chainId,
              }
              // Only set gas on the self-paid path; sponsored flows have their
              // own estimator in the paymaster pipeline.
              if (!withSponsor) {
                const gasLimit = await estimateGasForFallback(call)
                if (gasLimit) txParams.gasLimit = gasLimit
              }
              const result: any = await privySendTransaction(txParams, options)
              return (result?.hash ?? result) as string
            }

            const logError = (label: string, err: unknown, retry: boolean) => {
              if (typeof window === 'undefined') return
              try {
                // eslint-disable-next-line no-console
                console.group(`[agent-execution] ${label}`)
                // eslint-disable-next-line no-console
                console.error(err)
                try {
                  // eslint-disable-next-line no-console
                  console.log('own property names:', Object.getOwnPropertyNames(err as any))
                } catch {}
                // eslint-disable-next-line no-console
                console.log('will fall back?', retry)
                // eslint-disable-next-line no-console
                console.groupEnd()
              } catch {}
            }

            const callResults: string[] = []
            for (const call of calls) {
              let h: string | null = null

              // 1. Silent + sponsored (via Privy's managed RPC with our Pimlico
              //    policy). This works on chains where Privy's dashboard allows
              //    sponsor:true — for BSC it currently returns
              //    "Gas sponsorship is not enabled" and we fall through.
              try {
                h = await attempt(call, true, false)
              } catch (sendErr) {
                const canFallback = shouldRetryWithoutSponsor(sendErr)
                logError('sponsor:true threw', sendErr, canFallback)
                if (!canFallback) throw sendErr

                // 2. Fallback: wagmi path via @privy-io/wagmi connector.
                //    This is the exact same path `/app` supply uses — goes
                //    through Privy's embedded-wallet provider, shows the Privy
                //    confirmation popup, and is *implicitly* covered by Privy's
                //    managed Gas Sponsorship (paid from app credits). The
                //    user's own BNB is not touched even though the UI shows an
                //    "estimated fee" preview.
                //
                //    This is not silent — one-click-confirm via the Privy UI —
                //    but it's the only path that reliably broadcasts on BSC
                //    today.
                h = await new Promise<string>((resolve, reject) => {
                  smartExecute(
                    {
                      to: call.to,
                      data: call.data,
                      value: call.value,
                    },
                    {
                      onSuccess: (txHash) => resolve(txHash),
                      onError: (err) => reject(err),
                      title: plan.description,
                      chainId: plan.chainId,
                    },
                  )
                })
              }

              callResults.push(h as string)
            }
            hash = callResults[callResults.length - 1]
          } else {
            hash = await new Promise<string>((resolve, reject) => {
              if (calls.length === 1) {
                smartExecute(calls[0], {
                  onSuccess: (h) => resolve(h),
                  onError: (err) => reject(err),
                  title: plan.description,
                  chainId: plan.chainId,
                })
              } else {
                // Batch call for smart accounts
                smartExecute(calls as any, {
                  onSuccess: (h) => resolve(h),
                  onError: (err) => reject(err),
                  title: plan.description,
                  chainId: plan.chainId,
                })
              }
            })
          }

          lastHash = hash
          lastChainId = plan.chainId
        }

        setTxHash(lastHash)
        setStatus('confirming')

        // 4. Report result back to server (also triggers leaderboard verify)
        await fetch('/api/agents/execute', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            proposalId: response.proposalId,
            actionId: response.actionId,
            txHash: lastHash,
            chainId: lastChainId,
            status: 'success',
            autoExecuted: useEmbeddedSponsor,
          }),
        })

        // 4.5 Phase 7.1.1: notify the Activity panel so it refreshes without
        // waiting for its 30s poll. Best-effort — SSR-safe.
        //
        // Also: dispatch a `peridot:agent-action-succeeded` so the chat can
        // render a short Perry-style congrats bubble ("Done — I withdrew your
        // USDC"). Separate from the activity panel event so listeners can
        // pick the one that fits their surface.
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('peridot:agent-action-logged', {
              detail: {
                txHash: lastHash,
                chainId: lastChainId,
                autoExecuted: useEmbeddedSponsor,
              },
            }),
          )

          // Success closure bubble — gives the chat a clear terminator after
          // Perry's pre-action text ("Handling it now.") so the conversation
          // doesn't read like a stuck promise. Chronological ordering in
          // ChatMessageList places it correctly against other messages.
          //
          // Message content is a short past-tense confirmation using the
          // fintech verb map so it matches the button / inline card style.
          const firstPlan = plans[0]
          const actionVerbMap: Record<string, string> = {
            supply: 'deposited',
            deposit: 'deposited',
            withdraw: 'withdrew',
            borrow: 'borrowed',
            repay: 'paid back',
            pay_back: 'paid back',
            swap: 'converted',
            convert: 'converted',
            rebalance: 'adjusted the strategy',
          }
          const rawAction = firstPlan?.actionType ?? 'action'
          const verb = actionVerbMap[rawAction] ?? rawAction
          const amountLabel = firstPlan?.amount
            ? `${firstPlan.amount} ${firstPlan.assetSymbol ?? ''}`.trim()
            : null
          const successMessage = amountLabel
            ? `Done — ${verb} ${amountLabel}.`
            : `Done.`

          window.dispatchEvent(
            new CustomEvent('peridot:agent-action-succeeded', {
              detail: {
                txHash: lastHash,
                chainId: lastChainId,
                message: successMessage,
              },
            }),
          )
        }

        // 4b. Stellar legs of the proposal — signed sequentially via the
        // Stellar wallet after all EVM legs land. Each leg builds + signs +
        // submits client-side via stellar-soroban-lending (same path as
        // single Stellar actions in the response.type === 'stellar' branch).
        if (response.type === 'proposal' && response.stellarLegs?.length) {
          if (!stellarAddress) {
            throw new Error(
              'This strategy includes Stellar positions — connect your Stellar wallet to finish.',
            )
          }
          const lending = await import('@/lib/stellar-soroban-lending')
          for (const [legIndex, leg] of response.stellarLegs.entries()) {
            // Legs of one proposal are usually dependent (supply, then borrow
            // against it; repay, then withdraw what that freed). The RPC's
            // simulation snapshot trails confirmation by up to a ledger, so a leg
            // built immediately after the previous one is simulated against a world
            // that predates it and traps on apply. Wait between legs — not before
            // the first, which has nothing to wait for.
            if (legIndex > 0) await lending.stellarWaitForLedgerAdvance()
            setStatus('signing')
            let hash: string
            if (leg.actionType === 'withdraw') {
              const ptokenAmount = await lending.stellarConvertUnderlyingToPtokenAmount(
                leg.assetId,
                leg.amount,
              )
              hash = await lending.stellarWithdraw(stellarAddress, leg.assetId, ptokenAmount)
            } else if (leg.actionType === 'pay_back' || leg.actionType === 'repay') {
              hash = await lending.stellarRepay(stellarAddress, leg.assetId, leg.amount)
            } else {
              hash = await lending.stellarDeposit(stellarAddress, leg.assetId, leg.amount)
            }
            lastHash = hash
            lastChainId = leg.chainId
            setTxHash(hash)
            setStatus('confirming')
          }
        }

        // 5. Verify for leaderboard points
        setStatus('verifying')
        try {
          const firstPlan = plans[0]
          // pre-verify's allow-list is the Compound verb set (supply / borrow /
          // repay / redeem). Map the fintech-flavoured plan.actionType back to
          // those before sending. Cross-chain flows already report on their
          // own path so we don't pre-verify here.
          const PRE_VERIFY_ACTION_MAP: Record<string, string> = {
            supply: 'supply',
            deposit: 'supply',
            withdraw: 'redeem',     // withdraw → redeem (Compound nomenclature)
            borrow: 'borrow',
            repay: 'repay',
            pay_back: 'repay',
          }
          const mappedActionType =
            PRE_VERIFY_ACTION_MAP[firstPlan?.actionType ?? ''] ?? null

          if (mappedActionType) {
            const verifyRes = await fetch('/api/leaderboard/pre-verify', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                txHash: lastHash,
                chainId: lastChainId ?? 56,
                actionType: mappedActionType,
                isAgent: true,
                // walletAddress intentionally omitted — the server resolves it
                // from the Privy token (see pre-verify/route.ts).
              }),
            })
            if (verifyRes.ok) {
              const verifyData = await verifyRes.json() as Record<string, unknown>
              const pts = (verifyData.points as number) ?? (verifyData.pointsAwarded as number) ?? 0
              if (pts > 0) setPointsAwarded(pts)
            }
          }
        } catch {
          // Non-critical — don't fail the whole execution
        }

        setStatus('success')
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Transaction failed'
        setError(message)
        setStatus('error')

        // Perry speaks up: emit a chat advisory with a fintech explanation
        // + concrete next steps so the user isn't left with just a red card.
        // ChatMessageList listens for this event and appends an ephemeral
        // assistant message (client-side only, not persisted).
        if (typeof window !== 'undefined') {
          try {
            // Derive action context from whatever state we have — the outer
            // execute() call doesn't always know the exact action type, but
            // a generic advisory still beats silence.
            const advisory = buildFailureAdvisory({
              actionType: 'action',
              errorMessage: message,
            })
            if (advisory.shouldEmit) {
              window.dispatchEvent(
                new CustomEvent('peridot:agent-action-failed', {
                  detail: {
                    message: advisory.message,
                    retryPrompt: advisory.retryPrompt,
                  },
                }),
              )
            }
          } catch {
            // Event dispatch is best-effort
          }
        }

        // Report failure
        try {
          const token = await getAccessToken()
          if (token) {
            await fetch('/api/agents/execute', {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                status: 'failed',
                errorMessage: message,
              }),
            })
          }
        } catch {
          // Silent fail on status report
        }
      }
    },
    [getAccessToken, smartExecute, privySendTransaction, isEmbeddedWallet, stellarAddress],
  )

  return { status, txHash, error, pointsAwarded, isCrossChain, execute, reset }
}

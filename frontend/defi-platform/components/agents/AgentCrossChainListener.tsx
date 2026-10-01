'use client'

/**
 * AgentCrossChainListener
 *
 * Bridges the agent chat to the existing Biconomy cross-chain supply pipeline
 * used by /app/bridge. Subscribes to `peridot:agent-cross-chain` events emitted
 * by `useAgentExecution`, ACKs within 2s, then drives `biconomyAdapter.startSupply`
 * to completion and reports back via `peridot:agent-action-{succeeded,failed}`
 * + PATCH `/api/agents/execute`.
 *
 * Mount once under the authenticated app layout (RootProviders). It renders
 * nothing; the whole purpose is the window-event handoff.
 */

import { useEffect, useRef } from 'react'
import { useWalletClient } from 'wagmi'
import { parseUnits, type Address } from 'viem'
import { usePrivy } from '@privy-io/react-auth'
import { biconomyAdapter } from '@/lib/biconomyAdapter'
import { useActiveWallet } from '@/hooks/use-active-wallet'
import {
  resolveSourceToken,
  resolveDestinationMarket,
  type CrossChainSupplyPayload,
} from '@/lib/agents/biconomy-builder'

// USDC/USDT/WETH/WBTC decimals per source chain.
// Matches TOKENS map in biconomy/constants.ts — hard-coded because on-chain
// reads would add 1+ RTT before we can even start. If a new asset is added,
// extend this map.
//
// Note: BSC USDT is 18 decimals (binance-peg) — every other chain uses 6.
const DECIMALS: Record<number, Record<string, number>> = {
  1:     { USDC: 6,  USDT: 6,  WETH: 18, WBTC: 8 },  // Ethereum
  42161: { USDC: 6,  USDT: 6,  WETH: 18, WBTC: 8 },  // Arbitrum
  10:    { USDC: 6,  USDT: 6,  WETH: 18 },            // Optimism
  137:   { USDC: 6,  USDT: 6,  WETH: 18, WBTC: 8 },  // Polygon
  8453:  { USDC: 6,  USDT: 6,  WETH: 18, WBTC: 8 },  // Base
  43114: { USDC: 6,  USDT: 6,  WETH: 18, WBTC: 8 },  // Avalanche
  56:    { USDC: 18, USDT: 18, WETH: 18, WBTC: 18, WBNB: 18 }, // BSC (binance-peg = 18 everywhere)
}

function getDecimals(chainId: number, symbol: string): number {
  const normalized = symbol.toUpperCase()
  const map = DECIMALS[chainId]
  if (!map) throw new Error(`Unsupported source chain ${chainId}`)
  const d = map[normalized]
  if (d == null) throw new Error(`No decimals for ${normalized} on chain ${chainId}`)
  return d
}

interface CrossChainEventDetail {
  proposalId?: string | null
  payloads: CrossChainSupplyPayload[]
  /**
   * The same confirmation token the ActionButtonBlock carries. Lets us
   * address the Action Timeline row directly and write lifecycle
   * transitions as the Biconomy flow progresses.
   */
  confirmationToken?: string | null
}

export function AgentCrossChainListener() {
  const { getAccessToken } = usePrivy()
  const { address: activeAddress, isEmbeddedWallet } = useActiveWallet()
  // Running listener lifts its own walletClient. We ask for sourceChainId
  // dynamically inside the handler — wagmi exposes a single walletClient for
  // the active chain, but Privy's embedded wallet can sign for any chain
  // the connector advertises. The biconomyAdapter will read `account.address`
  // from the client, so we just need it to be present.
  const { data: walletClient } = useWalletClient()

  // Guard against double-handling the same proposalId (e.g. StrictMode remount).
  const inFlightRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const handle = async (evt: Event) => {
      const detail = (evt as CustomEvent<CrossChainEventDetail>).detail
      if (!detail || !Array.isArray(detail.payloads) || detail.payloads.length === 0) {
        return
      }

      // 1. ACK immediately — useAgentExecution times out after 2s, and we must
      //    tell it the handler exists before we start any slow work.
      window.dispatchEvent(new CustomEvent('peridot:agent-cross-chain-ack'))

      const proposalId = detail.proposalId || ''
      if (proposalId && inFlightRef.current.has(proposalId)) return
      if (proposalId) inFlightRef.current.add(proposalId)

      // 2. Guard: we need a wallet to sign. If the user disconnected between
      //    the agent emitting the payload and now, fail loudly via the chat
      //    advisory channel — don't silently drop.
      if (!activeAddress) {
        window.dispatchEvent(
          new CustomEvent('peridot:agent-action-failed', {
            detail: { message: "Looks like your wallet disconnected — reconnect and try again." },
          }),
        )
        if (proposalId) inFlightRef.current.delete(proposalId)
        return
      }

      // 3. Run each payload sequentially. Multi-leg proposals (rare — today
      //    the agent only emits one leg per invocation) share one ACK but
      //    surface individual advisories.
      let lastError: Error | null = null
      let lastSuperTxHash: string | null = null

      // Action Timeline transition helper — targets the ledger row created
      // by executeCrossChainSupply via shared confirmation_token. Best-effort;
      // if the endpoint 404s (token never reached the ledger) we keep going
      // and just report outcomes via the legacy window-event fallback.
      const confirmationToken = detail.confirmationToken ?? null
      const patchTimeline = async (
        to: 'signing' | 'pending' | 'succeeded' | 'failed',
        patch: { primaryHash?: string; errorMessage?: string } = {},
      ): Promise<void> => {
        if (!confirmationToken) return
        try {
          const token = await getAccessToken()
          if (!token) return
          await fetch('/api/agents/timeline/transition', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              confirmationToken,
              to,
              primaryHash: patch.primaryHash,
              errorMessage: patch.errorMessage,
            }),
          })
        } catch {
          // non-fatal
        }
      }

      await patchTimeline('signing')

      // Heartbeat + early hash capture (E-3). Two independent mechanisms so
      // a tab-close mid-flow can be recovered by the server-side poller:
      //
      // (a) Subscribe to `peridot:biconomy-phase` events. The adapter emits
      //     'execute-ok' with the superTxHash as soon as it leaves the MEE
      //     node — we write that hash to the timeline immediately. If the
      //     tab dies after this but before startSupply() resolves, the
      //     poller's BiconomyStatusChecker can pick up the hash and drive
      //     the action to terminal state without a live client.
      //
      // (b) A 5s periodic heartbeat PATCH. Bumps `last_polled_at` on the
      //     timeline row so operators can tell "client is alive" vs "client
      //     died; poller is on its own". Uses the same transition endpoint
      //     with an explicit heartbeat=true flag.
      const heartbeatHandler = (evt: Event) => {
        const phase = (evt as CustomEvent).detail?.phase as string | undefined
        const meta = (evt as CustomEvent).detail?.meta as any
        if (phase === 'execute-ok' && typeof meta?.hash === 'string' && meta.hash) {
          // Fire-and-forget — we're mid-flow, don't block the adapter.
          void patchTimeline('pending', { primaryHash: meta.hash })
        }
      }
      const heartbeatTimer = setInterval(async () => {
        if (!confirmationToken) return
        try {
          const token = await getAccessToken()
          if (!token) return
          await fetch('/api/agents/timeline/transition', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              confirmationToken,
              heartbeat: true,
            }),
          })
        } catch {
          // non-fatal — server-side poller will take over if we die
        }
      }, 5000)
      window.addEventListener('peridot:biconomy-phase', heartbeatHandler)

      try {
        for (const payload of detail.payloads) {
          try {
            const { sourceChainId, destinationChainId, assetSymbol, amount, enableCollateral } = payload

            const sourceToken = resolveSourceToken(assetSymbol, sourceChainId)
            const { pToken } = resolveDestinationMarket(assetSymbol)
            const decimals = getDecimals(sourceChainId, assetSymbol)
            const amountWei = parseUnits(amount, decimals)

            // eoa-7702 could speed things up on chains that support it but is
            // opt-in via Privy flags — default to plain 'eoa' which matches
            // the /app/bridge production path for embedded-wallet users.
            const executionMode = isEmbeddedWallet ? 'eoa' : 'eoa'

            const result = await biconomyAdapter.startSupply({
              userAddress: activeAddress as Address,
              signerAddress: activeAddress as Address,
              signingClient: walletClient || undefined,
              sourceChainId,
              sourceTokenAddress: sourceToken,
              destinationChainId,
              pTokenAddress: pToken,
              amountWei,
              enableAsCollateral: enableCollateral,
              returnPTokensToUser: true,
              executionMode,
            } as any)

            lastSuperTxHash = result?.superTxHash ?? null
          } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err))
            break
          }
        }
      } finally {
        clearInterval(heartbeatTimer)
        window.removeEventListener('peridot:biconomy-phase', heartbeatHandler)
      }

      // 3a. Record the terminal outcome in the Action Timeline. The poller
      //     would eventually catch up, but doing it client-side gives Perry
      //     the answer in the same turn the user asks "did it arrive?".
      if (lastError) {
        await patchTimeline('failed', { errorMessage: lastError.message })
      } else {
        await patchTimeline('succeeded', {
          primaryHash: lastSuperTxHash ?? undefined,
        })
      }

      // 4. Report back to the agent execute route so server-side state
      //    (agent_executed_actions, leaderboard verification) matches reality.
      try {
        const token = await getAccessToken()
        if (token && proposalId) {
          await fetch('/api/agents/execute', {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              proposalId,
              txHash: lastSuperTxHash,
              status: lastError ? 'failed' : 'success',
              error: lastError?.message,
            }),
          })
        }
      } catch {
        // non-fatal: the adapter's own completion paths (sponsored-usage,
        // leaderboard) already log independently.
      }

      // 5. Signal completion. Two separate concerns:
      //    - Internal: `peridot:agent-action-*` is awaited by useAgentExecution
      //      to flip status → 'success'/'error'. Always dispatch both shapes.
      //    - UX: ChatMessageList renders a bubble ONLY on failure (P5). Success
      //      state is carried by the ActionButtonBlock inline label (P4 SSE).
      if (lastError) {
        const firstPayload = detail.payloads[0]
        window.dispatchEvent(
          new CustomEvent('peridot:agent-action-failed', {
            detail: {
              message: friendlyFailure(lastError.message),
              retryPrompt: buildCrossChainRetryPrompt(
                lastError.message,
                firstPayload?.assetSymbol,
              ),
            },
          }),
        )
      } else {
        // Success closure — emit a concise "Done" message for the chat so
        // Perry's pre-action text doesn't hang unanswered. Cross-chain
        // deposits specifically benefit: they take ~30s and users want the
        // unambiguous "it landed" beat.
        const firstPayload = detail.payloads[0]
        const amountLabel = firstPayload
          ? `${firstPayload.amount} ${firstPayload.assetSymbol}`
          : null
        const successMessage = amountLabel
          ? `Done — deposited ${amountLabel}.`
          : `Done.`

        window.dispatchEvent(
          new CustomEvent('peridot:agent-action-succeeded', {
            detail: {
              txHash: lastSuperTxHash,
              message: successMessage,
            },
          }),
        )
      }

      if (proposalId) inFlightRef.current.delete(proposalId)
    }

    window.addEventListener('peridot:agent-cross-chain', handle)
    return () => {
      window.removeEventListener('peridot:agent-cross-chain', handle)
    }
  }, [activeAddress, isEmbeddedWallet, walletClient, getAccessToken])

  return null
}

// Map raw adapter errors to a single fintech-friendly sentence. The adapter
// throws with deeply-nested Biconomy/MEE payloads ("BICONOMY_ONCHAIN_APPROVAL_REQUIRED",
// "UserOp [0] simulation failed", "insufficient balance for transfer") that
// leak protocol mechanics into the chat. Keep the mapping narrow — unknown
// errors fall through to a generic retry prompt.
function friendlyFailure(msg: string): string {
  if (!msg) return "Something didn't go through. Try again in a moment."
  const lower = msg.toLowerCase()
  if (lower.includes('insufficient') && lower.includes('fee')) {
    return "The transfer fee is more than the amount you picked — try a slightly larger deposit."
  }
  if (lower.includes('insufficient')) {
    return "Looks like the balance isn't quite enough to cover the move. Try a smaller amount."
  }
  if (lower.includes('user rejected') || lower.includes('user denied')) {
    return "You cancelled the signature. Tap the button again when you're ready."
  }
  if (lower.includes('biconomy_onchain_approval_required')) {
    return "Your wallet needs to approve this token once. Retry from the Bridge page for the approval step."
  }
  return "That didn't go through. Give it another try — I'll queue the same move."
}

/**
 * Build a chat-ready retry chip ("Try a smaller deposit of USDC") for a failed
 * cross-chain supply. Only returns a prompt when the error is recoverable via
 * a sized-down retry; user-cancelled and approval-required errors leave it
 * undefined (the chip would be misleading).
 */
function buildCrossChainRetryPrompt(
  errorMessage: string,
  assetSymbol?: string,
): string | undefined {
  const lower = (errorMessage ?? '').toLowerCase()
  if (lower.includes('user rejected') || lower.includes('user denied')) return undefined
  if (lower.includes('biconomy_onchain_approval_required')) return undefined
  if (lower.includes('insufficient') && lower.includes('fee')) {
    return assetSymbol ? `Try a larger ${assetSymbol} deposit` : 'Try a larger deposit'
  }
  if (lower.includes('insufficient')) {
    return assetSymbol ? `Try a smaller ${assetSymbol} deposit` : 'Try a smaller deposit'
  }
  return 'Try that deposit again'
}

/**
 * Status checkers (P2).
 *
 * Pluggable strategy layer that maps backend-specific transaction state onto
 * the canonical Agent Action lifecycle defined in `action-timeline.ts`.
 *
 * Adding a new backend:
 *   1. Implement `StatusChecker` below
 *   2. Register it in `STATUS_CHECKERS`
 *   3. Emit actions with the corresponding `backendType`
 *
 * That's it — no schema, no poller, no UI changes required.
 */

import {
  createPublicClient,
  http,
  type Hex,
} from 'viem'
import {
  arbitrum, avalanche, base, bsc, bscTestnet, mainnet, optimism, polygon,
} from 'viem/chains'
import type { AgentAction, ActionStatus, BackendType } from '@/lib/agents/action-timeline'

// Local chain lookup — small and explicit beats importing the full wagmi
// config server-side (which pulls in browser-only polyfills).
function chainForClient(chainId: number) {
  switch (chainId) {
    case 1:     return mainnet
    case 10:    return optimism
    case 56:    return bsc
    case 97:    return bscTestnet
    case 137:   return polygon
    case 8453:  return base
    case 42161: return arbitrum
    case 43114: return avalanche
    default:    return null
  }
}

// ── Shared types ───────────────────────────────────────────────────────

export interface StatusUpdate {
  /** The new canonical status. If unchanged, poller still records a progress event. */
  to: ActionStatus | 'unchanged'
  /** Backend-native hash/id to persist. Optional — only set if not already stored. */
  primaryHash?: string
  /** Terminal failure reason surfaced to Perry. Only set on failure/timeout transitions. */
  errorMessage?: string
  /**
   * Shallow-merged into `action.metadata`. Use backend-prefixed keys (e.g.
   * `biconomy.userOps`) to avoid stepping on other backends' fields.
   */
  metadataPatch?: Record<string, unknown>
  /** Whether the poller wants to re-check this action soon (before normal cadence). */
  hot?: boolean
}

export interface StatusChecker {
  backendType: BackendType
  check(action: AgentAction): Promise<StatusUpdate>
}

// ── BiconomyStatusChecker ──────────────────────────────────────────────

class BiconomyStatusChecker implements StatusChecker {
  backendType: BackendType = 'biconomy'

  async check(action: AgentAction): Promise<StatusUpdate> {
    // We need a hash to look up. If the MEE submit hasn't produced one yet,
    // the client is still driving the flow — poller has nothing to do.
    const hash = action.primaryHash
    if (!hash) {
      return { to: 'unchanged' }
    }

    // Use the same internal proxy route the client uses. Keeps the API-key
    // on the server.
    const baseUrl = resolveBaseUrl()
    const res = await fetch(`${baseUrl}/api/biconomy/status?hash=${encodeURIComponent(hash)}`, {
      cache: 'no-store',
    })

    if (res.status === 404) {
      // MEE node hasn't indexed it yet — normal early in the flow
      return { to: 'unchanged', hot: true }
    }
    if (!res.ok) {
      // Transient upstream error; record a progress note but don't flip state
      return {
        to: 'unchanged',
        metadataPatch: { 'biconomy.lastPollError': `HTTP ${res.status}` },
      }
    }

    const receipt = await res.json().catch(() => null)
    if (!receipt || typeof receipt !== 'object') {
      return { to: 'unchanged' }
    }

    return mapBiconomyReceipt(receipt, action)
  }
}

function mapBiconomyReceipt(receipt: any, action: AgentAction): StatusUpdate {
  // Biconomy receipts come with an array of userOps (one per chain hop).
  // We infer canonical status from the count of pending vs succeeded vs
  // failed userOps. Cross-chain flows naturally pass through bridging →
  // executing states as userOp indices land one by one.
  const userOps: any[] = Array.isArray(receipt?.userOps)
    ? receipt.userOps
    : Array.isArray(receipt?.transactions)
      ? receipt.transactions
      : []

  let succeeded = 0
  let failed = 0
  let pending = 0
  let revertReason: string | null = null

  for (const op of userOps) {
    const execStatus = String(op?.executionStatus ?? op?.status ?? '').toUpperCase()
    const isConfirmed = op?.isConfirmed === true || execStatus === 'MINED_SUCCESS'
    if (op?.revertError) revertReason = String(op.revertError)

    if (execStatus === 'MINED_SUCCESS' && isConfirmed) succeeded++
    else if (execStatus === 'MINED_FAIL' || op?.revertError) failed++
    else pending++
  }

  // Any terminal failure wins — the downstream chain won't recover on its own.
  if (failed > 0) {
    return {
      to: 'failed',
      errorMessage: revertReason ?? 'Cross-chain execution reverted',
      metadataPatch: { 'biconomy.userOps': userOps.length, 'biconomy.failed': failed },
    }
  }

  // All userOps mined successfully = end-to-end success. For a supply this
  // means: source bridged, destination approved + minted + collateral set.
  if (userOps.length > 0 && succeeded === userOps.length) {
    return {
      to: 'succeeded',
      metadataPatch: { 'biconomy.userOps': userOps.length },
    }
  }

  // Mixed state: map to bridging (first hop not yet confirmed) vs executing
  // (first hop confirmed but later hops still in flight). Deriving this from
  // the *first* userOp rather than counts so the transition is monotonic.
  const firstDone =
    userOps.length > 0
    && String(userOps[0]?.executionStatus ?? '').toUpperCase() === 'MINED_SUCCESS'
    && userOps[0]?.isConfirmed === true

  if (!firstDone) {
    return {
      to: action.status === 'pending' ? 'bridging' : 'unchanged',
      metadataPatch: { 'biconomy.userOps': userOps.length, 'biconomy.pending': pending },
    }
  }
  return {
    to: 'executing',
    metadataPatch: { 'biconomy.userOps': userOps.length, 'biconomy.pending': pending },
  }
}

// ── DirectEvmStatusChecker ─────────────────────────────────────────────

class DirectEvmStatusChecker implements StatusChecker {
  backendType: BackendType = 'direct_evm'

  async check(action: AgentAction): Promise<StatusUpdate> {
    const hash = action.primaryHash as Hex | null
    if (!hash) return { to: 'unchanged' }

    const chain = chainForClient(action.sourceChainId)
    if (!chain) {
      return {
        to: 'unchanged',
        metadataPatch: { 'directEvm.error': `Unsupported chain ${action.sourceChainId}` },
      }
    }

    const client = createPublicClient({ chain, transport: http() })

    try {
      const receipt = await client.getTransactionReceipt({ hash })
      if (!receipt) return { to: 'unchanged' }

      if (receipt.status === 'success') {
        return {
          to: 'succeeded',
          metadataPatch: {
            'directEvm.blockNumber': receipt.blockNumber.toString(),
            'directEvm.gasUsed': receipt.gasUsed.toString(),
          },
        }
      }
      if (receipt.status === 'reverted') {
        return {
          to: 'failed',
          errorMessage: 'Transaction reverted on-chain',
          metadataPatch: {
            'directEvm.blockNumber': receipt.blockNumber.toString(),
          },
        }
      }
      return { to: 'unchanged' }
    } catch (err: any) {
      const msg = String(err?.message ?? err ?? '')
      // Viem throws "TransactionReceiptNotFoundError" while the tx is still
      // in the mempool — that's expected for fresh submissions.
      if (/not.?found|not found/i.test(msg)) {
        return { to: 'unchanged', hot: true }
      }
      return {
        to: 'unchanged',
        metadataPatch: { 'directEvm.error': msg.slice(0, 200) },
      }
    }
  }
}

// ── Registry ───────────────────────────────────────────────────────────

export const STATUS_CHECKERS: Record<BackendType, StatusChecker> = {
  biconomy: new BiconomyStatusChecker(),
  direct_evm: new DirectEvmStatusChecker(),
}

export function getStatusChecker(backendType: BackendType): StatusChecker | null {
  return STATUS_CHECKERS[backendType] ?? null
}

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Resolve the base URL for internal fetch calls. The poller runs server-side
 * so we need an absolute URL.
 */
function resolveBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}

// Expose internal mapper for unit tests — not part of the public API.
export const _internals = { mapBiconomyReceipt, resolveBaseUrl }

/**
 * Regression suite for the cross-chain explorer-link logic.
 *
 * Production bug (2026-04-22): cross-chain rows stored the Biconomy superTxHash
 * in `tx_hash` + source-chain id in `chain_id` + block_number=0. That produced
 * explorer links pointing at `arbiscan.io/tx/<mee-id>` which 404. Users saw
 * "link leads nowhere".
 *
 * These tests pin the new behaviour:
 *   - Cross-chain row with destination_tx_hash → link points to destination chain.
 *   - Cross-chain row WITHOUT destination_tx_hash yet → no link (suppressed).
 *   - Single-chain row (block > 0) → link points to chain_id + tx_hash.
 *   - Single-chain stub row (block_number === 0) → no link.
 *
 * Each test fails loudly if the wrong (chainId, txHash) pair is picked — the
 * assertions check BOTH fields, not just "some link exists".
 */

import { describe, it, expect, vi } from 'vitest'

// Stub the chain-config lookup so the tests are deterministic regardless of
// the real config file. getChainConfig is called with a numeric chainId and
// must return `{ explorer: string }` for known chains.
vi.mock('@/config/contracts', () => ({
  getChainConfig: (id: number) => {
    const map: Record<number, { explorer: string }> = {
      1: { explorer: 'https://etherscan.io' },
      56: { explorer: 'https://bscscan.com' },
      8453: { explorer: 'https://basescan.org' },
      42161: { explorer: 'https://arbiscan.io' },
      137: { explorer: 'https://polygonscan.com' },
    }
    return map[id] ?? null
  },
}))

import {
  __test,
  buildBlocksFromMcpResult,
} from '@/lib/agents/mcp/result-to-blocks'
import type { TransactionHistoryBlock } from '@/types/agents'

const { pickExplorerTarget } = __test as unknown as {
  pickExplorerTarget: (tx: Record<string, unknown>) => { chainId: number; txHash: string } | null
}

const WALLET = '0x12c1e2C33F63F897E0e4ac1969C29493136f2481'

const HASH_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const HASH_B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
const HASH_SHORT = '0xabc'
const HASH_NOT_HEX = '0x' + 'z'.repeat(64)

// ── pickExplorerTarget ──────────────────────────────────────────────

describe('pickExplorerTarget — single-chain rows', () => {
  it('picks (chainId, txHash) for a normal row', () => {
    const out = pickExplorerTarget({
      txHash: HASH_A,
      chainId: 56,
      blockNumber: 82901289,
      isCrossChain: false,
    })
    expect(out).toEqual({ chainId: 56, txHash: HASH_A })
  })

  it('suppresses the link when blockNumber === 0 (stub row)', () => {
    // This is the "phantom tx" case — legacy writer stored a hash but block=0
    // because it didn't know the block. Explorer always 404s on these.
    expect(
      pickExplorerTarget({
        txHash: HASH_A,
        chainId: 42161,
        blockNumber: 0,
        isCrossChain: false,
      }),
    ).toBeNull()
  })

  it('suppresses the link when txHash is not a valid hex hash', () => {
    expect(
      pickExplorerTarget({
        txHash: HASH_SHORT,
        chainId: 56,
        blockNumber: 1,
        isCrossChain: false,
      }),
    ).toBeNull()
    expect(
      pickExplorerTarget({
        txHash: HASH_NOT_HEX,
        chainId: 56,
        blockNumber: 1,
        isCrossChain: false,
      }),
    ).toBeNull()
  })

  it('suppresses the link when chainId is missing or wrong type', () => {
    expect(
      pickExplorerTarget({ txHash: HASH_A, chainId: '56', blockNumber: 1 }),
    ).toBeNull()
    expect(
      pickExplorerTarget({ txHash: HASH_A, chainId: undefined, blockNumber: 1 }),
    ).toBeNull()
  })
})

describe('pickExplorerTarget — cross-chain rows', () => {
  it('picks DESTINATION hash + chain when both are present', () => {
    // The critical assertion: we do NOT pick the source-side superTxHash here.
    const out = pickExplorerTarget({
      // source-side (irrelevant for the link)
      txHash: HASH_A, // this is the superTxHash — must NOT end up in the URL
      chainId: 42161, // arbitrum (source)
      blockNumber: 0,
      // cross-chain bookkeeping
      isCrossChain: true,
      destinationChainId: 56,
      destinationTxHash: HASH_B,
      destinationBlockNumber: 82901289,
    })
    expect(out).toEqual({ chainId: 56, txHash: HASH_B })
  })

  it('suppresses the link when destination_tx_hash is not yet filled (async poller pending)', () => {
    expect(
      pickExplorerTarget({
        txHash: HASH_A,
        chainId: 42161,
        blockNumber: 0,
        isCrossChain: true,
        destinationChainId: 56,
        destinationTxHash: null,
      }),
    ).toBeNull()
  })

  it('suppresses when destination_tx_hash is a malformed string', () => {
    expect(
      pickExplorerTarget({
        isCrossChain: true,
        destinationChainId: 56,
        destinationTxHash: HASH_SHORT, // too short
        txHash: HASH_A,
        chainId: 42161,
        blockNumber: 0,
      }),
    ).toBeNull()
  })

  it('suppresses when destination_chain_id is missing', () => {
    expect(
      pickExplorerTarget({
        isCrossChain: true,
        destinationChainId: null,
        destinationTxHash: HASH_B,
        txHash: HASH_A,
        chainId: 42161,
        blockNumber: 0,
      }),
    ).toBeNull()
  })

  it('does NOT fall back to source fields when destination is missing', () => {
    // Core regression: the old code would happily link to
    //   arbiscan.io/tx/<superTxHash>
    // because it only checked that (txHash, chainId) were present. That's the
    // exact bug we're preventing here.
    const out = pickExplorerTarget({
      txHash: HASH_A, // valid hex — but it's a superTxHash, not on-chain
      chainId: 42161,
      blockNumber: 99, // even with a real-looking block, suppress
      isCrossChain: true,
      destinationChainId: 56,
      destinationTxHash: null,
    })
    expect(out).toBeNull()
  })
})

// ── buildBlocksFromMcpResult (end-to-end row → entry) ─────────────────

function mockUpstream(transactions: unknown[]) {
  return {
    data: { transactions, total: transactions.length },
  }
}

describe('buildBlocksFromMcpResult — TransactionHistoryBlock end-to-end', () => {
  it('cross-chain row with dest hash produces a link to the destination chain', () => {
    const blocks = buildBlocksFromMcpResult(
      'mcp__peridot__get_peridot_wallet_history',
      mockUpstream([
        {
          txHash: HASH_A,
          chainId: 42161,
          blockNumber: 0,
          actionType: 'supply',
          tokenSymbol: 'USDT',
          amount: 1,
          usdValue: 1,
          verifiedAt: '2026-03-22T22:33:39.187Z',
          isCrossChain: true,
          destinationChainId: 56,
          destinationTxHash: HASH_B,
          destinationBlockNumber: 82901289,
        },
      ]),
      WALLET,
    )
    expect(blocks).toHaveLength(1)
    const hist = blocks[0] as TransactionHistoryBlock
    expect(hist.type).toBe('transaction_history')
    expect(hist.entries).toHaveLength(1)
    const entry = hist.entries[0]
    expect(entry.isCrossChain).toBe(true)
    expect(entry.sourceChainId).toBe(42161)
    expect(entry.destinationChainId).toBe(56)
    expect(entry.explorerUrl).toBe(`https://bscscan.com/tx/${HASH_B}`)
    // Must NOT reach arbiscan (where the hash doesn't exist).
    expect(entry.explorerUrl).not.toMatch(/arbiscan/)
  })

  it('cross-chain row WITHOUT dest hash renders without a link (async-pending case)', () => {
    const blocks = buildBlocksFromMcpResult(
      'mcp__peridot__get_peridot_wallet_history',
      mockUpstream([
        {
          txHash: HASH_A,
          chainId: 42161,
          blockNumber: 0,
          actionType: 'supply',
          tokenSymbol: 'USDT',
          amount: 1,
          usdValue: 1,
          verifiedAt: '2026-03-22T22:33:39.187Z',
          isCrossChain: true,
          destinationChainId: 56,
          destinationTxHash: null,
        },
      ]),
      WALLET,
    )
    const entry = (blocks[0] as TransactionHistoryBlock).entries[0]
    expect(entry.isCrossChain).toBe(true)
    expect(entry.explorerUrl).toBeUndefined()
  })

  it('legacy phantom row (blockNumber=0, isCrossChain flag absent) renders without a link', () => {
    // Historical rows written by the old verify-crosschain before the fix —
    // is_cross_chain is false (DB default) but block_number=0 gives them away.
    const blocks = buildBlocksFromMcpResult(
      'mcp__peridot__get_peridot_wallet_history',
      mockUpstream([
        {
          txHash: HASH_A,
          chainId: 42161,
          blockNumber: 0,
          actionType: 'supply',
          tokenSymbol: 'USDT',
          amount: 1,
          usdValue: 1,
          verifiedAt: '2026-03-22T22:33:39.187Z',
          // no isCrossChain / destination fields — row predates the migration
        },
      ]),
      WALLET,
    )
    const entry = (blocks[0] as TransactionHistoryBlock).entries[0]
    expect(entry.explorerUrl).toBeUndefined()
    // isCrossChain on the UI entry is false when the flag wasn't set upstream.
    expect(entry.isCrossChain).toBe(false)
  })

  it('normal single-chain row still links out correctly', () => {
    const blocks = buildBlocksFromMcpResult(
      'mcp__peridot__get_peridot_wallet_history',
      mockUpstream([
        {
          txHash: HASH_B,
          chainId: 56,
          blockNumber: 82901289,
          actionType: 'borrow',
          tokenSymbol: 'USDC',
          amount: 2,
          usdValue: 2,
          verifiedAt: '2026-02-23T12:57:01.729Z',
          isCrossChain: false,
        },
      ]),
      WALLET,
    )
    const entry = (blocks[0] as TransactionHistoryBlock).entries[0]
    expect(entry.isCrossChain).toBe(false)
    expect(entry.explorerUrl).toBe(`https://bscscan.com/tx/${HASH_B}`)
  })

  it('mixed list: some rows link, some don\'t — each decided independently', () => {
    const blocks = buildBlocksFromMcpResult(
      'mcp__peridot__get_peridot_wallet_history',
      mockUpstream([
        // cross-chain, dest filled → link
        {
          txHash: HASH_A,
          chainId: 42161,
          blockNumber: 0,
          actionType: 'supply',
          tokenSymbol: 'USDT',
          amount: 1,
          usdValue: 1,
          verifiedAt: '2026-04-01T00:00:00Z',
          isCrossChain: true,
          destinationChainId: 56,
          destinationTxHash: HASH_B,
          destinationBlockNumber: 10,
        },
        // cross-chain, dest pending → no link
        {
          txHash: HASH_A,
          chainId: 42161,
          blockNumber: 0,
          actionType: 'redeem',
          tokenSymbol: 'USDC',
          amount: 1,
          usdValue: 1,
          verifiedAt: '2026-04-02T00:00:00Z',
          isCrossChain: true,
          destinationChainId: 56,
          destinationTxHash: null,
        },
        // single chain → link
        {
          txHash: HASH_B,
          chainId: 1,
          blockNumber: 1,
          actionType: 'repay',
          tokenSymbol: 'DAI',
          amount: 1,
          usdValue: 1,
          verifiedAt: '2026-04-03T00:00:00Z',
        },
      ]),
      WALLET,
    )
    const entries = (blocks[0] as TransactionHistoryBlock).entries
    expect(entries.map((e) => Boolean(e.explorerUrl))).toEqual([true, false, true])
    expect(entries[0].explorerUrl).toContain('bscscan.com')
    expect(entries[2].explorerUrl).toContain('etherscan.io')
  })

  it('rejects non-standard action_types (defensive — LLM could hallucinate)', () => {
    const blocks = buildBlocksFromMcpResult(
      'mcp__peridot__get_peridot_wallet_history',
      mockUpstream([
        {
          txHash: HASH_A,
          chainId: 56,
          blockNumber: 1,
          actionType: 'frobnicate', // not in {supply, borrow, repay, redeem}
          tokenSymbol: 'USDC',
          amount: 1,
          usdValue: 1,
          verifiedAt: '2026-04-01T00:00:00Z',
        },
      ]),
      WALLET,
    )
    expect((blocks[0] as TransactionHistoryBlock).entries).toHaveLength(0)
  })
})

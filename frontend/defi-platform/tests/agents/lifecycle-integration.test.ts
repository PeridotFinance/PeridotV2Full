/**
 * P6 — full-lifecycle integration (mocked DB).
 *
 * Walks a single action end-to-end through the state machine to make sure
 * each module composes cleanly:
 *
 *   createAction('proposed')
 *     → transitionAction('signing')
 *     → transitionAction('pending', { primaryHash })   [client writes hash]
 *     → runStatusPollerTick()                          [poller discovers receipt]
 *     → listActiveActions() → []
 *     → listRecentActions() returns the terminal row
 *
 * Uses a fully mocked sql tag so the test is deterministic. The goal is to
 * verify plumbing + ordering of writes across modules, not SQL correctness
 * (that's covered by per-module tests in P1/P2/P3).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockSql, mockFetch } = vi.hoisted(() => ({
  mockSql: vi.fn(),
  mockFetch: vi.fn(),
}))

vi.mock('@/lib/database', () => ({ sql: mockSql }))

// Row state that the mocked sql() returns. The test mutates this object
// between phases to simulate the DB advancing.
let ROW: any
const EVENTS: any[] = []

function resetRow(overrides: Partial<any> = {}) {
  ROW = {
    id: 'a-life-1',
    conversation_id: 'c-1',
    user_address: '0xabc',
    action_type: 'deposit',
    asset_symbol: 'USDT',
    amount: '4',
    amount_usd: 4,
    source_chain_id: 42161,
    destination_chain_id: 56,
    backend_type: 'biconomy',
    status: 'proposed',
    primary_hash: null,
    confirmation_token: 'tok-life',
    metadata: {},
    error_message: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_polled_at: null,
    terminal_at: null,
    ...overrides,
  }
  EVENTS.length = 0
}

describe('Action Timeline — full lifecycle', () => {
  beforeEach(() => {
    mockSql.mockReset()
    mockFetch.mockReset()
    globalThis.fetch = mockFetch as any
    resetRow()
  })

  it('walks a cross-chain deposit from proposed through succeeded', async () => {
    const {
      createAction,
      transitionAction,
      listActiveActions,
      listRecentActions,
    } = await import('@/lib/agents/action-timeline')
    const { runStatusPollerTick } = await import('@/lib/agents/status-poller')

    // 1. createAction → INSERT + seed event
    mockSql.mockResolvedValueOnce([ROW])       // INSERT RETURNING
    mockSql.mockResolvedValueOnce([])           // event insert

    const created = await createAction({
      userAddress: '0xabc',
      actionType: 'deposit',
      assetSymbol: 'USDT',
      amount: '4',
      sourceChainId: 42161,
      destinationChainId: 56,
      backendType: 'biconomy',
      confirmationToken: 'tok-life',
    })
    expect(created.status).toBe('proposed')

    // 2. transitionAction proposed → signing (client tap Confirm)
    mockSql.mockResolvedValueOnce([ROW])       // getActionById
    ROW = { ...ROW, status: 'signing' }
    mockSql.mockResolvedValueOnce([ROW])       // UPDATE RETURNING
    mockSql.mockResolvedValueOnce([])           // event insert

    const signed = await transitionAction({ actionId: 'a-life-1', to: 'signing' })
    expect(signed?.status).toBe('signing')

    // 3. transitionAction signing → pending with primaryHash (client receives
    //    superTxHash from Biconomy)
    mockSql.mockResolvedValueOnce([ROW])       // getActionById
    ROW = { ...ROW, status: 'pending', primary_hash: '0xMEEHASH' }
    mockSql.mockResolvedValueOnce([ROW])       // UPDATE
    mockSql.mockResolvedValueOnce([])           // event insert

    const pending = await transitionAction({
      actionId: 'a-life-1',
      to: 'pending',
      primaryHash: '0xMEEHASH',
    })
    expect(pending?.primaryHash).toBe('0xMEEHASH')

    // 4. Poller tick sees the MEE receipt → succeeded
    mockSql.mockResolvedValueOnce([ROW])       // listPollCandidates
    mockFetch.mockResolvedValueOnce({           // Biconomy /api/biconomy/status
      ok: true,
      status: 200,
      json: async () => ({
        userOps: [{ executionStatus: 'MINED_SUCCESS', isConfirmed: true }],
      }),
    })
    mockSql.mockResolvedValueOnce([ROW])       // getActionById (inside transitionAction)
    ROW = { ...ROW, status: 'succeeded', terminal_at: new Date().toISOString() }
    mockSql.mockResolvedValueOnce([ROW])       // UPDATE
    mockSql.mockResolvedValueOnce([])           // event insert

    const tickResult = await runStatusPollerTick()
    expect(tickResult.transitions).toBe(1)
    expect(tickResult.details[0].to).toBe('succeeded')

    // 5. listActiveActions returns empty (post-terminal), listRecentActions
    //    still surfaces the succeeded row so Perry can reference it on the
    //    next turn.
    mockSql.mockResolvedValueOnce([])           // listActiveActions (WHERE status IN (active))
    const active = await listActiveActions('0xabc')
    expect(active).toHaveLength(0)

    mockSql.mockResolvedValueOnce([ROW])       // listRecentActions
    const recent = await listRecentActions('0xabc')
    expect(recent).toHaveLength(1)
    expect(recent[0].status).toBe('succeeded')
    expect(recent[0].primaryHash).toBe('0xMEEHASH')
  })

  it('creates a same-chain direct_evm row with the right backend label', async () => {
    // The DirectEvmStatusChecker itself is covered by P2's status-poller
    // test (Biconomy + direct_evm both have dedicated success/revert/
    // not-found cases). Here we just confirm that creating a same-chain
    // action plumbs the right backend_type + destination_chain_id into
    // the ledger so the poller dispatches correctly.
    const { createAction } = await import('@/lib/agents/action-timeline')

    resetRow({
      id: 'a-dev-1',
      backend_type: 'direct_evm',
      source_chain_id: 56,
      destination_chain_id: null,
      asset_symbol: 'USDC',
    })

    mockSql.mockResolvedValueOnce([ROW])
    mockSql.mockResolvedValueOnce([])
    const created = await createAction({
      userAddress: '0xabc',
      actionType: 'deposit',
      assetSymbol: 'USDC',
      amount: '100',
      sourceChainId: 56,
      destinationChainId: null,
      backendType: 'direct_evm',
    })
    expect(created.backendType).toBe('direct_evm')
    expect(created.destinationChainId).toBeNull()
    expect(created.sourceChainId).toBe(56)
  })
})

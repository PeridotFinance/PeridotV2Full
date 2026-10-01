/**
 * Action Timeline ledger tests (P1).
 *
 * Covers: state machine transitions, idempotency, illegal-backwards guard,
 * metadata merge, and the three most-used query shapes (active / recent /
 * poll candidates). Uses a mocked sql tag so we can run in jsdom without a
 * live Postgres.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockSql } = vi.hoisted(() => ({
  mockSql: vi.fn(),
}))

vi.mock('@/lib/database', () => ({ sql: mockSql }))

import {
  createAction,
  transitionAction,
  appendEvent,
  getActionById,
  listActiveActions,
  listRecentActions,
  listPollCandidates,
  statusLabel,
  isTerminal,
  TERMINAL_STATUSES,
  ACTIVE_STATUSES,
} from '@/lib/agents/action-timeline'

const MOCK_ROW = {
  id: 'a-1',
  conversation_id: 'c-1',
  user_address: '0xabc',
  action_type: 'deposit',
  asset_symbol: 'USDC',
  amount: '100',
  amount_usd: 100,
  source_chain_id: 42161,
  destination_chain_id: 56,
  backend_type: 'biconomy',
  status: 'proposed',
  primary_hash: null,
  confirmation_token: 'tok-1',
  metadata: {},
  error_message: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  last_polled_at: null,
  terminal_at: null,
}

describe('action-timeline — creation', () => {
  beforeEach(() => mockSql.mockReset())

  it('creates an action and logs a status_change event for the creation', async () => {
    mockSql.mockResolvedValueOnce([MOCK_ROW])  // INSERT RETURNING
    mockSql.mockResolvedValueOnce([])          // seed event

    const action = await createAction({
      userAddress: '0xabc',
      actionType: 'deposit',
      assetSymbol: 'USDC',
      amount: '100',
      sourceChainId: 42161,
      destinationChainId: 56,
      backendType: 'biconomy',
      confirmationToken: 'tok-1',
    })

    expect(action.id).toBe('a-1')
    expect(action.status).toBe('proposed')
    expect(action.backendType).toBe('biconomy')
    expect(mockSql).toHaveBeenCalledTimes(2)
  })
})

describe('action-timeline — transitions', () => {
  beforeEach(() => mockSql.mockReset())

  it('moves an action from proposed → signing and appends an event', async () => {
    mockSql.mockResolvedValueOnce([MOCK_ROW])                           // getActionById
    mockSql.mockResolvedValueOnce([{ ...MOCK_ROW, status: 'signing' }]) // UPDATE
    mockSql.mockResolvedValueOnce([])                                    // event insert

    const result = await transitionAction({ actionId: 'a-1', to: 'signing' })
    expect(result?.status).toBe('signing')
    expect(mockSql).toHaveBeenCalledTimes(3)
  })

  it('is idempotent when called twice with the same target', async () => {
    const signing = { ...MOCK_ROW, status: 'signing' }
    mockSql.mockResolvedValueOnce([signing])  // getActionById returns signing already

    const result = await transitionAction({ actionId: 'a-1', to: 'signing' })
    expect(result?.status).toBe('signing')
    // Only the read should happen; no UPDATE, no event insert
    expect(mockSql).toHaveBeenCalledTimes(1)
  })

  it('refuses to unwind a terminal status back to active', async () => {
    const succeeded = { ...MOCK_ROW, status: 'succeeded', terminal_at: new Date().toISOString() }
    mockSql.mockResolvedValueOnce([succeeded])

    const result = await transitionAction({ actionId: 'a-1', to: 'pending' })
    expect(result?.status).toBe('succeeded')
    // Refused — only the read should have happened
    expect(mockSql).toHaveBeenCalledTimes(1)
  })

  it('merges metadataPatch shallowly on top of existing metadata', async () => {
    const withMeta = { ...MOCK_ROW, metadata: { biconomy: { quoteHash: '0xqq' } } }
    mockSql.mockResolvedValueOnce([withMeta])
    mockSql.mockResolvedValueOnce([
      {
        ...withMeta,
        status: 'pending',
        metadata: { biconomy: { quoteHash: '0xqq' }, poller: { lastSeen: '2026-04-22' } },
      },
    ])
    mockSql.mockResolvedValueOnce([])

    const result = await transitionAction({
      actionId: 'a-1',
      to: 'pending',
      metadataPatch: { poller: { lastSeen: '2026-04-22' } },
    })

    expect(result?.metadata.biconomy).toEqual({ quoteHash: '0xqq' })
    expect(result?.metadata.poller).toEqual({ lastSeen: '2026-04-22' })
  })

  it('returns null when the action row is missing', async () => {
    mockSql.mockResolvedValueOnce([])

    const result = await transitionAction({ actionId: 'missing', to: 'signing' })
    expect(result).toBeNull()
  })
})

describe('action-timeline — queries', () => {
  beforeEach(() => mockSql.mockReset())

  it('listActiveActions returns non-terminal actions only', async () => {
    const active = { ...MOCK_ROW, status: 'pending' }
    mockSql.mockResolvedValueOnce([active])

    const result = await listActiveActions('0xabc')
    expect(result).toHaveLength(1)
    expect(result[0].status).toBe('pending')
  })

  it('listRecentActions accepts an override window', async () => {
    mockSql.mockResolvedValueOnce([MOCK_ROW])
    const result = await listRecentActions('0xabc', { limit: 5, windowMinutes: 30 })
    expect(result).toHaveLength(1)
  })

  it('listPollCandidates sorts by last_polled_at NULLS FIRST', async () => {
    mockSql.mockResolvedValueOnce([
      { ...MOCK_ROW, id: 'a-old', last_polled_at: null },
      { ...MOCK_ROW, id: 'a-newer', last_polled_at: new Date().toISOString() },
    ])

    const result = await listPollCandidates()
    expect(result[0].id).toBe('a-old')
    expect(result[1].id).toBe('a-newer')
  })
})

describe('action-timeline — events', () => {
  beforeEach(() => mockSql.mockReset())

  it('appendEvent writes an event row and bumps last_polled_at for progress events', async () => {
    mockSql.mockResolvedValueOnce([]) // event insert
    mockSql.mockResolvedValueOnce([]) // last_polled_at bump

    await appendEvent('a-1', 'progress', { phase: 'quote-ok' })
    expect(mockSql).toHaveBeenCalledTimes(2)
  })

  it('appendEvent does NOT bump last_polled_at for non-progress events', async () => {
    mockSql.mockResolvedValueOnce([])

    await appendEvent('a-1', 'note', { source: 'perry' })
    expect(mockSql).toHaveBeenCalledTimes(1)
  })
})

describe('action-timeline — helpers', () => {
  it('statusLabel covers every valid status', () => {
    for (const s of [...ACTIVE_STATUSES, ...TERMINAL_STATUSES]) {
      expect(statusLabel(s)).not.toBe('')
    }
  })

  it('isTerminal matches the TERMINAL_STATUSES set', () => {
    expect(isTerminal('succeeded')).toBe(true)
    expect(isTerminal('failed')).toBe(true)
    expect(isTerminal('cancelled')).toBe(true)
    expect(isTerminal('timeout')).toBe(true)
    expect(isTerminal('pending')).toBe(false)
    expect(isTerminal('bridging')).toBe(false)
  })
})

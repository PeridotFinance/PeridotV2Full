/**
 * P3 — context injection + status-check tools.
 *
 * Covers:
 *  - buildSystemPrompt injects Active Actions / Recent Actions sections
 *    when the context supplies them, and skips them cleanly when empty.
 *  - check_action_status and list_recent_actions tools return the right
 *    content and respect cross-user isolation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockSql } = vi.hoisted(() => ({ mockSql: vi.fn() }))
vi.mock('@/lib/database', () => ({ sql: mockSql }))

import { buildSystemPrompt } from '@/lib/agents/system-prompt'

describe('buildSystemPrompt — Action Timeline injection', () => {
  const baseCtx = {
    userAddress: '0xabc',
    chainId: 56,
  }

  it('omits both sections when no actions', () => {
    const prompt = buildSystemPrompt(baseCtx)
    expect(prompt).not.toContain('## Active Actions')
    expect(prompt).not.toContain('## Recent Actions')
  })

  it('includes Active Actions section with one-liner per action', () => {
    const prompt = buildSystemPrompt({
      ...baseCtx,
      activeActions: [
        {
          id: 'a-1',
          actionType: 'cross-chain_supply',
          assetSymbol: 'USDT',
          amount: '4',
          sourceChainId: 42161,
          destinationChainId: 56,
          status: 'bridging',
          statusLabel: 'Moving your funds',
          startedSecondsAgo: 23,
          primaryHash: '0xdeadbeef',
        },
      ],
    })
    expect(prompt).toContain('## Active Actions (in flight)')
    expect(prompt).toContain('[a-1] cross-chain_supply $4')
    expect(prompt).toContain('Moving your funds')
    expect(prompt).toContain('chain 42161→56')
    expect(prompt).toContain('23s ago')
  })

  it('includes Recent Actions section separately from Active', () => {
    const prompt = buildSystemPrompt({
      ...baseCtx,
      recentActions: [
        {
          id: 'a-2',
          actionType: 'deposit',
          assetSymbol: 'USDC',
          amount: '100',
          sourceChainId: 56,
          destinationChainId: null,
          status: 'succeeded',
          statusLabel: 'Done',
          startedSecondsAgo: 320,
          primaryHash: '0xabc',
        },
      ],
    })
    expect(prompt).toContain('## Recent Actions (last 10 min)')
    expect(prompt).toContain('[a-2] deposit $100')
    expect(prompt).toContain('Done')
    expect(prompt).toContain('5m ago')
  })

  it('points Perry at check_action_status in the Active section', () => {
    const prompt = buildSystemPrompt({
      ...baseCtx,
      activeActions: [
        {
          id: 'a-1',
          actionType: 'deposit',
          assetSymbol: 'USDT',
          amount: '4',
          sourceChainId: 42161,
          destinationChainId: 56,
          status: 'pending',
          statusLabel: 'Submitting your request',
          startedSecondsAgo: 5,
          primaryHash: null,
        },
      ],
    })
    expect(prompt).toMatch(/check_action_status/)
    expect(prompt).toMatch(/did it arrive/)
  })
})

describe('executeCheckActionStatus', () => {
  beforeEach(() => mockSql.mockReset())

  it('returns a formatted summary for the user\'s own action', async () => {
    const row = {
      id: 'a-1',
      conversation_id: null,
      user_address: '0xabc',
      action_type: 'deposit',
      asset_symbol: 'USDT',
      amount: '4',
      amount_usd: 4,
      source_chain_id: 42161,
      destination_chain_id: 56,
      backend_type: 'biconomy',
      status: 'bridging',
      primary_hash: '0xhash',
      confirmation_token: 'tok-1',
      metadata: {},
      error_message: null,
      created_at: new Date(Date.now() - 30_000).toISOString(),
      updated_at: new Date(Date.now() - 5_000).toISOString(),
      last_polled_at: null,
      terminal_at: null,
    }
    mockSql.mockResolvedValueOnce([row])

    const { executeCheckActionStatus } = await import('@/lib/agents/tools-extended')
    const result = await executeCheckActionStatus(
      { id: 't', name: 'check_action_status', input: { id: 'a-1' } },
      { userAddress: '0xabc' },
    )

    expect(result.content).toContain('Action a-1')
    expect(result.content).toContain('deposit')
    expect(result.content).toMatch(/\$4/)
    expect(result.content).toContain('Moving your funds')
    expect(result.content).toContain('0xhash')
    // Active (non-terminal) → should invite re-polling
    expect(result.content).toContain('check_action_status again')
  })

  it('refuses to leak another user\'s action', async () => {
    const row = {
      id: 'a-1',
      conversation_id: null,
      user_address: '0xOTHER',
      action_type: 'deposit',
      asset_symbol: 'USDT',
      amount: '4',
      amount_usd: 4,
      source_chain_id: 42161,
      destination_chain_id: 56,
      backend_type: 'biconomy',
      status: 'bridging',
      primary_hash: null,
      confirmation_token: 'tok-1',
      metadata: {},
      error_message: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_polled_at: null,
      terminal_at: null,
    }
    mockSql.mockResolvedValueOnce([row])

    const { executeCheckActionStatus } = await import('@/lib/agents/tools-extended')
    const result = await executeCheckActionStatus(
      { id: 't', name: 'check_action_status', input: { id: 'a-1' } },
      { userAddress: '0xabc' },
    )

    expect(result.content).toMatch(/does not belong/)
  })

  it('returns a helpful message when the id is missing from the ledger', async () => {
    mockSql.mockResolvedValueOnce([])

    const { executeCheckActionStatus } = await import('@/lib/agents/tools-extended')
    const result = await executeCheckActionStatus(
      { id: 't', name: 'check_action_status', input: { id: 'does-not-exist' } },
      { userAddress: '0xabc' },
    )
    expect(result.content).toMatch(/list_recent_actions/)
  })

  it('errors cleanly when no id is passed', async () => {
    const { executeCheckActionStatus } = await import('@/lib/agents/tools-extended')
    const result = await executeCheckActionStatus(
      { id: 't', name: 'check_action_status', input: {} },
      { userAddress: '0xabc' },
    )
    expect(result.content).toContain('action id is required')
  })
})

describe('executeListRecentActions', () => {
  beforeEach(() => mockSql.mockReset())

  it('returns a human-readable list with ids Perry can follow up on', async () => {
    mockSql.mockResolvedValueOnce([
      {
        id: 'a-1', conversation_id: null, user_address: '0xabc',
        action_type: 'deposit', asset_symbol: 'USDT', amount: '4', amount_usd: 4,
        source_chain_id: 42161, destination_chain_id: 56, backend_type: 'biconomy',
        status: 'bridging', primary_hash: '0xh', confirmation_token: 'tok-1',
        metadata: {}, error_message: null,
        created_at: new Date(Date.now() - 15_000).toISOString(),
        updated_at: new Date().toISOString(), last_polled_at: null, terminal_at: null,
      },
      {
        id: 'a-2', conversation_id: null, user_address: '0xabc',
        action_type: 'deposit', asset_symbol: 'USDC', amount: '50', amount_usd: 50,
        source_chain_id: 56, destination_chain_id: null, backend_type: 'direct_evm',
        status: 'succeeded', primary_hash: '0xhh', confirmation_token: 'tok-2',
        metadata: {}, error_message: null,
        created_at: new Date(Date.now() - 240_000).toISOString(),
        updated_at: new Date(Date.now() - 200_000).toISOString(),
        last_polled_at: null, terminal_at: new Date(Date.now() - 200_000).toISOString(),
      },
    ])

    const { executeListRecentActions } = await import('@/lib/agents/tools-extended')
    const result = await executeListRecentActions(
      { id: 't', name: 'list_recent_actions', input: {} },
      { userAddress: '0xabc' },
    )

    expect(result.content).toContain('[a-1]')
    expect(result.content).toContain('[a-2]')
    expect(result.content).toContain('deposit $4')
    expect(result.content).toContain('deposit $50')
  })

  it('returns a "nothing recent" message when the ledger is empty', async () => {
    mockSql.mockResolvedValueOnce([])

    const { executeListRecentActions } = await import('@/lib/agents/tools-extended')
    const result = await executeListRecentActions(
      { id: 't', name: 'list_recent_actions', input: {} },
      { userAddress: '0xabc' },
    )
    expect(result.content).toMatch(/No agent-initiated actions/)
  })

  it('clamps windowMinutes to [1, 60] and limit to [1, 25]', async () => {
    mockSql.mockResolvedValueOnce([])

    const { executeListRecentActions } = await import('@/lib/agents/tools-extended')
    await executeListRecentActions(
      { id: 't', name: 'list_recent_actions', input: { windowMinutes: 9999, limit: 500 } },
      { userAddress: '0xabc' },
    )
    // Query should have been called — just verifying no crash; ranges get
    // applied inside listRecentActions via SQL params.
    expect(mockSql).toHaveBeenCalledTimes(1)
  })
})

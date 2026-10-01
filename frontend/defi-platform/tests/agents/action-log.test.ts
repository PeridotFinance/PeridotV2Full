/**
 * tests/agents/action-log.test.ts
 *
 * Phase 7 unit tests for the action-log mapper + state machine.
 */
import { describe, it, expect } from 'vitest'
import {
  mapActionLogRow,
  resolveNextStatus,
} from '@/lib/agents/action-log'

describe('mapActionLogRow', () => {
  it('maps snake_case pg row to camelCase entry', () => {
    const row = {
      id: 'log-1',
      user_address: '0xabc',
      action_type: 'deposit',
      asset_symbol: 'USDC',
      amount: '10.5',
      amount_usd: '10.55',
      chain_id: 56,
      tx_hash: '0xdeadbeef',
      status: 'success',
      auto_executed: true,
      source_id: 'prop-123',
      source_type: 'proposal',
      error_message: null,
      created_at: '2026-04-21T12:00:00Z',
      updated_at: '2026-04-21T12:00:05Z',
    }
    const entry = mapActionLogRow(row)
    expect(entry.id).toBe('log-1')
    expect(entry.amount).toBe(10.5)
    expect(entry.amountUsd).toBe(10.55)
    expect(entry.autoExecuted).toBe(true)
    expect(entry.sourceType).toBe('proposal')
  })

  it('handles null amount_usd', () => {
    const entry = mapActionLogRow({
      id: 'log-2',
      user_address: '0x',
      action_type: 'withdraw',
      asset_symbol: 'USDT',
      amount: '1',
      amount_usd: null,
      chain_id: 56,
      tx_hash: null,
      status: 'pending',
      auto_executed: false,
      created_at: '2026-04-21T00:00:00Z',
      updated_at: '2026-04-21T00:00:00Z',
    })
    expect(entry.amountUsd).toBeNull()
    expect(entry.autoExecuted).toBe(false)
  })
})

describe('resolveNextStatus (state machine)', () => {
  it('allows pending → success', () => {
    expect(resolveNextStatus('pending', 'success')).toBe('success')
  })

  it('allows pending → failed', () => {
    expect(resolveNextStatus('pending', 'failed')).toBe('failed')
  })

  it('does not downgrade success to pending', () => {
    expect(resolveNextStatus('success', 'pending')).toBe('success')
  })

  it('does not downgrade success to failed', () => {
    expect(resolveNextStatus('success', 'failed')).toBe('success')
  })

  it('allows failed → success (retry succeeded)', () => {
    expect(resolveNextStatus('failed', 'success')).toBe('success')
  })

  it('does not downgrade failed to pending', () => {
    expect(resolveNextStatus('failed', 'pending')).toBe('failed')
  })

  it('handles undefined current (first insert)', () => {
    expect(resolveNextStatus(undefined, 'pending')).toBe('pending')
    expect(resolveNextStatus(undefined, 'success')).toBe('success')
  })
})

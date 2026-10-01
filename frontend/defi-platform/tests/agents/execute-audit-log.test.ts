/**
 * tests/agents/execute-audit-log.test.ts
 *
 * Phase 7: verify PATCH /api/agents/execute writes to agent_action_log.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { mockSql, mockPrivy } = vi.hoisted(() => ({
  mockSql: vi.fn(),
  mockPrivy: {
    verifyAuthToken: vi.fn(),
    getUserById: vi.fn(),
  },
}))

vi.mock('@/lib/database', () => ({ sql: mockSql }))
vi.mock('@privy-io/server-auth', () => ({
  PrivyClient: vi.fn().mockImplementation(() => mockPrivy),
}))

const ADDR = '0xabc1230000000000000000000000000000def456'

function patchReq(body: object, token = 'valid') {
  return new NextRequest('http://localhost/api/agents/execute', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
}

function authOk() {
  mockPrivy.verifyAuthToken.mockResolvedValue({ userId: `did:privy:${ADDR}` })
}

describe('PATCH /api/agents/execute — audit log (Phase 7)', () => {
  beforeEach(() => {
    vi.resetModules()
    mockSql.mockReset()
    mockPrivy.verifyAuthToken.mockReset()
  })

  it('writes a success row to agent_action_log when PATCH reports success', async () => {
    authOk()

    const queries: string[] = []
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const key = Array.isArray(strings) ? strings.join('?') : String(strings)
      queries.push(key)

      // 1. UPDATE agent_executed_actions ... RETURNING
      if (key.includes('UPDATE agent_executed_actions')) {
        return Promise.resolve([
          {
            user_address: ADDR,
            chain_id: 56,
            action_type: 'deposit',
            asset_symbol: 'USDC',
            amount: '1.5',
          },
        ])
      }

      // 2. INSERT INTO agent_action_log (Phase 7)
      if (key.includes('INSERT INTO agent_action_log')) {
        return Promise.resolve([])
      }

      return Promise.resolve([])
    })

    const { PATCH } = await import('@/app/api/agents/execute/route')
    const res = await PATCH(
      patchReq({
        actionId: 'act-1',
        txHash: '0xdeadbeef',
        status: 'success',
        chainId: 56,
        autoExecuted: true,
      }),
    )
    expect(res.status).toBe(200)

    // Assert the audit-log INSERT was actually called
    const sawLogInsert = queries.some((q) => q.includes('INSERT INTO agent_action_log'))
    expect(sawLogInsert).toBe(true)
  })

  it('writes a failed row when PATCH reports failure', async () => {
    authOk()

    const queries: string[] = []
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const key = Array.isArray(strings) ? strings.join('?') : String(strings)
      queries.push(key)
      if (key.includes('UPDATE agent_executed_actions')) {
        return Promise.resolve([
          {
            user_address: ADDR,
            chain_id: 56,
            action_type: 'deposit',
            asset_symbol: 'USDC',
            amount: '2',
          },
        ])
      }
      return Promise.resolve([])
    })

    const { PATCH } = await import('@/app/api/agents/execute/route')
    const res = await PATCH(
      patchReq({
        actionId: 'act-2',
        txHash: '0xfailedtx',
        status: 'failed',
        chainId: 56,
        autoExecuted: false,
        errorMessage: 'Reverted on-chain',
      }),
    )
    expect(res.status).toBe(200)

    const sawLogInsert = queries.some((q) => q.includes('INSERT INTO agent_action_log'))
    expect(sawLogInsert).toBe(true)
  })

  it('skips log write when the executed_actions UPDATE returns no row', async () => {
    authOk()

    const queries: string[] = []
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const key = Array.isArray(strings) ? strings.join('?') : String(strings)
      queries.push(key)
      // Either the UPDATE or any subsequent call returns empty
      return Promise.resolve([])
    })

    const { PATCH } = await import('@/app/api/agents/execute/route')
    const res = await PATCH(
      patchReq({
        actionId: 'act-missing',
        txHash: '0xghost',
        status: 'success',
        chainId: 56,
      }),
    )
    // Still returns 200 — PATCH is fire-and-forget
    expect(res.status).toBe(200)

    // No INSERT should have fired because we had no action row
    const sawLogInsert = queries.some((q) => q.includes('INSERT INTO agent_action_log'))
    expect(sawLogInsert).toBe(false)
  })

  it('does not throw if agent_action_log table does not exist (graceful)', async () => {
    authOk()

    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const key = Array.isArray(strings) ? strings.join('?') : String(strings)
      if (key.includes('UPDATE agent_executed_actions')) {
        return Promise.resolve([
          {
            user_address: ADDR,
            chain_id: 56,
            action_type: 'deposit',
            asset_symbol: 'USDC',
            amount: '1',
          },
        ])
      }
      if (key.includes('INSERT INTO agent_action_log')) {
        return Promise.reject(new Error('relation "agent_action_log" does not exist'))
      }
      return Promise.resolve([])
    })

    const { PATCH } = await import('@/app/api/agents/execute/route')
    const res = await PATCH(
      patchReq({
        actionId: 'act-3',
        txHash: '0xok',
        status: 'success',
        chainId: 56,
      }),
    )
    expect(res.status).toBe(200) // must not propagate the DB error
  })
})

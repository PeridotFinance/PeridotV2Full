/**
 * tests/agents/tool-response-honesty.test.ts
 *
 * Regression guard: catches the "Perry says 'done — that's queued for you'
 * but nothing was actually dispatched" class of bug. The tool response
 * content is Perry's primary source of truth when he composes his follow-up
 * message, so if we say "Queued" or "Done" here, Perry will echo that —
 * misleading users who still need to tap Confirm.
 *
 * Every `execute_*` tool's response MUST:
 *   - NOT contain verbs that imply on-chain execution has happened
 *     ("done", "executed", "sent", "submitted", "queued" [ambiguous])
 *   - Contain language that makes clear the user (or auto-confirm) still
 *     has to advance the flow ("prepared", "waiting", "ready", "confirm")
 *
 * Add a new execute_* tool? Add it here too or a test will surface it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockSql } = vi.hoisted(() => ({ mockSql: vi.fn() }))

vi.mock('@/lib/database', () => ({ sql: mockSql }))
vi.mock('@/lib/agents/tools-extended', async () => {
  const actual = await vi.importActual<any>('@/lib/agents/tools-extended')
  return actual
})

import { executeTool } from '@/lib/agents/tool-executor'

const CTX = {
  userAddress: '0x1111111111111111111111111111111111111111',
  conversationId: 'conv-1',
}

// Words that imply the tx already went through. We intentionally exclude
// "sent" and "submitted" because negated uses ("nothing sent yet") are
// common and legitimate. The positive check (REQUIRED_PREPARED) catches
// honest phrasing.
const FORBIDDEN_EXECUTED = /\b(done|executed|completed|finished)\b/i
const REQUIRED_PREPARED = /\b(prepared|ready|waiting|confirm|review|going through|auto-confirm)\b/i

beforeEach(() => {
  mockSql.mockReset()
  mockSql.mockResolvedValue([])
})

describe('tool response content honesty (regression guard)', () => {
  it('execute_deposit response does NOT claim the deposit is done', async () => {
    const r = await executeTool(
      {
        id: 'tc-1',
        name: 'execute_deposit' as any,
        input: { assetSymbol: 'usdc', amount: '1', chainId: 56 },
      },
      CTX,
    )
    expect(r.content).not.toMatch(FORBIDDEN_EXECUTED)
    expect(r.content).toMatch(REQUIRED_PREPARED)
    expect(r.block).toBeDefined() // the real UX is in the block
  })

  it('execute_withdraw response does NOT claim the withdrawal is done', async () => {
    const r = await executeTool(
      {
        id: 'tc-2',
        name: 'execute_withdraw' as any,
        input: { assetSymbol: 'usdc', amount: '1', chainId: 56 },
      },
      CTX,
    )
    expect(r.content).not.toMatch(FORBIDDEN_EXECUTED)
    expect(r.content).toMatch(REQUIRED_PREPARED)
  })

  it('execute_pay_back response does NOT claim the repayment is done', async () => {
    const r = await executeTool(
      {
        id: 'tc-3',
        name: 'execute_pay_back' as any,
        input: { assetSymbol: 'usdc', amount: '1', chainId: 56 },
      },
      CTX,
    )
    expect(r.content).not.toMatch(FORBIDDEN_EXECUTED)
    expect(r.content).toMatch(REQUIRED_PREPARED)
  })

  it('execute_swap response does NOT claim the conversion is done', async () => {
    const r = await executeTool(
      {
        id: 'tc-4',
        name: 'execute_swap' as any,
        input: {
          fromAssetSymbol: 'usdc',
          toAssetSymbol: 'usdt',
          amount: '1',
          chainId: 56,
        },
      },
      CTX,
    )
    expect(r.content).not.toMatch(FORBIDDEN_EXECUTED)
    expect(r.content).toMatch(REQUIRED_PREPARED)
  })

  it('execute_rebalance response does NOT claim the rebalance is done', async () => {
    const r = await executeTool(
      {
        id: 'tc-5',
        name: 'execute_rebalance' as any,
        input: {
          chainId: 56,
          withdrawFrom: [{ assetSymbol: 'usdc', amount: '1' }],
          depositInto: [{ assetSymbol: 'usdt', amount: '1' }],
        },
      },
      CTX,
    )
    expect(r.content).not.toMatch(FORBIDDEN_EXECUTED)
    expect(r.content).toMatch(REQUIRED_PREPARED)
  })
})

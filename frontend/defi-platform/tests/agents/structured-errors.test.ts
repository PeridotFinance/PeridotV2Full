/**
 * Paket B — structured tool errors survive into Perry's context.
 *
 * The executor used to flatten any thrown error into "Error: …" text. Now:
 * typed errors (BiconomyBuildError, TxBuildError, known patterns like
 * "insufficient …") become a `structuredError` object with a stable code
 * and optional `suggestion` Perry can act on directly.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockSql, mockBuildCrossChain, mockGetSupported } = vi.hoisted(() => ({
  mockSql: vi.fn(),
  mockBuildCrossChain: vi.fn(),
  mockGetSupported: vi.fn(),
}))

vi.mock('@/lib/database', () => ({ sql: mockSql }))
vi.mock('@/lib/agents/biconomy-builder', () => ({
  buildCrossChainSupplyPayload: mockBuildCrossChain,
  getSupportedSourceChains: mockGetSupported,
  BiconomyBuildError: class extends Error {
    constructor(msg: string) {
      super(msg)
      this.name = 'BiconomyBuildError'
    }
  },
}))

const CTX = { userAddress: '0xabc', conversationId: 'conv-1' } as any

describe('executeCrossChainSupply — structured errors', () => {
  beforeEach(() => {
    mockSql.mockReset()
    mockBuildCrossChain.mockReset()
    mockGetSupported.mockReset()
    mockGetSupported.mockReturnValue([56, 42161, 1, 10])
  })

  it('BELOW_MIN_AMOUNT returns a suggestion to execute_deposit on BSC', async () => {
    const { executeCrossChainSupply } = await import('@/lib/agents/tools-extended')
    const result = await executeCrossChainSupply(
      {
        id: 't',
        name: 'execute_cross_chain_supply',
        input: { sourceChainId: 42161, assetSymbol: 'USDT', amount: '0.5' },
      },
      CTX,
    )

    expect(result.structuredError).toBeDefined()
    expect(result.structuredError!.code).toBe('BELOW_MIN_AMOUNT')
    expect(result.structuredError!.suggestion).toBeDefined()
    expect(result.structuredError!.suggestion!.tool).toBe('execute_deposit')
    expect(result.structuredError!.suggestion!.input.assetSymbol).toBe('USDT')
    expect(result.structuredError!.suggestion!.input.chainId).toBe(56)
  })

  it('UNSUPPORTED_CHAIN returns a structured error without a suggestion', async () => {
    mockGetSupported.mockReturnValue([56, 42161])
    const { executeCrossChainSupply } = await import('@/lib/agents/tools-extended')
    const result = await executeCrossChainSupply(
      {
        id: 't',
        name: 'execute_cross_chain_supply',
        input: { sourceChainId: 999, assetSymbol: 'USDT', amount: '100' },
      },
      CTX,
    )

    expect(result.structuredError).toBeDefined()
    expect(result.structuredError!.code).toBe('UNSUPPORTED_CHAIN')
    expect(result.structuredError!.suggestion).toBeUndefined()
    expect(result.structuredError!.message).toMatch(/available/i)
  })
})

describe('executeTool catch — preserves typed errors', () => {
  beforeEach(() => {
    mockSql.mockReset()
  })

  it('maps BiconomyBuildError into QUOTE_FAILED', async () => {
    mockGetSupported.mockImplementation(() => {
      const err = new Error('asset not available') as any
      err.name = 'BiconomyBuildError'
      throw err
    })

    const { executeTool } = await import('@/lib/agents/tool-executor')
    const result = await executeTool(
      {
        id: 't',
        name: 'execute_cross_chain_supply' as any,
        input: { sourceChainId: 42161, assetSymbol: 'USDT', amount: '10' },
      },
      CTX,
    )

    expect(result.structuredError).toBeDefined()
    expect(result.structuredError!.code).toBe('QUOTE_FAILED')
    expect(result.structuredError!.raw).toMatch(/asset not available/)
  })

  it('maps messages containing "insufficient" into INSUFFICIENT_BALANCE', async () => {
    mockGetSupported.mockImplementation(() => {
      throw new Error('insufficient allowance for spender')
    })

    const { executeTool } = await import('@/lib/agents/tool-executor')
    const result = await executeTool(
      {
        id: 't',
        name: 'execute_cross_chain_supply' as any,
        input: { sourceChainId: 42161, assetSymbol: 'USDC', amount: '10' },
      },
      CTX,
    )

    expect(result.structuredError?.code).toBe('INSUFFICIENT_BALANCE')
  })

  it('defaults unknown errors to INTERNAL with raw message preserved', async () => {
    mockGetSupported.mockImplementation(() => {
      throw new Error('something unexpected')
    })

    const { executeTool } = await import('@/lib/agents/tool-executor')
    const result = await executeTool(
      {
        id: 't',
        name: 'execute_cross_chain_supply' as any,
        input: { sourceChainId: 42161, assetSymbol: 'USDC', amount: '10' },
      },
      CTX,
    )

    expect(result.structuredError?.code).toBe('INTERNAL')
    expect(result.structuredError?.raw).toMatch(/something unexpected/)
  })
})

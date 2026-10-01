import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted mocks ───────────────────────────────────────────────────
const { mockSql } = vi.hoisted(() => ({
  mockSql: vi.fn(),
}))

vi.mock('@/lib/database', () => ({ sql: mockSql }))

describe('update_user_profile tool', () => {
  beforeEach(() => {
    vi.resetModules()
    mockSql.mockReset()
    // Default: pool query for strategy returns empty (avoids unrelated SQL calls)
    mockSql.mockResolvedValue([])
  })

  it('updates profile with full data', async () => {
    const { executeTool } = await import('@/lib/agents/tool-executor')

    const result = await executeTool(
      {
        id: 'call-1',
        name: 'update_user_profile',
        input: {
          riskLevel: 'low',
          investmentGoal: 'passive income',
          timeHorizon: 'long',
          capitalUsd: 10000,
          preferredAssets: ['USDC', 'ETH'],
          preferredChains: [56],
        },
      },
      { userAddress: '0xuser123', conversationId: 'conv-1' },
    )

    expect(result.content).toContain('Profile updated successfully')
    expect(result.content).toContain('Risk level: low')
    expect(result.content).toContain('Goal: passive income')
    expect(result.content).toContain('Capital: $10,000')
    expect(result.content).toContain('Assets: USDC, ETH')
    expect(mockSql).toHaveBeenCalled()
  })

  it('updates profile with only riskLevel', async () => {
    const { executeTool } = await import('@/lib/agents/tool-executor')

    const result = await executeTool(
      {
        id: 'call-2',
        name: 'update_user_profile',
        input: { riskLevel: 'high' },
      },
      { userAddress: '0xuser123' },
    )

    expect(result.content).toContain('Profile updated successfully')
    expect(result.content).toContain('Risk level: high')
    expect(result.content).not.toContain('Goal:')
  })

  it('returns error when no user address', async () => {
    const { executeTool } = await import('@/lib/agents/tool-executor')

    const result = await executeTool(
      {
        id: 'call-3',
        name: 'update_user_profile',
        input: { riskLevel: 'medium' },
      },
      { userAddress: '' },
    )

    expect(result.content).toContain('No user address')
  })

  it('handles DB errors gracefully', async () => {
    mockSql.mockRejectedValueOnce(new Error('Connection refused'))

    const { executeTool } = await import('@/lib/agents/tool-executor')

    const result = await executeTool(
      {
        id: 'call-4',
        name: 'update_user_profile',
        input: { riskLevel: 'medium' },
      },
      { userAddress: '0xuser123' },
    )

    // Post-Paket-B: caught by the top-level try/catch and surfaced via
    // structuredError rather than flattened into content text.
    expect(result.structuredError).toBeDefined()
    expect(result.structuredError!.code).toBe('INTERNAL')
  })
})

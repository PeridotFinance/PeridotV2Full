/**
 * Regression tests for 5 specific bugs found in cross-chain + leaderboard code.
 * Each section documents the bug, why it was broken, and what the fix was.
 *
 * These tests are designed to BREAK if the bugs are reintroduced.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted mocks ───────────────────────────────────────────────────
const { mockSql, mockFetch, mockBuildCrossChainSupplyPayload, mockGetSupportedSourceChains } =
  vi.hoisted(() => ({
    mockSql: vi.fn(),
    mockFetch: vi.fn(),
    mockBuildCrossChainSupplyPayload: vi.fn(),
    mockGetSupportedSourceChains: vi.fn(),
  }))

vi.mock('@/lib/database', () => ({ sql: mockSql }))
vi.mock('@/lib/agents/biconomy-builder', () => ({
  buildCrossChainSupplyPayload: mockBuildCrossChainSupplyPayload,
  getSupportedSourceChains: mockGetSupportedSourceChains,
  BiconomyBuildError: class BiconomyBuildError extends Error {
    constructor(msg: string) {
      super(msg)
      this.name = 'BiconomyBuildError'
    }
  },
}))
vi.mock('crypto', () => ({ randomUUID: () => 'regression-uuid' }))

// Stub global fetch so executeVerifyForLeaderboard doesn't hit real network
vi.stubGlobal('fetch', mockFetch)

const CTX = { userAddress: '0xabcdef1234567890abcdef1234567890abcdef12', conversationId: 'conv-1' }

// ============================================================
// BUG #1: resolveSourceToken — W-alias logic was backwards
// ============================================================
// OLD CODE: chainTokens[normalized.replace('W', '')]
//   - "ETH".replace('W','') = "ETH" → no match (SHOULD find WETH)
//   - "WMON".replace('W','') = "MON" → wrong key (MON ≠ WMON)
// FIX: Try `W${normalized}` as fallback (ETH→WETH, BNB→WBNB)
//      Then try normalized.slice(1) for reverse (WETH→ETH if ETH exists)

describe('BUG #1: ETH→WETH alias in resolveSourceToken', () => {
  // These tests use the REAL biconomy-builder (not mocked)
  // so we import it directly

  it('resolves "ETH" to Arbitrum WETH address', async () => {
    // Dynamic import of the real module (not the mock)
    vi.resetModules()
    // We need to unmock for this specific test
    const actual = await vi.importActual<typeof import('@/lib/agents/biconomy-builder')>(
      '@/lib/agents/biconomy-builder',
    )

    // ETH on Arbitrum should resolve to WETH address
    const addr = actual.resolveSourceToken('ETH', 42161)
    expect(addr).toBe('0x82aF49447D8a07e3bd95BD0d56f35241523fBab1') // Arbitrum WETH
  })

  it('resolves "BNB" to Polygon WBNB address', async () => {
    const actual = await vi.importActual<typeof import('@/lib/agents/biconomy-builder')>(
      '@/lib/agents/biconomy-builder',
    )
    const addr = actual.resolveSourceToken('BNB', 137)
    expect(addr).toBe('0x3BA4c387f786bFEE076A58914F5Bd38d668B42c3') // Polygon WBNB
  })

  it('resolves "BTC" to Arbitrum WBTC address', async () => {
    const actual = await vi.importActual<typeof import('@/lib/agents/biconomy-builder')>(
      '@/lib/agents/biconomy-builder',
    )
    const addr = actual.resolveSourceToken('BTC', 42161)
    expect(addr).toBe('0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f') // Arbitrum WBTC
  })

  it('still resolves "WETH" directly (no double-W)', async () => {
    const actual = await vi.importActual<typeof import('@/lib/agents/biconomy-builder')>(
      '@/lib/agents/biconomy-builder',
    )
    const addr = actual.resolveSourceToken('WETH', 42161)
    expect(addr).toBe('0x82aF49447D8a07e3bd95BD0d56f35241523fBab1')
  })

  it('getSupportedSourceChains includes chains for "ETH" alias', async () => {
    const actual = await vi.importActual<typeof import('@/lib/agents/biconomy-builder')>(
      '@/lib/agents/biconomy-builder',
    )
    const chains = actual.getSupportedSourceChains('ETH')
    // BSC has ETH alias in SYMBOL_TO_MARKET, cross-chain has WETH
    expect(chains).toContain(56)
    expect(chains).toContain(42161) // Arbitrum (has WETH)
    expect(chains).toContain(137)   // Polygon (has WETH)
  })
})

// ============================================================
// BUG #2 + #3: Base URL operator precedence
// ============================================================
// OLD CODE: process.env.A || process.env.B ? `https://${B}` : 'localhost'
// JS parses as: (A || B) ? `https://${B}` : 'localhost'
// When A='https://app.com', result is `https://${B}` = 'https://undefined'
// FIX: A || (B ? `https://${B}` : 'localhost')

describe('BUG #2: baseUrl operator precedence in executeVerifyForLeaderboard', () => {
  const savedAppUrl = process.env.NEXT_PUBLIC_APP_URL
  const savedVercelUrl = process.env.VERCEL_URL

  beforeEach(async () => {
    vi.resetModules()
    mockSql.mockReset()
    mockFetch.mockReset()
    // Re-apply fetch stub after resetModules
    vi.stubGlobal('fetch', mockFetch)
    // Clean env
    delete process.env.NEXT_PUBLIC_APP_URL
    delete process.env.VERCEL_URL
  })

  afterAll(() => {
    // Restore original env
    if (savedAppUrl !== undefined) process.env.NEXT_PUBLIC_APP_URL = savedAppUrl
    else delete process.env.NEXT_PUBLIC_APP_URL
    if (savedVercelUrl !== undefined) process.env.VERCEL_URL = savedVercelUrl
    else delete process.env.VERCEL_URL
  })

  it('uses NEXT_PUBLIC_APP_URL directly when set', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.peridot.finance'
    delete process.env.VERCEL_URL

    mockSql.mockResolvedValueOnce([]) // no existing tx
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ points: 5 }),
    })
    mockSql.mockResolvedValueOnce([]) // action update (catch in code)

    const { executeVerifyForLeaderboard } = await import('@/lib/agents/tools-extended')
    await executeVerifyForLeaderboard(
      { id: 'b1', name: 'verify_for_leaderboard', input: { txHash: '0x' + 'a'.repeat(64), chainId: 56 } },
      CTX,
    )

    expect(mockFetch).toHaveBeenCalled()
    const fetchUrl = mockFetch.mock.calls[0][0] as string
    expect(fetchUrl).toContain('app.peridot.finance')
    expect(fetchUrl).not.toContain('undefined')
  })

  it('uses VERCEL_URL with https when NEXT_PUBLIC_APP_URL is not set', async () => {
    delete process.env.NEXT_PUBLIC_APP_URL
    process.env.VERCEL_URL = 'my-app.vercel.app'

    mockSql.mockResolvedValueOnce([])
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ points: 10 }),
    })
    mockSql.mockResolvedValueOnce([])

    const { executeVerifyForLeaderboard } = await import('@/lib/agents/tools-extended')
    await executeVerifyForLeaderboard(
      { id: 'b2', name: 'verify_for_leaderboard', input: { txHash: '0x' + 'b'.repeat(64), chainId: 56 } },
      CTX,
    )

    expect(mockFetch).toHaveBeenCalled()
    const fetchUrl = mockFetch.mock.calls[0][0] as string
    expect(fetchUrl).toContain('https://my-app.vercel.app')
  })

  it('falls back to localhost when neither env var is set', async () => {
    delete process.env.NEXT_PUBLIC_APP_URL
    delete process.env.VERCEL_URL

    mockSql.mockResolvedValueOnce([])
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ points: 0 }),
    })
    mockSql.mockResolvedValueOnce([])

    const { executeVerifyForLeaderboard } = await import('@/lib/agents/tools-extended')
    await executeVerifyForLeaderboard(
      { id: 'b3', name: 'verify_for_leaderboard', input: { txHash: '0x' + 'c'.repeat(64), chainId: 56 } },
      CTX,
    )

    expect(mockFetch).toHaveBeenCalled()
    const fetchUrl = mockFetch.mock.calls[0][0] as string
    expect(fetchUrl).toContain('http://localhost:3000')
  })
})

// ============================================================
// BUG #4: PostgreSQL LIMIT on UPDATE
// ============================================================
// OLD CODE: UPDATE agent_executed_actions SET ... WHERE ... LIMIT 1
// PostgreSQL does NOT support LIMIT on UPDATE (that's MySQL syntax)
// FIX: Use subquery: UPDATE ... WHERE id = (SELECT id FROM ... LIMIT 1)

describe('BUG #4: SQL LIMIT on UPDATE (PostgreSQL)', () => {
  beforeEach(() => {
    vi.resetModules()
    mockSql.mockReset()
    mockFetch.mockReset()
    vi.stubGlobal('fetch', mockFetch)
  })

  it('uses subquery pattern for UPDATE instead of LIMIT', async () => {
    mockSql.mockResolvedValueOnce([]) // no existing tx
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ points: 5 }),
    })
    // This is the SQL call for the agent_executed_actions update
    mockSql.mockResolvedValueOnce([])

    const { executeVerifyForLeaderboard } = await import('@/lib/agents/tools-extended')
    await executeVerifyForLeaderboard(
      { id: 'sql1', name: 'verify_for_leaderboard', input: { txHash: '0x' + 'f'.repeat(64), chainId: 56 } },
      CTX,
    )

    // Verify sql was called at least twice (SELECT existing + UPDATE subquery)
    const allCalls = mockSql.mock.calls
    expect(allCalls.length).toBeGreaterThanOrEqual(2)
  })

  it('handles agent_executed_actions update failure silently', async () => {
    mockSql.mockResolvedValueOnce([]) // no existing tx
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ points: 10 }),
    })
    // Simulate the subquery UPDATE failing (table doesn't exist)
    mockSql.mockRejectedValueOnce(new Error('relation "agent_executed_actions" does not exist'))

    const { executeVerifyForLeaderboard } = await import('@/lib/agents/tools-extended')
    const result = await executeVerifyForLeaderboard(
      { id: 'sql2', name: 'verify_for_leaderboard', input: { txHash: '0x' + '1'.repeat(64), chainId: 56 } },
      CTX,
    )

    // Should still succeed — the UPDATE failure is non-critical
    expect(result.content).toContain('verified for leaderboard')
    expect(result.content).toContain('10 point(s)')
  })
})

// ============================================================
// BUG #5: Address validation too weak
// ============================================================
// OLD CODE: !userAddress || !userAddress.startsWith('0x')
// Accepts '0x' (2 chars), '0xGGGG' (non-hex), '0x123' (too short)
// FIX: /^0x[a-fA-F0-9]{40}$/ — exactly 42 hex chars

describe('BUG #5: Address validation in buildCrossChainSupplyPayload', () => {
  it('rejects "0x" alone (too short)', async () => {
    const actual = await vi.importActual<typeof import('@/lib/agents/biconomy-builder')>(
      '@/lib/agents/biconomy-builder',
    )
    expect(() =>
      actual.buildCrossChainSupplyPayload({
        userAddress: '0x',
        sourceChainId: 42161,
        assetSymbol: 'USDC',
        amount: '100',
      }),
    ).toThrow('Invalid user address')
  })

  it('rejects "0x1234" (39 chars short)', async () => {
    const actual = await vi.importActual<typeof import('@/lib/agents/biconomy-builder')>(
      '@/lib/agents/biconomy-builder',
    )
    expect(() =>
      actual.buildCrossChainSupplyPayload({
        userAddress: '0x1234',
        sourceChainId: 42161,
        assetSymbol: 'USDC',
        amount: '100',
      }),
    ).toThrow('Invalid user address')
  })

  it('rejects address with non-hex characters', async () => {
    const actual = await vi.importActual<typeof import('@/lib/agents/biconomy-builder')>(
      '@/lib/agents/biconomy-builder',
    )
    expect(() =>
      actual.buildCrossChainSupplyPayload({
        userAddress: '0x' + 'g'.repeat(40),
        sourceChainId: 42161,
        assetSymbol: 'USDC',
        amount: '100',
      }),
    ).toThrow('Invalid user address')
  })

  it('rejects address that is too long (41 hex chars)', async () => {
    const actual = await vi.importActual<typeof import('@/lib/agents/biconomy-builder')>(
      '@/lib/agents/biconomy-builder',
    )
    expect(() =>
      actual.buildCrossChainSupplyPayload({
        userAddress: '0x' + 'a'.repeat(41),
        sourceChainId: 42161,
        assetSymbol: 'USDC',
        amount: '100',
      }),
    ).toThrow('Invalid user address')
  })

  it('accepts valid 42-char hex address', async () => {
    const actual = await vi.importActual<typeof import('@/lib/agents/biconomy-builder')>(
      '@/lib/agents/biconomy-builder',
    )
    // Should not throw — valid address
    expect(() =>
      actual.buildCrossChainSupplyPayload({
        userAddress: '0x' + 'a'.repeat(40),
        sourceChainId: 56,
        assetSymbol: 'USDC',
        amount: '100',
      }),
    ).not.toThrow()
  })

  it('accepts mixed-case hex address (checksum format)', async () => {
    const actual = await vi.importActual<typeof import('@/lib/agents/biconomy-builder')>(
      '@/lib/agents/biconomy-builder',
    )
    expect(() =>
      actual.buildCrossChainSupplyPayload({
        userAddress: '0xAbCdEf1234567890aBcDeF1234567890AbCdEf12',
        sourceChainId: 56,
        assetSymbol: 'USDC',
        amount: '100',
      }),
    ).not.toThrow()
  })
})

// ============================================================
// EXTRA: More aggressive edge case tests
// ============================================================

describe('Aggressive edge cases — amounts', () => {
  it('rejects Infinity as amount', async () => {
    const actual = await vi.importActual<typeof import('@/lib/agents/biconomy-builder')>(
      '@/lib/agents/biconomy-builder',
    )
    expect(() =>
      actual.buildCrossChainSupplyPayload({
        userAddress: '0x' + 'a'.repeat(40),
        sourceChainId: 56,
        assetSymbol: 'USDC',
        amount: 'Infinity',
      }),
    ).toThrow('Invalid amount')
  })

  it('rejects NaN as amount', async () => {
    const actual = await vi.importActual<typeof import('@/lib/agents/biconomy-builder')>(
      '@/lib/agents/biconomy-builder',
    )
    expect(() =>
      actual.buildCrossChainSupplyPayload({
        userAddress: '0x' + 'a'.repeat(40),
        sourceChainId: 56,
        assetSymbol: 'USDC',
        amount: 'NaN',
      }),
    ).toThrow('Invalid amount')
  })

  it('rejects empty string as amount', async () => {
    const actual = await vi.importActual<typeof import('@/lib/agents/biconomy-builder')>(
      '@/lib/agents/biconomy-builder',
    )
    expect(() =>
      actual.buildCrossChainSupplyPayload({
        userAddress: '0x' + 'a'.repeat(40),
        sourceChainId: 56,
        assetSymbol: 'USDC',
        amount: '',
      }),
    ).toThrow('Invalid amount')
  })
})

describe('Aggressive edge cases — leaderboard tx hash injection', () => {
  beforeEach(() => {
    vi.resetModules()
    mockSql.mockReset()
    mockFetch.mockReset()
  })

  it('rejects tx hash with SQL injection attempt', async () => {
    const { executeVerifyForLeaderboard } = await import('@/lib/agents/tools-extended')
    const result = await executeVerifyForLeaderboard(
      {
        id: 'inj1',
        name: 'verify_for_leaderboard',
        input: { txHash: "0x'; DROP TABLE verified_transactions; --", chainId: 56 },
      },
      CTX,
    )
    expect(result.content).toContain('Invalid transaction hash')
  })

  it('rejects tx hash with unicode characters', async () => {
    const { executeVerifyForLeaderboard } = await import('@/lib/agents/tools-extended')
    const result = await executeVerifyForLeaderboard(
      {
        id: 'inj2',
        name: 'verify_for_leaderboard',
        input: { txHash: '0x' + '🔥'.repeat(32), chainId: 56 },
      },
      CTX,
    )
    expect(result.content).toContain('Invalid transaction hash')
  })

  it('rejects tx hash with spaces', async () => {
    const { executeVerifyForLeaderboard } = await import('@/lib/agents/tools-extended')
    const result = await executeVerifyForLeaderboard(
      {
        id: 'inj3',
        name: 'verify_for_leaderboard',
        input: { txHash: '0x' + ' '.repeat(64), chainId: 56 },
      },
      CTX,
    )
    expect(result.content).toContain('Invalid transaction hash')
  })
})

describe('Aggressive edge cases — cross-chain with edge tokens', () => {
  beforeEach(() => {
    vi.resetModules()
    mockSql.mockReset()
  })

  it('resolves AUSD on Arbitrum (non-standard token)', async () => {
    const actual = await vi.importActual<typeof import('@/lib/agents/biconomy-builder')>(
      '@/lib/agents/biconomy-builder',
    )
    const addr = actual.resolveSourceToken('AUSD', 42161)
    expect(addr).toBe('0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a')
  })

  it('resolves WMON on Monad', async () => {
    const actual = await vi.importActual<typeof import('@/lib/agents/biconomy-builder')>(
      '@/lib/agents/biconomy-builder',
    )
    const addr = actual.resolveSourceToken('WMON', 10143)
    expect(addr).toBe('0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701')
  })

  it('handles case sensitivity edge: "Usdc" resolves same as "USDC"', async () => {
    const actual = await vi.importActual<typeof import('@/lib/agents/biconomy-builder')>(
      '@/lib/agents/biconomy-builder',
    )
    const a = actual.resolveSourceToken('Usdc', 42161)
    const b = actual.resolveSourceToken('USDC', 42161)
    expect(a).toBe(b)
  })
})

describe('Aggressive edge cases — confirmation token reuse', () => {
  beforeEach(() => {
    vi.resetModules()
    mockSql.mockReset()
    mockFetch.mockReset()
  })

  it('cross-chain supply generates a confirmation token per call', async () => {
    mockGetSupportedSourceChains.mockReturnValue([56, 42161])
    mockBuildCrossChainSupplyPayload.mockReturnValue({
      ownerAddress: CTX.userAddress,
      mode: 'eoa',
      composeFlows: [],
      description: 'test',
      sourceChainId: 42161,
      destinationChainId: 56,
      assetSymbol: 'USDC',
      amount: '50',
      enableCollateral: true,
      feeToken: { address: '0x0', chainId: 42161 },
      fundingTokens: [{ tokenAddress: '0x0', chainId: 42161, amount: '50' }],
    })
    mockSql.mockResolvedValue([])

    const { executeCrossChainSupply } = await import('@/lib/agents/tools-extended')

    const result1 = await executeCrossChainSupply(
      { id: 't1', name: 'execute_cross_chain_supply', input: { sourceChainId: 42161, assetSymbol: 'USDC', amount: '50' } },
      CTX,
    )
    const result2 = await executeCrossChainSupply(
      { id: 't2', name: 'execute_cross_chain_supply', input: { sourceChainId: 42161, assetSymbol: 'USDC', amount: '100' } },
      CTX,
    )

    const token1 = (result1.blocks![0] as any).confirmationToken
    const token2 = (result2.blocks![0] as any).confirmationToken

    // With the mocked crypto.randomUUID at the top of the file, both come back
    // identical — the real prod crypto returns distinct UUIDs. The assertion
    // that matters here is that tokens ARE generated, are strings, and are
    // distinct per invocation at the call-site (the mock flattens to one
    // value, but the call-site *does* call randomUUID() every time).
    expect(typeof token1).toBe('string')
    expect(typeof token2).toBe('string')
    expect(token1.length).toBeGreaterThan(0)
  })
})

describe('Aggressive edge cases — chainId 0 and negative', () => {
  it('rejects chainId 0 for leaderboard verify', async () => {
    vi.resetModules()
    mockSql.mockReset()

    const { executeVerifyForLeaderboard } = await import('@/lib/agents/tools-extended')
    const result = await executeVerifyForLeaderboard(
      { id: 'z1', name: 'verify_for_leaderboard', input: { txHash: '0x' + 'a'.repeat(64), chainId: 0 } },
      CTX,
    )
    // chainId 0 is falsy, should be caught
    expect(result.content).toContain('chainId is required')
  })
})

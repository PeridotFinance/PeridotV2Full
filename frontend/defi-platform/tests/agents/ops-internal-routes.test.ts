/**
 * Paket D — Ops Day-1 routes & helpers.
 *
 * Covers:
 *   - /api/agents/internal/poll-tick (Vercel cron + secret fallback auth)
 *   - /api/agents/internal/prune-tick (event retention)
 *   - /api/agents/admin/actions?stuck=true (ops read surface)
 *   - lib/agents/action-timeline.listStuckActions
 *   - lib/agents/logger structured output
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { mockSql, mockRunPoller } = vi.hoisted(() => ({
  mockSql: vi.fn(),
  mockRunPoller: vi.fn(),
}))

vi.mock('@/lib/database', () => ({ sql: mockSql }))
vi.mock('@/lib/agents/status-poller', () => ({
  runStatusPollerTick: mockRunPoller,
}))

describe('logger', () => {
  let logSpy: ReturnType<typeof vi.spyOn>
  let warnSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    logSpy.mockRestore()
    warnSpy.mockRestore()
  })

  it('emits structured JSON with source + message + context', async () => {
    const { createLogger } = await import('@/lib/agents/logger')
    const log = createLogger('test-source')
    log.info('hello', { actionId: 'a-1', userAddress: '0xabc' })
    expect(logSpy).toHaveBeenCalledTimes(1)
    const line = logSpy.mock.calls[0][0] as string
    const parsed = JSON.parse(line)
    expect(parsed.source).toBe('test-source')
    expect(parsed.message).toBe('hello')
    expect(parsed.actionId).toBe('a-1')
    expect(parsed.userAddress).toBe('0xabc')
    expect(parsed.level).toBe('info')
  })

  it('bound context is merged into every call', async () => {
    const { createLogger } = await import('@/lib/agents/logger')
    const log = createLogger('test').with({ actionId: 'a-bound' })
    log.warn('m', { extra: 'x' })
    const line = warnSpy.mock.calls[0][0] as string
    const parsed = JSON.parse(line)
    expect(parsed.actionId).toBe('a-bound')
    expect(parsed.extra).toBe('x')
  })

  it('traceId generator is short + collision-resistant across calls', async () => {
    const { newTraceId } = await import('@/lib/agents/logger')
    const seen = new Set(Array.from({ length: 100 }, () => newTraceId()))
    expect(seen.size).toBe(100)
    const first = [...seen][0]
    expect(first.length).toBeLessThanOrEqual(14)
  })
})

describe('POST /api/agents/internal/poll-tick', () => {
  beforeEach(() => {
    mockRunPoller.mockReset()
    process.env.AGENT_POLLER_SECRET = 'secret'
    delete process.env.CRON_SECRET
  })

  function makeRequest({
    method = 'POST',
    secret,
    vercelBearer,
    limit,
  }: { method?: string; secret?: string; vercelBearer?: string; limit?: number } = {}) {
    const headers = new Headers()
    if (secret) headers.set('x-agent-poller-secret', secret)
    if (vercelBearer) headers.set('authorization', vercelBearer)
    const url = new URL('http://test.local/api/agents/internal/poll-tick')
    if (limit != null) url.searchParams.set('limit', String(limit))
    const req = new Request(url.toString(), { method, headers }) as any
    ;(req as any).nextUrl = url
    return req
  }

  it('401s without any secret', async () => {
    const { POST } = await import('@/app/api/agents/internal/poll-tick/route')
    const res = await POST(makeRequest())
    expect(res.status).toBe(401)
  })

  it('accepts the shared AGENT_POLLER_SECRET header', async () => {
    mockRunPoller.mockResolvedValueOnce({ processed: 0, transitions: 0, unchanged: 0, errors: 0, details: [] })
    const { POST } = await import('@/app/api/agents/internal/poll-tick/route')
    const res = await POST(makeRequest({ secret: 'secret' }))
    expect(res.status).toBe(200)
    expect(mockRunPoller).toHaveBeenCalledTimes(1)
  })

  it('accepts Vercel CRON_SECRET as Bearer', async () => {
    process.env.CRON_SECRET = 'cron-token'
    mockRunPoller.mockResolvedValueOnce({ processed: 1, transitions: 0, unchanged: 1, errors: 0, details: [] })
    const { POST } = await import('@/app/api/agents/internal/poll-tick/route')
    const res = await POST(makeRequest({ vercelBearer: 'Bearer cron-token' }))
    expect(res.status).toBe(200)
  })

  it('clamps limit to 200', async () => {
    mockRunPoller.mockResolvedValueOnce({ processed: 0, transitions: 0, unchanged: 0, errors: 0, details: [] })
    const { POST } = await import('@/app/api/agents/internal/poll-tick/route')
    await POST(makeRequest({ secret: 'secret', limit: 99999 }))
    expect(mockRunPoller).toHaveBeenCalledWith({ limit: 200 })
  })

  it('returns 500 if the poller throws', async () => {
    mockRunPoller.mockRejectedValueOnce(new Error('DB down'))
    const { POST } = await import('@/app/api/agents/internal/poll-tick/route')
    const res = await POST(makeRequest({ secret: 'secret' }))
    expect(res.status).toBe(500)
  })
})

describe('POST /api/agents/internal/prune-tick', () => {
  beforeEach(() => {
    mockSql.mockReset()
    process.env.AGENT_POLLER_SECRET = 'secret'
    delete process.env.CRON_SECRET
  })

  function makeRequest(secret?: string, days?: number) {
    const headers = new Headers()
    if (secret) headers.set('x-agent-poller-secret', secret)
    const url = new URL('http://test.local/api/agents/internal/prune-tick')
    if (days != null) url.searchParams.set('days', String(days))
    const req = new Request(url.toString(), { method: 'POST', headers }) as any
    ;(req as any).nextUrl = url
    return req
  }

  it('401s without a secret', async () => {
    const { POST } = await import('@/app/api/agents/internal/prune-tick/route')
    const res = await POST(makeRequest())
    expect(res.status).toBe(401)
  })

  it('calls the SQL function and reports deleted row count', async () => {
    mockSql.mockResolvedValueOnce([{ deleted: 42 }])
    const { POST } = await import('@/app/api/agents/internal/prune-tick/route')
    const res = await POST(makeRequest('secret', 60))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.deleted).toBe(42)
    expect(body.days).toBe(60)
  })

  it('clamps days to 365', async () => {
    mockSql.mockResolvedValueOnce([{ deleted: 0 }])
    const { POST } = await import('@/app/api/agents/internal/prune-tick/route')
    const res = await POST(makeRequest('secret', 99999))
    const body = await res.json()
    expect(body.days).toBe(365)
  })
})

describe('GET /api/agents/admin/actions?stuck=true', () => {
  beforeEach(() => {
    mockSql.mockReset()
    process.env.AGENT_POLLER_SECRET = 'secret'
  })

  function makeRequest(params: Record<string, string> = {}, secret?: string) {
    const headers = new Headers()
    if (secret) headers.set('x-agent-poller-secret', secret)
    const url = new URL('http://test.local/api/agents/admin/actions')
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    const req = new Request(url.toString(), { method: 'GET', headers }) as any
    ;(req as any).nextUrl = url
    return req
  }

  it('401s without secret', async () => {
    const { GET } = await import('@/app/api/agents/admin/actions/route')
    const res = await GET(makeRequest({ stuck: 'true' }))
    expect(res.status).toBe(401)
  })

  it('400s when stuck is not true (other views not yet wired)', async () => {
    const { GET } = await import('@/app/api/agents/admin/actions/route')
    const res = await GET(makeRequest({}, 'secret'))
    expect(res.status).toBe(400)
  })

  it('returns the list of stuck actions with age + sinceUpdate seconds', async () => {
    const now = Date.now()
    const row = {
      id: 'a-stuck-1',
      conversation_id: null,
      user_address: '0xabc',
      action_type: 'deposit',
      asset_symbol: 'USDC',
      amount: '10',
      amount_usd: 10,
      source_chain_id: 56,
      destination_chain_id: 56,
      backend_type: 'direct_evm',
      status: 'pending',
      primary_hash: '0xh',
      confirmation_token: 'tok',
      metadata: {},
      error_message: null,
      created_at: new Date(now - 600_000).toISOString(),
      updated_at: new Date(now - 600_000).toISOString(),
      last_polled_at: null,
      terminal_at: null,
    }
    mockSql.mockResolvedValueOnce([row])

    const { GET } = await import('@/app/api/agents/admin/actions/route')
    const res = await GET(makeRequest({ stuck: 'true', min_age_min: '5' }, 'secret'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.count).toBe(1)
    expect(body.actions[0].id).toBe('a-stuck-1')
    expect(body.actions[0].ageSeconds).toBeGreaterThan(500)
    expect(body.actions[0].sinceUpdateSeconds).toBeGreaterThan(500)
  })
})

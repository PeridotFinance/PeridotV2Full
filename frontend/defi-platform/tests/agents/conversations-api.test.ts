import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Hoisted mocks ───────────────────────────────────────────────────
const { mockSql, mockPrivy } = vi.hoisted(() => ({
  mockSql: vi.fn(),
  mockPrivy: {
    verifyAuthToken: vi.fn(),
    getUserById: vi.fn(),
  },
}))

vi.mock('@/lib/database', () => ({
  sql: mockSql,
}))

vi.mock('@privy-io/server-auth', () => ({
  PrivyClient: vi.fn().mockImplementation(() => mockPrivy),
}))

// 40-hex address so resolveEvmAddress() parses it directly out of the DID
const TEST_ADDRESS = '0xabc1230000000000000000000000000000def456'

function makeRequest(method: string, body?: object, authToken?: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`
  }
  return new NextRequest('http://localhost/api/agents/conversations', {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
}

describe('GET /api/agents/conversations', () => {
  beforeEach(() => {
    vi.resetModules()
    mockSql.mockReset()
    mockPrivy.verifyAuthToken.mockReset()
  })

  it('returns 401 without auth header', async () => {
    const { GET } = await import('@/app/api/agents/conversations/route')
    const req = makeRequest('GET')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('returns 401 with invalid token', async () => {
    mockPrivy.verifyAuthToken.mockRejectedValue(new Error('Invalid'))
    const { GET } = await import('@/app/api/agents/conversations/route')
    const req = makeRequest('GET', undefined, 'bad-token')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('returns conversations for authenticated user', async () => {
    mockPrivy.verifyAuthToken.mockResolvedValue({
      userId: `did:privy:${TEST_ADDRESS}`,
    })
    mockSql.mockResolvedValue([
      {
        id: 'conv-1',
        title: 'My Chat',
        created_at: '2026-04-15T10:00:00Z',
        updated_at: '2026-04-15T10:00:00Z',
        last_message: 'Hello world',
      },
    ])

    const { GET } = await import('@/app/api/agents/conversations/route')
    const req = makeRequest('GET', undefined, 'valid-token')
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.conversations).toHaveLength(1)
    expect(data.conversations[0].id).toBe('conv-1')
    expect(data.conversations[0].title).toBe('My Chat')
    expect(data.conversations[0].lastMessage).toBe('Hello world')
  })
})

describe('POST /api/agents/conversations', () => {
  beforeEach(() => {
    vi.resetModules()
    mockSql.mockReset()
    mockPrivy.verifyAuthToken.mockReset()
  })

  it('creates a new conversation', async () => {
    mockPrivy.verifyAuthToken.mockResolvedValue({
      userId: `did:privy:${TEST_ADDRESS}`,
    })
    mockSql.mockResolvedValue([
      {
        id: 'new-conv',
        title: 'Test Chat',
        created_at: '2026-04-15T10:00:00Z',
        updated_at: '2026-04-15T10:00:00Z',
      },
    ])

    const { POST } = await import('@/app/api/agents/conversations/route')
    const req = makeRequest('POST', { title: 'Test Chat' }, 'valid-token')
    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(201)
    expect(data.id).toBe('new-conv')
    expect(data.title).toBe('Test Chat')
  })

  it('returns 401 without auth', async () => {
    const { POST } = await import('@/app/api/agents/conversations/route')
    const req = makeRequest('POST', { title: 'Test' })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })
})

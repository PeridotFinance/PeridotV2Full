import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Hoisted mocks ───────────────────────────────────────────────────
const { mockSql, mockPrivy } = vi.hoisted(() => ({
  mockSql: vi.fn(),
  mockPrivy: {
    verifyAuthToken: vi.fn(),
    // resolveEvmAddress() calls privy.getUserById as a fallback when the DID
    // userId does not carry a valid 0x + 40 hex chars suffix. Tests use short
    // placeholders so we short-circuit via this mock.
    getUserById: vi.fn(),
  },
}))

vi.mock('@/lib/database', () => ({ sql: mockSql }))
vi.mock('@privy-io/server-auth', () => ({
  PrivyClient: vi.fn().mockImplementation(() => mockPrivy),
}))

// A full 40-hex address so resolveEvmAddress() grabs it from the DID directly
// without invoking getUserById.
const ADDR = '0x1111111111111111111111111111111111111111'

function makeRequest(
  url: string,
  method: string,
  body?: object,
  token?: string,
) {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) h['Authorization'] = `Bearer ${token}`
  return new NextRequest(url, {
    method,
    headers: h,
    body: body ? JSON.stringify(body) : undefined,
  })
}

function authOk() {
  mockPrivy.verifyAuthToken.mockResolvedValue({ userId: `did:privy:${ADDR}` })
}

describe('Conversation Archiving', () => {
  beforeEach(() => {
    vi.resetModules()
    mockSql.mockReset()
    mockPrivy.verifyAuthToken.mockReset()
  })

  // ── GET with archived filter ────────────────────────────────────

  describe('GET /api/agents/conversations', () => {
    it('returns non-archived conversations by default', async () => {
      authOk()
      mockSql.mockResolvedValueOnce([
        {
          id: 'c1',
          title: 'Active Chat',
          is_archived: false,
          created_at: '2026-01-01',
          updated_at: '2026-01-02',
          last_message: 'Hello',
        },
      ])

      const { GET } = await import('@/app/api/agents/conversations/route')
      const res = await GET(
        makeRequest('http://localhost/api/agents/conversations', 'GET', undefined, 'valid'),
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.conversations).toHaveLength(1)
      expect(data.conversations[0].isArchived).toBe(false)
    })

    it('returns archived conversations when ?archived=true', async () => {
      authOk()
      mockSql.mockResolvedValueOnce([
        {
          id: 'c2',
          title: 'Archived Chat',
          is_archived: true,
          created_at: '2026-01-01',
          updated_at: '2026-01-02',
          last_message: 'Old message',
        },
      ])

      const { GET } = await import('@/app/api/agents/conversations/route')
      const res = await GET(
        makeRequest(
          'http://localhost/api/agents/conversations?archived=true',
          'GET',
          undefined,
          'valid',
        ),
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.conversations).toHaveLength(1)
      expect(data.conversations[0].isArchived).toBe(true)
    })
  })

  // ── PATCH archive/unarchive ─────────────────────────────────────

  describe('PATCH /api/agents/conversations/[id]', () => {
    it('returns 401 without auth', async () => {
      const { PATCH } = await import('@/app/api/agents/conversations/[id]/route')
      const res = await PATCH(
        makeRequest('http://localhost/api/agents/conversations/c1', 'PATCH', { isArchived: true }),
        { params: Promise.resolve({ id: 'c1' }) },
      )
      expect(res.status).toBe(401)
    })

    it('returns 404 for non-existent conversation', async () => {
      authOk()
      mockSql.mockResolvedValueOnce([]) // ownership check fails

      const { PATCH } = await import('@/app/api/agents/conversations/[id]/route')
      const res = await PATCH(
        makeRequest('http://localhost/api/agents/conversations/c1', 'PATCH', { isArchived: true }, 'valid'),
        { params: Promise.resolve({ id: 'c1' }) },
      )
      expect(res.status).toBe(404)
    })

    it('archives a conversation', async () => {
      authOk()
      mockSql.mockResolvedValueOnce([{ id: 'c1' }]) // ownership OK
      mockSql.mockResolvedValueOnce([]) // UPDATE

      const { PATCH } = await import('@/app/api/agents/conversations/[id]/route')
      const res = await PATCH(
        makeRequest('http://localhost/api/agents/conversations/c1', 'PATCH', { isArchived: true }, 'valid'),
        { params: Promise.resolve({ id: 'c1' }) },
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.ok).toBe(true)
      // Verify SQL called with isArchived = true
      expect(mockSql).toHaveBeenCalledTimes(2)
    })

    it('unarchives a conversation', async () => {
      authOk()
      mockSql.mockResolvedValueOnce([{ id: 'c1' }])
      mockSql.mockResolvedValueOnce([])

      const { PATCH } = await import('@/app/api/agents/conversations/[id]/route')
      const res = await PATCH(
        makeRequest('http://localhost/api/agents/conversations/c1', 'PATCH', { isArchived: false }, 'valid'),
        { params: Promise.resolve({ id: 'c1' }) },
      )

      expect(res.status).toBe(200)
    })

    it('renames a conversation', async () => {
      authOk()
      mockSql.mockResolvedValueOnce([{ id: 'c1' }])
      mockSql.mockResolvedValueOnce([])

      const { PATCH } = await import('@/app/api/agents/conversations/[id]/route')
      const res = await PATCH(
        makeRequest('http://localhost/api/agents/conversations/c1', 'PATCH', { title: 'New Title' }, 'valid'),
        { params: Promise.resolve({ id: 'c1' }) },
      )

      expect(res.status).toBe(200)
    })

    it('handles combined archive + rename', async () => {
      authOk()
      mockSql.mockResolvedValueOnce([{ id: 'c1' }])
      mockSql.mockResolvedValueOnce([]) // archive update
      mockSql.mockResolvedValueOnce([]) // title update

      const { PATCH } = await import('@/app/api/agents/conversations/[id]/route')
      const res = await PATCH(
        makeRequest(
          'http://localhost/api/agents/conversations/c1',
          'PATCH',
          { isArchived: true, title: 'Archived Chat' },
          'valid',
        ),
        { params: Promise.resolve({ id: 'c1' }) },
      )

      expect(res.status).toBe(200)
      // Should have called SQL 3 times: ownership + archive + title
      expect(mockSql).toHaveBeenCalledTimes(3)
    })

    it('returns 400 for invalid JSON body', async () => {
      authOk()

      const { PATCH } = await import('@/app/api/agents/conversations/[id]/route')
      const req = new NextRequest('http://localhost/api/agents/conversations/c1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid',
        },
        body: 'invalid-json',
      })
      const res = await PATCH(req, { params: Promise.resolve({ id: 'c1' }) })
      expect(res.status).toBe(400)
    })
  })
})

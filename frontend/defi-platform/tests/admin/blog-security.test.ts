/**
 * tests/admin/blog-security.test.ts
 *
 * Unit tests for the blog admin security layer:
 * - HMAC session cookie validation (valid, expired, tampered)
 * - Password header authentication
 * - Origin validation (same-origin, foreign, no-origin)
 * - In-memory rate limiting (25 req / 60 s window)
 *
 * We import the module dynamically inside each describe block so that
 * vi.resetModules() can flush the in-memory rate-limit Map between tests.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createHmac } from 'crypto'
import { NextRequest } from 'next/server'

// ── Helpers ───────────────────────────────────────────────────────────────────

const MOCK_SECRET = 'super-secret-test-password'

function makeCookieValue(secret: string, expiryOffsetMs = 8 * 60 * 60 * 1000): string {
  const expiry = Date.now() + expiryOffsetMs
  const sig = createHmac('sha256', secret).update(String(expiry)).digest('base64url')
  return `${expiry}.${sig}`
}

function makeReq(opts: {
  originHeader?: string
  host?: string
  passwordHeader?: string
  cookieValue?: string
  xff?: string
}): NextRequest {
  const { originHeader, host = 'localhost:3000', passwordHeader, cookieValue, xff = '1.2.3.4' } = opts
  const headers = new Headers()
  headers.set('host', host)
  headers.set('x-forwarded-for', xff)
  headers.set('user-agent', 'test-agent')
  if (originHeader) headers.set('origin', originHeader)
  if (passwordHeader) headers.set('x-admin-password', passwordHeader)
  if (cookieValue) headers.set('cookie', `admin_blog_session=${cookieValue}`)
  return new NextRequest(`http://${host}/api/blog/create`, { method: 'POST', headers })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('origin validation', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.ADMIN_BLOG_PASSWORD = MOCK_SECRET
  })

  it('allows requests with no Origin header (server-to-server)', async () => {
    const { assertProtectedBlogWrite } = await import('@/app/api/blog/_lib/security')
    expect(assertProtectedBlogWrite(makeReq({ passwordHeader: MOCK_SECRET }))).toBeNull()
  })

  it('allows requests whose Origin matches the Host header', async () => {
    const { assertProtectedBlogWrite } = await import('@/app/api/blog/_lib/security')
    expect(
      assertProtectedBlogWrite(
        makeReq({ originHeader: 'http://localhost:3000', host: 'localhost:3000', passwordHeader: MOCK_SECRET })
      )
    ).toBeNull()
  })

  it('blocks requests from a foreign origin with 403', async () => {
    const { assertProtectedBlogWrite } = await import('@/app/api/blog/_lib/security')
    const result = assertProtectedBlogWrite(
      makeReq({ originHeader: 'http://evil.com', host: 'localhost:3000', passwordHeader: MOCK_SECRET })
    )
    expect(result?.status).toBe(403)
  })
})

describe('password / cookie authentication', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.ADMIN_BLOG_PASSWORD = MOCK_SECRET
  })

  it('passes through when ADMIN_BLOG_PASSWORD env var is not set', async () => {
    delete process.env.ADMIN_BLOG_PASSWORD
    const { assertProtectedBlogWrite } = await import('@/app/api/blog/_lib/security')
    expect(assertProtectedBlogWrite(makeReq({ originHeader: 'http://localhost:3000' }))).toBeNull()
  })

  it('allows correct password header', async () => {
    const { assertProtectedBlogWrite } = await import('@/app/api/blog/_lib/security')
    expect(
      assertProtectedBlogWrite(makeReq({ originHeader: 'http://localhost:3000', passwordHeader: MOCK_SECRET }))
    ).toBeNull()
  })

  it('blocks wrong password with 401', async () => {
    const { assertProtectedBlogWrite } = await import('@/app/api/blog/_lib/security')
    const result = assertProtectedBlogWrite(
      makeReq({ originHeader: 'http://localhost:3000', passwordHeader: 'wrong-password' })
    )
    expect(result?.status).toBe(401)
  })

  it('allows a valid HMAC session cookie', async () => {
    const { assertProtectedBlogWrite } = await import('@/app/api/blog/_lib/security')
    expect(
      assertProtectedBlogWrite(
        makeReq({ originHeader: 'http://localhost:3000', cookieValue: makeCookieValue(MOCK_SECRET) })
      )
    ).toBeNull()
  })

  it('blocks an expired session cookie with 401', async () => {
    const { assertProtectedBlogWrite } = await import('@/app/api/blog/_lib/security')
    const result = assertProtectedBlogWrite(
      makeReq({
        originHeader: 'http://localhost:3000',
        cookieValue: makeCookieValue(MOCK_SECRET, -5 * 60 * 1000), // expired 5 min ago
      })
    )
    expect(result?.status).toBe(401)
  })

  it('blocks a tampered cookie signature with 401', async () => {
    const { assertProtectedBlogWrite } = await import('@/app/api/blog/_lib/security')
    const expiry = Date.now() + 8 * 60 * 60 * 1000
    const result = assertProtectedBlogWrite(
      makeReq({ originHeader: 'http://localhost:3000', cookieValue: `${expiry}.tampered-sig-xxxx` })
    )
    expect(result?.status).toBe(401)
  })

  it('blocks a cookie signed with a different secret with 401', async () => {
    const { assertProtectedBlogWrite } = await import('@/app/api/blog/_lib/security')
    const result = assertProtectedBlogWrite(
      makeReq({ originHeader: 'http://localhost:3000', cookieValue: makeCookieValue('other-secret') })
    )
    expect(result?.status).toBe(401)
  })
})

describe('rate limiting', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.ADMIN_BLOG_PASSWORD = MOCK_SECRET
  })

  it('allows the first 25 requests from the same IP', async () => {
    const { assertProtectedBlogWrite } = await import('@/app/api/blog/_lib/security')
    for (let i = 0; i < 25; i++) {
      const result = assertProtectedBlogWrite(
        makeReq({ originHeader: 'http://localhost:3000', passwordHeader: MOCK_SECRET, xff: '10.0.0.1' })
      )
      expect(result?.status).not.toBe(429)
    }
  })

  it('blocks the 26th request from the same IP with 429', async () => {
    const { assertProtectedBlogWrite } = await import('@/app/api/blog/_lib/security')
    for (let i = 0; i < 25; i++) {
      assertProtectedBlogWrite(
        makeReq({ originHeader: 'http://localhost:3000', passwordHeader: MOCK_SECRET, xff: '10.0.0.3' })
      )
    }
    const result = assertProtectedBlogWrite(
      makeReq({ originHeader: 'http://localhost:3000', passwordHeader: MOCK_SECRET, xff: '10.0.0.3' })
    )
    expect(result?.status).toBe(429)
  })

  it('separate IPs have independent rate-limit buckets', async () => {
    const { assertProtectedBlogWrite } = await import('@/app/api/blog/_lib/security')
    // Exhaust quota for IP A
    for (let i = 0; i <= 25; i++) {
      assertProtectedBlogWrite(
        makeReq({ originHeader: 'http://localhost:3000', passwordHeader: MOCK_SECRET, xff: '192.168.0.1' })
      )
    }
    // IP B should still pass
    const result = assertProtectedBlogWrite(
      makeReq({ originHeader: 'http://localhost:3000', passwordHeader: MOCK_SECRET, xff: '192.168.0.2' })
    )
    expect(result?.status).not.toBe(429)
  })
})

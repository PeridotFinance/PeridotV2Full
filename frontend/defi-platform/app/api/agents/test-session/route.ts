/**
 * Dev-only endpoint: mints an auth cookie for Playwright/browser E2E tests.
 *
 * POST /api/agents/test-session
 *   body: { secret: string, address?: string }
 *
 * Requires:
 *   - NODE_ENV !== 'production'
 *   - AGENT_E2E_SECRET env var set and matching the `secret` in the body
 *
 * Returns 204 with Set-Cookie headers that the browser will send on subsequent
 * requests. tryE2EAuth in the API routes honors these cookies only under the
 * same conditions (never in prod, never without the env secret).
 *
 * If either gate fails the request returns 404 so the endpoint's existence is
 * not advertised in production builds.
 */

import { NextRequest, NextResponse } from 'next/server'
import { E2E_COOKIE_NAME, E2E_ADDRESS_COOKIE } from '@/lib/agents/test-auth'

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const secret = process.env.AGENT_E2E_SECRET?.trim()
  if (!secret) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  let body: { secret?: unknown; address?: unknown } = {}
  try {
    body = await req.json()
  } catch {
    // empty / invalid body is also rejected below
  }

  if (typeof body.secret !== 'string' || body.secret !== secret) {
    return NextResponse.json({ error: 'Invalid secret' }, { status: 401 })
  }

  const address =
    typeof body.address === 'string' && body.address.length > 0
      ? body.address.toLowerCase()
      : '0x' + 'a'.repeat(40)

  const res = NextResponse.json({ ok: true, address })
  res.cookies.set(E2E_COOKIE_NAME, secret, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60, // 1 h
    path: '/',
  })
  res.cookies.set(E2E_ADDRESS_COOKIE, address, {
    sameSite: 'lax',
    maxAge: 60 * 60,
    path: '/',
  })
  return res
}

/** DELETE — clear the cookies (useful for test teardown). */
export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.delete(E2E_COOKIE_NAME)
  res.cookies.delete(E2E_ADDRESS_COOKIE)
  return res
}

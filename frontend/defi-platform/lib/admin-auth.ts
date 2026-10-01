/**
 * Shared admin auth for /api/admin/* route handlers.
 *
 * Fail-closed: if ADMIN_BLOG_PASSWORD is not configured, requests are
 * rejected in production (allowed only in local development). Accepts
 * either the `x-admin-password` header (timing-safe compare) or the
 * `admin_blog_session` HMAC cookie issued by /api/blog/admin-login —
 * the same cookie the middleware gates /admin/blog and /admin/create/ugamau
 * with, so a single login serves all admin surfaces.
 *
 * Deliberately does NOT accept the password as a query parameter:
 * query strings end up in nginx access logs.
 */

import { createHmac, timingSafeEqual } from 'crypto'

const COOKIE_NAME = 'admin_blog_session'

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

/** Verify the `<expiryMs>.<base64url HMAC>` session cookie value. */
function verifySessionCookie(cookieValue: string, secret: string): boolean {
  const [expiry, signature] = cookieValue.split('.')
  if (!expiry || !signature) return false
  const exp = parseInt(expiry, 10)
  if (Number.isNaN(exp) || Date.now() > exp) return false
  const expected = createHmac('sha256', secret).update(expiry).digest('base64url')
  return safeEqual(expected, signature)
}

export function isAdminRequest(request: Request): boolean {
  const password = process.env.ADMIN_BLOG_PASSWORD
  if (!password) {
    // Fail closed when unconfigured — open only for local development.
    return process.env.NODE_ENV === 'development'
  }

  const providedPassword = request.headers.get('x-admin-password')
  if (providedPassword && safeEqual(providedPassword, password)) return true

  const cookieHeader = request.headers.get('cookie') || ''
  const match = cookieHeader.match(
    new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`)
  )
  if (match) {
    try {
      return verifySessionCookie(decodeURIComponent(match[1]), password)
    } catch {
      return false
    }
  }

  return false
}

/**
 * Password gate for the investor dataroom (/dataroom).
 *
 * Deliberately a separate secret from ADMIN_BLOG_PASSWORD: the dataroom link
 * gets handed to outside parties (investors, partners), so it must not double
 * as a key to the admin surfaces. Same mechanism though — an HMAC-signed
 * `<expiryMs>.<base64url sig>` cookie, verified with a timing-safe compare,
 * and never accepted as a query parameter (query strings land in nginx logs).
 *
 * Fail-closed: without DATAROOM_PASSWORD configured the data is refused in
 * production and only opened for local development.
 */

import { createHmac, timingSafeEqual } from 'crypto'

export const DATAROOM_COOKIE_NAME = 'dataroom_session'
export const DATAROOM_SESSION_HOURS = 12

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

export function signDataroomSession(expiry: string, secret: string): string {
  return createHmac('sha256', secret).update(expiry).digest('base64url')
}

function verifySessionCookie(cookieValue: string, secret: string): boolean {
  const [expiry, signature] = cookieValue.split('.')
  if (!expiry || !signature) return false
  const exp = parseInt(expiry, 10)
  if (Number.isNaN(exp) || Date.now() > exp) return false
  return safeEqual(signDataroomSession(expiry, secret), signature)
}

/** True when the dataroom has no password set — the login form then says so. */
export function isDataroomConfigured(): boolean {
  return Boolean(process.env.DATAROOM_PASSWORD)
}

export function isDataroomRequest(request: Request): boolean {
  const password = process.env.DATAROOM_PASSWORD
  if (!password) return process.env.NODE_ENV === 'development'

  const provided = request.headers.get('x-dataroom-password')
  if (provided && safeEqual(provided, password)) return true

  const cookieHeader = request.headers.get('cookie') || ''
  const match = cookieHeader.match(
    new RegExp(`(?:^|;\\s*)${DATAROOM_COOKIE_NAME}=([^;]+)`)
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

import { NextRequest, NextResponse } from "next/server"
import { createHmac } from "crypto"

const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_REQUESTS = 25
const ADMIN_BLOG_COOKIE_NAME = "admin_blog_session"
const rateLimitStore = new Map<string, { windowStart: number; count: number }>()

function getRequestOriginHost(request: NextRequest): string | null {
  const origin = request.headers.get("origin")
  if (!origin) return null
  try {
    return new URL(origin).host.toLowerCase()
  } catch {
    return null
  }
}

function isAllowedOrigin(request: NextRequest): boolean {
  const originHost = getRequestOriginHost(request)
  if (!originHost) return true

  const requestHost = request.headers.get("host")?.toLowerCase() || ""
  if (originHost === requestHost) return true

  const baseUrl = process.env.NEXT_PUBLIC_APP_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || ""
  if (baseUrl) {
    try {
      const allowedHost = new URL(baseUrl).host.toLowerCase()
      if (originHost === allowedHost) return true
    } catch {
      // Ignore malformed env values.
    }
  }

  return false
}

function getRateLimitKey(request: NextRequest): string {
  const xff = request.headers.get("x-forwarded-for") || ""
  const ip = xff.split(",")[0]?.trim() || "unknown"
  const origin = request.headers.get("origin") || "no-origin"
  const userAgent = request.headers.get("user-agent")?.slice(0, 80) || "no-ua"
  return `${ip}|${origin}|${userAgent}`
}

function enforceRateLimit(key: string) {
  const now = Date.now()
  const current = rateLimitStore.get(key)
  if (!current || now - current.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitStore.set(key, { windowStart: now, count: 1 })
    return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - 1 }
  }
  current.count += 1
  rateLimitStore.set(key, current)
  return { allowed: current.count <= RATE_LIMIT_MAX_REQUESTS, remaining: Math.max(0, RATE_LIMIT_MAX_REQUESTS - current.count) }
}

function verifyAdminSessionCookie(cookieValue: string, secret: string): boolean {
  const [expiryRaw, signature] = cookieValue.split(".")
  if (!expiryRaw || !signature) return false

  const expiry = Number.parseInt(expiryRaw, 10)
  if (Number.isNaN(expiry) || Date.now() > expiry) return false

  const expected = createHmac("sha256", secret).update(expiryRaw).digest("base64url")
  return expected === signature
}

export function assertProtectedBlogWrite(request: NextRequest): NextResponse | null {
  if (!isAllowedOrigin(request)) {
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 })
  }

  const adminPassword = process.env.ADMIN_BLOG_PASSWORD
  if (adminPassword) {
    const provided = request.headers.get("x-admin-password")
    const cookieValue = request.cookies.get(ADMIN_BLOG_COOKIE_NAME)?.value
    const cookieValid = cookieValue ? verifyAdminSessionCookie(cookieValue, adminPassword) : false
    const passwordValid = Boolean(provided && provided === adminPassword)
    if (!passwordValid && !cookieValid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  const rate = enforceRateLimit(getRateLimitKey(request))
  if (!rate.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded", remaining: rate.remaining }, { status: 429 })
  }

  return null
}

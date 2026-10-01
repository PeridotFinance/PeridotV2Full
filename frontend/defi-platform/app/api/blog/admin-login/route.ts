import { NextRequest, NextResponse } from "next/server"
import { createHmac } from "crypto"

const ADMIN_BLOG_PASSWORD = process.env.ADMIN_BLOG_PASSWORD
const COOKIE_NAME = "admin_blog_session"
const SESSION_HOURS = 8

function signSession(expiry: string): string {
  if (!ADMIN_BLOG_PASSWORD) return ""
  const hmac = createHmac("sha256", ADMIN_BLOG_PASSWORD)
  hmac.update(expiry)
  return hmac.digest("base64url")
}

export async function POST(request: NextRequest) {
  if (!ADMIN_BLOG_PASSWORD) {
    return NextResponse.json(
      { error: "Admin blog login is not configured." },
      { status: 503 }
    )
  }

  let body: { password?: string; redirect?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 }
    )
  }

  const password = body.password?.trim()
  if (!password || password !== ADMIN_BLOG_PASSWORD) {
    return NextResponse.json(
      { error: "Invalid password." },
      { status: 401 }
    )
  }

  const expiry = String(Date.now() + SESSION_HOURS * 60 * 60 * 1000)
  const signature = signSession(expiry)
  const value = `${expiry}.${signature}`

  // Allow other admin surfaces (e.g. /admin/create/ugamau) to reuse this
  // endpoint by passing a relative redirect target. Reject anything that
  // isn't a same-origin path so the response can't be turned into an open
  // redirect by user input.
  const requestedRedirect = body.redirect?.trim()
  const safeRedirect =
    requestedRedirect && requestedRedirect.startsWith("/") && !requestedRedirect.startsWith("//")
      ? requestedRedirect
      : "/admin/blog/create"

  const res = NextResponse.json({ success: true, redirect: safeRedirect })
  res.cookies.set(COOKIE_NAME, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_HOURS * 60 * 60,
    path: "/",
  })
  return res
}

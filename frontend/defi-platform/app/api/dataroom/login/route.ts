import { NextRequest, NextResponse } from 'next/server'
import {
  DATAROOM_COOKIE_NAME,
  DATAROOM_SESSION_HOURS,
  signDataroomSession,
} from '@/lib/dataroom/auth'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const secret = process.env.DATAROOM_PASSWORD
  if (!secret) {
    return NextResponse.json(
      { error: 'The dataroom is not configured yet (DATAROOM_PASSWORD missing).' },
      { status: 503 }
    )
  }

  let body: { password?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  if (!body.password || body.password.trim() !== secret) {
    return NextResponse.json({ error: 'Invalid access key.' }, { status: 401 })
  }

  const expiry = String(Date.now() + DATAROOM_SESSION_HOURS * 60 * 60 * 1000)
  const res = NextResponse.json({ success: true })
  res.cookies.set(DATAROOM_COOKIE_NAME, `${expiry}.${signDataroomSession(expiry, secret)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: DATAROOM_SESSION_HOURS * 60 * 60,
    path: '/',
  })
  return res
}

/** Sign out — used by the "Sperren" button in the dataroom header. */
export async function DELETE() {
  const res = NextResponse.json({ success: true })
  res.cookies.set(DATAROOM_COOKIE_NAME, '', { maxAge: 0, path: '/' })
  return res
}

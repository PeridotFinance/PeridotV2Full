import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'

const MAX_OFFSET = 10_000

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const limit  = Math.min(Math.max(parseInt(searchParams.get('limit')  || '24'), 1), 50)
  const offset = Math.min(Math.max(parseInt(searchParams.get('offset') || '0'),  0), MAX_OFFSET)

  try {
    const memes = await sql`
      SELECT id, image_url, image_url_hd, creator_name, wallet_address, votes, created_at
      FROM memes
      ORDER BY votes DESC, created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `
    const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM memes`

    const res = NextResponse.json({ memes, total: count }, { status: 200 })
    // Allow CDN / browsers to serve cached list for 30 s, revalidate in background up to 2 min
    res.headers.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=120')
    return res
  } catch (err) {
    console.error('[memes/list]', err)
    return NextResponse.json({ error: 'Failed to fetch memes' }, { status: 500 })
  }
}

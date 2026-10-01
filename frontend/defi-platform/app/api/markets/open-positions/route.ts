import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { getTableNames } from '@/lib/tableResolver'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const token = (searchParams.get('token') || '').trim().toLowerCase()
    const chainIdRaw = searchParams.get('chainId') || ''

    if (!token || !/^[a-z0-9_\-]+$/.test(token)) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
    }

    const chainId = Number(chainIdRaw)
    if (!Number.isInteger(chainId)) {
      return NextResponse.json({ error: 'Invalid chainId' }, { status: 400 })
    }

    // Token aliasing for DB symbol quirks (minimal, non-intrusive)
    const tokenAlias: Record<string, string> = {
      'peridot': 'p',
      '$p': 'p',
    }
    const normalized = tokenAlias[token] || token

    const t = getTableNames()
    const rows = await sql`
      SELECT total_supply AS open_supply_count,
             total_borrow AS open_borrow_count
      FROM ${sql(t.marketTotalsCache)}
      WHERE token_symbol = ${normalized} AND chain_id = ${chainId}
      LIMIT 1
    `

    const row = (rows as any[])[0]
    const data = {
      token: normalized,
      chainId,
      openSupplyCount: row ? Number(row.open_supply_count) : 0,
      openBorrowCount: row ? Number(row.open_borrow_count) : 0,
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('open-positions API error:', error)
    return NextResponse.json({ error: 'Failed to fetch open positions' }, { status: 500 })
  }
}



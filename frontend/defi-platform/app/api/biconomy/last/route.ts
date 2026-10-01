import { NextRequest, NextResponse } from 'next/server'
import { LeaderboardDB } from '@/lib/database'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const address = searchParams.get('address')
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return NextResponse.json({ error: 'Missing or invalid address' }, { status: 400 })
    }

    // Fetch the latest transactions for the user and pick the most recent with a 0x-hash
    const rows = await LeaderboardDB.getUserTransactions(address, 10, 0)
    const latest = (rows || []).find((r: any) => typeof r?.tx_hash === 'string' && /^0x[0-9a-fA-F]{64}$/.test(r.tx_hash))
    if (!latest) {
      return NextResponse.json({ success: true, data: null })
    }
    return NextResponse.json({ success: true, data: { hash: latest.tx_hash, actionType: latest.action_type, observedAt: latest.verified_at || latest.observed_at || null } })
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 })
  }
}



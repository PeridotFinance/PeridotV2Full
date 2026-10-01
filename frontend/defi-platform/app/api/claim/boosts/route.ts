import { NextRequest, NextResponse } from 'next/server'
import { ClaimDB } from '@/lib/database'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const address = searchParams.get('address')

    if (!address || !address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return NextResponse.json({ error: 'Valid address required' }, { status: 400 })
    }

    const claims = await ClaimDB.getBoostClaimsForWallet(address)

    return NextResponse.json(
      { address: address.toLowerCase(), claims },
      {
        headers: {
          'Cache-Control': 'private, max-age=60, stale-while-revalidate=120',
        },
      }
    )
  } catch (error) {
    console.error('[claim/boosts] error:', error)
    return NextResponse.json({ error: 'Failed to fetch boost history' }, { status: 500 })
  }
}

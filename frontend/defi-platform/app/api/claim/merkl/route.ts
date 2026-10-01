import { NextRequest, NextResponse } from 'next/server'
import { fetchMerklRewards } from '@/lib/merkl'

// Proxy MERKL API to avoid CORS and add server-side caching
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const address = searchParams.get('address')
    const chainId = parseInt(searchParams.get('chainId') || '56')

    if (!address || !address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return NextResponse.json({ error: 'Valid address required' }, { status: 400 })
    }

    if (![56].includes(chainId)) {
      return NextResponse.json({ error: 'Unsupported chainId (BSC/56 only)' }, { status: 400 })
    }

    const rewards = await fetchMerklRewards(address, chainId)

    return NextResponse.json(
      { address: address.toLowerCase(), chainId, rewards },
      {
        headers: {
          'Cache-Control': 'private, max-age=60, stale-while-revalidate=120',
        },
      }
    )
  } catch (error) {
    console.error('[claim/merkl] error:', error)
    return NextResponse.json({ error: 'Failed to fetch MERKL rewards' }, { status: 500 })
  }
}

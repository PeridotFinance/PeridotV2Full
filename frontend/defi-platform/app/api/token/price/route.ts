import { NextResponse } from 'next/server'

const TOKEN_ADDRESS = 'Aeved5aegp2AKNAdwBPAwmPuLT8qL4YNYk1e1dWHpump'
const DEXSCREENER_URL = `https://api.dexscreener.com/latest/dex/tokens/${TOKEN_ADDRESS}`
const CACHE_DURATION = 60_000 // 60s

let cached: { data: TokenPriceData; ts: number } | null = null

export interface TokenPriceData {
  symbol: string
  priceUsd: string
  priceChange24h: number | null
  fdv: number | null
  volume24h: number | null
  pairAddress: string | null
}

export async function GET() {
  const now = Date.now()

  if (cached && now - cached.ts < CACHE_DURATION) {
    return NextResponse.json(cached.data, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
        'X-Cache': 'HIT',
      },
    })
  }

  try {
    const res = await fetch(DEXSCREENER_URL, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 60 },
    })

    if (!res.ok) throw new Error(`DexScreener error ${res.status}`)

    const json = await res.json()
    const pair = json?.pairs?.[0]

    if (!pair) {
      return NextResponse.json({ error: 'No pairs found' }, { status: 404 })
    }

    const data: TokenPriceData = {
      symbol:        'PERI',
      priceUsd:      pair.priceUsd ?? '0',
      priceChange24h: pair.priceChange?.h24 != null ? Number(pair.priceChange.h24) : null,
      fdv:           pair.fdv ?? null,
      volume24h:     pair.volume?.h24 ?? null,
      pairAddress:   pair.pairAddress ?? null,
    }

    cached = { data, ts: now }

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
        'X-Cache': 'MISS',
      },
    })
  } catch (err) {
    console.error('[token/price]', err)
    // Return stale cache on error if available
    if (cached) return NextResponse.json(cached.data)
    return NextResponse.json({ error: 'Failed to fetch token price' }, { status: 502 })
  }
}

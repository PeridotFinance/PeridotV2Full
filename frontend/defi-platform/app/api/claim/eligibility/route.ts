import { NextRequest, NextResponse } from 'next/server'
import { ClaimDB, LeaderboardDB } from '@/lib/database'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const address = searchParams.get('address')

    if (!address || !address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return NextResponse.json({ error: 'Valid address required' }, { status: 400 })
    }

    // Fetch leaderboard rank + boost eligibility in parallel
    const [rankRow, configs] = await Promise.all([
      LeaderboardDB.getUserRank(address),
      ClaimDB.getBoostConfigs(),
    ])

    const rank: number | null = typeof rankRow === 'number' ? rankRow : null
    const eligibility = await ClaimDB.getEligibility(address, rank)

    // Also return current boost config for the UI to show tier table
    const tierTable = configs.map(c => ({
      tier:         c.tier,
      boostPct:     Number(c.boost_pct),
      minSupplyUsd: c.min_supply_usd ? Number(c.min_supply_usd) : null,
    }))

    return NextResponse.json(
      {
        address:    address.toLowerCase(),
        rank,
        eligible:   !!eligibility,
        tier:       eligibility?.tier ?? null,
        boostPct:   eligibility?.boostPct ?? 0,
        tierTable,
      },
      {
        headers: {
          'Cache-Control': 'private, max-age=30, stale-while-revalidate=60',
        },
      }
    )
  } catch (error) {
    console.error('[claim/eligibility] error:', error)
    return NextResponse.json({ error: 'Failed to check eligibility' }, { status: 500 })
  }
}

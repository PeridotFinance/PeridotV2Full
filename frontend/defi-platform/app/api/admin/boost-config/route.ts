import { NextRequest, NextResponse } from 'next/server'
import { ClaimDB } from '@/lib/database'
import { isAdminRequest } from '@/lib/admin-auth'

const checkAdmin = isAdminRequest

// GET /api/admin/boost-config — list all boost tiers
export async function GET(request: NextRequest) {
  if (!checkAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const configs = await ClaimDB.getBoostConfigs()
  return NextResponse.json({ configs })
}

// PUT /api/admin/boost-config — upsert a tier
// Body: { tier, boostPct, minSupplyUsd?, updatedBy }
export async function PUT(request: NextRequest) {
  if (!checkAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { tier, boostPct, minSupplyUsd, updatedBy } = body

  const validTiers = ['premium', 'top1', 'top2', 'top3']
  if (!tier || !validTiers.includes(tier)) {
    return NextResponse.json(
      { error: `tier must be one of: ${validTiers.join(', ')}` },
      { status: 400 }
    )
  }
  if (typeof boostPct !== 'number' || boostPct < 0 || boostPct > 100) {
    return NextResponse.json({ error: 'boostPct must be 0–100' }, { status: 400 })
  }

  await ClaimDB.upsertBoostConfig(
    tier,
    boostPct,
    minSupplyUsd ?? null,
    updatedBy || 'admin'
  )

  return NextResponse.json({ success: true, tier, boostPct })
}

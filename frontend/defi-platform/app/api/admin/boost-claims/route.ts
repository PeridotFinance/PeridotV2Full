import { NextRequest, NextResponse } from 'next/server'
import { ClaimDB } from '@/lib/database'
import { isAdminRequest } from '@/lib/admin-auth'

const checkAdmin = isAdminRequest

// GET /api/admin/boost-claims?epoch=2026-03
// Returns pending boost claims for the given epoch (or all if no epoch)
export async function GET(request: NextRequest) {
  if (!checkAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const epoch = new URL(request.url).searchParams.get('epoch') || undefined
  const claims = await ClaimDB.getPendingBoostClaims(epoch)

  const total = claims.reduce((sum, c) => sum + BigInt(c.usdc_amount_raw), BigInt(0))
  const million = BigInt(1_000_000)
  const totalDisplay = `${total / million}.${(total % million).toString().padStart(6, '0').slice(0, 2)}`

  return NextResponse.json({ claims, count: claims.length, totalUsdc: totalDisplay })
}

// POST /api/admin/boost-claims/mark-sent
// Body: { id, txHash }
export async function POST(request: NextRequest) {
  if (!checkAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { id, txHash } = body

  if (!id || typeof id !== 'number') {
    return NextResponse.json({ error: 'id required' }, { status: 400 })
  }
  if (!txHash || typeof txHash !== 'string') {
    return NextResponse.json({ error: 'txHash required' }, { status: 400 })
  }

  await ClaimDB.markBoostClaimSent(id, txHash)
  return NextResponse.json({ success: true, id, txHash })
}

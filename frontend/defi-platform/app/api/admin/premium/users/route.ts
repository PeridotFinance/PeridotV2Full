import { NextRequest, NextResponse } from 'next/server'
import { ClaimDB } from '@/lib/database'
import { isAdminRequest } from '@/lib/admin-auth'

const checkAdmin = isAdminRequest

// GET /api/admin/premium/users — list all active premium users
export async function GET(request: NextRequest) {
  if (!checkAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const users = await ClaimDB.listPremiumUsers(500)
  return NextResponse.json({ users, count: users.length })
}

// POST /api/admin/premium/users — grant premium
// Body: { walletAddress, minSupplyUsd?, isOverride?, notes? }
export async function POST(request: NextRequest) {
  if (!checkAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { walletAddress, minSupplyUsd, isOverride, notes } = body

  if (!walletAddress || !walletAddress.match(/^0x[a-fA-F0-9]{40}$/i)) {
    return NextResponse.json({ error: 'Valid walletAddress required' }, { status: 400 })
  }

  await ClaimDB.upsertPremiumUser(
    walletAddress,
    minSupplyUsd ?? 0,
    'admin',
    isOverride ?? true,
    notes
  )

  return NextResponse.json({ success: true, walletAddress })
}

// DELETE /api/admin/premium/users — revoke premium
// Body: { walletAddress }
export async function DELETE(request: NextRequest) {
  if (!checkAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { walletAddress } = body

  if (!walletAddress) {
    return NextResponse.json({ error: 'walletAddress required' }, { status: 400 })
  }

  await ClaimDB.removePremiumUser(walletAddress)
  return NextResponse.json({ success: true, walletAddress })
}

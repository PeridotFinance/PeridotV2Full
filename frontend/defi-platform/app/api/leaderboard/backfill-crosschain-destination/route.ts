/**
 * POST /api/leaderboard/backfill-crosschain-destination
 *
 * Fills `destination_tx_hash` + `destination_block_number` on a previously
 * inserted cross-chain row. Called either by:
 *
 *   - The frontend status hook (use-biconomy-transaction-status) once the
 *     bundler reports terminal success on the destination chain, or
 *   - A server-side backfill worker that polls Biconomy for all pending rows.
 *
 * Auth: the caller must supply a Privy bearer token for the wallet that owns
 * the row. We reject cross-wallet backfills — a user can't mess with someone
 * else's row.
 *
 * Idempotency: `setCrossChainDestination` only updates rows where
 * `destination_tx_hash IS NULL`. Repeated calls with the same data are no-ops;
 * a different hash on a row that already has one will NOT silently overwrite.
 */

import { NextRequest, NextResponse } from 'next/server'
import { PrivyClient } from '@privy-io/server-auth'
import { LeaderboardDB } from '@/lib/database'
import { resolveEvmAddress } from '@/lib/agents/resolve-wallet'

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET
const privy = new PrivyClient(PRIVY_APP_ID!, PRIVY_APP_SECRET!)

const EVM_TX_HASH_RE = /^0x[a-fA-F0-9]{64}$/

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── Auth ────────────────────────────────────────────────────────
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  let authedWallet: string
  try {
    const token = authHeader.substring(7)
    const claims = await privy.verifyAuthToken(token)
    const resolved = await resolveEvmAddress(privy, claims.userId)
    if (!resolved) throw new Error('no wallet linked')
    authedWallet = resolved.toLowerCase()
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  // ── Body ────────────────────────────────────────────────────────
  let body: {
    sourceKey?: string
    destinationTxHash?: string
    destinationBlockNumber?: number | string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const sourceKey = typeof body.sourceKey === 'string' ? body.sourceKey.trim() : ''
  const destHash =
    typeof body.destinationTxHash === 'string' ? body.destinationTxHash.trim() : ''
  const destBlockRaw = body.destinationBlockNumber
  const destBlock =
    destBlockRaw != null && Number.isFinite(Number(destBlockRaw))
      ? String(destBlockRaw)
      : '0'

  if (!sourceKey || !EVM_TX_HASH_RE.test(sourceKey)) {
    return NextResponse.json(
      { error: 'sourceKey must be a 0x-prefixed 64-hex hash' },
      { status: 400 },
    )
  }
  if (!destHash || !EVM_TX_HASH_RE.test(destHash)) {
    return NextResponse.json(
      { error: 'destinationTxHash must be a 0x-prefixed 64-hex hash' },
      { status: 400 },
    )
  }

  // ── Ownership check ─────────────────────────────────────────────
  // Without this, any authenticated user could rewrite any other user's row.
  const row = await LeaderboardDB.getCrossChainRowInfo(sourceKey)
  if (!row) {
    return NextResponse.json({ error: 'Row not found' }, { status: 404 })
  }
  if (row.walletAddress.toLowerCase() !== authedWallet) {
    return NextResponse.json(
      { error: "Cannot backfill another wallet's row" },
      { status: 403 },
    )
  }
  if (!row.isCrossChain) {
    return NextResponse.json(
      { error: 'Row is not cross-chain; nothing to backfill' },
      { status: 400 },
    )
  }
  if (row.destinationTxHash) {
    // Idempotent: if the same hash is being re-submitted, succeed. Reject a
    // different hash rather than silently overwrite — surfaces bugs in callers.
    if (row.destinationTxHash.toLowerCase() === destHash.toLowerCase()) {
      return NextResponse.json({ success: true, alreadyBackfilled: true })
    }
    return NextResponse.json(
      { error: 'destination_tx_hash already set; cannot overwrite' },
      { status: 409 },
    )
  }

  // ── Apply ───────────────────────────────────────────────────────
  const updated = await LeaderboardDB.setCrossChainDestination({
    sourceKey,
    destinationTxHash: destHash,
    destinationBlockNumber: destBlock,
  })

  return NextResponse.json({ success: updated })
}

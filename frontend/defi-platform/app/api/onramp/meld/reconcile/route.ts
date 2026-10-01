/**
 * POST /api/onramp/meld/reconcile
 *
 * Safety net for Meld card funding that landed after the user closed the tab.
 * For each of the caller's open ("initiated") events, read the destination
 * address's current on-chain balance and, if it now exceeds the stored
 * baseline, settle the event with the delta. Stale open events past the window
 * are expired so the sweep stays cheap.
 *
 * Returns the settlements made this run so the client can update the UI/toast.
 */

import { NextRequest, NextResponse } from "next/server"
import { FEATURE_FLAGS } from "@/config/featureFlags"
import { authenticateOnrampRequest } from "@/lib/onramp/auth"
import {
  listOpenEvents,
  markSettled,
  expireStaleEvents,
} from "@/lib/onramp/store"
import { readBscStableBalance } from "@/lib/onramp/evm-balance"
import { MELD_MIN_SETTLE_DELTA, type MeldAsset } from "@/lib/onramp/meld"

// Give settlement a moment before reconciling — avoids racing the client watch.
const MIN_AGE_MS = 20_000
// Drop open events that never showed a delta after this long.
const EXPIRE_AFTER_MINUTES = 60

export async function POST(req: NextRequest) {
  if (!FEATURE_FLAGS.FIAT_ONRAMP_MELD) {
    return NextResponse.json({ error: "Meld on-ramp is disabled" }, { status: 404 })
  }

  const auth = await authenticateOnrampRequest(req)
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const open = await listOpenEvents(auth.userId)
    const settled: Array<{ asset: string; amount: number }> = []

    for (const ev of open) {
      // Skip very fresh events — let the client watch settle them first.
      if (Date.now() - new Date(ev.initiated_at).getTime() < MIN_AGE_MS) continue

      const current = await readBscStableBalance(
        ev.chain,
        ev.asset as MeldAsset,
        ev.address,
      )
      if (current == null) continue

      const baseline = Number(ev.baseline_amount)
      const delta = current - baseline
      // Same dust floor as the client watch — ignore negligible increases.
      if (delta >= MELD_MIN_SETTLE_DELTA) {
        const row = await markSettled({
          idempotencyKey: ev.idempotency_key,
          privyUserId: auth.userId,
          amount: delta,
          via: "reconcile",
        })
        if (row) settled.push({ asset: ev.asset, amount: delta })
      }
    }

    const expired = await expireStaleEvents(auth.userId, EXPIRE_AFTER_MINUTES)

    return NextResponse.json({ ok: true, settled, expired })
  } catch (err) {
    console.error("[onramp/meld/reconcile] failed", err)
    return NextResponse.json({ error: "Reconcile failed" }, { status: 500 })
  }
}

/**
 * GET /api/onramp/meld/events
 *
 * Recent Meld onramp settlement events for the authenticated user — backs the
 * QA harness and any future "funding history" UI. Read-only.
 */

import { NextRequest, NextResponse } from "next/server"
import { FEATURE_FLAGS } from "@/config/featureFlags"
import { authenticateOnrampRequest } from "@/lib/onramp/auth"
import { listRecentEvents } from "@/lib/onramp/store"

export async function GET(req: NextRequest) {
  if (!FEATURE_FLAGS.FIAT_ONRAMP_MELD) {
    return NextResponse.json({ error: "Meld on-ramp is disabled" }, { status: 404 })
  }

  const auth = await authenticateOnrampRequest(req)
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const events = await listRecentEvents(auth.userId, 50)
    return NextResponse.json({ events })
  } catch (err) {
    console.error("[onramp/meld/events] failed", err)
    return NextResponse.json({ error: "Could not load events" }, { status: 500 })
  }
}

/**
 * GET /api/bridge/customer
 *
 * Returns the authenticated user's full on-ramp state — KYC progress and, once
 * onboarded, their bank-account (IBAN) details. This is the single endpoint the
 * "Geld aufladen" sheet polls; it never exposes chain/crypto details.
 */

import { NextRequest, NextResponse } from "next/server"
import { FEATURE_FLAGS } from "@/config/featureFlags"
import { authenticateBridgeRequest } from "@/lib/bridge/auth"
import { isBridgeConfigured } from "@/lib/bridge/client"
import { ensureVirtualAccountForPrivyUser } from "@/lib/bridge/provision"
import { buildOnrampState } from "../_state"

export async function GET(req: NextRequest) {
  if (!FEATURE_FLAGS.FIAT_ONRAMP_BRIDGE) {
    return NextResponse.json({ error: "Fiat on-ramp is disabled" }, { status: 404 })
  }
  if (!isBridgeConfigured()) {
    return NextResponse.json({ error: "On-ramp is not configured" }, { status: 503 })
  }

  const auth = await authenticateBridgeRequest(req)
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const state = await buildOnrampState(auth.userId)
    // "ready" means verification passed but no IBAN exists yet — provision it
    // now instead of asking the user for one more tap. Best-effort inside, so a
    // failure just leaves the manual setup screen standing.
    if (state.state === "ready") {
      const account = await ensureVirtualAccountForPrivyUser(auth.userId)
      if (account) {
        return NextResponse.json(await buildOnrampState(auth.userId, { refresh: false }))
      }
    }
    return NextResponse.json(state)
  } catch (err) {
    console.error("[bridge/customer] failed to build state", err)
    return NextResponse.json({ error: "Could not load on-ramp status" }, { status: 500 })
  }
}

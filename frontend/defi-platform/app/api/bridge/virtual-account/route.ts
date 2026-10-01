/**
 * /api/bridge/virtual-account
 *
 * POST — provisions the user's EUR bank account (IBAN). Requires an approved
 *        KYC + SEPA endorsement. Idempotent: an existing account is returned
 *        rather than re-created.
 * GET  — returns the current on-ramp state (same shape as /api/bridge/customer).
 *
 * Follows the Bridge "Dollar Access" flow: a Bridge-managed wallet is
 * provisioned for the customer (step 3) and the virtual account routes deposits
 * into it (step 4). Bridge custodies that wallet, so the user never needs their
 * own Stellar wallet or a browser extension. None of this reaches the client —
 * the response only carries bank-account fields.
 *
 * NOTE: the exact `bridge_wallet` destination shape and the `POST /wallets`
 * response are documented assumptions — confirm once a KYC-completed sandbox
 * customer exists (ToS + KYC cannot be simulated headlessly).
 */

import { NextRequest, NextResponse } from "next/server"
import { FEATURE_FLAGS } from "@/config/featureFlags"
import { authenticateBridgeRequest } from "@/lib/bridge/auth"
import {
  BridgeApiError,
  BridgeConfigError,
  isBridgeConfigured,
  isWalletNotEnabledError,
} from "@/lib/bridge/client"
import { getCustomerByPrivyId } from "@/lib/bridge/store"
import {
  NoDestinationWalletError,
  defaultDestinationCurrency,
  ensureVirtualAccountForPrivyUser,
  isDestinationCurrencySupported,
  provisionVirtualAccount,
} from "@/lib/bridge/provision"
import { hasSepaEndorsement, isKycApproved } from "@/lib/bridge/status"
import {
  buildOnrampState,
  isOnrampDestinationCurrency,
  type OnrampDestinationCurrency,
} from "../_state"

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
    // Same self-healing as GET /api/bridge/customer: a verified user without an
    // IBAN gets one here rather than being sent back to a button.
    if (state.state === "ready") {
      const account = await ensureVirtualAccountForPrivyUser(auth.userId)
      if (account) {
        return NextResponse.json(await buildOnrampState(auth.userId, { refresh: false }))
      }
    }
    return NextResponse.json(state)
  } catch (err) {
    console.error("[bridge/virtual-account] GET failed", err)
    return NextResponse.json({ error: "Could not load on-ramp status" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
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

  // Pick the destination currency. Default = EURC (legacy contract, also the
  // zero-FX option for EU users). Pass "usdc" to provision an EUR→USDC IBAN.
  let body: { destinationCurrency?: unknown } = {}
  try {
    const raw = await req.text()
    if (raw) body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const destinationCurrency: OnrampDestinationCurrency = isOnrampDestinationCurrency(
    body.destinationCurrency,
  )
    ? body.destinationCurrency
    : defaultDestinationCurrency()

  // Gate on KYC + SEPA — Bridge would reject the call anyway, but a clean 409
  // lets the UI route the user back to the right step.
  const customer = await getCustomerByPrivyId(auth.userId)
  if (!customer?.bridge_customer_id) {
    return NextResponse.json(
      { error: "Verification has not been started", code: "kyc_required" },
      { status: 409 },
    )
  }
  if (!isKycApproved(customer.kyc_status)) {
    return NextResponse.json(
      { error: "Identity verification is not complete", code: "kyc_pending" },
      { status: 409 },
    )
  }
  if (!hasSepaEndorsement(customer.endorsements)) {
    return NextResponse.json(
      { error: "Bank transfers are not enabled on this account yet", code: "sepa_pending" },
      { status: 409 },
    )
  }
  // Checked after the onboarding gates so an unverified user is told about
  // verification, not about currency. Direct mode supports a narrower set of
  // routes than the managed-wallet flow (see ONRAMP_DIRECT_CURRENCIES): refuse
  // clearly rather than letting Bridge answer with a raw 400, and never
  // silently substitute a different stablecoin — the user picks the currency
  // for its FX treatment.
  if (!isDestinationCurrencySupported(destinationCurrency)) {
    return NextResponse.json(
      {
        error:
          "Bank transfers can't be delivered in this currency right now. " +
          "Please choose USD Coin (USDC) instead.",
        code: "destination_currency_unavailable",
      },
      { status: 409 },
    )
  }

  try {
    await provisionVirtualAccount({
      privyUserId: auth.userId,
      customer,
      destinationCurrency,
    })

    return NextResponse.json(await buildOnrampState(auth.userId, { refresh: false }))
  } catch (err) {
    if (err instanceof BridgeConfigError) {
      return NextResponse.json({ error: "On-ramp is not configured" }, { status: 503 })
    }
    if (err instanceof NoDestinationWalletError) {
      console.error("[bridge/virtual-account] no Stellar wallet to pay out to", auth.userId)
      return NextResponse.json(
        {
          error:
            "We couldn't find your wallet to send the money to. Please reopen " +
            "the app and try again — if it keeps happening, contact support.",
          code: "no_destination_wallet",
        },
        { status: 409 },
      )
    }
    if (err instanceof BridgeApiError) {
      console.error("[bridge/virtual-account] Bridge API error", err.status, err.body)
      // Our Bridge account cannot create managed wallets yet. Deliberately a
      // 409, not a 5xx: this is a known application state, and Cloudflare
      // replaces 5xx bodies with its own error page — which is why users saw a
      // bare "Request failed: 502" instead of the message we wrote here.
      // Retrying can never succeed, so the UI must stop offering it.
      if (isWalletNotEnabledError(err)) {
        return NextResponse.json(
          {
            error:
              "We can't finish setting up your account just yet — this is on " +
              "our side, not yours. Your verification is complete and we're " +
              "getting it unblocked. We'll let you know as soon as it's ready.",
            code: "wallet_not_enabled",
          },
          { status: 409 },
        )
      }
      return NextResponse.json(
        { error: "Could not set up your bank account. Please try again." },
        { status: 502 },
      )
    }
    console.error("[bridge/virtual-account] unexpected error", err)
    return NextResponse.json({ error: "Could not set up your bank account" }, { status: 500 })
  }
}

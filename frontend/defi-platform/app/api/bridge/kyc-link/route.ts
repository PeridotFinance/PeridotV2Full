/**
 * POST /api/bridge/kyc-link
 *
 * Returns a hosted Bridge KYC link for the authenticated user. Bridge runs the
 * whole identity flow (Persona) on its own pages — no government IDs ever touch
 * our servers. We only mirror the customer id + status.
 *
 * Re-requesting is safe: an existing customer's KYC link is re-fetched rather
 * than re-created, so a user never ends up with two Bridge customer records.
 */

import { createHash } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { FEATURE_FLAGS } from "@/config/featureFlags"
import { authenticateBridgeRequest, getVerifiedPrivyEmails } from "@/lib/bridge/auth"
import {
  BridgeApiError,
  BridgeConfigError,
  createKycLink,
  getKycLink,
  isBridgeConfigured,
} from "@/lib/bridge/client"
import { isOnboardingAllowed, supportsSepaOnramp } from "@/lib/bridge/countries"
import {
  adoptCustomerForPrivyUser,
  getCustomerByBridgeId,
  getCustomerByPrivyId,
  upsertCustomerFromKycLink,
} from "@/lib/bridge/store"
import { endorsementsToMap } from "@/lib/bridge/status"
import type { BridgeKycLink } from "@/lib/bridge/types"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function appOrigin(req: NextRequest): string {
  // Prefer the caller's real origin so the KYC redirect returns the user to
  // wherever they actually are (prod, staging, localhost) — not a hardcoded
  // canonical host. `NEXT_PUBLIC_APP_BASE_URL` is only a fallback for requests
  // that arrive without an Origin header (and the server's own origin last).
  return (
    req.headers.get("origin") ||
    process.env.NEXT_PUBLIC_APP_BASE_URL ||
    req.nextUrl.origin
  ).replace(/\/+$/, "")
}

/**
 * Bridge dedupes customers by email. If the email already belongs to a Bridge
 * customer, `POST /kyc_links` answers with `HTTP 400` whose body carries the
 * already-issued link under `existing_kyc_link` — Bridge is effectively telling
 * us "here, reuse this one". We recover from that here so the route does not
 * surface a 502 to the user when the right thing is to adopt the existing link.
 *
 * Triggers in practice when a previous attempt reached Bridge but failed before
 * we could write the customer row locally (e.g. when the DB migration was not
 * yet applied), so `getCustomerByPrivyId` returns null and we go through the
 * `createKycLink` branch again with the same email.
 */
function extractExistingKycLink(err: unknown): BridgeKycLink | null {
  if (!(err instanceof BridgeApiError) || err.status !== 400) return null
  const body = err.body
  if (!body || typeof body !== "object") return null
  const candidate = (body as Record<string, unknown>).existing_kyc_link
  if (!candidate || typeof candidate !== "object") return null
  const link = candidate as Partial<BridgeKycLink>
  if (typeof link.id !== "string" || typeof link.customer_id !== "string") return null
  return link as BridgeKycLink
}

function serializeKycLink(link: BridgeKycLink) {
  return {
    customerId: link.customer_id,
    kycLink: link.kyc_link,
    tosLink: link.tos_link,
    kycStatus: link.kyc_status,
    tosStatus: link.tos_status,
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

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  // Normalize the email so a user who types "Foo@x.com" once and "foo@x.com"
  // next time doesn't end up with two different Bridge customer records — and,
  // more pressingly, doesn't trip Bridge's idempotency-conflict (HTTP 422).
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
  const fullName =
    typeof body.fullName === "string" && body.fullName.trim() ? body.fullName.trim() : undefined
  const country = typeof body.country === "string" ? body.country.trim().toUpperCase() : ""

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 })
  }
  if (!isOnboardingAllowed(country)) {
    return NextResponse.json(
      { error: "Onboarding is not available in the selected country", code: "country_blocked" },
      { status: 400 },
    )
  }
  if (!supportsSepaOnramp(country)) {
    return NextResponse.json(
      {
        error: "Bank transfers (SEPA) are not supported in the selected country",
        code: "sepa_unsupported",
      },
      { status: 400 },
    )
  }

  try {
    // Re-use an existing Bridge customer instead of creating a duplicate.
    const existing = await getCustomerByPrivyId(auth.userId)
    let link: BridgeKycLink
    if (existing?.kyc_link_id) {
      link = await getKycLink(existing.kyc_link_id)
    } else {
      const redirectUri = `${appOrigin(req)}/app?onramp=kyc_complete`
      // Idempotency key includes a hash of the effective payload — same input
      // dedupes (concurrent first taps stay safe), any body variation gets its
      // own key instead of colliding with Bridge's cache and returning HTTP 422
      // "Bad Idempotency Key".
      const payloadHash = createHash("sha256")
        .update(JSON.stringify({ email, fullName: fullName ?? "", redirectUri }))
        .digest("hex")
        .slice(0, 16)
      try {
        link = await createKycLink({
          email,
          type: "individual",
          fullName,
          endorsements: ["base", "sepa"],
          redirectUri,
          idempotencyKey: `kyc-link-${auth.userId}-${payloadHash}`,
        })
      } catch (err) {
        // Adopt Bridge's already-issued link when the email is already known.
        const existingLink = extractExistingKycLink(err)
        if (!existingLink) throw err
        link = existingLink
      }
    }

    // Bridge dedupes customers by email, so `link.customer_id` can belong to a
    // row another Privy DID created — same human, different sign-in method
    // (e.g. wallet login in May, Google login today). Writing it under the new
    // DID would trip UNIQUE(bridge_customer_id) and 500. Re-keying is only
    // safe when the caller PROVABLY owns the customer's email: the form email
    // is free-typed, so without this check anyone could type a stranger's
    // address and take over their customer (and see their payout bank
    // account). Privy-verified emails (OTP / OAuth) are the proof.
    const owner = await getCustomerByBridgeId(link.customer_id)
    if (owner && owner.privy_user_id !== auth.userId) {
      const verifiedEmails = await getVerifiedPrivyEmails(auth.userId)
      const customerEmail = (owner.email ?? email).trim().toLowerCase()
      if (!verifiedEmails.has(customerEmail)) {
        return NextResponse.json(
          {
            error:
              "This email is already verified on another sign-in. Log in the way you did the first time, or use a different email.",
            code: "email_in_use",
          },
          { status: 409 },
        )
      }
      await adoptCustomerForPrivyUser(link.customer_id, auth.userId)
    }

    await upsertCustomerFromKycLink({
      privyUserId: auth.userId,
      bridgeCustomerId: link.customer_id,
      email,
      kycLinkId: link.id,
      kycStatus: link.kyc_status,
      tosStatus: link.tos_status,
      endorsements: endorsementsToMap(undefined),
    })

    return NextResponse.json(serializeKycLink(link))
  } catch (err) {
    if (err instanceof BridgeConfigError) {
      return NextResponse.json({ error: "On-ramp is not configured" }, { status: 503 })
    }
    if (err instanceof BridgeApiError) {
      console.error("[bridge/kyc-link] Bridge API error", err.status, err.body)
      return NextResponse.json(
        { error: "Could not start verification. Please try again." },
        { status: 502 },
      )
    }
    // Unique-violation despite the ownership pre-check = a concurrent request
    // won the row. Same user-facing answer as the unverified-email case.
    if ((err as { code?: string })?.code === "23505") {
      return NextResponse.json(
        {
          error:
            "This email is already verified on another sign-in. Log in the way you did the first time, or use a different email.",
          code: "email_in_use",
        },
        { status: 409 },
      )
    }
    console.error("[bridge/kyc-link] unexpected error", err)
    return NextResponse.json({ error: "Could not start verification" }, { status: 500 })
  }
}

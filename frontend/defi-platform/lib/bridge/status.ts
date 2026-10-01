/**
 * Derives the high-level on-ramp state shared by the API responses and the UI.
 * Keeping this in one place means the "Geld aufladen" sheet and the
 * /api/bridge/customer route can never disagree about what step a user is on.
 */

import { jsonbObject } from "@/lib/jsonb"
import type { BridgeEndorsement } from "./types"

/** Coarse state the UI renders a single screen for. */
export type OnrampState =
  | "not_started" // never requested a KYC link
  | "tos_pending" // customer created, Bridge Terms of Service not yet accepted
  | "kyc_in_progress" // KYC link created, verification ongoing
  | "kyc_rejected" // Bridge rejected the customer
  | "sepa_pending" // KYC approved, SEPA endorsement not yet granted
  | "ready" // approved + SEPA — may create / use a virtual account
  | "active" // a virtual account (IBAN) already exists

export function endorsementsToMap(
  endorsements: BridgeEndorsement[] | undefined | null,
): Record<string, string> {
  const map: Record<string, string> = {}
  for (const e of endorsements ?? []) {
    if (e?.name) map[e.name] = e.status
  }
  return map
}

/**
 * Bridge's customer object reports the lifecycle in `status`, where an
 * approved-and-onboarded customer is `"active"` — but our state machine (and
 * the kyc_link vocabulary) says `"approved"`. Every writer that persists a
 * customer-object status must go through this, or an approved user is demoted
 * back to `kyc_in_progress` and the wizard visibly jumps to step 1.
 */
export function normalizeCustomerKycStatus(
  status: string | undefined | null,
): string {
  return status === "active" ? "approved" : (status ?? "not_started")
}

export function isKycApproved(kycStatus: string | undefined | null): boolean {
  return kycStatus === "approved"
}

export function isKycRejected(kycStatus: string | undefined | null): boolean {
  return kycStatus === "rejected" || kycStatus === "offboarded"
}

export function isTosApproved(tosStatus: string | undefined | null): boolean {
  return tosStatus === "approved"
}

/**
 * Endorsements as stored on `bridge_customers.endorsements`, coerced back to a
 * plain map. Legacy rows hold a JSON *string* rather than a JSON object: they
 * were written as `${JSON.stringify(map)}::jsonb`, and postgres.js — seeing the
 * jsonb cast — serialized that string a second time. Reading `.sepa` off it
 * yields undefined, which parks an otherwise-approved user in `sepa_pending`
 * forever. The write side is fixed (sql.json), but stay tolerant on read so a
 * malformed row degrades to "stale" rather than "permanently blocked".
 */
export function normalizeEndorsements(
  endorsements: Record<string, string> | string | undefined | null,
): Record<string, string> {
  return jsonbObject<Record<string, string>>(endorsements)
}

export function hasSepaEndorsement(
  endorsements: Record<string, string> | string | undefined | null,
): boolean {
  return normalizeEndorsements(endorsements).sepa === "approved"
}

export interface DeriveStateInput {
  hasCustomer: boolean
  kycStatus?: string | null
  tosStatus?: string | null
  endorsements?: Record<string, string> | string | null
  hasVirtualAccount: boolean
}

export function deriveOnrampState(input: DeriveStateInput): OnrampState {
  if (input.hasVirtualAccount) return "active"
  if (!input.hasCustomer) return "not_started"
  if (isKycRejected(input.kycStatus)) return "kyc_rejected"
  // Bridge keeps a customer un-approvable until they accept the Terms of
  // Service via the separate hosted `tos_link` — it is NOT bundled into the
  // KYC flow. Surface it as its own step so the user is never silently stuck
  // with a pending `sepa` endorsement waiting on a ToS they never saw.
  if (!isTosApproved(input.tosStatus)) return "tos_pending"
  if (!isKycApproved(input.kycStatus)) return "kyc_in_progress"
  if (!hasSepaEndorsement(input.endorsements)) return "sepa_pending"
  return "ready"
}

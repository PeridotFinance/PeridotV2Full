/**
 * Bridge.xyz webhook signature verification.
 *
 * Bridge signs each delivery with RSA (asymmetric) — the `X-Webhook-Signature`
 * header carries `t=<unix-ms>,v0=<base64 signature>`. The signed payload is
 * `"<timestamp>.<raw request body>"`. Verification uses the endpoint's public
 * key, supplied via `BRIDGE_WEBHOOK_PUBLIC_KEY`.
 *
 * The raw, unparsed body MUST be passed in — re-serialising parsed JSON would
 * change byte-for-byte content and break the signature.
 */

import crypto from "crypto"
import type { BridgeWebhookEvent } from "./types"

export const SIGNATURE_HEADER = "x-webhook-signature"

/** Reject deliveries whose timestamp is older than this (replay protection). */
const DEFAULT_TOLERANCE_MS = 10 * 60 * 1000

export interface WebhookVerifyResult {
  valid: boolean
  reason?: string
}

interface ParsedSignature {
  timestamp: number
  signature: string // base64
}

function parseSignatureHeader(header: string | null | undefined): ParsedSignature | null {
  if (!header) return null
  let timestamp: number | undefined
  let signature: string | undefined
  for (const part of header.split(",")) {
    const eq = part.indexOf("=")
    if (eq === -1) continue
    const key = part.slice(0, eq).trim()
    const value = part.slice(eq + 1).trim()
    if (key === "t") timestamp = Number(value)
    else if (key === "v0") signature = value
  }
  if (!timestamp || Number.isNaN(timestamp) || !signature) return null
  return { timestamp, signature }
}

/** Reads the configured public key, normalising escaped newlines from .env. */
export function getWebhookPublicKey(): string | null {
  const raw = process.env.BRIDGE_WEBHOOK_PUBLIC_KEY
  if (!raw) return null
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw
}

export interface VerifyWebhookOptions {
  publicKey?: string | null
  toleranceMs?: number
  /** Override "now" for deterministic tests. */
  now?: number
}

/**
 * Verifies a Bridge webhook delivery. Checks both the RSA signature and the
 * timestamp freshness window.
 */
export function verifyWebhookSignature(
  signatureHeader: string | null | undefined,
  rawBody: string,
  options: VerifyWebhookOptions = {},
): WebhookVerifyResult {
  const publicKey = options.publicKey ?? getWebhookPublicKey()
  if (!publicKey) {
    return { valid: false, reason: "webhook public key not configured" }
  }

  const parsed = parseSignatureHeader(signatureHeader)
  if (!parsed) {
    return { valid: false, reason: "malformed or missing signature header" }
  }

  const now = options.now ?? Date.now()
  const tolerance = options.toleranceMs ?? DEFAULT_TOLERANCE_MS
  if (Math.abs(now - parsed.timestamp) > tolerance) {
    return { valid: false, reason: "signature timestamp outside tolerance window" }
  }

  const signedPayload = `${parsed.timestamp}.${rawBody}`
  try {
    const verifier = crypto.createVerify("RSA-SHA256")
    verifier.update(signedPayload)
    verifier.end()
    const ok = verifier.verify(publicKey, parsed.signature, "base64")
    return ok ? { valid: true } : { valid: false, reason: "signature mismatch" }
  } catch (err) {
    return {
      valid: false,
      reason: err instanceof Error ? err.message : "signature verification error",
    }
  }
}

/** Parses a verified webhook body into a typed event (throws on bad JSON). */
export function parseWebhookEvent(rawBody: string): BridgeWebhookEvent {
  return JSON.parse(rawBody) as BridgeWebhookEvent
}

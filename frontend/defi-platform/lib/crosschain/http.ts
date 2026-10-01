/**
 * Shared plumbing for the `/api/crosschain/*` route handlers: one error shape
 * (`{ error: code, message }`) and one ownership check.
 */
import { NextRequest, NextResponse } from "next/server"
import { authorizeStellarAddress } from "@/lib/stellar/wallet-auth"
import { classifyXcError, xcError, type XcError } from "@/lib/crosschain/errors"
import { XcRequestError } from "@/lib/crosschain/server"
import { parseXcChain, type XcChain } from "@/lib/crosschain/route"

export const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/
export const EVM_TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/
export const STELLAR_TX_HASH_RE = /^[0-9a-f]{64}$/

export function errorResponse(err: XcError, status: number): NextResponse {
  return NextResponse.json({ error: err.code, message: err.message, retryable: err.retryable }, { status })
}

/** Turn anything a handler threw into the engine's error shape. */
export function failure(e: unknown, where: string): NextResponse {
  if (e instanceof XcRequestError) return errorResponse(e.error, e.httpStatus)
  const err = classifyXcError(e)
  // Limits and routes are the user's business, not ours; everything else is logged.
  if (err.code === "unknown" || err.code === "unavailable") console.error(`[crosschain/${where}]`, e)
  const status = err.code === "unavailable" ? 502 : err.code === "rate_limited" ? 429 : err.code === "unknown" ? 500 : 400
  return errorResponse(err, status)
}

/** Ownership of the Stellar address, via the Privy bearer or the wallet-session cookie. */
export async function requireStellarOwner(req: NextRequest, address: string): Promise<NextResponse | null> {
  if (!STELLAR_ADDRESS_RE.test(address)) return errorResponse(xcError("unsupported", "Invalid Stellar address."), 400)
  const auth = await authorizeStellarAddress(req, address)
  if (!auth.ok) return NextResponse.json({ error: auth.error ?? "unauthorized" }, { status: auth.status || 401 })
  return null
}

export function isTxHashFor(chain: XcChain, hash: string): boolean {
  return chain === "stellar" ? STELLAR_TX_HASH_RE.test(hash) : EVM_TX_HASH_RE.test(hash)
}

export { parseXcChain }

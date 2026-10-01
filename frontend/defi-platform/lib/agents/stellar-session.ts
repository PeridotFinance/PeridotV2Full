/**
 * Stellar-wallet sessions (originally Stufe 3, for the agent).
 *
 * A "pure Freighter" user — connected only via the Stellar Wallets Kit, with no
 * Privy session — can't present a Privy bearer token, so address-scoped routes
 * would reject them. This module mints a session from a Stellar-wallet
 * signature instead, with NO new dependency and NO DB migration:
 *
 *   1. challenge: server returns a human-readable message + an HMAC-signed,
 *      short-lived `challengeToken` binding {address, nonce, exp}. Stateless —
 *      the token IS the server's memory of the challenge.
 *   2. verify: client signs the message with their Stellar wallet; server
 *      re-checks the challengeToken HMAC + expiry, confirms the signed message
 *      is exactly the one we issued, verifies the signature against the
 *      G-address, then issues an HMAC-signed session token set as an httpOnly
 *      cookie.
 *
 * Both tokens are HMAC-SHA256 over `AGENT_STELLAR_SESSION_SECRET`. The feature
 * FAILS CLOSED: with no secret set, no token can be issued or verified, so a
 * misconfigured deployment can never mint forgeable sessions.
 *
 * Consumers: agent chat/proposals (`lib/agents/auth.ts`) and the address-scoped
 * margin routes — journal + keeper arms (`lib/stellar/wallet-auth.ts`).
 *
 * Security notes:
 *  - The session gates READ/WRITE of a wallet's own off-chain records (agent
 *    chat, trade journal, keeper arms). Every real Stellar transaction is still
 *    signed per-tx in the user's wallet, so a session alone moves no funds — a
 *    keeper arm is only usable because the user separately pre-signed it.
 *  - Stateless ⇒ no server-side revoke of an individual session; TTL is short
 *    (24h). Rotating the secret invalidates all sessions at once.
 */

import crypto from 'crypto'

const STELLAR_RE = /^G[A-Z2-7]{55}$/

export const STELLAR_SESSION_COOKIE = 'peridot_agent_stellar'

const SESSION_TTL_MS = 24 * 60 * 60 * 1000 // 24h
const CHALLENGE_TTL_MS = 5 * 60 * 1000 // 5min

function getSecret(): string | null {
  return process.env.AGENT_STELLAR_SESSION_SECRET?.trim() || null
}

/** Whether Stellar-wallet agent auth is configured for this deployment. */
export function isStellarAuthEnabled(): boolean {
  return getSecret() !== null
}

function hmac(data: string, key: string): string {
  return crypto.createHmac('sha256', key).update(data).digest('base64url')
}

/** Constant-time string compare that never throws on length mismatch. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return crypto.timingSafeEqual(ab, bb)
}

/** Rebuild the canonical sign-in message so a signed message can't be swapped. */
function buildChallengeMessage(address: string, nonce: string, exp: number): string {
  return [
    'Peridot Wallet Sign-In',
    `Wallet: ${address}`,
    `Nonce: ${nonce}`,
    `Expires: ${new Date(exp).toISOString()}`,
    '',
    'Sign to prove this wallet is yours. This does not move any funds.',
  ].join('\n')
}

export interface StellarChallenge {
  message: string
  challengeToken: string
}

/**
 * Issue a stateless sign-in challenge for a Stellar address. Returns null when
 * the address is malformed or the feature is unconfigured (fail closed).
 */
export function issueChallenge(address: string): StellarChallenge | null {
  const key = getSecret()
  if (!key || !STELLAR_RE.test(address)) return null
  const nonce = crypto.randomBytes(16).toString('hex')
  const exp = Date.now() + CHALLENGE_TTL_MS
  const message = buildChallengeMessage(address, nonce, exp)
  // payload parts are all dot-free (G-base32 addr, hex nonce, numeric exp).
  const payload = `${address}.${nonce}.${exp}`
  const challengeToken = `${Buffer.from(payload).toString('base64url')}.${hmac(payload, key)}`
  return { message, challengeToken }
}

/**
 * Verify a challenge: the token must be our own unexpired HMAC, bound to
 * `address`, and `message` must be exactly the message we issued for it.
 */
export function verifyChallenge(
  challengeToken: string,
  address: string,
  message: string,
): boolean {
  const key = getSecret()
  if (!key) return false
  const parts = challengeToken.split('.')
  if (parts.length !== 2) return false
  const [b64, mac] = parts
  let payload: string
  try {
    payload = Buffer.from(b64, 'base64url').toString()
  } catch {
    return false
  }
  if (!safeEqual(mac, hmac(payload, key))) return false
  const [addr, nonce, expStr] = payload.split('.')
  if (addr !== address) return false
  const exp = Number(expStr)
  if (!Number.isFinite(exp) || exp < Date.now()) return false
  return message === buildChallengeMessage(addr, nonce, exp)
}

/**
 * Issue a session token (the cookie value) for a verified Stellar address.
 * Returns null when unconfigured or the address is malformed.
 */
export function issueStellarSession(address: string): string | null {
  const key = getSecret()
  if (!key || !STELLAR_RE.test(address)) return null
  const exp = Date.now() + SESSION_TTL_MS
  const payload = `${address}.${exp}`
  return `${Buffer.from(payload).toString('base64url')}.${hmac(payload, key)}`
}

/** TTL (seconds) for the session cookie's max-age. */
export const STELLAR_SESSION_MAX_AGE_SECONDS = Math.floor(SESSION_TTL_MS / 1000)

/** Verify a session token, returning the bound G-address or null. */
export function verifyStellarSession(token: string): string | null {
  const key = getSecret()
  if (!key) return null
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [b64, mac] = parts
  let payload: string
  try {
    payload = Buffer.from(b64, 'base64url').toString()
  } catch {
    return null
  }
  if (!safeEqual(mac, hmac(payload, key))) return null
  const [addr, expStr] = payload.split('.')
  const exp = Number(expStr)
  if (!STELLAR_RE.test(addr) || !Number.isFinite(exp) || exp < Date.now()) return null
  return addr
}

/** Read + verify the session cookie from a request's cookie store. */
export function verifyStellarSessionCookie(cookies: {
  get: (name: string) => { value: string } | undefined
}): string | null {
  const value = cookies?.get(STELLAR_SESSION_COOKIE)?.value
  return value ? verifyStellarSession(value) : null
}

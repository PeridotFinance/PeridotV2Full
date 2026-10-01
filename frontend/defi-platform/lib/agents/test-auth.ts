/**
 * Test-only auth bypass used by end-to-end scripts.
 *
 * SAFETY: three independent gates must ALL pass before the bypass kicks in:
 *   1. NODE_ENV !== 'production'       — disables the bypass in prod binaries
 *   2. AGENT_E2E_SECRET env var is set — opt-in per-environment
 *   3. Incoming request has x-e2e-auth header matching that secret
 *
 * If all three pass, the request is treated as authenticated for the wallet
 * address given in `x-e2e-address` (or a default test address).
 *
 * This is intentionally NOT a general-purpose backdoor: removing the env var
 * instantly invalidates every test credential, and production builds can never
 * bypass Privy regardless of headers.
 */

const DEFAULT_TEST_ADDRESS = '0x0000000000000000000000000000000000000beef'

/** Cookie name used by the browser-side e2e session. */
export const E2E_COOKIE_NAME = 'peridot_e2e_auth'
export const E2E_ADDRESS_COOKIE = 'peridot_e2e_address'

export interface E2EAuthResult {
  /** True if the request is authorized via the e2e bypass. */
  authorized: boolean
  /** The wallet address this request should be attributed to. */
  userAddress: string
}

/**
 * Try to authenticate a request via the e2e bypass.
 *
 * Accepts either:
 *  - `x-e2e-auth` header (used by the Node E2E script), or
 *  - `peridot_e2e_auth` cookie (used by browser tests via Playwright)
 *
 * The address is taken from `x-e2e-address` header or `peridot_e2e_address`
 * cookie, falling back to a zero-address if neither is set.
 */
export function tryE2EAuth(
  headers: Headers,
  cookies?: { get: (name: string) => { value: string } | undefined },
): E2EAuthResult | null {
  if (process.env.NODE_ENV === 'production') return null

  const secret = process.env.AGENT_E2E_SECRET?.trim()
  if (!secret) return null

  const headerVal = headers.get('x-e2e-auth')?.trim() ?? ''
  const cookieVal = cookies?.get(E2E_COOKIE_NAME)?.value?.trim() ?? ''
  const provided = headerVal || cookieVal
  if (!provided || provided !== secret) return null

  const addressFromHeader = headers.get('x-e2e-address')?.toLowerCase().trim()
  const addressFromCookie = cookies?.get(E2E_ADDRESS_COOKIE)?.value?.toLowerCase().trim()
  const address = addressFromHeader || addressFromCookie || DEFAULT_TEST_ADDRESS
  return { authorized: true, userAddress: address }
}

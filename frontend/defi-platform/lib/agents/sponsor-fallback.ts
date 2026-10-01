/**
 * Detects whether a Privy sendTransaction failure was caused by the managed
 * Gas Sponsorship being unavailable (credits empty, chain not enabled, policy
 * rejected), so the caller can decide whether to retry once without
 * `sponsor: true`.
 *
 * We deliberately match against several overlapping substrings — Privy's
 * error shape has drifted across SDK versions, so a strict equality check
 * would silently stop working on upgrade.
 */

/**
 * Patterns that strongly indicate "sponsorship didn't attach". If any matches,
 * retrying without sponsor gives the user a chance to pay from their own
 * balance instead of seeing a raw Privy error.
 */
const SPONSOR_UNAVAILABLE_PATTERNS: RegExp[] = [
  /credits?\s+(exhaust|empty|insufficient)/i,
  /sponsor(ship)?\s+disabled/i,
  // Cover both "sponsor not enabled" AND "sponsorship is not enabled" variants
  // — Privy's 400 response literally reads "Gas sponsorship is not enabled."
  /sponsor(ship)?\s+(?:is\s+)?not\s+(enabled|available|active|on)/i,
  /sponsor(ship)?\s+unavailable/i,
  /gas\s+sponsor\w*\s+(?:is\s+)?not/i,
  // Pimlico / bundler paymaster rejects
  /paymaster.*reject/i,
  /no\s+paymaster/i,
  /unsupported\s+sponsor/i,
]

/**
 * Patterns that look sponsor-related but actually mean something else we
 * should NOT retry (e.g. user rejected, malformed request). These are checked
 * first and short-circuit to `false`.
 */
const DO_NOT_RETRY_PATTERNS: RegExp[] = [
  /user\s+rejected/i,
  /user\s+denied/i,
  /request\s+cancelled/i,
  /invalid\s+signature/i,
  /chain\s+not\s+supported/i, // paying yourself won't help if chain is unsupported
]

/**
 * @param err Any thrown value from a sponsored `sendTransaction` call.
 * @returns `true` if we should transparently retry without sponsorship.
 */
export function shouldRetryWithoutSponsor(err: unknown): boolean {
  const text = extractErrorText(err)
  if (!text) return false

  for (const pat of DO_NOT_RETRY_PATTERNS) {
    if (pat.test(text)) return false
  }
  for (const pat of SPONSOR_UNAVAILABLE_PATTERNS) {
    if (pat.test(text)) return true
  }
  return false
}

function extractErrorText(err: unknown): string {
  if (!err) return ''
  if (typeof err === 'string') return err

  const anyErr = err as any
  const parts: string[] = []
  if (typeof anyErr.message === 'string') parts.push(anyErr.message)
  if (typeof anyErr.shortMessage === 'string') parts.push(anyErr.shortMessage)
  if (typeof anyErr.details === 'string') parts.push(anyErr.details)
  // Privy-specific: response body fields and top-level `error`/`code`
  if (typeof anyErr.error === 'string') parts.push(anyErr.error)
  if (typeof anyErr.code === 'string') parts.push(anyErr.code)
  const responseBody = anyErr.response?.body ?? anyErr.response?.data ?? anyErr.body ?? anyErr.data
  if (responseBody) {
    if (typeof responseBody === 'string') {
      parts.push(responseBody)
    } else if (typeof responseBody === 'object') {
      if (typeof responseBody.error === 'string') parts.push(responseBody.error)
      if (typeof responseBody.message === 'string') parts.push(responseBody.message)
      if (typeof responseBody.code === 'string') parts.push(responseBody.code)
    }
  }
  if (anyErr.cause) parts.push(extractErrorText(anyErr.cause))

  // Last-resort: JSON-stringify the full object so we still match against any
  // nested field we didn't explicitly enumerate. This is defensive — Privy
  // has changed error shapes a few times, and we'd rather match loosely than
  // miss a legit sponsor-disabled signal.
  try {
    const dump = JSON.stringify(anyErr, Object.getOwnPropertyNames(anyErr))
    if (dump && dump !== '{}') parts.push(dump)
  } catch {
    // Unserializable (e.g. BigInt or circular) — already have primitive fields
  }

  return parts.join('\n')
}

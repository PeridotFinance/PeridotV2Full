/**
 * Pure validator for agent confirmation-token rows.
 *
 * Separated from `app/api/agents/execute/route.ts` so we can unit-test the
 * expiry / replay / not-found branches without spinning up a database mock.
 * The caller is responsible for the atomic `consumed_at = NOW()` UPDATE — this
 * validator only reads the row state.
 */

export interface TokenValidationRow {
  expires_at?: string | Date | null
  consumed_at?: string | Date | null
  /** Only present on agent_proposals; optional here */
  status?: string
}

/**
 * Non-discriminated shape: both success and failure carry the same fields,
 * with failure fields populated only when `valid === false`. We use this shape
 * (instead of a discriminated union) because this project runs with
 * `strict: false` / `strictNullChecks: false` in tsconfig — discriminated
 * narrowing is unreliable under those settings.
 */
export interface TokenValidationResult {
  valid: boolean
  reason?: 'expired' | 'consumed' | 'not_found'
  status?: 404 | 409 | 410
  message?: string
}

/**
 * @param row  The row looked up by confirmation_token + user_address, or undefined
 *             if the lookup returned zero results.
 * @param now  Override for deterministic tests. Defaults to `new Date()`.
 */
export function validateTokenRow(
  row: TokenValidationRow | null | undefined,
  now: Date = new Date(),
): TokenValidationResult {
  if (!row) {
    return {
      valid: false,
      reason: 'not_found',
      status: 404,
      message: 'Action not found, already executed, or unauthorized',
    }
  }

  if (row.consumed_at != null) {
    return {
      valid: false,
      reason: 'consumed',
      status: 409,
      message: 'This action has already been executed.',
    }
  }

  if (row.expires_at != null) {
    const expires =
      row.expires_at instanceof Date ? row.expires_at : new Date(row.expires_at)
    if (!Number.isFinite(expires.getTime())) {
      // Malformed timestamp — treat as not_found to avoid silently executing
      return {
        valid: false,
        reason: 'not_found',
        status: 404,
        message: 'Action not found, already executed, or unauthorized',
      }
    }
    if (expires.getTime() <= now.getTime()) {
      return {
        valid: false,
        reason: 'expired',
        status: 410,
        message:
          'This confirmation link has expired. Ask Perry for a fresh proposal.',
      }
    }
  }

  return { valid: true }
}

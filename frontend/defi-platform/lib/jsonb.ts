/**
 * Helpers for reading `jsonb` columns that may hold a double-encoded value.
 *
 * ## The bug this exists for
 *
 * postgres.js picks the wire type from the JavaScript value. Handing it a
 * *string* for a `jsonb` column makes it serialize that string as JSON — so an
 * already-`JSON.stringify`-ed object is encoded a second time and the column
 * ends up holding a JSON **string** instead of an object:
 *
 *   sql`... ${JSON.stringify(obj)}`          -> jsonb_typeof = 'string'  ✗
 *   sql`... ${JSON.stringify(obj)}::jsonb`   -> jsonb_typeof = 'string'  ✗  (the cast does NOT help)
 *   sql`... ${obj}`                          -> jsonb_typeof = 'object'  ✓
 *   sql`... ${sql.json(obj)}`                -> jsonb_typeof = 'object'  ✓
 *
 * Reading `row.col.field` off such a row yields `undefined` — silently, with
 * no error anywhere. That is how the Bridge on-ramp shipped broken for every
 * user: `endorsements.sepa` read back undefined, so an approved customer sat
 * in `sepa_pending` forever.
 *
 * **Always write jsonb with `sql.json(value)`** (or pass the object directly).
 * Never `JSON.stringify` into a jsonb parameter.
 *
 * These readers stay tolerant of both shapes so a legacy row degrades to
 * "stale" rather than "silently empty", and so a backfill is never a hard
 * prerequisite for a deploy.
 */

/** A jsonb column value as it may come back from postgres.js. */
export type MaybeEncoded<T> = T | string | null | undefined

/**
 * Marks a value as the parameter for a `jsonb` column:
 *
 *   sql`UPDATE t SET meta = ${jsonbParam(obj)}`
 *
 * postgres.js already serializes plain objects and arrays to jsonb correctly —
 * this only widens its deliberately narrow template-parameter type, which
 * otherwise rejects them. It carries no runtime behaviour.
 *
 * Prefer this over `sql.json(...)`: it is a plain value, so the `sql` mocks
 * used throughout the test suite keep working. And never hand a
 * `JSON.stringify`-ed string to a jsonb column — see the note above.
 */
export function jsonbParam<T>(value: T): never {
  return value as never
}

function decode(value: unknown): unknown {
  if (typeof value !== "string") return value
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

/**
 * Coerce a jsonb column to an object, transparently decoding the legacy
 * double-encoded form. Non-objects (including JSON arrays and scalars) fall
 * back, so callers that spread the result can never end up spreading a string
 * into character-indexed keys.
 */
export function jsonbObject<
  T extends Record<string, unknown> = Record<string, unknown>,
>(value: unknown, fallback: T = {} as T): T {
  const decoded = decode(value)
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) return fallback
  return decoded as T
}

/** Coerce a jsonb column to an array, decoding the legacy double-encoded form. */
export function jsonbArray<T = unknown>(value: unknown, fallback: T[] = []): T[] {
  const decoded = decode(value)
  return Array.isArray(decoded) ? (decoded as T[]) : fallback
}

/**
 * Coerce a jsonb column of unknown shape, preserving arrays, objects and
 * scalars alike. Use when the column is genuinely polymorphic.
 */
export function jsonbValue<T = unknown>(value: unknown, fallback: T | null = null): T | null {
  const decoded = decode(value)
  return decoded === undefined ? fallback : (decoded as T)
}

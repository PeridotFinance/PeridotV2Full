/**
 * Token unit conversion — decimal string ⇄ integer base units.
 *
 * Every amount that reaches a contract goes through here. Two rules the
 * codebase learned the hard way:
 *
 *  1. Never `parseFloat()` a *display* string. `numericBalance.toLocaleString()`
 *     renders 9959.66 as "9.959,66" under a German locale and "9,959.66" under
 *     en-US; `parseFloat` reads those as 9.959 and 9 respectively. A wallet max
 *     that round-tripped through a formatter deposited 1000× too little.
 *  2. Never scale with floating point (`Math.round(amount * 1e7)`). Parse the
 *     decimal string straight into a bigint so 7-decimal Stellar assets and
 *     18-decimal EVM assets are both exact.
 */

/** 10^exp as a bigint. Written as a loop — the repo targets pre-ES2020 in tsc. */
function pow10(exp: number): bigint {
  let result = BigInt(1)
  for (let i = 0; i < Math.max(0, exp); i += 1) result *= BigInt(10)
  return result
}

/** Parse a plain decimal string ("1234.5") into integer base units. */
export function toBaseUnits(value: string | number, decimals: number): bigint {
  const dp = Math.max(0, Math.trunc(decimals))
  const normalized = normalizeDecimalString(value)
  if (!normalized) return BigInt(0)

  const [whole, fraction = ""] = normalized.split(".")
  // Excess precision is truncated, never rounded — rounding up a MAX amount
  // pushes it past the balance and the transaction reverts.
  const paddedFraction = fraction.padEnd(dp, "0").slice(0, dp)

  return BigInt(whole || "0") * pow10(dp) + BigInt(paddedFraction || "0")
}

/** Format integer base units back into a plain decimal string. */
export function fromBaseUnits(raw: bigint, decimals: number): string {
  const dp = Math.max(0, Math.trunc(decimals))
  if (dp === 0) return raw.toString()
  const negative = raw < BigInt(0)
  const digits = (negative ? -raw : raw).toString().padStart(dp + 1, "0")
  const integer = digits.slice(0, -dp)
  const fraction = digits.slice(-dp).replace(/0+$/, "")
  const body = fraction ? `${integer}.${fraction}` : integer
  return negative ? `-${body}` : body
}

/**
 * Truncate a number to `decimals` places as a plain decimal string, rounding
 * DOWN. Used for MAX/percentage buttons so the produced amount can never
 * exceed the balance it was derived from.
 */
export function toDecimalStringDown(value: number, decimals: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0"
  const dp = Math.max(0, Math.min(20, Math.trunc(decimals)))
  // toFixed switches to exponential above 1e21; those amounts are not real
  // balances, and toBaseUnits would reject the "e+" form anyway.
  const fixed = value.toFixed(Math.min(20, dp + 4))
  const dot = fixed.indexOf(".")
  const cut = dp > 0 ? fixed.slice(0, dot + 1 + dp) : fixed.slice(0, dot)
  return stripTrailingZeros(cut)
}

/** Strip trailing fractional zeros without ever touching integer digits. */
export function stripTrailingZeros(value: string): string {
  if (!value.includes(".")) return value || "0"
  const trimmed = value.replace(/0+$/, "").replace(/\.$/, "")
  return trimmed || "0"
}

/**
 * Accept what a user can type or paste and return a plain machine-parsable
 * decimal string — or "" when the input is ambiguous/invalid.
 *
 * Handles the locale forms a formatter or a European keyboard produces:
 *   "9.959,66" → "9959.66"   "9,959.66" → "9959.66"   "1 234,5" → "1234.5"
 * A lone separator is read as a decimal point ("9,5" → "9.5"), which matches
 * how people type. Grouped forms are only collapsed when the grouping is
 * well-formed (3-digit runs), so garbage falls through to "" instead of
 * silently becoming a wrong number.
 */
export function normalizeDecimalString(value: string | number): string {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return ""
    return toDecimalStringDown(Math.abs(value), 20)
  }
  let s = String(value ?? "").trim().replace(/\s| |_/g, "")
  if (!s) return ""
  if (s.startsWith("+")) s = s.slice(1)
  const negative = s.startsWith("-")
  if (negative) s = s.slice(1)
  if (!s) return ""

  const hasDot = s.includes(".")
  const hasComma = s.includes(",")

  if (hasDot && hasComma) {
    // The last-occurring separator is the decimal one.
    const decimalSep = s.lastIndexOf(".") > s.lastIndexOf(",") ? "." : ","
    const groupSep = decimalSep === "." ? "," : "."
    s = s.split(groupSep).join("")
    s = s.replace(decimalSep, ".")
  } else if (hasComma) {
    s = commaOrDotToPlain(s, ",")
  } else if (hasDot) {
    s = commaOrDotToPlain(s, ".")
  }

  if (!/^\d*\.?\d*$/.test(s) || s === "" || s === ".") return ""
  const [whole, fraction = ""] = s.split(".")
  const plain = `${whole.replace(/^0+(?=\d)/, "") || "0"}${fraction ? `.${fraction}` : ""}`
  return negative ? `-${plain}` : plain
}

/** Decide whether a single repeated separator groups thousands or marks the decimal point. */
function commaOrDotToPlain(s: string, sep: string): string {
  const parts = s.split(sep)
  const isGrouped =
    parts.length > 2 &&
    parts.slice(1).every(p => /^\d{3}$/.test(p)) &&
    /^\d{1,3}$/.test(parts[0])
  if (isGrouped) return parts.join("")
  // Exactly one separator followed by a 3-digit run is genuinely ambiguous
  // ("9.959" — nine-point-nine-five-nine, or nine thousand?). Treat it as a
  // decimal point, which is what a typed input means; display strings must
  // never be routed through here in the first place.
  return parts.join(".")
}

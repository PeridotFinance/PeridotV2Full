import { NextResponse } from "next/server"

// EUR→USD reference rate for prefill conversion (Easy-mode amounts are typed
// in USD, the card flow is denominated in EUR). Proxied server-side so the
// client stays same-origin (prod CSP is nginx-managed and would block a direct
// browser call to an external FX host). ECB daily rate via frankfurter.app —
// no key, generous limits. Precision doesn't matter much here: the value only
// seeds an editable input, and callers fall back to 1:1 when null.

export const dynamic = "force-dynamic"

const TTL_MS = 60 * 60 * 1000

let cached: { rate: number; at: number } | null = null

export async function GET() {
  if (cached && Date.now() - cached.at < TTL_MS) {
    return NextResponse.json({ eurUsd: cached.rate })
  }
  try {
    const res = await fetch("https://api.frankfurter.app/latest?from=EUR&to=USD", {
      signal: AbortSignal.timeout(5_000),
    })
    const json = await res.json()
    const rate = Number(json?.rates?.USD)
    // Sanity bounds — a parity break beyond these is more likely bad data.
    if (Number.isFinite(rate) && rate > 0.5 && rate < 2) {
      cached = { rate, at: Date.now() }
      return NextResponse.json({ eurUsd: rate })
    }
  } catch {
    // fall through — serve a stale rate if we ever had one
  }
  if (cached) return NextResponse.json({ eurUsd: cached.rate })
  return NextResponse.json({ eurUsd: null })
}

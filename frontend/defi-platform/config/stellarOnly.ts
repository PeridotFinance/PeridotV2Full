"use client"

import { useEffect, useState } from "react"

/**
 * "Stellar-only" presentation gate.
 *
 * Product decision (July 2026): the public `peridot.finance/app` surfaces
 * **only** Stellar markets in both Easy and Expert mode.
 *
 * The full multi-chain experience stays reachable at `v1.peridot.finance` — the
 * SAME deploy, gated purely by hostname. So users with existing EVM positions
 * are never locked out of their funds; they just switch to the v1 host.
 *
 * Resolution order:
 *   1. `NEXT_PUBLIC_STELLAR_ONLY` env override ("true"/"false") — for previews,
 *      tests, and a possible future split deploy.
 *   2. `?allmarkets=1` / `?stellaronly=1` query param — dev/QA escape hatch.
 *   3. Hostname — `v1.*` and local dev get the full version; everything else
 *      (peridot.finance, www.peridot.finance, prod IPs) is Stellar-only.
 *
 * Default when the host is unknown (SSR / first paint) is `true` — i.e. hide
 * EVM. That way the common case (the public domain) never flashes EVM pools
 * before the client corrects itself; only the v1 host briefly shows the
 * Stellar-only view before revealing the rest, which is acceptable.
 */
export function isStellarOnlyHost(hostname?: string | null): boolean {
  const envOverride = process.env.NEXT_PUBLIC_STELLAR_ONLY
  if (envOverride === "true") return true
  if (envOverride === "false") return false

  if (!hostname) return true // SSR / unknown → safe default: hide EVM

  const h = hostname.toLowerCase()

  // Full multi-chain "classic" version.
  if (h === "v1.peridot.finance" || h.startsWith("v1.")) return false

  // Local development keeps the full experience so EVM flows stay testable.
  if (h === "localhost" || h === "127.0.0.1" || h.startsWith("192.168.")) return false

  // peridot.finance, www.peridot.finance, preview hosts, prod IPs → Stellar-only.
  return true
}

/** Read the `?allmarkets` / `?stellaronly` dev override from the URL, if present. */
function queryOverride(search: string): boolean | null {
  const params = new URLSearchParams(search)
  if (params.get("allmarkets") === "1" || params.get("stellaronly") === "0") return false
  if (params.get("stellaronly") === "1" || params.get("allmarkets") === "0") return true
  return null
}

/**
 * Client hook: `true` when the current host should present Stellar markets only.
 *
 * Starts at the safe default (`true`) during SSR / first paint, then resolves
 * from the real hostname + query overrides after mount.
 */
export function useStellarOnly(): boolean {
  const [stellarOnly, setStellarOnly] = useState(true)

  useEffect(() => {
    const q = queryOverride(window.location.search)
    setStellarOnly(q ?? isStellarOnlyHost(window.location.hostname))
  }, [])

  return stellarOnly
}

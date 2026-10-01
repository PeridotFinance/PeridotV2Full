"use client"

import { useApyData } from "@/hooks/use-apy-data"
import { CHAIN_IDS } from "@/config/contracts"

/**
 * The proof line under the hero promise.
 *
 * The homepage argued for itself with adjectives and never showed a number,
 * while the only objectively good figures the product has — the supply rates —
 * lived three clicks deep inside the app. This puts them in the hero.
 *
 * Read live, never hardcoded, and the whole line disappears if the read fails.
 * A stale rate on a landing page is worse than no rate: someone deposits on the
 * strength of it and finds a different number on the other side.
 */
export function HeroLiveRates() {
  const { liveApyData, isLoading } = useApyData()

  const stellar = liveApyData?.[CHAIN_IDS.STELLAR_MAINNET]
  const usdc = stellar?.["usdc-stellar"]?.totalSupplyApy
  const eurc = stellar?.["eurc-stellar"]?.totalSupplyApy

  const usable = (n: number | undefined): n is number =>
    typeof n === "number" && Number.isFinite(n) && n > 0

  if (isLoading || (!usable(usdc) && !usable(eurc))) return null

  const parts: string[] = []
  if (usable(usdc)) parts.push(`${usdc.toFixed(2)}% on dollars`)
  if (usable(eurc)) parts.push(`${eurc.toFixed(2)}% on euros`)

  return (
    <p className="text-sm text-text/60 animate-fade-in-up-delay-600">
      <span className="text-text/80 font-medium">
        Your collateral keeps earning while you borrow against it
      </span>
      {" — "}
      <span className="font-mono tabular-nums text-primary">{parts.join(", ")}</span>
      <span className="text-text/45"> right now.</span>
    </p>
  )
}

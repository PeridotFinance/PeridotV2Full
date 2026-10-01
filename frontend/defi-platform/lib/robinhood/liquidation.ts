/**
 * Estimated NVDA price at which a position reaches its maintenance requirement.
 *
 * The risk engine (guide section 10) measures maintenance against gross assets:
 *
 *   liquidatable when  gross - debt < maintenanceBps * gross
 *   i.e.               k * gross = debt,  k = 1 - maintenanceBps / 10000
 *
 * Split both sides into a USDG part and an NVDA part, reconstructed from the
 * live metrics at the price the engine used for them (P0):
 *
 *   long   assets: q NVDA (+ any USDG left in the account), debt: USDG
 *   short  assets: USDG, debt: d NVDA
 *
 *   k * (A_usd + A_nvda * P) = D_usd + D_nvda * P
 *   P = (D_usd - k * A_usd) / (k * A_nvda - D_nvda)
 *
 * An estimate, labelled as one everywhere: interest keeps accruing, exchange
 * rates move, and liquidation eligibility has edge cases the guide says to
 * leave to `isLiquidatable`. The guide's own fork measurement (-11.81% long,
 * +12.90% short at 5x) is what this reproduces for a fresh position.
 */
import { formatUnits } from "viem"
import { ROBINHOOD_DECIMALS } from "@/config/robinhood"
import type { RobinhoodPosition } from "./reads"

const usd18 = (v: bigint) => Number(formatUnits(v, ROBINHOOD_DECIMALS.usd18))

export function estimateLiquidationPrice(
  p: Pick<RobinhoodPosition, "direction" | "metrics" | "positionUnderlying">,
  nvdaPriceUsd18: bigint | null,
  maintenanceBps: number | null,
): number | null {
  const m = p.metrics
  if (!m || nvdaPriceUsd18 === null || nvdaPriceUsd18 <= 0n || maintenanceBps === null) return null
  const p0 = usd18(nvdaPriceUsd18)
  const gross = usd18(m.grossAssetValueUsd18)
  const debt = usd18(m.debtValueUsd18)
  if (debt <= 0) return null
  const k = 1 - maintenanceBps / 10_000

  let aUsd: number
  let aNvda: number
  let dUsd: number
  let dNvda: number
  if (p.direction === "long") {
    aNvda = p.positionUnderlying !== null ? Number(formatUnits(p.positionUnderlying, ROBINHOOD_DECIMALS.NVDA)) : gross / p0
    aUsd = Math.max(0, gross - aNvda * p0)
    dUsd = debt
    dNvda = 0
  } else {
    aUsd = gross
    aNvda = 0
    dUsd = 0
    dNvda = debt / p0
  }
  const denom = k * aNvda - dNvda
  if (denom === 0) return null
  const price = (dUsd - k * aUsd) / denom
  return Number.isFinite(price) && price > 0 ? price : null
}

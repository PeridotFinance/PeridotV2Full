/**
 * "What if NVDA moves?" for a position that has not been opened yet: the
 * estimate the trade ticket shows while the user drags a price move.
 *
 * A fresh position, margin m (USD) at leverage L, price move r:
 *
 *   long   holds L*m of NVDA, owes (L-1)*m of USDG
 *          equity = m + L*m*r                     exposure L
 *   short  holds L*m of USDG (margin + sale), owes (L-1)*m of NVDA
 *          equity = m - (L-1)*m*r                 exposure L-1
 *
 * Liquidation is the same rule lib/robinhood/liquidation.ts applies to a live
 * position (maintenance measured against gross assets, k = 1 - mm):
 *
 *   long   k*L*m*(1+r) = (L-1)*m     ->  1+r = (L-1) / (k*L)
 *   short  k*L*m = (L-1)*m*(1+r)     ->  1+r = k*L / (L-1)
 *
 * Fees are the open fee plus the close fee on the size. Interest, the fill
 * and the swap are left out, which is why every surface calls this an
 * estimate. The live position card switches to the engine's own numbers.
 */

export type ScenarioDirection = "long" | "short"

export interface ScenarioInput {
  direction: ScenarioDirection
  marginUsd: number
  leverage: number
  maintenanceBps: number | null
  openFeeBps: number | null
  closeFeeBps: number | null
}

export interface ScenarioPoint {
  /** Price move as a fraction, 0.05 = +5%. */
  move: number
  pnlUsd: number
  /** P&L over the margin, percent. */
  pnlPct: number
  /** Past the liquidation estimate: the numbers stop meaning much there. */
  liquidated: boolean
}

/** How many dollars of P&L one dollar of margin makes per unit of price move. */
export function exposureMultiple(direction: ScenarioDirection, leverage: number): number {
  return direction === "long" ? leverage : Math.max(0, leverage - 1)
}

/**
 * The price move (fraction) at which the fresh position reaches maintenance,
 * or null when it cannot (no debt, or no maintenance figure to go by).
 */
export function liquidationMove(direction: ScenarioDirection, leverage: number, maintenanceBps: number | null): number | null {
  if (maintenanceBps === null || !Number.isFinite(leverage) || leverage <= 1) return null
  const k = 1 - maintenanceBps / 10_000
  if (k <= 0) return null
  const ratio = direction === "long" ? (leverage - 1) / (k * leverage) : (k * leverage) / (leverage - 1)
  const move = ratio - 1
  return Number.isFinite(move) ? move : null
}

export function feesUsd(input: Pick<ScenarioInput, "marginUsd" | "leverage" | "openFeeBps" | "closeFeeBps">): number {
  const size = input.marginUsd * input.leverage
  return (size * ((input.openFeeBps ?? 0) + (input.closeFeeBps ?? 0))) / 10_000
}

export function scenarioAt(input: ScenarioInput, move: number): ScenarioPoint {
  const { direction, marginUsd, leverage } = input
  const liq = liquidationMove(direction, leverage, input.maintenanceBps)
  const liquidated = liq !== null && (direction === "long" ? move <= liq : move >= liq)
  const sign = direction === "long" ? 1 : -1
  const raw = sign * exposureMultiple(direction, leverage) * marginUsd * move - feesUsd(input)
  // Equity cannot go below zero for the trader: the margin is the most at stake.
  const pnlUsd = Math.max(-marginUsd, raw)
  return { move, pnlUsd, pnlPct: marginUsd > 0 ? (pnlUsd / marginUsd) * 100 : 0, liquidated }
}

export type RiskMood = "calm" | "balanced" | "bold" | "wild"

/**
 * A word for how close liquidation sits, from the size of the move that
 * reaches it. It says the same thing the leverage number does, in a form a
 * first-time trader reads without knowing what 3.5x means.
 */
export function riskMood(liqMove: number | null): RiskMood {
  if (liqMove === null) return "calm"
  const d = Math.abs(liqMove)
  if (d >= 0.3) return "calm"
  if (d >= 0.18) return "balanced"
  if (d >= 0.1) return "bold"
  return "wild"
}

export const RISK_MOOD_LABEL: Record<RiskMood, string> = {
  calm: "Relaxed",
  balanced: "Balanced",
  bold: "Bold",
  wild: "Wild",
}

/**
 * Liquidation warnings — who gets told what, and when they get told it again.
 *
 * A leveraged position can be closed out at any hour, and until now the only
 * place that fact appeared was a coloured badge in a table nobody is looking at.
 * The always-on keeper covers the levels a trader CHOSE (take-profit, stop-loss);
 * it has nothing to say about the one the market chooses for them.
 *
 * The rules here are all about not becoming noise, because an alert people mute
 * is worse than no alert:
 *
 *   Two levels, not a stream. `caution` is "this needs watching", `critical` is
 *   "act now". Each fires at most once per position per level.
 *
 *   Escalation only. A position that already sent `caution` sends `critical` if
 *   it gets worse; it does not re-send `caution` on every poll in between.
 *
 *   Re-arming needs real recovery, not a flicker. A level only becomes sendable
 *   again once health has climbed clear of its threshold by `HYSTERESIS` —
 *   otherwise a position sitting exactly on 1.10 would alternate above and below
 *   it every tick and alert forever.
 *
 *   A health we couldn't read is not a health of zero. `healthUnknown` is the
 *   oracle briefly failing to price the pair; alerting on it would wake people
 *   up over an RPC hiccup.
 *
 * Pure and state-in/state-out, so the same decision runs client-side (while the
 * page is open) and server-side (the cron pass, where "delivered" is a table).
 */

/** HF below this is "near liquidation" — the loudest thing we say. */
export const MARGIN_HEALTH_CRITICAL = 1.1
/** HF below this is worth a heads-up. Mirrors the positions table's badge steps. */
export const MARGIN_HEALTH_CAUTION = 1.5
/** How far health must recover before a level can fire again. */
export const RISK_ALERT_HYSTERESIS = 0.05

export type RiskLevel = "caution" | "critical"

const RANK: Record<RiskLevel, number> = { caution: 1, critical: 2 }
const THRESHOLD: Record<RiskLevel, number> = {
  caution: MARGIN_HEALTH_CAUTION,
  critical: MARGIN_HEALTH_CRITICAL,
}

export interface RiskWatchPosition {
  id: string
  side: "Long" | "Short" | null
  healthFactor: number
  /** The oracle couldn't price the pair — the health value is meaningless. */
  healthUnknown?: boolean
  /** Price at which it gets closed out, for copy that names a number. */
  liqPriceUsd?: number | null
}

export interface RiskAlert {
  positionId: string
  level: RiskLevel
  healthFactor: number
  title: string
  body: string
}

/** Level a position is in right now, or null when it is comfortable. */
export function riskLevelFor(p: RiskWatchPosition): RiskLevel | null {
  if (p.healthUnknown || !Number.isFinite(p.healthFactor)) return null
  if (p.healthFactor < MARGIN_HEALTH_CRITICAL) return "critical"
  if (p.healthFactor < MARGIN_HEALTH_CAUTION) return "caution"
  return null
}

function copyFor(p: RiskWatchPosition, level: RiskLevel): { title: string; body: string } {
  const what = p.side ? `${p.side.toLowerCase()} position` : "position"
  const at = p.liqPriceUsd != null && p.liqPriceUsd > 0 ? ` at $${p.liqPriceUsd.toFixed(4)}` : ""
  // Both ways out, in the order of preference: adding margin is reversible,
  // closing is not, and doing nothing is the only option that ends with someone
  // else picking the price.
  return level === "critical"
    ? {
        title: `Your ${what} is close to liquidation`,
        body: `Health ${p.healthFactor.toFixed(2)} — it gets closed out${at}. Add margin or close it yourself.`,
      }
    : {
        title: `Your ${what} is losing room`,
        body: `Health ${p.healthFactor.toFixed(2)} — the price is moving against it${at ? `, liquidation${at}` : ""}.`,
      }
}

/**
 * Decide what to send, and what the delivery record looks like afterwards.
 *
 * `delivered` maps positionId → the most severe level already sent for it. The
 * returned record is the one to persist: positions that closed are dropped from
 * it (their ids never come back, and keeping them would grow the row forever),
 * and positions that recovered have their record lowered so a later dip alerts
 * again.
 */
export function decideRiskAlerts(params: {
  positions: RiskWatchPosition[]
  delivered: Record<string, RiskLevel | undefined>
}): { alerts: RiskAlert[]; delivered: Record<string, RiskLevel> } {
  const alerts: RiskAlert[] = []
  const next: Record<string, RiskLevel> = {}

  for (const p of params.positions) {
    const previous = params.delivered[p.id]
    const level = riskLevelFor(p)

    if (level == null) {
      // Comfortable. Keep no record at all — anything sent before has been
      // earned back, and the next dip is news again.
      continue
    }

    if (previous && RANK[previous] >= RANK[level]) {
      // Already told them this, or worse. The record only drops when health has
      // recovered clear of the level's threshold — not the moment it wobbles
      // one hundredth above it.
      const recovered = p.healthFactor >= THRESHOLD[previous] + RISK_ALERT_HYSTERESIS
      next[p.id] = recovered ? level : previous
      continue
    }

    const copy = copyFor(p, level)
    alerts.push({ positionId: p.id, level, healthFactor: p.healthFactor, title: copy.title, body: copy.body })
    next[p.id] = level
  }

  return { alerts, delivered: next }
}

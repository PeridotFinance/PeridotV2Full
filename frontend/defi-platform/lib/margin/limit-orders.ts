/**
 * Limit orders — server side of the off-chain order book.
 *
 * See scripts/migration_margin_limit_orders.sql for the model and the status
 * machine. Everything here is keyed by the owning address; the route has
 * already proven ownership (`authorizeStellarAddress`) before calling in, and
 * every write repeats `user_address = …` in its WHERE so a bug up the stack
 * cannot turn one trader's cancel into another's.
 */
import { sql } from "@/lib/database"

export type LimitOrderSide = "Long" | "Short"
export type LimitOrderStatus = "open" | "filled" | "failed" | "cancelled" | "expired"

export interface LimitOrderRow {
  id: number
  user_address: string
  network: string
  side: LimitOrderSide
  collateral_usdt: number
  leverage: number
  limit_price_usd: number
  slippage_bps: number
  take_profit_usd: number | null
  stop_loss_usd: number | null
  status: LimitOrderStatus
  expires_at: string
  position_id: string | null
  fail_reason: string | null
  fired_price_usd: number | null
  created_at: string
  updated_at: string
  settled_at: string | null
}

export interface CreateLimitOrderInput {
  userAddress: string
  network?: string
  side: LimitOrderSide
  collateralUsdt: number
  leverage: number
  limitPriceUsd: number
  slippageBps: number
  takeProfitUsd?: number | null
  stopLossUsd?: number | null
  expiresAt: Date
}

/** Resting orders a trader may hold at once — a cap on the monitor's work, not a product limit. */
export const MAX_OPEN_LIMIT_ORDERS = 10

const COLUMNS = sql`
  id, user_address, network, side,
  collateral_usdt::float8 AS collateral_usdt,
  leverage,
  limit_price_usd::float8 AS limit_price_usd,
  slippage_bps,
  take_profit_usd::float8 AS take_profit_usd,
  stop_loss_usd::float8 AS stop_loss_usd,
  status, expires_at, position_id, fail_reason,
  fired_price_usd::float8 AS fired_price_usd,
  created_at, updated_at, settled_at
`

export async function createLimitOrder(input: CreateLimitOrderInput): Promise<LimitOrderRow | "too_many"> {
  const network = input.network || "testnet"
  const [{ n }] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM margin_limit_orders
    WHERE user_address = ${input.userAddress} AND network = ${network} AND status = 'open'
  `
  if (n >= MAX_OPEN_LIMIT_ORDERS) return "too_many"
  const [row] = await sql<LimitOrderRow[]>`
    INSERT INTO margin_limit_orders
      (user_address, network, side, collateral_usdt, leverage, limit_price_usd, slippage_bps,
       take_profit_usd, stop_loss_usd, expires_at)
    VALUES
      (${input.userAddress}, ${network}, ${input.side}, ${input.collateralUsdt}, ${input.leverage},
       ${input.limitPriceUsd}, ${input.slippageBps}, ${input.takeProfitUsd ?? null}, ${input.stopLossUsd ?? null},
       ${input.expiresAt})
    RETURNING ${COLUMNS}
  `
  return row
}

/**
 * Open orders plus recently settled ones (so a fill or a failure is still on
 * screen when the trader comes back). Expiry is applied here, lazily: an open
 * row past its `expires_at` is flipped before it is returned, so no reader
 * ever sees a resting order that could no longer fire.
 */
export async function listLimitOrders(userAddress: string, network = "testnet"): Promise<LimitOrderRow[]> {
  await sql`
    UPDATE margin_limit_orders
    SET status = 'expired', settled_at = now(), updated_at = now()
    WHERE user_address = ${userAddress} AND network = ${network}
      AND status = 'open' AND expires_at <= now()
  `
  return sql<LimitOrderRow[]>`
    SELECT ${COLUMNS} FROM margin_limit_orders
    WHERE user_address = ${userAddress} AND network = ${network}
      AND (status = 'open' OR settled_at > now() - interval '3 days')
    ORDER BY (status = 'open') DESC, created_at DESC
    LIMIT 50
  `
}

export interface SettleLimitOrderInput {
  id: number
  userAddress: string
  status: Exclude<LimitOrderStatus, "open" | "expired">
  positionId?: string | null
  failReason?: string | null
  firedPriceUsd?: number | null
}

/**
 * Move an order out of `open`. Only `open` rows move, and only for their owner —
 * settling an already-settled order is a no-op that returns null, which is what
 * the monitor wants when two tabs race on the same order.
 *
 * A failed order the trader dismisses becomes `cancelled`.
 */
export async function settleLimitOrder(input: SettleLimitOrderInput): Promise<LimitOrderRow | null> {
  // Which rows may move:
  //   filled     the CLAIM — from `open` only, so a second tab gets 409. With a
  //              positionId it is the annotation that follows a landed open, and
  //              that one may touch an already-filled row.
  //   failed     from `open` (pre-flight refusal) or `filled` (claimed, open died)
  //   cancelled  from `open` (withdrawn) or `failed` (dismissed)
  const from =
    input.status === "cancelled" ? sql`status IN ('open', 'failed')`
    : input.status === "failed" ? sql`status IN ('open', 'filled')`
    : input.positionId ? sql`status IN ('open', 'filled')`
    : sql`status = 'open'`
  const [row] = await sql<LimitOrderRow[]>`
    UPDATE margin_limit_orders
    SET status = ${input.status},
        position_id = COALESCE(${input.positionId ?? null}, position_id),
        fail_reason = ${input.failReason ?? null},
        fired_price_usd = COALESCE(${input.firedPriceUsd ?? null}, fired_price_usd),
        settled_at = now(),
        updated_at = now()
    WHERE id = ${input.id} AND user_address = ${input.userAddress} AND ${from}
    RETURNING ${COLUMNS}
  `
  return row ?? null
}

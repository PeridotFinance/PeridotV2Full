/**
 * Server-side helper for the Stellar margin trade journal (`margin_stellar_trades`).
 *
 * Live positions are on-chain; this is the persistent historical layer the contract
 * doesn't expose.
 *
 * Entry and exit prices are the prices the swaps actually FILLED at, supplied by
 * the caller that ran them (or derived here from the swap's raw legs). The price
 * feed is only a last resort: it is a different price domain than the Aquarius
 * pool the trade executes against — on testnet the two have sat ~9% apart — and
 * pairing one domain's entry with the other's exit books PnL the trader never
 * made. The flat $1 testnet oracle is never used for either.
 *
 * Used only from server routes (`app/api/margin/journal`). Never import into client
 * code — it touches the DB and the price feed directly.
 */
import { sql } from "@/lib/database"
import { computeRealizedPnl, executionExitPrice } from "@/app/app/margin/lib/marginMath"
import { STELLAR_MARGIN_CONFIG as MARGIN_CFG } from "@/app/app/margin/config/stellarMarginConfig"

export { computeRealizedPnl }

export type MarginEventType = "open" | "close" | "cancel" | "collateral_in" | "collateral_out" | "tpsl_set" | "repay"

export interface MarginTradeInput {
  userAddress: string
  positionId: string
  eventType: MarginEventType
  side?: "Long" | "Short"
  collateralSymbol?: string
  collateralAmount?: number
  positionSymbol?: string
  positionAmount?: number
  borrowAmount?: number
  /** XLM-denominated exposure used for PnL (long → position XLM, short → debt XLM). */
  xlmAmount?: number
  leverageX100?: number
  /** Optional client-supplied entry price; server stamps from the feed if absent. */
  entryPriceUsd?: number
  /** Optional client-supplied exit price (the closing swap's fill); server stamps
   *  from the feed if absent. */
  exitPriceUsd?: number
  /** Raw legs of the closing swap, for callers that can read them but can't price
   *  them (the recovery paths, which know the pending's `collateral_underlying`
   *  and `received_debt_asset` but not the position's side). Base units. */
  exitSwapInRaw?: string
  exitSwapOutRaw?: string
  /** Optional take-profit / stop-loss trigger prices (XLM/USD), set at open. */
  takeProfitUsd?: number
  stopLossUsd?: number
  hfBps?: number
  txHash?: string
  network?: string
}

export interface MarginTradeRow {
  id: number
  user_address: string
  position_id: string
  event_type: MarginEventType
  side: "Long" | "Short" | null
  collateral_symbol: string | null
  collateral_amount: number | null
  position_symbol: string | null
  position_amount: number | null
  borrow_amount: number | null
  xlm_amount: number | null
  leverage_x100: number | null
  entry_price_usd: number | null
  /** Market (feed) price at open — the chart's domain. See the column comment in
   *  `scripts/migration_margin_trades.sql`. Open rows only. */
  feed_price_usd: number | null
  exit_price_usd: number | null
  realized_pnl_usd: number | null
  take_profit_usd: number | null
  stop_loss_usd: number | null
  hf_bps: number | null
  tx_hash: string | null
  network: string
  created_at: string
}

export interface ClosedPosition {
  positionId: string
  side: "Long" | "Short" | null
  leverageX100: number | null
  xlmAmount: number | null
  entryPriceUsd: number | null
  exitPriceUsd: number | null
  realizedPnlUsd: number | null
  openedAt: string | null
  closedAt: string
  txHash: string | null
}

/** Single XLM/USD spot, used to stamp entry (open) and exit (close) prices. */
export async function fetchXlmSpot(): Promise<number | null> {
  try {
    const res = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=XLMUSDT", {
      signal: AbortSignal.timeout(5000),
    })
    if (res.ok) {
      const j = (await res.json()) as { price?: string }
      const p = Number(j?.price)
      if (Number.isFinite(p) && p > 0) return p
    }
  } catch {
    /* fall through to CoinGecko */
  }
  try {
    const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=usd", {
      signal: AbortSignal.timeout(5000),
    })
    if (res.ok) {
      const j = (await res.json()) as { stellar?: { usd?: number } }
      const p = Number(j?.stellar?.usd)
      if (Number.isFinite(p) && p > 0) return p
    }
  } catch {
    /* give up — caller stores null */
  }
  return null
}

const num = (v: number | undefined): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null)

/**
 * The market price to stamp when no execution price is available.
 *
 * The venue first, the feed only if the venue can't be read. Every price this
 * table already holds is an Aquarius fill, and the pool has sat ~9% from spot on
 * testnet — a feed price dropped in among them doesn't approximate the missing
 * fill, it lands in a different market. The feed stays as the final fallback
 * because a row with no price at all drops the trade out of PnL entirely.
 */
async function marketMark(): Promise<number | null> {
  const { fetchXlmPoolMid } = await import("@/lib/margin/pool-price")
  return (await fetchXlmPoolMid()) ?? (await fetchXlmSpot())
}

/** Base-units string → bigint, 0 on anything unparseable. */
const toBig = (v: string | undefined): bigint => {
  if (!v) return BigInt(0)
  try {
    return BigInt(v)
  } catch {
    return BigInt(0)
  }
}

/** Insert one trade event (idempotent on tx_hash). Returns the new row id, or null on dedup. */
export async function recordMarginTrade(input: MarginTradeInput): Promise<{ id: number | null }> {
  const network = input.network || "testnet"

  // A position closes exactly once, but several independent writers race to
  // journal it: the close hook, the pending-close recovery path, the "debt is
  // already 0" shortcut, and the server keeper — plus the client now retries a
  // dropped response, which can re-send a write that actually landed. Only the
  // keeper supplies a tx_hash, so the ON CONFLICT (tx_hash) guard below can't
  // dedup any of them. Key close events on the position instead: first writer
  // wins, later ones are no-ops, so History can never show the same close twice.
  if (input.eventType === "close") {
    const existing = (await sql`
      SELECT id FROM margin_stellar_trades
      WHERE position_id = ${input.positionId}
        AND user_address = ${input.userAddress}
        AND network = ${network}
        AND event_type = 'close'
      LIMIT 1
    `) as unknown as Array<{ id: number }>
    if (existing[0]) return { id: existing[0].id }
  }

  let entry = num(input.entryPriceUsd)
  let exit: number | null = null
  let pnl: number | null = null
  // Second, independent price on an open: where the real market was, so the
  // chart can draw the entry line among its own candles. Stamped here rather
  // than accepted from the client because the server already owns this feed and
  // the client's copy is a cached chart tick. Never blocks the write — a null
  // just falls the chart back to the fill price it draws today.
  let feed: number | null = null

  if (input.eventType === "open") {
    if (entry == null) entry = await marketMark()
    feed = await fetchXlmSpot()
  }

  // A partial repayment on a SHORT closes part of the trade: the debt IS the XLM
  // exposure, so repaying 40 XLM realizes (entry − mark) × 40 right then. Stamp
  // the mark as this slice's exit and book its PnL, exactly like a small close.
  // A LONG repays USDT — no exposure changes hands, nothing is realized — so its
  // row carries the amount only and stays out of the PnL arithmetic.
  if (input.eventType === "repay") {
    const opens = (await sql`
      SELECT side, entry_price_usd
      FROM margin_stellar_trades
      WHERE position_id = ${input.positionId}
        AND user_address = ${input.userAddress}
        AND event_type = 'open'
      ORDER BY created_at ASC
      LIMIT 1
    `) as unknown as Array<{ side: "Long" | "Short" | null; entry_price_usd: string | null }>
    const open = opens[0]
    const side = open?.side ?? input.side ?? null
    if (open?.entry_price_usd != null) entry = Number(open.entry_price_usd)
    if (side === "Short") {
      // No swap runs here — the trader repays XLM they already hold — so there is
      // no fill to read. The pool mid is the price that XLM could have been got
      // for on this venue, which is the domain `entry` came from; spot would book
      // the venue gap as realized profit on every partial repayment.
      exit = await marketMark()
      const repaidXlm = num(input.xlmAmount)
      pnl = computeRealizedPnl({ side, entry, exit, xlmAmount: repaidXlm })
    }
  }

  if (input.eventType === "close") {
    // The open row carries the price the opening swap FILLED at, so the close has
    // to come from the same place or realized PnL is measured pool-entry against
    // feed-exit — a position opened and closed in the same second then books the
    // execution gap as profit or loss it never made. Spot stays as the fallback
    // for the paths that genuinely have no fill to report (an already-settled
    // pending, a keeper close).
    exit = num(input.exitPriceUsd)
    // Pair with the open row to compute realized PnL from a single price domain.
    const opens = (await sql`
      SELECT side, xlm_amount, entry_price_usd, borrow_amount
      FROM margin_stellar_trades
      WHERE position_id = ${input.positionId}
        AND user_address = ${input.userAddress}
        AND event_type = 'open'
      ORDER BY created_at ASC
      LIMIT 1
    `) as unknown as Array<{
      side: "Long" | "Short" | null
      xlm_amount: string | null
      entry_price_usd: string | null
      borrow_amount: string | null
    }>
    const open = opens[0]
    if (open) {
      entry = open.entry_price_usd != null ? Number(open.entry_price_usd) : null

      // Second-best source for the exit: the swap's raw legs, which the recovery
      // paths CAN read off the pending (`collateral_underlying` in,
      // `received_debt_asset` out) even though they never saw the swap happen.
      // That is the exact fill, not a re-quote of a pool that has moved since —
      // it just needs the side, which only the open row knows, hence down here.
      if (exit == null) {
        const side = open.side ?? input.side ?? null
        const inRaw = toBig(input.exitSwapInRaw)
        const outRaw = toBig(input.exitSwapOutRaw)
        if (side && inRaw > BigInt(0) && outRaw > BigInt(0)) {
          exit = executionExitPrice({
            side,
            positionUnderlying: inRaw,
            proceeds: outRaw,
            usdtDecimals: MARGIN_CFG.assets.MOCK_USDT.decimals,
            xlmDecimals: MARGIN_CFG.assets.XLM.decimals,
          })
        }
      }
      // Last resort: no fill recoverable at all. Still the venue's price rather
      // than the feed's, so it at least sits in the same market as the entry.
      if (exit == null) exit = await marketMark()

      // Partial repayments made while the position was open already paid down part
      // of the debt — and, on a Short, already closed part of the exposure at an
      // earlier mark. Both have to come off the open row's figures or the close
      // books a trade that no longer matches what was actually held.
      const repays = (await sql`
        SELECT COALESCE(SUM(borrow_amount), 0)     AS repaid_debt,
               COALESCE(SUM(xlm_amount), 0)        AS repaid_xlm,
               COALESCE(SUM(realized_pnl_usd), 0)  AS repaid_pnl
        FROM margin_stellar_trades
        WHERE position_id = ${input.positionId}
          AND user_address = ${input.userAddress}
          AND network = ${network}
          AND event_type = 'repay'
      `) as unknown as Array<{ repaid_debt: string; repaid_xlm: string; repaid_pnl: string }>
      const repaidDebt = Number(repays[0]?.repaid_debt ?? 0)
      const repaidXlm = Number(repays[0]?.repaid_xlm ?? 0)
      const repaidPnl = Number(repays[0]?.repaid_pnl ?? 0)

      // Exposure still held at close. Only a Short's shrinks — a Long's XLM
      // collateral is untouched by a USDT repayment.
      const openXlm = open.xlm_amount != null ? Number(open.xlm_amount) : num(input.xlmAmount)
      const xlm =
        openXlm != null && open.side === "Short" ? Math.max(0, openXlm - repaidXlm) : openXlm

      // Borrow interest paid over the position's life. The close event carries the
      // debt actually repaid at close (on-chain, interest included) in
      // `borrowAmount`; the open row carries what was originally drawn. The drift
      // between them is the cost — priced in XLM for a Short (debt is XLM), ≈$1
      // for a Long (USDT). Anything repaid mid-life counts toward what was paid
      // back, otherwise a repaid position looks like it accrued negative interest.
      // Either side missing (e.g. a keeper close, which has no debt read) → no
      // interest term, i.e. the old price-only figure.
      const borrowedAtOpen = open.borrow_amount != null ? Number(open.borrow_amount) : null
      const repaidAtClose = num(input.borrowAmount)
      let interestUsd: number | null = null
      if (borrowedAtOpen != null && borrowedAtOpen > 0 && repaidAtClose != null && exit != null) {
        const accrued = Math.max(0, repaidAtClose + repaidDebt - borrowedAtOpen)
        interestUsd = accrued * (open.side === "Short" ? exit : 1)
      }

      const remaining = computeRealizedPnl({ side: open.side, entry, exit, xlmAmount: xlm, interestUsd })
      // History reports one number per trade, so the slices closed by earlier
      // repayments belong in it alongside what the remainder made.
      pnl = remaining != null ? remaining + repaidPnl : remaining
    }
    // No open row at all (a close journaled for a position this account never
    // recorded opening): nothing to derive a side from — but the row still needs
    // a price rather than a hole.
    if (exit == null) exit = await marketMark()
  }

  const rows = (await sql`
    INSERT INTO margin_stellar_trades (
      user_address, position_id, event_type, side,
      collateral_symbol, collateral_amount, position_symbol, position_amount,
      borrow_amount, xlm_amount, leverage_x100,
      entry_price_usd, feed_price_usd, exit_price_usd, realized_pnl_usd,
      take_profit_usd, stop_loss_usd, hf_bps,
      tx_hash, network
    ) VALUES (
      ${input.userAddress}, ${input.positionId}, ${input.eventType}, ${input.side ?? null},
      ${input.collateralSymbol ?? null}, ${num(input.collateralAmount)}, ${input.positionSymbol ?? null}, ${num(input.positionAmount)},
      ${num(input.borrowAmount)}, ${num(input.xlmAmount)}, ${num(input.leverageX100)},
      ${entry}, ${feed}, ${exit}, ${pnl},
      ${num(input.takeProfitUsd)}, ${num(input.stopLossUsd)}, ${num(input.hfBps)},
      ${input.txHash ?? null}, ${network}
    )
    ON CONFLICT (tx_hash) WHERE tx_hash IS NOT NULL DO NOTHING
    RETURNING id
  `) as unknown as Array<{ id: number }>

  return { id: rows[0]?.id ?? null }
}

const toNum = (v: string | number | null): number | null =>
  v == null ? null : typeof v === "number" ? v : Number(v)

function mapRow(r: Record<string, unknown>): MarginTradeRow {
  return {
    id: Number(r.id),
    user_address: String(r.user_address),
    position_id: String(r.position_id),
    event_type: r.event_type as MarginEventType,
    side: (r.side as "Long" | "Short" | null) ?? null,
    collateral_symbol: (r.collateral_symbol as string | null) ?? null,
    collateral_amount: toNum(r.collateral_amount as string | null),
    position_symbol: (r.position_symbol as string | null) ?? null,
    position_amount: toNum(r.position_amount as string | null),
    borrow_amount: toNum(r.borrow_amount as string | null),
    xlm_amount: toNum(r.xlm_amount as string | null),
    leverage_x100: toNum(r.leverage_x100 as string | null),
    entry_price_usd: toNum(r.entry_price_usd as string | null),
    feed_price_usd: toNum(r.feed_price_usd as string | null),
    exit_price_usd: toNum(r.exit_price_usd as string | null),
    realized_pnl_usd: toNum(r.realized_pnl_usd as string | null),
    take_profit_usd: toNum(r.take_profit_usd as string | null),
    stop_loss_usd: toNum(r.stop_loss_usd as string | null),
    hf_bps: toNum(r.hf_bps as string | null),
    tx_hash: (r.tx_hash as string | null) ?? null,
    network: String(r.network),
    created_at: String(r.created_at),
  }
}

/** Hard cap on how many open-position ids one request may pin — far above the
 *  number of positions a single account can realistically hold open. */
const MAX_PINNED_POSITIONS = 50

/**
 * Reverse-chronological event log for the Trades tab.
 *
 * `openPositionIds` pins positions that are still open on-chain: ALL of their
 * rows are returned regardless of the newest-200 window. Without this, an
 * active trader's older position scrolls its `open` row out of the window, and
 * everything the client derives from that row — entry price, TP/SL triggers,
 * debt basis, entry leverage — silently degrades to a fallback. The union stays
 * small: open positions are few and each carries a handful of events.
 */
export async function listMarginTrades(
  userAddress: string,
  network = "testnet",
  openPositionIds: string[] = [],
): Promise<MarginTradeRow[]> {
  const ids = openPositionIds.slice(0, MAX_PINNED_POSITIONS)
  const rows = (await sql`
    SELECT * FROM (
      SELECT * FROM margin_stellar_trades
      WHERE user_address = ${userAddress} AND network = ${network}
      ORDER BY created_at DESC, id DESC
      LIMIT 200
    ) recent
    ${ids.length ? sql`
    UNION
    SELECT * FROM margin_stellar_trades
    WHERE user_address = ${userAddress} AND network = ${network}
      AND position_id = ANY(${ids}::text[])
    ` : sql``}
    ORDER BY created_at DESC, id DESC
  `) as unknown as Array<Record<string, unknown>>
  return rows.map(mapRow)
}

/** Closed positions (one row per close, with its open's entry + realized PnL). */
export async function listClosedPositions(userAddress: string, network = "testnet"): Promise<ClosedPosition[]> {
  const rows = (await sql`
    SELECT
      c.position_id,
      c.side,
      c.leverage_x100,
      c.xlm_amount,
      c.exit_price_usd,
      c.realized_pnl_usd,
      c.created_at      AS closed_at,
      c.tx_hash,
      o.entry_price_usd,
      o.created_at      AS opened_at
    FROM margin_stellar_trades c
    LEFT JOIN LATERAL (
      SELECT entry_price_usd, created_at
      FROM margin_stellar_trades o
      WHERE o.position_id = c.position_id
        AND o.user_address = c.user_address
        AND o.event_type = 'open'
      ORDER BY o.created_at ASC
      LIMIT 1
    ) o ON TRUE
    WHERE c.user_address = ${userAddress}
      AND c.network = ${network}
      AND c.event_type = 'close'
    ORDER BY c.created_at DESC, c.id DESC
    LIMIT 100
  `) as unknown as Array<Record<string, unknown>>

  return rows.map((r) => ({
    positionId: String(r.position_id),
    side: (r.side as "Long" | "Short" | null) ?? null,
    leverageX100: toNum(r.leverage_x100 as string | null),
    xlmAmount: toNum(r.xlm_amount as string | null),
    entryPriceUsd: toNum(r.entry_price_usd as string | null),
    exitPriceUsd: toNum(r.exit_price_usd as string | null),
    realizedPnlUsd: toNum(r.realized_pnl_usd as string | null),
    openedAt: r.opened_at ? String(r.opened_at) : null,
    closedAt: String(r.closed_at),
    txHash: (r.tx_hash as string | null) ?? null,
  }))
}

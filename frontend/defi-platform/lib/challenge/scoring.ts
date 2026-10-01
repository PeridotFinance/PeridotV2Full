/**
 * Trading-challenge scoring — pure functions over journal rows.
 *
 * Deliberately free of any DB, network or clock access: the reconcile job hands
 * it rows it already loaded, and the tests hand it hand-written ones. Prize money
 * is on the line, so the rules that decide who wins have to be executable in a
 * unit test rather than only observable in production.
 *
 * Input rows are `margin_stellar_trades` in their raw snake_case shape (numerics
 * arrive from `postgres` as strings) — see scripts/migration_margin_trades.sql.
 */

import type { ChallengeScoring } from "@/types/challenge"

/** The subset of margin_stellar_trades scoring needs. Numerics may be strings. */
export interface ChallengeJournalRow {
  position_id: string
  event_type: string
  side?: string | null
  xlm_amount?: string | number | null
  entry_price_usd?: string | number | null
  realized_pnl_usd?: string | number | null
  leverage_x100?: string | number | null
  verified_onchain?: boolean | null
  created_at: string | Date
}

export interface ScoreOptions {
  /** Window bounds, [start, end). Trades outside never score. */
  windowStart: string | Date
  windowEnd: string | Date
  /** Trades — open or closed — needed before the row is ranked. */
  minTrades: number
  /** Count only rows the reconcile job confirmed on chain. */
  requireVerified?: boolean
  /**
   * Current XLM/USD spot. When present, positions that are still open are marked
   * to it and their paper PnL counts toward the score, so a trader is on the
   * board from the moment they open rather than only after they close.
   *
   * Omit it to score realized PnL only. The reconcile job omits it once the
   * challenge is over: after the bell an open position can no longer be banked,
   * and a prize must not be decided by a paper number that keeps moving every
   * time the job runs.
   */
  markPriceUsd?: number
}

export interface ParticipantScore {
  /** The ranking number: realized + unrealized. */
  pnlUsd: number
  /** Banked PnL from closed positions only. */
  realizedPnlUsd: number
  /** Paper PnL of positions still open, marked to `markPriceUsd` (0 without it). */
  unrealizedPnlUsd: number
  pnlPct: number
  volumeUsd: number
  /** Closed positions. Win rate and best trade are computed over these. */
  trades: number
  /** Positions still open at scoring time — live, not yet banked. */
  openTrades: number
  winRatePct: number
  bestTradeUsd: number
  ranked: boolean
}

/**
 * A close that lands less than a minute after its open is not a trade, it is a
 * volume printer. Two accounts (or one account twice) can bounce the same
 * notional back and forth all day and rack up the volume column without ever
 * taking market risk.
 */
const WASH_TRADE_MIN_HOLD_MS = 60_000

/**
 * No single trade may count for more than this share of a participant's volume.
 * Below MIN_TRADES_FOR_VOLUME_CAP every trade is at or above 1/N of the total by
 * construction, so applying the cap there would just shrink honest entrants
 * uniformly instead of clipping an outlier.
 */
const MAX_SINGLE_TRADE_VOLUME_SHARE = 0.2
const MIN_TRADES_FOR_VOLUME_CAP = Math.round(1 / MAX_SINGLE_TRADE_VOLUME_SHARE)

const n = (v: string | number | null | undefined): number => {
  if (v == null) return 0
  const x = typeof v === "number" ? v : Number(v)
  return Number.isFinite(x) ? x : 0
}

const ms = (v: string | Date): number => (v instanceof Date ? v.getTime() : new Date(v).getTime())

interface PositionAggregate {
  openedAt: number
  closedAt: number | null
  /** Notional at open, USD. */
  volumeUsd: number
  /** Collateral the position tied up, USD (notional / leverage). */
  collateralUsd: number
  realizedPnlUsd: number
  closed: boolean
  cancelled: boolean
  /** Mark-to-market inputs, from the `open` row. */
  side: "Long" | "Short"
  xlmAmount: number
  entryPriceUsd: number
}

/**
 * Score one participant's journal rows for one challenge window.
 *
 * Formula:
 *   volumeUsd = Σ (xlm_amount × entry_price_usd) over qualifying `open` rows,
 *               each capped at MAX_SINGLE_TRADE_VOLUME_SHARE of the raw total
 *   realized  = Σ realized_pnl_usd over qualifying closed positions, counting
 *               both the `close` row and any `repay` slices it netted out.
 *   unrealized= Σ mark-to-market of positions still open, when a markPriceUsd
 *               is supplied (Long: xlm × (mark − entry), Short: the inverse)
 *   pnlUsd    = realized + unrealized
 *   pnlPct    = pnlUsd / peak concurrently deployed collateral × 100
 *   trades    = qualifying closed positions; openTrades = the ones still running
 */
export function scoreParticipant(
  rows: ChallengeJournalRow[],
  opts: ScoreOptions,
): ParticipantScore {
  const empty: ParticipantScore = {
    pnlUsd: 0,
    realizedPnlUsd: 0,
    unrealizedPnlUsd: 0,
    pnlPct: 0,
    volumeUsd: 0,
    trades: 0,
    openTrades: 0,
    winRatePct: 0,
    bestTradeUsd: 0,
    ranked: false,
  }
  if (!rows?.length) return empty

  const from = ms(opts.windowStart)
  const to = ms(opts.windowEnd)

  const positions = new Map<string, PositionAggregate>()

  for (const row of rows) {
    const at = ms(row.created_at)
    // The window is the contest. A trade opened before the gun or closed after
    // the bell is somebody's normal trading, not an entry.
    if (!Number.isFinite(at) || at < from || at >= to) continue

    // Anti-abuse: a row whose tx hash could not be found on chain is a claim,
    // not a trade. The journal is written client-side at tx-success time, so a
    // participant chasing the prize could POST fabricated wins; the reconcile
    // job stamps verified_onchain and this drops everything it did not confirm.
    if (opts.requireVerified && row.verified_onchain !== true) continue

    const id = row.position_id
    if (!id) continue
    let p = positions.get(id)
    if (!p) {
      p = {
        openedAt: at,
        closedAt: null,
        volumeUsd: 0,
        collateralUsd: 0,
        realizedPnlUsd: 0,
        closed: false,
        cancelled: false,
        side: "Long",
        xlmAmount: 0,
        entryPriceUsd: 0,
      }
      positions.set(id, p)
    }

    if (row.event_type === "open") {
      p.openedAt = at
      p.side = row.side === "Short" ? "Short" : "Long"
      p.xlmAmount = n(row.xlm_amount)
      p.entryPriceUsd = n(row.entry_price_usd)
      const notional = n(row.xlm_amount) * n(row.entry_price_usd)
      p.volumeUsd = notional > 0 ? notional : 0
      const lev = n(row.leverage_x100)
      // What the trader actually risked. Leverage is x100 (250 = 2.5x); a
      // missing/zero value means "unlevered", i.e. the notional is the stake.
      p.collateralUsd = lev > 0 ? p.volumeUsd / (lev / 100) : p.volumeUsd
    } else if (row.event_type === "close") {
      p.closed = true
      p.closedAt = at
      p.realizedPnlUsd += n(row.realized_pnl_usd)
    } else if (row.event_type === "repay") {
      // A partial repay on a SHORT closes part of the trade at that moment's
      // mark and books real PnL (lib/margin-journal.ts stamps it). The close row
      // deliberately nets those slices out of its own figure, so summing both is
      // the whole trade, not a double count. Reading only `close` rows would
      // quietly delete the profit of anyone who takes it by paying debt down —
      // on a prize board that is somebody's $100.
      // Longs repay USDT, realize nothing, and carry a null here.
      p.realizedPnlUsd += n(row.realized_pnl_usd)
    } else if (row.event_type === "cancel") {
      // Anti-abuse: a cancelled open never became exposure. Counting it would
      // let anyone farm the volume column by opening and cancelling in a loop,
      // at no risk and near-zero cost.
      p.cancelled = true
    }
  }

  const eligible: PositionAggregate[] = []
  for (const p of positions.values()) {
    if (p.cancelled) continue
    // Anti-abuse: wash trading. Round-tripping a position inside a minute takes
    // no market risk — the price barely moves — but prints full notional into
    // volume and, done between two of your own accounts, can also manufacture a
    // clean string of tiny wins. Drop the position entirely, PnL included, so
    // the pattern is not merely unprofitable but invisible.
    if (p.closed && p.closedAt != null && p.closedAt - p.openedAt < WASH_TRADE_MIN_HOLD_MS) continue
    eligible.push(p)
  }
  if (!eligible.length) return empty

  // ── Volume, with the single-trade cap ────────────────────────────────────
  // Anti-abuse: on testnet the faucet is free, so one participant can open a
  // single absurd notional and own the volume column outright. Capping each
  // trade at a fifth of the raw total means the column can only be won by
  // trading repeatedly, which is the behavior the challenge is trying to reward.
  const contributions = eligible.map((p) => p.volumeUsd).filter((v) => v > 0)
  const rawVolume = contributions.reduce((a, b) => a + b, 0)
  let volumeUsd = rawVolume
  if (contributions.length >= MIN_TRADES_FOR_VOLUME_CAP) {
    const cap = rawVolume * MAX_SINGLE_TRADE_VOLUME_SHARE
    volumeUsd = contributions.reduce((acc, v) => acc + Math.min(v, cap), 0)
  }

  // ── PnL over closed positions ────────────────────────────────────────────
  const closed = eligible.filter((p) => p.closed)
  const realizedPnlUsd = closed.reduce((acc, p) => acc + p.realizedPnlUsd, 0)
  const wins = closed.filter((p) => p.realizedPnlUsd > 0).length
  const trades = closed.length
  const winRatePct = trades > 0 ? (wins / trades) * 100 : 0
  const bestTradeUsd = closed.length ? Math.max(...closed.map((p) => p.realizedPnlUsd)) : 0

  // ── Paper PnL of what is still running ───────────────────────────────────
  // A trade counts from the moment it opens, not from the moment it closes:
  // waiting for the close meant a trader who was holding a position simply did
  // not exist on the board, and the standings went stale for as long as the
  // field was in the market. Marking open positions to market makes the board
  // show the race as it is actually being run.
  //
  // `markPriceUsd` must come from the VENUE these positions trade on, not from a
  // price feed — entry prices are Aquarius fills, and the pool has sat ~9% from
  // spot on testnet, which is far larger than the PnL being ranked and is signed
  // by side (see `fetchXlmPoolMid`).
  //
  // This is deliberately the plain mark-to-market — it ignores borrow interest
  // and the slippage the closing swap will take, so it reads slightly optimistic
  // against what the position would actually bank. It moves the live ordering,
  // never the payout: the reconcile job stops supplying a mark price once the
  // window is over, so the final standings are realized PnL only.
  const open = eligible.filter((p) => !p.closed)
  const mark = n(opts.markPriceUsd)
  let unrealizedPnlUsd = 0
  if (mark > 0) {
    for (const p of open) {
      if (!(p.xlmAmount > 0) || !(p.entryPriceUsd > 0)) continue
      const move = mark - p.entryPriceUsd
      unrealizedPnlUsd += p.side === "Short" ? -move * p.xlmAmount : move * p.xlmAmount
    }
  }
  const pnlUsd = realizedPnlUsd + unrealizedPnlUsd

  // ── Return, relative to the most capital held at risk at any one moment ──
  // Peak concurrent collateral, not the sum: a trader who recycles the same $100
  // through ten positions risked $100, and dividing by $1000 would make a good
  // run look like a mediocre one.
  const peakCollateralUsd = peakConcurrentCollateral(eligible, to)
  const pnlPct = peakCollateralUsd > 0 ? (pnlUsd / peakCollateralUsd) * 100 : 0

  return {
    pnlUsd,
    realizedPnlUsd,
    unrealizedPnlUsd,
    pnlPct,
    volumeUsd,
    trades,
    openTrades: open.length,
    winRatePct,
    bestTradeUsd,
    // An open position is a trade. The gate exists to keep somebody who has
    // never traded out of the ranking, not to keep a trader out until they have
    // closed — so it counts both.
    ranked: trades + open.length >= (opts.minTrades ?? 0),
  }
}

/** Max collateral deployed simultaneously over the window. */
function peakConcurrentCollateral(positions: PositionAggregate[], windowEnd: number): number {
  const events: Array<{ at: number; delta: number }> = []
  for (const p of positions) {
    if (!(p.collateralUsd > 0)) continue
    events.push({ at: p.openedAt, delta: p.collateralUsd })
    // Still open at the bell → it stays deployed to the end of the window.
    events.push({ at: p.closedAt ?? windowEnd, delta: -p.collateralUsd })
  }
  // Releases before additions at the same instant would understate the peak, so
  // sort additions first on ties.
  events.sort((a, b) => a.at - b.at || b.delta - a.delta)

  let running = 0
  let peak = 0
  for (const e of events) {
    running += e.delta
    if (running > peak) peak = running
  }
  return peak
}

export interface RankableRow extends ParticipantScore {
  handle: string
  /** Carried through untouched so callers can map rows back to accounts. */
  accountId?: number
}

export interface RankedRow extends RankableRow {
  rank: number
}

/**
 * Order the field: ranked rows (met minTrades) first by the challenge's metric,
 * unranked below them, ties broken by input order so a refresh does not shuffle
 * equal rows. Unranked rows get rank 0 — they are listed, not placed.
 */
export function rankStandings(scored: RankableRow[], scoring: ChallengeScoring): RankedRow[] {
  const metric = (r: RankableRow): number => {
    if (scoring === "pnl_usd") return r.pnlUsd
    if (scoring === "volume") return r.volumeUsd
    return r.pnlPct
  }

  const ordered = scored
    .map((row, i) => ({ row, i }))
    .sort((a, b) => {
      if (a.row.ranked !== b.row.ranked) return a.row.ranked ? -1 : 1
      const d = metric(b.row) - metric(a.row)
      if (d !== 0) return d
      return a.i - b.i
    })

  let place = 0
  return ordered.map(({ row }) => {
    if (!row.ranked) return { ...row, rank: 0 }
    place += 1
    return { ...row, rank: place }
  })
}

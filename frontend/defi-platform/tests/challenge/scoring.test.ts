/**
 * Challenge scoring — the anti-abuse rules are the point of these tests.
 *
 * Everything here is a rule that decides who gets paid, so each case names the
 * exploit it is defending against rather than just the branch it covers.
 */
import { describe, it, expect } from "vitest"
import {
  scoreParticipant,
  rankStandings,
  type ChallengeJournalRow,
} from "@/lib/challenge/scoring"

const WINDOW_START = "2026-08-11T00:00:00Z"
const WINDOW_END = "2026-08-25T00:00:00Z"

const OPTS = {
  windowStart: WINDOW_START,
  windowEnd: WINDOW_END,
  minTrades: 2,
}

let clock = Date.parse(WINDOW_START) + 3_600_000

/** One open/close pair, `holdMs` apart, at a fixed notional. */
function pair(opts: {
  id: string
  xlm: number
  price?: number
  pnl?: number
  holdMs?: number
  leverage?: number
  verified?: boolean | null
  closed?: boolean
}): ChallengeJournalRow[] {
  const price = opts.price ?? 1
  const holdMs = opts.holdMs ?? 3_600_000
  const openedAt = clock
  clock += holdMs + 60_000
  const verified = opts.verified === undefined ? true : opts.verified

  const rows: ChallengeJournalRow[] = [
    {
      position_id: opts.id,
      event_type: "open",
      side: "Long",
      xlm_amount: opts.xlm,
      entry_price_usd: price,
      leverage_x100: opts.leverage ?? 100,
      verified_onchain: verified,
      created_at: new Date(openedAt).toISOString(),
    },
  ]
  if (opts.closed !== false) {
    rows.push({
      position_id: opts.id,
      event_type: "close",
      side: "Long",
      xlm_amount: opts.xlm,
      realized_pnl_usd: opts.pnl ?? 0,
      verified_onchain: verified,
      created_at: new Date(openedAt + holdMs).toISOString(),
    })
  }
  return rows
}

describe("scoreParticipant", () => {
  it("returns an all-zero, unranked score for no rows", () => {
    const s = scoreParticipant([], OPTS)
    expect(s).toEqual({
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
    })
  })

  it("counts PnL realized through partial repays on a short", () => {
    // A short realizes profit every time it repays debt: lib/margin-journal.ts
    // stamps realized_pnl_usd on the repay row, and the close row nets those
    // slices out of its own figure. Reading only `close` rows would erase the
    // profit of anyone who takes it by paying down — a wrong winner.
    clock = Date.parse(WINDOW_START) + 3_600_000
    const rows = [...pair({ id: "s1", xlm: 100, price: 1, pnl: 4 }), ...pair({ id: "s2", xlm: 100, price: 1, pnl: 1 })]
    const withRepay: ChallengeJournalRow[] = [
      ...rows,
      {
        position_id: "s1",
        event_type: "repay",
        side: "Short",
        realized_pnl_usd: 6,
        verified_onchain: true,
        created_at: new Date(Date.parse(WINDOW_START) + 3_600_000 + 60_000).toISOString(),
      },
    ]
    const s = scoreParticipant(withRepay, OPTS)
    expect(s.pnlUsd).toBeCloseTo(11, 6) // 4 + 1 close, + 6 repaid slice
    expect(s.bestTradeUsd).toBeCloseTo(10, 6) // s1 is worth 4 + 6, not 4
    expect(s.trades).toBe(2) // a repay is not a third trade
  })

  it("ignores a repay carrying no realized PnL (long repays USDT)", () => {
    clock = Date.parse(WINDOW_START) + 3_600_000
    const rows: ChallengeJournalRow[] = [
      ...pair({ id: "l1", xlm: 100, price: 1, pnl: 5 }),
      ...pair({ id: "l2", xlm: 100, price: 1, pnl: 5 }),
      {
        position_id: "l1",
        event_type: "repay",
        side: "Long",
        realized_pnl_usd: null,
        verified_onchain: true,
        created_at: new Date(Date.parse(WINDOW_START) + 3_600_000 + 60_000).toISOString(),
      },
    ]
    expect(scoreParticipant(rows, OPTS).pnlUsd).toBeCloseTo(10, 6)
  })

  it("sums volume and PnL over closed positions in the window", () => {
    clock = Date.parse(WINDOW_START) + 3_600_000
    const rows = [
      ...pair({ id: "1", xlm: 100, price: 0.5, pnl: 10 }), // $50 notional
      ...pair({ id: "2", xlm: 200, price: 0.5, pnl: -4 }), // $100 notional
    ]
    const s = scoreParticipant(rows, OPTS)
    expect(s.volumeUsd).toBeCloseTo(150, 6)
    expect(s.pnlUsd).toBeCloseTo(6, 6)
    expect(s.trades).toBe(2)
    expect(s.winRatePct).toBeCloseTo(50, 6)
    expect(s.bestTradeUsd).toBeCloseTo(10, 6)
    expect(s.ranked).toBe(true)
  })

  it("ignores rows outside the challenge window", () => {
    const before: ChallengeJournalRow[] = [
      {
        position_id: "early",
        event_type: "open",
        xlm_amount: 1000,
        entry_price_usd: 1,
        leverage_x100: 100,
        verified_onchain: true,
        created_at: "2026-08-01T00:00:00Z",
      },
    ]
    expect(scoreParticipant(before, OPTS).volumeUsd).toBe(0)
  })

  describe("anti-abuse", () => {
    it("excludes a wash trade — closed under 60s after the open", () => {
      clock = Date.parse(WINDOW_START) + 3_600_000
      const honest = pair({ id: "honest", xlm: 100, price: 1, pnl: 5 })
      const wash = pair({ id: "wash", xlm: 100_000, price: 1, pnl: 1, holdMs: 30_000 })

      const s = scoreParticipant([...honest, ...wash], OPTS)
      // The wash pair contributes neither its $100k notional nor its win.
      expect(s.volumeUsd).toBeCloseTo(100, 6)
      expect(s.trades).toBe(1)
      expect(s.pnlUsd).toBeCloseTo(5, 6)
    })

    it("counts a position held just over the wash-trade threshold", () => {
      clock = Date.parse(WINDOW_START) + 3_600_000
      const s = scoreParticipant(pair({ id: "held", xlm: 100, price: 1, pnl: 5, holdMs: 61_000 }), {
        ...OPTS,
        minTrades: 1,
      })
      expect(s.trades).toBe(1)
      expect(s.volumeUsd).toBeCloseTo(100, 6)
    })

    it("excludes a cancelled open so open/cancel loops cannot farm volume", () => {
      clock = Date.parse(WINDOW_START) + 3_600_000
      const rows = [
        ...pair({ id: "real", xlm: 100, price: 1, pnl: 2 }),
        ...pair({ id: "spam", xlm: 5_000, price: 1, closed: false }),
      ]
      rows.push({
        position_id: "spam",
        event_type: "cancel",
        verified_onchain: true,
        created_at: new Date(clock + 1000).toISOString(),
      })

      const s = scoreParticipant(rows, { ...OPTS, minTrades: 1 })
      expect(s.volumeUsd).toBeCloseTo(100, 6)
      expect(s.trades).toBe(1)
    })

    it("caps a single absurd notional at 20% of the volume column", () => {
      clock = Date.parse(WINDOW_START) + 3_600_000
      const rows = [
        ...pair({ id: "whale", xlm: 1_000_000, price: 1, pnl: 1 }), // $1,000,000
        ...pair({ id: "a", xlm: 100, price: 1, pnl: 1 }),
        ...pair({ id: "b", xlm: 100, price: 1, pnl: 1 }),
        ...pair({ id: "c", xlm: 100, price: 1, pnl: 1 }),
        ...pair({ id: "d", xlm: 100, price: 1, pnl: 1 }),
      ]
      const raw = 1_000_000 + 400
      const cap = raw * 0.2

      const s = scoreParticipant(rows, OPTS)
      expect(s.volumeUsd).toBeCloseTo(cap + 400, 4)
      expect(s.volumeUsd).toBeLessThan(raw)
      // The uncapped column would have been ~2500x the honest trades combined.
      expect(s.trades).toBe(5)
    })

    it("leaves the volume uncapped below five trades, where every trade is over a fifth by construction", () => {
      clock = Date.parse(WINDOW_START) + 3_600_000
      const rows = [
        ...pair({ id: "a", xlm: 100, price: 1, pnl: 1 }),
        ...pair({ id: "b", xlm: 100, price: 1, pnl: 1 }),
      ]
      expect(scoreParticipant(rows, OPTS).volumeUsd).toBeCloseTo(200, 6)
    })

    it("skips rows the reconcile job could not confirm on chain when requireVerified is set", () => {
      clock = Date.parse(WINDOW_START) + 3_600_000
      const real = pair({ id: "real", xlm: 100, price: 1, pnl: 5, verified: true })
      const fake = pair({ id: "fake", xlm: 9_000, price: 1, pnl: 900, verified: false })
      const unchecked = pair({ id: "pending", xlm: 50, price: 1, pnl: 1, verified: null })

      const rows = [...real, ...fake, ...unchecked]

      const strict = scoreParticipant(rows, { ...OPTS, minTrades: 1, requireVerified: true })
      expect(strict.trades).toBe(1)
      expect(strict.pnlUsd).toBeCloseTo(5, 6)
      expect(strict.volumeUsd).toBeCloseTo(100, 6)

      // Without the flag the same rows all count — proving the filter, not the fixture.
      const loose = scoreParticipant(rows, { ...OPTS, minTrades: 1 })
      expect(loose.trades).toBe(3)
    })
  })

  describe("open positions", () => {
    /** An `open` row with no matching close — a position still running. */
    function openOnly(opts: { id: string; xlm: number; price: number; side?: "Long" | "Short"; leverage?: number }): ChallengeJournalRow {
      return {
        position_id: opts.id,
        event_type: "open",
        side: opts.side ?? "Long",
        xlm_amount: opts.xlm,
        entry_price_usd: opts.price,
        leverage_x100: opts.leverage ?? 100,
        verified_onchain: true,
        created_at: new Date(Date.parse(WINDOW_START) + 3_600_000).toISOString(),
      }
    }

    it("ranks a participant whose only trade is still open", () => {
      // The whole point: someone holding their first position is on the board,
      // not invisible until they close.
      const s = scoreParticipant([openOnly({ id: "live", xlm: 100, price: 0.5 })], {
        ...OPTS,
        minTrades: 1,
        markPriceUsd: 0.5,
      })
      expect(s.openTrades).toBe(1)
      expect(s.trades).toBe(0)
      expect(s.ranked).toBe(true)
      expect(s.volumeUsd).toBeCloseTo(50, 6)
    })

    it("marks an open long to the current price", () => {
      const s = scoreParticipant([openOnly({ id: "long", xlm: 100, price: 0.5 })], {
        ...OPTS,
        minTrades: 1,
        markPriceUsd: 0.6,
      })
      expect(s.unrealizedPnlUsd).toBeCloseTo(10, 6) // 100 × (0.60 − 0.50)
      expect(s.realizedPnlUsd).toBe(0)
      expect(s.pnlUsd).toBeCloseTo(10, 6)
      // Collateral = $50 at 1x, so a $10 paper gain is +20%.
      expect(s.pnlPct).toBeCloseTo(20, 4)
    })

    it("marks an open short the other way round", () => {
      const s = scoreParticipant([openOnly({ id: "short", xlm: 100, price: 0.5, side: "Short" })], {
        ...OPTS,
        minTrades: 1,
        markPriceUsd: 0.6,
      })
      expect(s.unrealizedPnlUsd).toBeCloseTo(-10, 6)
    })

    it("counts no paper PnL without a mark price — the after-the-bell case", () => {
      // Once the window is over the reconcile job stops supplying a mark, so an
      // unclosed position can no longer move the standings.
      const rows = [openOnly({ id: "long", xlm: 100, price: 0.5 })]
      const s = scoreParticipant(rows, { ...OPTS, minTrades: 1 })
      expect(s.unrealizedPnlUsd).toBe(0)
      expect(s.pnlUsd).toBe(0)
      expect(s.openTrades).toBe(1)
    })

    it("keeps win rate and best trade over closed positions only", () => {
      clock = Date.parse(WINDOW_START) + 7_200_000
      const rows = [
        ...pair({ id: "closed", xlm: 100, price: 1, pnl: 5 }),
        openOnly({ id: "running", xlm: 100, price: 1 }),
      ]
      const s = scoreParticipant(rows, { ...OPTS, minTrades: 1, markPriceUsd: 2 })
      expect(s.trades).toBe(1)
      expect(s.openTrades).toBe(1)
      expect(s.winRatePct).toBeCloseTo(100, 6) // 1 of 1 closed, not 1 of 2
      expect(s.bestTradeUsd).toBeCloseTo(5, 6) // the $100 paper gain is not a "trade"
      expect(s.pnlUsd).toBeCloseTo(105, 6)
    })

    it("still excludes a cancelled open, mark price or not", () => {
      clock = Date.parse(WINDOW_START) + 7_200_000
      const rows: ChallengeJournalRow[] = [
        openOnly({ id: "spam", xlm: 5_000, price: 1 }),
        {
          position_id: "spam",
          event_type: "cancel",
          verified_onchain: true,
          created_at: new Date(Date.parse(WINDOW_START) + 3_700_000).toISOString(),
        },
      ]
      const s = scoreParticipant(rows, { ...OPTS, minTrades: 1, markPriceUsd: 2 })
      expect(s.openTrades).toBe(0)
      expect(s.unrealizedPnlUsd).toBe(0)
      expect(s.ranked).toBe(false)
    })
  })

  describe("ranking gate and division guards", () => {
    it("marks a participant below minTrades as unranked", () => {
      clock = Date.parse(WINDOW_START) + 3_600_000
      const s = scoreParticipant(pair({ id: "only", xlm: 100, price: 1, pnl: 50 }), {
        ...OPTS,
        minTrades: 5,
      })
      expect(s.trades).toBe(1)
      expect(s.ranked).toBe(false)
    })

    it("returns pnlPct 0 rather than Infinity when no collateral was deployed", () => {
      clock = Date.parse(WINDOW_START) + 3_600_000
      // A close with no priced open (entry price never stamped) → zero collateral.
      const rows: ChallengeJournalRow[] = [
        {
          position_id: "orphan",
          event_type: "open",
          xlm_amount: 0,
          entry_price_usd: 0,
          leverage_x100: 0,
          verified_onchain: true,
          created_at: new Date(clock).toISOString(),
        },
        {
          position_id: "orphan",
          event_type: "close",
          realized_pnl_usd: 25,
          verified_onchain: true,
          created_at: new Date(clock + 3_600_000).toISOString(),
        },
      ]
      const s = scoreParticipant(rows, { ...OPTS, minTrades: 1 })
      expect(s.pnlUsd).toBeCloseTo(25, 6)
      expect(s.pnlPct).toBe(0)
      expect(Number.isFinite(s.pnlPct)).toBe(true)
    })

    it("divides PnL by peak concurrent collateral, not the sum of all stakes", () => {
      clock = Date.parse(WINDOW_START) + 3_600_000
      // Two sequential $100 trades at 1x: $100 was ever at risk, not $200.
      const rows = [
        ...pair({ id: "a", xlm: 100, price: 1, pnl: 10 }),
        ...pair({ id: "b", xlm: 100, price: 1, pnl: 10 }),
      ]
      const s = scoreParticipant(rows, OPTS)
      expect(s.pnlPct).toBeCloseTo(20, 4)
    })
  })
})

describe("rankStandings", () => {
  const row = (handle: string, pnlPct: number, ranked: boolean) => ({
    handle,
    pnlUsd: pnlPct,
    realizedPnlUsd: pnlPct,
    unrealizedPnlUsd: 0,
    pnlPct,
    volumeUsd: 0,
    trades: ranked ? 5 : 1,
    openTrades: 0,
    winRatePct: 0,
    bestTradeUsd: 0,
    ranked,
  })

  it("puts ranked rows first, sorted by the challenge metric, unranked below", () => {
    const out = rankStandings(
      [row("low", 1, true), row("unranked_high", 99, false), row("high", 50, true)],
      "pnl_pct",
    )
    expect(out.map((r) => r.handle)).toEqual(["high", "low", "unranked_high"])
    expect(out.map((r) => r.rank)).toEqual([1, 2, 0])
  })

  it("is stable across equal rows", () => {
    const out = rankStandings([row("first", 5, true), row("second", 5, true)], "pnl_pct")
    expect(out.map((r) => r.handle)).toEqual(["first", "second"])
  })

  it("honours the volume metric", () => {
    const a = { ...row("a", 1, true), volumeUsd: 10 }
    const b = { ...row("b", 100, true), volumeUsd: 5 }
    expect(rankStandings([b, a], "volume").map((r) => r.handle)).toEqual(["a", "b"])
  })
})

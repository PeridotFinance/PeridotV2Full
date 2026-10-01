/**
 * The History tab listed trades and never added them up.
 *
 * Two rules carry the whole feature, and both are about not inventing data: a
 * trade with no recorded PnL is skipped rather than counted as break-even, and
 * everything is rounded to the cent BEFORE its sign is judged — the resolution
 * the table itself displays.
 */
import { describe, it, expect } from "vitest"
import { summarizeClosedTrades, closedTradesCsv } from "@/app/app/margin/lib/marginMath"

const t = (h: number) => new Date(Date.UTC(2026, 7, 20, h)).toISOString()

describe("summarizeClosedTrades", () => {
  it("adds up the record", () => {
    const s = summarizeClosedTrades([
      { realizedPnlUsd: 12.5, openedAt: t(1), closedAt: t(3) },
      { realizedPnlUsd: -4.25, openedAt: t(4), closedAt: t(8) },
      { realizedPnlUsd: 1.75, openedAt: t(9), closedAt: t(12) },
    ])
    expect(s.counted).toBe(3)
    expect(s.totalPnlUsd).toBe(10)
    expect(s.wins).toBe(2)
    expect(s.losses).toBe(1)
    expect(s.winRate).toBeCloseTo(2 / 3, 6)
    expect(s.best).toBe(12.5)
    expect(s.worst).toBe(-4.25)
    expect(s.avgHoldMs).toBe(3 * 3_600_000) // 2h + 4h + 3h
  })

  it("skips trades with no recorded PnL instead of counting them as flat", () => {
    // Folding these in as zeros would inflate the trade count AND drag the win
    // rate down with trades that never lost anything.
    const s = summarizeClosedTrades([
      { realizedPnlUsd: 10, closedAt: t(1) },
      { realizedPnlUsd: null, closedAt: t(2) },
      { closedAt: t(3) },
    ])
    expect(s.counted).toBe(1)
    expect(s.skipped).toBe(2)
    expect(s.totalPnlUsd).toBe(10)
    expect(s.winRate).toBe(1)
  })

  it("rounds before judging the sign", () => {
    // The table renders -0.004 as "$0.00"; a losing badge on a row that reads
    // flat is the contradiction this avoids.
    const s = summarizeClosedTrades([{ realizedPnlUsd: -0.004, closedAt: t(1) }])
    expect(s.losses).toBe(0)
    expect(s.wins).toBe(0)
    expect(s.winRate).toBeNull()
    expect(s.totalPnlUsd).toBe(0)
  })

  it("has no opinion on an empty record", () => {
    const s = summarizeClosedTrades([])
    expect(s.counted).toBe(0)
    expect(s.winRate).toBeNull()
    expect(s.best).toBeNull()
    expect(s.avgHoldMs).toBeNull()
  })

  it("averages the hold only over trades that recorded an open time", () => {
    const s = summarizeClosedTrades([
      { realizedPnlUsd: 1, openedAt: t(1), closedAt: t(3) },
      { realizedPnlUsd: 1, openedAt: null, closedAt: t(9) },
    ])
    expect(s.counted).toBe(2)
    expect(s.avgHoldMs).toBe(2 * 3_600_000)
  })
})

describe("closedTradesCsv", () => {
  const rows = [
    {
      positionId: "42", side: "Long", leverageX100: 500, xlmAmount: 1234.5,
      entryPriceUsd: 0.3535, exitPriceUsd: 0.36, realizedPnlUsd: 8.02,
      openedAt: t(1), closedAt: t(3), txHash: "abc",
    },
    { positionId: "43", side: "Short", leverageX100: null, xlmAmount: null,
      entryPriceUsd: null, exitPriceUsd: null, realizedPnlUsd: null,
      closedAt: t(5), txHash: null },
  ]

  it("writes the same trades the table shows", () => {
    const lines = closedTradesCsv(rows).split("\n")
    expect(lines).toHaveLength(3)
    expect(lines[0]).toBe("Closed at,Side,Leverage,Size (XLM),Entry (USD),Exit (USD),Realized PnL (USD),Position ID,Tx hash")
    expect(lines[1]).toContain("Long,5.0x,1234.5000")
    expect(lines[1]).toContain("8.02,42,abc")
  })

  it("leaves unknown values empty rather than writing a zero into them", () => {
    // A trade with no recorded entry has no PnL. "0.00" in that cell would land
    // in whatever the spreadsheet sums.
    const line = closedTradesCsv(rows).split("\n")[2]
    expect(line).toBe(`${t(5)},Short,,,,,,43,`)
  })

  it("timestamps in ISO, not in the table's relative wording", () => {
    expect(closedTradesCsv(rows).split("\n")[1].startsWith("2026-08-20T03:00:00.000Z")).toBe(true)
  })

  it("escapes a value that would otherwise break the row", () => {
    const csv = closedTradesCsv([{ positionId: 'a,b"c', closedAt: t(1), realizedPnlUsd: 1 }])
    expect(csv.split("\n")[1]).toContain('"a,b""c"')
  })
})

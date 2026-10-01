/**
 * Where a close's exit price comes from, and in what order.
 *
 * The rule this pins down: entry is the opening swap's fill, so the exit must be
 * the closing swap's fill. The feed is a different price domain — on testnet the
 * Aquarius pool has sat ~9% away from it — and pairing one domain's entry with
 * the other's exit books PnL the trader never made. So:
 *
 *   1. a fill supplied by the caller that ran the swap  (manual + keeper close)
 *   2. the swap's raw legs, priced here once the side is known  (recovery paths)
 *   3. the pool's own mid price          (nothing recoverable — same market)
 *   4. the feed, only if the pool can't be read at all
 *
 * The DB is mocked by call order — the real SQL is integration-tested against a
 * live DATABASE_URL, not here.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

const calls: Array<unknown[]> = []
let queue: unknown[][] = []

vi.mock("@/lib/database", () => ({
  sql: (_strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push(values)
    return Promise.resolve(queue.shift() ?? [])
  },
}))

const poolMid = vi.fn()
vi.mock("@/lib/margin/pool-price", () => ({ fetchXlmPoolMid: () => poolMid() }))

const spot = vi.fn()
vi.stubGlobal("fetch", (url: string) => {
  spot()
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(url.includes("binance") ? { price: "0.20" } : { stellar: { usd: 0.2 } }),
  })
})

import { recordMarginTrade } from "@/lib/margin-journal"

/** A Long opened at $0.15 holding 500 XLM, no repayments. */
const OPEN_ROW = { side: "Long", xlm_amount: "500", entry_price_usd: "0.15", borrow_amount: null }
const NO_REPAYS = [{ repaid_debt: "0", repaid_xlm: "0", repaid_pnl: "0" }]

/** Queue the four reads a close makes: dedup, open row, repays, insert. */
function primeClose(openRow: unknown = OPEN_ROW) {
  queue = [[], openRow ? [openRow] : [], NO_REPAYS, [{ id: 1 }]]
}

/** The values bound to the INSERT — the last query a close runs. */
function inserted() {
  return calls[calls.length - 1]
}

beforeEach(() => {
  calls.length = 0
  queue = []
  spot.mockClear()
  poolMid.mockReset()
  poolMid.mockResolvedValue(0.1487)
})

describe("close exit price", () => {
  it("uses the fill the caller supplied and never touches the feed", async () => {
    primeClose()
    await recordMarginTrade({
      userAddress: "GABC",
      positionId: "42",
      eventType: "close",
      exitPriceUsd: 0.1487,
    })
    expect(inserted()).toContain(0.1487)
    expect(spot).not.toHaveBeenCalled()
    expect(poolMid).not.toHaveBeenCalled()
    // (0.1487 − 0.15) × 500 = −$0.65: the round-trip spread, not a $25 windfall
    // conjured by marking a $0.15 pool entry against a $0.20 feed.
    expect(inserted().some((v) => typeof v === "number" && Math.abs(v - -0.65) < 0.01)).toBe(true)
  })

  it("prices the raw swap legs when the caller couldn't (recovery path)", async () => {
    primeClose()
    await recordMarginTrade({
      userAddress: "GABC",
      positionId: "42",
      eventType: "close",
      // 500 XLM in → 74.35 USDT out = $0.1487, read off the pending.
      exitSwapInRaw: "5000000000",
      exitSwapOutRaw: "743500000",
    })
    expect(inserted().some((v) => typeof v === "number" && Math.abs(v - 0.1487) < 1e-9)).toBe(true)
    expect(spot).not.toHaveBeenCalled()
    expect(poolMid).not.toHaveBeenCalled()
  })

  it("falls back to the pool's mid — the same market — when no fill is recoverable", async () => {
    primeClose()
    await recordMarginTrade({ userAddress: "GABC", positionId: "42", eventType: "close" })
    expect(inserted()).toContain(0.1487)
    expect(spot).not.toHaveBeenCalled()
  })

  it("reaches the feed only when the pool itself can't be read", async () => {
    poolMid.mockResolvedValue(null)
    primeClose()
    await recordMarginTrade({ userAddress: "GABC", positionId: "42", eventType: "close" })
    expect(inserted()).toContain(0.2)
    expect(spot).toHaveBeenCalled()
  })

  it("still stamps a price when there is no open row to take a side from", async () => {
    primeClose(null)
    await recordMarginTrade({
      userAddress: "GABC",
      positionId: "42",
      eventType: "close",
      exitSwapInRaw: "5000000000",
      exitSwapOutRaw: "743500000",
    })
    // No side → the legs can't be priced, but the row must not carry a hole.
    expect(inserted()).toContain(0.1487)
  })

  it("ignores unparseable legs rather than stamping a garbage price", async () => {
    primeClose()
    await recordMarginTrade({
      userAddress: "GABC",
      positionId: "42",
      eventType: "close",
      exitSwapInRaw: "not-a-number",
      exitSwapOutRaw: "743500000",
    })
    expect(inserted()).toContain(0.1487)
  })
})

/**
 * Leaderboard points for Robinhood margin positions.
 *
 * What these guard: an open pays a flat token amount and nothing more; the
 * real award is time-weighted notional paid once on the owner's full close,
 * so partial closes shrink it by their closeBps of the CURRENT size, a
 * liquidation stops accrual, a quick round trip pays nothing, and the award is
 * capped. Only the position's owner, sending the transaction themselves, is
 * ever paid, and the reported hash decides nothing about who that is.
 */
import { describe, expect, it, vi } from "vitest"
import type { Hex, Log } from "viem"
import type { RobinhoodIndexedEvent } from "@/lib/robinhood/activity"
import { measureRobinhoodHold, robinhoodPointsActions } from "@/lib/robinhood/points"
import { calculateMarginHoldPoints, MARGIN_POINTS } from "@/lib/rewards/policy"
import { awardRobinhoodPointsForTx, type MarginPointsRow, type RobinhoodPointsDeps } from "@/lib/robinhood/points-server"

// The booking half is injected below; the real DB module never loads.
vi.mock("@/lib/database", () => ({ sql: {} }))
vi.mock("@/lib/accountIdentity", () => ({ invalidateAccountIdentity: () => {} }))

const E18 = 10n ** 18n
const DAY = 86_400
const T0 = 1_790_000_000
const OWNER = "0x00000000000000000000000000000000000000aa"
const OTHER = "0x00000000000000000000000000000000000000bb"

let seq = 0
function ev(name: RobinhoodIndexedEvent["name"], args: RobinhoodIndexedEvent["args"], time: number, block?: number): RobinhoodIndexedEvent {
  seq += 1
  return {
    name,
    address: "0x0",
    blockNumber: String(block ?? 1000 + seq),
    logIndex: 0,
    txHash: `0x${seq.toString(16).padStart(64, "0")}` as Hex,
    time,
    nvdaPrice: 200,
    args,
  }
}

const opened = (id: string, notionalUsd: number, time = T0, user = OWNER) =>
  ev("PositionOpened", { positionId: id, user, side: 0, grossAssetValueUsd: (E18 * BigInt(notionalUsd)).toString() }, time)
const closed = (id: string, time: number, closeBps: number, full: boolean) =>
  ev("PositionClosed", { positionId: id, closeBps, fullyClosed: full }, time)

describe("measureRobinhoodHold", () => {
  it("measures notional x time until the full close", () => {
    const h = measureRobinhoodHold([opened("1", 1000), closed("1", T0 + 7 * DAY, 10_000, true)], "1")!
    expect(h.ended).toBe("owner")
    expect(h.heldSeconds).toBe(7 * DAY)
    expect(h.exposureUsdDays).toBeCloseTo(7000)
    expect(calculateMarginHoldPoints(h.exposureUsdDays, h.heldSeconds)).toBe(70)
  })

  it("shrinks the notional by each partial close's share of the current size", () => {
    const h = measureRobinhoodHold(
      [
        opened("2", 1000),
        closed("2", T0 + 1 * DAY, 5_000, false), // 1000 for a day, then 500
        closed("2", T0 + 2 * DAY, 5_000, false), // 500 for a day, then 250
        closed("2", T0 + 3 * DAY, 10_000, true), // 250 for a day
      ],
      "2",
    )!
    expect(h.exposureUsdDays).toBeCloseTo(1000 + 500 + 250)
  })

  it("stops accruing at a partial liquidation but still ends on the owner's close", () => {
    const h = measureRobinhoodHold(
      [
        opened("3", 1000),
        ev("PositionLiquidated", { positionId: "3", fullyLiquidated: false }, T0 + 2 * DAY),
        closed("3", T0 + 10 * DAY, 10_000, true),
      ],
      "3",
    )!
    expect(h.ended).toBe("owner")
    expect(h.exposureUsdDays).toBeCloseTo(2000)
  })

  it("never ends a fully liquidated position as the owner's", () => {
    const h = measureRobinhoodHold(
      [opened("4", 1000), ev("PositionLiquidated", { positionId: "4", fullyLiquidated: true }, T0 + DAY)],
      "4",
    )!
    expect(h.ended).toBe("liquidation")
    expect(h.closedAt).toBeNull()
  })

  it("counts the in-kind exit as a close and caps the counted window", () => {
    const h = measureRobinhoodHold([opened("5", 100), ev("DebtFreePTokenExit", { positionId: "5" }, T0 + 90 * DAY)], "5")!
    expect(h.ended).toBe("owner")
    expect(h.exposureUsdDays).toBeCloseTo(100 * MARGIN_POINTS.maxHoldDays)
  })

  it("returns null without the opening event", () => {
    expect(measureRobinhoodHold([closed("6", T0, 10_000, true)], "6")).toBeNull()
  })
})

describe("calculateMarginHoldPoints", () => {
  it("pays nothing under the minimum hold, however large", () => {
    expect(calculateMarginHoldPoints(1_000_000, MARGIN_POINTS.minHoldSeconds - 1)).toBe(0)
  })
  it("caps one position", () => {
    expect(calculateMarginHoldPoints(10_000_000, 30 * DAY)).toBe(MARGIN_POINTS.maxPerPosition)
  })
})

describe("robinhoodPointsActions", () => {
  it("finds opens and full closes, not partial closes", () => {
    const a = robinhoodPointsActions([opened("7", 500), closed("8", T0, 5_000, false), closed("9", T0, 10_000, true)])
    expect(a).toEqual([
      { kind: "open", positionId: "7", owner: OWNER, notionalUsd: 500 },
      { kind: "close", positionId: "9" },
    ])
  })
})

describe("awardRobinhoodPointsForTx", () => {
  function deps(txEvents: RobinhoodIndexedEvent[], history: RobinhoodIndexedEvent[], from = OWNER, blockNumber = 5_000n) {
    const booked: MarginPointsRow[] = []
    const seen = new Set<string>()
    const d: RobinhoodPointsDeps = {
      getReceipt: async () => ({ status: "success", from, logs: [] as Log[], blockNumber, transactionHash: `0x${"1".repeat(64)}` as Hex }),
      decodeReceipt: async () => txEvents,
      positionHistory: async () => history,
      book: async (row) => {
        const key = `${row.positionId}:${row.kind}`
        if (seen.has(key)) return false
        seen.add(key)
        booked.push(row)
        return true
      },
    }
    return { d, booked }
  }

  it("pays the owner the flat open award", async () => {
    const { d, booked } = deps([opened("10", 1000)], [])
    const out = await awardRobinhoodPointsForTx(`0x${"1".repeat(64)}`, d)
    expect(out).toMatchObject({ status: "ok", awards: [{ kind: "open", points: MARGIN_POINTS.open, booked: true }] })
    expect(booked[0].wallet).toBe(OWNER)
  })

  it("pays the hold award from history plus the closing receipt, once", async () => {
    const history = [{ ...opened("11", 1000), blockNumber: "100" }]
    const closeTx = [{ ...closed("11", T0 + 7 * DAY, 10_000, true), blockNumber: "5000" }]
    const { d, booked } = deps(closeTx, history)
    const first = await awardRobinhoodPointsForTx(`0x${"1".repeat(64)}`, d)
    expect(first).toMatchObject({ status: "ok", awards: [{ kind: "close", points: 70, booked: true }] })
    const again = await awardRobinhoodPointsForTx(`0x${"1".repeat(64)}`, d)
    expect(again).toMatchObject({ status: "ok", awards: [{ kind: "close", booked: false }] })
    expect(booked).toHaveLength(1)
  })

  it("books a quick round trip at zero", async () => {
    const history = [{ ...opened("12", 50_000), blockNumber: "100" }]
    const { d } = deps([{ ...closed("12", T0 + 600, 10_000, true), blockNumber: "5000" }], history)
    const out = await awardRobinhoodPointsForTx(`0x${"1".repeat(64)}`, d)
    expect(out).toMatchObject({ status: "ok", awards: [{ points: 0, note: "held less than the minimum" }] })
  })

  it("pays nobody when someone other than the owner sent the transaction", async () => {
    const { d, booked } = deps([opened("13", 1000)], [], OTHER)
    const out = await awardRobinhoodPointsForTx(`0x${"1".repeat(64)}`, d)
    expect(out.status).toBe("rejected")
    expect(booked).toHaveLength(0)
  })

  it("waits for a receipt instead of rejecting", async () => {
    const { d } = deps([], [])
    d.getReceipt = async () => null
    expect(await awardRobinhoodPointsForTx(`0x${"1".repeat(64)}`, d)).toEqual({ status: "pending" })
  })
})

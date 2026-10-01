/**
 * Pending-close sweeper — the two pure pieces that decide whether the server
 * touches a user's position.
 *
 * These are worth pinning precisely because the sweeper acts unattended: a
 * misread swap flag or an off-by-one on the deadline means either unwinding a
 * close the user is in the middle of, or leaving their collateral parked.
 *
 * The DB and chain modules are mocked away — this file is about the decision,
 * not the plumbing.
 */
import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/database", () => ({ sql: vi.fn() }))
vi.mock("@/lib/margin-journal", () => ({ recordMarginTrade: vi.fn() }))
vi.mock("@/lib/margin/keeper-execute", () => ({
  getKeeperKeypair: () => null,
  submitLeg: vi.fn(),
  simulateRead: vi.fn(),
}))

import { classifyPending, decodePending, type PendingView } from "@/lib/margin/close-sweeper"

const pending = (over: Partial<PendingView> = {}): PendingView => ({
  positionId: "42",
  owner: "GABC",
  hasSwapped: false,
  expiresAt: 1_000,
  collateralUnderlying: BigInt(1_000_000),
  receivedDebtAsset: BigInt(0),
  ...over,
})

describe("classifyPending", () => {
  it("stands back on the FIRST sighting of a swapped pending — its owner may be finishing it right now", () => {
    // The race this prevents was live: a user's swap landed at 09:43:58 and the
    // sweeper's finish at 09:44:08, so the user's own finish reverted and their
    // browser reported a failure for a close that had completed.
    expect(classifyPending(pending({ hasSwapped: true }), 500, null)).toBe("observe")
  })

  it("keeps standing back while the grace period runs", () => {
    expect(classifyPending(pending({ hasSwapped: true }), 500, 44)).toBe("observe")
  })

  it("finishes a swapped pending once the grace period has run out — nobody else is coming", () => {
    expect(classifyPending(pending({ hasSwapped: true }), 500, 45)).toBe("finish")
    expect(classifyPending(pending({ hasSwapped: true }), 500, 600)).toBe("finish")
  })

  it("finishes a swapped pending past its deadline without waiting — no client is still signing", () => {
    expect(classifyPending(pending({ hasSwapped: true, expiresAt: 100 }), 5_000, null)).toBe("finish")
  })

  it("leaves an un-swapped pending alone inside its window — the user may be signing right now", () => {
    expect(classifyPending(pending({ expiresAt: 1_000 }), 999)).toBe("waiting")
  })

  it("expires an un-swapped pending once its deadline passes", () => {
    expect(classifyPending(pending({ expiresAt: 1_000 }), 1_000)).toBe("expire")
    expect(classifyPending(pending({ expiresAt: 1_000 }), 1_001)).toBe("expire")
  })

  it("waits on a pending with no deadline rather than unwinding it on a guess", () => {
    // expiresAt 0 means the contract didn't expose one. Treating "unknown" as
    // "expired" would cancel closes that are perfectly healthy.
    expect(classifyPending(pending({ expiresAt: 0 }), 9_999_999)).toBe("waiting")
  })
})

describe("decodePending", () => {
  it("returns null for a missing pending", () => {
    expect(decodePending(null, "42")).toBeNull()
  })

  it("returns null for an empty struct — some builds decode one instead of null", () => {
    expect(decodePending({ owner: "", collateral_underlying: 0, expires_at: 0, debt_amount: 0 }, "42")).toBeNull()
  })

  it("reads the canonical shape", () => {
    const p = decodePending(
      { owner: "GABC", collateral_underlying: "2500000", debt_amount: "1000000", expires_at: "1700000000", swapped: false },
      "42",
    )
    expect(p).not.toBeNull()
    expect(p!.collateralUnderlying).toBe(BigInt(2_500_000))
    expect(p!.expiresAt).toBe(1_700_000_000)
    expect(p!.hasSwapped).toBe(false)
  })

  it.each([
    ["boolean flag", { swapped: true }],
    ["snake-case flag", { has_swapped: true }],
    ["swap output amount", { swap_output: "1234" }],
    ["debt received amount", { debt_received: "1" }],
    ["proceeds amount", { proceeds: "99" }],
  ])("detects the swap from a %s", (_label, extra) => {
    const p = decodePending({ owner: "GABC", collateral_underlying: "1", ...extra }, "42")
    expect(p!.hasSwapped).toBe(true)
  })

  it("detects the swap from received_debt_asset — the field the LIVE contract writes", () => {
    // Verbatim shape of a real pending read off the deployed controller after
    // swap_close landed. Missing this field is what made every swapped pending
    // look un-swapped: the sweeper would have tried to EXPIRE a settled close,
    // and the UI hid the one button that still worked.
    const p = decodePending(
      {
        collateral_underlying: "3417784478",
        debt_amount: "299999998",
        expires_at: "1785773051",
        owner: "GDBHCIBW4OER2FQ2NZGXVKTDCHV7QH7KUR7LR7CUZQWGVFXCLQKJ7PEF",
        prepared_ledger: 3950570,
        received_debt_asset: "596408260",
      },
      "60",
    )
    expect(p!.hasSwapped).toBe(true)
    expect(classifyPending(p!, 1_785_773_051 + 60)).toBe("finish") // past expiry, still finish
    // The same field is the amount the swap delivered — the sweeper journals a
    // close it never watched swap, and this is the only honest exit price left
    // (3417.784478 XLM → 59.640826 USDT = $0.017…, whatever the feed says now).
    expect(p!.receivedDebtAsset).toBe(BigInt(596_408_260))
  })

  it("reports no swap amount when the build only exposes a boolean", () => {
    // `true` says the swap ran and nothing more; inventing an amount from it
    // would price the close off a number that isn't one.
    const p = decodePending({ owner: "GABC", collateral_underlying: "1", swapped: true }, "42")
    expect(p!.hasSwapped).toBe(true)
    expect(p!.receivedDebtAsset).toBe(BigInt(0))
  })

  it("reads a pre-swap pending off the live shape as un-swapped", () => {
    // Same contract, before swap_close: the field is simply absent.
    const p = decodePending(
      {
        collateral_underlying: "3449622459",
        debt_amount: "299999998",
        expires_at: "1785772000",
        owner: "GDNYNRO5J3VU2AO4UHRGQVTO5FYGGETFUWIW57KG46CW6JXOIBS7OZ4D",
        prepared_ledger: 3950000,
      },
      "58",
    )
    expect(p!.hasSwapped).toBe(false)
    expect(classifyPending(p!, 1_785_772_000 + 1)).toBe("expire")
  })

  it("carries the owner so an id found without a known trader still logs correctly", () => {
    const p = decodePending({ owner: "GDNYNRO5", collateral_underlying: "1" }, "58")
    expect(p!.owner).toBe("GDNYNRO5")
  })

  it("does not read a zero swap output as swapped", () => {
    // The dangerous direction: a false positive here would send the sweeper to
    // `finish` on a pending whose collateral has not been swapped yet.
    const p = decodePending({ owner: "GABC", collateral_underlying: "1", swap_output: "0" }, "42")
    expect(p!.hasSwapped).toBe(false)
  })

  it("survives a garbage numeric field instead of throwing mid-sweep", () => {
    const p = decodePending({ owner: "GABC", collateral_underlying: "not-a-number", expires_at: "12" }, "42")
    expect(p!.collateralUnderlying).toBe(BigInt(0))
    expect(p!.expiresAt).toBe(12)
  })

  it("counts a pending as real when only the collateral is present", () => {
    expect(decodePending({ collateral_underlying: "5" }, "42")).not.toBeNull()
  })
})

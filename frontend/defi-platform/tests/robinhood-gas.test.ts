/**
 * The gas check on the Robinhood margin page.
 *
 * What these guard: a wallet with no ETH must be stopped before it signs, a
 * balance that could not be read must never be reported as empty (the house
 * rule from the read layer: a failed read is not a zero), and a missing gas
 * price must make the threshold stricter, not disappear.
 */
import { describe, expect, it } from "vitest"

import {
  ROBINHOOD_FALLBACK_GAS_PRICE_WEI,
  ROBINHOOD_GAS_BUDGET_ACTION,
  ROBINHOOD_GAS_BUDGET_ROUND_TRIP,
  ROBINHOOD_GAS_HEADROOM,
  robinhoodGasStatus,
} from "@/lib/robinhood/gas"
import { formatEthDisplay } from "@/app/app/margin/robinhood/lib/format"

/** The fee observed on chain 4663 on 2026-09-21: 0.0498 gwei. */
const GAS_PRICE = 49_862_000n
const action = GAS_PRICE * ROBINHOOD_GAS_HEADROOM * ROBINHOOD_GAS_BUDGET_ACTION
const roundTrip = GAS_PRICE * ROBINHOOD_GAS_HEADROOM * ROBINHOOD_GAS_BUDGET_ROUND_TRIP

describe("robinhoodGasStatus", () => {
  it("blocks an empty wallet and says why", () => {
    const s = robinhoodGasStatus({ balanceWei: 0n, gasPriceWei: GAS_PRICE })
    expect(s.level).toBe("empty")
    expect(s.blocks).toBe(true)
    expect(s.message).toMatch(/no ETH/i)
  })

  it("blocks a balance below one action", () => {
    const s = robinhoodGasStatus({ balanceWei: action - 1n, gasPriceWei: GAS_PRICE })
    expect(s.level).toBe("short")
    expect(s.blocks).toBe(true)
  })

  it("warns without blocking between one action and a full round trip", () => {
    const s = robinhoodGasStatus({ balanceWei: (action + roundTrip) / 2n, gasPriceWei: GAS_PRICE })
    expect(s.level).toBe("thin")
    expect(s.blocks).toBe(false)
    expect(s.message).toBeTruthy()
  })

  it("says nothing when there is enough", () => {
    const s = robinhoodGasStatus({ balanceWei: roundTrip, gasPriceWei: GAS_PRICE })
    expect(s.level).toBe("ok")
    expect(s.blocks).toBe(false)
    expect(s.message).toBeNull()
  })

  it("passes the wallet funded with 0.001 ETH on 2026-09-21", () => {
    expect(robinhoodGasStatus({ balanceWei: 10n ** 15n, gasPriceWei: GAS_PRICE }).level).toBe("ok")
  })

  it("never turns an unreadable balance into an empty one", () => {
    const s = robinhoodGasStatus({ balanceWei: null, gasPriceWei: GAS_PRICE })
    expect(s.level).toBe("unknown")
    expect(s.blocks).toBe(false)
    expect(s.message).toBeNull()
    expect(robinhoodGasStatus(undefined).blocks).toBe(false)
  })

  it("assumes an expensive block when the gas price is missing or zero", () => {
    expect(robinhoodGasStatus({ balanceWei: 1n, gasPriceWei: 0n }).blocks).toBe(true)
    const s = robinhoodGasStatus({ balanceWei: 1n, gasPriceWei: null })
    expect(s.requiredForActionWei).toBe(
      ROBINHOOD_FALLBACK_GAS_PRICE_WEI * ROBINHOOD_GAS_HEADROOM * ROBINHOOD_GAS_BUDGET_ACTION,
    )
    expect(s.blocks).toBe(true)
  })
})

describe("formatEthDisplay", () => {
  it("keeps small balances readable and marks an unread one", () => {
    expect(formatEthDisplay(10n ** 15n)).toBe("0.001 ETH")
    expect(formatEthDisplay(0n)).toBe("0 ETH")
    expect(formatEthDisplay(1n)).toBe("<0.000001 ETH")
    expect(formatEthDisplay(null)).toBe("n/a")
  })
})

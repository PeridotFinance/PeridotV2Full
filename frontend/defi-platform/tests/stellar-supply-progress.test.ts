/**
 * Tests — Stellar supply progress narration.
 *
 * A first-time deposit runs three signatures deep (enter market → approve →
 * deposit). The UI used to sit on one static "Supplying to Stellar market…"
 * for the whole flow, so the button read as frozen precisely when the user was
 * supposed to go tap Confirm in their wallet.
 *
 * These pin the two halves of the contract:
 *   1. the raw progress strings the lending lib emits, and
 *   2. that `busyPhaseLabel` maps each of them to a distinct, non-technical
 *      button face — the labels are what Easy *and* Expert mode now show.
 */

import { describe, it, expect } from "vitest"
import { busyPhaseLabel } from "@/lib/tx/txCopy"

// The sequence stellarDeposit emits for a first-time deposit, in order.
const FIRST_TIME_DEPOSIT = [
  "Getting your deposit ready",
  "Approving market access",
  "Waiting for you to confirm in your wallet",
  "Submitting to the network",
  "Approving the vault to move your funds",
  "Waiting for you to confirm in your wallet",
  "Submitting to the network",
  "Depositing into the market",
  "Waiting for you to confirm in your wallet",
  "Submitting to the network",
]

describe("Stellar supply progress → button copy", () => {
  it("tells the user to go confirm while the wallet pop-up is open", () => {
    const { label } = busyPhaseLabel("supplying", "Waiting for you to confirm in your wallet", {
      action: "supply",
    })
    expect(label).toBe("Confirm to continue")
  })

  it("reads the two approval steps as one-time setup, not as an action", () => {
    for (const msg of ["Approving market access", "Approving the vault to move your funds"]) {
      expect(busyPhaseLabel("supplying", msg, { action: "supply" }).label).toBe("Getting set up…")
    }
  })

  it("moves to a closing beat once a signature is broadcast", () => {
    const { label } = busyPhaseLabel("supplying", "Submitting to the network", { action: "supply" })
    expect(label).toBe("Almost there…")
  })

  it("never leaks wallet/network jargon into the button face", () => {
    // The raw strings mention wallet + network on purpose (they're the match
    // keys); the rendered label must not — consumer surfaces share this copy.
    for (const msg of FIRST_TIME_DEPOSIT) {
      const { label } = busyPhaseLabel("supplying", msg, { action: "supply" })
      expect(label.toLowerCase()).not.toMatch(/wallet|network|ledger|contract|vault|sign |xdr/)
    }
  })

  it("actually changes the label as the deposit advances", () => {
    const labels = FIRST_TIME_DEPOSIT.map(
      (m) => busyPhaseLabel("supplying", m, { action: "supply" }).label
    )
    // The old behaviour was a single frozen label for the whole flow. Anything
    // less than three distinct beats means the narration collapsed again.
    expect(new Set(labels).size).toBeGreaterThanOrEqual(3)
    // And consecutive steps must not repeat where the phase genuinely changed.
    expect(labels[1]).not.toBe(labels[2]) // approve → confirm
    expect(labels[2]).not.toBe(labels[3]) // confirm → submit
  })
})

/**
 * The instruction the keeper notice gives, and whether it can be followed.
 *
 * The banner ended every actionable line with "Open the position below and
 * choose 'Renew cover'". That button is offered only when the position is still
 * open AND still carries levels — renewing re-signs the CURRENT triggers, so
 * with none there is nothing to sign. An arm outlives both conditions, so the
 * banner routinely pointed at a control that wasn't on the page.
 *
 * Seen live on 2026-08-11: "Your always-on cover has run out … choose 'Renew
 * cover'" above a position with no take-profit, no stop-loss, and no Renew
 * button in its popover.
 */
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"

import { StellarKeeperNotice } from "@/app/app/margin/components/stellar/StellarKeeperNotice"
import type { KeeperArmView } from "@/app/app/margin/hooks/use-stellar-keeper-arms"
import type { KeeperArmState } from "@/app/app/margin/lib/keeperArmStatus"

const arm = (positionId: string): KeeperArmView => ({
  position_id: positionId,
  side: "Long",
  take_profit_usd: null,
  stop_loss_usd: 0.3,
  valid_until_ledger: 1,
  status: "expired",
  attempts: 0,
  last_error: null,
  fired_kind: null,
  fired_tx_hash: null,
  arm_version: 3,
  has_cancel_entry: true,
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-05T00:00:00Z",
})

const expired: KeeperArmState = {
  tone: "warn",
  notable: true,
  needsUser: true,
  label: "expired",
  detail: "Your always-on cover has run out, so your take-profit and stop-loss only run while this page is open.",
} as KeeperArmState

const fired: KeeperArmState = {
  tone: "ok",
  notable: true,
  needsUser: false,
  label: "fired",
  detail: "We closed this automatically when your stop-loss was reached.",
} as KeeperArmState

const items = (state: KeeperArmState = expired) => [{ arm: arm("42"), state }]

describe("the renew instruction", () => {
  it("points at Renew cover when the position still has levels to re-sign", () => {
    render(
      <StellarKeeperNotice
        items={items()}
        address="GABC"
        openPositionIds={new Set(["42"])}
        positionsWithTriggers={new Set(["42"])}
      />,
    )
    expect(screen.getByTestId("keeper-notice-action").textContent).toMatch(/renew cover/i)
  })

  it("asks for levels first when the position has none", () => {
    // Renewing signs the current triggers; with none there is nothing to sign,
    // so the popover offers no Renew button and the old copy was a dead end.
    render(
      <StellarKeeperNotice
        items={items()}
        address="GABC"
        openPositionIds={new Set(["42"])}
        positionsWithTriggers={new Set()}
      />,
    )
    const action = screen.getByTestId("keeper-notice-action").textContent ?? ""
    expect(action).toMatch(/set a take-profit or stop-loss/i)
    expect(action).not.toMatch(/renew cover/i)
  })

  it("gives no instruction at all once the position is gone", () => {
    render(
      <StellarKeeperNotice
        items={items()}
        address="GABC"
        openPositionIds={new Set(["99"])}
        positionsWithTriggers={new Set(["99"])}
      />,
    )
    expect(screen.queryByTestId("keeper-notice-action")).toBeNull()
    // …and it stops calling itself a task. Cover that lapsed on a position the
    // trader has since closed is history, not something needing a look.
    expect(screen.getByTestId("keeper-notice").textContent).toMatch(/about your automatic close/i)
    expect(screen.getByTestId("keeper-notice").textContent).not.toMatch(/needs a look/i)
  })

  it("still reports what happened, whatever the instruction", () => {
    render(
      <StellarKeeperNotice items={items()} address="GABC" openPositionIds={new Set()} positionsWithTriggers={new Set()} />,
    )
    expect(screen.getByTestId("keeper-notice").textContent).toMatch(/cover has run out/i)
  })

  it("leaves a purely informational notice alone", () => {
    // A fired stop-loss belongs to a position that is closed by definition; it
    // was never actionable and must not acquire an instruction.
    render(
      <StellarKeeperNotice items={items(fired)} address="GABC" openPositionIds={new Set()} positionsWithTriggers={new Set()} />,
    )
    expect(screen.queryByTestId("keeper-notice-action")).toBeNull()
    expect(screen.getByTestId("keeper-notice").textContent).toMatch(/we closed this automatically/i)
  })

  it("keeps the old behaviour when the caller says nothing", () => {
    render(<StellarKeeperNotice items={items()} address="GABC" />)
    expect(screen.getByTestId("keeper-notice-action").textContent).toMatch(/renew cover/i)
  })
})

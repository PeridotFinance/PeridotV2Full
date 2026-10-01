/**
 * What the take-profit / stop-loss controls tell a screen reader.
 *
 * They are checkboxes to the eye — a box, a tick, an expanding panel — and were
 * plain `<button>`s to everything else. So the row announced "Take-Profit
 * Auto-close when price rises, button": no state, nothing to say whether the
 * stop-loss was armed or not, and no hint that activating it opens a panel. The
 * trigger fields had a placeholder and no name; the chips read out as "+25%" with
 * nothing to say what they moved.
 *
 * These lock in the semantics rather than the markup: role and state, names on
 * the inputs, and — the one that decides whether a blocked order is a dead end —
 * that a refusal reaches a live region while the running payoff does not.
 */
import { describe, it, expect, vi } from "vitest"
import { render, screen, within } from "@testing-library/react"

import { StellarTpSlControls, type TpSlState } from "@/app/app/margin/components/stellar/StellarTpSlControls"

const MARK = 0.35

function renderControls(value: Partial<TpSlState> = {}, extra: Record<string, unknown> = {}) {
  const state: TpSlState = { tpEnabled: true, slEnabled: true, tpPrice: "", slPrice: "", ...value }
  render(
    <StellarTpSlControls
      side="Long"
      entryPrice={MARK}
      positionUsd={100}
      collateralUsd={50}
      liqPrice={null}
      value={state}
      onChange={vi.fn()}
      {...extra}
    />,
  )
}

describe("the toggle rows are checkboxes", () => {
  it("exposes each row as a checkbox with its state", () => {
    renderControls({ tpEnabled: true, slEnabled: false })
    const boxes = screen.getAllByRole("checkbox")
    expect(boxes).toHaveLength(2)
    expect(boxes[0]).toHaveProperty("ariaChecked", "true")
    expect(boxes[1]).toHaveProperty("ariaChecked", "false")
  })

  it("names each row by its own label", () => {
    renderControls()
    expect(screen.getByRole("checkbox", { name: /take-profit/i })).toBeTruthy()
    expect(screen.getByRole("checkbox", { name: /stop-loss/i })).toBeTruthy()
  })

  it("says that an armed row has opened a panel, and points at it", () => {
    renderControls({ tpEnabled: true, slEnabled: false })
    const tp = screen.getByRole("checkbox", { name: /take-profit/i })
    const sl = screen.getByRole("checkbox", { name: /stop-loss/i })
    expect(tp.getAttribute("aria-expanded")).toBe("true")
    expect(sl.getAttribute("aria-expanded")).toBe("false")
    const panelId = tp.getAttribute("aria-controls")
    expect(panelId).toBeTruthy()
    expect(document.getElementById(panelId!)).toBeTruthy()
    // A collapsed row must not claim to control a panel that isn't rendered.
    expect(sl.getAttribute("aria-controls")).toBeNull()
  })
})

describe("the fields have names", () => {
  it("names both trigger inputs", () => {
    renderControls()
    expect(screen.getByRole("spinbutton", { name: /take-profit trigger price/i })).toBeTruthy()
    expect(screen.getByRole("spinbutton", { name: /stop-loss trigger price/i })).toBeTruthy()
  })

  it("groups the quick-move chips under a name that says what they move", () => {
    renderControls()
    expect(screen.getByRole("group", { name: /take-profit quick price moves/i })).toBeTruthy()
    expect(screen.getByRole("group", { name: /stop-loss quick price moves/i })).toBeTruthy()
  })
})

describe("what gets announced", () => {
  const liveText = () =>
    [...document.querySelectorAll('[aria-live="polite"]')].map((n) => n.textContent?.trim())

  it("announces a refusal", () => {
    renderControls({ tpEnabled: true, slEnabled: false, tpPrice: "0.30" }) // below the mark on a long
    expect(liveText().some((t) => /take-profit must be above/i.test(t ?? ""))).toBe(true)
  })

  it("does not announce the running payoff", () => {
    // A live region re-reading "Est. profit +$40" on every keystroke buries the
    // one line that means the trigger won't be accepted.
    renderControls({ tpEnabled: true, slEnabled: false, tpPrice: "0.44" })
    expect(screen.getByText(/Est\. profit/)).toBeTruthy()
    expect(liveText().some((t) => /Est\. profit/.test(t ?? ""))).toBe(false)
  })

  it("announces that triggers are waiting on the price feed", () => {
    renderControls({ tpEnabled: true }, { markIsLive: false })
    expect(liveText().some((t) => /waiting for the live xlm price/i.test(t ?? ""))).toBe(true)
  })
})

describe("decoration stays out of the way", () => {
  it("hides the tick, the icons and the unit badge from the reader", () => {
    renderControls({ tpEnabled: true, slEnabled: false })
    const tp = screen.getByRole("checkbox", { name: /take-profit/i })
    // The accessible name comes from the label span alone — not "$", "XLM / USD",
    // or the tick mark, which would otherwise be read as part of the control.
    expect(within(tp).queryByText("XLM / USD")).toBeNull()
    expect(tp.textContent).toMatch(/Take-Profit/)
    const badge = screen.getByText("XLM / USD")
    expect(badge.getAttribute("aria-hidden")).toBe("true")
  })
})

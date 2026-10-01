/**
 * The quick-move chips, and the prices they are allowed to write.
 *
 * `validateTpSlDraft` guards the trigger a user TYPES. These cover the trigger
 * the UI types for them, which had its own way of going wrong: every chip and the
 * custom field ran through one `priceForMove`, and a large enough downward move
 * drove it to zero and then negative.
 *
 * That produced the worst kind of dead end. Nothing in the row warns, because
 * every check there is guarded on `> 0` and a negative price fails all of them —
 * so the preview stayed encouraging ("Set a target price below $0.3500") while
 * the submit button was blocked with "Enter a take-profit price", a number
 * sitting visibly in the field the message says is empty.
 *
 * Two doors to it, both closed here: the preset chips (a short's +100% / +150%,
 * now a side-specific ladder) and a typed custom % (now clamped).
 *
 * The last two groups cover the row's rendered verdict rather than the prices it
 * writes: the inline preview now asks `validateTpSlDraft` instead of carrying its
 * own copy of the side check, so it can't show a green payoff under a trigger the
 * submit button refuses.
 */
import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent, within } from "@testing-library/react"

import { StellarTpSlControls, type TpSlState } from "@/app/app/margin/components/stellar/StellarTpSlControls"
import { validateTpSlDraft } from "@/app/app/margin/lib/marginMath"
import type { PositionSide } from "@/app/app/margin/config/stellarMarginConfig"

const MARK = 0.35

function setup(side: PositionSide, value: Partial<TpSlState> = {}, fillPrice?: number) {
  const onChange = vi.fn()
  const state: TpSlState = {
    tpEnabled: true,
    slEnabled: true,
    tpPrice: "",
    slPrice: "",
    ...value,
  }
  render(
    <StellarTpSlControls
      side={side}
      entryPrice={MARK}
      fillPrice={fillPrice}
      positionUsd={100}
      collateralUsd={50}
      liqPrice={null}
      value={state}
      onChange={onChange}
    />,
  )
  return { onChange }
}

/** The expanded panel of a row, found via its heading. */
function row(title: "Take-Profit" | "Stop-Loss"): HTMLElement {
  return screen.getByText(title).closest("div.rounded-xl") as HTMLElement
}

/** Last price this row's onChange was handed, as a number. */
function lastPrice(onChange: ReturnType<typeof vi.fn>, field: "tpPrice" | "slPrice"): number {
  expect(onChange).toHaveBeenCalled()
  const next = onChange.mock.calls[onChange.mock.calls.length - 1][0] as TpSlState
  return parseFloat(next[field])
}

describe("take-profit chips — a short's upside is capped", () => {
  it("does not offer a long's 100% / 150% rungs on a short", () => {
    // The price can only fall to zero, so there is no such trade to offer.
    setup("Short")
    const tp = within(row("Take-Profit"))
    expect(tp.queryByText("−100%")).toBeNull()
    expect(tp.queryByText("−150%")).toBeNull()
    expect(tp.getByText("−75%")).toBeTruthy()
  })

  it("keeps the full ladder on a long", () => {
    setup("Long")
    const tp = within(row("Take-Profit"))
    expect(tp.getByText("+150%")).toBeTruthy()
  })

  it.each([
    ["Short" as const, "Take-Profit" as const, "tpPrice" as const],
    ["Long" as const, "Take-Profit" as const, "tpPrice" as const],
    ["Short" as const, "Stop-Loss" as const, "slPrice" as const],
    ["Long" as const, "Stop-Loss" as const, "slPrice" as const],
  ])("every %s %s chip writes a tradeable price", (side, title, field) => {
    const { onChange } = setup(side)
    const chips = within(row(title))
      .getAllByRole("button")
      .filter((b) => /^[+−]\d+%$/.test(b.textContent ?? ""))
    expect(chips.length).toBeGreaterThan(0)
    for (const chip of chips) {
      fireEvent.click(chip)
      const price = lastPrice(onChange, field)
      expect(price, `${chip.textContent} on a ${side}`).toBeGreaterThan(0)
    }
  })

  it("moves a short's take-profit below the mark and a long's above it", () => {
    const short = setup("Short")
    fireEvent.click(within(row("Take-Profit")).getByText("−50%"))
    expect(lastPrice(short.onChange, "tpPrice")).toBeCloseTo(MARK * 0.5, 6)
  })

  /**
   * The sign on a chip describes the PRICE it writes, not whether the move is
   * good news for the position. Both rows were once labelled from the long's
   * point of view, so a short's take-profit chip read "+25%" while writing a
   * price a quarter BELOW the market — under a row captioned "Auto-close when
   * price falls". Assert the label against what the click actually produces, on
   * every chip of every row on both sides.
   */
  it.each([
    ["Short" as const, "Take-Profit" as const, "tpPrice" as const],
    ["Long" as const, "Take-Profit" as const, "tpPrice" as const],
    ["Short" as const, "Stop-Loss" as const, "slPrice" as const],
    ["Long" as const, "Stop-Loss" as const, "slPrice" as const],
  ])("every %s %s chip's sign matches the direction it moves the price", (side, title, field) => {
    const { onChange } = setup(side)
    const chips = within(row(title))
      .getAllByRole("button")
      .filter((b) => /^[+−]\d+%$/.test(b.textContent ?? ""))
    expect(chips.length).toBeGreaterThan(0)
    for (const chip of chips) {
      fireEvent.click(chip)
      const price = lastPrice(onChange, field)
      const up = (chip.textContent ?? "").startsWith("+")
      expect(up ? price : MARK, `${chip.textContent} on a ${side} ${title}`).toBeGreaterThan(up ? MARK : price)
    }
  })
})

describe("custom % — clamped, and shown as what was used", () => {
  const openCustom = (title: "Take-Profit" | "Stop-Loss") => {
    fireEvent.click(within(row(title)).getByText("Custom"))
    return within(row(title)).getByPlaceholderText("0") as HTMLInputElement
  }

  it("refuses to drive a long's stop-loss to a negative price", () => {
    // 120% below the mark is the typed twin of the +150% chip on a short.
    const { onChange } = setup("Long")
    const input = openCustom("Stop-Loss")
    fireEvent.change(input, { target: { value: "120" } })
    const price = lastPrice(onChange, "slPrice")
    expect(price).toBeGreaterThan(0)
    expect(price).toBeCloseTo(MARK * 0.05, 6) // clamped to a 95% move
  })

  it("snaps the field to the % that was actually applied", () => {
    const { onChange } = setup("Long")
    const input = openCustom("Stop-Loss")
    fireEvent.change(input, { target: { value: "120" } })
    fireEvent.blur(input)
    expect(input.value).toBe("95")
    expect(lastPrice(onChange, "slPrice")).toBeGreaterThan(0)
  })

  it("applies a % below the ceiling untouched", () => {
    const { onChange } = setup("Long")
    const input = openCustom("Stop-Loss")
    fireEvent.change(input, { target: { value: "12" } })
    expect(lastPrice(onChange, "slPrice")).toBeCloseTo(MARK * 0.88, 6)
  })

  it("forgets the custom % when the trade flips side", () => {
    // Toggling the row off already resets it, because the panel unmounts. Flipping
    // Long↔Short does not — the row stays mounted — so a 95% typed on a short came
    // back highlighted next to a long's +25% default, describing a number that was
    // no longer in the field. Caught on the live app after deploying the rest.
    const onChange = vi.fn()
    const state: TpSlState = { tpEnabled: false, slEnabled: true, tpPrice: "", slPrice: "" }
    const props = { positionUsd: 100, collateralUsd: 50, liqPrice: null, value: state, onChange }
    const { rerender } = render(<StellarTpSlControls side="Long" entryPrice={MARK} {...props} />)

    fireEvent.click(within(row("Stop-Loss")).getByText("Custom"))
    fireEvent.change(within(row("Stop-Loss")).getByPlaceholderText("0"), { target: { value: "12" } })
    expect((within(row("Stop-Loss")).getByPlaceholderText("0") as HTMLInputElement).value).toBe("12")

    rerender(<StellarTpSlControls side="Short" entryPrice={MARK} {...props} />)
    fireEvent.click(within(row("Stop-Loss")).getByText("Custom"))
    expect((within(row("Stop-Loss")).getByPlaceholderText("0") as HTMLInputElement).value).toBe("")
  })

  it("forgets the custom % once a preset chip is used", () => {
    // It used to survive, so reopening Custom showed a figure that no longer
    // described the price in the field above it.
    setup("Long")
    const input = openCustom("Stop-Loss")
    fireEvent.change(input, { target: { value: "12" } })
    fireEvent.click(within(row("Stop-Loss")).getByText("−20%"))
    const reopened = openCustom("Stop-Loss")
    expect(reopened.value).toBe("")
  })
})

describe("the inline preview says what the submit button says", () => {
  const LONG_FILL = 0.3535 // a long fills 1% above the mark

  it("warns on a take-profit above the mark but below the fill", () => {
    // The row used to carry its own copy of the side check, which only knew about
    // the mark. It would have shown "Est. profit +$0.57" in brand green under a
    // trigger the button refuses — a green light on a blocked order.
    setup("Long", { tpPrice: "0.3520", slEnabled: false }, LONG_FILL)
    const tp = within(row("Take-Profit"))
    expect(tp.queryByText(/Est\. profit/)).toBeNull()
    expect(tp.getByText(/fills at/i)).toBeTruthy()
  })

  it("warns on a stop-loss sitting on top of the price", () => {
    setup("Long", { slPrice: String(MARK * 0.999), tpEnabled: false })
    expect(within(row("Stop-Loss")).getByText(/too close/i)).toBeTruthy()
  })

  it("still prices a trigger that clears the fill", () => {
    setup("Long", { tpPrice: "0.42", slEnabled: false }, LONG_FILL)
    expect(within(row("Take-Profit")).getByText(/Est\. profit/)).toBeTruthy()
  })

  it("names the fill as the price the payoff is measured from", () => {
    setup("Long", { tpPrice: "0.42", slEnabled: false }, LONG_FILL)
    expect(screen.getByText("Fills at")).toBeTruthy()
    // …and stays quiet when the pool quote matches the mark.
    expect(screen.queryByText("Your entry")).toBeNull()
  })
})

describe("the scroll wheel does not edit a trigger", () => {
  it("drops focus from the trigger field instead of stepping it", () => {
    // A focused number input consumes the wheel and steps its own value, so
    // scrolling the panel past one silently moved the stop-loss.
    const { onChange } = setup("Long", { slPrice: "0.30" })
    const field = within(row("Stop-Loss")).getByPlaceholderText("0.00000") as HTMLInputElement
    field.focus()
    expect(document.activeElement).toBe(field)
    fireEvent.wheel(field, { deltaY: -100 })
    expect(document.activeElement).not.toBe(field)
    expect(onChange).not.toHaveBeenCalled()
  })
})

/**
 * Everything the row OFFERS — the value it seeds when a checkbox is ticked, and
 * every chip — is measured from the bound the validator applies, not from the
 * mark.
 *
 * On a thin pool the two are far apart: a long filling 14% above the chart made
 * the default stop-loss (10% under the mark) land ABOVE the price a long's stop
 * has to sit under. The trader switched the row on, typed nothing, and was met
 * with a red field and a blocked order over a number the panel had written
 * itself. Same trap on the other side for a short's stop-loss chips.
 */
describe("what the row offers is always something the order accepts", () => {
  // Both directions of pool drift, on both sides — the observed failure was a
  // SHORT filling above the chart, which is the case a long-shaped fixture misses.
  const DRIFT = [MARK * 1.14, MARK * 0.86]

  /** The draft the panel would submit, judged by the shared validator. */
  const accepts = (side: PositionSide, draft: TpSlState, fillPrice: number) =>
    validateTpSlDraft({ side, mark: MARK, fillPrice, draft }).ok

  it.each([
    ["Long" as const, DRIFT[0]], ["Long" as const, DRIFT[1]],
    ["Short" as const, DRIFT[0]], ["Short" as const, DRIFT[1]],
  ])("seeds a %s's defaults clear of a fill at %s", (side, fill) => {
    const { onChange } = setup(side, { tpEnabled: false, slEnabled: false }, fill)
    // Tick both rows; each `onChange` carries the value that row seeds.
    fireEvent.click(within(row("Take-Profit")).getByRole("checkbox"))
    fireEvent.click(within(row("Stop-Loss")).getByRole("checkbox"))
    const seeded = onChange.mock.calls.map(([next]) => next as TpSlState)
    const tpPrice = seeded.find((s) => s.tpEnabled)?.tpPrice ?? ""
    const slPrice = seeded.find((s) => s.slEnabled)?.slPrice ?? ""
    expect(parseFloat(tpPrice)).toBeGreaterThan(0)
    expect(parseFloat(slPrice)).toBeGreaterThan(0)
    expect(accepts(side, { tpEnabled: true, slEnabled: false, tpPrice, slPrice: "" }, fill)).toBe(true)
    expect(accepts(side, { tpEnabled: false, slEnabled: true, tpPrice: "", slPrice }, fill)).toBe(true)
  })

  it.each(
    (["Long", "Short"] as const).flatMap((side) =>
      ([["Take-Profit", "tpPrice"], ["Stop-Loss", "slPrice"]] as const).flatMap(([title, field]) =>
        DRIFT.map((fill) => [side, title, field, fill] as const),
      ),
    ),
  )("every %s %s chip writes a price the order accepts (fill %s)", (side, title, field, fill) => {
    const { onChange } = setup(side, {}, fill)
    const chips = within(row(title))
      .getAllByRole("button")
      .filter((b) => /^[+−]\d+%$/.test(b.textContent ?? ""))
    expect(chips.length).toBeGreaterThan(0)
    for (const chip of chips) {
      fireEvent.click(chip)
      const price = String(lastPrice(onChange, field))
      const draft: TpSlState =
        field === "tpPrice"
          ? { tpEnabled: true, slEnabled: false, tpPrice: price, slPrice: "" }
          : { tpEnabled: false, slEnabled: true, tpPrice: "", slPrice: price }
      expect(accepts(side, draft, fill), `${chip.textContent} on a ${side} ${title}`).toBe(true)
    }
  })
})

/**
 * Which surfaces the legacy tx dialog is allowed to appear on.
 *
 * This gateway lives in the root layout and listens globally, so every surface
 * that grew its own feedback has to be excluded here or the user gets two
 * modals for one transaction. That has regressed before (the `/app` Easy
 * default), and it regresses invisibly — nothing throws, a second dialog just
 * shows up on top. So the rule is pinned:
 *
 *   - /app/easy   → consumer surface, never the legacy dialog
 *   - /app/margin → owns ButtonProgress + toasts + its own terminal modals
 *   - /app        → Easy unless the cookie explicitly says expert
 */
import React from "react"
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { render, screen, act } from "@testing-library/react"
import { VIEW_MODE_COOKIE } from "@/context/view-mode"

vi.mock("next/navigation", () => ({ usePathname: () => "/" }))

import TxFeedbackGateway from "@/components/ui/TxFeedbackGateway"

/** Point `window.location.pathname` at a route without navigating. */
function at(pathname: string) {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, pathname, href: `https://peridot.finance${pathname}` },
  })
}

/** Emit the update every margin/lending hook emits when a leg is in flight. */
function emitTxUpdate() {
  act(() => {
    window.dispatchEvent(
      new CustomEvent("peridot:tx-update", {
        detail: { action: "margin-close-position", step: "signing", statusMessage: "" },
      }),
    )
  })
}

beforeEach(() => {
  document.cookie = `${VIEW_MODE_COOKIE}=expert`
})

afterEach(() => {
  document.cookie = `${VIEW_MODE_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT`
})

describe("TxFeedbackGateway surface suppression", () => {
  it("stays shut on /app/margin even in expert mode — margin has its own modals", () => {
    at("/app/margin")
    render(<TxFeedbackGateway />)
    emitTxUpdate()
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("stays shut on /app/easy", () => {
    at("/app/easy")
    render(<TxFeedbackGateway />)
    emitTxUpdate()
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("still opens on the expert lending surface, which has no dialog of its own", () => {
    at("/app")
    render(<TxFeedbackGateway />)
    emitTxUpdate()
    expect(screen.queryByRole("dialog")).not.toBeNull()
  })
})

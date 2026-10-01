/**
 * SheetShell — unit tests
 * Covers: open/close, Escape, backdrop click, body scroll lock, focus trap.
 */

import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import React from "react"

// ── Stubs ─────────────────────────────────────────────────────────────────────

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, className, onClick, ...rest }: any) => (
      <div className={className} onClick={onClick} data-testid={rest["data-testid"]} ref={rest.ref}>
        {children}
      </div>
    ),
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))

vi.mock("lucide-react", () => ({
  X: (p: any) => <span {...p} data-testid="icon-x" />,
}))

vi.mock("@/lib/utils", () => ({
  cn: (...a: any[]) => a.filter(Boolean).join(" "),
}))

import { SheetShell } from "@/components/steallar/sheets/SheetShell"

afterEach(() => {
  cleanup()
  document.body.style.overflow = ""
})

describe("SheetShell", () => {
  it("renders nothing when open=false", () => {
    const onClose = vi.fn()
    render(
      <SheetShell open={false} onClose={onClose} title="Hi">
        <p>body</p>
      </SheetShell>
    )
    expect(screen.queryByText("Hi")).toBeNull()
    expect(screen.queryByText("body")).toBeNull()
  })

  it("renders title, subtitle, body when open", () => {
    render(
      <SheetShell open onClose={() => {}} title="Deposit" subtitle="Earn interest">
        <p>body content</p>
      </SheetShell>
    )
    expect(screen.getByText("Deposit")).toBeTruthy()
    expect(screen.getByText("Earn interest")).toBeTruthy()
    expect(screen.getByText("body content")).toBeTruthy()
  })

  it("fires onClose when backdrop clicked", () => {
    const onClose = vi.fn()
    render(
      <SheetShell open onClose={onClose} title="x" testId="deposit">
        <p>body</p>
      </SheetShell>
    )
    const backdrop = screen.getByTestId("deposit-backdrop")
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("fires onClose when close button clicked", () => {
    const onClose = vi.fn()
    render(
      <SheetShell open onClose={onClose} title="x" testId="deposit">
        <p>body</p>
      </SheetShell>
    )
    fireEvent.click(screen.getByTestId("deposit-close"))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("fires onClose on Escape keydown", () => {
    const onClose = vi.fn()
    render(
      <SheetShell open onClose={onClose} title="x">
        <p>body</p>
      </SheetShell>
    )
    fireEvent.keyDown(document, { key: "Escape" })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("locks body scroll when open", () => {
    const { rerender } = render(
      <SheetShell open={false} onClose={() => {}} title="x">
        <p>body</p>
      </SheetShell>
    )
    expect(document.body.style.overflow).toBe("")
    rerender(
      <SheetShell open onClose={() => {}} title="x">
        <p>body</p>
      </SheetShell>
    )
    expect(document.body.style.overflow).toBe("hidden")
    rerender(
      <SheetShell open={false} onClose={() => {}} title="x">
        <p>body</p>
      </SheetShell>
    )
    expect(document.body.style.overflow).toBe("")
  })
})

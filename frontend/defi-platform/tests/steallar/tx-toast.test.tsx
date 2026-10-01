/**
 * TxToast — unit tests (terminal-only)
 *
 * In-flight feedback lives on the action button now, so the toast only surfaces
 * terminal beats (success / error) — typically for sheet flows that close on
 * success. Pending (`tx-active`, non-error `tx-update`) stays invisible.
 */

import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, cleanup, act } from "@testing-library/react"
import React from "react"

// ── Stubs ─────────────────────────────────────────────────────────────────────

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, className, ...rest }: any) => (
      <div className={className} data-testid={rest["data-testid"]} data-phase={rest["data-phase"]}>
        {children}
      </div>
    ),
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))

vi.mock("lucide-react", () => ({
  AlertCircle: (p: any) => <span {...p} data-testid="icon-alert" />,
  ChevronRight: (p: any) => <span {...p} data-testid="icon-chevron" />,
}))

vi.mock("@/lib/utils", () => ({
  cn: (...a: any[]) => a.filter(Boolean).join(" "),
}))

import { TxToast } from "@/components/steallar/TxToast"

afterEach(cleanup)

function fire(name: string, detail?: any) {
  act(() => {
    window.dispatchEvent(new CustomEvent(name, { detail }))
  })
}

describe("TxToast (terminal-only)", () => {
  it("is idle (hidden) on mount", () => {
    render(<TxToast />)
    expect(screen.queryByTestId("tx-toast")).toBeNull()
  })

  it("stays hidden while a tx is in flight (tx-active)", () => {
    render(<TxToast />)
    fire("peridot:tx-active")
    expect(screen.queryByTestId("tx-toast")).toBeNull()
  })

  it("stays hidden on a non-error tx-update", () => {
    render(<TxToast />)
    fire("peridot:tx-active")
    fire("peridot:tx-update", { step: "signing" })
    expect(screen.queryByTestId("tx-toast")).toBeNull()
  })

  it("shows success copy + owl on tx-success", () => {
    render(<TxToast />)
    fire("peridot:tx-success", { txHash: "0xabcdef1234567890" })
    const toast = screen.getByTestId("tx-toast")
    expect(toast.getAttribute("data-phase")).toBe("success")
    expect(toast.textContent).toContain("Done")
    expect(toast.querySelector('img[src*="Owl"]')).toBeTruthy()
  })

  it("shows error copy on error update", () => {
    render(<TxToast />)
    fire("peridot:tx-update", { statusMessage: "Transaction failed" })
    const toast = screen.getByTestId("tx-toast")
    expect(toast.getAttribute("data-phase")).toBe("error")
    expect(toast.textContent).toContain("Something went wrong")
  })

  it("shows Add funds CTA on insufficient-balance error", () => {
    render(<TxToast />)
    fire("peridot:tx-update", { statusMessage: "failed: insufficient balance" })
    expect(screen.getByTestId("tx-toast-add-funds")).toBeTruthy()
    expect(screen.getByTestId("tx-toast").textContent).toContain("Not enough funds")
  })

  it("hides on tx-idle when pending (never showed)", () => {
    render(<TxToast />)
    fire("peridot:tx-active")
    fire("peridot:tx-idle")
    expect(screen.queryByTestId("tx-toast")).toBeNull()
  })

  it("tx-idle after success keeps the toast visible (auto-dismiss path)", () => {
    render(<TxToast />)
    fire("peridot:tx-success", { txHash: "0xabc" })
    fire("peridot:tx-idle")
    expect(screen.getByTestId("tx-toast").getAttribute("data-phase")).toBe("success")
  })

  it("has no crypto jargon in terminal copy", () => {
    render(<TxToast />)
    fire("peridot:tx-update", { step: "submitting", statusMessage: "Broadcasting tx failed" })
    const text = screen.getByTestId("tx-toast").textContent ?? ""
    expect(text.toLowerCase()).not.toMatch(/gas|chain|hash|bridge|approve token/)
  })
})

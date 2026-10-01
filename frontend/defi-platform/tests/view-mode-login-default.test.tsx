/**
 * The login default inside the view-mode context: a wallet sign-in opens
 * Expert, but never over the toggle or a `?view=` link.
 *
 * Run: npx vitest run tests/view-mode-login-default.test.tsx
 */
import React, { useEffect } from "react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, act, fireEvent } from "@testing-library/react"

let search = ""
const replace = vi.fn()
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(search),
  useRouter: () => ({ replace }),
  usePathname: () => "/app",
}))

import { ViewModeProvider, useViewMode } from "@/context/view-mode"
import type { LoginKind } from "@/lib/login-kind"

// Node 24 puts its own, incomplete `localStorage` on the global object, which
// shadows jsdom's. A plain in-memory Storage keeps the test independent of that.
const store = new Map<string, string>()
Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size
    },
  },
})

function cookie(): string | null {
  const hit = document.cookie.split("; ").find((c) => c.startsWith("peridot_view_mode="))
  return hit ? hit.split("=")[1] : null
}

function clearCookie() {
  document.cookie = "peridot_view_mode=; path=/; max-age=0"
}

/** Stands in for `LoginViewModeDefault`: a child that applies on mount. */
function Probe({ kind }: { kind: LoginKind | null }) {
  const { mode, setMode, applyLoginDefault } = useViewMode()
  useEffect(() => {
    if (kind) applyLoginDefault(kind)
  }, [kind, applyLoginDefault])
  return (
    <>
      <span data-testid="mode">{mode}</span>
      <button onClick={() => setMode(mode === "easy" ? "expert" : "easy")}>toggle</button>
    </>
  )
}

function mount(kind: LoginKind | null, initialMode: "easy" | "expert" = "easy") {
  return render(
    <ViewModeProvider initialMode={initialMode}>
      <Probe kind={kind} />
    </ViewModeProvider>,
  )
}

beforeEach(() => {
  search = ""
  replace.mockReset()
  clearCookie()
  window.localStorage.clear()
})

describe("login default", () => {
  it("opens Expert for a first-time wallet sign-in and remembers it for the server", async () => {
    mount("evm-wallet")
    await act(async () => {})
    expect(screen.getByTestId("mode").textContent).toBe("expert")
    expect(cookie()).toBe("expert")
    expect(window.localStorage.getItem("peridot.viewMode.origin")).toBe("login")
  })

  it("keeps a social sign-in in Easy", async () => {
    mount("social")
    await act(async () => {})
    expect(screen.getByTestId("mode").textContent).toBe("easy")
    expect(cookie()).toBe("easy")
  })

  it("does not overrule a ?view= link, even though the child effect runs first", async () => {
    search = "view=easy&deposit=usdc-stellar"
    mount("evm-wallet")
    await act(async () => {})
    expect(screen.getByTestId("mode").textContent).toBe("easy")
    expect(cookie()).toBe("easy")
    expect(window.localStorage.getItem("peridot.viewMode.origin")).toBe("explicit")
  })

  it("never overrides the toggle on a later sign-in", async () => {
    const { unmount } = mount(null)
    await act(async () => {})
    fireEvent.click(screen.getByText("toggle")) // easy → expert, by hand
    fireEvent.click(screen.getByText("toggle")) // back to easy, by hand
    unmount()
    mount("evm-wallet")
    await act(async () => {})
    expect(screen.getByTestId("mode").textContent).toBe("easy")
  })

  it("leaves a cookie from before this change alone", async () => {
    document.cookie = "peridot_view_mode=easy; path=/"
    mount("stellar-wallet")
    await act(async () => {})
    expect(screen.getByTestId("mode").textContent).toBe("easy")
    expect(window.localStorage.getItem("peridot.viewMode.origin")).toBe("explicit")
  })

  it("follows a change of sign-in while the mode is still a default", async () => {
    const first = mount("evm-wallet")
    await act(async () => {})
    first.unmount()
    mount("social", "expert")
    await act(async () => {})
    expect(screen.getByTestId("mode").textContent).toBe("easy")
    expect(cookie()).toBe("easy")
  })
})

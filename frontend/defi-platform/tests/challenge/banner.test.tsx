/**
 * ChallengeBanner — the strip must never lie about a challenge's state.
 *
 * The flag is a compile-time constant, so it is mocked per suite; the dates come
 * from the real `config/challenges.ts` and are driven with a fake clock, so the
 * test breaks if the configured window and the banner's copy ever disagree.
 */
import React from "react"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, act, fireEvent } from "@testing-library/react"

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: any) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>
      {children}
    </a>
  ),
}))

const flags = { MARGIN_TRADING_CHALLENGES: true }
vi.mock("@/config/featureFlags", async (orig) => {
  const actual = (await orig()) as any
  return { ...actual, FEATURE_FLAGS: new Proxy(actual.FEATURE_FLAGS, {
    get: (t, k) => (k === "MARGIN_TRADING_CHALLENGES" ? flags.MARGIN_TRADING_CHALLENGES : (t as any)[k]),
  }) }
})

import { ChallengeBanner, COUNTDOWN_PLACEHOLDER } from "@/app/app/margin/components/ChallengeBanner"
import { CHALLENGES, ENDED_CHALLENGE_VISIBLE_MS } from "@/config/challenges"

const CHALLENGE = CHALLENGES[0]
// An unannounced challenge masks every figure (config: `datesProvisional`). The
// expectations follow the config rather than hard-coding one of the two modes, so
// revealing the dates is a one-line config edit and not a test rewrite.
const MASKED = Boolean(CHALLENGE.datesProvisional)
const BEFORE = new Date(+new Date(CHALLENGE.startsAt) - 5 * 86_400_000) // 5 days early
const DURING = new Date(+new Date(CHALLENGE.startsAt) + 36 * 3600_000) // day two
const AFTER = new Date(+new Date(CHALLENGE.endsAt) + 3600_000)
const LONG_AFTER = new Date(+new Date(CHALLENGE.endsAt) + ENDED_CHALLENGE_VISIBLE_MS + 3600_000)

/** Renders and flushes the mount effects that set `now` / read localStorage. */
function renderAt(when: Date) {
  vi.setSystemTime(when)
  const utils = render(<ChallengeBanner />)
  act(() => {
    vi.advanceTimersByTime(1000)
  })
  return utils
}

// This jsdom setup ships a localStorage object without the full Storage API, so
// the banner's persistence gets a plain in-memory stand-in.
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

beforeEach(() => {
  flags.MARGIN_TRADING_CHALLENGES = true
  window.localStorage.clear()
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  vi.useRealTimers()
})

describe("ChallengeBanner", () => {
  it("renders nothing when the feature flag is off", () => {
    flags.MARGIN_TRADING_CHALLENGES = false
    const { container } = renderAt(DURING)
    expect(container.textContent).toBe("")
  })

  it("counts down to the start before the challenge begins", () => {
    renderAt(BEFORE)
    // Full countdown ("4d 23h"), not a rounded day figure — the strip IS the
    // launch countdown.
    expect(screen.getByTestId("challenge-banner-timing").textContent).toMatch(
      MASKED ? new RegExp(`^starts in ${COUNTDOWN_PLACEHOLDER}$`) : /^starts in \d+d \d{2}h$/,
    )
    expect(screen.queryByText(/left$/)).toBeNull()
  })

  it("never prints a figure while the window is unannounced", () => {
    if (!MASKED) return
    renderAt(BEFORE)
    // The prize is public; the clock is not. Only the timing pill is checked, so
    // the "$100 prize" digits don't count against it.
    expect(screen.getByTestId("challenge-banner-timing").textContent).not.toMatch(/\d/)
    renderAt(DURING)
    expect(screen.getAllByTestId("challenge-banner-timing")[1].textContent).toBe(
      `${COUNTDOWN_PLACEHOLDER} left`,
    )
  })

  it("shows a countdown and the leaderboard link while live", () => {
    renderAt(DURING)
    expect(screen.getByTestId("challenge-banner-timing").textContent).toMatch(/left$/)
    if (MASKED) expect(screen.getByTestId("challenge-banner-timing").textContent).toBe(`${COUNTDOWN_PLACEHOLDER} left`)
    expect(screen.getByText(`$${CHALLENGE.prizeUsd} prize`)).toBeTruthy()
    expect(screen.getByText("View leaderboard").getAttribute("href")).toBe("/app/margin/challenge")
  })

  it("stays visible as \"Ended\" once endsAt has passed", () => {
    renderAt(AFTER)
    expect(screen.getByTestId("challenge-banner-timing").textContent).toBe("Ended")
    // The way to the final standings must survive the bell.
    expect(screen.getByText("Final standings").getAttribute("href")).toBe("/app/margin/challenge")
  })

  it("stops featuring the challenge long after it ended", () => {
    const { container } = renderAt(LONG_AFTER)
    expect(container.textContent).toBe("")
  })

  it("stays dismissed for the same slug and comes back for a new one", () => {
    const { container, unmount } = renderAt(DURING)
    fireEvent.click(screen.getByLabelText("Dismiss challenge banner"))
    expect(container.textContent).toBe("")
    expect(window.localStorage.getItem(`peridot:challenge-banner-dismissed:${CHALLENGE.slug}`)).toBe("1")
    unmount()

    // Re-mount: still dismissed.
    const second = renderAt(DURING)
    expect(second.container.textContent).toBe("")
    second.unmount()

    // A different slug was never dismissed — the strip is back.
    window.localStorage.clear()
    window.localStorage.setItem("peridot:challenge-banner-dismissed:some-other-challenge", "1")
    renderAt(DURING)
    expect(screen.getByTestId("challenge-banner")).toBeTruthy()
  })
})

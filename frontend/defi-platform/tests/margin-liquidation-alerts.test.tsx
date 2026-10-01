/**
 * Being liquidated is the one thing that happens to a leveraged position without
 * the trader doing anything, and the only place it was ever announced was a
 * coloured badge in a table nobody is watching. The keeper covers the exits a
 * trader chose; this covers the one the market chooses for them.
 *
 * Every rule below is about not becoming noise — an alert people mute is worse
 * than no alert at all.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, act } from "@testing-library/react"
import { renderHook } from "@testing-library/react"
import {
  decideRiskAlerts,
  riskLevelFor,
  MARGIN_HEALTH_CRITICAL,
  MARGIN_HEALTH_CAUTION,
  RISK_ALERT_HYSTERESIS,
  type RiskLevel,
} from "@/app/app/margin/lib/riskAlerts"

const pos = (id: string, healthFactor: number, over: Record<string, unknown> = {}) =>
  ({ id, side: "Long" as const, healthFactor, ...over })

describe("what counts as trouble", () => {
  it("has three bands", () => {
    expect(riskLevelFor(pos("1", 2))).toBeNull()
    expect(riskLevelFor(pos("1", MARGIN_HEALTH_CAUTION - 0.01))).toBe("caution")
    expect(riskLevelFor(pos("1", MARGIN_HEALTH_CRITICAL - 0.01))).toBe("critical")
  })

  it("treats a health it couldn't read as no opinion", () => {
    // `healthUnknown` is the oracle failing to price the pair for a moment. The
    // value is 0 then, which is the loudest possible number and the least
    // trustworthy one — waking someone over an RPC hiccup would train them to
    // ignore the next warning.
    expect(riskLevelFor(pos("1", 0, { healthUnknown: true }))).toBeNull()
    expect(riskLevelFor(pos("1", Number.NaN))).toBeNull()
  })
})

describe("when it speaks", () => {
  it("warns once, then escalates rather than repeating", () => {
    const first = decideRiskAlerts({ positions: [pos("1", 1.3)], delivered: {} })
    expect(first.alerts).toHaveLength(1)
    expect(first.alerts[0].level).toBe("caution")

    // Same level again on the next poll: nothing.
    const again = decideRiskAlerts({ positions: [pos("1", 1.25)], delivered: first.delivered })
    expect(again.alerts).toHaveLength(0)

    // Worse: this is news.
    const worse = decideRiskAlerts({ positions: [pos("1", 1.04)], delivered: again.delivered })
    expect(worse.alerts).toHaveLength(1)
    expect(worse.alerts[0].level).toBe("critical")

    const stillBad = decideRiskAlerts({ positions: [pos("1", 1.02)], delivered: worse.delivered })
    expect(stillBad.alerts).toHaveLength(0)
  })

  it("needs a real recovery before it will warn again", () => {
    // A position parked on the threshold crosses it in both directions every
    // tick. Without hysteresis that is an alert every fifteen seconds.
    const delivered: Record<string, RiskLevel> = { "1": "critical" }
    const wobble = decideRiskAlerts({ positions: [pos("1", MARGIN_HEALTH_CRITICAL + 0.01)], delivered })
    expect(wobble.alerts).toHaveLength(0)
    expect(wobble.delivered["1"]).toBe("critical")

    const recovered = decideRiskAlerts({
      positions: [pos("1", MARGIN_HEALTH_CRITICAL + RISK_ALERT_HYSTERESIS + 0.01)],
      delivered,
    })
    expect(recovered.alerts).toHaveLength(0)
    expect(recovered.delivered["1"]).toBe("caution") // demoted, so a new dip is news

    const dipsAgain = decideRiskAlerts({ positions: [pos("1", 1.02)], delivered: recovered.delivered })
    expect(dipsAgain.alerts[0]?.level).toBe("critical")
  })

  it("forgets a position that got itself out of trouble", () => {
    const { alerts, delivered } = decideRiskAlerts({ positions: [pos("1", 3)], delivered: { "1": "critical" } })
    expect(alerts).toHaveLength(0)
    expect(delivered["1"]).toBeUndefined()
  })

  it("forgets a position that is gone", () => {
    // Closed positions never come back, so their ids must not accumulate.
    const { delivered } = decideRiskAlerts({ positions: [], delivered: { "1": "critical", "2": "caution" } })
    expect(Object.keys(delivered)).toHaveLength(0)
  })

  it("names the price it happens at, and what to do about it", () => {
    const { alerts } = decideRiskAlerts({
      positions: [pos("7", 1.03, { side: "Short", liqPriceUsd: 0.4123 })],
      delivered: {},
    })
    expect(alerts[0].title).toMatch(/short position is close to liquidation/i)
    expect(alerts[0].body).toContain("$0.4123")
    expect(alerts[0].body).toMatch(/add margin or close it yourself/i)
  })

  it("judges every position on its own", () => {
    const { alerts } = decideRiskAlerts({
      positions: [pos("1", 1.02), pos("2", 4), pos("3", 1.3)],
      delivered: {},
    })
    expect(alerts.map((a) => `${a.positionId}:${a.level}`)).toEqual(["1:critical", "3:caution"])
  })
})

// ── Delivery ────────────────────────────────────────────────────────────────
import { useStellarLiquidationAlerts } from "@/app/app/margin/hooks/use-stellar-liquidation-alerts"
import { StellarAlertToggle } from "@/app/app/margin/components/stellar/StellarAlertToggle"

class FakeNotification {
  static permission: NotificationPermission = "default"
  static requestPermission = vi.fn(async () => FakeNotification.permission)
  static sent: Array<{ title: string; options: NotificationOptions }> = []
  onclick: (() => void) | null = null
  constructor(title: string, options: NotificationOptions = {}) {
    FakeNotification.sent.push({ title, options })
  }
  close() {}
}

beforeEach(() => {
  FakeNotification.sent = []
  FakeNotification.permission = "default"
  FakeNotification.requestPermission = vi.fn(async () => FakeNotification.permission)
  ;(globalThis as never as { Notification: unknown }).Notification = FakeNotification
  // jsdom's localStorage is not always a full Storage here (see the
  // --localstorage-file warning vitest prints); the hook guards its own access
  // for the same reason — private mode throws on write.
  try { window.localStorage?.removeItem?.("peridot.margin.liqAlerts") } catch { /* ignore */ }
})

describe("delivery", () => {
  it("sends nothing until the trader has asked for it", () => {
    renderHook(() => useStellarLiquidationAlerts([pos("1", 1.01)]))
    expect(FakeNotification.sent).toHaveLength(0)
  })

  it("asks, then warns", async () => {
    FakeNotification.permission = "granted"
    const { result, rerender } = renderHook(({ p }) => useStellarLiquidationAlerts(p), {
      initialProps: { p: [pos("1", 3)] },
    })
    await act(async () => { await result.current.enable() })
    expect(result.current.enabled).toBe(true)

    rerender({ p: [pos("1", 1.01)] })
    expect(FakeNotification.sent).toHaveLength(1)
    expect(FakeNotification.sent[0].title).toMatch(/close to liquidation/i)
    // A critical warning that vanishes while the phone is in a pocket has done
    // nothing.
    expect(FakeNotification.sent[0].options.requireInteraction).toBe(true)
    expect(FakeNotification.sent[0].options.tag).toBe("peridot-margin-1")
  })

  it("does not re-ask a permission the browser already refused", async () => {
    FakeNotification.permission = "denied"
    const { result } = renderHook(() => useStellarLiquidationAlerts([]))
    await act(async () => { await result.current.enable() })
    expect(FakeNotification.requestPermission).not.toHaveBeenCalled()
    expect(result.current.enabled).toBe(false)
    expect(result.current.permission).toBe("denied")
  })

  it("stops when switched off", async () => {
    FakeNotification.permission = "granted"
    const { result, rerender } = renderHook(({ p }) => useStellarLiquidationAlerts(p), {
      initialProps: { p: [pos("1", 3)] },
    })
    await act(async () => { await result.current.enable() })
    act(() => { result.current.disable() })
    rerender({ p: [pos("1", 1.01)] })
    expect(FakeNotification.sent).toHaveLength(0)
  })
})

describe("the toggle", () => {
  it("offers, confirms and stops", () => {
    const onEnable = vi.fn(), onDisable = vi.fn()
    const { rerender } = render(
      <StellarAlertToggle enabled={false} permission="default" onEnable={onEnable} onDisable={onDisable} />,
    )
    fireEvent.click(screen.getByTestId("margin-alert-toggle"))
    expect(onEnable).toHaveBeenCalled()

    rerender(<StellarAlertToggle enabled permission="granted" onEnable={onEnable} onDisable={onDisable} />)
    expect(screen.getByTestId("margin-alert-toggle").textContent).toMatch(/warnings on/i)
    fireEvent.click(screen.getByTestId("margin-alert-toggle"))
    expect(onDisable).toHaveBeenCalled()
  })

  it("says so, and gives up, when the browser has blocked notifications", () => {
    // Re-requesting a denied permission resolves instantly with "denied" and
    // shows the user nothing — a button that kept trying would look broken.
    const onEnable = vi.fn()
    render(<StellarAlertToggle enabled={false} permission="denied" onEnable={onEnable} onDisable={vi.fn()} />)
    const btn = screen.getByTestId("margin-alert-toggle")
    expect(btn.textContent).toMatch(/blocked/i)
    fireEvent.click(btn)
    expect(onEnable).not.toHaveBeenCalled()
  })

  it("renders nothing where notifications don't exist at all", () => {
    render(<StellarAlertToggle enabled={false} permission="unsupported" onEnable={vi.fn()} onDisable={vi.fn()} />)
    expect(screen.queryByTestId("margin-alert-toggle")).toBeNull()
  })
})

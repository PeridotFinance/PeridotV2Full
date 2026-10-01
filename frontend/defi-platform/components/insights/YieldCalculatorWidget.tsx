"use client"

import { useMemo, useState } from "react"
import { usePostHog } from "posthog-js/react"
import { captureInsightsEvent } from "@/components/insights/analytics"

function projectYield(principal: number, apy: number, days: number) {
  const periods = 365
  const years = days / periods
  return principal * Math.pow(1 + apy / 100 / periods, periods * years)
}

export function YieldCalculatorWidget({ articleSlug }: { articleSlug: string }) {
  const posthog = usePostHog()
  const [principal, setPrincipal] = useState(1000)
  const [apy, setApy] = useState(12)
  const [days, setDays] = useState(180)
  const result = useMemo(() => projectYield(principal, apy, days), [principal, apy, days])
  const gain = Math.max(0, result - principal)

  return (
    <section className="insights-widget" aria-label="Yield Calculator">
      <h3>Yield Calculator</h3>
      <p>Simulate how APY and time horizon affect your expected position.</p>

      <div className="insights-widget__grid">
        <label>
          Deposit (USD)
          <input
            type="number"
            min={0}
            value={principal}
            onChange={(event) => setPrincipal(Number(event.target.value || 0))}
          />
        </label>
        <label>
          APY (%)
          <input type="number" min={0} value={apy} onChange={(event) => setApy(Number(event.target.value || 0))} />
        </label>
        <label>
          Duration (Days)
          <input type="number" min={1} value={days} onChange={(event) => setDays(Number(event.target.value || 1))} />
        </label>
      </div>

      <div className="insights-widget__result">
        <span>Projected value: ${result.toFixed(2)}</span>
        <span>Estimated gain: ${gain.toFixed(2)}</span>
      </div>

      <button
        type="button"
        className="insights-btn insights-btn--primary"
        onClick={() =>
          captureInsightsEvent(posthog, "insights_widget_calculate", {
            articleSlug,
            principal,
            apy,
            days,
            projected_end_value: Number(result.toFixed(2)),
          })
        }
      >
        Track calculation
      </button>
      <small>Note: simplified projection, not financial advice.</small>
    </section>
  )
}

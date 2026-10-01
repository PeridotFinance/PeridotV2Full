"use client"

import { useState } from "react"

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function formatCurrency(value: number): string {
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(1)}k`
  }
  return `$${Math.round(value).toLocaleString('en-US')}`
}

function HealthFactorCalculator() {
  const [collateral, setCollateral] = useState(2000)
  const [loan, setLoan] = useState(800)
  const [liqLtv, setLiqLtv] = useState(80)

  const hf = loan > 0 ? (collateral * liqLtv) / 100 / loan : Infinity
  const liquidationValue = liqLtv > 0 ? loan / (liqLtv / 100) : Infinity

  const zone: "safe" | "warning" | "danger" =
    hf >= 1.5 ? "safe" : hf >= 1.0 ? "warning" : "danger"

  const hfDisplay = isFinite(hf) ? hf.toFixed(2) : "∞"

  return (
    <div className="iab__calc-body">
      <div className="iab__slider-group">
        <label className="iab__slider-label" htmlFor="calc-collateral">
          Collateral Value
        </label>
        <div className="iab__slider-row">
          <input
            id="calc-collateral"
            type="range"
            className="iab__slider"
            min={500}
            max={10000}
            step={100}
            value={collateral}
            onChange={(e) => setCollateral(clamp(Number(e.target.value), 500, 10000))}
          />
          <span className="iab__slider-value">{formatCurrency(collateral)}</span>
        </div>
      </div>

      <div className="iab__slider-group">
        <label className="iab__slider-label" htmlFor="calc-loan">
          Loan Amount
        </label>
        <div className="iab__slider-row">
          <input
            id="calc-loan"
            type="range"
            className="iab__slider"
            min={100}
            max={5000}
            step={50}
            value={loan}
            onChange={(e) => setLoan(clamp(Number(e.target.value), 100, 5000))}
          />
          <span className="iab__slider-value">{formatCurrency(loan)}</span>
        </div>
      </div>

      <div className="iab__slider-group">
        <label className="iab__slider-label" htmlFor="calc-ltv">
          Liquidation LTV
        </label>
        <div className="iab__slider-row">
          <input
            id="calc-ltv"
            type="range"
            className="iab__slider"
            min={50}
            max={95}
            step={1}
            value={liqLtv}
            onChange={(e) => setLiqLtv(clamp(Number(e.target.value), 50, 95))}
          />
          <span className="iab__slider-value">{liqLtv}%</span>
        </div>
      </div>

      <div className="iab__result">
        <span
          className={`iab__result-number iab__result-number--${zone}`}
          data-hf-zone={zone}
        >
          {hfDisplay}
        </span>
        <span className="iab__result-label">Health Factor</span>
        <span className="iab__result-detail">
          Liquidation triggers at: {isFinite(liquidationValue) ? formatCurrency(liquidationValue) : "—"} collateral
        </span>
        {zone === "danger" && (
          <span className="iab__result-alert" role="alert">
            Warning: position will be liquidated!
          </span>
        )}
        {zone === "warning" && (
          <span className="iab__result-alert iab__result-alert--warning" role="alert">
            Caution: position is close to liquidation threshold.
          </span>
        )}
      </div>
    </div>
  )
}

export function CalculatorBlock({
  variant,
  label,
}: {
  variant: "health-factor" | "apy-vs-apr" | "yield-return"
  label?: string
}) {
  const title = label ?? (
    variant === "health-factor" ? "Health Factor Explorer" :
    variant === "apy-vs-apr" ? "APY vs APR Calculator" :
    "Yield Return Calculator"
  )

  return (
    <div className="iab iab--calculator">
      <div className="iab__calc-header">
        <span className="iab__eyebrow">
          <span className="iab__icon" aria-hidden="true">🧮</span>
          Interactive Calculator
        </span>
        <p className="iab__calc-title">{title}</p>
      </div>
      {variant === "health-factor" && <HealthFactorCalculator />}
      {variant !== "health-factor" && (
        <div className="iab__calc-body">
          <p style={{ color: "var(--insights-muted)", fontSize: "0.9rem" }}>
            This calculator variant is coming soon.
          </p>
        </div>
      )}
    </div>
  )
}

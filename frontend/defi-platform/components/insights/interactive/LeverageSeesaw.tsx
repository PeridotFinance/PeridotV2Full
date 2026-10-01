"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"

const MAX_LEVERAGE_DEFAULT = 5

// At leverage X, liquidation triggers at: entry * (1 - 1/X * liquidationBuffer)
// Simplified: liq distance % = 1/leverage * 0.9 (assuming 10% buffer consumed by fees/spread)
function liqDistance(leverage: number) {
  return Math.max(2, Math.round((1 / leverage) * 85))
}

function gainAt20(leverage: number) {
  return Math.round(20 * leverage)
}

const ZONE_COLOR = {
  safe:    "#35caa0",
  warning: "#f59e0b",
  danger:  "#ef4444",
}

function leverageZone(leverage: number): "safe" | "warning" | "danger" {
  if (leverage <= 2)   return "safe"
  if (leverage <= 3.5) return "warning"
  return "danger"
}

/* ── Beam visual ─────────────────────────────────────────── */
function SeesawBeam({ leverage, tipped }: { leverage: number; tipped: boolean }) {
  const zone  = leverageZone(leverage)
  const color = ZONE_COLOR[zone]
  // Tilt angle: left side heavy when leverage is low (balanced), tilts right as leverage increases
  const tiltDeg = tipped ? 35 : Math.min(20, (leverage - 1) / (MAX_LEVERAGE_DEFAULT - 1) * 22)

  const gainHeight  = Math.min(100, gainAt20(leverage) * 1.2)
  const liqHeight   = Math.min(100, liqDistance(leverage) * 1.2)

  return (
    <div style={{ position: "relative", height: 180, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", userSelect: "none" }}>

      {/* Left label (gain) */}
      <div style={{ position: "absolute", left: "8%", bottom: 60, textAlign: "center" }}>
        <motion.div
          animate={{ height: gainHeight, background: "#35caa0" }}
          transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
          style={{ width: 36, borderRadius: "4px 4px 0 0", marginBottom: 4, minHeight: 8 }}
        />
        <span style={{ fontSize: "0.64rem", fontWeight: 700, color: "#35caa0", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          +{gainAt20(leverage)}%
        </span>
        <div style={{ fontSize: "0.6rem", color: "var(--insights-muted)" }}>if +20%</div>
      </div>

      {/* Right label (liquidation) */}
      <div style={{ position: "absolute", right: "8%", bottom: 60, textAlign: "center" }}>
        <motion.div
          animate={{ height: liqHeight, background: color }}
          transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
          style={{ width: 36, borderRadius: "4px 4px 0 0", marginBottom: 4, minHeight: 8 }}
        />
        <span style={{ fontSize: "0.64rem", fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          -{liqDistance(leverage)}%
        </span>
        <div style={{ fontSize: "0.6rem", color: "var(--insights-muted)" }}>liquidation</div>
      </div>

      {/* Beam */}
      <motion.div
        animate={{ rotate: tipped ? 35 : (leverage - 1) / (MAX_LEVERAGE_DEFAULT - 1) * 12 }}
        transition={{ type: "spring", stiffness: 260, damping: 18 }}
        style={{
          position: "absolute",
          bottom: 52,
          width: "80%",
          height: 6,
          borderRadius: 3,
          background: `linear-gradient(90deg, #35caa0, ${color})`,
          transformOrigin: `${Math.round(50 + (leverage - 1) / (MAX_LEVERAGE_DEFAULT - 1) * 20)}% 50%`,
          boxShadow: `0 2px 12px ${color}44`,
        }}
      />

      {/* Fulcrum */}
      <motion.div
        animate={{ left: `${Math.round(50 + (leverage - 1) / (MAX_LEVERAGE_DEFAULT - 1) * 20)}%` }}
        transition={{ duration: 0.35 }}
        style={{
          position: "absolute",
          bottom: 30,
          transform: "translateX(-50%)",
          width: 0,
          height: 0,
          borderLeft: "10px solid transparent",
          borderRight: "10px solid transparent",
          borderBottom: `18px solid ${color}`,
          filter: `drop-shadow(0 2px 6px ${color}66)`,
        }}
      />

      {/* Ground */}
      <div style={{ width: "80%", height: 2, borderRadius: 1, background: "rgba(255,255,255,0.08)" }} />
    </div>
  )
}

/* ── Main component ──────────────────────────────────────── */
export function LeverageSeesaw({ maxLeverage = MAX_LEVERAGE_DEFAULT }: { maxLeverage?: number }) {
  const [leverage, setLeverage] = useState(1.5)
  const [tipped,   setTipped]   = useState(false)
  const zone   = leverageZone(leverage)
  const color  = ZONE_COLOR[zone]
  const pctSlider = ((leverage - 1) / (maxLeverage - 1)) * 100

  function handleChange(val: number) {
    setTipped(false)
    setLeverage(val)
  }

  function triggerTip() {
    if (leverage >= 4) setTipped(true)
  }

  return (
    <div className="iab iab--leverage-seesaw">

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem", gap: "0.75rem", flexWrap: "wrap" }}>
        <p className="iab__eyebrow" style={{ margin: 0 }}>
          <span className="iab__icon" aria-hidden="true">⚖️</span>
          Leverage Amplifier
        </p>
        <motion.span
          key={zone}
          initial={{ opacity: 0.5, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          style={{ fontSize: "0.72rem", fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.06em" }}
        >
          {leverage.toFixed(1)}×  — {zone}
        </motion.span>
      </div>

      {/* Seesaw visual */}
      <AnimatePresence mode="wait">
        {tipped ? (
          <motion.div
            key="tipped"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            style={{ textAlign: "center", padding: "2rem 1rem 1rem" }}
          >
            <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>💥</div>
            <p style={{ fontWeight: 700, color: ZONE_COLOR.danger, margin: "0 0 0.25rem" }}>
              Liquidated at {leverage.toFixed(1)}× leverage
            </p>
            <p style={{ fontSize: "0.8rem", color: "var(--insights-muted)", margin: "0 0 0.75rem" }}>
              Only a {liqDistance(leverage)}% price drop was needed.
            </p>
            <button
              type="button"
              onClick={() => { setTipped(false); setLeverage(1.5) }}
              style={{ fontSize: "0.78rem", fontWeight: 600, padding: "0.35rem 0.9rem", borderRadius: 7, border: "1px solid var(--insights-border)", background: "var(--insights-surface)", color: "var(--insights-text)", cursor: "pointer" }}
            >
              ↺ Reset
            </button>
          </motion.div>
        ) : (
          <motion.div key="beam">
            <SeesawBeam leverage={leverage} tipped={tipped} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Slider */}
      {!tipped && (
        <div style={{ marginTop: "0.75rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", color: "var(--insights-muted)", marginBottom: "0.4rem" }}>
            <span>1× (no leverage)</span>
            <span>{maxLeverage}× max</span>
          </div>
          <input
            type="range"
            min={1}
            max={maxLeverage}
            step={0.5}
            value={leverage}
            className="sb__spring-range"
            style={{ "--sp": `${pctSlider}%` } as React.CSSProperties}
            onChange={(e) => handleChange(Number(e.target.value))}
          />
          <div style={{ marginTop: "1rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", fontSize: "0.75rem" }}>
            <div style={{ background: "rgba(53,202,160,0.07)", border: "1px solid rgba(53,202,160,0.18)", borderRadius: 7, padding: "0.5rem 0.75rem" }}>
              <div style={{ color: "var(--insights-muted)", marginBottom: "0.2rem" }}>Gain if ETH +20%</div>
              <strong style={{ color: "#35caa0", fontVariantNumeric: "tabular-nums" }}>+{gainAt20(leverage)}%</strong>
            </div>
            <div style={{ background: `${color}10`, border: `1px solid ${color}30`, borderRadius: 7, padding: "0.5rem 0.75rem" }}>
              <div style={{ color: "var(--insights-muted)", marginBottom: "0.2rem" }}>Liquidation at</div>
              <strong style={{ color, fontVariantNumeric: "tabular-nums" }}>-{liqDistance(leverage)}% drop</strong>
            </div>
          </div>
          {leverage >= 4 && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              style={{ marginTop: "0.75rem", textAlign: "center" }}
            >
              <button
                type="button"
                onClick={triggerTip}
                style={{ fontSize: "0.78rem", fontWeight: 600, padding: "0.4rem 1rem", borderRadius: 7, border: `1px solid ${ZONE_COLOR.danger}44`, background: `${ZONE_COLOR.danger}12`, color: ZONE_COLOR.danger, cursor: "pointer" }}
              >
                Simulate a -{liqDistance(leverage)}% price drop →
              </button>
            </motion.div>
          )}
        </div>
      )}
    </div>
  )
}

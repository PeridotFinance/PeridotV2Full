"use client"

import { useState } from "react"
import { motion } from "framer-motion"

const KINK_DEFAULT = 80   // % utilization at which rates spike
const BASE_RATE    = 2    // % APR at 0% utilization
const KINK_RATE    = 8    // % APR at kink
const MAX_RATE     = 100  // % APR at 100% utilization

function borrowRate(utilization: number, kink: number): number {
  if (utilization <= kink) {
    return BASE_RATE + (KINK_RATE - BASE_RATE) * (utilization / kink)
  }
  const excess = (utilization - kink) / (100 - kink)
  return KINK_RATE + (MAX_RATE - KINK_RATE) * excess
}

function supplyRate(utilization: number, kink: number): number {
  return borrowRate(utilization, kink) * (utilization / 100) * 0.9 // 10% protocol fee
}

function rateColor(rate: number): string {
  if (rate < 10) return "#35caa0"
  if (rate < 30) return "#f59e0b"
  return "#ef4444"
}

function trafficColor(util: number, kink: number): string {
  if (util < kink * 0.75) return "#35caa0"
  if (util < kink)        return "#f59e0b"
  return "#ef4444"
}

/* ── Car dot ─────────────────────────────────────────────── */
function Car({ index, total, kink }: { index: number; total: number; kink: number }) {
  const util    = total   // utilization ≈ car count for display
  const color   = trafficColor(util, kink)
  // Stagger cars horizontally across the road
  const progress = total < 10
    ? index / 9
    : index / (total - 1)

  // Above kink, cars bunch up (lower spacing)
  const jam = util > kink
  const x   = jam
    ? 10 + progress * 55   // jammed in first 65%
    : 10 + progress * 80   // spread across 90%

  return (
    <motion.div
      layout
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1, x: `${x}%` }}
      exit={{ scale: 0, opacity: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 22, delay: index * 0.02 }}
      style={{
        position: "absolute",
        top: "50%",
        transform: "translateY(-50%)",
        width: 18,
        height: 10,
        borderRadius: 3,
        background: color,
        boxShadow: `0 0 6px ${color}66`,
        fontSize: 8,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#000",
        fontWeight: 800,
      }}
    />
  )
}

/* ── Rate curve ──────────────────────────────────────────── */
function RateCurve({ utilization, kink }: { utilization: number; kink: number }) {
  const W = 200
  const H = 80

  // Build path
  const points: string[] = []
  for (let u = 0; u <= 100; u += 2) {
    const r  = borrowRate(u, kink)
    const x  = (u / 100) * W
    const y  = H - (r / MAX_RATE) * H
    points.push(`${x},${y}`)
  }
  const pathD = "M" + points.join(" L")

  // Indicator dot
  const dotX = (utilization / 100) * W
  const dotY = H - (borrowRate(utilization, kink) / MAX_RATE) * H
  const kinkX = (kink / 100) * W
  const rate  = borrowRate(utilization, kink)
  const color = rateColor(rate)

  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H, overflow: "visible" }}>
        {/* Kink line */}
        <line x1={kinkX} y1={0} x2={kinkX} y2={H} stroke="rgba(245,158,11,0.3)" strokeWidth={1} strokeDasharray="3,3" />

        {/* Curve */}
        <path d={pathD} fill="none" stroke="rgba(53,202,160,0.4)" strokeWidth={1.5} />

        {/* Filled area under current position */}
        <path
          d={`M0,${H} L${points.slice(0, Math.ceil(utilization / 2) + 1).join(" L")} L${dotX},${H} Z`}
          fill={`${color}18`}
        />

        {/* Dot */}
        <motion.circle
          animate={{ cx: dotX, cy: dotY }}
          transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
          r={5}
          fill={color}
          filter={`drop-shadow(0 0 4px ${color})`}
        />
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.6rem", color: "var(--insights-muted)", marginTop: "0.2rem" }}>
        <span>0% util</span>
        <span style={{ color: "#f59e0b" }}>↑ kink {kink}%</span>
        <span>100% util</span>
      </div>
    </div>
  )
}

/* ── Main component ──────────────────────────────────────── */
export function RateHighway({ kinkUtilization = KINK_DEFAULT }: { kinkUtilization?: number }) {
  const [utilization, setUtilization] = useState(40)

  const kink    = kinkUtilization
  const bRate   = borrowRate(utilization, kink)
  const sRate   = supplyRate(utilization, kink)
  const color   = rateColor(bRate)
  const tColor  = trafficColor(utilization, kink)
  const carCount = Math.round(utilization / 10)  // 0–10 cars for display
  const pct     = utilization

  return (
    <div className="iab iab--rate-highway">

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem", gap: "0.75rem", flexWrap: "wrap" }}>
        <p className="iab__eyebrow" style={{ margin: 0 }}>
          <span className="iab__icon" aria-hidden="true">🛣️</span>
          Interest Rate Model
        </p>
        <motion.span
          key={Math.round(bRate)}
          initial={{ opacity: 0.5, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          style={{ fontSize: "0.72rem", fontWeight: 700, color, fontVariantNumeric: "tabular-nums", textTransform: "uppercase", letterSpacing: "0.06em" }}
        >
          {bRate.toFixed(1)}% borrow APR
        </motion.span>
      </div>

      {/* Highway */}
      <div style={{
        position: "relative",
        height: 44,
        borderRadius: 8,
        background: "#0d1a14",
        border: "1px solid rgba(255,255,255,0.06)",
        overflow: "hidden",
        marginBottom: "1rem",
      }}>
        {/* Road markings */}
        <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 1, borderTop: "1px dashed rgba(255,255,255,0.08)", transform: "translateY(-50%)" }} />
        {/* Kink marker */}
        <div style={{ position: "absolute", top: 0, bottom: 0, left: `${kink}%`, width: 1, background: "rgba(245,158,11,0.3)" }} />

        {/* Cars */}
        {Array.from({ length: carCount }, (_, i) => (
          <Car key={i} index={i} total={utilization} kink={kink} />
        ))}

        {/* Flow indicator (when empty/low) */}
        {carCount === 0 && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.65rem", color: "rgba(255,255,255,0.15)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            No borrowers — add utilization
          </div>
        )}
      </div>

      {/* Slider */}
      <div style={{ marginBottom: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", color: "var(--insights-muted)", marginBottom: "0.35rem" }}>
          <span>Utilization</span>
          <span style={{ color: tColor, fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{utilization}%{utilization > kink ? " ⚠ above kink" : ""}</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={utilization}
          className="sb__spring-range"
          style={{ "--sp": `${pct}%` } as React.CSSProperties}
          onChange={(e) => setUtilization(Number(e.target.value))}
        />
      </div>

      {/* Rate curve */}
      <RateCurve utilization={utilization} kink={kink} />

      {/* Stats */}
      <div style={{ marginTop: "0.75rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", fontSize: "0.75rem" }}>
        <div style={{ background: `${color}10`, border: `1px solid ${color}28`, borderRadius: 7, padding: "0.5rem 0.75rem" }}>
          <div style={{ color: "var(--insights-muted)", marginBottom: "0.2rem" }}>Borrow APR</div>
          <motion.strong
            key={Math.round(bRate * 10)}
            initial={{ opacity: 0.5 }}
            animate={{ opacity: 1 }}
            style={{ color, fontVariantNumeric: "tabular-nums" }}
          >
            {bRate.toFixed(1)}%
          </motion.strong>
        </div>
        <div style={{ background: "rgba(53,202,160,0.07)", border: "1px solid rgba(53,202,160,0.18)", borderRadius: 7, padding: "0.5rem 0.75rem" }}>
          <div style={{ color: "var(--insights-muted)", marginBottom: "0.2rem" }}>Supply APY</div>
          <motion.strong
            key={Math.round(sRate * 10)}
            initial={{ opacity: 0.5 }}
            animate={{ opacity: 1 }}
            style={{ color: "#35caa0", fontVariantNumeric: "tabular-nums" }}
          >
            {sRate.toFixed(1)}%
          </motion.strong>
        </div>
      </div>

      {utilization > kink && (
        <motion.p
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ fontSize: "0.73rem", color: "#f59e0b", marginTop: "0.6rem", margin: "0.6rem 0 0", lineHeight: 1.5 }}
        >
          Past the kink point — rates spike sharply to attract new deposits and slow borrowing demand.
        </motion.p>
      )}
    </div>
  )
}

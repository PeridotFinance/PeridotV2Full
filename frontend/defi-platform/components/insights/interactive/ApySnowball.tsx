"use client"

import { useState, useId } from "react"
import { motion, AnimatePresence } from "framer-motion"

const PRINCIPAL = 1000

function aprValue(rate: number, months: number) {
  return PRINCIPAL * (1 + (rate / 100) * (months / 12))
}

function apyValue(rate: number, months: number) {
  // Monthly compounding — standard in DeFi
  return PRINCIPAL * Math.pow(1 + rate / 100 / 12, months)
}

function effectiveApy(rate: number) {
  return (Math.pow(1 + rate / 100 / 12, 12) - 1) * 100
}

function fmt(n: number) {
  return "$" + n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function fmtPct(n: number) {
  return n.toFixed(n < 10 ? 2 : 1) + "%"
}

/* ── SVG growth chart ────────────────────────────────────── */
function GrowthChart({
  rate,
  months,
  uid,
}: {
  rate: number
  months: number
  uid: string
}) {
  const W = 300
  const H = 110
  const PAD_L = 8
  const PAD_R = 8
  const PAD_T = 12
  const PAD_B = 20
  const chartW = W - PAD_L - PAD_R
  const chartH = H - PAD_T - PAD_B

  const steps = 60
  const maxVal = Math.max(apyValue(rate, months) * 1.05, PRINCIPAL * 1.1)

  function toX(m: number) {
    return PAD_L + (m / months) * chartW
  }
  function toY(v: number) {
    return PAD_T + chartH - (v / maxVal) * chartH
  }

  // Build path points
  const aprPts: string[] = []
  const apyPts: string[] = []
  for (let i = 0; i <= steps; i++) {
    const m = (i / steps) * months
    aprPts.push(`${toX(m)},${toY(aprValue(rate, m))}`)
    apyPts.push(`${toX(m)},${toY(apyValue(rate, m))}`)
  }

  const aprPath = "M" + aprPts.join(" L")
  const apyPath = "M" + apyPts.join(" L")

  // Filled area under APY (the "extra compounding" gain)
  const fillBase = toY(PRINCIPAL)
  const apyFill  = `${apyPath} L${toX(months)},${fillBase} L${toX(0)},${fillBase} Z`
  const aprFill  = `${aprPath} L${toX(months)},${fillBase} L${toX(0)},${fillBase} Z`

  // Endpoint dots
  const aprEnd = { x: toX(months), y: toY(aprValue(rate, months)) }
  const apyEnd = { x: toX(months), y: toY(apyValue(rate, months)) }

  // Gap line at end
  const gapVisible = apyEnd.y < aprEnd.y - 4

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H }} aria-hidden>
      <defs>
        <linearGradient id={`${uid}-apr`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.02" />
        </linearGradient>
        <linearGradient id={`${uid}-apy`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#35caa0" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#35caa0" stopOpacity="0.03" />
        </linearGradient>
      </defs>

      {/* Principal baseline */}
      <line
        x1={PAD_L} y1={toY(PRINCIPAL)}
        x2={W - PAD_R} y2={toY(PRINCIPAL)}
        stroke="rgba(255,255,255,0.07)" strokeWidth={1} strokeDasharray="3 3"
      />

      {/* APR fill */}
      <path d={aprFill} fill={`url(#${uid}-apr)`} />
      {/* APY fill */}
      <path d={apyFill} fill={`url(#${uid}-apy)`} />

      {/* APR line */}
      <path d={aprPath} fill="none" stroke="#f59e0b" strokeWidth={1.5} strokeLinecap="round" />
      {/* APY line */}
      <path d={apyPath} fill="none" stroke="#35caa0" strokeWidth={2} strokeLinecap="round" />

      {/* Gap brace at end */}
      {gapVisible && (
        <>
          <line x1={aprEnd.x + 3} y1={aprEnd.y} x2={aprEnd.x + 3} y2={apyEnd.y}
            stroke="rgba(255,255,255,0.15)" strokeWidth={1} />
          <line x1={aprEnd.x + 1} y1={aprEnd.y} x2={aprEnd.x + 5} y2={aprEnd.y}
            stroke="rgba(255,255,255,0.15)" strokeWidth={1} />
          <line x1={aprEnd.x + 1} y1={apyEnd.y} x2={aprEnd.x + 5} y2={apyEnd.y}
            stroke="rgba(255,255,255,0.15)" strokeWidth={1} />
        </>
      )}

      {/* APR dot */}
      <motion.circle
        cx={aprEnd.x} cy={aprEnd.y}
        animate={{ cx: aprEnd.x, cy: aprEnd.y }}
        transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
        r={4} fill="#f59e0b"
      />
      {/* APY dot */}
      <motion.circle
        cx={apyEnd.x} cy={apyEnd.y}
        animate={{ cx: apyEnd.x, cy: apyEnd.y }}
        transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
        r={4} fill="#35caa0"
        filter="drop-shadow(0 0 4px #35caa066)"
      />

      {/* X axis labels */}
      <text x={PAD_L} y={H - 4} fill="rgba(255,255,255,0.3)" fontSize={8} fontFamily="Inter,sans-serif">0m</text>
      <text x={W / 2} y={H - 4} fill="rgba(255,255,255,0.3)" fontSize={8} textAnchor="middle" fontFamily="Inter,sans-serif">
        {Math.round(months / 2)}m
      </text>
      <text x={W - PAD_R} y={H - 4} fill="rgba(255,255,255,0.3)" fontSize={8} textAnchor="end" fontFamily="Inter,sans-serif">
        {months}m
      </text>
    </svg>
  )
}

/* ── Snowball size visual ─────────────────────────────────── */
function Snowball({ value, color, label }: { value: number; color: string; label: string }) {
  const size = Math.max(32, Math.min(88, 32 + ((value - PRINCIPAL) / PRINCIPAL) * 56))
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.4rem" }}>
      <motion.div
        animate={{ width: size, height: size }}
        transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
        style={{
          borderRadius: "50%",
          background: `radial-gradient(circle at 35% 35%, ${color}cc, ${color}55)`,
          border: `2px solid ${color}66`,
          boxShadow: `0 0 20px ${color}33`,
        }}
      />
      <motion.span
        key={Math.round(value)}
        initial={{ opacity: 0.5, y: 2 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ fontSize: "0.82rem", fontWeight: 800, color, fontVariantNumeric: "tabular-nums" }}
      >
        {fmt(value)}
      </motion.span>
      <span style={{ fontSize: "0.65rem", color: "var(--insights-muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
        {label}
      </span>
    </div>
  )
}

/* ── Main component ──────────────────────────────────────── */
export function ApySnowball({
  rate: initialRate = 24,
  months: initialMonths = 12,
}: {
  rate?: number
  months?: number
}) {
  const uid = useId().replace(/:/g, "")
  const [rate,   setRate]   = useState(initialRate)
  const [months, setMonths] = useState(initialMonths)

  const aprFinal = aprValue(rate, months)
  const apyFinal = apyValue(rate, months)
  const gain     = apyFinal - aprFinal
  const gainPct  = ((gain / aprFinal) * 100)
  const effApy   = effectiveApy(rate)
  const pctRate  = ((rate - 1) / 149) * 100
  const pctTime  = ((months - 1) / 35) * 100

  return (
    <div className="iab iab--apy-snowball">

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem", gap: "0.75rem", flexWrap: "wrap" }}>
        <p className="iab__eyebrow" style={{ margin: 0 }}>
          <span className="iab__icon" aria-hidden="true">❄️</span>
          APY vs APR
        </p>
        <AnimatePresence mode="wait">
          <motion.span
            key={`${Math.round(rate)}-${months}`}
            initial={{ opacity: 0.4, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            style={{
              fontSize: "0.72rem",
              fontWeight: 700,
              color: gainPct > 5 ? "#35caa0" : "var(--insights-muted)",
              fontVariantNumeric: "tabular-nums",
              letterSpacing: "0.04em",
            }}
          >
            +{fmt(gain)} from compounding
          </motion.span>
        </AnimatePresence>
      </div>

      {/* Snowballs */}
      <div style={{ display: "flex", justifyContent: "center", gap: "2.5rem", marginBottom: "1.25rem", alignItems: "flex-end" }}>
        <Snowball value={aprFinal} color="#f59e0b" label={`${rate}% APR`} />
        <Snowball value={apyFinal} color="#35caa0" label={`${fmtPct(effApy)} APY`} />
      </div>

      {/* Chart */}
      <div style={{ marginBottom: "1rem" }}>
        <GrowthChart rate={rate} months={months} uid={uid} />
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: "1rem", fontSize: "0.7rem", color: "var(--insights-muted)", marginBottom: "1rem", flexWrap: "wrap" }}>
        <span><span style={{ color: "#f59e0b", fontWeight: 700 }}>▬</span> APR — simple interest, no compounding</span>
        <span><span style={{ color: "#35caa0", fontWeight: 700 }}>▬</span> APY — compounded monthly</span>
      </div>

      {/* Sliders */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", color: "var(--insights-muted)", marginBottom: "0.35rem" }}>
            <span>Annual Rate (APR)</span>
            <span style={{ color: "#f59e0b", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{rate}%</span>
          </div>
          <input
            type="range" min={1} max={150} step={1}
            value={rate}
            className="sb__spring-range"
            style={{ "--sp": `${pctRate}%` } as React.CSSProperties}
            onChange={(e) => setRate(Number(e.target.value))}
          />
        </div>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", color: "var(--insights-muted)", marginBottom: "0.35rem" }}>
            <span>Time horizon</span>
            <span style={{ color: "var(--insights-text)", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
              {months < 12 ? `${months}mo` : `${(months / 12).toFixed(1)}yr`}
            </span>
          </div>
          <input
            type="range" min={1} max={36} step={1}
            value={months}
            className="sb__spring-range"
            style={{ "--sp": `${pctTime}%` } as React.CSSProperties}
            onChange={(e) => setMonths(Number(e.target.value))}
          />
        </div>
      </div>

      {/* Summary row */}
      <div style={{ marginTop: "1rem", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem", fontSize: "0.72rem" }}>
        <div style={{ background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.18)", borderRadius: 7, padding: "0.45rem 0.6rem" }}>
          <div style={{ color: "var(--insights-muted)", marginBottom: "0.15rem" }}>After APR</div>
          <strong style={{ color: "#f59e0b", fontVariantNumeric: "tabular-nums" }}>{fmt(aprFinal)}</strong>
        </div>
        <div style={{ background: "rgba(53,202,160,0.07)", border: "1px solid rgba(53,202,160,0.18)", borderRadius: 7, padding: "0.45rem 0.6rem" }}>
          <div style={{ color: "var(--insights-muted)", marginBottom: "0.15rem" }}>After APY</div>
          <strong style={{ color: "#35caa0", fontVariantNumeric: "tabular-nums" }}>{fmt(apyFinal)}</strong>
        </div>
        <div style={{ background: "rgba(53,202,160,0.05)", border: "1px solid rgba(53,202,160,0.12)", borderRadius: 7, padding: "0.45rem 0.6rem" }}>
          <div style={{ color: "var(--insights-muted)", marginBottom: "0.15rem" }}>Extra gain</div>
          <strong style={{ color: gainPct > 1 ? "#35caa0" : "var(--insights-muted)", fontVariantNumeric: "tabular-nums" }}>
            +{fmt(gain)}
          </strong>
        </div>
      </div>

      {gainPct > 3 && (
        <motion.p
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ fontSize: "0.72rem", color: "#35caa0", margin: "0.6rem 0 0", lineHeight: 1.5 }}
        >
          At {rate}% APR, compounding monthly turns {fmtPct(rate)} APR into {fmtPct(effApy)} APY.
          {gainPct > 20 && " The longer you wait, the wider the gap grows."}
        </motion.p>
      )}
    </div>
  )
}

"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"

/* ── Types & constants ───────────────────────────────────── */
type AssetType = "eth" | "btc" | "usdc"

const ASSET_VALUE: Record<AssetType, number> = { eth: 2000, btc: 35000, usdc: 500 }
const ASSET_LTV:   Record<AssetType, number> = { eth: 0.80, btc: 0.75,  usdc: 0.90 }
const ASSET_LABEL: Record<AssetType, string> = { eth: "⟠ ETH", btc: "₿ BTC", usdc: "◎ USDC" }
const ASSET_COLOR: Record<AssetType, string> = { eth: "#627eea", btc: "#f7931a", usdc: "#2775ca" }
const ASSET_AMOUNTS: Record<AssetType, number> = { eth: 1, btc: 0.5, usdc: 500 }
const ALL_ASSETS: AssetType[] = ["eth", "btc", "usdc"]

const ZONE_COLOR = { safe: "#35caa0", warning: "#f59e0b", danger: "#ef4444" }
const ZONE_LABEL = { safe: "Safe",    warning: "At risk",  danger: "Danger" }

function fmt(n: number) {
  return "$" + n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function calcBorrowable(stack: AssetType[]): number {
  return stack.reduce((s, t) => s + ASSET_AMOUNTS[t] * ASSET_VALUE[t] * ASSET_LTV[t], 0)
}

function calcCollateral(stack: AssetType[]): number {
  return stack.reduce((s, t) => s + ASSET_AMOUNTS[t] * ASSET_VALUE[t], 0)
}

function calcHF(borrowable: number, loan: number): number {
  if (loan <= 0) return Infinity
  return borrowable / loan
}

function hfZone(hf: number): "safe" | "warning" | "danger" {
  if (hf >= 1.5) return "safe"
  if (hf >= 1.0) return "warning"
  return "danger"
}

/* ── Step indicator ──────────────────────────────────────── */
function StepDots({ step }: { step: number }) {
  return (
    <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", marginBottom: "1.25rem" }}>
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          animate={{
            width: i === step ? 20 : 6,
            background: i === step ? "#35caa0" : i < step ? "#35caa066" : "rgba(255,255,255,0.15)",
          }}
          transition={{ duration: 0.25 }}
          style={{ height: 6, borderRadius: 3 }}
        />
      ))}
      <span style={{ fontSize: "0.65rem", color: "var(--insights-muted)", marginLeft: "0.35rem", textTransform: "uppercase", letterSpacing: "0.07em" }}>
        Step {step + 1} of 3
      </span>
    </div>
  )
}

/* ── Coin source button ──────────────────────────────────── */
function CoinButton({ type, onAdd }: { type: AssetType; onAdd: () => void }) {
  const val = ASSET_AMOUNTS[type] * ASSET_VALUE[type]
  return (
    <motion.button
      whileHover={{ scale: 1.04, y: -2 }}
      whileTap={{ scale: 0.93 }}
      onClick={onAdd}
      className={`vault-coin vault-coin--${type}`}
      style={{ flexDirection: "column", gap: "0.15rem", alignItems: "center", minWidth: 64, cursor: "pointer" }}
    >
      <span style={{ fontSize: "0.85em" }}>{ASSET_LABEL[type]}</span>
      <span style={{ fontSize: "0.6em", opacity: 0.75, fontVariantNumeric: "tabular-nums" }}>+{fmt(val)}</span>
    </motion.button>
  )
}

/* ── Asset pill in stack ─────────────────────────────────── */
function AssetPill({ type, onRemove }: { type: AssetType; onRemove: () => void }) {
  return (
    <motion.button
      layout
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.7, opacity: 0, transition: { duration: 0.12 } }}
      whileTap={{ scale: 0.9 }}
      onClick={onRemove}
      className={`vault-coin vault-coin--${type}`}
      style={{ cursor: "pointer" }}
      title="Click to remove"
    >
      {ASSET_LABEL[type]}
    </motion.button>
  )
}

/* ── HF gauge ────────────────────────────────────────────── */
function HFGauge({ hf, zone }: { hf: number; zone: "safe" | "warning" | "danger" }) {
  const display = isFinite(hf) ? hf.toFixed(2) : "∞"
  const pct = isFinite(hf) ? Math.min(100, Math.max(0, ((hf - 1) / 1.5) * 100)) : 100
  const color = ZONE_COLOR[zone]

  return (
    <div style={{ marginBottom: "1.25rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.4rem" }}>
        <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--insights-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Health Factor
        </span>
        <motion.span
          key={display}
          initial={{ opacity: 0.5, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          style={{ fontSize: "1.5rem", fontWeight: 800, color, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}
        >
          {display}
        </motion.span>
      </div>
      <div className={`health-bar health-bar--${zone}`}>
        <motion.div
          className="health-bar__fill"
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
        />
      </div>
    </div>
  )
}

/* ── Step 1: Collateral ──────────────────────────────────── */
function StepCollateral({
  stack,
  onAdd,
  onRemove,
  onNext,
}: {
  stack: AssetType[]
  onAdd: (t: AssetType) => void
  onRemove: (i: number) => void
  onNext: () => void
}) {
  const borrowable = calcBorrowable(stack)

  return (
    <div>
      <h3 style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--insights-text)", margin: "0 0 0.3rem" }}>
        What are you depositing?
      </h3>
      <p style={{ fontSize: "0.78rem", color: "var(--insights-muted)", margin: "0 0 1rem", lineHeight: 1.5 }}>
        Add assets as collateral. Each asset unlocks a portion of its value for borrowing.
      </p>

      {/* Add buttons */}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        {ALL_ASSETS.map((t) => <CoinButton key={t} type={t} onAdd={() => onAdd(t)} />)}
      </div>

      {/* Current stack */}
      <div style={{ minHeight: 36, display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "1rem" }}>
        <AnimatePresence>
          {stack.map((t, i) => (
            <AssetPill key={`${t}-${i}`} type={t} onRemove={() => onRemove(i)} />
          ))}
        </AnimatePresence>
        {stack.length === 0 && (
          <span style={{ fontSize: "0.75rem", color: "var(--insights-muted)", fontStyle: "italic" }}>
            No collateral yet — tap an asset above
          </span>
        )}
      </div>

      {/* Borrowing power preview */}
      {stack.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ fontSize: "0.78rem", color: "var(--insights-muted)", marginBottom: "1rem", padding: "0.6rem 0.85rem", background: "rgba(53,202,160,0.06)", border: "1px solid rgba(53,202,160,0.15)", borderRadius: 8 }}
        >
          Collateral: <strong style={{ color: "var(--insights-text)" }}>{fmt(calcCollateral(stack))}</strong>
          <span style={{ margin: "0 0.5rem", opacity: 0.4 }}>·</span>
          Borrowable: <strong style={{ color: "#35caa0" }}>{fmt(borrowable)}</strong>
        </motion.div>
      )}

      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        onClick={onNext}
        disabled={stack.length === 0}
        style={{
          width: "100%",
          padding: "0.6rem",
          borderRadius: 9,
          border: "none",
          background: stack.length > 0 ? "#35caa0" : "rgba(255,255,255,0.06)",
          color: stack.length > 0 ? "#0a1a14" : "var(--insights-muted)",
          fontWeight: 700,
          fontSize: "0.85rem",
          cursor: stack.length > 0 ? "pointer" : "not-allowed",
          transition: "background 0.2s",
        }}
      >
        Set loan amount →
      </motion.button>
    </div>
  )
}

/* ── Step 2: Loan amount ─────────────────────────────────── */
function StepLoan({
  borrowable,
  loan,
  setLoan,
  onBack,
  onNext,
}: {
  borrowable: number
  loan: number
  setLoan: (n: number) => void
  onBack: () => void
  onNext: () => void
}) {
  // Cap slider at 95% of borrowable to keep HF above 1.0
  const maxLoan  = Math.floor(borrowable * 0.95)
  const hf       = calcHF(borrowable, loan)
  const zone     = hfZone(hf)
  const pctSlider = loan > 0 ? ((loan / maxLoan) * 100) : 0
  const safePct  = Math.round((loan / borrowable) * 100)

  return (
    <div>
      <h3 style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--insights-text)", margin: "0 0 0.3rem" }}>
        How much do you want to borrow?
      </h3>
      <p style={{ fontSize: "0.78rem", color: "var(--insights-muted)", margin: "0 0 1.1rem", lineHeight: 1.5 }}>
        Your borrowing power is <strong style={{ color: "#35caa0" }}>{fmt(borrowable)}</strong>. The closer you borrow to the limit, the lower your health factor.
      </p>

      {/* HF preview */}
      <HFGauge hf={hf} zone={zone} />

      {/* Loan display */}
      <motion.div
        key={Math.round(loan / 100)}
        initial={{ opacity: 0.6 }}
        animate={{ opacity: 1 }}
        style={{ textAlign: "center", fontSize: "1.75rem", fontWeight: 800, color: ZONE_COLOR[zone], fontVariantNumeric: "tabular-nums", marginBottom: "0.5rem" }}
      >
        {fmt(loan)}
      </motion.div>
      <p style={{ textAlign: "center", fontSize: "0.7rem", color: "var(--insights-muted)", margin: "0 0 0.75rem" }}>
        {loan > 0 ? `${safePct}% of borrowing power used` : "Drag to set loan amount"}
      </p>

      {/* Slider */}
      <input
        type="range"
        min={0}
        max={maxLoan}
        step={Math.max(10, Math.round(maxLoan / 100))}
        value={loan}
        className="sb__spring-range"
        style={{ "--sp": `${pctSlider}%`, marginBottom: "1.25rem" } as React.CSSProperties}
        onChange={(e) => setLoan(Number(e.target.value))}
      />

      {/* Zone guidance */}
      <AnimatePresence mode="wait">
        {loan > 0 && (
          <motion.div
            key={zone}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            style={{
              fontSize: "0.73rem",
              color: ZONE_COLOR[zone],
              background: `${ZONE_COLOR[zone]}10`,
              border: `1px solid ${ZONE_COLOR[zone]}28`,
              borderRadius: 8,
              padding: "0.5rem 0.75rem",
              lineHeight: 1.5,
              marginBottom: "1rem",
            }}
          >
            {zone === "safe" && `✓ Health factor ${hf.toFixed(2)} — comfortable. A ${Math.round((1 - 1/hf) * 100)}% collateral drop would trigger liquidation.`}
            {zone === "warning" && `⚠ Health factor ${hf.toFixed(2)} — close to the limit. A ${Math.round((1 - 1/hf) * 100)}% drop would liquidate your position.`}
            {zone === "danger" && `✗ Health factor ${hf.toFixed(2)} — too close. Even a small price move puts this position at risk.`}
          </motion.div>
        )}
      </AnimatePresence>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
        <button
          type="button"
          onClick={onBack}
          style={{ padding: "0.55rem", borderRadius: 9, border: "1px solid var(--insights-border)", background: "none", color: "var(--insights-muted)", fontWeight: 600, fontSize: "0.82rem", cursor: "pointer" }}
        >
          ← Back
        </button>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          onClick={onNext}
          disabled={loan <= 0}
          style={{
            padding: "0.55rem",
            borderRadius: 9,
            border: "none",
            background: loan > 0 ? "#35caa0" : "rgba(255,255,255,0.06)",
            color: loan > 0 ? "#0a1a14" : "var(--insights-muted)",
            fontWeight: 700,
            fontSize: "0.82rem",
            cursor: loan > 0 ? "pointer" : "not-allowed",
            transition: "background 0.2s",
          }}
        >
          See your position →
        </motion.button>
      </div>
    </div>
  )
}

/* ── Step 3: Summary ─────────────────────────────────────── */
function StepSummary({
  stack,
  loan,
  borrowable,
  onBack,
  onReset,
}: {
  stack: AssetType[]
  loan: number
  borrowable: number
  onBack: () => void
  onReset: () => void
}) {
  const collateral = calcCollateral(stack)
  const hf         = calcHF(borrowable, loan)
  const zone       = hfZone(hf)
  const color      = ZONE_COLOR[zone]
  const ltvUsed    = Math.round((loan / borrowable) * 100)

  // Count assets
  const counts: Partial<Record<AssetType, number>> = {}
  stack.forEach((t) => { counts[t] = (counts[t] ?? 0) + 1 })

  const recs: string[] = []
  if (hf < 1.5 && hf >= 1.0) recs.push("Consider adding more collateral to bring HF above 1.5.")
  if (hf >= 2.0) recs.push("Strong position. You have headroom to weather a significant price drop.")
  if (ltvUsed > 70) recs.push("Borrowing above 70% of capacity — set a price alert.")
  if (stack.filter(t => t !== "usdc").length === 0) recs.push("All stablecoin collateral — low liquidation risk but limited growth.")

  return (
    <div>
      <h3 style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--insights-text)", margin: "0 0 1rem" }}>
        Your position
      </h3>

      <HFGauge hf={hf} zone={zone} />

      {/* Status badge */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.4rem",
          background: `${color}15`,
          border: `1px solid ${color}35`,
          borderRadius: 999,
          padding: "0.3rem 0.8rem",
          fontSize: "0.78rem",
          fontWeight: 700,
          color,
          marginBottom: "1rem",
        }}
      >
        {zone === "safe" && "✓"}
        {zone === "warning" && "⚠"}
        {zone === "danger" && "✗"}
        {ZONE_LABEL[zone]}
      </motion.div>

      {/* Stats grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.4rem", marginBottom: "1rem", fontSize: "0.75rem" }}>
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--insights-border)", borderRadius: 7, padding: "0.5rem 0.7rem" }}>
          <div style={{ color: "var(--insights-muted)", marginBottom: "0.15rem" }}>Collateral</div>
          <strong style={{ color: "var(--insights-text)", fontVariantNumeric: "tabular-nums" }}>{fmt(collateral)}</strong>
        </div>
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--insights-border)", borderRadius: 7, padding: "0.5rem 0.7rem" }}>
          <div style={{ color: "var(--insights-muted)", marginBottom: "0.15rem" }}>Loan</div>
          <strong style={{ color, fontVariantNumeric: "tabular-nums" }}>{fmt(loan)}</strong>
        </div>
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--insights-border)", borderRadius: 7, padding: "0.5rem 0.7rem" }}>
          <div style={{ color: "var(--insights-muted)", marginBottom: "0.15rem" }}>Borrowing power used</div>
          <strong style={{ color: ltvUsed > 70 ? "#f59e0b" : "var(--insights-text)", fontVariantNumeric: "tabular-nums" }}>{ltvUsed}%</strong>
        </div>
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--insights-border)", borderRadius: 7, padding: "0.5rem 0.7rem" }}>
          <div style={{ color: "var(--insights-muted)", marginBottom: "0.15rem" }}>Assets</div>
          <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
            {Object.entries(counts).map(([t, n]) => (
              <span key={t} style={{ color: ASSET_COLOR[t as AssetType], fontWeight: 700 }}>
                {ASSET_LABEL[t as AssetType]}{(n ?? 1) > 1 ? ` ×${n}` : ""}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Recommendations */}
      {recs.length > 0 && (
        <div style={{ fontSize: "0.73rem", color: "var(--insights-muted)", lineHeight: 1.6, marginBottom: "1rem" }}>
          {recs.map((r, i) => (
            <p key={i} style={{ margin: i === 0 ? 0 : "0.3rem 0 0" }}>→ {r}</p>
          ))}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
        <button
          type="button"
          onClick={onBack}
          style={{ padding: "0.55rem", borderRadius: 9, border: "1px solid var(--insights-border)", background: "none", color: "var(--insights-muted)", fontWeight: 600, fontSize: "0.82rem", cursor: "pointer" }}
        >
          ← Adjust
        </button>
        <button
          type="button"
          onClick={onReset}
          style={{ padding: "0.55rem", borderRadius: 9, border: "1px solid var(--insights-border)", background: "none", color: "var(--insights-muted)", fontWeight: 600, fontSize: "0.82rem", cursor: "pointer" }}
        >
          ↺ Start over
        </button>
      </div>
    </div>
  )
}

/* ── Main component ──────────────────────────────────────── */
export function PositionBuilder() {
  const [step, setStep]     = useState(0)
  const [stack, setStack]   = useState<AssetType[]>([])
  const [nextId, setNextId] = useState(0)
  const [loan, setLoan]     = useState(0)

  // We track stack as an array (with duplicates) and nextId just for key purposes
  // Simple: stack is just AssetType[]
  function addAsset(t: AssetType) {
    setStack((prev) => [...prev, t])
    setNextId((n) => n + 1)
  }
  function removeAsset(idx: number) {
    setStack((prev) => prev.filter((_, i) => i !== idx))
  }
  function reset() {
    setStep(0); setStack([]); setLoan(0); setNextId(0)
  }

  const borrowable = calcBorrowable(stack)

  // Clamp loan when going back and changing collateral
  const safeLoan = Math.min(loan, Math.floor(borrowable * 0.95))

  return (
    <div className="iab iab--position-builder">

      {/* Header */}
      <p className="iab__eyebrow" style={{ margin: "0 0 1rem" }}>
        <span className="iab__icon" aria-hidden="true">🏗️</span>
        Position Builder
      </p>

      <StepDots step={step} />

      <AnimatePresence mode="wait">
        {step === 0 && (
          <motion.div
            key="step-0"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            <StepCollateral
              stack={stack}
              onAdd={addAsset}
              onRemove={removeAsset}
              onNext={() => setStep(1)}
            />
          </motion.div>
        )}
        {step === 1 && (
          <motion.div
            key="step-1"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            <StepLoan
              borrowable={borrowable}
              loan={safeLoan}
              setLoan={setLoan}
              onBack={() => setStep(0)}
              onNext={() => setStep(2)}
            />
          </motion.div>
        )}
        {step === 2 && (
          <motion.div
            key="step-2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            <StepSummary
              stack={stack}
              loan={safeLoan}
              borrowable={borrowable}
              onBack={() => setStep(1)}
              onReset={reset}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

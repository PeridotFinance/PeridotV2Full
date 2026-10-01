"use client"

import { useState, useRef, useId } from "react"
import { motion, AnimatePresence, useSpring, useTransform, MotionValue } from "framer-motion"

const BLOCK_VALUE   = 200   // $ per block
const DRAG_REMOVE   = 72    // px drag threshold to remove
const LOAN_DEFAULT  = 800
const LTV_DEFAULT   = 80
const BLOCKS_DEFAULT = 9

function calcHF(blocks: number, loan: number, ltv: number) {
  if (loan <= 0) return Infinity
  return (blocks * BLOCK_VALUE * (ltv / 100)) / loan
}

function hfZone(hf: number): "safe" | "warning" | "danger" {
  if (hf >= 1.5) return "safe"
  if (hf >= 1.0) return "warning"
  return "danger"
}

const ZONE_COLOR = {
  safe:    "#35caa0",
  warning: "#f59e0b",
  danger:  "#ef4444",
}

/* ── Single draggable block ──────────────────────────────── */
function DraggableBlock({
  id,
  isCritical,
  onRemove,
}: {
  id: string
  isCritical: boolean
  onRemove: (id: string) => void
}) {
  const dragX = useSpring(0, { stiffness: 400, damping: 30 })
  const removed = useRef(false)

  // Subtle tilt while dragging
  const rotate = useTransform(dragX, [-160, 0, 160], [-8, 0, 8])
  const opacity = useTransform(dragX, [-140, -DRAG_REMOVE, 0, DRAG_REMOVE, 140], [0.2, 0.7, 1, 0.7, 0.2])

  return (
    <motion.div
      layout
      layoutId={id}
      className={`jenga-block${isCritical ? " jenga-block--critical" : ""}`}
      drag="x"
      dragConstraints={{ left: -160, right: 160 }}
      dragElastic={0.18}
      dragTransition={{ bounceStiffness: 320, bounceDamping: 28 }}
      style={{ x: dragX, rotate, opacity }}
      whileTap={{ scale: 1.04, cursor: "grabbing" }}
      onDragEnd={(_, info) => {
        if (removed.current) return
        if (Math.abs(info.offset.x) > DRAG_REMOVE) {
          removed.current = true
          onRemove(id)
        }
      }}
      title="Drag left or right to remove"
    />
  )
}

/* ── Loan weight bar ─────────────────────────────────────── */
function LoanWeight({ amount }: { amount: number }) {
  return (
    <motion.div
      className="jenga-loan-weight"
      animate={{ y: [0, -3, 0] }}
      transition={{ duration: 2.4, ease: "easeInOut", repeat: Infinity }}
      style={{ width: "100%", justifyContent: "center" }}
    >
      <span className="jenga-loan-weight__icon">⚖️</span>
      Loan ${amount.toLocaleString('en-US')}
    </motion.div>
  )
}

/* ── Health factor display ───────────────────────────────── */
function HFDisplay({ hf, zone }: { hf: number; zone: "safe" | "warning" | "danger" }) {
  const display = isFinite(hf) ? hf.toFixed(2) : "∞"
  return (
    <motion.span
      key={display}
      initial={{ opacity: 0.4, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
      style={{ color: ZONE_COLOR[zone], fontWeight: 800, fontVariantNumeric: "tabular-nums" }}
    >
      {display}
    </motion.span>
  )
}

/* ── Main component ──────────────────────────────────────── */
export function JengaBlock({
  loanAmount  = LOAN_DEFAULT,
  liqLtv      = LTV_DEFAULT,
  initialBlocks = BLOCKS_DEFAULT,
}: {
  loanAmount?:    number
  liqLtv?:        number
  initialBlocks?: number
}) {
  const uid = useId()

  const makeBlocks = () =>
    Array.from({ length: initialBlocks }, (_, i) => `${uid}-block-${i}`)

  const [blockIds, setBlockIds] = useState<string[]>(makeBlocks)
  const [collapsed, setCollapsed]   = useState(false)
  const [settling,  setSettling]    = useState(false)

  const hf   = calcHF(blockIds.length, loanAmount, liqLtv)
  const zone = hfZone(hf)
  const pct  = Math.min(100, Math.max(0, ((hf - 1) / 1.5) * 100))
  const isCritical = zone === "warning"

  function removeBlock(id: string) {
    setSettling(true)
    const next = blockIds.filter((b) => b !== id)
    setBlockIds(next)

    const nextHF = calcHF(next.length, loanAmount, liqLtv)
    setTimeout(() => setSettling(false), 350)

    if (nextHF < 1.0 && !collapsed) {
      setTimeout(() => setCollapsed(true), 280)
    }
  }

  function reset() {
    setCollapsed(false)
    setBlockIds(makeBlocks())
  }

  return (
    <div className="iab iab--jenga">

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem", gap: "0.75rem", flexWrap: "wrap" }}>
        <p className="iab__eyebrow" style={{ margin: 0 }}>
          <span className="iab__icon" aria-hidden="true">🧱</span>
          Collateral Tower
        </p>
        <div style={{ display: "flex", alignItems: "baseline", gap: "0.4rem" }}>
          <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--insights-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Health Factor
          </span>
          <HFDisplay hf={hf} zone={zone} />
        </div>
      </div>

      {/* ── Health bar ── */}
      <div className={`health-bar health-bar--${zone}`} style={{ marginBottom: "1.5rem" }}>
        <motion.div
          className="health-bar__fill"
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
        />
      </div>

      {/* ── Instruction ── */}
      {!collapsed && (
        <p style={{ fontSize: "0.78rem", color: "var(--insights-muted)", marginBottom: "1rem", margin: "0 0 1rem" }}>
          ← Drag blocks out to remove collateral. Watch the health factor fall. →
        </p>
      )}

      {/* ── Tower ── */}
      <AnimatePresence mode="popLayout">
        {!collapsed ? (
          <motion.div
            key="tower"
            className={`jenga-tower${isCritical ? " jenga-tower--critical" : ""}`}
            style={{ width: "100%", maxWidth: 380 }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
          >
            <LoanWeight amount={loanAmount} />
            <div style={{ height: 8 }} />
            <AnimatePresence>
              {blockIds.map((id) => (
                <DraggableBlock
                  key={id}
                  id={id}
                  isCritical={isCritical}
                  onRemove={removeBlock}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        ) : (
          /* ── Collapsed state ── */
          <motion.div
            key="collapsed"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ textAlign: "center", padding: "2rem 1rem" }}
          >
            <motion.div
              initial={{ scale: 0.5, rotate: -10 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 200, damping: 14 }}
              style={{ fontSize: "3rem", marginBottom: "0.75rem" }}
            >
              💥
            </motion.div>
            <p style={{ fontWeight: 700, fontSize: "1rem", color: ZONE_COLOR.danger, margin: "0 0 0.35rem" }}>
              Liquidation triggered.
            </p>
            <p style={{ fontSize: "0.85rem", color: "var(--insights-muted)", margin: "0 0 1.25rem" }}>
              Collateral fell to ${blockIds.length * BLOCK_VALUE} — below the ${(loanAmount / (liqLtv / 100)).toFixed(0)} threshold.
            </p>
            <button
              type="button"
              onClick={reset}
              style={{
                padding: "0.45rem 1.1rem",
                borderRadius: "8px",
                border: "1.5px solid var(--insights-border)",
                background: "var(--insights-surface)",
                color: "var(--insights-text)",
                fontSize: "0.82rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              ↺ Try again
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Collateral readout ── */}
      {!collapsed && (
        <div style={{
          marginTop: "1.25rem",
          paddingTop: "1rem",
          borderTop: "1px solid var(--insights-border)",
          display: "flex",
          justifyContent: "space-between",
          fontSize: "0.8rem",
          color: "var(--insights-muted)",
          flexWrap: "wrap",
          gap: "0.4rem",
        }}>
          <span>
            Collateral: <strong style={{ color: "var(--insights-text)" }}>${(blockIds.length * BLOCK_VALUE).toLocaleString('en-US')}</strong>
            <span style={{ marginLeft: "0.4rem", opacity: 0.6 }}>({blockIds.length} blocks × ${BLOCK_VALUE})</span>
          </span>
          <span>
            Liquidation at: <strong style={{ color: ZONE_COLOR.warning }}>
              ${((loanAmount / (liqLtv / 100))).toFixed(0)}
            </strong>
          </span>
        </div>
      )}

    </div>
  )
}

"use client"

import { Fragment, useState, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"

interface Position {
  id: number
  hf: number
  label: string
  debt: number
}

const INITIAL_POSITIONS: Position[] = [
  { id: 1, hf: 2.4,  label: "Alice",   debt: 5000  },
  { id: 2, hf: 1.8,  label: "Bob",     debt: 12000 },
  { id: 3, hf: 1.35, label: "Carol",   debt: 8000  },
  { id: 4, hf: 1.12, label: "Dave",    debt: 20000 },
  { id: 5, hf: 1.04, label: "Eve",     debt: 3000  },
  { id: 6, hf: 0.96, label: "Frank",   debt: 15000 },
]

// Each liquidation drops the price by a small %, which reduces everyone else's HF proportionally
const PRICE_IMPACT_PER_LIQ = 0.08  // 8% price drop per liquidation event

function hfColor(hf: number): string {
  if (hf >= 1.5)  return "#35caa0"
  if (hf >= 1.0)  return "#f59e0b"
  return "#ef4444"
}

function fmt(n: number) {
  return "$" + n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

/* ── Single domino ───────────────────────────────────────── */
function Domino({
  position,
  tipped,
  priceDrop,
  onTip,
  canTip,
}: {
  position: Position
  tipped: boolean
  priceDrop: number
  onTip: (id: number) => void
  canTip: boolean
}) {
  const currentHF = position.hf * (1 - priceDrop)
  const color     = hfColor(currentHF)
  const isUnder   = currentHF < 1.0

  return (
    <motion.div
      layout
      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.35rem", flex: "0 0 auto" }}
    >
      <motion.div
        animate={
          tipped
            ? { rotate: 90, y: 20, opacity: 0.4 }
            : isUnder && !tipped
            ? { rotate: [0, -3, 3, -2, 0], transition: { repeat: Infinity, duration: 1.2, ease: "easeInOut" } }
            : { rotate: 0, y: 0, opacity: 1 }
        }
        transition={{ type: "spring", stiffness: 280, damping: 18 }}
        style={{
          width: 36,
          height: 64,
          borderRadius: 5,
          border: `2px solid ${color}`,
          background: tipped
            ? `${color}18`
            : `linear-gradient(180deg, ${color}22 0%, ${color}0a 100%)`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 2,
          cursor: (!tipped && isUnder && canTip) ? "pointer" : "default",
          boxShadow: isUnder && !tipped ? `0 0 10px ${color}44` : "none",
          position: "relative",
        }}
        onClick={() => !tipped && isUnder && canTip && onTip(position.id)}
        title={(!tipped && isUnder) ? "Click to liquidate" : undefined}
      >
        {/* HF pips */}
        <span style={{ fontSize: "0.55rem", fontWeight: 800, color, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
          {currentHF.toFixed(2)}
        </span>
        {isUnder && !tipped && (
          <motion.span
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ repeat: Infinity, duration: 0.8 }}
            style={{ fontSize: "0.6rem" }}
          >
            ⚡
          </motion.span>
        )}
      </motion.div>
      <span style={{ fontSize: "0.6rem", color: tipped ? "var(--insights-muted)" : color, fontWeight: 600 }}>
        {position.label}
      </span>
      <span style={{ fontSize: "0.58rem", color: "var(--insights-muted)", fontVariantNumeric: "tabular-nums" }}>
        {fmt(position.debt)}
      </span>
    </motion.div>
  )
}

/* ── Cascade arrow ───────────────────────────────────────── */
function CascadeArrow({ active }: { active: boolean }) {
  return (
    <motion.div
      animate={{ opacity: active ? 1 : 0.15, scale: active ? 1.1 : 1 }}
      style={{ fontSize: "0.9rem", color: "#ef4444", alignSelf: "center", paddingBottom: 28, flexShrink: 0 }}
    >
      →
    </motion.div>
  )
}

/* ── Main component ──────────────────────────────────────── */
export function LiquidationDominoes() {
  const [tippedIds, setTippedIds]   = useState<number[]>([])
  const [priceDrop, setPriceDrop]   = useState(0)

  const tip = useCallback((id: number) => {
    setTippedIds((prev) => {
      if (prev.includes(id)) return prev
      return [...prev, id]
    })
    setPriceDrop((prev) => Math.min(0.6, prev + PRICE_IMPACT_PER_LIQ))
  }, [])

  function reset() {
    setTippedIds([])
    setPriceDrop(0)
  }

  const liquidatedDebt = INITIAL_POSITIONS
    .filter((p) => tippedIds.includes(p.id))
    .reduce((s, p) => s + p.debt, 0)

  const canTipNext = tippedIds.length < INITIAL_POSITIONS.length

  // Auto-cascade: after each tip, auto-tip any newly eligible position after a short delay
  // (we let the user click manually for maximum understanding)

  const totalLiquidatable = INITIAL_POSITIONS.filter((p) => {
    const currentHF = p.hf * (1 - priceDrop)
    return currentHF < 1.0 && !tippedIds.includes(p.id)
  }).length

  return (
    <div className="iab iab--liquidation-dominoes">

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem", gap: "0.75rem", flexWrap: "wrap" }}>
        <p className="iab__eyebrow" style={{ margin: 0 }}>
          <span className="iab__icon" aria-hidden="true">🁣</span>
          Liquidation Cascade
        </p>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          {tippedIds.length > 0 && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{ fontSize: "0.7rem", color: "#ef4444", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}
            >
              -{Math.round(priceDrop * 100)}% price
            </motion.span>
          )}
          {tippedIds.length > 0 && (
            <button
              type="button"
              onClick={reset}
              style={{ fontSize: "0.7rem", fontWeight: 600, padding: "0.25rem 0.6rem", borderRadius: 6, border: "1px solid var(--insights-border)", background: "none", color: "var(--insights-muted)", cursor: "pointer" }}
            >
              ↺ Reset
            </button>
          )}
        </div>
      </div>

      {/* Instruction */}
      {tippedIds.length === 0 && (
        <p style={{ fontSize: "0.75rem", color: "var(--insights-muted)", margin: "0 0 1rem", lineHeight: 1.5 }}>
          Frank's position (HF 0.96) is already underwater. Click ⚡ to liquidate — watch what happens to everyone else's health factor.
        </p>
      )}

      {/* Dominoes */}
      <div style={{ display: "flex", gap: "0.4rem", alignItems: "flex-start", overflowX: "auto", paddingBottom: "0.5rem" }}>
        {INITIAL_POSITIONS.map((pos, i) => (
          <Fragment key={pos.id}>
            <Domino
              position={pos}
              tipped={tippedIds.includes(pos.id)}
              priceDrop={priceDrop}
              onTip={tip}
              canTip={canTipNext}
            />
            {i < INITIAL_POSITIONS.length - 1 && (
              <CascadeArrow active={tippedIds.length > i} />
            )}
          </Fragment>
        ))}
      </div>

      {/* Status */}
      <AnimatePresence>
        {tippedIds.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            style={{ marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid var(--insights-border)" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", flexWrap: "wrap", gap: "0.4rem" }}>
              <span style={{ color: "var(--insights-muted)" }}>
                Liquidations: <strong style={{ color: "#ef4444" }}>{tippedIds.length}</strong>
              </span>
              <span style={{ color: "var(--insights-muted)" }}>
                Debt cleared: <strong style={{ color: "#f59e0b", fontVariantNumeric: "tabular-nums" }}>{fmt(liquidatedDebt)}</strong>
              </span>
              <span style={{ color: "var(--insights-muted)" }}>
                Price impact: <strong style={{ color: "#ef4444", fontVariantNumeric: "tabular-nums" }}>-{Math.round(priceDrop * 100)}%</strong>
              </span>
            </div>
            {totalLiquidatable > 0 && (
              <p style={{ fontSize: "0.72rem", color: "#f59e0b", marginTop: "0.4rem", margin: "0.4rem 0 0" }}>
                {totalLiquidatable} more position{totalLiquidatable > 1 ? "s are" : " is"} now underwater due to the price impact. Click ⚡ to continue the cascade.
              </p>
            )}
            {totalLiquidatable === 0 && tippedIds.length > 0 && (
              <p style={{ fontSize: "0.72rem", color: "#35caa0", marginTop: "0.4rem", margin: "0.4rem 0 0" }}>
                Cascade stopped — remaining positions absorbed the price impact.
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

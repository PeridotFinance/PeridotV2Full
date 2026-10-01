"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"

type AssetType = "eth" | "btc" | "usdc"

const ASSET_VALUE: Record<AssetType, number> = { eth: 2000, btc: 35000, usdc: 500 }
const ASSET_LTV:   Record<AssetType, number> = { eth: 0.80, btc: 0.75,  usdc: 0.90 }
const ASSET_LABEL: Record<AssetType, string> = { eth: "⟠ ETH", btc: "₿ BTC", usdc: "◎ USDC" }
const ASSET_COLOR: Record<AssetType, string> = { eth: "#627eea", btc: "#f7931a", usdc: "#2775ca" }

const ALL_ASSETS: AssetType[] = ["eth", "btc", "usdc"]

const DEFAULT_ASSETS: AssetType[] = ["eth", "eth", "usdc"]

function fmt(n: number) {
  return "$" + n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

/* ── Single asset row in the stack ──────────────────────── */
function AssetRow({
  type,
  onRemove,
}: {
  type: AssetType
  onRemove: () => void
}) {
  const value    = ASSET_VALUE[type]
  const ltv      = ASSET_LTV[type]
  const borrowable = value * ltv
  const buffer   = value * (1 - ltv)
  const color    = ASSET_COLOR[type]

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 16, transition: { duration: 0.15 } }}
      transition={{ type: "spring", stiffness: 360, damping: 26 }}
      style={{ marginBottom: "0.5rem" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.3rem" }}>
        <span style={{ fontSize: "0.78rem", fontWeight: 700, color, minWidth: 60 }}>
          {ASSET_LABEL[type]}
        </span>
        <span style={{ fontSize: "0.7rem", color: "var(--insights-muted)", fontVariantNumeric: "tabular-nums", flex: 1 }}>
          {fmt(value)} · {Math.round(ltv * 100)}% LTV
        </span>
        <button
          type="button"
          onClick={onRemove}
          style={{ fontSize: "0.65rem", color: "var(--insights-muted)", background: "none", border: "none", cursor: "pointer", padding: "0.1rem 0.3rem", lineHeight: 1 }}
          title="Remove"
        >
          ✕
        </button>
      </div>
      {/* Two-tone bar */}
      <div style={{ display: "flex", borderRadius: 4, overflow: "hidden", height: 10 }}>
        <motion.div
          layout
          style={{ background: color, flex: borrowable, opacity: 0.85 }}
          title={`Borrowable: ${fmt(borrowable)}`}
        />
        <motion.div
          layout
          style={{ background: "rgba(245,158,11,0.35)", flex: buffer }}
          title={`Buffer: ${fmt(buffer)}`}
        />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.63rem", color: "var(--insights-muted)", marginTop: "0.2rem" }}>
        <span style={{ color }}>▮ Borrowable {fmt(borrowable)}</span>
        <span style={{ color: "#f59e0b" }}>▮ Safety buffer {fmt(buffer)}</span>
      </div>
    </motion.div>
  )
}

/* ── Main component ──────────────────────────────────────── */
export function BorrowingPowerStack({
  assets: initialAssets = DEFAULT_ASSETS,
}: {
  assets?: AssetType[]
}) {
  const [stack, setStack] = useState<Array<{ id: number; type: AssetType }>>(() =>
    initialAssets.map((type, i) => ({ id: i, type }))
  )
  const [nextId, setNextId] = useState(initialAssets.length)

  const totalCollateral = stack.reduce((s, c) => s + ASSET_VALUE[c.type], 0)
  const totalBorrowable = stack.reduce((s, c) => s + ASSET_VALUE[c.type] * ASSET_LTV[c.type], 0)
  const totalBuffer     = totalCollateral - totalBorrowable
  const pct             = totalCollateral > 0 ? (totalBorrowable / totalCollateral) * 100 : 0

  function add(type: AssetType) {
    setStack((prev) => [...prev, { id: nextId, type }])
    setNextId((n) => n + 1)
  }

  function remove(id: number) {
    setStack((prev) => prev.filter((c) => c.id !== id))
  }

  return (
    <div className="iab iab--borrowing-power">

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem", gap: "0.75rem", flexWrap: "wrap" }}>
        <p className="iab__eyebrow" style={{ margin: 0 }}>
          <span className="iab__icon" aria-hidden="true">📊</span>
          Borrowing Power
        </p>
        <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#35caa0", fontVariantNumeric: "tabular-nums" }}>
          {fmt(totalBorrowable)} available
        </span>
      </div>

      {/* Add buttons */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.25rem", flexWrap: "wrap" }}>
        {ALL_ASSETS.map((type) => (
          <motion.button
            key={type}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.93 }}
            onClick={() => add(type)}
            style={{
              fontSize: "0.75rem",
              fontWeight: 600,
              color: ASSET_COLOR[type],
              background: `${ASSET_COLOR[type]}18`,
              border: `1px solid ${ASSET_COLOR[type]}44`,
              borderRadius: 7,
              padding: "0.3rem 0.75rem",
              cursor: "pointer",
            }}
          >
            + {ASSET_LABEL[type]}
          </motion.button>
        ))}
      </div>

      {/* Asset stack */}
      <div style={{ marginBottom: "1rem", minHeight: 60 }}>
        <AnimatePresence>
          {stack.length === 0 && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{ fontSize: "0.8rem", color: "var(--insights-muted)", textAlign: "center", padding: "1rem 0" }}
            >
              Add assets above to see your borrowing power.
            </motion.p>
          )}
          {stack.map((c) => (
            <AssetRow key={c.id} type={c.type} onRemove={() => remove(c.id)} />
          ))}
        </AnimatePresence>
      </div>

      {/* Summary bar */}
      {stack.length > 0 && (
        <>
          <div style={{ height: 14, borderRadius: 7, overflow: "hidden", display: "flex", marginBottom: "0.5rem" }}>
            <motion.div
              animate={{ flex: totalBorrowable }}
              transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
              style={{ background: "#35caa0" }}
            />
            <motion.div
              animate={{ flex: Math.max(totalBuffer, 0) }}
              transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
              style={{ background: "rgba(245,158,11,0.4)" }}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "var(--insights-muted)", flexWrap: "wrap", gap: "0.4rem" }}>
            <span>
              <strong style={{ color: "#35caa0" }}>{fmt(totalBorrowable)}</strong>
              <span style={{ marginLeft: "0.3rem" }}>borrowable ({Math.round(pct)}%)</span>
            </span>
            <span>
              <strong style={{ color: "#f59e0b" }}>{fmt(totalBuffer)}</strong>
              <span style={{ marginLeft: "0.3rem" }}>safety buffer</span>
            </span>
          </div>
          <p style={{ fontSize: "0.72rem", color: "var(--insights-muted)", marginTop: "0.6rem", margin: "0.6rem 0 0", lineHeight: 1.5 }}>
            Not all collateral is borrowable — each asset's LTV determines how much the protocol trusts it.
            USDC scores highest at 90%. Volatile assets get lower LTVs to protect the protocol.
          </p>
        </>
      )}
    </div>
  )
}

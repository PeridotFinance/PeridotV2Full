"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"

type CoinType = "eth" | "btc" | "usdc"

const COIN_VALUE: Record<CoinType, number> = {
  eth:  2000,
  btc:  35000,
  usdc: 1,
}

const COIN_LABEL: Record<CoinType, string> = {
  eth:  "⟠ ETH",
  btc:  "₿ BTC",
  usdc: "◎ USDC",
}

const COIN_AMOUNTS: Record<CoinType, number> = {
  eth:  1,
  btc:  0.5,
  usdc: 500,
}

const AVAILABLE: CoinType[] = ["eth", "btc", "usdc"]

const TARGET_DEFAULT = 5000

function vaultModifier(pct: number, isBreaking: boolean): string {
  if (isBreaking) return "vault--breaking"
  if (pct <= 0)   return "vault--empty"
  if (pct < 35)   return "vault--quarter"
  if (pct < 65)   return "vault--half"
  if (pct < 90)   return "vault--three-quarters"
  return "vault--full"
}

/* ── Single coin token in the vault ─────────────────────── */
function VaultCoin({
  type,
  onRemove,
}: {
  type: CoinType
  onRemove: () => void
}) {
  return (
    <motion.button
      layout
      initial={{ scale: 0, y: -20, opacity: 0 }}
      animate={{ scale: 1, y: 0, opacity: 1 }}
      exit={{ scale: 0.6, opacity: 0, transition: { duration: 0.15 } }}
      whileHover={{ scale: 1.06 }}
      whileTap={{ scale: 0.9 }}
      transition={{ type: "spring", stiffness: 380, damping: 22 }}
      onClick={onRemove}
      className={`vault-coin vault-coin--${type}`}
      title="Click to remove"
      style={{ cursor: "pointer" }}
    >
      {COIN_LABEL[type]}
    </motion.button>
  )
}

/* ── Available coin button ───────────────────────────────── */
function CoinSource({
  type,
  onAdd,
}: {
  type: CoinType
  onAdd: (t: CoinType) => void
}) {
  const amount = COIN_AMOUNTS[type]
  const value  = amount * COIN_VALUE[type]

  return (
    <motion.button
      whileHover={{ scale: 1.04, y: -2 }}
      whileTap={{ scale: 0.93 }}
      transition={{ type: "spring", stiffness: 380, damping: 22 }}
      onClick={() => onAdd(type)}
      className={`vault-coin vault-coin--${type}`}
      style={{
        cursor: "pointer",
        flexDirection: "column",
        gap: "0.2rem",
        alignItems: "center",
        minWidth: 72,
      }}
      title={`Add ${amount} ${type.toUpperCase()} ($${value.toLocaleString('en-US')})`}
    >
      <span style={{ fontSize: "0.9em" }}>{COIN_LABEL[type]}</span>
      <span style={{ fontSize: "0.65em", opacity: 0.7, fontVariantNumeric: "tabular-nums" }}>
        +${value.toLocaleString('en-US')}
      </span>
    </motion.button>
  )
}

/* ── Main component ──────────────────────────────────────── */
export function VaultBuilder({
  initialCoins = [],
  targetCollateral = TARGET_DEFAULT,
}: {
  initialCoins?: CoinType[]
  targetCollateral?: number
}) {
  const [coins, setCoins] = useState<Array<{ id: number; type: CoinType }>>(() =>
    initialCoins.map((type, i) => ({ id: i, type }))
  )
  const [nextId, setNextId] = useState(initialCoins.length)

  const totalValue = coins.reduce((sum, c) => sum + COIN_AMOUNTS[c.type] * COIN_VALUE[c.type], 0)
  const fillPct    = Math.min(100, (totalValue / targetCollateral) * 100)
  const isBreaking = coins.length > 0 && fillPct < 20 && totalValue > 0
  const modifier   = vaultModifier(fillPct, false)
  const reached    = totalValue >= targetCollateral

  function addCoin(type: CoinType) {
    setCoins((prev) => [...prev, { id: nextId, type }])
    setNextId((n) => n + 1)
  }

  function removeCoin(id: number) {
    setCoins((prev) => prev.filter((c) => c.id !== id))
  }

  function reset() {
    setCoins(initialCoins.map((type, i) => ({ id: i, type })))
    setNextId(initialCoins.length)
  }

  return (
    <div className="iab iab--vault-builder">

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem", gap: "0.75rem", flexWrap: "wrap" }}>
        <p className="iab__eyebrow" style={{ margin: 0 }}>
          <span className="iab__icon" aria-hidden="true">🏦</span>
          Collateral Vault
        </p>
        <motion.span
          key={totalValue}
          initial={{ opacity: 0.5, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2 }}
          style={{
            fontSize: "0.72rem",
            fontWeight: 700,
            color: reached ? "#35caa0" : "var(--insights-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {reached ? "✓ Target reached" : `$${totalValue.toLocaleString('en-US')} / $${targetCollateral.toLocaleString('en-US')}`}
        </motion.span>
      </div>

      {/* ── Progress bar ── */}
      <div
        className="health-bar"
        style={{
          marginBottom: "1.5rem",
          background: "rgba(255,255,255,0.05)",
          borderColor: reached ? "rgba(53,202,160,0.3)" : undefined,
        }}
      >
        <motion.div
          className="health-bar__fill"
          animate={{
            width: `${fillPct}%`,
            background: reached
              ? "#35caa0"
              : fillPct > 60
              ? "#35caa0"
              : fillPct > 30
              ? "#f59e0b"
              : "#ef4444",
          }}
          transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
        />
      </div>

      <div style={{ display: "flex", gap: "1.5rem", alignItems: "flex-start", flexWrap: "wrap" }}>

        {/* ── Vault ── */}
        <div style={{ flex: "0 0 auto" }}>
          <p style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--insights-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.5rem", margin: "0 0 0.5rem" }}>
            Vault
          </p>
          <div className={`vault ${modifier}`} style={{ width: 160 }}>
            <div className="vault__fill" />
            <div className="vault__crack" />
            <div className="vault__content" style={{ flexWrap: "wrap", gap: "0.35rem", padding: "0.5rem" }}>
              <AnimatePresence>
                {coins.map((c) => (
                  <VaultCoin key={c.id} type={c.type} onRemove={() => removeCoin(c.id)} />
                ))}
              </AnimatePresence>
              {coins.length === 0 && (
                <span style={{ fontSize: "0.68rem", color: "rgba(255,255,255,0.2)", position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  empty
                </span>
              )}
            </div>
          </div>
          {coins.length > 0 && (
            <button
              type="button"
              onClick={reset}
              style={{
                marginTop: "0.6rem",
                fontSize: "0.72rem",
                fontWeight: 600,
                color: "var(--insights-muted)",
                background: "none",
                border: "1px solid var(--insights-border)",
                borderRadius: 6,
                padding: "0.3rem 0.65rem",
                cursor: "pointer",
                width: "100%",
              }}
            >
              ↺ Reset
            </button>
          )}
        </div>

        {/* ── Coin sources ── */}
        <div style={{ flex: 1, minWidth: 160 }}>
          <p style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--insights-muted)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 0.5rem" }}>
            Tap to add collateral
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem", marginBottom: "1rem" }}>
            {AVAILABLE.map((type) => (
              <CoinSource key={type} type={type} onAdd={addCoin} />
            ))}
          </div>
          <p style={{ fontSize: "0.75rem", color: "var(--insights-muted)", lineHeight: 1.5, margin: 0 }}>
            Each token type contributes different collateral value. Click vault coins to remove them.
            {reached && (
              <span style={{ display: "block", marginTop: "0.5rem", color: "#35caa0", fontWeight: 600 }}>
                You have enough collateral to borrow ${(totalValue * 0.8).toLocaleString('en-US')} at 80% LTV.
              </span>
            )}
          </p>

          {/* ── Breakdown ── */}
          {coins.length > 0 && (
            <div style={{ marginTop: "0.75rem", fontSize: "0.75rem", color: "var(--insights-muted)" }}>
              {(["eth", "btc", "usdc"] as CoinType[]).map((type) => {
                const count = coins.filter((c) => c.type === type).length
                if (count === 0) return null
                const val = count * COIN_AMOUNTS[type] * COIN_VALUE[type]
                return (
                  <div key={type} style={{ display: "flex", justifyContent: "space-between", padding: "0.2rem 0", borderBottom: "1px solid var(--insights-border)" }}>
                    <span>{COIN_LABEL[type]} ×{count}</span>
                    <strong style={{ color: "var(--insights-text)", fontVariantNumeric: "tabular-nums" }}>${val.toLocaleString('en-US')}</strong>
                  </div>
                )
              })}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "0.35rem 0 0", fontWeight: 700, color: "var(--insights-text)" }}>
                <span>Total</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>${totalValue.toLocaleString('en-US')}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

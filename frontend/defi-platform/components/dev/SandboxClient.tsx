"use client"

import { useState } from "react"
import { motion, useSpring, useTransform } from "framer-motion"
import "@/styles/interactive-blocks.css"
import "@/styles/sandbox.css"

/* ── Spring tuner ─────────────────────────────────────────── */
function SpringTuner() {
  const [stiffness, setStiffness] = useState(180)
  const [damping, setDamping] = useState(20)
  const [mass, setMass] = useState(1)
  const [key, setKey] = useState(0)

  const y = useSpring(0, { stiffness, damping, mass })

  function bounce() {
    y.set(-60)
    setTimeout(() => y.set(0), 30)
    setKey((k) => k + 1)
  }

  const pctStiffness = ((stiffness - 20) / (800 - 20)) * 100
  const pctDamping   = ((damping - 1) / (80 - 1)) * 100
  const pctMass      = ((mass - 0.1) / (4 - 0.1)) * 100

  return (
    <div className="sb__spring">
      <div className="sb__spring-controls">
        <div className="sb__spring-field">
          <div className="sb__spring-label">
            <span className="sb__spring-label-text">Stiffness</span>
            <span className="sb__spring-label-value">{stiffness}</span>
          </div>
          <input
            type="range" min={20} max={800} step={5}
            value={stiffness}
            className="sb__spring-range"
            style={{ "--sp": `${pctStiffness}%` } as React.CSSProperties}
            onChange={(e) => { setStiffness(Number(e.target.value)); setKey((k) => k + 1) }}
          />
        </div>
        <div className="sb__spring-field">
          <div className="sb__spring-label">
            <span className="sb__spring-label-text">Damping</span>
            <span className="sb__spring-label-value">{damping}</span>
          </div>
          <input
            type="range" min={1} max={80} step={1}
            value={damping}
            className="sb__spring-range"
            style={{ "--sp": `${pctDamping}%` } as React.CSSProperties}
            onChange={(e) => { setDamping(Number(e.target.value)); setKey((k) => k + 1) }}
          />
        </div>
        <div className="sb__spring-field">
          <div className="sb__spring-label">
            <span className="sb__spring-label-text">Mass</span>
            <span className="sb__spring-label-value">{mass.toFixed(1)}</span>
          </div>
          <input
            type="range" min={0.1} max={4} step={0.1}
            value={mass}
            className="sb__spring-range"
            style={{ "--sp": `${pctMass}%` } as React.CSSProperties}
            onChange={(e) => { setMass(Number(e.target.value)); setKey((k) => k + 1) }}
          />
        </div>
      </div>

      <div className="sb__spring-stage" onClick={bounce} title="Click to bounce">
        <motion.div
          key={key}
          className="spring-ball"
          style={{ y }}
          whileTap={{ scale: 0.9 }}
        />
        <span className="sb__spring-hint">click to bounce</span>
      </div>
    </div>
  )
}

/* ── Jenga block states showcase ─────────────────────────── */
function JengaStates() {
  const states: Array<{ label: string; modifier: string }> = [
    { label: "Rest",     modifier: "" },
    { label: "Hovered",  modifier: "jenga-block--hovered" },
    { label: "Dragging", modifier: "jenga-block--dragging" },
    { label: "Removed",  modifier: "jenga-block--removed" },
    { label: "Critical", modifier: "jenga-block--critical" },
    { label: "Collapsed",modifier: "jenga-block--collapsed" },
  ]

  return (
    <div className="sb__state-grid">
      {states.map(({ label, modifier }) => (
        <div key={label} className="sb__state-card">
          <span className="sb__state-label">{label}</span>
          <div className={`jenga-block ${modifier}`} />
        </div>
      ))}
    </div>
  )
}

/* ── Mini jenga towers ───────────────────────────────────── */
function JengaTowerStates() {
  const BLOCK_COUNT = 7

  return (
    <div className="sb__state-grid">
      {/* Normal tower */}
      <div className="sb__jenga-card">
        <span className="sb__state-label">Tower — safe (HF 2.0)</span>
        <div className="jenga-tower sb__jenga-tower-wrap">
          <div className="jenga-loan-weight"><span className="jenga-loan-weight__icon">⚖️</span>Loan $800</div>
          <div style={{ height: 6 }} />
          {Array.from({ length: BLOCK_COUNT }).map((_, i) => (
            <div key={i} className="jenga-block" />
          ))}
        </div>
        <div className="health-bar health-bar--safe" style={{ marginTop: 4 }}>
          <div className="health-bar__fill" style={{ width: "80%" }} />
        </div>
      </div>

      {/* Critical tower */}
      <div className="sb__jenga-card">
        <span className="sb__state-label">Tower — critical (HF 1.1)</span>
        <div className="jenga-tower jenga-tower--critical sb__jenga-tower-wrap">
          <div className="jenga-loan-weight"><span className="jenga-loan-weight__icon">⚖️</span>Loan $800</div>
          <div style={{ height: 6 }} />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="jenga-block jenga-block--critical" />
          ))}
        </div>
        <div className="health-bar health-bar--danger" style={{ marginTop: 4 }}>
          <div className="health-bar__fill" style={{ width: "18%" }} />
        </div>
      </div>

      {/* Mixed tower (some removed) */}
      <div className="sb__jenga-card">
        <span className="sb__state-label">Tower — with gaps (HF 1.5)</span>
        <div className="jenga-tower sb__jenga-tower-wrap">
          <div className="jenga-loan-weight"><span className="jenga-loan-weight__icon">⚖️</span>Loan $800</div>
          <div style={{ height: 6 }} />
          {[false, true, false, false, true, false, false].map((removed, i) => (
            <div key={i} className={`jenga-block ${removed ? "jenga-block--removed" : ""}`} />
          ))}
        </div>
        <div className="health-bar health-bar--warning" style={{ marginTop: 4 }}>
          <div className="health-bar__fill" style={{ width: "42%" }} />
        </div>
      </div>
    </div>
  )
}

/* ── Vault states showcase ───────────────────────────────── */
function VaultStates() {
  const vaultStates: Array<{ label: string; modifier: string; fill: number; coins?: string[] }> = [
    { label: "Empty",          modifier: "vault--empty",          fill: 0 },
    { label: "25% — $500",     modifier: "vault--quarter",        fill: 25, coins: ["eth"] },
    { label: "50% — $1,000",   modifier: "vault--half",           fill: 50, coins: ["eth", "usdc"] },
    { label: "75% — $1,500",   modifier: "vault--three-quarters", fill: 75, coins: ["eth", "btc", "usdc"] },
    { label: "Full — $2,000",  modifier: "vault--full",           fill: 100, coins: ["eth", "btc", "usdc"] },
    { label: "Breaking — HF<1",modifier: "vault--breaking",       fill: 30, coins: ["eth"] },
  ]

  return (
    <div className="sb__vault-grid">
      {vaultStates.map(({ label, modifier, coins }) => (
        <div key={label} className="sb__vault-card">
          <span className="sb__state-label">{label}</span>
          <div className={`vault ${modifier}`} style={{ height: 110 }}>
            <div className="vault__fill" />
            <div className="vault__crack" />
            <div className="vault__content">
              {(coins ?? []).map((type, i) => (
                <div key={i} className={`vault-coin vault-coin--${type}`}>
                  {type === "eth" ? "⟠ ETH" : type === "btc" ? "₿ BTC" : "◎ USDC"}
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

/* ── Token coin states ───────────────────────────────────── */
function CoinStates() {
  type CoinVariant = "eth" | "btc" | "usdc"
  const coins: CoinVariant[] = ["eth", "btc", "usdc"]
  const coinStates = ["idle", "hovered", "dragging", "dropping"] as const
  const icons: Record<CoinVariant, string> = { eth: "⟠ ETH", btc: "₿ BTC", usdc: "◎ USDC" }

  return (
    <div className="sb__state-grid">
      {coinStates.map((state) => (
        <div key={state} className="sb__state-card">
          <span className="sb__state-label">{state}</span>
          <div className="sb__coin-row">
            {coins.map((coin) => (
              <div
                key={coin}
                className={`vault-coin vault-coin--${coin} vault-coin--${state}`}
              >
                {icons[coin]}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ── Health bar states ───────────────────────────────────── */
function HealthBarStates() {
  const bars = [
    { label: "Safe",    zone: "safe",    value: "2.40", width: "80%" },
    { label: "Warning", zone: "warning", value: "1.25", width: "40%" },
    { label: "Danger",  zone: "danger",  value: "0.88", width: "12%" },
  ] as const

  return (
    <div className="sb__hbar-grid">
      {bars.map(({ label, zone, value, width }) => (
        <div key={zone} className="sb__hbar-row">
          <span className="sb__hbar-row-label">{label}</span>
          <div className={`health-bar health-bar--${zone}`}>
            <div className="health-bar__fill" style={{ width }} />
          </div>
          <span className={`sb__hbar-value sb__hbar-value--${zone}`}>{value}</span>
        </div>
      ))}
    </div>
  )
}

/* ── Color reference ─────────────────────────────────────── */
const SWATCHES = [
  { label: "Yield",   color: "#2b8f77" },
  { label: "Yield DK",color: "#35caa0" },
  { label: "Safe",    color: "#35caa0" },
  { label: "Warning", color: "#d97706" },
  { label: "Danger",  color: "#dc2626" },
  { label: "ETH",     color: "#627eea" },
  { label: "BTC",     color: "#f7931a" },
  { label: "USDC",    color: "#2775ca" },
  { label: "Wood L",  color: "#dfc07a" },
  { label: "Wood M",  color: "#c8a355" },
  { label: "Wood D",  color: "#9e7828" },
  { label: "Vault",   color: "#1a2535" },
  { label: "Metal",   color: "#8a9db5" },
]

/* ── Main sandbox ────────────────────────────────────────── */
export function SandboxClient() {
  return (
    <div className="sb">

      {/* Header */}
      <header className="sb__header">
        <h1 className="sb__title">
          Visual Sandbox
          <span className="sb__badge">dev only</span>
        </h1>
        <nav className="sb__nav">
          {["jenga-states", "towers", "vault", "coins", "health-bar", "spring", "colors"].map((id) => (
            <a key={id} href={`#${id}`} className="sb__nav-link">
              {id.replace("-", " ")}
            </a>
          ))}
        </nav>
      </header>

      {/* ── Jenga Block States ── */}
      <section className="sb__section" id="jenga-states">
        <h2 className="sb__section-title">Jenga Block — 6 states</h2>
        <JengaStates />
      </section>

      <hr className="sb__divider" />

      {/* ── Jenga Tower States ── */}
      <section className="sb__section" id="towers">
        <h2 className="sb__section-title">Jenga Tower — safe / warning / critical</h2>
        <JengaTowerStates />
      </section>

      <hr className="sb__divider" />

      {/* ── Vault States ── */}
      <section className="sb__section" id="vault">
        <h2 className="sb__section-title">Vault — 6 fill states</h2>
        <VaultStates />
      </section>

      <hr className="sb__divider" />

      {/* ── Coin States ── */}
      <section className="sb__section" id="coins">
        <h2 className="sb__section-title">Token Coins — idle / hovered / dragging / dropping</h2>
        <CoinStates />
      </section>

      <hr className="sb__divider" />

      {/* ── Health Bar States ── */}
      <section className="sb__section" id="health-bar">
        <h2 className="sb__section-title">Health Bar — safe / warning / danger</h2>
        <HealthBarStates />
      </section>

      <hr className="sb__divider" />

      {/* ── Spring Tuner ── */}
      <section className="sb__section" id="spring">
        <h2 className="sb__section-title">Spring Tuner — live physics preview</h2>
        <SpringTuner />
      </section>

      <hr className="sb__divider" />

      {/* ── Color reference ── */}
      <section className="sb__section" id="colors">
        <h2 className="sb__section-title">Design Tokens — colors</h2>
        <div className="sb__swatches">
          {SWATCHES.map(({ label, color }) => (
            <div key={label} className="sb__swatch">
              <div className="sb__swatch-block" style={{ background: color }} />
              <span className="sb__swatch-label">{label}</span>
              <span className="sb__swatch-label" style={{ opacity: 0.5 }}>{color}</span>
            </div>
          ))}
        </div>
      </section>

    </div>
  )
}

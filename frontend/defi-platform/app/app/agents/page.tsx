"use client"

import React, { useState } from "react"
import { motion } from "framer-motion"
import {
  Zap, RefreshCw, Brain, Database,
  MessageSquare, Bot, User, ArrowRight, Shield, TrendingUp,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ─── micro components ──────────────────────────────────────────────────────────

function Card({
  children,
  className,
  noPadding = false
}: {
  children: React.ReactNode
  className?: string
  noPadding?: boolean
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border/40 bg-background/40 backdrop-blur-md",
        "transition-all duration-300 hover:border-border/80",
        !noPadding && "p-6",
        className
      )}
    >
      {children}
    </div>
  )
}

function Chip({
  children,
  variant = "default",
}: {
  children: React.ReactNode
  variant?: "default" | "active" | "outline"
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono tracking-wider uppercase",
        variant === "default" && "bg-muted/50 text-muted-foreground",
        variant === "active"  && "bg-primary/10 text-primary",
        variant === "outline" && "border border-border/60 text-muted-foreground"
      )}
    >
      {children}
    </span>
  )
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold tracking-[0.25em] uppercase text-muted-foreground/60 font-mono mb-4">
      {children}
    </p>
  )
}

// ─── static data ──────────────────────────────────────────────────────────────

const FLOW_STEPS = [
  {
    num: "01", label: "Market Data", icon: Database,
    title: "Chainlink Oracles",
    desc: "Real-time tamper-proof data feeds delivering prices and APY rates directly on-chain.",
  },
  {
    num: "02", label: "Inference", icon: Brain,
    title: "Strategy Engine",
    desc: "Autonomous rules processing market data to evaluate risks and opportunities.",
  },
  {
    num: "03", label: "Execution", icon: Zap,
    title: "Gasless Transactions",
    desc: "Signed intents executed via Smart Accounts for a seamless 24/7 autonomous loop.",
  },
  {
    num: "04", label: "Settlement", icon: RefreshCw,
    title: "On-Chain Validation",
    desc: "Every action is logged and verifiable. Adjust parameters, redeploy, optimize.",
  },
]

const STRATEGIES = [
  {
    id: "yield", name: "Yield Maximizer",
    tag: "Stablecoins",
    risk: "Low",
    apy: "+18.4%", tvl: "$2.3M", uptime: "99.8%",
    desc: "Aggregates USDC liquidity into the highest yielding lending pools. Rebalances automatically on APY shifts > 0.5%.",
  },
  {
    id: "ltv", name: "LTV Guardian",
    tag: "Risk-Off",
    risk: "Medium",
    apy: "+9.1%", tvl: "$890K", uptime: "99.2%",
    desc: "Protects collateral by monitoring borrow health. Automatically repays debt if LTV approaches liquidation thresholds.",
  },
  {
    id: "xchain", name: "Rate Arbitrage",
    tag: "Cross-Chain",
    risk: "High",
    apy: "+31.2%", tvl: "$450K", uptime: "97.1%",
    desc: "Leverages interest rate deltas between chains using CCIP. Borrows low on BSC, supplies high on Arbitrum.",
  },
]

const ALLOCATION_EXAMPLE = [
  { label: "Peridot USDC Pool", pct: 65, apy: "12.4%", tag: "Primary", primary: true },
  { label: "Aave V3 USDC",      pct: 25, apy: "8.2%",  tag: "External" },
  { label: "Curve 3pool",       pct: 10, apy: "5.1%",  tag: "Stable" },
]

const SETUP_STEPS = [
  {
    num: "01",
    title: "Define your profile",
    desc: "Risk tolerance, return target, time horizon, and capital size — set once in a short conversation.",
  },
  {
    num: "02",
    title: "Agent proposes a strategy",
    desc: "You receive a structured allocation with reasoning, protocol selection logic, and risk flags.",
  },
  {
    num: "03",
    title: "Review and execute",
    desc: "Inspect every percentage and APY before you approve. One-click execution via your connected wallet.",
  },
  {
    num: "04",
    title: "Agent monitors 24/7",
    desc: "Automatic rebalancing suggestions when yield shifts or risk conditions change. You stay in control.",
  },
]

const FAQS = [
  {
    q: "Safety of funds?",
    a: "Agents are audited smart contracts with scoped permissions. They cannot exceed the limits you set. Assets remain in your smart wallet.",
  },
  {
    q: "Oracle failure?",
    a: "Peridot uses circuit breakers. If Chainlink feeds fail to update, agents pause instantly to prevent actions on stale data.",
  },
  {
    q: "Fees?",
    a: "0.1% Management Fee + 5% Performance Fee on realized gains. Automation costs ~$2-5/mo in LINK.",
  },
]

// ─── page ─────────────────────────────────────────────────────────────────────

export default function AgentsPage() {
  const [activeStrategy, setActiveStrategy] = useState("yield")
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const current = STRATEGIES.find((s) => s.id === activeStrategy)!

  return (
    <div className="relative min-h-screen bg-background text-foreground selection:bg-primary/30">

      <div className="pointer-events-none fixed inset-x-0 top-0 h-40 bg-background z-[50]" />

      <div className="pointer-events-none fixed inset-0 z-[51] overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 blur-[120px] rounded-full" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-primary/[0.03] blur-[100px] rounded-full" />
      </div>

      <div className="max-w-4xl mx-auto px-6 pt-32 pb-40">

        {/* ─── Hero ─────────────────────────────────────────────────────────── */}
        <header className="mb-24">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="flex items-center gap-2 mb-8">
              <div className="w-5 h-5 bg-primary rounded-sm flex items-center justify-center">
                <div className="w-2 h-2 bg-background rounded-full animate-pulse" />
              </div>
              <span className="text-[11px] font-bold tracking-[0.2em] uppercase font-mono text-muted-foreground">
                Peridot Agent Protocol
              </span>
            </div>

            <h1 className="text-5xl sm:text-6xl font-bold tracking-tighter mb-8 leading-[0.95]">
              Autonomous Finance.
              <br />
              <span className="text-muted-foreground/30">Zero manual input.</span>
            </h1>

            <p className="text-lg text-muted-foreground max-w-xl leading-relaxed mb-10">
              A chat-based investment co-pilot that constructs cross-protocol strategies,
              executes them on-chain, and monitors your portfolio 24/7 — with Peridot
              money markets always at the core.
            </p>

            <div className="flex items-center gap-3">
              <Chip variant="active">Coming Q3 2026</Chip>
              <Chip variant="outline">Chainlink Powered</Chip>
            </div>
          </motion.div>
        </header>

        {/* ─── Stats ────────────────────────────────────────────────────────── */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-32">
          {[
            { label: "Active Agents", value: "0" },
            { label: "TVL (Backtest)", value: "$3.6M" },
            { label: "Avg. Yield", value: "18.2%" },
            { label: "Uptime", value: "100%" },
          ].map((s) => (
            <div key={s.label} className="border-l border-border/40 pl-4 py-1">
              <p className="text-2xl font-bold font-mono tracking-tighter">{s.value}</p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mt-1">{s.label}</p>
            </div>
          ))}
        </section>

        {/* ─── Process ──────────────────────────────────────────────────────── */}
        <section className="mb-32">
          <Eyebrow>The Loop</Eyebrow>
          <div className="grid sm:grid-cols-2 gap-px bg-border/40 border border-border/40 rounded-xl overflow-hidden">
            {FLOW_STEPS.map((step) => (
              <div key={step.num} className="bg-background p-8 group">
                <div className="flex items-center justify-between mb-6">
                  <div className="w-8 h-8 rounded border border-border/60 flex items-center justify-center text-muted-foreground group-hover:border-primary group-hover:text-primary transition-colors">
                    <step.icon className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-mono font-bold text-muted-foreground/30">{step.num}</span>
                </div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-primary mb-2">{step.label}</p>
                <h3 className="text-lg font-bold mb-3">{step.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ─── Chat Co-Pilot Preview ────────────────────────────────────────── */}
        <section className="mb-32">
          <Eyebrow>Your Co-Pilot</Eyebrow>
          <div className="mb-6">
            <h2 className="text-2xl font-bold tracking-tight mb-3">Talk to your portfolio</h2>
            <p className="text-sm text-muted-foreground max-w-lg leading-relaxed">
              No dashboards to configure. A single conversation sets your profile, generates a
              strategy, and queues the transactions — ready to sign.
            </p>
          </div>

          <Card noPadding className="overflow-hidden hover:border-border/40">
            {/* Chat header */}
            <div className="px-6 py-4 border-b border-border/40 flex items-center gap-3">
              <div className="w-6 h-6 bg-primary/10 rounded flex items-center justify-center">
                <Bot className="w-3.5 h-3.5 text-primary" />
              </div>
              <span className="text-sm font-bold">Peridot Agent</span>
              <Chip variant="active">online</Chip>
            </div>

            {/* Messages */}
            <div className="p-6 space-y-6">
              {/* User message */}
              <div className="flex items-start gap-3 justify-end">
                <div className="bg-muted/60 rounded-xl rounded-tr-sm px-4 py-3 max-w-sm">
                  <p className="text-sm">I want low risk yield on 10,000 USDC.</p>
                </div>
                <div className="w-7 h-7 rounded-full bg-muted/80 flex items-center justify-center shrink-0 mt-0.5">
                  <User className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
              </div>

              {/* Agent response */}
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="w-3.5 h-3.5 text-primary" />
                </div>
                <div className="space-y-3 max-w-sm">
                  <div className="bg-background border border-border/60 rounded-xl rounded-tl-sm px-4 py-3">
                    <p className="text-sm text-muted-foreground mb-3">
                      Based on your profile, here is a low-risk allocation across verified protocols:
                    </p>
                    <div className="space-y-2">
                      {ALLOCATION_EXAMPLE.map((a) => (
                        <div key={a.label} className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-2 min-w-0">
                            {a.primary && (
                              <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                            )}
                            {!a.primary && (
                              <div className="w-1.5 h-1.5 rounded-full bg-border shrink-0" />
                            )}
                            <span className="text-xs font-mono truncate">{a.label}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs text-muted-foreground font-mono">{a.pct}%</span>
                            <span className="text-xs font-bold font-mono text-primary">{a.apy}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between">
                      <span className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-widest">Blended APY</span>
                      <span className="text-sm font-bold font-mono text-primary">+10.8%</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-background text-xs font-bold hover:bg-primary/90 transition-colors">
                      Execute Strategy <ArrowRight className="w-3 h-3" />
                    </button>
                    <button className="px-4 py-2 rounded-lg border border-border/60 text-xs font-bold text-muted-foreground hover:bg-muted/30 transition-colors">
                      Adjust
                    </button>
                  </div>
                </div>
              </div>

              {/* Second user message */}
              <div className="flex items-start gap-3 justify-end">
                <div className="bg-muted/60 rounded-xl rounded-tr-sm px-4 py-3 max-w-sm">
                  <p className="text-sm">What if Peridot rates drop?</p>
                </div>
                <div className="w-7 h-7 rounded-full bg-muted/80 flex items-center justify-center shrink-0 mt-0.5">
                  <User className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
              </div>

              {/* Agent short response */}
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="w-3.5 h-3.5 text-primary" />
                </div>
                <div className="bg-background border border-border/60 rounded-xl rounded-tl-sm px-4 py-3 max-w-sm">
                  <p className="text-sm text-muted-foreground">
                    If Peridot USDC drops below <span className="text-foreground font-mono">8%</span>, I will suggest rebalancing into
                    the next-best verified pool. You approve before anything moves.
                  </p>
                </div>
              </div>
            </div>

            <div className="px-6 py-3 border-t border-border/40 bg-muted/10">
              <div className="flex items-center gap-3">
                <MessageSquare className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
                <p className="text-xs text-muted-foreground/40 font-mono">Ask anything about your strategy…</p>
              </div>
            </div>
          </Card>
        </section>

        {/* ─── Allocation Logic ─────────────────────────────────────────────── */}
        <section className="mb-32">
          <Eyebrow>Allocation Logic</Eyebrow>
          <div className="mb-8">
            <h2 className="text-2xl font-bold tracking-tight mb-3">Peridot-first, always</h2>
            <p className="text-sm text-muted-foreground max-w-lg leading-relaxed">
              The agent fills Peridot money markets first. External protocols via Chainlink CRP
              are only added when they genuinely improve the risk-adjusted outcome.
              Every decision is explained in plain language.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <Card className="space-y-4">
              <div className="w-8 h-8 rounded border border-border/60 flex items-center justify-center text-primary">
                <TrendingUp className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold mb-1">Cross-Protocol Routing</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Chainlink CRP gives the agent read access to yields across Aave, Compound,
                  Curve, and other major protocols — so your idle capital always earns.
                </p>
              </div>
              <div className="pt-2 border-t border-border/40 flex flex-wrap gap-2">
                {["Peridot", "Aave V3", "Compound", "Curve"].map((p) => (
                  <Chip key={p} variant={p === "Peridot" ? "active" : "outline"}>{p}</Chip>
                ))}
              </div>
            </Card>

            <Card className="space-y-4">
              <div className="w-8 h-8 rounded border border-border/60 flex items-center justify-center text-primary">
                <Shield className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold mb-1">Risk Constraints</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Your risk profile is enforced at the strategy level. Low-risk profiles
                  never touch volatile assets. The agent operates within the bounds you set —
                  no surprises.
                </p>
              </div>
              <div className="pt-2 border-t border-border/40 flex flex-wrap gap-2">
                {["Low", "Medium", "High"].map((r) => (
                  <Chip key={r} variant="outline">{r} Risk</Chip>
                ))}
              </div>
            </Card>
          </div>
        </section>

        {/* ─── Strategies ───────────────────────────────────────────────────── */}
        <section className="mb-32">
          <Eyebrow>Available Vaults</Eyebrow>
          <div className="flex gap-1 mb-8 overflow-x-auto pb-2">
            {STRATEGIES.map((s) => (
              <button
                key={s.id}
                onClick={() => setActiveStrategy(s.id)}
                className={cn(
                  "px-5 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap",
                  activeStrategy === s.id
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted/50"
                )}
              >
                {s.name}
              </button>
            ))}
          </div>

          <Card className="hover:border-border/40" noPadding>
            <div className="p-8 border-b border-border/40 flex flex-wrap items-end justify-between gap-6">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-2xl font-bold tracking-tight">{current.name}</h3>
                  <Chip variant="active">{current.tag}</Chip>
                </div>
                <p className="text-sm text-muted-foreground max-w-md">{current.desc}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-1">Risk Level</p>
                <p className={cn(
                  "text-sm font-bold",
                  current.risk === "Low" ? "text-primary" : "text-foreground"
                )}>{current.risk}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 divide-x divide-border/40">
              {[
                { label: "Target APY", value: current.apy, highlight: true },
                { label: "Total TVL", value: current.tvl },
                { label: "Uptime", value: current.uptime },
              ].map((m) => (
                <div key={m.label} className="p-8">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-2">{m.label}</p>
                  <p className={cn("text-2xl font-mono font-bold tracking-tighter", m.highlight && "text-primary")}>
                    {m.value}
                  </p>
                </div>
              ))}
            </div>

            <div className="p-8 bg-muted/20">
              <p className="text-[11px] text-muted-foreground font-mono">Status: Launching Q3 2026</p>
            </div>
          </Card>
        </section>

        {/* ─── Setup Steps ──────────────────────────────────────────────────── */}
        <section className="mb-32">
          <Eyebrow>Get Started</Eyebrow>
          <div className="mb-8">
            <h2 className="text-2xl font-bold tracking-tight mb-3">From zero to deployed in four steps</h2>
            <p className="text-sm text-muted-foreground max-w-lg leading-relaxed">
              No code. No configuration files. The agent handles strategy construction,
              execution, and ongoing monitoring through a single conversation.
            </p>
          </div>

          <div className="space-y-px border border-border/40 rounded-xl overflow-hidden">
            {SETUP_STEPS.map((step, i) => (
              <div
                key={step.num}
                className={cn(
                  "flex items-start gap-6 p-7 bg-background group",
                  i < SETUP_STEPS.length - 1 && "border-b border-border/40"
                )}
              >
                <span className="text-[11px] font-mono font-bold text-muted-foreground/30 pt-0.5 shrink-0 w-6">
                  {step.num}
                </span>
                <div>
                  <h3 className="font-bold mb-1 group-hover:text-primary transition-colors">{step.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ─── FAQs ─────────────────────────────────────────────────────────── */}
        <section className="mb-24">
          <Eyebrow>FAQ</Eyebrow>
          <div className="space-y-px border border-border/40 rounded-xl overflow-hidden">
            {FAQS.map((faq, i) => (
              <div
                key={i}
                className={cn(
                  "bg-background",
                  i < FAQS.length - 1 && "border-b border-border/40"
                )}
              >
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between gap-4 px-7 py-5 text-left"
                >
                  <span className="text-sm font-bold">{faq.q}</span>
                  <span className={cn(
                    "text-muted-foreground/40 font-mono text-lg leading-none shrink-0 transition-transform duration-200",
                    openFaq === i && "rotate-45"
                  )}>+</span>
                </button>
                {openFaq === i && (
                  <div className="px-7 pb-5">
                    <p className="text-sm text-muted-foreground leading-relaxed">{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* ─── Footer ───────────────────────────────────────────────────────── */}
        <footer className="pt-12 mt-12 border-t border-border/40 flex flex-wrap justify-between items-center gap-6 text-muted-foreground/40">
          <div className="flex items-center gap-6">
            <span className="text-[10px] font-bold tracking-widest uppercase">Non-Custodial</span>
            <span className="text-[10px] font-bold tracking-widest uppercase">On-Chain Logic</span>
            <span className="text-[10px] font-bold tracking-widest uppercase">Chainlink Powered</span>
          </div>
          <p className="text-[10px] font-mono">© 2026 Peridot Finance</p>
        </footer>

      </div>
    </div>
  )
}

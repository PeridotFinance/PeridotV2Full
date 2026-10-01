"use client"

import { useState, useId, useMemo, useCallback } from "react"
import { motion } from "framer-motion"
import { ChevronDown, ChevronRight, Wallet } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { ConnectChooser } from "@/components/wallet/ConnectChooser"
import { useActiveWallet } from "@/hooks/use-active-wallet"
import { useApyData } from "@/hooks/use-apy-data"
import { useCrossChainBalances } from "@/hooks/use-cross-chain-balances"
import { usePortfolioEarnings } from "@/hooks/use-portfolio-earnings"
import { cn } from "@/lib/utils"

// ─── Formatters ──────────────────────────────────────────────────────────────

function fmt$(n: number, decimals = 2): string {
  if (!n || isNaN(n)) return "$0"
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(decimals)}K`
  return `$${n.toFixed(decimals)}`
}
function fmtApy(n: number): string {
  return (!n || isNaN(n)) ? "—" : `${n.toFixed(2)}%`
}
function fmtSign$(n: number): string {
  const s = fmt$(Math.abs(n))
  return n >= 0 ? `+${s}` : `−${s}`
}

// ─── TinySparkline — pure responsive SVG, Framer Motion draw animation ────────

interface SparkPoint { value: number }

function TinySparkline({
  data,
  color = "#34d399",
  height = 40,
}: {
  data: SparkPoint[]
  color?: string
  height?: number
}) {
  const uid  = useId()
  const W    = 100  // viewBox units
  const H    = height

  const pts = useMemo(() => {
    if (data.length < 2) return []
    const values = data.map(d => d.value)
    const min  = Math.min(...values)
    const max  = Math.max(...values)
    const span = max - min || 1
    return data.map((d, i) => ({
      x: (i / (data.length - 1)) * W,
      y: H - ((d.value - min) / span) * (H * 0.85) - H * 0.05,
    }))
  }, [data, H])

  if (pts.length < 2) return null

  const linePath = `M ${pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" L ")}`
  const areaPath = `${linePath} L ${W},${H} L 0,${H} Z`
  const gradId   = `sg-${uid}`
  const isUp     = pts[pts.length - 1].y <= pts[0].y

  const lineColor = isUp ? color : "#f59e0b"

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      preserveAspectRatio="none"
      className="overflow-visible"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={lineColor} stopOpacity={0.18} />
          <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
        </linearGradient>
      </defs>

      {/* Area fill */}
      <path d={areaPath} fill={`url(#${gradId})`} />

      {/* Line — animated draw */}
      <motion.path
        d={linePath}
        fill="none"
        stroke={lineColor}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
      />

      {/* Last point dot */}
      <circle
        cx={pts[pts.length - 1].x}
        cy={pts[pts.length - 1].y}
        r={2}
        fill={lineColor}
      />
    </svg>
  )
}

// ─── Shared primitives ────────────────────────────────────────────────────────

function Row({ label, sub, value, positive, negative, bold, small }: {
  label: string; sub?: string; value: string
  positive?: boolean; negative?: boolean; bold?: boolean; small?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-0.5">
      <div className="flex items-baseline gap-1.5 min-w-0">
        <span className={cn(
          "text-muted-foreground/70 truncate",
          small ? "text-[10px]" : "text-[11px] font-medium"
        )}>{label}</span>
        {sub && <span className="text-[10px] text-muted-foreground/40 font-mono tracking-tight shrink-0">{sub}</span>}
      </div>
      <span className={cn(
        "font-mono shrink-0 tracking-tight",
        bold ? "font-bold" : "font-semibold",
        positive ? "text-emerald-400" : negative ? "text-amber-400" : "text-foreground",
        small ? "text-[10px]" : "text-[12px]"
      )}>
        {value}
      </span>
    </div>
  )
}

function Section({ title, children, className }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      {title && (
        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/40 mb-3 px-0.5">
          {title}
        </p>
      )}
      <div className="space-y-1">
        {children}
      </div>
    </div>
  )
}

function Divider() {
  // self-center so the divider sits in the vertical middle of the row even
  // when the parent uses items-start (which would otherwise top-align it next
  // to the small labels and visually disconnect it from the values).
  return <div className="w-px h-7 bg-border/40 flex-shrink-0 self-center" />
}

function Skeleton() {
  return <div className="h-5 w-16 rounded bg-muted/20 animate-pulse" />
}

// ─── Tooltip Content Components ─────────────────────────────────────────────

function DepositsContent({
  totalSupplied, totalBorrowed, chainBalances, history,
}: {
  totalSupplied: number; totalBorrowed: number
  chainBalances: any[]; history: SparkPoint[]
}) {
  const sorted = [...(chainBalances ?? [])]
    .filter(c => c.totalSupplied > 0.001)
    .sort((a, b) => b.totalSupplied - a.totalSupplied)

  return (
    <div className="space-y-6">
      {/* Chart Section */}
      {history.length >= 2 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-0.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40">Portfolio Balance</span>
            <span className="text-[10px] font-mono text-emerald-400/60">30d Trend</span>
          </div>
          <div className="h-12 w-full bg-muted/5 rounded-lg overflow-hidden border border-border/10">
            <TinySparkline data={history} height={48} color="#34d399" />
          </div>
        </div>
      )}

      {/* Summary */}
      <Section title="Asset Summary">
        <Row label="Total Supplied" value={fmt$(totalSupplied)} positive />
        {totalBorrowed > 0.001 && <Row label="Total Borrowed" value={fmt$(totalBorrowed)} negative />}
        {totalBorrowed > 0.001 && (
          <div className="pt-2 mt-1 border-t border-border/20">
            <Row label="Net Balance" value={fmt$(totalSupplied - totalBorrowed)} bold />
          </div>
        )}
      </Section>

      {/* Per-chain */}
      {sorted.length > 0 && (
        <Section title="Network Distribution">
          <div className="grid gap-2">
            {sorted.map(c => {
              const pct = totalSupplied > 0 ? Math.round((c.totalSupplied / totalSupplied) * 100) : 0
              return (
                <div key={c.chainId} className="group flex flex-col gap-1.5 p-2 rounded-xl bg-muted/5 border border-transparent hover:border-border/20 transition-all">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-foreground/90">{c.chainName ?? `Chain ${c.chainId}`}</span>
                    <span className="font-mono text-[10px] text-muted-foreground/60">{pct}%</span>
                  </div>
                  <div className="h-1 rounded-full bg-muted/20 overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                      className="h-full rounded-full bg-primary/60" 
                    />
                  </div>
                  <div className="flex justify-between mt-0.5">
                    <span className="text-[10px] text-muted-foreground/50">Value</span>
                    <span className="text-[10px] font-mono font-bold text-foreground/80">{fmt$(c.totalSupplied)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </Section>
      )}
    </div>
  )
}

function NetApyContent({
  supplyEarningsUSD, weightedSupplyAPY,
  supplyRewardsUSD, weightedSupplyRewardsAPY,
  borrowRewardsUSD, weightedBorrowRewardsAPY,
  borrowCostsUSD, weightedBorrowAPY,
  netEarningsUSD, chainBalances, history,
}: any) {
  const chains = [...(chainBalances ?? [])]
    .filter(c => Math.abs(c.netEarningsUSD ?? 0) > 0.001)
    .sort((a, b) => b.netEarningsUSD - a.netEarningsUSD)

  return (
    <div className="space-y-6">
      {/* Chart Section */}
      {history.length >= 2 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-0.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40">Efficiency</span>
            <span className="text-[10px] font-mono text-emerald-400/60">30d APY</span>
          </div>
          <div className="h-12 w-full bg-muted/5 rounded-lg overflow-hidden border border-border/10">
            <TinySparkline data={history} height={48} color="#34d399" />
          </div>
        </div>
      )}

      {/* Breakdown */}
      <Section title="Earnings Breakdown">
        <Row label="Supply Base" sub={fmtApy(weightedSupplyAPY)} value={fmtSign$(supplyEarningsUSD)} positive />
        {supplyRewardsUSD > 0.001 && (
          <Row label="Supply Rewards" sub={fmtApy(weightedSupplyRewardsAPY)} value={fmtSign$(supplyRewardsUSD)} positive />
        )}
        {borrowRewardsUSD > 0.001 && (
          <Row label="Borrow Rewards" sub={fmtApy(weightedBorrowRewardsAPY)} value={fmtSign$(borrowRewardsUSD)} positive />
        )}
        {borrowCostsUSD > 0.001 && (
          <Row label="Borrow Costs" sub={fmtApy(weightedBorrowAPY)} value={`−${fmt$(borrowCostsUSD)}`} negative />
        )}
        <div className="pt-2 mt-1 border-t border-border/20">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-foreground/80">Net Profit / yr</span>
            <span className="font-mono text-[14px] font-bold text-emerald-400 tracking-tight">{fmt$(netEarningsUSD)}</span>
          </div>
        </div>
      </Section>

      {chains.length > 1 && (
        <Section title="Top Performing Networks">
          <div className="grid gap-1.5">
            {chains.slice(0, 3).map(c => (
              <div key={c.chainId} className="flex items-center justify-between py-1 border-b border-border/10 last:border-0">
                <span className="text-[11px] font-medium text-muted-foreground/80">{c.chainName ?? `Chain ${c.chainId}`}</span>
                <span className={cn(
                  "font-mono text-[11px] font-bold",
                  c.netEarningsUSD >= 0 ? "text-emerald-400" : "text-amber-400"
                )}>
                  {fmtSign$(c.netEarningsUSD)}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}

function YieldContent({ netEarningsUSD, history }: { netEarningsUSD: number; history: SparkPoint[] }) {
  return (
    <div className="space-y-6">
      {/* Chart Section */}
      {history.length >= 2 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-0.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40">Growth</span>
            <span className="text-[10px] font-mono text-emerald-400/60">30d Cumulative</span>
          </div>
          <div className="h-12 w-full bg-muted/5 rounded-lg overflow-hidden border border-border/10">
            <TinySparkline data={history} height={48} color="#34d399" />
          </div>
        </div>
      )}

      <Section title="Yield Projections">
        <Row label="Daily Return"   value={`+${fmt$(netEarningsUSD / 365, 2)}`} positive />
        <Row label="Monthly Return" value={`+${fmt$(netEarningsUSD / 12, 2)}`}  positive />
        <div className="pt-2 mt-1 border-t border-border/20">
          <Row label="Annual Projection"  value={`+${fmt$(netEarningsUSD, 2)}`} bold positive />
        </div>
      </Section>
      
      <div className="p-3 rounded-xl bg-primary/5 border border-primary/10">
        <p className="text-[10px] text-muted-foreground/60 leading-relaxed font-medium">
          Estimates are based on real-time APY and your current collateral position. Actual returns fluctuate with market conditions.
        </p>
      </div>
    </div>
  )
}

function HealthCircle({ factor, loading }: { factor: number; loading?: boolean }) {
  const radius = 18
  const circumference = 2 * Math.PI * radius
  
  // Logic: 1.0 is danger (0% fill, red), 2.0+ is healthy (100% fill, green)
  const percent = Math.min(Math.max((factor - 1) * 100, 0), 100)
  const offset = circumference - (percent / 100) * circumference

  const color = factor > 1.5 ? "rgb(52, 211, 153)" : factor > 1.1 ? "rgb(251, 191, 36)" : "rgb(239, 68, 68)"

  if (loading) return <div className="w-11 h-11 rounded-full bg-muted/10 animate-pulse" />

  return (
    <div className="relative flex items-center justify-center w-11 h-11 group">
      <svg className="w-full h-full transform -rotate-90 overflow-visible">
        <circle
          cx="22" cy="22" r={radius}
          fill="transparent"
          stroke="currentColor"
          strokeWidth="2.5"
          className="text-muted/10 dark:text-white/[0.03]"
        />
        <motion.circle
          cx="22" cy="22" r={radius}
          fill="transparent"
          stroke={color}
          strokeWidth="2.5"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1, ease: "easeOut" }}
          strokeLinecap="round"
          className="drop-shadow-[0_0_4px_rgba(52,211,153,0.2)]"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold font-mono tracking-tighter">
        {factor >= 10 ? "10+" : factor.toFixed(2)}
      </span>
    </div>
  )
}

function HealthContent({ factor, supplied, borrowed, limit }: { factor: number; supplied: number; borrowed: number; limit: number }) {
  return (
    <div className="space-y-6">
      <Section title="Position Safety">
        <Row label="Collateral Value" value={fmt$(supplied)} />
        <Row label="Borrow Limit" value={fmt$(limit)} />
        <Row label="Current Debt" value={fmt$(borrowed)} negative />
        <div className="pt-2 mt-1 border-t border-border/20">
          <Row 
            label="Health Factor" 
            value={factor.toFixed(2)} 
            bold 
            positive={factor > 1.5 || borrowed <= 0.01}
            negative={factor < 1.1 && borrowed > 0.01}
          />
        </div>
      </Section>

      <div className={cn(
        "p-3 rounded-xl border",
        factor > 1.5 ? "bg-emerald-500/5 border-emerald-500/10" : factor > 1.1 ? "bg-amber-500/5 border-amber-500/10" : "bg-red-500/5 border-red-500/10"
      )}>
        <p className="text-[10px] text-muted-foreground/70 leading-relaxed font-medium">
          {factor > 1.5 
            ? "Your position is well-collateralized. You have significant buffer against market volatility."
            : factor > 1.1 
              ? "Warning: Your health factor is getting low. Consider repaying some debt or adding collateral."
              : "Danger: You are close to liquidation. Add collateral immediately to avoid losing your assets."}
        </p>
      </div>
    </div>
  )
}

// ─── StatTip Component ───────────────────────────────────────────────────────

function StatTip({ label, value, colorClass, loading, open, onOpenChange, children, customTrigger }: {
  label: string; value?: string; colorClass?: string; loading?: boolean
  open: boolean; onOpenChange: (v: boolean) => void
  children: React.ReactNode
  customTrigger?: React.ReactNode
}) {
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip open={open} onOpenChange={onOpenChange}>
        <TooltipTrigger asChild>
          <button
            onClick={() => onOpenChange(!open)}
            className="flex flex-col items-center gap-1.5 min-w-0 group outline-none"
          >
            {/* Label — tighter tracking + smaller font on mobile so the widest
                label ("DEPOSITED") stops overflowing its centered button when
                the row is tight. Original desktop sizing kept at sm: */}
            <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.14em] sm:tracking-[0.2em] text-muted-foreground/40 whitespace-nowrap flex items-center gap-1 group-hover:text-muted-foreground/60 transition-colors">
              {label}
              <ChevronDown className={cn(
                "w-2.5 h-2.5 transition-transform duration-300",
                open ? "rotate-180 text-primary" : "text-muted-foreground/30"
              )} />
            </span>
            {customTrigger ? customTrigger : (
              loading ? <Skeleton /> : (
                <span className={cn(
                  "text-[15px] sm:text-[16px] font-bold font-mono tabular-nums tracking-tight transition-all duration-300",
                  colorClass ?? "text-foreground",
                  open && "scale-105"
                )}>
                  {value}
                </span>
              )
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent 
          side="bottom" 
          className="w-[280px] p-5 rounded-[24px] border-border/40 bg-background/95 backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-[100]" 
          sideOffset={12}
          onPointerDownOutside={() => onOpenChange(false)}
        >
          {children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// ─── Inner ────────────────────────────────────────────────────────────────────

function PortfolioStripInner() {
  const [openDeposits, setOpenDeposits] = useState(false)
  const [openHealth,    setOpenHealth]   = useState(false)
  const [openApy,      setOpenApy]      = useState(false)
  const [openYield,    setOpenYield]    = useState(false)

  const { liveApyData, isLoading: apyLoading } = useApyData()
  const {
    totalSupplied, totalBorrowed, borrowLimit, borrowLimitUsed, netAPY, netEarningsUSD,
    supplyEarningsUSD, weightedSupplyAPY,
    supplyRewardsUSD,  weightedSupplyRewardsAPY,
    borrowCostsUSD,    weightedBorrowAPY,
    borrowRewardsUSD,  weightedBorrowRewardsAPY,
    chainBalances, isLoading: balLoading,
  } = useCrossChainBalances(liveApyData)

  const { earningsHistory } = usePortfolioEarnings()

  // Derive sparkline series from earningsHistory
  const balanceHistory  = useMemo(() =>
    (earningsHistory ?? []).map(p => ({ value: p.portfolioValue })), [earningsHistory])

  const earningsSeries  = useMemo(() =>
    (earningsHistory ?? []).map(p => ({ value: p.cumulativeEarnings })), [earningsHistory])

  // APY series: derive effective daily APY from history
  const apySeries = useMemo(() => {
    const h = earningsHistory ?? []
    if (h.length < 2) return []
    return h.slice(1).map((p, i) => {
      const prev      = h[i]
      const dailyGain = p.cumulativeEarnings - prev.cumulativeEarnings
      const annualized = prev.portfolioValue > 0
        ? (dailyGain / prev.portfolioValue) * 365 * 100
        : 0
      return { value: Math.max(0, annualized) }
    })
  }, [earningsHistory])

  if (!balLoading && (!totalSupplied || totalSupplied < 0.01)) return null

  const loading = balLoading || apyLoading

  const handleDeposits = (v: boolean) => { setOpenDeposits(v); if (v) { setOpenHealth(false); setOpenApy(false); setOpenYield(false) } }
  const handleHealth   = (v: boolean) => { setOpenHealth(v);   if (v) { setOpenDeposits(false); setOpenApy(false); setOpenYield(false) } }
  const handleApy      = (v: boolean) => { setOpenApy(v);      if (v) { setOpenDeposits(false); setOpenHealth(false); setOpenYield(false) } }
  const handleYield    = (v: boolean) => { setOpenYield(v);    if (v) { setOpenDeposits(false); setOpenHealth(false); setOpenApy(false) } }

  // Health color logic
  const healthFactor = totalBorrowed > 0.01 ? borrowLimit / totalBorrowed : 1
  const healthColor = borrowLimitUsed > 80 
    ? "text-amber-500" 
    : borrowLimitUsed > 50 
      ? "text-amber-400" 
      : "text-foreground"

  return (
    <motion.div
      data-testid="portfolio-strip"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      // items-start aligns every column's label to the same top line. With the
      // previous items-center, Health's column (which contains a 44px circle)
      // was taller than the text columns, so centering pushed the shorter
      // columns' labels down while Health's label sat at the row's top edge.
      // Tighter mobile gap gives DEPOSITED enough room to stay inside its
      // button without spilling left into the card's padding.
      className="flex items-start justify-center gap-4 sm:gap-10 py-3 px-3 sm:px-4
        rounded-xl border border-border/40
        bg-background shadow-sm"
    >
      <StatTip 
        label="Deposited" 
        value={fmt$(totalSupplied)} 
        loading={loading}
        colorClass={totalBorrowed > 0.001 ? healthColor : "text-foreground"}
        open={openDeposits} 
        onOpenChange={handleDeposits}
      >
        <DepositsContent
          totalSupplied={totalSupplied} 
          totalBorrowed={totalBorrowed ?? 0}
          chainBalances={chainBalances ?? []} 
          history={balanceHistory}
        />
      </StatTip>

      <Divider />

      <StatTip 
        label="Health" 
        loading={loading}
        open={openHealth} 
        onOpenChange={handleHealth}
        customTrigger={<HealthCircle factor={healthFactor} loading={loading} />}
      >
        <HealthContent 
          factor={healthFactor}
          supplied={totalSupplied}
          borrowed={totalBorrowed}
          limit={borrowLimit}
        />
      </StatTip>

      <Divider />

      <StatTip 
        label="Net APY" 
        value={fmtApy(netAPY)} 
        colorClass="text-emerald-400" 
        loading={loading}
        open={openApy} 
        onOpenChange={handleApy}
      >
        <NetApyContent
          supplyEarningsUSD={supplyEarningsUSD}     weightedSupplyAPY={weightedSupplyAPY}
          supplyRewardsUSD={supplyRewardsUSD}         weightedSupplyRewardsAPY={weightedSupplyRewardsAPY}
          borrowRewardsUSD={borrowRewardsUSD}         weightedBorrowRewardsAPY={weightedBorrowRewardsAPY}
          borrowCostsUSD={borrowCostsUSD}             weightedBorrowAPY={weightedBorrowAPY}
          netEarningsUSD={netEarningsUSD}             chainBalances={chainBalances ?? []}
          history={apySeries}
        />
      </StatTip>

      <Divider />

      <StatTip 
        label="Yield / yr" 
        value={fmt$(netEarningsUSD ?? 0)}
        colorClass={!!netEarningsUSD && netEarningsUSD > 0 ? "text-emerald-400" : "text-foreground"} 
        loading={loading}
        open={openYield} 
        onOpenChange={handleYield}
      >
        <YieldContent netEarningsUSD={netEarningsUSD ?? 0} history={earningsSeries} />
      </StatTip>
    </motion.div>
  )
}

// ─── Gate ─────────────────────────────────────────────────────────────────────

export function PortfolioStrip() {
  const { isConnected } = useActiveWallet()
  const [chooserOpen, setChooserOpen] = useState(false)
  const { liveApyData, isLoading: apyLoading } = useApyData()
  const { totalSupplied, isLoading: balLoading } = useCrossChainBalances(liveApyData)

  const loading = balLoading || apyLoading

  // Empty-state CTA: guests get the "Welcome to Peridot" chooser (email/social,
  // EVM wallet, Stellar wallet); connected users with no deposits get scrolled
  // down to the markets table (rendered directly below this strip on /app) so
  // they can pick an asset to supply. Privy's own modal is never opened
  // directly — it cannot list Stellar wallets, so a Freighter user would face a
  // login screen with no path in.
  const handleCtaClick = useCallback(() => {
    if (isConnected) {
      document
        .querySelector('[data-testid="market-table"]')
        ?.scrollIntoView({ behavior: "smooth", block: "start" })
    } else {
      setChooserOpen(true)
    }
  }, [isConnected])

  // If connected and has balance, show the full strip
  if (isConnected && totalSupplied > 0.01) {
    return <PortfolioStripInner />
  }

  // If loading, show a skeleton bar
  if (loading) {
    return (
      <div data-testid="portfolio-strip" className="flex items-center justify-center py-4 px-4 rounded-xl border border-border/20 bg-background/50 animate-pulse h-[58px]">
        <div className="h-4 w-48 bg-muted/20 rounded-full" />
      </div>
    )
  }

  // Elegant Empty/Guest State (Trade Republic Style)
  return (
    <>
    <motion.div
      data-testid="portfolio-strip"
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center justify-between py-3 px-5 rounded-xl border border-border/40 bg-background shadow-sm group cursor-pointer hover:border-primary/30 transition-all"
      onClick={handleCtaClick}
    >
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
          <Wallet className="w-4 h-4 text-primary" />
        </div>
        <div className="flex flex-col">
          <span className="text-[11px] font-bold uppercase tracking-widest text-foreground/80">
            {isConnected ? "Start earning yield" : "Connect your wallet"}
          </span>
          <span className="text-[10px] text-muted-foreground/60">
            {isConnected ? "Deposit assets to track your portfolio in real-time" : "Track your positions and manage assets across all chains"}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold text-primary uppercase tracking-tighter group-hover:translate-x-0.5 transition-transform">
          {isConnected ? "View Markets" : "Get Started"}
        </span>
        <ChevronRight className="w-3.5 h-3.5 text-primary" />
      </div>
    </motion.div>
    <ConnectChooser open={chooserOpen} onOpenChange={setChooserOpen} />
    </>
  )
}

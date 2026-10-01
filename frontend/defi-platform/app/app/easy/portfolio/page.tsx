"use client"

import { useMemo, useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import Image from "next/image"
import { TrendingUp, TrendingDown, DollarSign, ChevronRight, ChevronDown, Sparkles } from "lucide-react"
import { InfoTooltip } from "@/components/ui/info-tooltip"
import { cn } from "@/lib/utils"
import { useCrossChainBalances } from "@/hooks/use-cross-chain-balances"
import { useApyData, type LiveApyData } from "@/hooks/use-apy-data"
import { usePortfolioEarnings } from "@/hooks/use-portfolio-earnings"
import { getAssetById } from "@/data/market-data"
import { useDemoMode } from "@/context/demo-mode"
import { DEMO_POSITIONS, DEMO_APY_DATA, DEMO_TOTAL_SUPPLIED } from "@/data/demo-mock"
import { openAddMoney } from "@/lib/onramp/add-money"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number, digits = 2) {
  return n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })
}
function fmtCompact(n: number) {
  if (n < 0.01) return "<$0.01"
  if (n < 10)   return `$${n.toFixed(2)}`
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// Consumer surfaces hide network jargon — "BSC Mainnet" → "BSC", "Stellar Soroban Mainnet" → "Stellar".
function prettyChainName(name?: string) {
  if (!name) return name
  return name.replace(/\bSoroban\b/gi, "").replace(/\s*\b(Mainnet|Testnet)\b/gi, "").replace(/\s+/g, " ").trim()
}

// Resolve a market asset by token symbol + chain. Stellar markets are id'd
// `<sym>-stellar` (e.g. eurc-stellar, xlm-stellar) — a bare lookup misses them.
function resolveAsset(tokenSymbol: string, chainId: number) {
  const sym = tokenSymbol.toLowerCase()
  if (chainId === 56457) return getAssetById(`${sym}-stellar`) ?? getAssetById(sym)
  return getAssetById(sym) ?? getAssetById(`${sym}-stellar`)
}

// ─── Period config ─────────────────────────────────────────────────────────────

const PERIODS = [
  { label: "1W",  days: 7,   suffix: "/ week"    },
  { label: "1M",  days: 30,  suffix: "/ month"   },
  { label: "3M",  days: 90,  suffix: "/ 3 months"},
  { label: "ALL", days: 180, suffix: "/ 6 months"},
] as const
type PeriodLabel = typeof PERIODS[number]["label"]

// ─── Sparkline ─────────────────────────────────────────────────────────────────

function buildSparklineData(currentValue: number, apy: number, days: number): number[] {
  if (currentValue <= 0 || apy <= 0) return Array(days + 1).fill(0)
  const dailyRate = apy / 100 / 365
  return Array.from({ length: days + 1 }, (_, i) => {
    const daysAgo = days - i
    const base = currentValue / Math.pow(1 + dailyRate, daysAgo)
    const wave = base * 0.0035 * Math.sin((i / Math.max(days, 1)) * Math.PI * 5)
    return Math.max(0, base + wave)
  })
}

function fmtChartDate(d?: string) {
  if (!d) return ""
  const parsed = new Date(d.length <= 10 ? `${d}T00:00:00` : d)
  if (isNaN(parsed.getTime())) return d
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

function SparklineChart({ data, dates }: { data: number[]; dates?: string[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [active, setActive] = useState<number | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    setWidth(el.getBoundingClientRect().width)
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const H = 100
  const PAD = 2

  const svg = useMemo(() => {
    if (data.length < 2 || width < 4) return null
    const min = Math.min(...data)
    const max = Math.max(...data)
    const range = max - min || 1
    const pts = data.map((v, i) => ({
      x: (i / (data.length - 1)) * width,
      y: H - PAD - ((v - min) / range) * (H - PAD * 2),
    }))
    const line = pts.reduce((acc, pt, i) => {
      if (i === 0) return `M ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`
      const prev = pts[i - 1]
      const cx = ((prev.x + pt.x) / 2).toFixed(1)
      return `${acc} C ${cx} ${prev.y.toFixed(1)} ${cx} ${pt.y.toFixed(1)} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`
    }, "")
    const area = `${line} L ${width} ${H} L 0 ${H} Z`
    return { line, area, pts }
  }, [data, width])

  // Map a pointer X (relative to the chart) to the nearest data index.
  function locate(clientX: number) {
    const el = containerRef.current
    if (!el || data.length < 2) return
    const rect = el.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    setActive(Math.round(ratio * (data.length - 1)))
  }

  const cursor = active != null && svg ? svg.pts[active] : null
  const labelRight = cursor ? cursor.x > width / 2 : false

  return (
    <div
      ref={containerRef}
      style={{ height: H, touchAction: "pan-y" }}
      className="w-full relative select-none"
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); locate(e.clientX) }}
      onPointerMove={(e) => { if (e.buttons || e.pointerType === "touch") locate(e.clientX) }}
      onPointerUp={() => setActive(null)}
      onPointerCancel={() => setActive(null)}
      onPointerLeave={() => setActive(null)}
    >
      {svg && width > 0 && (
        <svg width={width} height={H}>
          <defs>
            <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#10b981" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.00" />
            </linearGradient>
          </defs>
          <path d={svg.area} fill="url(#sg)" />
          <path d={svg.line} fill="none" stroke="#10b981" strokeWidth="2.5"
                strokeLinecap="round" strokeLinejoin="round" />
          {cursor && (
            <>
              <line x1={cursor.x} y1={0} x2={cursor.x} y2={H}
                    stroke="#10b981" strokeWidth="1" strokeOpacity="0.35" strokeDasharray="3 3" />
              <circle cx={cursor.x} cy={cursor.y} r="6" fill="#10b981" fillOpacity="0.18" />
              <circle cx={cursor.x} cy={cursor.y} r="3.5" fill="#10b981" stroke="white" strokeWidth="1.5" />
            </>
          )}
        </svg>
      )}

      {/* Scrub tooltip */}
      {cursor && active != null && (
        <div
          className="pointer-events-none absolute top-0 -translate-y-1 px-2 py-1 rounded-lg bg-foreground text-background shadow-lg"
          style={{
            left: labelRight ? undefined : cursor.x,
            right: labelRight ? width - cursor.x : undefined,
          }}
        >
          <p className="text-[12px] font-black tabular-nums leading-none">${fmt(data[active])}</p>
          {dates?.[active] && (
            <p className="text-[9px] font-semibold opacity-60 leading-none mt-0.5">{fmtChartDate(dates[active])}</p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Skeleton row ─────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3.5 px-5 py-3.5">
      <div className="w-10 h-10 rounded-full bg-foreground/[0.08] animate-skeleton shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="h-[15px] w-20 rounded-full bg-foreground/[0.08] animate-skeleton" />
        <div className="h-3 w-14 rounded-full bg-foreground/[0.05] animate-skeleton" />
      </div>
      <div className="space-y-1.5 text-right">
        <div className="h-[15px] w-16 rounded-full bg-foreground/[0.08] animate-skeleton ml-auto" />
        <div className="h-3 w-12 rounded-full bg-foreground/[0.05] animate-skeleton ml-auto" />
      </div>
    </div>
  )
}

// ─── Position row ─────────────────────────────────────────────────────────────

interface PositionRowProps {
  icon?: string
  symbol: string
  chainName?: string
  valueUsd: number
  tokenAmount: number
  apy?: number
  dailyEarnings?: number
  isBorrow?: boolean
  onClick?: () => void
}

function PositionRow({ icon, symbol, chainName, valueUsd, tokenAmount, apy, dailyEarnings, isBorrow, onClick }: PositionRowProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      onClick={onClick}
      className="flex items-center gap-3.5 px-5 py-3.5 hover:bg-foreground/[0.03] active:bg-foreground/[0.05] transition-colors cursor-pointer"
    >
      <div className="w-10 h-10 rounded-full bg-foreground/[0.06] border border-foreground/[0.08] flex items-center justify-center shrink-0 overflow-hidden">
        {icon ? (
          <Image src={icon} alt={symbol} width={28} height={28} className="rounded-full" unoptimized />
        ) : (
          <DollarSign className="w-4 h-4 text-muted-foreground/50" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-bold leading-tight">{symbol}</p>
        <p className="text-[12px] text-muted-foreground/40 mt-0.5 font-medium">
          {prettyChainName(chainName) ?? (isBorrow ? "Active loan" : "Earning")}
        </p>
      </div>

      <div className="text-right shrink-0">
        <p className={cn("text-[15px] font-bold tabular-nums", isBorrow ? "text-amber-500" : "")}>
          {isBorrow ? "−" : ""}${fmt(valueUsd)}
        </p>
        {!isBorrow && dailyEarnings !== undefined && dailyEarnings > 0 ? (
          <InfoTooltip
            content="Estimated daily interest at the current rate — added to your balance automatically, every day."
            side="top"
            align="end"
            className="mt-0.5"
          >
            <p className="text-[12px] font-semibold tabular-nums text-emerald-500">
              +{fmtCompact(dailyEarnings)} / day
            </p>
          </InfoTooltip>
        ) : apy !== undefined && apy > 0 ? (
          <p className={cn("text-[12px] font-semibold tabular-nums mt-0.5", isBorrow ? "text-amber-500/70" : "text-emerald-500/70")}>
            {fmt(apy, 1)}% / yr
          </p>
        ) : (
          <p className="text-[12px] text-muted-foreground/40 tabular-nums mt-0.5">
            {fmt(tokenAmount, 4)} {symbol}
          </p>
        )}
      </div>

      <ChevronRight className="w-4 h-4 text-muted-foreground/20 shrink-0" />
    </motion.div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center justify-center py-24 px-6 text-center"
    >
      <div className="w-14 h-14 rounded-full bg-foreground/[0.04] border border-foreground/[0.07] flex items-center justify-center mb-4">
        <Sparkles className="w-6 h-6 text-muted-foreground/25" />
      </div>
      <p className="text-[15px] font-bold text-foreground/50">Nothing saved yet</p>
      <p className="text-[13px] text-muted-foreground/35 mt-1.5 leading-relaxed max-w-[220px]">
        Add money and it starts earning the moment you save it.
      </p>
      <button
        type="button"
        onClick={() => openAddMoney()}
        data-testid="portfolio-empty-add-money"
        className="mt-5 h-11 px-6 rounded-full bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-500 active:scale-[0.98] transition-all"
      >
        Add money
      </button>
    </motion.div>
  )
}

// ─── Earnings panel — expandable "interest earned to date" ─────────────────────

interface EarnerToken {
  tokenSymbol: string
  chainId: number
  earnings: number
  currentApy: number
}

function EarningsStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center text-center">
      <p className="text-[14px] font-black tabular-nums leading-none">{value}</p>
      <p className="text-[10px] text-muted-foreground/35 font-semibold mt-1.5 tracking-wide">{label}</p>
    </div>
  )
}

function EarningsPanel({
  totalEarned,
  dailyAvg,
  monthly,
  effectiveApy,
  perToken,
}: {
  totalEarned: number
  dailyAvg: number
  monthly: number
  effectiveApy: number
  perToken: EarnerToken[]
}) {
  const [open, setOpen] = useState(false)

  const earners = useMemo(
    () => perToken.filter((t) => t.earnings > 0.0001).sort((a, b) => b.earnings - a.earnings),
    [perToken]
  )

  return (
    <div className="mx-5 mt-5 rounded-[1.25rem] border border-foreground/[0.07] bg-foreground/[0.025] overflow-hidden">
      {/* Header — always visible, taps to expand */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-foreground/[0.03] transition-colors"
      >
        <div className="w-9 h-9 rounded-full bg-emerald-500/12 flex items-center justify-center shrink-0">
          <TrendingUp className="w-[18px] h-[18px] text-emerald-500" />
        </div>
        <div className="flex-1 text-left min-w-0">
          <p className="text-[13px] font-bold leading-tight">Interest earned</p>
          <p className="text-[11px] text-muted-foreground/40 mt-0.5 font-medium">
            All time{earners.length > 0 ? " · tap for details" : ""}
          </p>
        </div>
        <p className="text-[17px] font-black tabular-nums text-emerald-500 shrink-0">
          +{fmtCompact(totalEarned)}
        </p>
        {earners.length > 0 && (
          <motion.div
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="shrink-0"
          >
            <ChevronDown className="w-4 h-4 text-muted-foreground/30" />
          </motion.div>
        )}
      </button>

      {/* Expandable body */}
      <AnimatePresence initial={false}>
        {open && earners.length > 0 && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.32, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4">
              {/* Stat trio */}
              <div className="grid grid-cols-3 gap-2 py-3.5 border-t border-foreground/[0.06]">
                <EarningsStat label="Per day"   value={`+${fmtCompact(dailyAvg)}`} />
                <EarningsStat label="Per month" value={`+${fmtCompact(monthly)}`} />
                <EarningsStat label="Avg. rate" value={effectiveApy > 0 ? `${fmt(effectiveApy, 1)}%` : "—"} />
              </div>

              {/* Per-asset breakdown */}
              <div className="pt-1.5">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/30 mb-1">
                  By asset
                </p>
                <div>
                  {earners.map((t, i) => {
                    const asset = resolveAsset(t.tokenSymbol, t.chainId)
                    return (
                      <motion.div
                        key={`${t.tokenSymbol}-${t.chainId}`}
                        initial={{ opacity: 0, x: -4 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.2, delay: 0.05 + i * 0.04 }}
                        className="flex items-center gap-3 py-2 border-b border-foreground/[0.04] last:border-0"
                      >
                        <div className="w-7 h-7 rounded-full bg-foreground/[0.06] border border-foreground/[0.07] flex items-center justify-center shrink-0 overflow-hidden">
                          {asset?.icon ? (
                            <Image src={asset.icon} alt={t.tokenSymbol} width={20} height={20} className="rounded-full" unoptimized />
                          ) : (
                            <span className="text-[9px] font-bold text-muted-foreground/50">{t.tokenSymbol.slice(0, 2)}</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-bold leading-tight">{t.tokenSymbol}</p>
                          {t.currentApy > 0 && (
                            <p className="text-[11px] text-muted-foreground/40 mt-0.5 font-medium tabular-nums">
                              {fmt(t.currentApy, 1)}% / yr
                            </p>
                          )}
                        </div>
                        <p className="text-[13px] font-bold tabular-nums text-emerald-500 shrink-0">
                          +{fmtCompact(t.earnings)}
                        </p>
                      </motion.div>
                    )
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PortfolioPage() {
  const router = useRouter()
  const [activePeriod, setActivePeriod] = useState<PeriodLabel>("1M")
  const { isDemoMode } = useDemoMode()
  const { liveApyData } = useApyData()

  const { allPositions: livePositions, totalSupplied: liveTotalSupplied, isLoading: liveLoading } = useCrossChainBalances(liveApyData)
  const earnings = usePortfolioEarnings()

  // In demo mode, overlay mock data — live hooks are disabled
  const allPositions  = isDemoMode ? DEMO_POSITIONS as typeof livePositions : livePositions
  const totalSupplied = isDemoMode ? DEMO_TOTAL_SUPPLIED : liveTotalSupplied
  const isLoading     = isDemoMode ? false : liveLoading
  // The demo fixture only carries {supplyApy, borrowApy}; widening to the live
  // shape keeps `getSupplyApy` below type-checked against the real entry (which
  // is where totalSupplyApy / the boost layers live) instead of collapsing the
  // union down to the fixture's two fields.
  const apyData: LiveApyData = isDemoMode ? (DEMO_APY_DATA as unknown as LiveApyData) : liveApyData

  const supplyPositions = useMemo(() => allPositions.filter((p) => p.suppliedBalance > 0), [allPositions])
  const borrowPositions = useMemo(() => allPositions.filter((p) => p.borrowedBalance > 0), [allPositions])
  const totalBorrowed   = useMemo(() => borrowPositions.reduce((s, p) => s + p.borrowedValueUSD, 0), [borrowPositions])
  const isEmpty         = !isLoading && supplyPositions.length === 0 && borrowPositions.length === 0

  // Effective supply rate the saver actually earns. Stellar markets carry their
  // yield in totalSupplyApy (DeFindex/Blend boost) with supplyApy = 0, so reading
  // supplyApy alone zeroes out Stellar earnings. Prefer the server total, fall
  // back to the component sum, then bare supplyApy.
  const getSupplyApy = (assetId: string, chainId: number) => {
    const d = apyData[chainId]?.[assetId]
    if (!d) return 0
    if (d.totalSupplyApy > 0) return d.totalSupplyApy
    const sum = (d.supplyApy ?? 0) + (d.supplyRewardsApy ?? 0) + (d.boostSourceApy ?? 0) + (d.boostRewardsApy ?? 0)
    return sum > 0 ? sum : (d.supplyApy ?? 0)
  }
  const getBorrowApy = (assetId: string, chainId: number) => apyData[chainId]?.[assetId]?.borrowApy ?? 0

  const { annualEarnings, weightedApy } = useMemo(() => {
    if (!supplyPositions.length) return { annualEarnings: 0, weightedApy: 0 }
    let annual = 0
    supplyPositions.forEach((p) => { annual += p.suppliedValueUSD * (getSupplyApy(p.assetId, p.chainId) / 100) })
    return {
      annualEarnings: annual,
      weightedApy: totalSupplied > 0 ? (annual / totalSupplied) * 100 : 0,
    }
  }, [supplyPositions, apyData, totalSupplied])

  const activePeriodConfig  = PERIODS.find((p) => p.label === activePeriod) ?? PERIODS[1]
  const periodEarnings      = annualEarnings * (activePeriodConfig.days / 365)
  const periodSuffix        = activePeriodConfig.suffix

  const activeDays    = PERIODS.find((p) => p.label === activePeriod)?.days ?? 30
  // Prefer the real anchored history (last activeDays points). Fall back to a
  // synthetic projection only when an account has no usable history yet.
  const { sparklineData, sparklineDates } = useMemo(() => {
    const hist = isDemoMode ? [] : (earnings.earningsHistory ?? [])
    const sliced = hist.slice(-(activeDays + 1)).filter((p) => p.portfolioValue > 0)
    if (sliced.length >= 2) {
      return {
        sparklineData:  sliced.map((p) => p.portfolioValue),
        sparklineDates: sliced.map((p) => p.date) as string[] | undefined,
      }
    }
    return {
      sparklineData:  buildSparklineData(totalSupplied, weightedApy, activeDays),
      sparklineDates: undefined as string[] | undefined,
    }
  }, [isDemoMode, earnings.earningsHistory, totalSupplied, weightedApy, activeDays])
  const hasChart = !isLoading && totalSupplied > 0 && weightedApy > 0

  // Actual interest earned to date (real, server-computed — not the projection
  // shown in the hero). Demo mode has no earnings endpoint, so it stays hidden.
  const totalEarned = isDemoMode ? 0 : (earnings.totalLifetimeEarnings ?? 0)
  const showEarnings = !isLoading && !isEmpty && totalEarned > 0.001

  function openDetail(posId: string) {
    router.push(`/app/easy/portfolio/${encodeURIComponent(posId)}`)
  }

  return (
    <div className="max-w-lg mx-auto w-full">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
      >

        {/* ─── Hero ─── */}
        <div className="px-5 pt-8 pb-0">
          <p className="text-[10px] font-black tracking-[0.3em] uppercase text-muted-foreground/30 mb-3">
            Your Savings
          </p>

          {isLoading ? (
            <div>
              <div className="h-[3.4rem] w-44 rounded-xl bg-foreground/[0.08] animate-skeleton" />
              <div className="h-5 w-36 rounded-full bg-foreground/[0.05] animate-skeleton mt-3 ml-0" />
            </div>
          ) : (
            <>
              <p className="text-[3.4rem] font-black tracking-tighter tabular-nums leading-none">
                ${fmt(totalSupplied)}
              </p>
              {totalSupplied > 0 && weightedApy > 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.1 }}
                  className="mt-3 space-y-2"
                >
                  {/* TR-style: APY pill + daily earnings chip */}
                  <div className="flex items-center gap-2">


                  </div>
                  {/* Period earnings */}
                  <div className="flex items-center gap-1.5">
                    <AnimatePresence mode="wait">
                      <motion.span
                        key={activePeriod}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.18 }}
                        className="text-[13px] font-semibold text-muted-foreground/50 tabular-nums"
                      >
                        +{fmtCompact(periodEarnings)} {periodSuffix}
                      </motion.span>
                    </AnimatePresence>
                  </div>
                </motion.div>
              )}
            </>
          )}
        </div>

        {/* ─── Chart ─── */}
        {hasChart ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.15 }}
            className="mt-5"
          >
            {/* Full-bleed chart */}
            <div className="px-4">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activePeriod}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <SparklineChart data={sparklineData} dates={sparklineDates} />
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Period tabs */}
            <div className="flex justify-center gap-1 px-5 mt-3">
              {PERIODS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setActivePeriod(p.label)}
                  className={cn(
                    "px-4 py-1.5 rounded-full text-[12px] font-black tracking-wide transition-all duration-200",
                    activePeriod === p.label
                      ? "bg-emerald-500 text-white shadow-sm shadow-emerald-500/30"
                      : "text-muted-foreground/40 hover:text-muted-foreground/70"
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </motion.div>
        ) : (
          /* spacer when no chart */
          !isLoading && <div className="mt-4" />
        )}

        {/* ─── Interest earned (expandable) ─── */}
        {showEarnings && (
          <EarningsPanel
            totalEarned={totalEarned}
            dailyAvg={earnings.dailyAverageEarnings ?? 0}
            monthly={earnings.monthlyEarnings ?? 0}
            effectiveApy={earnings.effectiveApy ?? 0}
            perToken={(earnings.perTokenBreakdown ?? []) as EarnerToken[]}
          />
        )}

        {/* ─── Divider ─── */}
        {!isLoading && !isEmpty && <div className="mt-6 h-px bg-foreground/[0.06]" />}

        {/* ─── Loading ─── */}
        {isLoading && (
          <div className="mt-6 divide-y divide-foreground/[0.05]">
            <SkeletonRow /><SkeletonRow /><SkeletonRow />
          </div>
        )}

        {/* ─── Empty ─── */}
        {isEmpty && <EmptyState />}

        {/* ─── Active loan notice ─── */}
        {!isLoading && totalBorrowed > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="flex items-center justify-between px-5 py-3.5"
          >
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-amber-500" />
              <span className="text-[12px] font-bold text-amber-500/80">Active loan</span>
              <span className="text-[13px] font-black tabular-nums text-amber-500">
                −${fmt(totalBorrowed)}
              </span>
            </div>
          </motion.div>
        )}

        {/* ─── Savings section ─── */}
        {!isLoading && supplyPositions.length > 0 && (
          <div>
            <div className="flex items-center justify-between px-5 pt-5 pb-1">
              <InfoTooltip
                content="Money you've deposited that earns interest. Withdraw anytime — no lock-up, no minimum."
                side="bottom"
                align="start"
              >
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/35">
                  Savings
                </span>
              </InfoTooltip>
            </div>
            <div className="divide-y divide-foreground/[0.05]">
              {supplyPositions.map((pos, i) => {
                const apy          = getSupplyApy(pos.assetId, pos.chainId)
                const dailyEarnings = pos.suppliedValueUSD * (apy / 100) / 365
                return (
                  <motion.div
                    key={`${pos.assetId}-${pos.chainId}`}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.22, delay: i * 0.04 }}
                    onClick={() => openDetail(`${pos.assetId}-${pos.chainId}`)}
                  >
                    <PositionRow
                      icon={(pos as any).icon}
                      symbol={pos.symbol || pos.assetId.toUpperCase()}
                      chainName={(pos as any).chainName}
                      valueUsd={pos.suppliedValueUSD}
                      tokenAmount={pos.suppliedBalance}
                      apy={apy}
                      dailyEarnings={dailyEarnings}
                    />
                  </motion.div>
                )
              })}
            </div>
          </div>
        )}

        {/* ─── Loans section ─── */}
        {!isLoading && borrowPositions.length > 0 && (
          <div className="mt-2">
            <div className="flex items-center justify-between px-5 pt-4 pb-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/35">
                Loans
              </span>
              <span className="text-[12px] font-bold tabular-nums text-amber-500">
                −${fmt(totalBorrowed)}
              </span>
            </div>
            <div className="divide-y divide-foreground/[0.05]">
              {borrowPositions.map((pos, i) => (
                <motion.div
                  key={`borrow-${pos.assetId}-${pos.chainId}`}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22, delay: i * 0.04 }}
                  onClick={() => openDetail(`${pos.assetId}-${pos.chainId}`)}
                >
                  <PositionRow
                    icon={(pos as any).icon}
                    symbol={pos.symbol || pos.assetId.toUpperCase()}
                    chainName={(pos as any).chainName}
                    valueUsd={pos.borrowedValueUSD}
                    tokenAmount={pos.borrowedBalance}
                    apy={getBorrowApy(pos.assetId, pos.chainId)}
                    isBorrow
                  />
                </motion.div>
              ))}
            </div>
          </div>
        )}

        <div className="h-8" />
      </motion.div>
    </div>
  )
}

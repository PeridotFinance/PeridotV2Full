"use client"

import { useDeferredValue, useMemo, useState } from "react"
import { useTheme } from "next-themes"
import { usePulseOnChange } from "@/hooks/use-pulse-on-change"
import dynamic from "next/dynamic"
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import { useStatsData, formatNumber } from "@/hooks/use-stats-data"
import { useProtocolTVL } from "@/hooks/use-protocol-tvl"

// `StatsMarketSection` is BSC/EVM only — keep it lazily loaded so the
// redesigned shell renders fast on the network chunk it actually needs.
const StatsMarketSection = dynamic(
  () => import("@/components/markets/StatsMarketSection"),
  { ssr: false, loading: () => <SectionLoadingSkeleton /> },
)

// ─── Design tokens (kept inline so the page stays self-contained) ─────────────
//
// The visual language here is the same one used by `/app/easy`
// (`StealllarDesktopApp`, `PortfolioHero`, `AssetTable`):
//   bg-background, hairline `border-foreground/[0.06]`, `tracking-tight` headings,
//   no gradients, no glass cards, no primary-tint glow. Numbers prefer
//   `font-mono` so columns line up and feel like a Trade Republic tile.

type ChainFilter = "all" | "bsc" | "stellar"

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StatsDashboardPage() {
  const {
    data,
    loading,
    error,
    refresh,
    lastUpdated,
    liveVolumeTimeSeries,
    actionAssetDaily,
    stellar,
  } = useStatsData()
  const { totalMarketSize, isLoading: isTVLLoading } = useProtocolTVL()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === "dark"

  const [chainFilter, setChainFilter] = useState<ChainFilter>("all")
  // Defer the chain filter so the pill highlight updates *urgently*
  // (click feels instant) while the per-asset / per-day aggregations
  // re-run as a non-urgent transition. The chart + bar lists fade to
  // ~60% opacity until they re-commit with the new filter.
  const deferredChainFilter = useDeferredValue(chainFilter)
  const isFilterPending = chainFilter !== deferredChainFilter

  const stellarTokenSymbols = ["XLM", "USDC", "EURC"]
  const isStellarSymbol = (sym: string) => stellarTokenSymbols.includes(sym?.toUpperCase())

  // Prefer live time-series; fall back to the cached snapshot.
  const baseSeries = liveVolumeTimeSeries ?? data?.volumeTimeSeries ?? []

  // ── Filter by chain ────────────────────────────────────────────────────────
  // The volume time-series has no chain dimension on its own, but
  // `actionAssetDaily` does (via token_symbol). When the user selects
  // BSC or Stellar we re-derive a filtered daily series from the
  // per-asset rows. This keeps the chart honest under the filter
  // without needing a chain column on `verified_transactions`.

  // Note: heavy useMemos read `deferredChainFilter` so the recompute
  // runs as a non-urgent transition. The pill / KPI sub text still
  // read the urgent `chainFilter` so the click feels instant.
  const filteredSeries = useMemo(() => {
    if (deferredChainFilter === "all") return baseSeries
    if (!actionAssetDaily) return []
    const byDate = new Map<string, { date: string; supply: number; borrow: number; repay: number; redeem: number }>()
    for (const row of actionAssetDaily) {
      const isStellarRow = isStellarSymbol(row.token_symbol)
      const include = deferredChainFilter === "stellar" ? isStellarRow : !isStellarRow
      if (!include) continue
      const action = row.action_type as "supply" | "borrow" | "repay" | "redeem"
      if (!["supply", "borrow", "repay", "redeem"].includes(action)) continue
      const entry = byDate.get(row.date) ?? { date: row.date, supply: 0, borrow: 0, repay: 0, redeem: 0 }
      entry[action] = (entry[action] ?? 0) + (row.volume || 0)
      byDate.set(row.date, entry)
    }
    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date))
  }, [actionAssetDaily, baseSeries, deferredChainFilter])

  const filteredAssetDistribution = useMemo(() => {
    if (!actionAssetDaily) return []
    // Re-aggregate to per-symbol totals across the period, filtered by chain.
    const totals = new Map<string, number>()
    for (const row of actionAssetDaily) {
      const isStellarRow = isStellarSymbol(row.token_symbol)
      if (deferredChainFilter === "bsc" && isStellarRow) continue
      if (deferredChainFilter === "stellar" && !isStellarRow) continue
      // Supply / borrow are the ones that map to "footprint" — repay /
      // redeem are reversals. We sum gross supply + gross borrow as
      // the share-of-protocol footprint, matching how the original
      // donut surfaced "asset distribution".
      if (row.action_type !== "supply" && row.action_type !== "borrow") continue
      totals.set(row.token_symbol, (totals.get(row.token_symbol) ?? 0) + (row.volume || 0))
    }
    const sum = Array.from(totals.values()).reduce((s, v) => s + v, 0)
    return Array.from(totals.entries())
      .map(([symbol, vol]) => ({ symbol, volume: vol, percentage: sum > 0 ? (vol / sum) * 100 : 0 }))
      .sort((a, b) => b.volume - a.volume)
  }, [actionAssetDaily, deferredChainFilter])

  // ── Derived KPIs ───────────────────────────────────────────────────────────

  const stellarTvlContribution = stellar?.totalTVL ?? 0

  const filteredTotalTVL = useMemo(() => {
    if (deferredChainFilter === "stellar") return stellarTvlContribution
    if (deferredChainFilter === "bsc") return Math.max(0, totalMarketSize - stellarTvlContribution)
    return totalMarketSize
  }, [deferredChainFilter, totalMarketSize, stellarTvlContribution])

  const filteredTotalBorrowed = useMemo(() => {
    if (deferredChainFilter === "stellar") return stellar?.totalBorrowed ?? 0
    const allBorrowed = data ? parseFloat(String(data.totalBorrowed)) || 0 : 0
    if (deferredChainFilter === "all") return allBorrowed + (stellar?.totalBorrowed ?? 0)
    return allBorrowed
  }, [deferredChainFilter, data, stellar])

  return (
    // Pull the page main up under the root layout's top padding so the
    // bg-background surface extends behind the site header. Without this the
    // dark `app-gradient-bg` shows through the 96-128px clearance strip
    // and reads as a hard band between header and content. Internal
    // padding restores content position.
    <main className="min-h-screen bg-background text-foreground -mt-24 md:-mt-28 lg:-mt-32 pt-24 md:pt-28 lg:pt-32">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="w-full max-w-4xl xl:max-w-6xl 2xl:max-w-[80vw] mx-auto px-6 pt-10 pb-6">
        <div className="flex items-end justify-between gap-4 flex-wrap entry-fade-up">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
              Protocol analytics
            </h1>
            <p className="mt-1 text-sm text-foreground/60">
              Real-time view across BSC and Stellar lending markets.
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs text-foreground/40">
            {lastUpdated && (
              <span className="font-mono">
                Updated {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            <button
              type="button"
              onClick={refresh}
              disabled={loading}
              className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full",
                "border border-foreground/[0.06] hover:border-foreground/20 transition-colors",
                "text-foreground/60 hover:text-foreground",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            >
              <RefreshCw className={cn("w-3 h-3", loading && "animate-spin")} />
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 px-4 py-2 text-sm text-foreground bg-foreground/[0.03] border border-foreground/[0.06] rounded-md">
            {error}
          </div>
        )}

        {/* Chain filter */}
        <div
          className="mt-6 entry-fade-up"
          style={{ '--entry-delay': '120ms' } as React.CSSProperties}
        >
          <ChainFilterTabs
            value={chainFilter}
            onChange={setChainFilter}
            isPending={isFilterPending}
          />
        </div>
      </div>

      <div className="mx-6 border-t border-foreground/[0.06]" />

      {/* ── KPI Strip ────────────────────────────────────────────────── */}
      <section className="w-full max-w-4xl xl:max-w-6xl 2xl:max-w-[80vw] mx-auto px-6 py-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-foreground/[0.06] rounded-xl overflow-hidden border border-foreground/[0.06]">
          <KpiCard
            label="Total value locked"
            value={formatNumber(filteredTotalTVL)}
            sub={
              chainFilter === "all"
                ? "All chains"
                : chainFilter === "bsc"
                  ? "BSC mainnet"
                  : "Stellar mainnet"
            }
            loading={loading || isTVLLoading}
            index={0}
          />
          <KpiCard
            label="Total borrowed"
            value={formatNumber(filteredTotalBorrowed)}
            sub="Outstanding loans"
            loading={loading}
            index={1}
          />
          <KpiCard
            label="Active users"
            value={data?.activeUsers != null ? data.activeUsers.toLocaleString() : null}
            sub="Unique addresses, all-time"
            loading={loading}
            index={2}
          />
          <KpiCard
            label="Activity"
            value={data?.totalTransactions != null ? data.totalTransactions.toLocaleString() : null}
            sub="Verified transactions"
            loading={loading}
            index={3}
          />
        </div>
      </section>

      <div className="mx-6 border-t border-foreground/[0.06]" />

      {/* ── Protocol Flows (time-series) ─────────────────────────────── */}
      {/* Below the KPI strip → reveal as user scrolls into it. Native
          CSS scroll-driven, no IntersectionObserver. */}
      <section className="w-full max-w-4xl xl:max-w-6xl 2xl:max-w-[80vw] mx-auto px-6 py-10 scroll-reveal-section">
        <div className="flex items-end justify-between gap-4 mb-6">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Protocol flows</h2>
            <p className="text-xs text-foreground/50 mt-1">
              Daily supply, borrow, repay and redeem volume in USD
            </p>
          </div>
          <ChartLegend isDark={isDark} />
        </div>
        {/* The chart reads deferred data; dim while the new
            chainFilter is still being applied to the recompute. */}
        <div
          className={cn(
            'transition-opacity duration-200',
            isFilterPending && 'opacity-60',
          )}
          aria-busy={isFilterPending || undefined}
        >
          <MonoFlowChart data={filteredSeries} loading={loading} isDark={isDark} />
        </div>
      </section>

      <div className="mx-6 border-t border-foreground/[0.06]" />

      {/* ── Asset distribution + Action distribution ─────────────────── */}
      <section
        className={cn(
          'w-full max-w-4xl xl:max-w-6xl 2xl:max-w-[80vw] mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-2 gap-10 scroll-reveal-section',
          'transition-opacity duration-200',
          isFilterPending && 'opacity-60',
        )}
        aria-busy={isFilterPending || undefined}
      >
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Asset footprint</h2>
          <p className="text-xs text-foreground/50 mt-1 mb-6">
            Share of cumulative supply + borrow volume per asset
          </p>
          <MonoBarList
            rows={filteredAssetDistribution.slice(0, 8).map((r) => ({
              label: r.symbol,
              value: r.volume,
              percentage: r.percentage,
            }))}
            empty={loading ? "Loading…" : "No asset data for this filter"}
          />
        </div>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Action mix</h2>
          <p className="text-xs text-foreground/50 mt-1 mb-6">
            Distribution of supply / borrow / repay / redeem
          </p>
          <ActionDistribution
            actionAssetDaily={actionAssetDaily}
            chainFilter={deferredChainFilter}
            loading={loading}
          />
        </div>
      </section>

      <div className="mx-6 border-t border-foreground/[0.06]" />

      {/* ── Stellar markets (only when filter shows Stellar) ────────── */}
      {(chainFilter === "all" || chainFilter === "stellar") && stellar && (
        <>
          <section className="w-full max-w-4xl xl:max-w-6xl 2xl:max-w-[80vw] mx-auto px-6 py-10 scroll-reveal-section">
            <div className="flex items-end justify-between gap-4 mb-6">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Stellar markets</h2>
                <p className="text-xs text-foreground/50 mt-1">
                  Soroban lending vaults — live read from mainnet RPC
                </p>
              </div>
              <span className="text-[11px] uppercase tracking-widest text-foreground/40">
                {stellar.vaults.length} vault{stellar.vaults.length === 1 ? "" : "s"}
              </span>
            </div>
            <StellarVaultsTable vaults={stellar.vaults} />
          </section>
          <div className="mx-6 border-t border-foreground/[0.06]" />
        </>
      )}

      {/* ── BSC markets (only when filter shows BSC) ─────────────────── */}
      {(chainFilter === "all" || chainFilter === "bsc") && (
        <>
          <section className="w-full max-w-4xl xl:max-w-6xl 2xl:max-w-[80vw] mx-auto px-6 py-10 scroll-reveal-section">
            <div className="flex items-end justify-between gap-4 mb-6">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">BSC markets</h2>
                <p className="text-xs text-foreground/50 mt-1">
                  Live snapshots per market on the connected EVM chain
                </p>
              </div>
            </div>
            <StatsMarketSection />
          </section>
          <div className="mx-6 border-t border-foreground/[0.06]" />
        </>
      )}

      <div className="h-16" />
    </main>
  )
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

function ChainFilterTabs({
  value,
  onChange,
  isPending = false,
}: {
  value: ChainFilter
  onChange: (v: ChainFilter) => void
  /** True while the deferred filter is catching up — dim non-active
   *  pills very subtly so multiple rapid clicks read as acknowledged. */
  isPending?: boolean
}) {
  const options: { id: ChainFilter; label: string }[] = [
    { id: "all", label: "All chains" },
    { id: "bsc", label: "BSC" },
    { id: "stellar", label: "Stellar" },
  ]
  return (
    <div className="inline-flex border border-foreground/[0.06] rounded-full p-1 bg-background">
      {options.map((opt) => {
        const active = opt.id === value
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={cn(
              "px-4 py-1.5 text-sm rounded-full transition-[color,background-color,opacity] duration-200",
              active ? "bg-foreground text-background" : "text-foreground/60 hover:text-foreground",
              !active && isPending && "opacity-50",
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

interface KpiCardProps {
  label: string
  value: string | number | null
  sub: string
  loading?: boolean
  /** Stagger index — drives `--entry-delay` for the mount-only fade-up. */
  index?: number
}

function KpiCard({ label, value, sub, loading, index = 0 }: KpiCardProps) {
  const delay = `${220 + index * 70}ms`
  // Pulses when the value transitions to a new non-null value —
  // e.g., when the chain filter switches and the deferred recompute
  // lands, or when a fresh `/api/stats?stellar=1` snapshot updates
  // the live Stellar TVL. First null → value transition is skipped
  // so we don't collide with the mount entry-fade-up.
  const pulsing = usePulseOnChange(value)
  return (
    <div
      className={cn(
        'bg-background px-5 py-5 md:px-6 md:py-6 entry-fade-up',
        pulsing && 'kpi-pulse',
      )}
      style={{ '--entry-delay': delay } as React.CSSProperties}
    >
      <p className="text-[11px] uppercase tracking-widest text-foreground/40">{label}</p>
      <p className="mt-3 text-2xl md:text-[28px] font-semibold tracking-tight font-mono tabular-nums">
        {loading ? <span className="text-foreground/30">— —</span> : value ?? <span className="text-foreground/30">—</span>}
      </p>
      <p className="mt-1 text-xs text-foreground/50">{sub}</p>
    </div>
  )
}

// ─── Chart palette ──────────────────────────────────────────────────────────
//
// Recharts applies `stroke`/`fill` as SVG attributes, which don't resolve CSS
// custom properties — so the B/W flow chart can't ride the `.dark` token swap
// the way the Tailwind classes do. We derive an explicit palette from the
// resolved theme instead and invert the grayscale ramp for dark mode.
function chartPalette(isDark: boolean) {
  return {
    supply: isDark ? "#f5f5f5" : "#000000",
    borrow: isDark ? "#9a9a9a" : "#666666",
    repay: isDark ? "#6b6b6b" : "#bbbbbb",
    redeem: isDark ? "#4a4a4a" : "#dddddd",
    axisTick: isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)",
    cursor: isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.15)",
    areaStop: isDark ? "#fff" : "#000",
    tooltipBg: isDark ? "#13161F" : "#ffffff",
    tooltipBorder: isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)",
    tooltipShadow: isDark ? "0 4px 16px rgba(0,0,0,0.45)" : "0 4px 16px rgba(0,0,0,0.04)",
    tooltipLabel: isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)",
  }
}

function ChartLegend({ isDark }: { isDark: boolean }) {
  const p = chartPalette(isDark)
  const items = [
    { label: "Supply", color: p.supply },
    { label: "Borrow", color: p.borrow },
    { label: "Repay", color: p.repay },
    { label: "Redeem", color: p.redeem },
  ]
  return (
    <div className="hidden md:flex items-center gap-4 text-xs text-foreground/60">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  )
}

interface MonoFlowChartProps {
  data: Array<{ date: string; supply: number; borrow: number; repay: number; redeem: number }>
  loading?: boolean
  isDark?: boolean
}

function MonoFlowChart({ data, loading, isDark = false }: MonoFlowChartProps) {
  const p = chartPalette(isDark)
  if (!data || data.length === 0) {
    return (
      <div className="h-[320px] flex items-center justify-center text-sm text-foreground/40 border border-dashed border-foreground/[0.08] rounded-lg">
        {loading ? "Loading flow data…" : "No flow data for this filter yet"}
      </div>
    )
  }

  const formatUsd = (v: number) =>
    v >= 1_000_000
      ? `$${(v / 1_000_000).toFixed(1)}M`
      : v >= 1_000
        ? `$${(v / 1_000).toFixed(1)}k`
        : `$${v.toFixed(0)}`

  return (
    <div className="h-[320px] -mx-2">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="g-supply" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={p.areaStop} stopOpacity={0.18} />
              <stop offset="100%" stopColor={p.areaStop} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="date"
            tickFormatter={(d) =>
              new Date(d).toLocaleDateString([], { month: "short", day: "numeric" })
            }
            tick={{ fontSize: 11, fill: p.axisTick }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={formatUsd}
            tick={{ fontSize: 11, fill: p.axisTick }}
            axisLine={false}
            tickLine={false}
            width={50}
          />
          <Tooltip
            cursor={{ stroke: p.cursor, strokeDasharray: "3 3" }}
            contentStyle={{
              background: p.tooltipBg,
              border: `1px solid ${p.tooltipBorder}`,
              borderRadius: 8,
              fontSize: 12,
              boxShadow: p.tooltipShadow,
            }}
            labelStyle={{ color: p.tooltipLabel, marginBottom: 4 }}
            formatter={(value: number, name: string) => [formatUsd(value), name]}
            labelFormatter={(label) =>
              new Date(label).toLocaleDateString([], {
                year: "numeric",
                month: "short",
                day: "numeric",
              })
            }
          />
          <Area
            type="monotone"
            dataKey="supply"
            stroke={p.supply}
            strokeWidth={1.6}
            fill="url(#g-supply)"
            name="Supply"
          />
          <Area
            type="monotone"
            dataKey="borrow"
            stroke={p.borrow}
            strokeWidth={1.4}
            fill="transparent"
            name="Borrow"
          />
          <Area
            type="monotone"
            dataKey="repay"
            stroke={p.repay}
            strokeWidth={1}
            fill="transparent"
            name="Repay"
          />
          <Area
            type="monotone"
            dataKey="redeem"
            stroke={p.redeem}
            strokeWidth={1}
            fill="transparent"
            name="Redeem"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

interface MonoBarListProps {
  rows: Array<{ label: string; value: number; percentage: number }>
  empty?: string
}

function MonoBarList({ rows, empty }: MonoBarListProps) {
  if (!rows || rows.length === 0) {
    return <div className="text-sm text-foreground/40">{empty ?? "—"}</div>
  }
  const max = Math.max(...rows.map((r) => r.percentage), 0.0001)
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.label}>
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-sm font-medium">{row.label}</span>
            <span className="text-xs text-foreground/50 font-mono tabular-nums">
              {formatNumber(row.value)} · {row.percentage.toFixed(1)}%
            </span>
          </div>
          <div className="h-1 bg-foreground/[0.06] rounded-full overflow-hidden">
            <div
              className="h-full bg-foreground"
              style={{ width: `${(row.percentage / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

interface ActionDistributionProps {
  actionAssetDaily?: Array<{ date: string; action_type: string; token_symbol: string; volume: number }>
  chainFilter: ChainFilter
  loading?: boolean
}

function ActionDistribution({ actionAssetDaily, chainFilter, loading }: ActionDistributionProps) {
  const stellarSyms = ["XLM", "USDC", "EURC"]
  const totals = useMemo(() => {
    const t = { supply: 0, borrow: 0, repay: 0, redeem: 0 }
    if (!actionAssetDaily) return t
    for (const row of actionAssetDaily) {
      const isStellar = stellarSyms.includes(row.token_symbol?.toUpperCase())
      if (chainFilter === "bsc" && isStellar) continue
      if (chainFilter === "stellar" && !isStellar) continue
      const a = row.action_type as keyof typeof t
      if (a in t) t[a] += row.volume || 0
    }
    return t
  }, [actionAssetDaily, chainFilter])

  const sum = totals.supply + totals.borrow + totals.repay + totals.redeem
  if (sum === 0) {
    return (
      <div className="text-sm text-foreground/40">
        {loading ? "Loading…" : "No activity for this filter"}
      </div>
    )
  }
  const rows = [
    { label: "Supply", value: totals.supply },
    { label: "Borrow", value: totals.borrow },
    { label: "Repay", value: totals.repay },
    { label: "Redeem", value: totals.redeem },
  ].map((r) => ({ ...r, percentage: (r.value / sum) * 100 }))
  return <MonoBarList rows={rows} />
}

interface StellarVaultsTableProps {
  vaults: NonNullable<ReturnType<typeof useStatsData>["stellar"]>["vaults"]
}

function StellarVaultsTable({ vaults }: StellarVaultsTableProps) {
  return (
    <div className="border border-foreground/[0.06] rounded-xl overflow-hidden">
      <div className="grid grid-cols-12 px-5 py-3 text-[11px] uppercase tracking-widest text-foreground/40 border-b border-foreground/[0.06] bg-foreground/[0.015]">
        <div className="col-span-3">Asset</div>
        <div className="col-span-3 text-right">TVL (supplied)</div>
        <div className="col-span-3 text-right">Borrowed</div>
        <div className="col-span-3 text-right">Utilization</div>
      </div>
      {vaults.map((v) => {
        const utilization =
          v.totalSupplyUnderlying > 0
            ? (v.totalBorrowedUnderlying / v.totalSupplyUnderlying) * 100
            : 0
        return (
          <div
            key={v.vaultId}
            className="grid grid-cols-12 px-5 py-4 items-center border-b border-foreground/[0.06] last:border-b-0"
          >
            <div className="col-span-3">
              <div className="font-medium">{v.symbol}</div>
              <div className="text-[11px] text-foreground/40 font-mono">
                {v.vaultId.slice(0, 4)}…{v.vaultId.slice(-4)}
              </div>
            </div>
            <div className="col-span-3 text-right font-mono tabular-nums text-sm">
              {formatNumber(v.liquidityUsd)}
            </div>
            <div className="col-span-3 text-right font-mono tabular-nums text-sm text-foreground/70">
              {formatNumber(v.borrowedUsd)}
            </div>
            <div className="col-span-3 text-right">
              <UtilizationBar percent={utilization} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function UtilizationBar({ percent }: { percent: number }) {
  const clamped = Math.max(0, Math.min(100, percent))
  return (
    <div className="inline-flex items-center gap-2">
      <span className="text-sm font-mono tabular-nums">{clamped.toFixed(1)}%</span>
      <span className="hidden sm:inline-block w-16 h-1 bg-foreground/[0.06] rounded-full overflow-hidden">
        <span className="block h-full bg-foreground" style={{ width: `${clamped}%` }} />
      </span>
    </div>
  )
}

function SectionLoadingSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 2 }).map((_, i) => (
        <div
          key={i}
          className="border border-foreground/[0.06] rounded-xl px-5 py-6"
        >
          <div className="skeleton-shimmer h-3 w-24 rounded" />
          <div className="skeleton-shimmer mt-4 h-6 w-40 rounded" />
        </div>
      ))}
    </div>
  )
}

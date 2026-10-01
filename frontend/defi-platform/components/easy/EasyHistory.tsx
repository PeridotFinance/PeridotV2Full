"use client"

import { useState, useMemo, useCallback, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer } from "recharts"
import {
  ArrowLeft,
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  RotateCcw,
} from "lucide-react"
import { formatDistanceToNow, parseISO, subDays, subMonths } from "date-fns"
import { cn } from "@/lib/utils"
import { usePortfolioEarnings } from "@/hooks/use-portfolio-earnings"
import { useActiveWallet } from "@/hooks/use-active-wallet"
import { useAuthedFetch } from "@/hooks/use-authed-fetch"
import { useStellarWallet } from "@/hooks/use-stellar-wallet"
import { getAssetById } from "@/data/market-data"

// ─── Types ────────────────────────────────────────────────────────────────────

type TimeRange = "1W" | "1M" | "3M" | "ALL"

interface TxRow {
  tx_hash: string
  action_type: string
  token_symbol: string
  amount: string
  usd_value: string
  points_awarded: number
  verified_at: string
  chain_id: number
}

interface HoverPoint {
  value: number
  label: string
}

// ─── Action metadata ──────────────────────────────────────────────────────────

const ACTION_META: Record<
  string,
  {
    label: (symbol: string) => string
    icon: typeof ArrowDownLeft
    iconBg: string
    iconColor: string
    sign: string
    amountColor: string
  }
> = {
  supply: {
    label: (s) => `Added ${s}`,
    icon: ArrowDownLeft,
    iconBg: "bg-emerald-500/15",
    iconColor: "text-emerald-400",
    sign: "+",
    amountColor: "text-emerald-400",
  },
  "cross-chain_supply": {
    label: (s) => `Added ${s}`,
    icon: ArrowDownLeft,
    iconBg: "bg-emerald-500/15",
    iconColor: "text-emerald-400",
    sign: "+",
    amountColor: "text-emerald-400",
  },
  redeem: {
    label: (s) => `Withdrew ${s}`,
    icon: ArrowUpRight,
    iconBg: "bg-white/8",
    iconColor: "text-foreground/50",
    sign: "-",
    amountColor: "text-foreground/70",
  },
  "cross-chain_redeem": {
    label: (s) => `Withdrew ${s}`,
    icon: ArrowUpRight,
    iconBg: "bg-white/8",
    iconColor: "text-foreground/50",
    sign: "-",
    amountColor: "text-foreground/70",
  },
  borrow: {
    label: (s) => `Took out a ${s} loan`,
    icon: Banknote,
    iconBg: "bg-sky-500/15",
    iconColor: "text-sky-400",
    sign: "",
    amountColor: "text-foreground/80",
  },
  "cross-chain_borrow": {
    label: (s) => `Took out a ${s} loan`,
    icon: Banknote,
    iconBg: "bg-sky-500/15",
    iconColor: "text-sky-400",
    sign: "",
    amountColor: "text-foreground/80",
  },
  repay: {
    label: (s) => `Repaid ${s} loan`,
    icon: RotateCcw,
    iconBg: "bg-white/8",
    iconColor: "text-foreground/50",
    sign: "-",
    amountColor: "text-foreground/70",
  },
  "cross-chain_repay": {
    label: (s) => `Repaid ${s} loan`,
    icon: RotateCcw,
    iconBg: "bg-white/8",
    iconColor: "text-foreground/50",
    sign: "-",
    amountColor: "text-foreground/70",
  },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number, decimals = 2) {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function relativeTime(dateStr: string) {
  try {
    return formatDistanceToNow(parseISO(dateStr), { addSuffix: true })
  } catch {
    return ""
  }
}

/** Split a formatted dollar amount into whole and decimal parts */
function splitAmount(n: number): [string, string] {
  const s = fmt(n)
  const dot = s.indexOf(".")
  return dot === -1 ? [s, "00"] : [s.slice(0, dot), s.slice(dot)]
}

// ─── Component ────────────────────────────────────────────────────────────────

export function EasyHistory() {
  const { address: activeAddress } = useActiveWallet()
  const { authedFetch, authReady } = useAuthedFetch()
  const { address: stellarAddress } = useStellarWallet()
  // Fall back to the Freighter G-address when the active wallet is empty —
  // covers the Stellar-only user who connected Freighter but hasn't logged in
  // via Privy. The transactions API resolves both EVM and Stellar lookups, so
  // either address gets the same unified result if the account is linked, or
  // the per-namespace fallback when it isn't.
  const address = activeAddress || stellarAddress
  const [timeRange, setTimeRange] = useState<TimeRange>("1M")
  const [hoverPoint, setHoverPoint] = useState<HoverPoint | null>(null)

  const handleHover = useCallback((p: HoverPoint | null) => {
    setHoverPoint((prev) => {
      // Avoid re-renders when nothing actually changed
      if (!p && !prev) return prev
      if (p && prev && p.value === prev.value && p.label === prev.label) return prev
      return p
    })
  }, [])

  // Pre-warmed by EasyModeCard — React Query cache hit, instant
  const earnings = usePortfolioEarnings()

  // Single DB query, 30 s server-side cache
  const queryClient = useQueryClient()
  const { data: txData, isLoading: txLoading } = useQuery({
    queryKey: ["easy-transactions", address, authReady],
    queryFn: async () => {
      if (!address) return { transactions: [] as TxRow[] }
      const res = await authedFetch(`/api/user/transactions?address=${address}&limit=100`)
      const json = await res.json()
      return json.success ? (json as { transactions: TxRow[] }) : { transactions: [] as TxRow[] }
    },
    enabled: !!address && authReady,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })

  // Invalidate immediately after a tx so the user doesn't sit through the 30s
  // staleTime before seeing their fresh action. Server still has its 30s cache,
  // but the verify-stellar route writes synchronously before returning so the
  // first refetch after the event picks up the new row.
  useEffect(() => {
    if (!address) return
    const handler = () => {
      queryClient.invalidateQueries({ queryKey: ["easy-transactions", address] })
    }
    window.addEventListener("peridot:tx-success" as any, handler)
    return () => window.removeEventListener("peridot:tx-success" as any, handler)
  }, [address, queryClient])

  const transactions = txData?.transactions ?? []

  // ── Build full chart timeline from transaction history ────────────────────────
  // earningsHistory is never populated by the API, so we derive it client-side
  // from the transactions we already fetch. Daily net deposits + linear earnings
  // interpolation gives a portfolio-value-over-time line.
  const rawChartData = useMemo(() => {
    const supplyOrRedeem = transactions.filter(
      (tx) => tx.action_type.includes("supply") || tx.action_type.includes("redeem")
    )
    if (!supplyOrRedeem.length) return []

    const sorted = [...supplyOrRedeem].sort(
      (a, b) => new Date(a.verified_at).getTime() - new Date(b.verified_at).getTime()
    )

    // Daily deposit/withdrawal deltas
    const dailyDelta = new Map<string, number>()
    sorted.forEach((tx) => {
      const d = new Date(tx.verified_at)
      d.setHours(0, 0, 0, 0)
      const key = d.toISOString().slice(0, 10)
      const val = parseFloat(tx.usd_value) || 0
      const delta = tx.action_type.includes("supply") ? val : -val
      dailyDelta.set(key, (dailyDelta.get(key) ?? 0) + delta)
    })

    const firstDate = new Date(sorted[0].verified_at)
    firstDate.setHours(0, 0, 0, 0)
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const totalDays = Math.max(1, (today.getTime() - firstDate.getTime()) / 86_400_000)
    const totalEarnings = earnings.totalLifetimeEarnings ?? 0

    const points: { date: string; value: number; ts: number }[] = []
    let runningDeposits = 0
    let dayIdx = 0
    const cursor = new Date(firstDate)

    while (cursor.getTime() <= today.getTime()) {
      const key = cursor.toISOString().slice(0, 10)
      runningDeposits = Math.max(0, runningDeposits + (dailyDelta.get(key) ?? 0))
      // Distribute total lifetime earnings linearly across the timeline
      const earnedToDate = totalEarnings * (dayIdx / totalDays)
      points.push({ date: key, value: runningDeposits + earnedToDate, ts: cursor.getTime() })
      cursor.setDate(cursor.getDate() + 1)
      dayIdx++
    }

    return points
  }, [transactions, earnings.totalLifetimeEarnings])

  // ── Filter chart data by selected time range ──────────────────────────────────
  const chartData = useMemo(() => {
    if (!rawChartData.length) return []
    const now = Date.now()
    const cutoffs: Record<TimeRange, number> = {
      "1W":  subDays(new Date(now), 7).getTime(),
      "1M":  subMonths(new Date(now), 1).getTime(),
      "3M":  subMonths(new Date(now), 3).getTime(),
      "ALL": 0,
    }
    const filtered = rawChartData.filter((p) => p.ts >= cutoffs[timeRange])
    // Fall back to full history if time range has fewer than 2 points
    return filtered.length > 1 ? filtered : rawChartData
  }, [rawChartData, timeRange])

  // ── Active positions ──────────────────────────────────────────────────────────
  const activePositions = useMemo(
    () =>
      (earnings.perTokenBreakdown ?? [])
        .filter((p) => p.totalSupplied - p.totalRedeemed > 0.01)
        .sort((a, b) => b.totalSupplied - b.totalRedeemed - (a.totalSupplied - a.totalRedeemed)),
    [earnings.perTokenBreakdown]
  )

  // ── Activity grouped by calendar day ─────────────────────────────────────────
  const groupedTxs = useMemo(() => {
    if (!transactions.length) return []
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    const byDate = new Map<number, TxRow[]>()
    transactions.forEach((tx) => {
      const d = new Date(tx.verified_at)
      d.setHours(0, 0, 0, 0)
      const key = d.getTime()
      if (!byDate.has(key)) byDate.set(key, [])
      byDate.get(key)!.push(tx)
    })

    return Array.from(byDate.entries())
      .sort(([a], [b]) => b - a)
      .map(([ts, txs]) => {
        const d = new Date(ts)
        let label: string
        if (d.getTime() === today.getTime()) label = "Today"
        else if (d.getTime() === yesterday.getTime()) label = "Yesterday"
        else
          label = d.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: d.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
          })
        return { label, txs }
      })
  }, [transactions])

  // ── Derived display values ────────────────────────────────────────────────────
  const totalEarned     = earnings.totalLifetimeEarnings ?? 0
  const effectiveApy    = earnings.effectiveApy ?? 0
  const monthlyEarnings = earnings.monthlyEarnings ?? 0
  const hasChart        = chartData.length > 1
  const hasPositions    = activePositions.length > 0
  const hasActivity     = transactions.length > 0

  // currentPortfolioValue depends on user_portfolio_apy_snapshots which may be
  // empty for many users. Fall back to the sum of perTokenBreakdown net positions,
  // which is always derived from verified transactions and is always available.
  const positionSum = activePositions.reduce((s, p) => s + (p.totalSupplied - p.totalRedeemed), 0)
  const currentValue =
    (earnings.currentPortfolioValue ?? 0) > 0
      ? (earnings.currentPortfolioValue ?? 0)
      : positionSum + totalEarned

  // The hero number: shows hovered chart value when scrubbing, otherwise current
  const heroValue = hoverPoint?.value ?? currentValue
  const [heroWhole, heroDec] = splitAmount(heroValue)

  // The sub-label: date when scrubbing, gain stats otherwise
  const heroSub = hoverPoint
    ? (() => {
        try {
          return new Date(hoverPoint.label).toLocaleDateString(undefined, {
            weekday: "short",
            month: "long",
            day: "numeric",
          })
        } catch {
          return hoverPoint.label
        }
      })()
    : null

  return (
    <div className="min-h-screen text-foreground font-sans">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div
          className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-primary/5 blur-[120px] animate-pulse"
          style={{ animationDuration: "8s" }}
        />
        <div
          className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-emerald-500/5 blur-[120px] animate-pulse"
          style={{ animationDuration: "10s" }}
        />
      </div>
      {/* `pointer-events-none` is critical here. Without it, this fixed
          grid overlay sits on top of every viewport pixel outside the
          centered `max-w-lg` main column and swallows mouse-wheel
          events. Desktop users could only scroll when their pointer
          was over the main column (assets / chart); the empty side
          gutters felt "dead". The companion blob overlay on the line
          above already disables pointer events for the same reason —
          this rule was missed when the grid was added. */}
      <div className="fixed inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))] pointer-events-none" />

      <main className="relative container max-w-lg mx-auto pb-24">
        {/* ── Nav ───────────────────────────────────────────────────────────── */}
        <div className="px-5 pt-6">
          <Link
            href="/app/easy"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Peridot
          </Link>
        </div>

        {/* ── Hero + Chart (unified block) ──────────────────────────────────── */}
        <div className="mt-8 px-5">
          {earnings.isLoading ? (
            <div className="space-y-3 mb-8">
              <div className="h-14 w-56 rounded-2xl bg-white/10 animate-pulse" />
              <div className="h-5 w-36 rounded-full bg-white/10 animate-pulse" />
            </div>
          ) : currentValue > 0 ? (
            <div className="mb-2">
              {/* Portfolio number — updates live while scrubbing the chart */}
              <div className="flex items-end gap-1 leading-none">
                <span className="text-5xl font-black tracking-tighter">${heroWhole}</span>
                <span className="text-2xl font-black tracking-tighter text-foreground/50 pb-0.5">
                  {heroDec}
                </span>
              </div>

              {/* Sub-line: date when hovering, gain pill + APY otherwise */}
              <div className="mt-2.5 flex items-center gap-2.5 flex-wrap min-h-[26px]">
                {heroSub ? (
                  <span className="text-sm text-muted-foreground">{heroSub}</span>
                ) : (
                  <>
                    {totalEarned > 0 && (
                      <span className="inline-flex items-center gap-1 bg-emerald-500/15 text-emerald-400 text-sm font-semibold px-2.5 py-0.5 rounded-full">
                        +${fmt(totalEarned)} earned
                      </span>
                    )}
                    {effectiveApy > 0 && (
                      <span className="text-sm text-muted-foreground">{fmt(effectiveApy, 1)}% APY</span>
                    )}
                    {monthlyEarnings > 0.01 && !effectiveApy && (
                      <span className="text-sm text-muted-foreground">≈ ${fmt(monthlyEarnings, 2)}/mo</span>
                    )}
                  </>
                )}
              </div>
            </div>
          ) : !earnings.isLoading ? (
            <div className="mb-8 space-y-2">
              <p className="text-2xl font-black">Start earning</p>
              <p className="text-sm text-muted-foreground">
                Deposit any asset and watch your money grow here.
              </p>
              <Link
                href="/app/easy"
                className="inline-flex items-center gap-2 mt-3 px-5 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-opacity"
              >
                Make my first deposit
              </Link>
            </div>
          ) : null}
        </div>

        {/* Chart — bleeds edge to edge. Gated on transaction data, not earnings.isLoading,
            so the selector never appears without an actual chart beneath it. */}
        {(txLoading || hasChart) && (
          <div className="mt-4">
            {txLoading ? (
              <div className="mx-5 h-48 rounded-2xl bg-white/5 animate-pulse" />
            ) : (
              <ResponsiveContainer width="100%" height={190}>
                <AreaChart
                  data={chartData}
                  margin={{ top: 8, right: 0, bottom: 0, left: 0 }}
                  onMouseMove={(state) => {
                    if (
                      state.isTooltipActive &&
                      state.activePayload?.length &&
                      state.activeLabel
                    ) {
                      handleHover({
                        value: state.activePayload[0].value as number,
                        label: state.activeLabel,
                      })
                    }
                  }}
                  onMouseLeave={() => handleHover(null)}
                >
                  <defs>
                    <linearGradient id="portfolioGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor="#10B981" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: "rgba(255,255,255,0.25)" }}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                    tickFormatter={(v) => {
                      try {
                        return new Date(v).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })
                      } catch {
                        return v
                      }
                    }}
                  />
                  <YAxis hide domain={["auto", "auto"]} />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#10B981"
                    strokeWidth={1.5}
                    fill="url(#portfolioGrad)"
                    dot={false}
                    activeDot={{ r: 3.5, fill: "#10B981", strokeWidth: 0 }}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}

            {/* Time range pill selector — only shown when chart data exists */}
            {hasChart && (
              <div className="flex justify-center gap-1 mt-3 px-5">
                {(["1W", "1M", "3M", "ALL"] as TimeRange[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => setTimeRange(r)}
                    className={cn(
                      "px-4 py-1.5 rounded-full text-xs font-bold transition-all",
                      timeRange === r
                        ? "bg-white/10 text-foreground"
                        : "text-muted-foreground/60 hover:text-muted-foreground"
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Section divider ───────────────────────────────────────────────── */}
        {(hasPositions || hasActivity || txLoading) && (
          <div className="h-px bg-white/[0.07] mx-5 mt-8 mb-6" />
        )}

        {/* ── Your assets ───────────────────────────────────────────────────── */}
        {hasPositions && (
          <div className="px-5 mb-8">
            <p className="text-sm font-semibold text-muted-foreground mb-1">Your assets</p>
            <div>
              {activePositions.map((pos) => {
                const net   = pos.totalSupplied - pos.totalRedeemed
                const asset = getAssetById(pos.tokenSymbol.toLowerCase())
                return (
                  <div
                    key={`${pos.tokenSymbol}-${pos.chainId}`}
                    className="flex items-center gap-3.5 py-3.5 border-b border-white/[0.06] last:border-0"
                  >
                    {asset?.icon ? (
                      <Image
                        src={asset.icon}
                        alt={pos.tokenSymbol}
                        width={40}
                        height={40}
                        className="rounded-full flex-shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold flex-shrink-0">
                        {pos.tokenSymbol.slice(0, 2)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-[15px]">{pos.tokenSymbol}</p>
                      {pos.earnings > 0.001 ? (
                        <p className="text-xs text-emerald-400 mt-0.5">+${fmt(pos.earnings)} earned</p>
                      ) : (
                        <p className="text-xs text-muted-foreground mt-0.5">Earning interest</p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-semibold text-[15px]">${fmt(net)}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Divider before activity ────────────────────────────────────────── */}
        {hasPositions && (hasActivity || txLoading) && (
          <div className="h-px bg-white/[0.07] mx-5 mb-6" />
        )}

        {/* ── Activity ──────────────────────────────────────────────────────── */}
        <div className="px-5">
          <p className="text-sm font-semibold text-muted-foreground mb-1">Activity</p>

          {txLoading ? (
            <div className="space-y-1 mt-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3.5 py-3">
                  <div className="w-10 h-10 rounded-full bg-white/8 animate-pulse flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 w-28 rounded-full bg-white/10 animate-pulse" />
                    <div className="h-3 w-16 rounded-full bg-white/5 animate-pulse" />
                  </div>
                  <div className="h-4 w-14 rounded-full bg-white/10 animate-pulse" />
                </div>
              ))}
            </div>
          ) : !hasActivity ? (
            <div className="py-8 text-center space-y-1">
              <p className="text-sm text-muted-foreground">Nothing yet.</p>
              <p className="text-xs text-muted-foreground/50">
                Deposits and withdrawals will appear here.
              </p>
            </div>
          ) : (
            <div className="mt-1">
              {groupedTxs.map(({ label, txs }) => (
                <div key={label} className="mb-2">
                  <p className="text-xs text-muted-foreground/40 pt-4 pb-1 first:pt-1">{label}</p>
                  {txs.map((tx, i) => {
                    const meta        = ACTION_META[tx.action_type]
                    const description = meta ? meta.label(tx.token_symbol) : tx.action_type.replace(/_/g, " ")
                    const Icon        = meta?.icon ?? ArrowDownLeft
                    const iconBg      = meta?.iconBg  ?? "bg-white/8"
                    const iconColor   = meta?.iconColor ?? "text-foreground/50"
                    const sign        = meta?.sign ?? ""
                    const amtColor    = meta?.amountColor ?? "text-foreground/80"
                    const usd         = parseFloat(tx.usd_value) || 0

                    return (
                      <div
                        key={tx.tx_hash ?? i}
                        className="flex items-center gap-3.5 py-3 border-b border-white/[0.06] last:border-0"
                      >
                        <div
                          className={cn(
                            "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0",
                            iconBg
                          )}
                        >
                          <Icon className={cn("w-[18px] h-[18px]", iconColor)} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[15px] font-semibold leading-tight">{description}</p>
                          <p className="text-xs text-muted-foreground/50 mt-0.5">
                            {relativeTime(tx.verified_at)}
                          </p>
                        </div>
                        <p className={cn("text-[15px] font-semibold tabular-nums flex-shrink-0", amtColor)}>
                          {sign}${fmt(usd)}
                        </p>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

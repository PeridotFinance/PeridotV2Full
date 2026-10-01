"use client"

import { useMemo, useState } from "react"
import { motion } from "framer-motion"
import { useQuery } from "@tanstack/react-query"
import { format, parseISO, isThisYear } from "date-fns"
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  RotateCcw,
  Sparkles,
  Clock,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useActiveWallet } from "@/hooks/use-active-wallet"
import { useAuthedFetch } from "@/hooks/use-authed-fetch"
import { useDemoMode } from "@/context/demo-mode"
import { DEMO_TRANSACTIONS, type DemoTxRow } from "@/data/demo-mock"

// ─── Types ────────────────────────────────────────────────────────────────────

type TxRow = DemoTxRow

// ─── Action metadata — plain language, no DeFi jargon ────────────────────────

const ACTION_META: Record<
  string,
  {
    label: (symbol: string) => string
    Icon: typeof ArrowDownLeft
    bg: string
    color: string
    sign: "+" | "-" | ""
    valueColor: string
  }
> = {
  supply:              { label: (s) => `Added ${s}`,           Icon: ArrowDownLeft, bg: "bg-emerald-500/15", color: "text-emerald-400", sign: "+", valueColor: "text-emerald-400" },
  "cross-chain_supply":{ label: (s) => `Added ${s}`,           Icon: ArrowDownLeft, bg: "bg-emerald-500/15", color: "text-emerald-400", sign: "+", valueColor: "text-emerald-400" },
  redeem:              { label: (s) => `Cashed out ${s}`,      Icon: ArrowUpRight,  bg: "bg-foreground/[0.08]",  color: "text-foreground/50", sign: "-", valueColor: "text-foreground/70" },
  "cross-chain_redeem":{ label: (s) => `Cashed out ${s}`,      Icon: ArrowUpRight,  bg: "bg-foreground/[0.08]",  color: "text-foreground/50", sign: "-", valueColor: "text-foreground/70" },
  borrow:              { label: (s) => `Borrowed ${s}`,        Icon: Banknote,      bg: "bg-sky-500/15",         color: "text-sky-400",       sign: "",  valueColor: "text-foreground/80" },
  "cross-chain_borrow":{ label: (s) => `Borrowed ${s}`,        Icon: Banknote,      bg: "bg-sky-500/15",         color: "text-sky-400",       sign: "",  valueColor: "text-foreground/80" },
  repay:               { label: (s) => `Repaid ${s} loan`,     Icon: RotateCcw,     bg: "bg-foreground/[0.08]",  color: "text-foreground/50", sign: "-", valueColor: "text-foreground/70" },
  "cross-chain_repay": { label: (s) => `Repaid ${s} loan`,     Icon: RotateCcw,     bg: "bg-foreground/[0.08]",  color: "text-foreground/50", sign: "-", valueColor: "text-foreground/70" },
  enter_markets:       { label: (_) => "Savings activated",   Icon: Sparkles,      bg: "bg-primary/15",    color: "text-primary",      sign: "",  valueColor: "text-muted-foreground" },
}

const FALLBACK_META = ACTION_META["supply"]

// ─── Filtering ────────────────────────────────────────────────────────────────

type FilterId = "all" | "deposit" | "withdraw" | "borrow" | "repay"

const TYPE_FILTERS: { id: FilterId; label: string }[] = [
  { id: "all",      label: "All"       },
  { id: "deposit",  label: "Deposits"  },
  { id: "withdraw", label: "Cash outs" },
  { id: "borrow",   label: "Borrowed"  },
  { id: "repay",    label: "Repaid"    },
]

/** Collapse the raw action_type (incl. cross-chain_* variants) into a filter bucket. */
function txCategory(action: string): Exclude<FilterId, "all"> | "other" {
  if (action.includes("supply")) return "deposit"
  if (action.includes("redeem")) return "withdraw"
  if (action.includes("borrow")) return "borrow"
  if (action.includes("repay"))  return "repay"
  return "other"
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function groupByMonth(rows: TxRow[]) {
  const groups: Record<string, TxRow[]> = {}
  rows.forEach((row) => {
    const d    = parseISO(row.verified_at)
    const key  = isThisYear(d) ? format(d, "MMMM yyyy") : format(d, "MMMM yyyy")
    if (!groups[key]) groups[key] = []
    groups[key].push(row)
  })
  return Object.entries(groups) // already in reverse-chron order if API returns that
}

function fmtUsd(val: string | number) {
  const n = typeof val === "string" ? parseFloat(val) : val
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function shortHash(hash: string) {
  if (!hash || hash.length < 12) return hash
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 px-5 py-4">
      <div className="w-9 h-9 rounded-full bg-foreground/10 animate-pulse shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-32 rounded-full bg-foreground/10 animate-pulse" />
        <div className="h-3 w-20 rounded-full bg-foreground/5 animate-pulse" />
      </div>
      <div className="h-4 w-14 rounded-full bg-foreground/10 animate-pulse" />
    </div>
  )
}

// ─── Single TX row ────────────────────────────────────────────────────────────

function ActivityRow({ tx, delay = 0 }: { tx: TxRow; delay?: number }) {
  const meta   = ACTION_META[tx.action_type] ?? FALLBACK_META
  const { Icon, bg, color, sign, valueColor, label } = meta
  const date   = parseISO(tx.verified_at)
  const usd    = parseFloat(tx.usd_value || "0")
  const showUsd = usd > 0

  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25, delay }}
      className="flex items-center gap-4 px-5 py-3.5 hover:bg-foreground/[0.03] active:bg-foreground/[0.05] transition-colors"
    >
      {/* Icon */}
      <div className={cn("w-9 h-9 rounded-full flex items-center justify-center shrink-0", bg)}>
        <Icon className={cn("w-4 h-4", color)} />
      </div>

      {/* Label + meta */}
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-semibold leading-tight truncate">
          {label(tx.token_symbol)}
        </p>
        <p className="text-[11px] text-muted-foreground/50 mt-0.5 flex items-center gap-1.5">
          <span>{format(date, "d MMM, HH:mm")}</span>
          {tx.tx_hash && (
            <>
              <span className="text-foreground/20">·</span>
              <span className="font-mono text-[10px]">{shortHash(tx.tx_hash)}</span>
            </>
          )}
        </p>
      </div>

      {/* Amount */}
      <div className="text-right shrink-0">
        {showUsd ? (
          <p className={cn("text-[14px] font-bold tabular-nums", valueColor)}>
            {sign !== "" ? sign : ""}${fmtUsd(usd)}
          </p>
        ) : (
          <p className={cn("text-[13px] font-semibold tabular-nums", valueColor)}>
            {tx.amount ? `${parseFloat(tx.amount).toFixed(4)} ${tx.token_symbol}` : "—"}
          </p>
        )}
      </div>
    </motion.div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ActivityPage() {
  const { address } = useActiveWallet()
  const { authedFetch, authReady } = useAuthedFetch()
  const { isDemoMode } = useDemoMode()

  const { data: liveData, isLoading: liveLoading, isError } = useQuery({
    queryKey: ["dev-transactions", address, authReady],
    enabled: !isDemoMode && Boolean(address) && authReady,
    staleTime:            30_000,
    gcTime:               5 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const res  = await authedFetch(`/api/user/transactions?address=${address}&limit=200`)
      const json = await res.json()
      return (json.transactions ?? []) as TxRow[]
    },
  })

  const data      = isDemoMode ? [] : liveData
  const isLoading = isDemoMode ? false : liveLoading

  // ── Filters ──
  const [typeFilter, setTypeFilter]   = useState<FilterId>("all")
  const [assetFilter, setAssetFilter] = useState<string>("all")

  // Distinct asset symbols present in the history, for the asset chips.
  const assets = useMemo(() => {
    const set = new Set<string>()
    ;(data ?? []).forEach((tx) => tx.token_symbol && set.add(tx.token_symbol))
    return Array.from(set).sort()
  }, [data])

  // Which type buckets actually occur — hide filters the user can't ever match.
  const presentTypes = useMemo(() => {
    const set = new Set<string>()
    ;(data ?? []).forEach((tx) => set.add(txCategory(tx.action_type)))
    return set
  }, [data])

  const filtered = useMemo(() => {
    return (data ?? []).filter((tx) => {
      if (typeFilter !== "all" && txCategory(tx.action_type) !== typeFilter) return false
      if (assetFilter !== "all" && tx.token_symbol !== assetFilter) return false
      return true
    })
  }, [data, typeFilter, assetFilter])

  const groups = useMemo(() => {
    if (!filtered.length) return []
    return groupByMonth(filtered)
  }, [filtered])

  const hasData      = !isLoading && !isError && (data?.length ?? 0) > 0
  const isEmpty      = !isLoading && !isError && (data?.length ?? 0) === 0
  const noMatches    = hasData && groups.length === 0

  return (
    <div className="max-w-lg mx-auto w-full">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
      >
        {/* ── Header ── */}
        <div className="px-5 pt-8 pb-2">
          <h1 className="text-[22px] font-black tracking-tight">Activity</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Your full transaction history</p>
        </div>

        {/* ── Filters ── */}
        {hasData && (
          <div className="mt-2 space-y-2">
            {/* Type — horizontally scrollable pills */}
            <div className="flex gap-2 overflow-x-auto px-5 pb-1 scrollbar-hide [-webkit-overflow-scrolling:touch]">
              {TYPE_FILTERS.filter((f) => f.id === "all" || presentTypes.has(f.id)).map((f) => (
                <button
                  key={f.id}
                  onClick={() => setTypeFilter(f.id)}
                  className={cn(
                    "shrink-0 px-3.5 py-1.5 rounded-full text-[13px] font-semibold transition-colors",
                    typeFilter === f.id
                      ? "bg-foreground text-background"
                      : "bg-foreground/[0.06] text-muted-foreground active:bg-foreground/[0.1]"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Asset — only worth showing when more than one asset exists */}
            {assets.length > 1 && (
              <div className="flex gap-2 overflow-x-auto px-5 pb-1 scrollbar-hide [-webkit-overflow-scrolling:touch]">
                <button
                  onClick={() => setAssetFilter("all")}
                  className={cn(
                    "shrink-0 px-3 py-1 rounded-full text-[12px] font-medium transition-colors",
                    assetFilter === "all"
                      ? "bg-primary/15 text-primary"
                      : "bg-foreground/[0.04] text-muted-foreground/70 active:bg-foreground/[0.08]"
                  )}
                >
                  All assets
                </button>
                {assets.map((sym) => (
                  <button
                    key={sym}
                    onClick={() => setAssetFilter(sym)}
                    className={cn(
                      "shrink-0 px-3 py-1 rounded-full text-[12px] font-medium transition-colors",
                      assetFilter === sym
                        ? "bg-primary/15 text-primary"
                        : "bg-foreground/[0.04] text-muted-foreground/70 active:bg-foreground/[0.08]"
                    )}
                  >
                    {sym}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── No matches for the active filter ── */}
        {noMatches && (
          <div className="py-14 px-6 text-center">
            <p className="text-sm font-semibold text-foreground/50">Nothing here</p>
            <p className="text-xs text-muted-foreground/40 mt-1">
              No activity matches these filters.
            </p>
            <button
              onClick={() => { setTypeFilter("all"); setAssetFilter("all") }}
              className="mt-3 text-xs font-semibold text-primary active:opacity-70"
            >
              Clear filters
            </button>
          </div>
        )}

        {/* ── Loading ── */}
        {isLoading && (
          <div className="mt-4 mx-5 rounded-2xl bg-foreground/[0.03] border border-foreground/[0.07] overflow-hidden divide-y divide-foreground/[0.06]">
            {[...Array(5)].map((_, i) => <SkeletonRow key={i} />)}
          </div>
        )}

        {/* ── Error ── */}
        {isError && (
          <div className="mx-5 mt-6 rounded-2xl bg-red-500/10 border border-red-500/20 px-5 py-4">
            <p className="text-sm text-red-400 font-semibold">Couldn't load activity</p>
            <p className="text-xs text-red-400/60 mt-0.5">Try refreshing the page.</p>
          </div>
        )}

        {/* ── Empty ── */}
        {isEmpty && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-20 px-6 text-center"
          >
            <div className="w-14 h-14 rounded-full bg-foreground/[0.05] border border-foreground/[0.08] flex items-center justify-center mb-4">
              <Clock className="w-6 h-6 text-muted-foreground/30" />
            </div>
            <p className="text-sm font-bold text-foreground/50">No activity yet</p>
            <p className="text-xs text-muted-foreground/40 mt-1">
              Transactions will appear here once you start saving.
            </p>
          </motion.div>
        )}

        {/* ── Grouped feed ── */}
        {groups.map(([month, txs]) => (
          <div key={month} className="mt-4">
            {/* Month label */}
            <p className="px-5 pb-2 text-[11px] font-black uppercase tracking-widest text-muted-foreground/40">
              {month}
            </p>

            {/* TX list */}
            <div className="mx-5 rounded-2xl bg-foreground/[0.03] border border-foreground/[0.07] overflow-hidden divide-y divide-foreground/[0.05]">
              {txs.map((tx, i) => (
                <ActivityRow
                  key={tx.tx_hash || `${tx.action_type}-${i}`}
                  tx={tx}
                  delay={i * 0.03}
                />
              ))}
            </div>
          </div>
        ))}

        <div className="h-6" />
      </motion.div>
    </div>
  )
}

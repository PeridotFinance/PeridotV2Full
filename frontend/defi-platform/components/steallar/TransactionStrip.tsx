// FILE: components/steallar/TransactionStrip.tsx
"use client"

import Link from "next/link"
import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useQuery } from "@tanstack/react-query"
import {
  ArrowDownCircle,
  ArrowUpCircle,
  RotateCcw,
  ShieldCheck,
  Circle,
  ChevronRight,
  ChevronDown,
} from "lucide-react"
import { useActiveWallet } from "@/hooks/use-active-wallet"
import { useAuthedFetch } from "@/hooks/use-authed-fetch"
import { useDemoMode } from "@/context/demo-mode"
import { DEMO_TRANSACTIONS, type DemoTxRow } from "@/data/demo-mock"
import { cn } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────

interface TransactionStripProps {
  isConnected: boolean
  className?: string
}

// ─── Stable detection ─────────────────────────────────────────────────────────
// USD-pegged stablecoins are shown as plain dollars in consumer copy;
// non-stables get the symbol as a muted suffix.

const STABLE_SYMBOLS = new Set([
  "USDC",
  "USDT",
  "DAI",
  "BUSD",
  "TUSD",
  "FRAX",
  "USDD",
])

function isStable(symbol: string): boolean {
  return STABLE_SYMBOLS.has(symbol.toUpperCase())
}

// ─── Action metadata ──────────────────────────────────────────────────────────

interface ActionMeta {
  label: string
  Icon: React.ComponentType<{ className?: string; size?: number }>
  iconClass: string
}

function getActionMeta(actionType: string): ActionMeta {
  switch (actionType) {
    case "supply":
    case "cross-chain_supply":
      return {
        label: "Deposit",
        Icon: ArrowDownCircle,
        iconClass: "text-emerald-600",
      }
    case "borrow":
      return { label: "Borrow", Icon: ArrowUpCircle, iconClass: "text-rose-500" }
    case "repay":
      return { label: "Repaid", Icon: RotateCcw, iconClass: "text-blue-500" }
    case "withdraw":
      return {
        label: "Withdraw",
        Icon: ArrowUpCircle,
        iconClass: "text-amber-500",
      }
    case "enter_markets":
      return {
        label: "Set as collateral",
        Icon: ShieldCheck,
        iconClass: "text-muted-foreground/80",
      }
    default:
      return {
        label: actionType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        Icon: Circle,
        iconClass: "text-muted-foreground/80",
      }
  }
}

// ─── Relative-date formatter ──────────────────────────────────────────────────

function formatRelativeDate(isoString: string): string {
  const now = Date.now()
  const then = new Date(isoString).getTime()
  const diffMs = now - then
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays < 1) return "Today"
  if (diffDays === 1) return "1 day ago"
  if (diffDays < 7) return `${diffDays} days ago`
  const diffWeeks = Math.floor(diffDays / 7)
  if (diffWeeks === 1) return "1 week ago"
  if (diffWeeks < 5) return `${diffWeeks} weeks ago`
  const diffMonths = Math.floor(diffDays / 30)
  if (diffMonths === 1) return "1 month ago"
  return `${diffMonths} months ago`
}

// ─── Amount formatter ─────────────────────────────────────────────────────────
// Stables → "$800", "$1,950".  Non-stables → "$1,324 (≈ 0.43 ETH)".
// Setup-only rows (enter_markets) hide the amount entirely.

function formatAmount({
  amount,
  symbol,
  usdValue,
  actionType,
}: {
  amount: string
  symbol: string
  usdValue: string
  actionType: string
}): { primary: string; secondary?: string } | null {
  if (actionType === "enter_markets") return null

  const usd = parseFloat(usdValue)
  const tokens = parseFloat(amount)
  if (!Number.isFinite(usd) && !Number.isFinite(tokens)) return null

  // Whole-dollar amounts hide the cents — `$800` reads cleaner than `$800.00`
  // for the dominant fintech use case (round-number deposits / repays).
  const isWhole = Number.isFinite(usd) && Math.round(usd) === usd
  const primaryUsd = Number.isFinite(usd)
    ? `$${usd.toLocaleString("en-US", {
        minimumFractionDigits: isWhole ? 0 : 2,
        maximumFractionDigits: isWhole ? 0 : 2,
      })}`
    : null

  if (isStable(symbol)) {
    return { primary: primaryUsd ?? `$${tokens.toLocaleString("en-US")}` }
  }

  const tokenStr = `${tokens.toLocaleString("en-US", {
    maximumFractionDigits: 4,
  })} ${symbol}`

  return primaryUsd
    ? { primary: primaryUsd, secondary: tokenStr }
    : { primary: tokenStr }
}

// ─── Row component ────────────────────────────────────────────────────────────

function TxRow({ tx, index }: { tx: DemoTxRow; index: number }) {
  const meta = getActionMeta(tx.action_type)
  const amount = formatAmount({
    amount: tx.amount,
    symbol: tx.token_symbol,
    usdValue: tx.usd_value,
    actionType: tx.action_type,
  })
  const relDate = formatRelativeDate(tx.verified_at)

  return (
    <motion.div
      data-testid={`tx-row-${tx.tx_hash}`}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      // Cap the stagger so deep rows (e.g. row 50 after "Load more") don't
      // inherit a multi-second delay — the entrance stays snappy.
      transition={{ duration: 0.22, delay: Math.min(index, 8) * 0.05, ease: "easeOut" }}
      className="flex items-center gap-3 py-3 border-b border-foreground/[0.04] last:border-0"
    >
      {/* Action icon */}
      <div className={cn("shrink-0", meta.iconClass)}>
        <meta.Icon size={18} />
      </div>

      {/* Label + relative date */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground/90 leading-tight truncate">
          {meta.label}
        </p>
        <p className="text-xs text-muted-foreground/80">{relDate}</p>
      </div>

      {/* Amount */}
      {amount && (
        <div className="flex flex-col items-end gap-0.5 shrink-0">
          <span className="text-sm font-semibold text-foreground tabular-nums">
            {amount.primary}
          </span>
          {amount.secondary && (
            <span className="text-[11px] text-muted-foreground/80 tabular-nums">
              {amount.secondary}
            </span>
          )}
        </div>
      )}

      {/* Points pill — kept tucked to the right, only when awarded */}
      {tx.points_awarded > 0 && (
        <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-500/10 rounded-full px-1.5 py-0.5 leading-none shrink-0">
          +{tx.points_awarded} pts
        </span>
      )}
    </motion.div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

// Collapsed strip shows the 5 most recent rows. On "See all" we lazily fetch a
// larger batch and reveal it in place, in chunks — no page navigation.
const COLLAPSED_COUNT = 5
const BASE_VISIBLE = 12
const LOAD_MORE_STEP = 12
const FULL_LIMIT = 100

const HEIGHT_EXPAND = {
  initial: { opacity: 0, height: 0 },
  animate: { opacity: 1, height: "auto" as const },
  exit: { opacity: 0, height: 0 },
  transition: { duration: 0.25, ease: [0.25, 1, 0.5, 1] as const },
}

export function TransactionStrip({ isConnected, className }: TransactionStripProps) {
  const { isDemoMode } = useDemoMode()
  const { address } = useActiveWallet()
  const { authedFetch, authReady } = useAuthedFetch()

  const useLive = isConnected && !isDemoMode && Boolean(address) && authReady

  const [expanded, setExpanded] = useState(false)
  const [visible, setVisible] = useState(BASE_VISIBLE)

  // Recent (always-on) — the cheap 5-row default render.
  const { data: liveTxs } = useQuery<DemoTxRow[]>({
    queryKey: ["user-transactions", address],
    queryFn: async () => {
      const res = await authedFetch(`/api/user/transactions?address=${address}&limit=${COLLAPSED_COUNT}`)
      if (!res.ok) throw new Error("Failed to fetch transactions")
      const json = await res.json()
      return Array.isArray(json) ? json : (json?.transactions ?? [])
    },
    enabled: useLive,
    staleTime: 30_000,
  })

  // Full batch — only fetched once the user expands the strip.
  const { data: liveAllTxs, isLoading: allLoading } = useQuery<DemoTxRow[]>({
    queryKey: ["user-transactions", address, "all"],
    queryFn: async () => {
      const res = await authedFetch(`/api/user/transactions?address=${address}&limit=${FULL_LIMIT}`)
      if (!res.ok) throw new Error("Failed to fetch transactions")
      const json = await res.json()
      return Array.isArray(json) ? json : (json?.transactions ?? [])
    },
    enabled: useLive && expanded,
    staleTime: 30_000,
  })

  const recentTxs: DemoTxRow[] = useLive
    ? (Array.isArray(liveTxs) ? liveTxs : DEMO_TRANSACTIONS).slice(0, COLLAPSED_COUNT)
    : DEMO_TRANSACTIONS.slice(0, COLLAPSED_COUNT)

  const allTxs: DemoTxRow[] = useLive
    ? (Array.isArray(liveAllTxs) ? liveAllTxs : DEMO_TRANSACTIONS)
    : DEMO_TRANSACTIONS

  const shown = expanded ? allTxs.slice(0, visible) : recentTxs
  const hasMore = expanded && visible < allTxs.length
  // While the full batch is still loading, fall back to the rows we already
  // have so the list never flashes empty during expansion.
  const expandedEmpty = expanded && useLive && allLoading && allTxs.length === 0

  function toggle() {
    if (expanded) {
      setExpanded(false)
      setVisible(BASE_VISIBLE)
    } else {
      setExpanded(true)
    }
  }

  return (
    <motion.div
      data-testid="transaction-strip"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.35, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {/* Header */}
      <div className="flex items-baseline justify-between mb-2">
        <p className="text-sm font-semibold text-foreground/90">Recent activity</p>
        {recentTxs.length > 0 && (
          <button
            type="button"
            onClick={toggle}
            data-testid="transaction-strip-toggle"
            className="inline-flex items-center gap-0.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? "Show less" : "See all"}
            <ChevronDown
              size={12}
              className={cn("transition-transform", expanded && "rotate-180")}
            />
          </button>
        )}
      </div>

      {/* List */}
      {recentTxs.length === 0 ? (
        <p className="text-sm text-muted-foreground/80 py-6 text-center">No activity yet</p>
      ) : expandedEmpty ? (
        <p className="text-sm text-muted-foreground/80 py-6 text-center">Loading…</p>
      ) : (
        <div>
          {shown.map((tx, i) => (
            <TxRow key={tx.tx_hash} tx={tx} index={i} />
          ))}
        </div>
      )}

      {/* Load more + full-history link, only while expanded */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div {...HEIGHT_EXPAND} className="overflow-hidden">
            <div className="flex items-center justify-between pt-3">
              {hasMore ? (
                <button
                  type="button"
                  onClick={() => setVisible((v) => v + LOAD_MORE_STEP)}
                  data-testid="transaction-strip-load-more"
                  className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  Load more
                </button>
              ) : (
                <span />
              )}
              <Link
                href="/app/easy/history"
                className="inline-flex items-center gap-0.5 text-xs font-medium text-muted-foreground/80 hover:text-foreground transition-colors"
              >
                Open full history
                <ChevronRight size={12} />
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

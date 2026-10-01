"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useQuery } from "@tanstack/react-query"
import { useActiveWallet } from "@/hooks/use-active-wallet"
import { useAuthedFetch } from "@/hooks/use-authed-fetch"
import {
  ArrowLeft,
  Download,
  FileSpreadsheet,
  FileText,
  ChevronDown,
  Loader2,
  TrendingUp,
  ArrowDownLeft,
  ArrowUpRight,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import Link from "next/link"

// ─── Types ────────────────────────────────────────────────────────────────────

interface TxRow {
  tx_hash: string
  action_type: string
  token_symbol: string
  amount: string
  usd_value: string
  verified_at: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function parseYear(tx: TxRow) {
  return new Date(tx.verified_at).getFullYear()
}

function isSupply(type: string)  { return type === "supply"  || type === "cross-chain_supply"  }
function isRedeem(type: string)  { return type === "redeem"  || type === "cross-chain_redeem"  }
function isBorrow(type: string)  { return type === "borrow"  || type === "cross-chain_borrow"  }

// ─── Stat box ─────────────────────────────────────────────────────────────────

function StatBox({
  icon: Icon,
  label,
  value,
  color = "text-foreground",
}: {
  icon: typeof TrendingUp
  label: string
  value: string
  color?: string
}) {
  return (
    <div className="flex items-center gap-3 p-4 rounded-2xl bg-foreground/[0.04] border border-foreground/[0.07]">
      <div className="w-9 h-9 rounded-xl bg-foreground/[0.05] flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-muted-foreground" />
      </div>
      <div>
        <p className="text-[11px] text-muted-foreground/50 uppercase font-bold tracking-wide">{label}</p>
        <p className={cn("text-[16px] font-black tabular-nums mt-0.5", color)}>{value}</p>
      </div>
    </div>
  )
}

// ─── Year picker ──────────────────────────────────────────────────────────────

function YearPicker({
  years,
  selected,
  onChange,
}: {
  years: number[]
  selected: number
  onChange: (y: number) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-foreground/[0.05] border border-foreground/10 text-sm font-bold hover:bg-foreground/[0.08] transition-colors"
      >
        {selected}
        <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-28 rounded-2xl bg-background border border-foreground/[0.08] shadow-xl overflow-hidden z-20"
          >
            {years.map((y) => (
              <button
                key={y}
                type="button"
                onClick={() => { onChange(y); setOpen(false) }}
                className={cn(
                  "w-full text-left px-4 py-2.5 text-sm font-semibold transition-colors",
                  y === selected
                    ? "text-emerald-400 bg-emerald-500/10"
                    : "hover:bg-foreground/[0.04] text-foreground"
                )}
              >
                {y}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TaxPage() {
  const { address } = useActiveWallet()
  const { authedFetch } = useAuthedFetch()
  const currentYear = new Date().getFullYear()
  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [isExporting, setIsExporting] = useState(false)

  const { data: allTxs, isLoading } = useQuery({
    queryKey: ["dev-transactions-tax", address],
    enabled:  Boolean(address),
    staleTime:            60_000,
    gcTime:               5 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const res  = await fetch(`/api/user/transactions?address=${address}&limit=500`)
      const json = await res.json()
      return (json.transactions ?? []) as TxRow[]
    },
  })

  // ── Compute stats for selected year ──
  const yearTxs = (allTxs ?? []).filter((tx) => parseYear(tx) === selectedYear)

  const totalDeposited  = yearTxs.filter((t) => isSupply(t.action_type))
    .reduce((s, t) => s + parseFloat(t.usd_value || "0"), 0)
  const totalWithdrawn  = yearTxs.filter((t) => isRedeem(t.action_type))
    .reduce((s, t) => s + parseFloat(t.usd_value || "0"), 0)
  const totalBorrowed   = yearTxs.filter((t) => isBorrow(t.action_type))
    .reduce((s, t) => s + parseFloat(t.usd_value || "0"), 0)

  // Interest earned ≈ difference between supply and redeem when positive
  // A real tax calculation would require on-chain data; this is a best-effort estimate
  const estimatedInterest = Math.max(0, totalWithdrawn - totalDeposited + /* net held */ 0)

  // Available years from tx data (plus current year always)
  const availableYears = Array.from(
    new Set([currentYear, currentYear - 1, ...(allTxs ?? []).map(parseYear)])
  ).sort((a, b) => b - a)

  // ── CSV export ──
  const handleExportCsv = async () => {
    if (!address) return
    setIsExporting(true)
    try {
      const res = await fetch(`/api/user/export-csv?address=${address}&year=${selectedYear}`)
      if (!res.ok) throw new Error("Export failed")
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement("a")
      a.href     = url
      a.download = `peridot-${selectedYear}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast.success("CSV downloaded")
    } catch {
      toast.error("Export failed — try again")
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="max-w-lg mx-auto w-full">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
      >
        {/* ── Header ── */}
        <div className="flex items-center gap-3 px-5 pt-8 pb-2">
          <Link
            href="/app/easy/account"
            className="w-9 h-9 rounded-full bg-foreground/[0.05] border border-foreground/[0.08] flex items-center justify-center hover:bg-foreground/[0.09] transition-colors shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex-1">
            <h1 className="text-[22px] font-black tracking-tight">Tax documents</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Annual summary & export</p>
          </div>
          <YearPicker years={availableYears} selected={selectedYear} onChange={setSelectedYear} />
        </div>

        {/* ── Summary card ── */}
        <motion.div
          key={selectedYear}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mx-5 mt-5 rounded-2xl bg-foreground/[0.04] border border-foreground/[0.08] p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <p className="text-[12px] font-black uppercase tracking-widest text-muted-foreground/50">
              {selectedYear} Summary
            </p>
            {isLoading && <Loader2 className="w-4 h-4 text-muted-foreground/40 animate-spin" />}
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-16 rounded-2xl bg-foreground/10 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              <StatBox
                icon={TrendingUp}
                label="Interest earned (est.)"
                value={`$${fmt(estimatedInterest)}`}
                color="text-emerald-400"
              />
              <StatBox
                icon={ArrowDownLeft}
                label="Total deposited"
                value={`$${fmt(totalDeposited)}`}
              />
              <StatBox
                icon={ArrowUpRight}
                label="Total withdrawn"
                value={`$${fmt(totalWithdrawn)}`}
              />
              {totalBorrowed > 0 && (
                <StatBox
                  icon={FileText}
                  label="Total borrowed"
                  value={`$${fmt(totalBorrowed)}`}
                  color="text-sky-400"
                />
              )}
            </div>
          )}

          {!isLoading && yearTxs.length === 0 && (
            <p className="text-sm text-muted-foreground/50 text-center py-4">
              No transactions found for {selectedYear}.
            </p>
          )}
        </motion.div>

        {/* ── Disclaimer ── */}
        <p className="mx-5 mt-3 text-[11px] text-muted-foreground/40 leading-relaxed">
          Interest estimates are based on your recorded transactions. For precise tax figures,
          consult a tax professional or use the CSV export below.
        </p>

        {/* ── Export buttons ── */}
        <div className="mx-5 mt-5 space-y-3">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={isExporting || isLoading || yearTxs.length === 0}
            className={cn(
              "w-full h-14 rounded-2xl flex items-center justify-center gap-3",
              "bg-emerald-600 hover:bg-emerald-500 text-white",
              "font-bold text-[15px] shadow-lg shadow-emerald-500/20",
              "transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            {isExporting ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Exporting…</>
            ) : (
              <><FileSpreadsheet className="w-5 h-5" /> Download CSV</>
            )}
          </button>

          <button
            type="button"
            disabled
            className="w-full h-12 rounded-2xl flex items-center justify-center gap-3 border border-foreground/[0.1] text-muted-foreground/40 font-semibold text-sm cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            PDF report — coming soon
          </button>
        </div>

        <div className="h-8" />
      </motion.div>
    </div>
  )
}

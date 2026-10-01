"use client"

import { useEffect, useMemo, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { motion } from "framer-motion"
import Image from "next/image"
import { ArrowLeft, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { useCrossChainBalances } from "@/hooks/use-cross-chain-balances"
import { useApyData } from "@/hooks/use-apy-data"
import { useStellarSheets } from "@/context/stellar-sheets"
import { useDemoMode } from "@/context/demo-mode"
import { DEMO_POSITIONS, DEMO_APY_DATA } from "@/data/demo-mock"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number, digits = 2) {
  return n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })
}
function fmtToken(n: number, symbol: string) {
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${symbol}`
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PositionDetailPage() {
  const router = useRouter()
  const params = useParams()
  const posId = decodeURIComponent(params.posId as string)

  const { isDemoMode, setDemoMode } = useDemoMode()
  const { liveApyData } = useApyData()
  const { allPositions: livePositions, isLoading: liveLoading } = useCrossChainBalances(liveApyData)
  // Withdraw, repay and add-more run in the shared sheets (mounted by the
  // Easy layout shell), the same flows desktop uses. This page only shows the
  // position and hands the user to them.
  const { openDeposit, openWithdraw, openRepay } = useStellarSheets()

  const allPositions = isDemoMode ? DEMO_POSITIONS as typeof livePositions : livePositions
  const isLoading    = isDemoMode ? false : liveLoading
  const apyData      = isDemoMode ? DEMO_APY_DATA : liveApyData

  const position = useMemo(
    () => allPositions.find((p) => `${p.assetId}-${p.chainId}` === posId),
    [allPositions, posId]
  )

  const isSupply = !!(position && position.suppliedBalance > 0)
  const maxUsd   = position ? (isSupply ? position.suppliedValueUSD : position.borrowedValueUSD) : 0
  const balance  = position ? (isSupply ? position.suppliedBalance  : position.borrowedBalance)  : 0
  const apy      = position
    ? (isSupply
        ? apyData[position.chainId]?.[position.assetId]?.supplyApy ?? 0
        : apyData[position.chainId]?.[position.assetId]?.borrowApy ?? 0)
    : 0

  // Earnings / cost
  const dailyInterest   = apy > 0 ? maxUsd * (apy / 100) / 365 : 0
  const monthlyInterest = dailyInterest * 30
  const yearlyInterest  = apy > 0 ? maxUsd * (apy / 100) : 0

  // A position that was on screen and is gone now was just emptied (a full
  // withdraw or repay from the sheet). Go back to the list instead of leaving
  // the user on "Position not found".
  const hadPositionRef = useRef(false)
  useEffect(() => {
    if (position) {
      hadPositionRef.current = true
    } else if (hadPositionRef.current && !isLoading) {
      router.replace("/app/easy/portfolio")
    }
  }, [position, isLoading, router])

  // ── Loading state ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="max-w-lg mx-auto px-5 pt-8">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-muted-foreground/50 hover:text-foreground transition-colors mb-8">
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm font-semibold">Portfolio</span>
        </button>
        <div className="space-y-4">
          <div className="h-6 w-32 rounded-full bg-foreground/10 animate-pulse" />
          <div className="h-16 w-48 rounded-2xl bg-foreground/10 animate-pulse" />
          <div className="h-32 rounded-2xl bg-foreground/[0.05] animate-pulse" />
        </div>
      </div>
    )
  }

  // ── Not found ──────────────────────────────────────────────────────────────
  if (!position) {
    return (
      <div className="max-w-lg mx-auto px-5 pt-8">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-muted-foreground/50 hover:text-foreground transition-colors mb-8">
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm font-semibold">Portfolio</span>
        </button>
        <p className="text-muted-foreground/50 text-sm">Position not found.</p>
      </div>
    )
  }

  const accentColor = isSupply ? "emerald" : "amber"

  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="max-w-lg mx-auto"
    >
      {/* ── Back nav ── */}
      <div className="flex items-center gap-3 px-5 pt-6 pb-2">
        <button
          onClick={() => router.back()}
          className="w-8 h-8 rounded-full bg-foreground/[0.06] flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <span className="text-[13px] font-semibold text-muted-foreground/50">Portfolio</span>
      </div>

      <div className="px-5">
        {/* ── Identity: icon left, name + badges right ── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
          className="flex items-center gap-4 pt-4 pb-5"
        >
          <div className={cn(
            "w-14 h-14 rounded-full flex items-center justify-center overflow-hidden shrink-0 shadow-lg",
            "bg-foreground/[0.06] border",
            isSupply ? "border-emerald-500/20" : "border-amber-500/20"
          )}>
            {position.icon ? (
              <Image src={position.icon} alt={position.symbol} width={40} height={40} className="rounded-full" unoptimized />
            ) : (
              <span className="text-xl font-black text-foreground/60">{position.symbol[0]}</span>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[22px] font-black leading-tight">{position.symbol}</span>
              {apy > 0 && (
                <span className={cn(
                  "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-black tracking-wide",
                  isSupply
                    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                    : "bg-amber-500/15 text-amber-400 border border-amber-500/20"
                )}>
                  <span className={cn("w-1.5 h-1.5 rounded-full", isSupply ? "bg-emerald-400" : "bg-amber-400")} />
                  {apy.toFixed(1)}% {isSupply ? "APY" : "APR"}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className={cn(
                "text-[12px] font-semibold",
                isSupply ? "text-muted-foreground/50" : "text-amber-400/60"
              )}>
                {isSupply ? "Savings account" : "Active loan"}
              </span>
              {position.chainName && (
                <>
                  <span className="text-muted-foreground/20 text-[10px]">·</span>
                  <span className="text-[11px] font-bold text-muted-foreground/35 bg-foreground/[0.04] border border-foreground/[0.07] px-2 py-0.5 rounded-full">
                    {position.chainName}
                  </span>
                </>
              )}
            </div>
          </div>
        </motion.div>

        {/* ── Balance hero ── */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.08 }}
          className="mb-5 relative"
        >
          {/* ambient glow */}
          <div className={cn(
            "absolute -top-4 -left-4 w-48 h-20 blur-3xl rounded-full pointer-events-none opacity-40",
            isSupply ? "bg-emerald-500/20" : "bg-amber-500/15"
          )} />
          <p className={cn(
            "text-[3rem] font-black tracking-tighter tabular-nums leading-none relative",
            !isSupply && "text-amber-400"
          )}>
            {!isSupply && "−"}${fmt(maxUsd)}
          </p>
          <p className="text-[13px] text-muted-foreground/40 font-semibold mt-2 tabular-nums">
            {fmtToken(balance, position.symbol)}
          </p>
        </motion.div>

        {/* ── Earnings card (savings) ── */}
        {isSupply && apy > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.12 }}
            className="rounded-2xl bg-emerald-500/[0.07] border border-emerald-500/20 p-4 mb-4"
          >
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500/50 mb-3">
              Currently earning
            </p>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-[1.8rem] font-black tabular-nums text-emerald-400 leading-none">
                  +${fmt(monthlyInterest)}
                </p>
                <p className="text-[12px] text-emerald-400/60 font-semibold mt-1">per month</p>
              </div>
              <div className="text-right">
                <p className="text-[14px] font-bold tabular-nums text-emerald-400/80">
                  +${fmt(dailyInterest)} / day
                </p>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-emerald-500/[0.12]">
              <p className="text-[12px] text-emerald-400/50 font-semibold">
                On track for{" "}
                <span className="text-emerald-400/80 tabular-nums font-black">+${fmt(yearlyInterest)}</span>
                {" "}this year at {apy.toFixed(1)}%
              </p>
            </div>
          </motion.div>
        )}

        {/* ── Cost card (loan) ── */}
        {!isSupply && apy > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.12 }}
            className="rounded-2xl bg-amber-500/[0.07] border border-amber-500/20 p-4 mb-4"
          >
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-500/50 mb-3">
              Accruing interest
            </p>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-[1.8rem] font-black tabular-nums text-amber-400 leading-none">
                  −${fmt(dailyInterest)}
                </p>
                <p className="text-[12px] text-amber-400/60 font-semibold mt-1">per day</p>
              </div>
              <div className="text-right">
                <p className="text-[14px] font-bold tabular-nums text-amber-400/80">
                  −${fmt(monthlyInterest)} / month
                </p>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-amber-500/[0.12]">
              <p className="text-[12px] text-amber-400/50 font-semibold">
                Costs{" "}
                <span className="text-amber-400/80 tabular-nums font-black">−${fmt(yearlyInterest)}</span>
                {" "}per year at {apy.toFixed(1)}% APR
              </p>
            </div>
          </motion.div>
        )}

        <div className="h-px bg-foreground/[0.07] my-5" />

        {/* ── Actions ── */}
        {isDemoMode ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: 0.18 }}
            className="space-y-3"
          >
            <div className="rounded-2xl bg-foreground/[0.03] border border-foreground/[0.08] p-5 text-center">
              <p className="text-[13px] font-semibold text-muted-foreground/50 leading-relaxed">
                Connect a wallet to {isSupply ? "withdraw or add more" : "repay this loan"}.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDemoMode(false)}
              className="w-full h-14 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-[15px] font-bold shadow-lg shadow-emerald-500/20 transition-all active:scale-[0.98]"
            >
              Sign in to get started
            </button>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="space-y-3"
          >
            {isSupply && (
              <button
                type="button"
                onClick={() => openDeposit({ assetId: position.assetId })}
                className="w-full h-14 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-[15px] font-bold shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add more
              </button>
            )}
            <button
              type="button"
              onClick={() =>
                isSupply
                  ? openWithdraw({ assetId: position.assetId })
                  : openRepay({ assetId: position.assetId })
              }
              className={cn(
                "w-full rounded-2xl text-[15px] font-bold transition-all active:scale-[0.98] flex items-center justify-center",
                isSupply
                  ? "h-12 border border-foreground/[0.10] bg-foreground/[0.02] hover:bg-foreground/[0.05] text-foreground/50"
                  : "h-14 bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-500/20"
              )}
            >
              {isSupply ? "Withdraw" : "Repay loan"}
            </button>
          </motion.div>
        )}

        <div className="h-8" />
      </div>
    </motion.div>
  )
}

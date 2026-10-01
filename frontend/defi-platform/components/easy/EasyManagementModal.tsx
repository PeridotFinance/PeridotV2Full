"use client"

import { useState, useMemo, useEffect, useRef, useCallback } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import {
  ArrowLeft,
  X,
  ChevronRight,
  Loader2,
  TrendingUp,
  Landmark,
  Plus,
} from "lucide-react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { useCrossChainBalances } from "@/hooks/use-cross-chain-balances"
import { useEasyRedeem } from "@/hooks/use-easy-redeem"
import { useEasyRepay } from "@/hooks/use-easy-repay"
import { useStellarRedeemTransaction } from "@/hooks/use-stellar-redeem-transaction"
import { useStellarRepayTransaction } from "@/hooks/use-stellar-repay-transaction"
import { useTxBusyPhase } from "@/hooks/use-tx-busy-phase"
import { useActiveWallet } from "@/hooks/use-active-wallet"
import { ButtonProgress } from "@/components/easy/ButtonProgress"
import { useNetworkContext } from "@/context"
import { CHAIN_IDS, STELLAR_NETWORK_ID } from "@/config/contracts"
import { useAccount, useSwitchChain } from "wagmi"
import {
  getStellarVaultConfig,
  stellarFetchPrice,
  stellarGetBorrowBalance,
  stellarGetExchangeRate,
  stellarGetPtokenBalance,
} from "@/lib/stellar-soroban-lending"
import { getStellarSorobanMarkets } from "@/data/market-data"
import { useLinkedWallets } from "@/hooks/use-linked-wallets"
import { useStellarWallet } from "@/hooks/use-stellar-wallet"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { FEATURE_FLAGS } from "@/config/featureFlags"
import { useMeldOnramp } from "@/hooks/use-meld-onramp"
import { useTheme } from "next-themes"
import { EasyModeTxStatus } from "./EasyModeTxStatus"
import { useApyData } from "@/hooks/use-apy-data"

// ─── Swapper config ───────────────────────────────────────────────────────────

const SWAPPER_CHAIN_CONFIG: Record<number, { dstChainId: string; dstTokenAddr: string }> = {
  1:     { dstChainId: "1",     dstTokenAddr: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" },
  42161: { dstChainId: "42161", dstTokenAddr: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" },
  8453:  { dstChainId: "8453",  dstTokenAddr: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
  10:    { dstChainId: "10",    dstTokenAddr: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85" },
  137:   { dstChainId: "137",   dstTokenAddr: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" },
}
const DEFAULT_SWAPPER_CHAIN = { dstChainId: "8453", dstTokenAddr: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" }

// ─── Animation constants ──────────────────────────────────────────────────────

const SHEET_SPRING = { type: "spring" as const, damping: 34, stiffness: 400 }

const slideVariants = {
  enter: (dir: number) => ({
    x: dir > 0 ? "100%" : "-55%",
    opacity: dir > 0 ? 1 : 0,
  }),
  center: {
    x: 0,
    opacity: 1,
    transition: { type: "spring" as const, damping: 30, stiffness: 320 },
  },
  exit: (dir: number) => ({
    x: dir > 0 ? "-55%" : "100%",
    opacity: 0,
    transition: { duration: 0.22, ease: [0.32, 0, 0.67, 0] as const },
  }),
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtToken(n: number, symbol: string) {
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${symbol}`
}

// ─── Types ────────────────────────────────────────────────────────────────────

type View = "list" | "detail"
type ActionType = "withdraw" | "repay"

interface EasyManagementModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialPositionId?: string
  initialActionType?: ActionType
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SkeletonRows() {
  return (
    <div className="px-5 pt-4 space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-[72px] rounded-2xl bg-foreground/[0.05] animate-pulse" />
      ))}
    </div>
  )
}

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col items-center justify-center py-16 px-6 text-center"
    >
      <div className="w-14 h-14 rounded-full bg-foreground/[0.05] border border-foreground/[0.08] flex items-center justify-center mb-4">
        <Landmark className="w-5 h-5 text-muted-foreground/30" />
      </div>
      <p className="text-sm font-bold text-foreground/50">No open positions</p>
      <p className="text-xs text-muted-foreground/40 mt-1">Add money on the Home tab to start earning.</p>
    </motion.div>
  )
}

interface PositionRowProps {
  pos: {
    assetId: string
    icon?: string
    symbol: string
    chainName?: string
    suppliedBalance: number
    borrowedBalance: number
    suppliedValueUSD: number
    borrowedValueUSD: number
    chainId: number
  }
  type: "supply" | "borrow"
  index: number
  onClick: () => void
}

function PositionRow({ pos, type, index, onClick }: PositionRowProps) {
  const isSupply = type === "supply"
  const valueUsd = isSupply ? pos.suppliedValueUSD : pos.borrowedValueUSD
  const balance  = isSupply ? pos.suppliedBalance  : pos.borrowedBalance

  return (
    <motion.button
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.28, delay: index * 0.05, ease: [0.25, 0.46, 0.45, 0.94] }}
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-4 px-4 py-4 hover:bg-foreground/[0.03] active:bg-foreground/[0.05] transition-colors text-left"
    >
      {/* Asset icon */}
      <div className="w-10 h-10 rounded-full bg-foreground/[0.06] border border-foreground/[0.09] flex items-center justify-center overflow-hidden shrink-0">
        {pos.icon ? (
          <Image src={pos.icon} alt={pos.symbol} width={28} height={28} className="rounded-full" unoptimized />
        ) : (
          <span className="text-sm font-black text-foreground/60">{pos.symbol[0]}</span>
        )}
      </div>

      {/* Name + chain */}
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-bold leading-tight">{pos.symbol}</p>
        {pos.chainName && (
          <p className="text-[11px] text-muted-foreground/50 mt-0.5 truncate">{pos.chainName}</p>
        )}
      </div>

      {/* Value */}
      <div className="text-right shrink-0">
        <p className={cn("text-[15px] font-bold tabular-nums", !isSupply && "text-amber-400")}>
          {!isSupply && "−"}${fmt(valueUsd)}
        </p>
        <p className="text-[11px] text-muted-foreground/40 tabular-nums mt-0.5">
          {fmtToken(balance, pos.symbol)}
        </p>
      </div>

      <ChevronRight className="w-4 h-4 text-muted-foreground/25 shrink-0" />
    </motion.button>
  )
}

interface ListViewProps {
  supplyPositions: PositionRowProps["pos"][]
  borrowPositions: PositionRowProps["pos"][]
  isDataLoading: boolean
  isEmpty: boolean
  onSelectSupply: (id: string) => void
  onSelectBorrow: (id: string) => void
}

function ListView({ supplyPositions, borrowPositions, isDataLoading, isEmpty, onSelectSupply, onSelectBorrow }: ListViewProps) {
  if (isDataLoading) return <SkeletonRows />
  if (isEmpty) return <EmptyState />

  return (
    <div className="px-5 pb-10">
      {/* Savings section */}
      {supplyPositions.length > 0 && (
        <>
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/35 px-1 pt-5 pb-3">
            Savings
          </p>
          <div className="rounded-2xl bg-foreground/[0.03] border border-foreground/[0.07] overflow-hidden divide-y divide-foreground/[0.06]">
            {supplyPositions.map((pos, i) => (
              <PositionRow
                key={`${pos.assetId}-${pos.chainId}`}
                pos={pos}
                type="supply"
                index={i}
                onClick={() => onSelectSupply(`${pos.assetId}-${pos.chainId}`)}
              />
            ))}
          </div>
        </>
      )}

      {/* Loans section */}
      {borrowPositions.length > 0 && (
        <>
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/35 px-1 pt-6 pb-3">
            Loans
          </p>
          <div className="rounded-2xl bg-foreground/[0.03] border border-foreground/[0.07] overflow-hidden divide-y divide-foreground/[0.06]">
            {borrowPositions.map((pos, i) => (
              <PositionRow
                key={`${pos.assetId}-${pos.chainId}`}
                pos={pos}
                type="borrow"
                index={i}
                onClick={() => onSelectBorrow(`${pos.assetId}-${pos.chainId}`)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

interface DetailViewProps {
  position: {
    assetId: string
    icon?: string
    symbol: string
    chainName?: string
    suppliedBalance: number
    borrowedBalance: number
    suppliedValueUSD: number
    borrowedValueUSD: number
    priceUSD?: number
  }
  actionType: ActionType
  usdInput: string
  onUsdInput: (e: React.ChangeEvent<HTMLInputElement>) => void
  onMax: () => void
  apy: number
  isLoading: boolean
  isSwitchingChain: boolean
  /** Live phase label while busy, from useTxBusyPhase in the parent. */
  busyLabel: string
  busyProgress: number | null
  txError: string | null
  onAction: () => void
  onAddMore: () => void
}

function DetailView({
  position,
  actionType,
  usdInput,
  onUsdInput,
  onMax,
  apy,
  isLoading,
  isSwitchingChain,
  busyLabel,
  busyProgress,
  txError,
  onAction,
  onAddMore,
}: DetailViewProps) {
  const [showActionForm, setShowActionForm] = useState(false)

  const isWithdraw = actionType === "withdraw"
  const maxUsd     = isWithdraw ? position.suppliedValueUSD : position.borrowedValueUSD
  const balance    = isWithdraw ? position.suppliedBalance  : position.borrowedBalance
  const usdValue   = parseFloat(usdInput) || 0

  // Earnings / cost derived from APY × balance
  const dailyInterest   = apy > 0 ? maxUsd * (apy / 100) / 365 : 0
  const monthlyInterest = dailyInterest * 30
  const yearlyInterest  = apy > 0 ? maxUsd * (apy / 100) : 0

  // After withdrawal, how much yearly yield remains
  const remainingUsd = Math.max(0, maxUsd - usdValue)
  const yearlyAfter  = apy > 0 && isWithdraw ? remainingUsd * (apy / 100) : null

  // Busy = signing/switching/in-flight. The live, morphing phase label comes
  // from the parent (useTxBusyPhase) so mobile speaks the same language as the
  // desktop sheets — no "Switching network…" jargon leak.
  const busyActive  = isSwitchingChain || isLoading
  const buttonLabel = busyActive
    ? busyLabel
    : isWithdraw ? "Cash out" : "Repay loan"

  const isDisabled = isLoading || !usdInput || usdValue <= 0

  return (
    <div className="px-5 pb-10">

      {/* ── Header: icon + identity (left-aligned) ── */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28 }}
        className="flex items-center gap-4 pt-6 pb-5"
      >
        {/* Asset icon */}
        <div className={cn(
          "w-14 h-14 rounded-full flex items-center justify-center overflow-hidden shrink-0 shadow-lg",
          "bg-foreground/[0.06] border",
          isWithdraw ? "border-emerald-500/20" : "border-amber-500/20"
        )}>
          {position.icon ? (
            <Image src={position.icon} alt={position.symbol} width={40} height={40} className="rounded-full" unoptimized />
          ) : (
            <span className="text-xl font-black text-foreground/60">{position.symbol[0]}</span>
          )}
        </div>

        {/* Identity */}
        <div className="flex-1 min-w-0">
          {/* Name + APY badge */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[20px] font-black leading-tight">{position.symbol}</span>
            {apy > 0 && (
              <span className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-black tracking-wide",
                isWithdraw
                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                  : "bg-amber-500/15 text-amber-400 border border-amber-500/20"
              )}>
                <span className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  isWithdraw ? "bg-emerald-400" : "bg-amber-400"
                )} />
                {apy.toFixed(1)}% {isWithdraw ? "APY" : "APR"}
              </span>
            )}
          </div>

          {/* Type + chain badge */}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className={cn(
              "text-[12px] font-semibold",
              isWithdraw ? "text-muted-foreground/50" : "text-amber-400/60"
            )}>
              {isWithdraw ? "Savings account" : "Active loan"}
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

      {/* ── Balance hero (left-aligned) ── */}
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, delay: 0.05 }}
        className="mb-5"
      >
        <p className={cn(
          "text-[2.8rem] font-black tracking-tighter tabular-nums leading-none",
          !isWithdraw && "text-amber-400"
        )}>
          {!isWithdraw && "−"}${fmt(maxUsd)}
        </p>
        <p className="text-[13px] text-muted-foreground/40 font-semibold mt-1.5 tabular-nums">
          {fmtToken(balance, position.symbol)}
        </p>
      </motion.div>

      {/* ── Earnings card (savings) ── */}
      {isWithdraw && apy > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, delay: 0.1 }}
          className="rounded-2xl bg-emerald-500/[0.07] border border-emerald-500/20 p-4 mb-5"
        >
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500/50 mb-3">
            Currently earning
          </p>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[1.7rem] font-black tabular-nums text-emerald-400 leading-none">
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
              <span className="text-emerald-400/80 tabular-nums font-black">
                +${fmt(yearlyInterest)}
              </span>
              {" "}this year at {apy.toFixed(1)}%
            </p>
          </div>
        </motion.div>
      )}

      {/* ── Cost card (loan) ── */}
      {!isWithdraw && apy > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, delay: 0.1 }}
          className="rounded-2xl bg-amber-500/[0.07] border border-amber-500/20 p-4 mb-5"
        >
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-500/50 mb-3">
            Accruing interest
          </p>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[1.7rem] font-black tabular-nums text-amber-400 leading-none">
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
              <span className="text-amber-400/80 tabular-nums font-black">
                −${fmt(yearlyInterest)}
              </span>
              {" "}per year at {apy.toFixed(1)}% APR
            </p>
          </div>
        </motion.div>
      )}

      <div className="h-px bg-foreground/[0.07] mb-5" />

      {/* ── Actions ── */}
      <AnimatePresence mode="wait">
        {!showActionForm ? (
          <motion.div
            key="action-chooser"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className="space-y-3"
          >
            {/* Savings: Add more = PRIMARY green button */}
            {isWithdraw && (
              <button
                type="button"
                onClick={onAddMore}
                className="w-full h-14 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-[15px] font-bold shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add more
              </button>
            )}

            {/* Cash out (secondary for savings) / Repay (primary for loans) */}
            <button
              type="button"
              onClick={() => setShowActionForm(true)}
              className={cn(
                "w-full py-3.5 rounded-2xl text-[15px] font-bold transition-all active:scale-[0.98] flex items-center justify-center",
                isWithdraw
                  ? "h-12 border border-foreground/[0.10] bg-foreground/[0.02] hover:bg-foreground/[0.05] text-foreground/50"
                  : "h-14 bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-500/20"
              )}
            >
              {isWithdraw ? "Cash out" : "Repay loan"}
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="action-form"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="space-y-3"
          >
            {/* Back to info */}
            <button
              type="button"
              onClick={() => setShowActionForm(false)}
              className="flex items-center gap-1.5 text-[12px] text-muted-foreground/50 hover:text-muted-foreground/80 transition-colors mb-1 -mt-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back
            </button>

            {/* USD input box */}
            <div className="p-4 rounded-3xl bg-foreground/[0.04] border border-foreground/[0.09] focus-within:border-emerald-500/40 transition-all duration-200">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-muted-foreground/80 font-medium">
                  {isWithdraw ? "How much to cash out?" : "How much to repay?"}
                </p>
                <button
                  type="button"
                  onClick={onMax}
                  className="text-[11px] font-black text-emerald-500 hover:text-emerald-400 transition-colors uppercase tracking-wider"
                >
                  Max
                </button>
              </div>

              <div className="flex items-center">
                <span className="text-4xl font-bold text-foreground/25 select-none mr-1">$</span>
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={usdInput}
                  onChange={onUsdInput}
                  className="h-12 text-4xl font-bold bg-transparent border-0 p-0 focus-visible:ring-0 text-foreground placeholder:text-foreground/20 w-full"
                />
              </div>

              {/* Remaining yield preview */}
              <AnimatePresence>
                {usdValue > 0 && yearlyAfter !== null && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="mt-2 pt-2 border-t border-foreground/[0.07] overflow-hidden"
                  >
                    <p className="text-[12px] text-muted-foreground/50 font-semibold">
                      Remaining:{" "}
                      <span className="text-emerald-400/80 tabular-nums">
                        ${fmt(remainingUsd)} · still earning +${fmt(yearlyAfter)} / yr
                      </span>
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Error */}
            <AnimatePresence>
              {txError && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-[11px] text-red-400 text-center px-1"
                >
                  {txError}
                </motion.p>
              )}
            </AnimatePresence>

            {/* CTA */}
            <button
              type="button"
              onClick={onAction}
              disabled={isDisabled}
              className={cn(
                "relative w-full h-14 rounded-2xl text-base font-bold transition-all duration-200",
                "text-white shadow-lg flex items-center justify-center gap-2",
                "active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed",
                isWithdraw
                  ? "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/20 hover:shadow-emerald-500/30"
                  : "bg-amber-600 hover:bg-amber-500 shadow-amber-500/20"
              )}
            >
              {busyActive && <Loader2 className="w-4 h-4 animate-spin" />}
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={buttonLabel}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.18 }}
                >
                  {buttonLabel}
                </motion.span>
              </AnimatePresence>
              {busyActive && <ButtonProgress progress={busyProgress} />}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Main sheet component ─────────────────────────────────────────────────────

export function EasyManagementModal({ open, onOpenChange, initialPositionId, initialActionType }: EasyManagementModalProps) {
  const queryClient = useQueryClient()
  const router = useRouter()

  // ── Data hooks ───────────────────────────────────────────────────────────
  const { allPositions, isLoading: isBalancesLoading } = useCrossChainBalances({})
  const { liveApyData } = useApyData()
  const { selectedNetworkId } = useNetworkContext()
  const { groupedLinks } = useLinkedWallets()
  const stellarWallet = useStellarWallet()
  const { address: walletAddress, chainId: walletChainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const { resolvedTheme, theme } = useTheme()

  // ── Card top-up (Meld, legacy Swapper fallback) ──────────────────────────
  const meld = useMeldOnramp()
  const onMeldFunded = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["multi-chain-token-balances"] })
    toast.success("Payment confirmed — your money is on the way.")
  }, [queryClient])

  const openSwapperFunding = useCallback(() => {
    // Meld-first: generic top-up → BSC hub stable (USDC).
    if (FEATURE_FLAGS.FIAT_ONRAMP_MELD && meld.available) {
      void meld.fundWithMeld().then((o) => {
        if (o.status === "confirmed") onMeldFunded()
        else if (o.status === "error") toast.error("Card checkout could not be opened.")
      })
      return
    }
    if (!walletAddress) {
      toast.error("No wallet connected")
      return
    }
    let openSwapperModal: ((cfg: any) => void) | undefined
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const sdk = require("@swapper-finance/deposit-sdk")
      openSwapperModal = sdk.openSwapperModal ?? sdk.default?.openSwapperModal
    } catch {
      openSwapperModal = undefined
    }
    if (!openSwapperModal) {
      toast.error("Card checkout not available")
      return
    }
    const isDark = (resolvedTheme || theme || "dark") === "dark"
    const cfg = SWAPPER_CHAIN_CONFIG[walletChainId ?? 0] ?? DEFAULT_SWAPPER_CHAIN
    try {
      openSwapperModal({
        integratorId:         "e516043de472acd314ad",
        dstChainId:           cfg.dstChainId,
        dstTokenAddr:         cfg.dstTokenAddr,
        depositWalletAddress: walletAddress as string,
        styles: {
          themeMode: isDark ? "dark" : "light",
          componentStyles: {
            primaryColor:       "#62c15e",
            primaryBorderColor: "#328a2f",
            primaryTextColor:   "#ffffff",
            accentColor:        "#62c15e",
          },
        },
      })
    } catch {
      toast.error("Failed to open card checkout")
    }
  }, [walletAddress, walletChainId, resolvedTheme, theme, meld, onMeldFunded])

  // ── Navigation state ─────────────────────────────────────────────────────
  const [view, setView] = useState<View>("list")
  const [direction, setDirection] = useState(1)
  const [selectedPosId, setSelectedPosId] = useState<string | null>(null)
  const [actionType, setActionType] = useState<ActionType>("withdraw")

  // ── Input ────────────────────────────────────────────────────────────────
  const [usdInput, setUsdInput] = useState("")
  const [isSwitchingChain, setIsSwitchingChain] = useState(false)

  // When sheet opens: jump directly to detail if a position was pre-selected
  useEffect(() => {
    if (open) {
      setDirection(1)
      setUsdInput("")
      if (initialPositionId) {
        setSelectedPosId(initialPositionId)
        setActionType(initialActionType ?? "withdraw")
        setView("detail")
      } else {
        setView("list")
        setSelectedPosId(null)
      }
    }
  }, [open])

  // ── Stellar ───────────────────────────────────────────────────────────────
  const selectedStellarWalletAddress = useMemo(() => {
    const verified = groupedLinks.stellar.find((link) => link.verificationStatus === "verified")
    return verified?.normalizedAddress || groupedLinks.stellar[0]?.normalizedAddress || stellarWallet.address || null
  }, [groupedLinks.stellar, stellarWallet.address])

  const { data: stellarPositions = [], isLoading: isStellarPositionsLoading } = useQuery({
    queryKey: ["easy-stellar-positions", selectedStellarWalletAddress],
    enabled: Boolean(selectedStellarWalletAddress),
    staleTime: 30_000,
    refetchInterval: 30_000,
    queryFn: async () => {
      if (!selectedStellarWalletAddress) return []
      const stellarMarkets = getStellarSorobanMarkets()

      const rows = await Promise.all(
        stellarMarkets.map(async (asset) => {
          const cfg = getStellarVaultConfig(asset.id)
          if (!cfg) return null

          const [ptokenRawStr, borrowRawStr, exchangeRateRawStr, price] = await Promise.all([
            stellarGetPtokenBalance(cfg.vaultId, selectedStellarWalletAddress),
            stellarGetBorrowBalance(cfg.vaultId, selectedStellarWalletAddress),
            stellarGetExchangeRate(cfg.vaultId),
            stellarFetchPrice(asset.id),
          ])

          const toBigIntSafe = (v: string) => {
            try { return BigInt(v) } catch { return BigInt(0) }
          }

          const ptokenRaw       = toBigIntSafe(ptokenRawStr)
          const borrowRaw       = toBigIntSafe(borrowRawStr)
          const exchangeRateRaw = toBigIntSafe(exchangeRateRawStr)
          const underlyingScale = BigInt(10) ** BigInt(cfg.decimals)
          const exchangeScale   = BigInt(1_000_000)

          // Vault stores ptoken_raw and underlying_raw raw-to-raw (verified
          // empirically across all three mainnet vaults). decimals() metadata
          // does not enter the conversion: underlying_raw = ptoken_raw × rate / 1e6.
          const suppliedUnderlyingRaw =
            ptokenRaw > 0n && exchangeRateRaw > 0n
              ? (ptokenRaw * exchangeRateRaw) / exchangeScale
              : 0n

          const suppliedBalance = Number(suppliedUnderlyingRaw) / Number(underlyingScale)
          const borrowedBalance = Number(borrowRaw) / Number(underlyingScale)
          const priceUSD = Number.isFinite(price ?? NaN) ? Number(price) : 0

          if (suppliedBalance <= 0 && borrowedBalance <= 0) return null

          return {
            assetId: asset.id,
            icon: asset.icon || "",
            symbol: asset.symbol,
            chainId: CHAIN_IDS.STELLAR_MAINNET,
            chainName: "Stellar Soroban",
            suppliedBalance,
            borrowedBalance,
            suppliedValueUSD: suppliedBalance * priceUSD,
            borrowedValueUSD: borrowedBalance * priceUSD,
            priceUSD,
            decimals: cfg.decimals,
            pTokenAddress: cfg.vaultId,
            marketData: asset,
          }
        })
      )

      return rows.filter((row): row is NonNullable<typeof row> => Boolean(row))
    },
  })

  useEffect(() => {
    const onTxSuccess = () => {
      try { queryClient.invalidateQueries({ queryKey: ["easy-stellar-positions"] }) } catch {}
    }
    window.addEventListener("peridot:tx-success" as any, onTxSuccess)
    return () => window.removeEventListener("peridot:tx-success" as any, onTxSuccess)
  }, [queryClient])

  // ── Positions ─────────────────────────────────────────────────────────────
  const combinedPositions = useMemo(
    () => [...allPositions, ...stellarPositions],
    [allPositions, stellarPositions]
  )

  const supplyPositions = useMemo(
    () => combinedPositions.filter((p) => p.suppliedBalance > 0),
    [combinedPositions]
  )

  const borrowPositions = useMemo(
    () => combinedPositions.filter((p) => p.borrowedBalance > 0),
    [combinedPositions]
  )

  const selectedPosition = useMemo(
    () => combinedPositions.find((p) => `${p.assetId}-${p.chainId}` === selectedPosId),
    [combinedPositions, selectedPosId]
  )

  const totalSavingsUsd = useMemo(
    () => supplyPositions.reduce((s, p) => s + p.suppliedValueUSD, 0),
    [supplyPositions]
  )

  // ── USD → token conversion ─────────────────────────────────────────────────
  const tokenAmount = useMemo(() => {
    const usd = parseFloat(usdInput)
    if (!usd || usd <= 0 || !selectedPosition) return ""
    const price = (selectedPosition as any).priceUSD ?? 1
    if (price <= 0) return ""
    return (usd / price).toFixed(8).replace(/\.?0+$/, "")
  }, [usdInput, selectedPosition])

  // ── TX hooks ──────────────────────────────────────────────────────────────
  const evmPositionChainId = useMemo(() => {
    if (!selectedPosition) return undefined
    const isStellar =
      selectedPosition.chainId === CHAIN_IDS.STELLAR_MAINNET ||
      selectedPosition.chainId === CHAIN_IDS.STELLAR_MAINNET
    return isStellar ? undefined : selectedPosition.chainId
  }, [selectedPosition])

  const onTxSuccess = () => {
    setUsdInput("")
    goBack()
  }

  const withdrawTx = useEasyRedeem({
    assetId: selectedPosition?.assetId || "",
    amount: tokenAmount,
    overrideChainId: evmPositionChainId,
    onSuccess: onTxSuccess,
  })

  const repayTx = useEasyRepay({
    assetId: selectedPosition?.assetId || "",
    amount: tokenAmount,
    overrideChainId: evmPositionChainId,
    onSuccess: onTxSuccess,
  })

  const stellarAssetId = useMemo(() => {
    const id = selectedPosition?.assetId
    if (!id) return null
    if (getStellarVaultConfig(id)) return id
    if (id === "usdc" || id === "usdt") return "usdc-stellar"
    if (id === "eurc") return "eurc-stellar"
    if (id === "xlm") return "xlm-stellar"
    return null
  }, [selectedPosition?.assetId])

  const isStellarPosition = selectedPosition?.chainId === CHAIN_IDS.STELLAR_MAINNET
  const isStellarTxPath = Boolean(isStellarPosition && selectedNetworkId === STELLAR_NETWORK_ID)

  // Treat a withdraw that covers (effectively) the entire supplied balance as a FULL
  // withdraw, so the Stellar path redeems the exact pToken balance instead of an
  // underlying-denominated amount. The underlying→pToken conversion rounds down and
  // always leaves pToken "dust" — which blocks exiting the market and keeps it in the
  // borrow liquidity loop. The 0.999 threshold absorbs USD→token float rounding from Max.
  const isFullStellarWithdraw = useMemo(() => {
    if (!isStellarTxPath || actionType !== "withdraw" || !selectedPosition) return false
    const supplied = Number((selectedPosition as any).suppliedBalance ?? 0)
    if (supplied <= 0) return false
    // Sub-cent "dust" can't be partially withdrawn meaningfully and must be fully cleared
    // to free the market (drop it from the borrow liquidity loop) — always treat as full.
    const suppliedUsd = Number((selectedPosition as any).suppliedValueUSD ?? 0)
    if (suppliedUsd > 0 && suppliedUsd < 0.01) return true
    const requested = parseFloat(tokenAmount)
    if (!Number.isFinite(requested) || requested <= 0) return false
    // 1% tolerance absorbs USD→token rounding from the Max button (toFixed(2)/toPrecision(3)).
    return requested >= supplied * 0.99
  }, [isStellarTxPath, actionType, selectedPosition, tokenAmount])

  const stellarWithdrawTx = useStellarRedeemTransaction({
    assetId: stellarAssetId || "",
    amount: tokenAmount,
    fullWithdraw: isFullStellarWithdraw,
    onSuccess: onTxSuccess,
  })

  const stellarRepayTx = useStellarRepayTransaction({
    assetId: stellarAssetId || "",
    amount: tokenAmount,
    onSuccess: onTxSuccess,
  })

  const withdrawExecuteRef = useRef(withdrawTx.executeRedeem)
  const repayExecuteRef    = useRef(repayTx.executeRepay)
  useEffect(() => { withdrawExecuteRef.current = withdrawTx.executeRedeem })
  useEffect(() => { repayExecuteRef.current = repayTx.executeRepay })

  const [pendingAction, setPendingAction] = useState<ActionType | null>(null)

  useEffect(() => {
    if (!pendingAction || !evmPositionChainId || walletChainId !== evmPositionChainId) return
    const action = pendingAction
    setPendingAction(null)
    setIsSwitchingChain(false)
    if (action === "withdraw") {
      withdrawExecuteRef.current()
    } else {
      repayExecuteRef.current()
    }
  }, [walletChainId, evmPositionChainId, pendingAction])

  const handleAction = async () => {
    if (!selectedPosition || !tokenAmount || parseFloat(tokenAmount) <= 0) return

    if (isStellarPosition && !isStellarTxPath) {
      toast.error("Switch to Stellar network to manage Stellar positions.")
      return
    }

    if (!isStellarPosition && evmPositionChainId && walletChainId !== evmPositionChainId) {
      try {
        setIsSwitchingChain(true)
        setPendingAction(actionType)
        await switchChainAsync({ chainId: evmPositionChainId })
      } catch {
        setPendingAction(null)
        setIsSwitchingChain(false)
        toast.error(`Please switch to ${selectedPosition.chainName} to manage this position.`)
      }
      return
    }

    if (actionType === "withdraw") {
      if (isStellarTxPath) {
        await stellarWithdrawTx.executeRedeem()
      } else {
        await withdrawTx.executeRedeem()
      }
    } else {
      if (isStellarTxPath) {
        await stellarRepayTx.executeRepay()
      } else {
        await repayTx.executeRepay()
      }
    }
  }

  const isLoading =
    isSwitchingChain ||
    (actionType === "withdraw"
      ? isStellarTxPath ? stellarWithdrawTx.isLoading : withdrawTx.isLoading
      : isStellarTxPath ? stellarRepayTx.isLoading   : repayTx.isLoading)

  // Live, morphing busy label — same phase machine as the desktop sheets.
  const { isEmbeddedWallet } = useActiveWallet()
  const activeTx = actionType === "withdraw"
    ? (isStellarTxPath ? stellarWithdrawTx : withdrawTx)
    : (isStellarTxPath ? stellarRepayTx : repayTx)
  const busyPhase = useTxBusyPhase({
    active: isLoading,
    action: actionType === "withdraw" ? "withdraw" : "repay",
    step: activeTx.step,
    statusMessage: activeTx.statusMessage,
    isEmbedded: !isStellarTxPath && isEmbeddedWallet,
  })

  const txError =
    actionType === "withdraw"
      ? isStellarTxPath ? stellarWithdrawTx.error : withdrawTx.error
      : isStellarTxPath ? stellarRepayTx.error    : repayTx.error

  const isDataLoading = isBalancesLoading || isStellarPositionsLoading
  const isEmpty       = !isDataLoading && supplyPositions.length === 0 && borrowPositions.length === 0

  // ── APY for selected position ──────────────────────────────────────────────
  const selectedPositionApy = useMemo(() => {
    if (!selectedPosition) return 0
    return liveApyData[selectedPosition.chainId]?.[selectedPosition.assetId]?.supplyApy ?? 0
  }, [selectedPosition, liveApyData])

  // ── Navigation ─────────────────────────────────────────────────────────────
  const openDetail = (posId: string, type: ActionType) => {
    setSelectedPosId(posId)
    setActionType(type)
    setUsdInput("")
    setDirection(1)
    setView("detail")
  }

  const goBack = () => {
    setDirection(-1)
    setView("list")
    setUsdInput("")
    setTimeout(() => setSelectedPosId(null), 350)
  }

  // ── USD input handler ──────────────────────────────────────────────────────
  const handleUsdInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const withPeriod = e.target.value.replace(/,/g, ".")
    const clean      = withPeriod.replace(/[^0-9.]/g, "")
    const firstDot   = clean.indexOf(".")
    const normalized =
      firstDot === -1
        ? clean
        : clean.slice(0, firstDot + 1) + clean.slice(firstDot + 1).replace(/\./g, "")
    setUsdInput(normalized)
  }

  // ── Portal mount guard (SSR safe) ─────────────────────────────────────────
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  // ── Render ─────────────────────────────────────────────────────────────────
  if (!mounted) return null
  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="pos-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm"
            onClick={() => onOpenChange(false)}
          />

          {/* Sheet */}
          <motion.div
            key="pos-sheet"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={SHEET_SPRING}
            className="fixed bottom-0 left-0 right-0 z-[61] bg-background rounded-t-[2rem] max-h-[88dvh] flex flex-col overflow-hidden shadow-2xl"
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 shrink-0">
              <div className="w-10 h-1 rounded-full bg-foreground/15" />
            </div>

            {/* Header */}
            <div className="flex items-center gap-2 px-5 pt-4 pb-3 shrink-0">
              {/* Back button — only in detail view */}
              <AnimatePresence mode="wait" initial={false}>
                {view === "detail" && (
                  <motion.button
                    key="back-btn"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.18 }}
                    type="button"
                    onClick={goBack}
                    className="w-8 h-8 rounded-full bg-foreground/[0.06] flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors shrink-0"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </motion.button>
                )}
              </AnimatePresence>

              {/* Title — cross-fades between list and detail */}
              <div className="flex-1 min-w-0">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={view === "list" ? "list-title" : `detail-title-${selectedPosId}`}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.16 }}
                  >
                    <h2 className="text-[18px] font-black tracking-tight truncate">
                      {view === "list" ? "Your savings" : (selectedPosition?.symbol ?? "Position")}
                    </h2>
                    {view === "list" && !isDataLoading && totalSavingsUsd > 0 && (
                      <p className="text-[12px] text-muted-foreground/50 font-semibold mt-0.5 tabular-nums">
                        ${fmt(totalSavingsUsd)} total
                      </p>
                    )}
                    {view === "detail" && selectedPosition?.chainName && (
                      <p className="text-[12px] text-muted-foreground/50 font-semibold mt-0.5 truncate">
                        {selectedPosition.chainName}
                      </p>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Close */}
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="w-8 h-8 rounded-full bg-foreground/[0.06] flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Sliding content */}
            <div className="flex-1 overflow-hidden relative">
              <AnimatePresence initial={false} custom={direction} mode="popLayout">
                {view === "list" ? (
                  <motion.div
                    key="list-view"
                    custom={direction}
                    variants={slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    className="absolute inset-0 overflow-y-auto"
                  >
                    <ListView
                      supplyPositions={supplyPositions}
                      borrowPositions={borrowPositions}
                      isDataLoading={isDataLoading}
                      isEmpty={isEmpty}
                      onSelectSupply={(id) => openDetail(id, "withdraw")}
                      onSelectBorrow={(id) => openDetail(id, "repay")}
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    key={`detail-view-${selectedPosId}`}
                    custom={direction}
                    variants={slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    className="absolute inset-0 overflow-y-auto"
                  >
                    {selectedPosition && (
                      <DetailView
                        position={selectedPosition as any}
                        actionType={actionType}
                        usdInput={usdInput}
                        onUsdInput={handleUsdInput}
                        onMax={() => {
                          const maxUsd = actionType === "withdraw"
                            ? selectedPosition.suppliedValueUSD
                            : selectedPosition.borrowedValueUSD
                          // Sub-cent "dust" positions must not round to "0.00" — that would
                          // zero the amount and make the position un-withdrawable, leaving the
                          // market funded (blocks exit + keeps it in the borrow liquidity loop).
                          // Keep enough precision so the resulting token amount stays > 0.
                          setUsdInput(maxUsd >= 0.01 ? maxUsd.toFixed(2) : maxUsd.toPrecision(3))
                        }}
                        apy={selectedPositionApy}
                        isLoading={isLoading}
                        isSwitchingChain={isSwitchingChain}
                        busyLabel={busyPhase.label}
                        busyProgress={busyPhase.progress}
                        txError={txError}
                        onAction={handleAction}
                        onAddMore={() => {
                          onOpenChange(false)
                          router.push("/app/easy")
                        }}
                      />
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* TX status strip */}
            <div className="shrink-0 border-t border-foreground/[0.06]">
              <EasyModeTxStatus consumerMode onAddFunds={openSwapperFunding} />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}

// FILE: components/steallar/BorrowSection.tsx
"use client"

import { useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ShieldCheck, AlertTriangle, PiggyBank } from "lucide-react"
import Image from "next/image"
import { useQuery } from "@tanstack/react-query"
import { useCrossChainBalances } from "@/hooks/use-cross-chain-balances"
import { useApyData } from "@/hooks/use-apy-data"
import { useStellarWallet } from "@/hooks/use-stellar-wallet"
import { CHAIN_IDS } from "@/config/contracts"
import {
  getStellarVaultConfig,
  stellarFetchPrice,
  stellarPreviewBorrowMax,
} from "@/lib/stellar-soroban-lending"
import { useDemoMode } from "@/context/demo-mode"
import { useStellarSheets } from "@/context/stellar-sheets"
import { DEMO_POSITIONS } from "@/data/demo-mock"
import { cn } from "@/lib/utils"
import { InfoTooltip } from "@/components/ui/info-tooltip"
import { StellarBorrowSlotsNotice } from "@/components/steallar/StellarBorrowSlotsNotice"

// Plain-English copy for crypto-distant users.
const BORROW_CAPACITY_TOOLTIP =
  "How much you can borrow based on what you've deposited. Your deposits act as a security backing for your loans."
const APR_TOOLTIP =
  "Yearly cost of this loan. 6% APR on $100 borrowed = about $6 in costs per year."
const HIGH_RISK_TOOLTIP =
  "Your loans are close to your borrow limit. If asset prices move against you, part of your deposit could be sold off to repay the loan. Repay or deposit more to lower the risk."

// ─── Types ────────────────────────────────────────────────────────────────────

interface BorrowPosition {
  assetId: string
  symbol: string
  icon: string
  borrowedBalance: number
  borrowedValueUSD: number
  apy: number
}

interface BorrowData {
  totalCollateral: number
  borrowLimit: number
  /** Sum of all open loans in USD. Derived from the same positions the UI
   *  lists, so the bar, the stats strip and the rows can never disagree. */
  totalBorrowed: number
  /** What's still borrowable right now: limit − open loans, floored at 0. */
  available: number
  borrowLimitUsed: number
  activeBorrows: BorrowPosition[]
}

interface BorrowSectionProps {
  isConnected: boolean
  className?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatValue(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`
  if (v >= 1_000)
    return `$${v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
  return `$${v.toFixed(2)}`
}

function formatAmt(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(2)}K`
  return v.toFixed(4)
}

// ─── On-chain capacity (Stellar) ──────────────────────────────────────────────
// The LTV arithmetic below (collateral × maxLTV) is only an estimate; the
// Soroban controller applies its own pre-checks on top, so `preview_borrow_max`
// is what the borrow transaction will actually accept. Reading it here keeps
// the headline "available" in sync with the number the borrow sheet shows —
// they used to disagree because only the sheet asked the contract.
//
// React Query dedupes the RPC round-trip across the three components that call
// `useBorrowData` on the same page.

const USD_VAULT_ASSET_ID = "usdc-stellar"

function useStellarBorrowCapacityUSD(enabled: boolean): number | null {
  const stellarWallet = useStellarWallet()
  const address = stellarWallet.address || null
  const vaultConfig = useMemo(() => getStellarVaultConfig(USD_VAULT_ASSET_ID), [])

  const { data } = useQuery({
    queryKey: ["stellar-borrow-capacity-usd", address, vaultConfig?.vaultId],
    enabled: enabled && !!address && !!vaultConfig,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const [rawUnits, price] = await Promise.all([
        stellarPreviewBorrowMax(address!, vaultConfig!.vaultId),
        stellarFetchPrice(USD_VAULT_ASSET_ID),
      ])
      // null = the controller could not answer (its liquidity loop runs out of
      // compute budget past two entered markets). Report that as unknown so the
      // caller falls back to the LTV estimate; reporting it as 0 is what made
      // the page tell a user with $600 of collateral they could borrow nothing.
      if (rawUnits === null) return null
      const tokens = Number(BigInt(rawUnits || "0")) / Math.pow(10, vaultConfig!.decimals)
      if (!Number.isFinite(tokens)) return null
      // A missing oracle price shouldn't zero the headline; USDC ≈ $1 is a
      // safe stand-in for the one vault this reads.
      return tokens * (price ?? 1)
    },
  })

  return typeof data === "number" ? data : null
}

// ─── Borrow data hook ─────────────────────────────────────────────────────────
// Exported so the standalone `/app/borrow` page (BorrowView) can render its
// hero numbers from the exact same aggregation this section uses.

export function useBorrowData(isConnected: boolean): BorrowData {
  const { isDemoMode } = useDemoMode()
  const crossChain = useCrossChainBalances()
  const { liveApyData } = useApyData()
  const stellarCapacityUSD = useStellarBorrowCapacityUSD(
    !isDemoMode && isConnected
  )

  return useMemo(() => {
    if (isDemoMode || !isConnected) {
      const totalCollateral = DEMO_POSITIONS.reduce(
        (s, p) => s + p.suppliedValueUSD,
        0
      )
      const borrowLimit = totalCollateral * 0.8
      return {
        totalCollateral,
        borrowLimit,
        totalBorrowed: 0,
        available: borrowLimit,
        borrowLimitUsed: 0,
        activeBorrows: [],
      }
    }

    const totalCollateral = crossChain.totalSupplied
    const borrowLimit = crossChain.borrowLimit

    // Aggregate cross-chain borrows by assetId so e.g. USDC borrowed on both
    // BSC and Polygon shows as a single "USDC" row with the combined balance —
    // this matches the consumer-friendly framing (one card per asset, chain
    // mechanics hidden) and prevents duplicate React keys downstream.
    // The borrow APR is value-weighted across the merged chains, so a row that
    // combines a 4% and an 8% market reports what the user actually pays.
    const borrowsByAsset = new Map<string, BorrowPosition & { aprWeightUSD: number }>()
    for (const p of crossChain.allPositions) {
      if (p.borrowedBalance <= 0) continue
      const borrowApy =
        (liveApyData as any)?.[p.chainId]?.[p.assetId]?.borrowApy ?? 0
      const prev = borrowsByAsset.get(p.assetId)
      if (prev) {
        prev.borrowedBalance += p.borrowedBalance
        prev.borrowedValueUSD += p.borrowedValueUSD
        prev.aprWeightUSD += borrowApy * p.borrowedValueUSD
      } else {
        borrowsByAsset.set(p.assetId, {
          assetId: p.assetId,
          symbol: p.symbol,
          icon: p.icon,
          borrowedBalance: p.borrowedBalance,
          borrowedValueUSD: p.borrowedValueUSD,
          apy: 0,
          aprWeightUSD: borrowApy * p.borrowedValueUSD,
        })
      }
    }

    const activeBorrows: BorrowPosition[] = Array.from(
      borrowsByAsset.values()
    ).map(({ aprWeightUSD, ...b }) => ({
      ...b,
      apy: b.borrowedValueUSD > 0 ? aprWeightUSD / b.borrowedValueUSD : 0,
    }))

    // Derive the total from the very rows we render rather than from the
    // portfolio endpoint: the two refresh on different clocks, and mixing them
    // made the capacity bar fill to a percentage the "$X used of $Y" line
    // underneath it contradicted.
    const totalBorrowed = activeBorrows.reduce(
      (s, b) => s + b.borrowedValueUSD,
      0
    )
    const borrowLimitUsed =
      borrowLimit > 0 ? (totalBorrowed / borrowLimit) * 100 : 0

    // `preview_borrow_max` already nets out open loans, so it replaces the
    // subtraction rather than adding to it. Only trust it when every bit of
    // collateral is on Stellar — on the multi-chain surface it knows nothing
    // about the EVM pools and would understate the true capacity.
    const collateralPositions = crossChain.allPositions.filter(
      (p) => p.suppliedValueUSD > 0
    )
    const isStellarOnlyCollateral =
      collateralPositions.length > 0 &&
      collateralPositions.every((p) => p.chainId === CHAIN_IDS.STELLAR_MAINNET)

    const available =
      isStellarOnlyCollateral && stellarCapacityUSD !== null
        ? stellarCapacityUSD
        : Math.max(borrowLimit - totalBorrowed, 0)

    return {
      totalCollateral,
      borrowLimit,
      totalBorrowed,
      available,
      borrowLimitUsed,
      activeBorrows,
    }
  }, [isDemoMode, isConnected, crossChain, liveApyData, stellarCapacityUSD])
}

// ─── Capacity bar ─────────────────────────────────────────────────────────────

function CapacityBar({
  borrowLimit,
  borrowLimitUsed,
  totalBorrowed,
}: {
  borrowLimit: number
  borrowLimitUsed: number
  totalBorrowed: number
}) {
  const pct = Math.min(borrowLimitUsed, 100)
  const isHighRisk = pct > 80
  const fillColor = isHighRisk ? "bg-rose-500" : "bg-emerald-500"

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-1.5">
        <InfoTooltip
          title="Borrow capacity"
          content={BORROW_CAPACITY_TOOLTIP}
          className="text-xs font-medium text-muted-foreground border-b border-dotted border-border/60 leading-tight"
        >
          Borrow capacity
        </InfoTooltip>
        {isHighRisk && (
          <InfoTooltip
            title="High risk"
            content={HIGH_RISK_TOOLTIP}
            className="flex items-center gap-1 text-rose-500"
          >
            <AlertTriangle size={12} />
            <span className="text-xs font-medium border-b border-dotted border-rose-400/60 leading-tight">
              High risk
            </span>
          </InfoTooltip>
        )}
      </div>

      <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className={cn("h-full rounded-full", fillColor)}
        />
      </div>

      <p className="text-xs text-muted-foreground/80 mt-1.5">
        {formatValue(totalBorrowed)} used of{" "}
        <span className="font-medium text-foreground/70">{formatValue(borrowLimit)}</span> limit
      </p>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BorrowSection({ isConnected, className }: BorrowSectionProps) {
  const { borrowLimit, totalBorrowed, available, borrowLimitUsed, activeBorrows } =
    useBorrowData(isConnected)
  const stellarAddress = useStellarWallet().address || null

  const { openBorrow, openRepay, openDeposit } = useStellarSheets()

  // With no collateral the borrow sheet can only dead-end in "No borrow
  // capacity" — steer the user to the deposit flow instead. Demo mode and
  // logged-out visitors never hit this branch (useBorrowData returns the
  // demo collateral for both).
  const needsDepositFirst = borrowLimit < 0.01

  function openBorrowSheet() {
    // This card lives inside the Stellar easy-mode shell, so the natural
    // default is the Stellar USDC market. Without an explicit assetId the
    // sheet's outer would fall back to the EVM "usdc" entry and route to
    // the EVM borrow flow.
    openBorrow({ assetId: "usdc-stellar" })
  }

  function openRepaySheet(assetId: string) {
    openRepay({ assetId })
  }

  // Below a cent there's nothing meaningful left to draw against — show the
  // "repay to free up room" state instead of a button that dead-ends in the
  // sheet's "No borrow capacity".
  const hasRoomLeft = available >= 0.01

  return (
    <motion.section
      data-testid="borrow-section"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className={cn("flex flex-col", className)}
    >
      {/* Header */}
      <p className="text-sm font-semibold text-foreground/90 mb-2">Borrowing</p>

      {/* Capacity bar */}
      <CapacityBar
        borrowLimit={borrowLimit}
        borrowLimitUsed={borrowLimitUsed}
        totalBorrowed={totalBorrowed}
      />

      {/* The one condition that makes every borrow number above unreliable.
          Self-hides unless this account is actually over the market limit. */}
      <StellarBorrowSlotsNotice address={stellarAddress} className="mt-3" />

      {/* Content */}
      <AnimatePresence mode="wait">
        {activeBorrows.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="mt-8 flex flex-col items-center text-center gap-3"
          >
            {needsDepositFirst ? (
              <>
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
                  <PiggyBank className="text-emerald-500" size={24} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground/90">
                    Deposit first to unlock borrowing
                  </p>
                  <p className="text-xs text-muted-foreground/80 mt-0.5 max-w-[280px]">
                    Your deposits back your loans — and keep earning the whole
                    time.
                  </p>
                </div>
                <button
                  data-testid="borrow-section-deposit-first"
                  onClick={() => openDeposit({ assetId: "usd" })}
                  className="mt-1 h-10 px-6 rounded-full bg-foreground text-background text-sm font-semibold hover:bg-foreground/90 active:scale-95 transition-all"
                >
                  Make a deposit
                </button>
              </>
            ) : (
              <>
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
                  <ShieldCheck className="text-emerald-500" size={24} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground/90">No active loans</p>
                  <p className="text-xs text-muted-foreground/80 mt-0.5">
                    You can borrow up to{" "}
                    <span className="font-medium text-foreground/70">
                      {formatValue(available)}
                    </span>
                  </p>
                </div>
                <button
                  data-testid="borrow-section-start"
                  onClick={openBorrowSheet}
                  className="mt-1 h-10 px-6 rounded-full bg-foreground text-background text-sm font-semibold hover:bg-foreground/90 active:scale-95 transition-all"
                >
                  Start Borrowing
                </button>
              </>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="positions"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="mt-5 flex flex-col gap-0"
          >
            {activeBorrows.map((b, i) => (
              <motion.div
                key={b.assetId}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.22 }}
                className="flex items-center gap-3 py-3.5 border-b border-foreground/[0.04] last:border-0"
              >
                {/* Icon */}
                <div className="relative w-8 h-8 shrink-0">
                  <Image
                    src={b.icon}
                    alt={b.symbol}
                    fill
                    className="rounded-full object-cover"
                    onError={(e) => {
                      ;(e.currentTarget as HTMLImageElement).src =
                        "/tokenimages/app/placeholder.svg"
                    }}
                  />
                </div>

                {/* Name + APR */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground/90 truncate">
                    {b.symbol}
                  </p>
                  {b.apy > 0 && (
                    <InfoTooltip
                      title="APR"
                      content={APR_TOOLTIP}
                      className="text-xs text-rose-500 font-medium border-b border-dotted border-rose-400/50 leading-tight"
                    >
                      {b.apy.toFixed(1)}% APR
                    </InfoTooltip>
                  )}
                </div>

                {/* Amount */}
                <div className="flex flex-col items-end gap-0.5">
                  <span className="text-sm font-semibold text-foreground tabular-nums">
                    {formatAmt(b.borrowedBalance)} {b.symbol}
                  </span>
                  <span className="text-xs text-muted-foreground/80 tabular-nums">
                    {formatValue(b.borrowedValueUSD)}
                  </span>
                </div>

                {/* Repay button */}
                <button
                  onClick={() => openRepaySheet(b.assetId)}
                  className="h-9 px-4 rounded-full bg-foreground text-background text-xs font-semibold hover:bg-foreground/90 active:scale-95 transition-all shrink-0"
                >
                  Repay
                </button>
              </motion.div>
            ))}

            {/* Having a loan open must not lock the user out of borrowing more
                — as long as capacity is left, offer it right here instead of
                forcing a full repayment first. */}
            <div className="mt-5 flex flex-col items-center gap-1.5">
              <button
                data-testid="borrow-section-borrow-more"
                onClick={openBorrowSheet}
                disabled={!hasRoomLeft}
                className={cn(
                  "h-10 px-6 rounded-full text-sm font-semibold transition-all",
                  hasRoomLeft
                    ? "bg-foreground text-background hover:bg-foreground/90 active:scale-95"
                    : "bg-muted text-muted-foreground/70 cursor-not-allowed"
                )}
              >
                Borrow more
              </button>
              <p className="text-xs text-muted-foreground/80">
                {hasRoomLeft ? (
                  <>
                    <span className="font-medium text-foreground/70">
                      {formatValue(available)}
                    </span>{" "}
                    still available
                  </>
                ) : (
                  "Repay part of your loan to free up room"
                )}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  )
}

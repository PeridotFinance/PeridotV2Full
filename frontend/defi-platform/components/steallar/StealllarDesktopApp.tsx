"use client"

import { useMemo } from "react"
import { motion } from "framer-motion"
import { usePortfolioEarnings } from "@/hooks/use-portfolio-earnings"
import { useCrossChainBalances } from "@/hooks/use-cross-chain-balances"
import { useApyData } from "@/hooks/use-apy-data"
import { useStealllarAuthState } from "@/hooks/use-steallar-auth-state"
import { useMeldReconcileOnLoad } from "@/hooks/use-meld-reconcile-on-load"
import { PortfolioHero } from "@/components/steallar/PortfolioHero"
import { AssetTable } from "@/components/steallar/AssetTable"
import { BorrowSection } from "@/components/steallar/BorrowSection"
import { TransactionStrip } from "@/components/steallar/TransactionStrip"
import { DEMO_TOTAL_SUPPLIED, DEMO_POSITIONS } from "@/data/demo-mock"

// ─── Demo history (realistic random walk around DEMO_TOTAL_SUPPLIED) ──────────

function buildDemoHistory() {
  const now = Date.now()
  const step = 3_600_000 // 1h
  let v = DEMO_TOTAL_SUPPLIED
  return Array.from({ length: 24 }, (_, i) => {
    const pct = (Math.random() - 0.48) * 0.04
    v = v * (1 + pct)
    const lo = DEMO_TOTAL_SUPPLIED * 0.7
    const hi = DEMO_TOTAL_SUPPLIED * 1.3
    if (v < lo) v = lo + Math.random() * (DEMO_TOTAL_SUPPLIED - lo) * 0.3
    if (v > hi) v = hi - Math.random() * (hi - DEMO_TOTAL_SUPPLIED) * 0.3
    return {
      date: new Date(now - (24 - i) * step).toISOString(),
      timestamp: now - (24 - i) * step,
      earnings: 0.05 * (i + 1),
      cumulativeEarnings: 0.05 * (i + 1),
      portfolioValue: parseFloat(v.toFixed(2)),
    }
  })
}

const DEMO_HISTORY = buildDemoHistory()

// ─── Desktop app ─────────────────────────────────────────────────────────────
// Canonical desktop experience. Rendered from `/app/easy` when the resolved
// device is desktop/tablet. The Stellar shell (header, deposit panel, tx
// toast) lives alongside this component in `StealllarDesktopShell.tsx`.

export function StealllarDesktopApp() {
  // Catch Meld card funding that landed while the tab was closed (desktop /app).
  useMeldReconcileOnLoad()
  const { isConnected, showDemoData } = useStealllarAuthState()

  const {
    currentPortfolioValue,
    totalLifetimeEarnings,
    portfolioGrowth7dPercent,
    earningsHistory,
    degradedMode,
    isLoading,
  } = usePortfolioEarnings()

  // Live APY data shared via React Query (60s staleTime); same hook the
  // mobile EasyModeCard already mounts, so on this page's render tree the
  // network request is deduped via the query cache.
  const { liveApyData } = useApyData()
  const crossChain = useCrossChainBalances(liveApyData)

  const useLive = isConnected && !showDemoData

  // Server now anchors earnings history to its own live multicall read, so
  // `currentPortfolioValue` from the hook should already match what
  // `useCrossChainBalances` sees on the same hub chains. We still fall back
  // to the client-side cross-chain total via Math.max — covers two cases:
  //   (1) Server is in `degradedMode` (RPC failed server-side) → its value
  //       is from a stale DB snapshot; the client multicall is fresher.
  //   (2) The cross-chain hook reads chains the server's hub-only path
  //       doesn't (e.g., spoke-chain idle balances merged with positions).
  // The user is "empty" only when both sources agree there's nothing.
  const liveTotal = useLive
    ? Math.max(currentPortfolioValue ?? 0, crossChain.totalSupplied ?? 0)
    : 0

  // Log degraded mode once per response so ops can see RPC outages without
  // a user-facing disruption — chart still falls back gracefully via
  // flatLiveHistory below.
  if (typeof window !== 'undefined' && degradedMode && useLive) {
    console.warn('[StealllarDesktopApp] earnings server in degraded mode — chart anchored to client multicall instead')
  }
  const livePositionsCount = useLive
    ? crossChain.allPositions.filter((p) => p.suppliedValueUSD > 0).length
    : 0
  const isEmpty = useLive && liveTotal === 0 && livePositionsCount === 0

  // Flat zero baseline keeps the chart's axes/timestamps rendering while
  // the line itself stays at $0. Memoised so the array doesn't re-mount the
  // chart on every render.
  const zeroHistory = useMemo(() => {
    const now = Date.now()
    const step = 3_600_000 // 1h
    return Array.from({ length: 24 }, (_, i) => ({
      date: new Date(now - (24 - i) * step).toISOString(),
      timestamp: now - (24 - i) * step,
      earnings: 0,
      cumulativeEarnings: 0,
      portfolioValue: 0,
    }))
  }, [])

  // Flat live baseline at the user's current total. Used when the user is
  // logged in with positions but the earningsHistory[] hasn't been built
  // yet (e.g. APY-time-series gap or very fresh deposit). Beats the
  // previous DEMO_HISTORY fallback that drew a fake $5500–6500 random walk
  // for users who actually held a few dollars.
  const flatLiveHistory = useMemo(() => {
    const now = Date.now()
    const step = 3_600_000 // 1h
    return Array.from({ length: 24 }, (_, i) => ({
      date: new Date(now - (24 - i) * step).toISOString(),
      timestamp: now - (24 - i) * step,
      earnings: 0,
      cumulativeEarnings: 0,
      portfolioValue: liveTotal,
    }))
  }, [liveTotal])

  const history = isEmpty
    ? zeroHistory
    : useLive
      ? earningsHistory?.length
        ? earningsHistory
        : flatLiveHistory
      : DEMO_HISTORY

  const totalValue = useLive ? liveTotal : DEMO_TOTAL_SUPPLIED

  const netAPY = isEmpty ? 0 : useLive ? (crossChain.weightedSupplyAPY ?? 4.8) : 4.8

  // Anchor for the hero's live counter. The 24h delta this replaced was
  // structurally stuck at "+$0.00 (+0.00%)": daily-resolution history against
  // sub-cent daily interest, and a `null` percent (no -24h data point) that the
  // old `?? 0` turned into a confident zero. The counter needs no history —
  // `totalValue × netAPY` carries it forward from whatever is booked.
  const earnedToDate = isEmpty ? 0 : useLive ? (totalLifetimeEarnings ?? 0) : 12.84

  const positionsCount = isEmpty
    ? 0
    : useLive
      ? livePositionsCount
      : DEMO_POSITIONS.length

  // 7d growth needs ≥ 7 daily history points; otherwise the metric is
  // misleading ("+0.0%" reads as "stable for a week" when it really means
  // "we don't know yet"). null → PortfolioHero renders "—".
  const has7dHistory = (earningsHistory?.length ?? 0) >= 7
  const growth7dPercent: number | null = isEmpty
    ? 0
    : useLive
      ? has7dHistory ? (portfolioGrowth7dPercent ?? 0) : null
      : 0.6

  return (
    <motion.main
      data-testid="steallar-page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="min-h-full bg-transparent"
    >
      <div className="w-full max-w-4xl xl:max-w-6xl 2xl:max-w-[80vw] mx-auto">
        <PortfolioHero
          totalValue={totalValue}
          earnedToDate={earnedToDate}
          history={history}
          isLoading={isLoading && useLive}
          isConnected={isConnected}
          netAPY={netAPY}
          positionsCount={positionsCount}
          growth7dPercent={growth7dPercent}
        />
      </div>

      <div className="w-full max-w-3xl xl:max-w-5xl 2xl:max-w-[75vw] mx-auto">
        <div className="mx-6 border-t border-foreground/[0.06]" />
        <AssetTable isConnected={isConnected} />
        <div className="mx-6 border-t border-foreground/[0.06]" />
        <BorrowSection isConnected={isConnected} className="px-6 py-8" />
        <div className="mx-6 border-t border-foreground/[0.06]" />
        <TransactionStrip isConnected={isConnected} className="px-6 py-8 pb-16" />
      </div>
    </motion.main>
  )
}

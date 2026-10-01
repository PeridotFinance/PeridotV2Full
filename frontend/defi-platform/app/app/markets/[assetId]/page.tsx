"use client"

import React, { useEffect, useMemo, useState } from 'react'
import { formatUnits } from 'viem'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useAccount } from 'wagmi'
import { useNetworkContext } from '@/context'
import { getAssetById } from '@/data/market-data'
import { useWalletBalance } from '@/hooks/use-wallet-balance'
import { usePTokenBalance } from '@/hooks/use-ptoken-balance'
import { useBorrowBalance } from '@/hooks/use-borrow-balance'
import { useHybridApy } from '@/hooks/use-hybrid-apy'
import { useBoostedAPR } from '@/hooks/use-boosted-apr'
import { useMarketDetails } from '@/hooks/use-market-details'
import { useBorrowingPower } from '@/hooks/use-borrowing-power'
import { useLivePrice } from '@/hooks/use-live-price'
import { useInterestRateCurve } from '@/hooks/use-interest-rate-curve'
import dynamic from 'next/dynamic'
import { useApyTimeseries } from '@/hooks/use-apy-timeseries'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useSupplyTransaction } from '@/hooks/use-supply-transaction'
import { FEATURE_FLAGS } from '@/config/featureFlags'
import { isWmonMagmaSupplyDisabledOnMonad, CHAIN_IDS } from '@/config/contracts'
import { useBorrowTransaction } from '@/hooks/use-borrow-transaction'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { useMobile } from '@/hooks/use-mobile'
import { useStellarMarketMetrics } from '@/hooks/use-stellar-market-metrics'

const InterestRateCurve = dynamic(() =>
  import('@/components/charts/InterestRateCurve')
    .then(mod => ({ default: mod.InterestRateCurve }))
    .catch(err => {
      console.error('[InterestRateCurve] Failed to load chart component:', err)
      // Return a fallback component that won't crash on mobile network failures
      return { 
        default: () => (
          <div className="flex h-[320px] items-center justify-center text-muted-foreground text-sm">
            Failed to load interest rate model
          </div>
        )
      }
    }),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[320px] items-center justify-center text-muted-foreground">
        Loading interest rate model…
      </div>
    ),
  }
)

const TimeSeriesChart = dynamic(() =>
  import('@/components/charts/TimeSeriesChart')
    .then(mod => ({ default: mod.TimeSeriesChart }))
    .catch(err => {
      console.error('[TimeSeriesChart] Failed to load chart component:', err)
      // Return a fallback component that won't crash on mobile network failures
      return { 
        default: () => (
          <div className="flex h-[280px] items-center justify-center text-muted-foreground text-sm">
            Failed to load APY chart
          </div>
        )
      }
    }),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[280px] items-center justify-center text-muted-foreground">
        Loading APY history…
      </div>
    ),
  }
)

function MarketDetailsPageContent() {
  const params = useParams<{ assetId: string }>()
  const router = useRouter()
  const assetId = params?.assetId
  
  // Early validation: Check if assetId exists and is valid before proceeding
  if (!assetId || typeof assetId !== 'string' || assetId.trim() === '') {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <p className="text-muted-foreground mb-4">Invalid asset identifier.</p>
        <Button onClick={() => router.push('/app')}>Go to Markets</Button>
      </div>
    )
  }

  // Safely get asset with error handling
  const asset = React.useMemo(() => {
    try {
      return getAssetById(assetId)
    } catch (error) {
      console.error('[MarketDetailsPage] Error getting asset:', error)
      return undefined
    }
  }, [assetId])
  
  // Early validation: Check if asset exists
  if (!asset) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <p className="text-muted-foreground mb-4">Asset not found.</p>
        <Button onClick={() => router.push('/app')}>Go to Markets</Button>
      </div>
    )
  }

  // Call useMobile after validation to avoid unnecessary hook calls
  const isMobile = useMobile()

  const { isConnected, chainId } = useAccount()
  const { selectedNetworkId, getChainIdFromNetworkId } = useNetworkContext()
  const resolvedChainId = useMemo(() => {
    if (isConnected && chainId) return chainId
    const resolved = getChainIdFromNetworkId(selectedNetworkId)
    // Add fallback to prevent undefined from being passed to hooks
    // This prevents crashes when context isn't ready yet on mobile
    return resolved ?? (asset?.availableOnChainId ?? null)
  }, [isConnected, chainId, selectedNetworkId, getChainIdFromNetworkId, asset?.availableOnChainId])

  // Now we can safely call hooks since assetId is validated
  // Note: Hooks must be called unconditionally, so we rely on ErrorBoundary to catch errors
  const { formattedBalance: walletBalance, numericBalance: walletBalanceNumeric } = useWalletBalance({ assetId })
  const { formattedBalance: suppliedBalance, underlyingBalance: suppliedUnderlying, decimals: suppliedDecimals } = usePTokenBalance({ assetId })
  const { formattedBalance: borrowedBalance, numericBalance: borrowNumeric } = useBorrowBalance({ assetId })
  
  // Wrap useMarketDetails in error boundary via component structure
  const { data: market, isLoading: detailsLoading } = useMarketDetails(assetId, resolvedChainId ?? undefined)
  const isStellarAsset = useMemo(() => assetId.endsWith('-stellar'), [assetId])
  const { metrics: stellarMetrics } = useStellarMarketMetrics(isStellarAsset ? [assetId] : [], isStellarAsset)
  const stellarMetricsKey = useMemo(
    () => `${assetId.replace(/_/g, "-").toUpperCase()}:${CHAIN_IDS.STELLAR_MAINNET}`,
    [assetId]
  )
  const stellarMetric = isStellarAsset ? stellarMetrics[stellarMetricsKey] : undefined
  
  const { supplyApy, borrowApy, peridotSupplyApy, peridotBorrowApy, totalSupplyApy, netBorrowApy } = useHybridApy({ 
    assetId, 
    chainId: resolvedChainId || null 
  })
  
  // Check if this is a boosted asset
  const isBoosted = asset.category === "boosted"
  const boostedType = isBoosted ? (assetId.includes('morpho') ? 'morpho' : 'pancake') : null
  
  const boostedAPR = useBoostedAPR({
    assetId,
    chainId: resolvedChainId ?? undefined,
    boostType: boostedType as 'morpho' | 'pancake' | undefined
  })

  // Use boosted APR if available, otherwise use regular APY
  const displaySupplyApy = isBoosted && !boostedAPR.isLoading 
    ? boostedAPR.total 
    : supplyApy
  
  // Use boosted total for calculations
  const effectiveTotalSupplyApy = isBoosted && !boostedAPR.isLoading 
    ? boostedAPR.total 
    : totalSupplyApy

  const { price } = useLivePrice({ assetId, chainIdOverride: resolvedChainId || undefined })
  const supplyDisabled = isWmonMagmaSupplyDisabledOnMonad(assetId, resolvedChainId)
  const { borrowingPower, getMaxBorrowAmount, isBorrowAmountSafe } = useBorrowingPower()
  // getMaxBorrowAmount is already memoized, so we can call it directly
  const maxBorrowAmount = getMaxBorrowAmount ? getMaxBorrowAmount(assetId) : 0
  
  // useInterestRateCurve makes contract calls - errors will be caught by ErrorBoundary
  const { points, currentUPct } = useInterestRateCurve(assetId, resolvedChainId ?? undefined)
  
  // Handle unhandled promise rejections on mobile (dynamic imports, RPC timeouts)
  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('[MarketDetailsPage] Unhandled promise rejection:', event.reason)
      // Prevent app crash on mobile - log error but don't let it bubble up
      event.preventDefault()
    }
    
    const handleError = (event: ErrorEvent) => {
      // Only log, don't prevent - let ErrorBoundary handle React errors
      console.error('[MarketDetailsPage] Global error:', event.error)
    }
    
    window.addEventListener('unhandledrejection', handleUnhandledRejection)
    window.addEventListener('error', handleError)
    
    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
      window.removeEventListener('error', handleError)
    }
  }, [])
  
  const [openSupplyCount, setOpenSupplyCount] = useState<number | null>(null)
  const [openBorrowCount, setOpenBorrowCount] = useState<number | null>(null)
  const [range, setRange] = useState<'7d' | '30d' | '90d' | '365d'>('90d')
  
  const { data: apySeries } = useApyTimeseries(assetId, resolvedChainId || null, range)
  const apyChartData = useMemo(
    () => (apySeries || []).map(p => ({ date: p.date, supply: p.supply, borrow: p.borrow, repay: 0, redeem: 0 })),
    [apySeries]
  )

  // Header action modals
  const [isSupplyOpen, setIsSupplyOpen] = useState(false)
  const [isBorrowOpen, setIsBorrowOpen] = useState(false)
  const [supplyAmount, setSupplyAmount] = useState('')
  const [borrowAmount, setBorrowAmount] = useState('')

  const {
    executeSupply,
    isLoading: isSupplyLoading,
    needsApproval,
    step: supplyStep,
    statusMessage: supplyStatusMessage,
  } = useSupplyTransaction({
    assetId,
    amount: supplyAmount,
    onSuccess: () => {
      setSupplyAmount('')
      setIsSupplyOpen(false)
    },
    onError: () => {}
  })

  const {
    executeBorrow,
    isLoading: isBorrowLoading,
    step: borrowStep,
    statusMessage: borrowStatusMessage,
    canBorrow,
  } = useBorrowTransaction({
    assetId,
    amount: borrowAmount,
    feeMode: 'native',
    onSuccess: () => {
      setBorrowAmount('')
      setIsBorrowOpen(false)
    },
    onError: () => {}
  })

  // Price fallback precedence with null guards
  const priceUSD = useMemo(() => {
    const p = price ?? market?.priceUSD ?? stellarMetric?.priceUsd ?? (typeof asset?.price === 'number' ? asset?.price : Number(asset?.price))
    return Number.isFinite(p as number) ? (p as number) : 0
  }, [price, market?.priceUSD, stellarMetric?.priceUsd, asset?.price])

  const effectiveLiquidityUnderlying = useMemo(() => {
    if (market?.liquidityUnderlying != null) return market.liquidityUnderlying
    if (stellarMetric && Number.isFinite(stellarMetric.liquidityUnderlying)) return stellarMetric.liquidityUnderlying
    return null
  }, [market?.liquidityUnderlying, stellarMetric])

  const effectiveLiquidityUSD = useMemo(() => {
    if (market?.liquidityUSD != null) return market.liquidityUSD
    if (stellarMetric && Number.isFinite(stellarMetric.liquidityUsd)) return stellarMetric.liquidityUsd
    return null
  }, [market?.liquidityUSD, stellarMetric])

  // Numeric supplied balance from underlying units
  const numericSupplied = useMemo(() => {
    try {
      // suppliedUnderlying/decimals from usePTokenBalance
      // @ts-ignore - types allow undefined; handle via guards
      if (!suppliedUnderlying || suppliedDecimals == null) return 0
      // @ts-ignore
      return parseFloat(formatUnits(suppliedUnderlying as bigint, suppliedDecimals as number))
    } catch {
      return 0
    }
  }, [suppliedUnderlying, suppliedDecimals])

  // Per-user USD daily figures
  const dailyEarningsUSD = useMemo(() => {
    if (!numericSupplied || !effectiveTotalSupplyApy || !priceUSD) return null
    const perDayRate = (effectiveTotalSupplyApy / 100) / 365
    return numericSupplied * priceUSD * perDayRate
  }, [numericSupplied, effectiveTotalSupplyApy, priceUSD])

  const dailyInterestUSD = useMemo(() => {
    const borrowAmount = borrowNumeric || 0
    if (!borrowAmount || !netBorrowApy || !priceUSD) return null
    const perDayRate = (netBorrowApy / 100) / 365
    return borrowAmount * priceUSD * perDayRate
  }, [borrowNumeric, netBorrowApy, priceUSD])

  // Derived metrics with null guards
  const utilizationPct = useMemo(() => {
    if (stellarMetric && Number.isFinite(stellarMetric.utilizationPct)) {
      return Math.max(0, Math.min(100, stellarMetric.utilizationPct))
    }
    if (!market) return 0
    // Match AssetDropdown: borrows / (cash + borrows - reserves) using underlying units
    const borrows = market.totalBorrowsUnderlying ?? 0
    const cash = market.liquidityUnderlying ?? 0
    const reserves = market.totalReservesUnderlying ?? 0
    const denom = cash + borrows - reserves
    if (!denom || denom <= 0) return 0
    const u = borrows / denom
    return Math.max(0, Math.min(100, u * 100))
  }, [market, stellarMetric])

  const healthScore = useMemo(() => {
    return Math.max(0, Math.min(100, 100 - utilizationPct))
  }, [utilizationPct])

  // Display a user HF using global borrowingPower if present
  const userHealthFactor = useMemo(() => {
    const totalBorrowingPowerUSD = borrowingPower?.totalBorrowingPowerUSD
    const totalBorrowedUSD = borrowingPower?.totalBorrowedUSD
    if (totalBorrowedUSD === undefined || totalBorrowingPowerUSD === undefined) return null
    if (totalBorrowedUSD <= 0) return Infinity
    if (!Number.isFinite(totalBorrowingPowerUSD) || totalBorrowingPowerUSD <= 0) return null
    return totalBorrowingPowerUSD / Math.max(totalBorrowedUSD, 1e-9)
  }, [borrowingPower])

  // Calm highlight pulses when values change
  const [pricePulse, setPricePulse] = useState(false)
  const [supplyPulse, setSupplyPulse] = useState(false)
  const [borrowPulse, setBorrowPulse] = useState(false)

  useEffect(() => {
    // Fetch open position counts when assetId and chainId are available
    const fetchOpenPositions = async () => {
      try {
        if (!assetId || !resolvedChainId) {
          setOpenSupplyCount(null)
          setOpenBorrowCount(null)
          return
        }
        const token = String(assetId).toLowerCase()
        const res = await fetch(`/api/markets/open-positions?token=${encodeURIComponent(token)}&chainId=${resolvedChainId}`, { cache: 'no-store' })
        if (!res.ok) throw new Error('Failed to fetch open positions')
        const data = await res.json()
        setOpenSupplyCount(Number(data.openSupplyCount || 0))
        setOpenBorrowCount(Number(data.openBorrowCount || 0))
      } catch {
        setOpenSupplyCount(null)
        setOpenBorrowCount(null)
      }
    }
    fetchOpenPositions()
  }, [assetId, resolvedChainId])
  

  useEffect(() => {
    if (displaySupplyApy != null) {
      setSupplyPulse(true)
      const t = setTimeout(() => setSupplyPulse(false), 600)
      return () => clearTimeout(t)
    }
  }, [displaySupplyApy])

  useEffect(() => {
    if (borrowApy != null) {
      setBorrowPulse(true)
      const t = setTimeout(() => setBorrowPulse(false), 600)
      return () => clearTimeout(t)
    }
  }, [borrowApy])

  // Format USD with dynamic decimals for very small values
  const formatUsdSmart = (value: number | null | undefined): string => {
    const n = Number(value)
    if (!Number.isFinite(n)) return '-'
    const abs = Math.abs(n)
    if (abs === 0) return '$0.00'
    if (abs >= 0.01) {
      return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    }
    let decimals = 2
    while (abs < Math.pow(10, -decimals) && decimals < 8) {
      decimals += 1
    }
    return `$${n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`
  }

  return (
    <>
      {/* Background - simplified on mobile for better performance */}
      {isMobile ? (
        // Simplified mobile background
        <div aria-hidden className="fixed inset-0 -z-10 pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/5 dark:to-black/20" />
        </div>
      ) : (
        // Full desktop background with gradients and grid
        <div aria-hidden className="fixed inset-0 -z-10 pointer-events-none">
          {/* Subtle radial depth glow */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,200,255,0.10),transparent_40%)] dark:bg-[radial-gradient(ellipse_at_center,rgba(0,255,200,0.12),transparent_38%)]" />
          {/* Cyber grid (repeating linear gradients), light/dark tuned */}
          <div className="absolute inset-0 opacity-70 [background-size:40px_40px,40px_40px] bg-[repeating-linear-gradient(0deg,transparent,transparent_39px,rgba(0,180,255,0.18)_40px),repeating-linear-gradient(90deg,transparent,transparent_39px,rgba(0,180,255,0.18)_40px)] dark:bg-[repeating-linear-gradient(0deg,transparent,transparent_39px,rgba(16,185,129,0.18)_40px),repeating-linear-gradient(90deg,transparent,transparent_39px,rgba(16,185,129,0.18)_40px)]" />
          {/* Vignette for depth */}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/10 dark:to-black/40" />
        </div>
      )}

      <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
      {/* Market Status strip */}
      <div className="glass-strong soft-shadow relative overflow-hidden px-4 md:px-6 py-4 md:py-6 rounded-xl">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <button
              onClick={() => router.back()}
              className="text-xl md:text-2xl leading-none px-2 py-1 rounded-md hover:bg-white/10 hover:backdrop-blur-sm"
              aria-label="Go back"
            >
              &lt;
            </button>
            <div className="h-12 w-12 rounded-full glass-tab grid place-items-center text-sm font-semibold">
              {asset.symbol?.slice(0, 3).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
                {asset.name} <span className="text-muted-foreground">({asset.symbol})</span>
              </h1>
              <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
                <span className={(pricePulse ? 'highlight-pulse px-1 ' : '')}>
                  {formatUsdSmart(priceUSD)}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className="health-ring cursor-help"
                    style={{ backgroundImage: `conic-gradient(rgba(127,183,113,0.85) ${healthScore}%, rgba(127,183,113,0.15) ${healthScore}%)` }}
                    aria-label="Market Health Score"
                  >
                    <div className="health-ring-inner text-xs">{Math.round(healthScore)}</div>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" align="end" className="max-w-xs text-xs">
                  <div className="font-semibold mb-1">Utilization Buffer: {Math.round(healthScore)} / 100</div>
                  <div className="text-muted-foreground">
                    Market headroom based on utilization. Utilization = borrows / (cash + borrows − reserves). Buffer = 100 − utilization.
                  </div>
                </TooltipContent>
              </Tooltip>
              <div className="flex shrink-0 gap-2">
                <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button className="glow-ring" variant="default" onClick={() => !supplyDisabled && setIsSupplyOpen(true)} disabled={supplyDisabled}>Supply</Button>
                  </span>
                </TooltipTrigger>
                {supplyDisabled && <TooltipContent>Supply temporarily disabled for this market</TooltipContent>}
              </Tooltip>
              <Button className="glow-ring" variant="secondary" onClick={() => setIsBorrowOpen(true)}>Borrow</Button>
              </div>
            </TooltipProvider>
          </div>
        </div>
      </div>

      {/* Supply Modal */}
      <Dialog open={isSupplyOpen} onOpenChange={setIsSupplyOpen}>
        <DialogContent className="max-w-md md:max-w-lg border-none bg-transparent shadow-none p-0">
          <div className="relative backdrop-blur-2xl bg-white/40 dark:bg-white/5 border border-black/10 dark:border-white/15 rounded-2xl p-4 md:p-6 shadow-2xl text-slate-800 dark:text-foreground">
            <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-white/10 opacity-40 rounded-2xl pointer-events-none" />
            <DialogHeader>
              <DialogTitle className="text-xl md:text-2xl font-semibold">Supply {asset.symbol}</DialogTitle>
            </DialogHeader>
            <div className="mt-4 space-y-4 relative">
              <div className="text-sm text-slate-700 dark:text-muted-foreground">Earn {displaySupplyApy?.toFixed(2) ?? (totalSupplyApy ?? supplyApy)?.toFixed(2)}% APY</div>
              <div className="space-y-2">
                <div className="text-xs flex justify-between text-slate-600 dark:text-muted-foreground"><span>Wallet</span><span className="font-semibold text-slate-900 dark:text-foreground">{walletBalance} {asset.symbol}</span></div>
                <div className="relative">
                  <input
                    className="w-full rounded-2xl bg-white/70 dark:bg-white/7.5 border border-black/10 dark:border-white/15 px-4 py-3 outline-none backdrop-blur-md focus:border-black/20 dark:focus:border-white/30 text-slate-800 dark:text-foreground placeholder:text-slate-500 dark:placeholder:text-muted-foreground"
                    placeholder="Amount"
                    inputMode="decimal"
                    value={supplyAmount}
                    onChange={(e) => { if (/^$|^\d*\.?\d*$/.test(e.target.value)) setSupplyAmount(e.target.value) }}
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-600 dark:text-muted-foreground">{asset.symbol}</div>
                </div>
                <div className="flex gap-2">
                  {([0.25,0.5,0.75,1] as const).map(pct => (
                    <button key={pct} onClick={() => setSupplyAmount(((walletBalanceNumeric||0)*pct).toString())} className="flex-1 py-2 text-xs font-medium rounded-2xl transition-all duration-200 bg-white/50 border border-black/10 text-slate-800 hover:bg-white/70 dark:bg-white/5 dark:border-white/10 dark:text-foreground dark:hover:bg-white/10">
                      {pct===1? 'MAX' : `${Math.round(pct*100)}%`}
                    </button>
                  ))}
                </div>
              </div>
              <Button
                className="w-full glow-ring"
                disabled={supplyDisabled || !isConnected || !assetId || !supplyAmount || parseFloat(supplyAmount||'0')<=0 || (walletBalanceNumeric!=null && parseFloat(supplyAmount)>walletBalanceNumeric) || isSupplyLoading}
                onClick={() => { 
                  if (supplyDisabled) return
                  if (FEATURE_FLAGS.INTERACTIVE_TX_DIALOG) { 
                    try { 
                      (window as any).dispatchEvent(new CustomEvent('peridot:tx-active')) 
                    } catch {} 
                  } 
                  executeSupply() 
                }}
              >
                {isSupplyLoading ? (supplyStep === 'approving' ? 'Approving...' : 'Supplying...') : (needsApproval ? 'Approve & Supply' : 'Supply')}
              </Button>
              {supplyStatusMessage && isSupplyLoading && (
                <div className="text-xs text-muted-foreground text-center">{supplyStatusMessage}</div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Borrow Modal */}
      <Dialog open={isBorrowOpen} onOpenChange={setIsBorrowOpen}>
        <DialogContent className="max-w-md md:max-w-lg border-none bg-transparent shadow-none p-0">
          <div className="relative backdrop-blur-2xl bg-white/40 dark:bg-white/5 border border-black/10 dark:border-white/15 rounded-2xl p-4 md:p-6 shadow-2xl text-slate-800 dark:text-foreground">
            <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-white/10 opacity-40 rounded-2xl pointer-events-none" />
            <DialogHeader>
              <DialogTitle className="text-xl md:text-2xl font-semibold">Borrow {asset.symbol}</DialogTitle>
            </DialogHeader>
            <div className="mt-4 space-y-4 relative">
              <div className="text-sm text-slate-700 dark:text-muted-foreground">Rate {(borrowApy).toFixed(2)}% APY</div>
              <div className="space-y-2">
                <div className="text-xs flex justify-between text-slate-600 dark:text-muted-foreground"><span>Available</span><span className="font-semibold text-slate-900 dark:text-foreground">{maxBorrowAmount.toFixed(4)} {asset.symbol}</span></div>
                <div className="relative">
                  <input
                    className="w-full rounded-2xl bg-white/70 dark:bg-white/7.5 border border-black/10 dark:border-white/15 px-4 py-3 outline-none backdrop-blur-md focus:border-black/20 dark:focus:border-white/30 text-slate-800 dark:text-foreground placeholder:text-slate-500 dark:placeholder:text-muted-foreground"
                    placeholder="Amount"
                    inputMode="decimal"
                    value={borrowAmount}
                    onChange={(e) => { if (/^$|^\d*\.?\d*$/.test(e.target.value)) setBorrowAmount(e.target.value) }}
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-600 dark:text-muted-foreground">{asset.symbol}</div>
                </div>
                <div className="flex gap-2">
                  {([0.25,0.5,0.75,1] as const).map(pct => (
                    <button key={pct} onClick={() => setBorrowAmount((maxBorrowAmount*pct).toString())} className="flex-1 py-2 text-xs font-medium rounded-md transition-all duration-200 bg-white/50 border border-black/10 text-slate-800 hover:bg-white/70 dark:bg-white/5 dark:border-white/10 dark:text-foreground dark:hover:bg-white/10">
                      {pct===1? 'MAX' : `${Math.round(pct*100)}%`}
                    </button>
                  ))}
                </div>
              </div>
              <Button
                className="w-full glow-ring"
                disabled={!isConnected || !borrowAmount || parseFloat(borrowAmount||'0')<=0 || parseFloat(borrowAmount) > maxBorrowAmount || !isBorrowAmountSafe(assetId, parseFloat(borrowAmount)) || isBorrowLoading || !canBorrow}
                onClick={() => executeBorrow()}
              >
                {isBorrowLoading ? (borrowStep === 'borrowing' ? 'Borrowing...' : 'Processing...') : 'Borrow'}
              </Button>
              {borrowStatusMessage && isBorrowLoading && (
                <div className="text-xs text-muted-foreground text-center">{borrowStatusMessage}</div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Your supply/borrow */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-card/80 border-border/60 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>Your supply</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between text-sm"><span>Currently supplying</span><span className="font-medium">{suppliedBalance} {asset.symbol}</span></div>
            <div className="flex items-center justify-between text-sm"><span>Daily earnings</span><span className="font-medium">{(dailyEarningsUSD != null && dailyEarningsUSD > 0) ? `$${dailyEarningsUSD.toLocaleString(undefined,{ maximumFractionDigits: 2 })}` : '-'}</span></div>
            <div className="flex items-center justify-between text-sm"><span>Use as collateral</span><span className="font-medium">—</span></div>
            <div className="flex items-center justify-between text-sm"><span>Wallet balance</span><span className="font-medium">{walletBalance} {asset.symbol}</span></div>
          </CardContent>
        </Card>

        <Card className="bg-card/80 border-border/60 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>Your borrow</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between text-sm"><span>Currently borrowing</span><span className="font-medium">{borrowedBalance} {asset.symbol}</span></div>
            <div className="flex items-center justify-between text-sm"><span>Daily interest</span><span className="font-medium">{(dailyInterestUSD != null && dailyInterestUSD > 0) ? `$${dailyInterestUSD.toLocaleString(undefined,{ maximumFractionDigits: 2 })}` : '-'}</span></div>
            <div className="flex items-center justify-between text-sm"><span>Borrow limit</span><span className="font-medium">${borrowingPower?.totalBorrowingPowerUSD?.toFixed(2) ?? '0.00'}</span></div>
            <div className="flex items-center justify-between text-sm"><span>Available borrow</span><span className="font-medium">${borrowingPower?.availableBorrowingPowerUSD?.toFixed(2) ?? '0.00'}</span></div>
          </CardContent>
        </Card>
      </div>

      {/* Summary chips */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="glass-tab px-3 py-2 text-sm flex items-center justify-between">
          <span>Total Liquidity</span>
          <span className="font-medium">{(() => {
            const liquidityUSD = effectiveLiquidityUSD
            if (liquidityUSD && liquidityUSD > 0) return `$${liquidityUSD.toLocaleString(undefined,{ maximumFractionDigits: 2 })}`
            const liqUnderlying = effectiveLiquidityUnderlying
            if (liqUnderlying != null && priceUSD > 0) {
              const usd = liqUnderlying * priceUSD
              return `$${usd.toLocaleString(undefined,{ maximumFractionDigits: 2 })}`
            }
            return '-'
          })()}</span>
        </div>
        <div className="glass-tab px-3 py-2 text-sm flex items-center justify-between">
          <span>Supply APY</span>
          <span className={'font-medium' + (supplyPulse ? ' highlight-pulse px-1' : '')}>{(displaySupplyApy ?? supplyApy).toFixed(2)}%</span>
        </div>
        <div className="glass-tab px-3 py-2 text-sm flex items-center justify-between">
          <span>Borrow APY</span>
          <span className={'font-medium' + (borrowPulse ? ' highlight-pulse px-1' : '')}>{(borrowApy).toFixed(2)}%</span>
        </div>
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
        <div className="glass-tab px-3 py-2 text-sm flex items-center justify-between cursor-help" aria-label="Utilization">
          <span>Utilization</span>
          <span className="font-medium">{(100 - healthScore).toFixed(1)}%</span>
        </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="start" className="max-w-xs text-xs">
        <div className="font-semibold mb-1">Market Utilization</div>
        <div className="text-muted-foreground">Utilization = borrows / (cash + borrows − reserves). Lower is more headroom.</div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Supply / Borrow quick stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-card/70 border-border/50 backdrop-blur-sm">
          <CardHeader><CardTitle>Supply</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="flex items-center justify-between"><span>Supplies</span><span className="font-medium">{openSupplyCount != null ? openSupplyCount.toLocaleString() : '-'}</span></div>
            <div className="flex items-center justify-between"><span>Supply APY</span><span className="font-medium">{(displaySupplyApy ?? supplyApy).toFixed(2)}%</span></div>
            {isBoosted && !boostedAPR.isLoading ? (
              <>
                {boostedAPR.breakdown.boostSource > 0 && (
                  <div className="flex items-center justify-between"><span>Boost APY</span><span className="font-medium">{(boostedAPR.breakdown.boostSource).toFixed(2)}%</span></div>
                )}
                {boostedAPR.breakdown.rewards > 0 && (
                  <div className="flex items-center justify-between"><span>Rewards APY</span><span className="font-medium">{(boostedAPR.breakdown.rewards).toFixed(2)}%</span></div>
                )}
              </>
            ) : (
              <div className="flex items-center justify-between"><span>Distribution APY</span><span className="font-medium">{(peridotSupplyApy).toFixed(2)}%</span></div>
            )}
          </CardContent>
        </Card>
        <Card className="bg-card/70 border-border/50 backdrop-blur-sm">
          <CardHeader><CardTitle>Borrow</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="flex items-center justify-between"><span>Borrows</span><span className="font-medium">{openBorrowCount != null ? openBorrowCount.toLocaleString() : '-'}</span></div>
            <div className="flex items-center justify-between"><span>Borrow APY</span><span className="font-medium">{(borrowApy).toFixed(2)}%</span></div>
            <div className="flex items-center justify-between"><span>Distribution APY</span><span className="font-medium">{(peridotBorrowApy).toFixed(2)}%</span></div>
          </CardContent>
        </Card>
      </div>

      {/* Market details */}
      <Card className="bg-card/70 border-border/50 backdrop-blur-sm">
          <CardHeader><CardTitle>Market details</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div className="flex items-center justify-between"><span>Price</span><span>{formatUsdSmart(priceUSD)}</span></div>
          <div className="flex items-center justify-between"><span>Market liquidity</span><span>{effectiveLiquidityUnderlying != null ? effectiveLiquidityUnderlying.toLocaleString(undefined,{maximumFractionDigits:2}) : '-'} {asset.symbol} {effectiveLiquidityUSD ? `($${effectiveLiquidityUSD.toLocaleString(undefined,{maximumFractionDigits:2})})` : ''}</span></div>
          <div className="flex items-center justify-between"><span>Interest paid/day</span><span>{market?.dailyInterestUnderlying != null ? `${market.dailyInterestUnderlying.toFixed(2)} ${asset.symbol} ($${(market.dailyInterestUSD||0).toFixed(2)})` : '-'}</span></div>
          <div className="flex items-center justify-between"><span>Reserves</span><span>{market?.totalReservesUnderlying != null ? `${market.totalReservesUnderlying.toLocaleString(undefined,{maximumFractionDigits:2})} ${asset.symbol} ($${(market.totalReservesUSD||0).toLocaleString(undefined,{maximumFractionDigits:2})})` : '-'}</span></div>
          <div className="flex items-center justify-between"><span>Reserve factor</span><span>{market?.reserveFactor?.toFixed(2) ?? '-'}%</span></div>
          <div className="flex items-center justify-between"><span>Collateral factor</span><span>{market?.collateralFactor?.toFixed(2) ?? '-'}%</span></div>
          <div className="flex items-center justify-between"><span>Health Factor (you)</span><span className="tabular-nums">{userHealthFactor === null ? '—' : (userHealthFactor === Infinity ? '∞' : userHealthFactor.toFixed(2))}</span></div>
          <div className="flex items-center justify-between"><span>Liquidation penalty</span><span>{market?.liquidationIncentive ? `${(market.liquidationIncentive-100).toFixed(2)}%` : '-'}</span></div>
          <div className="flex items-center justify-between"><span>{asset.symbol} borrow cap</span><span>{market?.borrowCapUnderlying != null ? market.borrowCapUnderlying.toLocaleString(undefined,{maximumFractionDigits:2}) : 'No cap'}</span></div>
          <div className="flex items-center justify-between"><span>p{asset.symbol} minted</span><span>{market?.tTokenTotalSupply != null ? market.tTokenTotalSupply.toLocaleString(undefined,{maximumFractionDigits:2}) : '-'}</span></div>
          <div className="flex items-center justify-between"><span>p{asset.symbol} contract address</span><span className="font-mono text-xs">{market?.tTokenAddress ?? '-'}</span></div>
          <div className="flex items-center justify-between"><span>Exchange rate</span><span>{market?.tokensPerUnderlying != null ? `1 ${asset.symbol} = ${market.tokensPerUnderlying.toFixed(2)} p${asset.symbol}` : '-'}</span></div>
        </CardContent>
      </Card>

      {/* Interest Rate Model - Hidden on mobile to prevent crashes */}
      {!isMobile && (
        <Card className="bg-card/70 border-border/50 backdrop-blur-sm">
          <CardHeader><CardTitle>Interest Rate Model</CardTitle></CardHeader>
          <CardContent>
            {/* Utilization Gauge */}
            <div className="mb-4">
              <div className="flex items-center justify-between text-xs mb-1">
                <span>Utilization</span>
                <span className="font-medium">{utilizationPct.toFixed(1)}%</span>
              </div>
              <div className="util-gauge">
                <div className="util-gauge-fill" style={{ width: `${utilizationPct}%` }} />
                <div className="util-gauge-marker" style={{ left: `calc(${utilizationPct}% - 1px)` }} />
              </div>
            </div>
            <ErrorBoundary
              fallback={
                <div className="flex h-[320px] items-center justify-center text-muted-foreground text-sm">
                  Failed to load interest rate curve
                </div>
              }
            >
              <InterestRateCurve data={points || []} currentUPct={currentUPct ?? 0} height={320} />
            </ErrorBoundary>
          </CardContent>
        </Card>
      )}

      {/* APY over time - Hidden on mobile to prevent crashes */}
      {!isMobile && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">APY over time <span className="live-dot" /></CardTitle>
              <div className="flex gap-1">
                {(['7d','30d','90d','365d'] as const).map(r => (
                  <button key={r} onClick={() => setRange(r)} className={`liquid-pill px-2 py-1 text-xs ${range===r ? 'liquid-pill-active' : ''}`}>
                    {r}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="relative chart-glass chart-hover p-2 rounded-xl">
              <ErrorBoundary
                fallback={
                  <div className="flex h-[280px] items-center justify-center text-muted-foreground text-sm">
                    Failed to load APY chart
                  </div>
                }
              >
                <TimeSeriesChart
                  data={apyChartData}
                  height={280}
                  showLegend
                  valueType="percentage"
                  legendLabels={{ supply: 'Supply APY', borrow: 'Borrow APY' }}
                />
              </ErrorBoundary>
            </div>

          </CardContent>
        </Card>
      )}
    </div>
    </>
  )
}

export default function MarketDetailsPage() {
  return (
    <ErrorBoundary
      fallback={
        <div className="flex items-center justify-center min-h-screen p-8">
          <div className="text-center max-w-md">
            <h2 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-2">
              Failed to load market details
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              There was an error loading the market details page. This may be due to a network issue or invalid asset.
            </p>
            <Button
              onClick={() => window.location.href = '/app'}
              className="mr-2"
            >
              Go to Markets
            </Button>
            <Button
              variant="outline"
              onClick={() => window.location.reload()}
            >
              Refresh Page
            </Button>
          </div>
        </div>
      }
    >
      <MarketDetailsPageContent />
    </ErrorBoundary>
  )
}

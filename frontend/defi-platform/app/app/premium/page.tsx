'use client'

import { useState } from 'react'
import { useAccount } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Star, Lock, TrendingUp, BarChart3, Zap, ShieldCheck,
  ArrowUpRight, Loader2, RefreshCw, Trophy,
  Download, ChevronDown,
} from 'lucide-react'
import Link from 'next/link'
import { ApyHistoryChart } from '@/components/charts/ApyHistoryChart'

// ─── Types ────────────────────────────────────────────────────────────────────

interface EligibilityData {
  eligible: boolean
  tier: string | null
  boostPct: number
  rank: number | null
}

interface MarketMetric {
  utilizationPct: number
  tvlUsd: number
  liquidityUsd: number
  priceUsd: number
  chainId: number
}

interface LeaderboardEntry {
  wallet_address: string
  username?: string
  total_points: number
  global_rank?: number
  isPremium?: boolean
}

interface ApyPoint {
  timestamp: string
  supplyApy: number
  borrowApy: number
  peridotSupplyApy?: number
}

const APY_ASSETS = [
  { id: 'bnb',  label: 'BNB',   chainId: 56 },
  { id: 'usdc', label: 'USDC',  chainId: 56 },
  { id: 'usdt', label: 'USDT',  chainId: 56 },
  { id: 'cake', label: 'CAKE',  chainId: 56 },
  { id: 'weth', label: 'WETH',  chainId: 56 },
  { id: 'wbtc', label: 'WBTC',  chainId: 56 },
]

const APY_WINDOWS = ['7d', '30d', '90d'] as const
type ApyWindow = typeof APY_WINDOWS[number]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number, decimals = 2) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`
  return `$${n.toFixed(decimals)}`
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function UtilBar({ pct }: { pct: number }) {
  const color =
    pct > 85 ? 'bg-red-400' :
    pct > 65 ? 'bg-amber-400' :
    'bg-emerald-400'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all duration-700`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className={`font-mono text-xs font-semibold ${
        pct > 85 ? 'text-red-400' : pct > 65 ? 'text-amber-400' : 'text-emerald-400'
      }`}>{pct.toFixed(1)}%</span>
    </div>
  )
}

// ─── Locked overlay ───────────────────────────────────────────────────────────

function LockedSection({ title, description }: { title: string; description: string }) {
  return (
    <div className="relative rounded-xl border border-white/8 bg-white/2 overflow-hidden">
      {/* blurred content placeholder */}
      <div className="p-5 blur-sm select-none pointer-events-none opacity-40">
        <div className="h-4 w-32 bg-white/10 rounded mb-3" />
        <div className="grid grid-cols-3 gap-2">
          {[1,2,3].map(i => <div key={i} className="h-16 bg-white/10 rounded" />)}
        </div>
      </div>
      {/* overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40 backdrop-blur-[2px]">
        <Lock className="w-5 h-5 text-muted-foreground" />
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground text-center max-w-[200px]">{description}</p>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function PremiumInsightsPage() {
  const { address, isConnected } = useAccount()

  // APY chart state
  const [apyAsset, setApyAsset] = useState(APY_ASSETS[0])
  const [apyWindow, setApyWindow] = useState<ApyWindow>('30d')
  const [showBorrow, setShowBorrow] = useState(true)

  // Export state
  const [exportFrom, setExportFrom] = useState('')
  const [exportTo, setExportTo] = useState('')
  const [isExporting, setIsExporting] = useState(false)

  const { data: eligibility, isLoading: eligLoading } = useQuery<EligibilityData>({
    queryKey: ['claim-eligibility', address],
    queryFn: async () => {
      const res = await fetch(`/api/claim/eligibility?address=${address}`)
      if (!res.ok) throw new Error('Failed')
      return res.json()
    },
    enabled: !!address && isConnected,
    staleTime: 120_000,
  })

  const { data: metricsData, isLoading: metricsLoading, refetch: refetchMetrics } = useQuery<{
    ok: boolean; data: Record<string, MarketMetric>
  }>({
    queryKey: ['market-metrics'],
    queryFn: async () => {
      const res = await fetch('/api/markets/metrics')
      if (!res.ok) throw new Error('Failed')
      return res.json()
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  const { data: leaderboardData } = useQuery<{ leaderboard: LeaderboardEntry[] }>({
    queryKey: ['leaderboard-top10'],
    queryFn: async () => {
      const res = await fetch('/api/leaderboard/list?limit=10&period=all')
      if (!res.ok) throw new Error('Failed')
      return res.json()
    },
    staleTime: 60_000,
    enabled: !!eligibility?.eligible,
  })

  const { data: apyData, isFetching: apyFetching } = useQuery<{ series: ApyPoint[] }>({
    queryKey: ['apy-history', apyAsset.id, apyAsset.chainId, apyWindow],
    queryFn: async () => {
      const res = await fetch(
        `/api/apy?assetId=${apyAsset.id}&chainId=${apyAsset.chainId}&window=${apyWindow}`
      )
      if (!res.ok) throw new Error('Failed')
      return res.json()
    },
    staleTime: 300_000,
    enabled: !!eligibility?.eligible,
  })

  const isPremium = eligibility?.eligible ?? false
  const metrics = metricsData?.data ?? {}

  const marketList = Object.entries(metrics)
    .map(([id, m]) => ({ id, ...m }))
    .sort((a, b) => b.tvlUsd - a.tvlUsd)

  const totalTvl  = marketList.reduce((s, m) => s + m.tvlUsd, 0)
  const avgUtil   = marketList.length
    ? marketList.reduce((s, m) => s + m.utilizationPct, 0) / marketList.length
    : 0
  const highUtil  = marketList.filter(m => m.utilizationPct > 80).length

  async function handleExport() {
    if (!address) return
    setIsExporting(true)
    try {
      const params = new URLSearchParams({ address })
      if (exportFrom) params.set('from', exportFrom)
      if (exportTo)   params.set('to', exportTo)
      const res = await fetch(`/api/premium/export-csv?${params}`)
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `peridot-export-${new Date().getFullYear()}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setIsExporting(false)
    }
  }

  // ── Not connected ──
  if (!isConnected) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-center px-4">
        <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
          <Star className="w-7 h-7 text-emerald-400" />
        </div>
        <h1 className="text-2xl font-bold">Premium Insights</h1>
        <p className="text-muted-foreground text-sm max-w-xs">
          Connect your wallet to access premium market analytics.
        </p>
        <Link
          href="/connect"
          className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black
            font-semibold text-sm transition-colors"
        >
          Connect Wallet
        </Link>
      </div>
    )
  }

  // ── Checking eligibility ──
  if (eligLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // ── Not premium — upsell ──
  if (!isPremium) {
    return (
      <div className="max-w-2xl mx-auto px-4 pb-24">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-8 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-8 text-center space-y-4"
        >
          <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/10 border border-emerald-500/20
            flex items-center justify-center">
            <Lock className="w-7 h-7 text-emerald-400" />
          </div>
          <h1 className="text-2xl font-bold">Premium Insights</h1>
          <p className="text-muted-foreground text-sm max-w-sm mx-auto">
            Unlock deep market analytics, whale watch, utilization alerts, and yield
            optimization. Reserved for Peridot premium members.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-4">
            {[
              { icon: BarChart3,  label: 'Market Analytics' },
              { icon: TrendingUp, label: 'APY History Charts' },
              { icon: Download,   label: 'Tax / P&L Export' },
              { icon: Trophy,     label: 'Whale Watch' },
            ].map(({ icon: Icon, label }) => (
              <div key={label}
                className="rounded-xl border border-white/8 bg-white/3 p-3 flex flex-col
                  items-center gap-2">
                <Icon className="w-5 h-5 text-emerald-400" />
                <span className="text-xs text-muted-foreground text-center">{label}</span>
              </div>
            ))}
          </div>
          <div className="text-sm text-muted-foreground">
            Supply ≥ <span className="text-foreground font-semibold">$500</span> across Peridot
            markets or reach the{' '}
            <Link href="/app/leaderboard" className="text-emerald-400 hover:underline">
              top 3 leaderboard
            </Link>{' '}
            to qualify automatically.
          </div>
          <Link
            href="/app"
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-500
              hover:bg-emerald-400 text-black font-semibold text-sm transition-colors"
          >
            Start Supplying
            <ArrowUpRight className="w-4 h-4" />
          </Link>
        </motion.div>

        {/* Preview of what's inside (blurred) */}
        <div className="mt-8 space-y-4">
          <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">
            Preview: locked content
          </p>
          <LockedSection title="Market Utilization" description="Live per-market utilization rates and liquidity depth" />
          <LockedSection title="APY History Charts" description="Supply and borrow APY over 7d / 30d / 90d per asset" />
          <LockedSection title="Tax & P&L Export" description="Full transaction history with FIFO interest calculation" />
          <LockedSection title="Whale Watch" description="Top 10 suppliers and borrowers updated in real time" />
        </div>
      </div>
    )
  }

  // ── Premium unlocked ──
  return (
    <div className="max-w-3xl mx-auto px-4 pb-24 space-y-8">

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between pt-2"
      >
        <div>
          <div className="flex items-center gap-2 text-xs text-emerald-400 font-mono uppercase tracking-widest mb-2">
            <Star className="w-3.5 h-3.5" />
            {eligibility?.tier === 'top1' ? '#1 Leaderboard' :
             eligibility?.tier === 'top2' ? '#2 Leaderboard' :
             eligibility?.tier === 'top3' ? '#3 Leaderboard' :
             'Premium Member'}
          </div>
          <h1 className="text-2xl font-bold text-foreground">Premium Insights</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Live market analytics. Updated every 60s.
          </p>
        </div>
        <button
          onClick={() => refetchMetrics()}
          disabled={metricsLoading}
          className="p-2 rounded-lg border border-white/10 hover:border-white/20 text-muted-foreground
            hover:text-foreground transition-colors disabled:opacity-40"
        >
          <RefreshCw className={`w-4 h-4 ${metricsLoading ? 'animate-spin' : ''}`} />
        </button>
      </motion.div>

      {/* Protocol overview */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Protocol TVL', value: fmt(totalTvl), icon: ShieldCheck, accent: true },
          { label: 'Avg Utilization', value: `${avgUtil.toFixed(1)}%`, icon: BarChart3 },
          { label: 'High-Util Markets', value: String(highUtil), icon: Zap,
            accent: highUtil > 0 },
        ].map(({ label, value, icon: Icon, accent }) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`rounded-xl border p-4 flex flex-col gap-1.5
              ${accent
                ? 'bg-emerald-500/5 border-emerald-500/20'
                : 'bg-white/3 border-white/8'
              }`}
          >
            <div className="flex items-center gap-1.5">
              <Icon className={`w-3.5 h-3.5 ${accent ? 'text-emerald-400' : 'text-muted-foreground'}`} />
              <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
            </div>
            <span className={`font-mono text-xl font-bold ${accent ? 'text-emerald-400' : 'text-foreground'}`}>
              {value}
            </span>
          </motion.div>
        ))}
      </div>

      {/* Market utilization table */}
      <section>
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-muted-foreground" />
          Market Utilization
        </h2>
        <div className="rounded-xl border border-white/8 overflow-hidden">
          {metricsLoading ? (
            <div className="p-8 text-center">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground mx-auto" />
            </div>
          ) : marketList.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No market data available.</div>
          ) : (
            marketList.map((m, i) => {
              const label = m.id.toUpperCase().replace(/-/g, ' ')
              return (
                <div
                  key={m.id}
                  className={`px-4 py-3 grid grid-cols-[1fr_auto_auto] gap-4 items-center text-sm
                    ${i !== marketList.length - 1 ? 'border-b border-white/5' : ''}
                    hover:bg-white/3 transition-colors`}
                >
                  <div>
                    <p className="font-medium text-foreground truncate">{label}</p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {fmt(m.liquidityUsd)} liquidity
                    </p>
                  </div>
                  <div className="w-32">
                    <UtilBar pct={m.utilizationPct} />
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-sm font-semibold text-foreground">{fmt(m.tvlUsd)}</p>
                    <p className="text-xs text-muted-foreground">TVL</p>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </section>

      {/* APY History Chart */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
            APY History
          </h2>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Asset picker */}
            <div className="relative">
              <select
                value={apyAsset.id}
                onChange={(e) => {
                  const found = APY_ASSETS.find(a => a.id === e.target.value)
                  if (found) setApyAsset(found)
                }}
                className="appearance-none pl-3 pr-7 py-1.5 rounded-lg border border-white/10 bg-white/5
                  text-xs text-foreground focus:outline-none focus:border-white/20 cursor-pointer"
              >
                {APY_ASSETS.map(a => (
                  <option key={a.id} value={a.id}>{a.label}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
            </div>
            {/* Window toggle */}
            <div className="flex rounded-lg border border-white/10 overflow-hidden">
              {APY_WINDOWS.map(w => (
                <button
                  key={w}
                  onClick={() => setApyWindow(w)}
                  className={`px-2.5 py-1.5 text-xs font-mono transition-colors
                    ${apyWindow === w
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'text-muted-foreground hover:text-foreground bg-transparent'
                    }`}
                >
                  {w}
                </button>
              ))}
            </div>
            {/* Borrow toggle */}
            <button
              onClick={() => setShowBorrow(v => !v)}
              className={`px-2.5 py-1.5 rounded-lg border text-xs font-mono transition-colors
                ${showBorrow
                  ? 'border-red-400/30 text-red-400 bg-red-400/10'
                  : 'border-white/10 text-muted-foreground'
                }`}
            >
              Borrow
            </button>
          </div>
        </div>
        <div className="rounded-xl border border-white/8 bg-white/2 p-4 relative">
          {apyFetching && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-xl z-10">
              <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
            </div>
          )}
          <ApyHistoryChart
            data={apyData?.series ?? []}
            showBorrow={showBorrow}
            showPeridot={false}
            height={220}
          />
        </div>
      </section>

      {/* Tax / P&L Export */}
      <section>
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
          <Download className="w-4 h-4 text-muted-foreground" />
          Tax &amp; P&amp;L Export
        </h2>
        <div className="rounded-xl border border-white/8 bg-white/2 p-5 space-y-4">
          <p className="text-xs text-muted-foreground">
            Download a full CSV with transaction history, current positions, and FIFO interest
            earned. Useful for tax reporting. Leave dates blank to export all time.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">From date</label>
              <input
                type="date"
                value={exportFrom}
                onChange={(e) => setExportFrom(e.target.value)}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs
                  text-foreground focus:outline-none focus:border-white/20 [color-scheme:dark]"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">To date</label>
              <input
                type="date"
                value={exportTo}
                onChange={(e) => setExportTo(e.target.value)}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs
                  text-foreground focus:outline-none focus:border-white/20 [color-scheme:dark]"
              />
            </div>
          </div>
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500
              hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed
              text-black font-semibold text-sm transition-colors"
          >
            {isExporting ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
            ) : (
              <><Download className="w-4 h-4" /> Download CSV</>
            )}
          </button>
        </div>
      </section>

      {/* Whale watch */}
      <section>
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
          <Trophy className="w-4 h-4 text-muted-foreground" />
          Top Earners
        </h2>
        <div className="rounded-xl border border-white/8 overflow-hidden">
          {!leaderboardData ? (
            <div className="p-6 text-center">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground mx-auto" />
            </div>
          ) : (
            leaderboardData.leaderboard.slice(0, 10).map((u, i) => (
              <div
                key={u.wallet_address}
                className={`px-4 py-3 flex items-center gap-3 text-sm
                  ${i !== 9 ? 'border-b border-white/5' : ''}
                  hover:bg-white/3 transition-colors`}
              >
                <span className={`font-mono text-xs w-5 text-right font-bold shrink-0
                  ${i === 0 ? 'text-amber-400' : i === 1 ? 'text-slate-300' : i === 2 ? 'text-amber-700' : 'text-muted-foreground'}`}>
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-foreground truncate">
                      {u.username || shortAddr(u.wallet_address)}
                    </span>
                    {u.isPremium && (
                      <span className="text-[10px] text-emerald-400 border border-emerald-400/30
                        px-1.5 py-0.5 rounded-full shrink-0">
                        ✦ premium
                      </span>
                    )}
                  </div>
                </div>
                <span className="font-mono text-xs font-semibold text-foreground shrink-0">
                  {Number(u.total_points).toLocaleString()} pts
                </span>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Yield optimizer — coming soon */}
      <section>
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-muted-foreground" />
          Yield Optimizer
          <span className="text-[10px] text-muted-foreground border border-white/10 px-2 py-0.5 rounded-full">
            Coming soon
          </span>
        </h2>
        <div className="rounded-xl border border-white/8 bg-white/2 p-6 text-center">
          <Zap className="w-8 h-8 text-muted-foreground mx-auto mb-3 opacity-40" />
          <p className="text-sm text-muted-foreground">
            AI-powered yield routing across Peridot markets. Allocates your capital
            to maximize risk-adjusted APY. Launching next quarter.
          </p>
        </div>
      </section>

      {/* Claim boost reminder */}
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-5 py-4
        flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-foreground">
            You have a <span className="text-emerald-400">+{eligibility?.boostPct}% boost</span> active
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Applied to your MERKL earnings each epoch. Paid in USDC.
          </p>
        </div>
        <Link
          href="/claim"
          className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-500
            hover:bg-emerald-400 text-black font-semibold text-xs transition-colors"
        >
          Claim
          <ArrowUpRight className="w-3.5 h-3.5" />
        </Link>
      </div>

    </div>
  )
}

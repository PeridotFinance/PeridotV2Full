'use client'

import { useMemo, useState } from 'react'
import {
  TrendingUp,
  Shield,
  AlertTriangle,
  Flame,
  Sparkles,
  ArrowDownToLine,
  Banknote,
  BarChart3,
  Info,
  Gauge,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatRate, formatUsdCompact } from '@/lib/agents/format'
import type { PoolInfo } from '@/types/agents'
import { RowContextMenu, type ContextMenuGroup } from '@/components/agents/RowContextMenu'

interface PoolTableBlockProps {
  pools: PoolInfo[]
  title?: string
  sortBy?: 'apy' | 'tvl' | 'risk'
}

type SortKey = 'apy' | 'asset' | 'risk' | 'tvl'

const RISK_META: Record<
  PoolInfo['riskTier'],
  { label: string; tone: string; Icon: LucideIcon }
> = {
  low: {
    label: 'Stable',
    tone: 'text-emerald-600 bg-emerald-500/10 border-emerald-500/25',
    Icon: Shield,
  },
  medium: {
    label: 'Blue chip',
    tone: 'text-sky-600 bg-sky-500/10 border-sky-500/25',
    Icon: AlertTriangle,
  },
  high: {
    label: 'Higher risk',
    tone: 'text-rose-600 bg-rose-500/10 border-rose-500/25',
    Icon: Flame,
  },
}

const ASSET_COLORS: Record<string, string> = {
  USDC: 'bg-blue-500/15 text-blue-600 border-blue-500/25',
  USDT: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/25',
  DAI: 'bg-amber-500/15 text-amber-600 border-amber-500/25',
  AUSD: 'bg-amber-500/15 text-amber-600 border-amber-500/25',
  ETH: 'bg-indigo-500/15 text-indigo-600 border-indigo-500/25',
  WETH: 'bg-indigo-500/15 text-indigo-600 border-indigo-500/25',
  BTC: 'bg-orange-500/15 text-orange-600 border-orange-500/25',
  WBTC: 'bg-orange-500/15 text-orange-600 border-orange-500/25',
  BTCB: 'bg-orange-500/15 text-orange-600 border-orange-500/25',
  BNB: 'bg-yellow-500/15 text-yellow-600 border-yellow-500/25',
  WBNB: 'bg-yellow-500/15 text-yellow-600 border-yellow-500/25',
  MON: 'bg-violet-500/15 text-violet-600 border-violet-500/25',
  GMON: 'bg-violet-500/15 text-violet-600 border-violet-500/25',
  LINK: 'bg-sky-500/15 text-sky-600 border-sky-500/25',
}

// Earn-rate pill color graded by magnitude. Subtle when low so the row doesn't
// scream at the user; vivid mint when the rate is genuinely standout.
function apyTone(apy: number): string {
  if (apy >= 10) return 'text-emerald-600 bg-emerald-500/15 border-emerald-500/30'
  if (apy >= 5) return 'text-emerald-600/90 bg-emerald-500/8 border-emerald-500/20'
  if (apy > 0) return 'text-foreground/80 bg-muted/40 border-border/40'
  return 'text-muted-foreground bg-muted/30 border-border/30'
}

/**
 * Same asset on multiple chains collapses to one row showing the best rate.
 * Hides chain info from the user (per the no-chain-leak rule) and prevents
 * confusing duplicate "USDC" entries.
 */
function aggregateByAsset(pools: PoolInfo[]): PoolInfo[] {
  const map = new Map<string, PoolInfo>()
  for (const p of pools) {
    const key = p.assetSymbol.toUpperCase()
    const existing = map.get(key)
    const cur = p.liveApy ?? 0
    const ex = existing?.liveApy ?? 0
    if (!existing || cur > ex) map.set(key, p)
  }
  return [...map.values()]
}

const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: 'apy', label: 'Earn rate' },
  { key: 'asset', label: 'Asset' },
  { key: 'risk', label: 'Risk' },
  { key: 'tvl', label: 'Pool size' },
]

export function PoolTableBlock({ pools, title, sortBy = 'apy' }: PoolTableBlockProps) {
  const unique = useMemo(() => aggregateByAsset(pools), [pools])
  const initialSort: SortKey = sortBy === 'risk' || sortBy === 'tvl' ? sortBy : 'apy'
  const [sortField, setSortField] = useState<SortKey>(initialSort)

  const sorted = useMemo(() => {
    const arr = [...unique]
    arr.sort((a, b) => {
      if (sortField === 'asset') return a.assetSymbol.localeCompare(b.assetSymbol)
      if (sortField === 'risk') {
        const order = { low: 0, medium: 1, high: 2 }
        return order[a.riskTier] - order[b.riskTier]
      }
      if (sortField === 'tvl') return Number(b.tvl ?? 0) - Number(a.tvl ?? 0)
      // apy descending
      return (b.liveApy ?? 0) - (a.liveApy ?? 0)
    })
    return arr
  }, [unique, sortField])

  const topApy = useMemo(
    () => Math.max(0, ...sorted.map((p) => p.liveApy ?? 0)),
    [sorted],
  )

  // Filter out the TVL chip when no pool has TVL data — never show a control
  // that does nothing.
  const showTvlOption = useMemo(
    () => sorted.some((p) => Number(p.tvl ?? 0) > 0),
    [sorted],
  )

  return (
    <div className="rounded-2xl border border-border/60 bg-gradient-to-br from-primary/5 via-background to-background overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40">
        <span
          className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"
          style={{ boxShadow: '0 0 10px rgba(16, 185, 129, 0.7)' }}
          aria-label="Live"
        />
        <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground/70 truncate">
          {title ?? 'Pools'}
        </div>
        <div className="ml-auto text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground/60">
          {sorted.length} {sorted.length === 1 ? 'pool' : 'pools'}
        </div>
      </div>

      {/* Sort chips */}
      {sorted.length > 1 && (
        <div className="flex flex-wrap gap-1.5 px-3 py-2 border-b border-border/40">
          {SORT_OPTIONS.filter((o) => o.key !== 'tvl' || showTvlOption).map(
            (opt) => {
              const isActive = sortField === opt.key
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setSortField(opt.key)}
                  className={cn(
                    'px-2.5 py-1 rounded-full text-[10px] font-mono uppercase tracking-[0.12em] border transition-colors',
                    isActive
                      ? 'bg-primary/10 text-primary border-primary/30'
                      : 'bg-muted/30 text-muted-foreground border-transparent hover:text-foreground',
                  )}
                >
                  {opt.label}
                </button>
              )
            },
          )}
        </div>
      )}

      {/* Pool rows */}
      {sorted.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">
          No pools matched.
        </div>
      ) : (
        <ul className="max-h-[420px] overflow-y-auto divide-y divide-border/30">
          {sorted.map((pool) => (
            <PoolRow key={pool.id} pool={pool} isTop={(pool.liveApy ?? 0) === topApy && topApy > 0} />
          ))}
        </ul>
      )}
    </div>
  )
}

function poolMenuGroups(pool: PoolInfo): ContextMenuGroup[] {
  const sym = pool.assetSymbol.toUpperCase()
  const isStable = ['USDC', 'USDT', 'DAI', 'AUSD', 'BUSD', 'USDD'].includes(sym)
  return [
    {
      label: 'Quick actions',
      items: [
        {
          label: `Deposit ${sym}`,
          icon: ArrowDownToLine,
          prompt: `I'd like to deposit some ${sym}.`,
        },
        ...(isStable
          ? []
          : [
              {
                label: `Borrow against ${sym}`,
                icon: Banknote,
                prompt: `What can I borrow if I use ${sym} as backing?`,
              },
            ]),
      ],
    },
    {
      label: 'Info',
      items: [
        {
          label: 'Pool size & utilization',
          icon: BarChart3,
          prompt: `Show me the pool size and utilization for ${sym}.`,
        },
        {
          label: 'Compare across other pools',
          icon: Gauge,
          prompt: `Compare ${sym} to other pools with similar risk.`,
        },
      ],
    },
    {
      label: 'About',
      items: [
        {
          label: `What is ${sym}?`,
          icon: Info,
          prompt: `Explain what ${sym} is and who issues it.`,
        },
      ],
    },
  ]
}

function PoolRow({ pool, isTop }: { pool: PoolInfo; isTop: boolean }) {
  const sym = pool.assetSymbol.toUpperCase()
  const risk = RISK_META[pool.riskTier]
  const RiskIcon = risk.Icon
  const assetColor =
    ASSET_COLORS[sym] ?? 'bg-muted text-muted-foreground border-border/40'
  const apy = pool.liveApy ?? 0
  const tvlNum = Number(pool.tvl ?? 0)

  return (
    <li>
      <RowContextMenu
        title={pool.riskTier === 'high' ? sym : `${sym} · ${risk.label}`}
        groups={poolMenuGroups(pool)}
      >
        <div
          role="button"
          tabIndex={0}
          className="group w-full flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 focus:bg-muted/30 focus:outline-none transition-colors data-[state=open]:bg-muted/40"
        >
          {/* Asset chip */}
          <div
            className={cn(
              'w-10 h-10 rounded-xl flex items-center justify-center border font-semibold font-inter text-sm shrink-0',
              assetColor,
            )}
          >
            {sym.slice(0, 1)}
          </div>

          {/* Body */}
          <div className="min-w-0 flex-1 text-left">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm font-inter">{sym}</span>
              {/* Skip the pill for high-risk assets — the absence of a label
                  is the signal. The previous "Higher risk" rose-red pill felt
                  accusatory and added visual noise; positive labels for
                  stable / blue-chip still earn their pill. */}
              {pool.riskTier !== 'high' && (
                <span
                  className={cn(
                    'flex items-center gap-1 text-[10px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded-full border',
                    risk.tone,
                  )}
                >
                  <RiskIcon className="w-2.5 h-2.5" />
                  {risk.label}
                </span>
              )}
              {pool.isPeridot && (
                <span className="text-[9px] uppercase tracking-[0.14em] font-semibold text-primary/70">
                  Peridot
                </span>
              )}
            </div>
            {tvlNum > 0 && (
              <div className="text-[10px] text-muted-foreground/70 font-mono mt-0.5 tabular-nums">
                {formatUsdCompact(tvlNum)} pool size
              </div>
            )}
          </div>

          {/* APY pill */}
          <div className="flex items-center gap-1.5 shrink-0">
            {isTop && (
              <Sparkles className="w-3.5 h-3.5 text-emerald-500" aria-label="Top rate" />
            )}
            <div
              className={cn(
                'flex items-center gap-1 px-2.5 py-1 rounded-lg border font-mono text-sm font-semibold tabular-nums',
                apyTone(apy),
              )}
            >
              {apy > 0 && <TrendingUp className="w-3 h-3" />}
              {formatRate(pool.liveApy)}
            </div>
          </div>
        </div>
      </RowContextMenu>
    </li>
  )
}

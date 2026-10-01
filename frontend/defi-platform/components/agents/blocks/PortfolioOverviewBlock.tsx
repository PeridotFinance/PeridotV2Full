'use client'

import {
  TrendingUp,
  Wallet,
  MoreHorizontal,
  History,
  RefreshCw,
  Shield,
  Sparkles,
  Info,
  ArrowDownToLine,
  ArrowUpFromLine,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  formatUsd,
  formatUsdCompact,
  formatRate,
} from '@/lib/agents/format'
import type { PortfolioBreakdownEntry } from '@/types/agents'
import { RowContextMenu, type ContextMenuGroup } from '@/components/agents/RowContextMenu'

interface PortfolioOverviewBlockProps {
  totalDepositedUsd: number
  totalBorrowedUsd: number
  netEarnRate: number
  positionCount: number
  breakdown: PortfolioBreakdownEntry[]
  idleUsd?: number
  idleAssetCount?: number
}

// Asset → bar color. Falls back to the rotating palette when unknown so we
// never render two adjacent slices in the exact same color.
const ASSET_COLORS: Record<string, string> = {
  USDC: 'bg-blue-500',
  USDT: 'bg-emerald-500',
  DAI: 'bg-amber-500',
  ETH: 'bg-indigo-500',
  WETH: 'bg-indigo-500',
  BTC: 'bg-orange-500',
  WBTC: 'bg-orange-500',
  BNB: 'bg-yellow-500',
  MON: 'bg-violet-500',
}

const FALLBACK_COLORS = [
  'bg-primary',
  'bg-pink-500',
  'bg-cyan-500',
  'bg-rose-500',
  'bg-teal-500',
]

function colorFor(symbol: string, idx: number): string {
  return ASSET_COLORS[symbol.toUpperCase()] ?? FALLBACK_COLORS[idx % FALLBACK_COLORS.length]
}

const PORTFOLIO_MENU_GROUPS: ContextMenuGroup[] = [
  {
    label: 'Find',
    items: [
      {
        label: 'Find better rates for me',
        icon: Sparkles,
        prompt: 'Look at my current portfolio and tell me where I could earn more.',
      },
      {
        label: 'Show transaction history',
        icon: History,
        prompt: 'Show me my recent activity on Peridot.',
      },
    ],
  },
  {
    label: 'Check',
    items: [
      {
        label: 'Run a rebalance check',
        icon: RefreshCw,
        prompt: 'Run a rebalance check against my last strategy and tell me what to adjust.',
      },
      {
        label: 'Check liquidation risk',
        icon: Shield,
        prompt: 'Check whether any of my loans are close to liquidation.',
      },
    ],
  },
]

function assetMenuGroups(symbol: string): ContextMenuGroup[] {
  const sym = symbol.toUpperCase()
  return [
    {
      label: 'Manage',
      items: [
        {
          label: `Add more ${sym}`,
          icon: ArrowDownToLine,
          prompt: `I want to deposit more ${sym}.`,
        },
        {
          label: `Withdraw some of my ${sym}`,
          icon: ArrowUpFromLine,
          prompt: `Help me withdraw part of my ${sym} deposit.`,
        },
      ],
    },
    {
      label: 'Info',
      items: [
        {
          label: `Earn rate for ${sym}`,
          icon: TrendingUp,
          prompt: `What's the current earn rate for ${sym}?`,
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

export function PortfolioOverviewBlock({
  totalDepositedUsd,
  totalBorrowedUsd,
  netEarnRate,
  positionCount,
  breakdown,
  idleUsd,
  idleAssetCount,
}: PortfolioOverviewBlockProps) {
  const hasLoans = totalBorrowedUsd > 0
  const hasIdle = (idleUsd ?? 0) > 0
  const sortedBreakdown = [...breakdown].sort((a, b) => b.valueUsd - a.valueUsd)

  return (
    <div className="rounded-2xl border border-border/60 bg-gradient-to-br from-primary/5 via-background to-background overflow-hidden shadow-sm">
      {/* Hero row: total deposited + earn rate + kebab menu */}
      <div className="px-5 pt-5 pb-4 flex items-end justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-inter font-semibold">
            Your money
          </div>
          <div className="text-3xl sm:text-4xl font-bold font-inter tracking-tight">
            {formatUsdCompact(totalDepositedUsd)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {netEarnRate > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-green-500/10 border border-green-500/20 text-green-600">
              <TrendingUp className="w-3.5 h-3.5" />
              <span className="text-sm font-semibold font-mono">
                {formatRate(netEarnRate)} / year
              </span>
            </div>
          )}
          <RowContextMenu title="Portfolio actions" groups={PORTFOLIO_MENU_GROUPS}>
            <button
              type="button"
              aria-label="Portfolio actions"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 focus:bg-muted/50 focus:outline-none transition-colors data-[state=open]:bg-muted/60 data-[state=open]:text-foreground"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </RowContextMenu>
        </div>
      </div>

      {/* Breakdown bar */}
      {sortedBreakdown.length > 0 && totalDepositedUsd > 0 && (
        <div className="px-5 pb-3 space-y-2">
          <div className="flex h-2.5 rounded-full overflow-hidden gap-0.5 bg-muted/30">
            {sortedBreakdown.map((entry, i) => (
              <div
                key={entry.assetSymbol}
                className={cn('h-full', colorFor(entry.assetSymbol, i))}
                style={{ width: `${entry.percentage}%` }}
                title={`${entry.assetSymbol} · ${formatUsd(entry.valueUsd)} (${entry.percentage.toFixed(0)}%)`}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-1 gap-y-1 text-[11px] text-muted-foreground">
            {sortedBreakdown.map((entry, i) => (
              <RowContextMenu
                key={entry.assetSymbol}
                title={`${entry.assetSymbol} · ${entry.percentage.toFixed(0)}% of portfolio`}
                groups={assetMenuGroups(entry.assetSymbol)}
              >
                <button
                  type="button"
                  className="group flex items-center gap-1.5 px-1.5 py-0.5 rounded-md hover:bg-muted/50 focus:bg-muted/50 focus:outline-none transition-colors data-[state=open]:bg-muted/60"
                >
                  <span className={cn('w-2 h-2 rounded-full', colorFor(entry.assetSymbol, i))} />
                  <span className="font-medium text-foreground/80 group-hover:text-foreground transition-colors">{entry.assetSymbol}</span>
                  <span>{entry.percentage.toFixed(0)}%</span>
                </button>
              </RowContextMenu>
            ))}
          </div>
        </div>
      )}

      {/* Footer stats */}
      <div className="px-5 py-3 border-t border-border/30 bg-muted/20 flex items-center justify-between gap-4 flex-wrap text-xs">
        <div className="flex items-center gap-4 text-muted-foreground">
          <span>
            <span className="font-semibold text-foreground">{positionCount}</span>{' '}
            {positionCount === 1 ? 'position' : 'positions'}
          </span>
          {hasLoans && (
            <span>
              Loans <span className="font-semibold text-foreground font-mono">{formatUsd(totalBorrowedUsd)}</span>
            </span>
          )}
        </div>
        {hasIdle && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Wallet className="w-3.5 h-3.5" />
            <span>
              Idle <span className="font-semibold text-foreground font-mono">{formatUsd(idleUsd!)}</span>
              {idleAssetCount && idleAssetCount > 0 && (
                <span> · {idleAssetCount} {idleAssetCount === 1 ? 'asset' : 'assets'}</span>
              )}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

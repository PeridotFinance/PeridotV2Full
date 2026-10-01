'use client'

import {
  ArrowDownLeft,
  ArrowUpRight,
  Wallet,
  ArrowDownToLine,
  ArrowUpFromLine,
  Banknote,
  Undo2,
  Shield,
  TrendingUp,
  Info,
  Coins,
  Repeat,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatUsd, formatRate } from '@/lib/agents/format'
import type { PositionKind } from '@/types/agents'
import { RowContextMenu, type ContextMenuGroup } from '@/components/agents/RowContextMenu'

interface PositionCardBlockProps {
  assetSymbol: string
  kind: PositionKind
  valueUsd: number
  earnRate?: number
  subtitle?: string
}

const ASSET_COLORS: Record<string, string> = {
  USDC: 'bg-blue-500/15 text-blue-600 border-blue-500/20',
  USDT: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/20',
  DAI: 'bg-amber-500/15 text-amber-600 border-amber-500/20',
  ETH: 'bg-indigo-500/15 text-indigo-600 border-indigo-500/20',
  WETH: 'bg-indigo-500/15 text-indigo-600 border-indigo-500/20',
  BTC: 'bg-orange-500/15 text-orange-600 border-orange-500/20',
  WBTC: 'bg-orange-500/15 text-orange-600 border-orange-500/20',
  BNB: 'bg-yellow-500/15 text-yellow-600 border-yellow-500/20',
  MON: 'bg-violet-500/15 text-violet-600 border-violet-500/20',
}

const KIND_META: Record<
  PositionKind,
  { Icon: typeof ArrowUpRight; label: string; rateColor: string; rateLabel: string }
> = {
  deposit: {
    Icon: ArrowUpRight,
    label: 'Earning',
    rateColor: 'text-green-600',
    rateLabel: '/ year',
  },
  loan: {
    Icon: ArrowDownLeft,
    label: 'Loan',
    rateColor: 'text-amber-600',
    rateLabel: '/ year',
  },
  idle: {
    Icon: Wallet,
    label: 'Idle',
    rateColor: 'text-muted-foreground',
    rateLabel: '',
  },
}

function defaultSubtitle(kind: PositionKind, rate?: number): string {
  if (kind === 'deposit') {
    return rate && rate > 0 ? `Earning ${formatRate(rate)} per year` : 'Earning'
  }
  if (kind === 'loan') {
    return rate && rate > 0 ? `${formatRate(rate)} interest per year` : 'Outstanding loan'
  }
  return 'Sitting in your wallet'
}

const STABLECOIN_SET = new Set(['USDC', 'USDT', 'DAI', 'AUSD', 'BUSD', 'USDD'])

function positionMenuGroups(
  kind: PositionKind,
  symbol: string,
): ContextMenuGroup[] {
  const sym = symbol.toUpperCase()
  const isStable = STABLECOIN_SET.has(sym)

  if (kind === 'deposit') {
    return [
      {
        label: 'Manage',
        items: [
          {
            label: `Withdraw all my ${sym}`,
            icon: ArrowUpFromLine,
            prompt: `Withdraw all my ${sym} from Peridot.`,
          },
          {
            label: 'Withdraw some',
            icon: ArrowUpFromLine,
            prompt: `I'd like to withdraw part of my ${sym} deposit.`,
          },
          {
            label: `Deposit more ${sym}`,
            icon: ArrowDownToLine,
            prompt: `I want to add more ${sym} to my deposit.`,
          },
        ],
      },
      {
        label: 'Info',
        items: [
          {
            label: 'How much have I earned?',
            icon: TrendingUp,
            prompt: `How much have I earned on my ${sym} deposit so far?`,
          },
          {
            label: 'Show current earn rate',
            icon: Coins,
            prompt: `What's the current earn rate for ${sym}, and how does it break down?`,
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

  if (kind === 'loan') {
    return [
      {
        label: 'Manage',
        items: [
          {
            label: `Pay back all my ${sym} loan`,
            icon: Undo2,
            prompt: `Pay back my entire ${sym} loan.`,
          },
          {
            label: 'Pay back some',
            icon: Undo2,
            prompt: `I'd like to pay back part of my ${sym} loan.`,
          },
          {
            label: 'Add more backing',
            icon: Shield,
            prompt: `I want to add more backing to make my ${sym} loan safer. What do you suggest?`,
          },
        ],
      },
      {
        label: 'Info',
        items: [
          {
            label: 'How safe is this loan?',
            icon: Shield,
            prompt: `How close is my ${sym} loan to liquidation? Walk me through the health.`,
          },
          {
            label: 'What has it cost me?',
            icon: Banknote,
            prompt: `How much interest has my ${sym} loan cost me so far?`,
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

  // idle — funds sitting in the wallet, not deposited yet
  return [
    {
      label: 'Put it to work',
      items: [
        {
          label: `Deposit all my ${sym} to earn`,
          icon: ArrowDownToLine,
          prompt: `Deposit all my idle ${sym} into the best Peridot pool.`,
        },
        {
          label: 'Deposit some',
          icon: ArrowDownToLine,
          prompt: `I'd like to deposit part of my idle ${sym}.`,
        },
        ...(isStable
          ? []
          : [
              {
                label: `Convert ${sym} to a stablecoin`,
                icon: Repeat,
                prompt: `Convert my ${sym} to a stablecoin so I can earn a steady rate.`,
              },
            ]),
      ],
    },
    {
      label: 'Info',
      items: [
        {
          label: `Best rate for ${sym} right now`,
          icon: TrendingUp,
          prompt: `What's the best earn rate for ${sym} right now across Peridot?`,
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

const KIND_TITLE: Record<PositionKind, string> = {
  deposit: 'Deposit',
  loan: 'Loan',
  idle: 'In your wallet',
}

export function PositionCardBlock({
  assetSymbol,
  kind,
  valueUsd,
  earnRate,
  subtitle,
}: PositionCardBlockProps) {
  const meta = KIND_META[kind]
  const symbolUpper = assetSymbol.toUpperCase()
  const iconClass =
    ASSET_COLORS[symbolUpper] ?? 'bg-muted text-muted-foreground border-border/40'
  const initial = symbolUpper.slice(0, 1)
  const sub = subtitle ?? defaultSubtitle(kind, earnRate)

  return (
    <RowContextMenu
      title={`${symbolUpper} · ${KIND_TITLE[kind]}`}
      groups={positionMenuGroups(kind, symbolUpper)}
    >
      <div
        role="button"
        tabIndex={0}
        className={cn(
          'rounded-2xl border bg-background px-4 py-3 flex items-center gap-3 cursor-pointer transition-colors',
          'hover:bg-muted/20 focus:bg-muted/20 focus:outline-none focus:ring-2 focus:ring-primary/20',
          'data-[state=open]:bg-muted/30 data-[state=open]:border-primary/30',
          kind === 'idle' ? 'border-border/40 opacity-95' : 'border-border/60',
        )}
      >
        {/* Asset chip */}
        <div
          className={cn(
            'w-10 h-10 rounded-xl flex items-center justify-center border font-semibold font-inter text-sm shrink-0',
            iconClass,
          )}
        >
          {initial}
        </div>

        {/* Body */}
        <div className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm font-inter">{symbolUpper}</span>
            {kind !== 'deposit' && (
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                {meta.label}
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground truncate">{sub}</div>
        </div>

        {/* Value + rate */}
        <div className="text-right shrink-0">
          <div className="font-semibold font-mono text-sm">{formatUsd(valueUsd)}</div>
          {kind !== 'idle' && earnRate != null && earnRate > 0 && (
            <div className={cn('text-[11px] font-mono', meta.rateColor)}>
              {formatRate(earnRate)}
            </div>
          )}
        </div>
      </div>
    </RowContextMenu>
  )
}

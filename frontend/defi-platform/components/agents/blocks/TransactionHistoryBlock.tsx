'use client'

import { useMemo, useState } from 'react'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Banknote,
  Undo2,
  ExternalLink,
  TrendingUp,
  Shield,
  History,
  Info,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatUsd } from '@/lib/agents/format'
import type {
  TransactionAction,
  TransactionEntry,
} from '@/types/agents'
import { RowContextMenu, type ContextMenuGroup } from '@/components/agents/RowContextMenu'

interface TransactionHistoryBlockProps {
  walletShort?: string
  entries: TransactionEntry[]
  totalAvailable?: number
}

type FilterKey = 'all' | TransactionAction

const ACTION_META: Record<
  TransactionAction,
  { label: string; verb: string; Icon: LucideIcon; tone: string }
> = {
  supply: {
    label: 'Deposits',
    verb: 'Deposited',
    Icon: ArrowDownToLine,
    // Peridot mint — earning energy in.
    tone: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/25',
  },
  redeem: {
    label: 'Withdrawals',
    verb: 'Withdrew',
    Icon: ArrowUpFromLine,
    tone: 'text-sky-500 bg-sky-500/10 border-sky-500/25',
  },
  borrow: {
    label: 'Borrows',
    verb: 'Borrowed',
    Icon: Banknote,
    tone: 'text-amber-500 bg-amber-500/10 border-amber-500/25',
  },
  repay: {
    label: 'Repaid',
    verb: 'Paid back',
    Icon: Undo2,
    tone: 'text-violet-500 bg-violet-500/10 border-violet-500/25',
  },
}

const FILTER_ORDER: FilterKey[] = ['all', 'supply', 'redeem', 'borrow', 'repay']

function formatRelative(iso: string): string {
  const then = Date.parse(iso)
  if (!Number.isFinite(then)) return ''
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  const m = Math.round(seconds / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 30) return `${d}d ago`
  // Fallback to short date for older entries — keeps width predictable.
  try {
    return new Date(then).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

export function TransactionHistoryBlock({
  walletShort,
  entries,
  totalAvailable,
}: TransactionHistoryBlockProps) {
  const [filter, setFilter] = useState<FilterKey>('all')

  // Per-filter counts so chip labels can show "Deposits · 12" without an extra render.
  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = {
      all: entries.length, supply: 0, borrow: 0, repay: 0, redeem: 0,
    }
    for (const e of entries) c[e.action] += 1
    return c
  }, [entries])

  const visible = useMemo(() => {
    return filter === 'all' ? entries : entries.filter((e) => e.action === filter)
  }, [entries, filter])

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
          Activity {walletShort && (
            <span className="ml-1.5 text-foreground/80 font-semibold">{walletShort}</span>
          )}
        </div>
        <div className="ml-auto text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground/60">
          {entries.length}
          {totalAvailable && totalAvailable > entries.length
            ? ` of ${totalAvailable}`
            : ''}
        </div>
      </div>

      {/* Filters */}
      {entries.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-3 py-2 border-b border-border/40">
          {FILTER_ORDER.map((key) => {
            const isActive = filter === key
            const count = counts[key]
            if (key !== 'all' && count === 0) return null
            const label = key === 'all' ? 'All' : ACTION_META[key].label
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono uppercase tracking-[0.12em] border transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary border-primary/30'
                    : 'bg-muted/30 text-muted-foreground border-transparent hover:text-foreground',
                )}
              >
                {label}
                <span className={cn('text-[9px] opacity-60')}>{count}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* List */}
      {visible.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">
          {entries.length === 0
            ? 'No Peridot activity yet.'
            : `No ${ACTION_META[filter as TransactionAction].label.toLowerCase()}.`}
        </div>
      ) : (
        <ul className="max-h-[420px] overflow-y-auto divide-y divide-border/30">
          {visible.map((entry) => (
            <TxRow key={entry.id} entry={entry} />
          ))}
        </ul>
      )}
    </div>
  )
}

function txMenuGroups(entry: TransactionEntry): ContextMenuGroup[] {
  const sym = entry.assetSymbol.toUpperCase()
  const action = entry.action

  const manageItems = (() => {
    if (action === 'supply') {
      return [
        { label: `Deposit more ${sym}`,         icon: ArrowDownToLine, prompt: `I want to deposit more ${sym} on top of this.` },
        { label: `Withdraw some of my ${sym}`,  icon: ArrowUpFromLine, prompt: `Help me withdraw part of my ${sym} deposit.` },
      ]
    }
    if (action === 'redeem') {
      return [
        { label: `Deposit ${sym} again`,        icon: ArrowDownToLine, prompt: `I'd like to deposit ${sym} again.` },
      ]
    }
    if (action === 'borrow') {
      return [
        { label: `Pay back this ${sym} loan`,   icon: Undo2,           prompt: `Help me pay back the ${sym} I borrowed.` },
        { label: 'Add more backing',            icon: Shield,          prompt: `I want to add more backing to make my ${sym} loan safer.` },
      ]
    }
    // repay
    return [
      { label: `Pay back more ${sym}`,          icon: Undo2,           prompt: `Pay back more of my outstanding ${sym} loan.` },
      { label: `Borrow ${sym} again`,           icon: Banknote,        prompt: `Can I borrow ${sym} again? What's the rate?` },
    ]
  })()

  const infoItems: ContextMenuGroup['items'] = [
    {
      label: `Show all my ${sym} activity`,
      icon: History,
      prompt: `Show me all my ${sym} transactions on Peridot.`,
    },
    ...(action === 'borrow' || action === 'repay'
      ? [
          {
            label: 'How safe are my loans?',
            icon: Shield,
            prompt: 'Run a quick liquidation-risk check on my loans.',
          } as const,
        ]
      : [
          {
            label: `Earn rate for ${sym}`,
            icon: TrendingUp,
            prompt: `What's the live earn rate for ${sym} right now?`,
          } as const,
        ]),
  ]

  const aboutItems: ContextMenuGroup['items'] = [
    {
      label: `What is ${sym}?`,
      icon: Info,
      prompt: `Explain what ${sym} is and who issues it.`,
    },
    ...(entry.explorerUrl
      ? [
          {
            label: 'View on block explorer',
            icon: ExternalLink,
            href: entry.explorerUrl,
          } as const,
        ]
      : []),
  ]

  return [
    { label: 'Manage', items: manageItems },
    { label: 'Info', items: infoItems },
    { label: 'About', items: aboutItems },
  ]
}

function TxRow({ entry }: { entry: TransactionEntry }) {
  const meta = ACTION_META[entry.action]
  const Icon = meta.Icon
  const sym = entry.assetSymbol.toUpperCase()
  const sign = entry.action === 'supply' || entry.action === 'repay' ? '+' : '−'
  const signColor =
    entry.action === 'supply' || entry.action === 'repay'
      ? 'text-emerald-500'
      : 'text-muted-foreground'

  return (
    <li>
      <RowContextMenu
        title={`${meta.verb} ${sym}`}
        groups={txMenuGroups(entry)}
      >
        <div
          role="button"
          tabIndex={0}
          className="group w-full flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 focus:bg-muted/30 focus:outline-none transition-colors data-[state=open]:bg-muted/40"
        >
          {/* Action chip */}
          <div
            className={cn(
              'w-9 h-9 rounded-xl flex items-center justify-center border shrink-0',
              meta.tone,
            )}
          >
            <Icon className="w-4 h-4" />
          </div>

          {/* Body */}
          <div className="min-w-0 flex-1 text-left">
            <div className="flex items-baseline gap-2">
              <span className="font-medium text-sm font-inter truncate">
                {meta.verb} {sym}
              </span>
              {entry.isCrossChain && (
                <span className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/25 shrink-0">
                  cross-chain
                </span>
              )}
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/60 shrink-0">
                {formatRelative(entry.timestamp)}
              </span>
            </div>
          </div>

          {/* Amount */}
          <div className="text-right shrink-0">
            <div className="font-mono text-sm font-medium tabular-nums">
              <span className={signColor}>{sign}</span>
              {formatUsd(entry.usdValue)}
            </div>
          </div>
        </div>
      </RowContextMenu>
    </li>
  )
}

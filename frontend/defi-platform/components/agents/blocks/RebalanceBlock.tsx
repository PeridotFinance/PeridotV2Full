'use client'

import {
  TrendingDown,
  TrendingUp,
  RefreshCw,
  ArrowUpFromLine,
  ArrowDownToLine,
  SkipForward,
  Sliders,
  HelpCircle,
  Info,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RebalanceEntry } from '@/types/agents'
import { RowContextMenu, type ContextMenuGroup } from '@/components/agents/RowContextMenu'

interface RebalanceBlockProps {
  entries: RebalanceEntry[]
  totalValueUsd: number
  driftThreshold: number
}

const BAR_COLORS = {
  current: 'bg-muted-foreground/30',
  targetOver: 'bg-red-500/60',      // overweight → needs withdraw
  targetUnder: 'bg-green-500/60',   // underweight → needs supply
}

function formatUsd(value: number): string {
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`
  return `$${value.toFixed(2)}`
}

function entryMenuGroups(entry: RebalanceEntry): ContextMenuGroup[] {
  const sym = entry.asset.toUpperCase()
  const isWithdraw = entry.action === 'withdraw'
  const ActionIcon = isWithdraw ? ArrowUpFromLine : ArrowDownToLine
  const actionVerb = isWithdraw ? 'Withdraw' : 'Deposit more'
  const actionPrompt = isWithdraw
    ? `Withdraw $${entry.amountUsd.toFixed(2)} of ${sym} as part of the rebalance.`
    : `Deposit $${entry.amountUsd.toFixed(2)} of ${sym} to bring the rebalance back in line.`

  return [
    {
      label: 'Apply step',
      items: [
        {
          label: `${actionVerb} ${formatUsd(entry.amountUsd)} of ${sym}`,
          icon: ActionIcon,
          prompt: actionPrompt,
        },
        {
          label: 'Skip this step',
          icon: SkipForward,
          prompt: `Skip the ${sym} rebalance step for now and proceed with the rest.`,
        },
        {
          label: `Adjust the ${sym} target instead`,
          icon: Sliders,
          prompt: `Update my strategy so the ${sym} target matches my current allocation, instead of rebalancing.`,
        },
      ],
    },
    {
      label: 'Info',
      items: [
        {
          label: 'Why is this drift bad?',
          icon: HelpCircle,
          prompt: `Explain why a ${entry.driftPct > 0 ? '+' : ''}${entry.driftPct}% drift on ${sym} matters for my strategy.`,
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

export function RebalanceBlock({
  entries,
  totalValueUsd,
  driftThreshold,
}: RebalanceBlockProps) {
  const maxPct = Math.max(
    ...entries.flatMap((e) => [e.currentPct, e.targetPct]),
    1,
  )

  return (
    <div className="rounded-xl border border-border/60 bg-background overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/40 bg-muted/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <RefreshCw className="w-4 h-4 text-primary" />
          <h4 className="text-xs font-semibold font-inter uppercase tracking-wider text-muted-foreground">
            Rebalance Analysis
          </h4>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>Portfolio: <span className="font-mono font-medium text-foreground">{formatUsd(totalValueUsd)}</span></span>
          <span>Threshold: <span className="font-mono">{driftThreshold}%</span></span>
        </div>
      </div>

      {/* Legend */}
      <div className="px-4 pt-3 pb-1 flex items-center gap-4 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-muted-foreground/30" />
          Current
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-green-500/60" />
          Target (underweight)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-red-500/60" />
          Target (overweight)
        </span>
      </div>

      {/* Entries */}
      <div className="px-2 py-2 space-y-1">
        {entries.map((entry, i) => {
          const isOver = entry.driftPct > 0
          const currentWidth = (entry.currentPct / maxPct) * 100
          const targetWidth = (entry.targetPct / maxPct) * 100

          return (
            <RowContextMenu
              key={i}
              title={`${entry.asset.toUpperCase()} · ${entry.action} ${formatUsd(entry.amountUsd)}`}
              groups={entryMenuGroups(entry)}
            >
              <div
                role="button"
                tabIndex={0}
                className={cn(
                  'group rounded-xl px-2 py-2 space-y-1.5 cursor-pointer transition-colors',
                  'hover:bg-muted/30 focus:bg-muted/30 focus:outline-none',
                  'data-[state=open]:bg-muted/40',
                )}
              >
                {/* Asset header row */}
                <div className="flex items-center justify-between">
                  <span className="font-mono font-medium text-sm">{entry.asset}</span>
                  <div className="flex items-center gap-2 text-xs">
                    <span className={cn(
                      'flex items-center gap-1 font-mono font-semibold',
                      isOver ? 'text-red-500' : 'text-green-500',
                    )}>
                      {isOver ? (
                        <TrendingDown className="w-3 h-3" />
                      ) : (
                        <TrendingUp className="w-3 h-3" />
                      )}
                      {isOver ? '+' : ''}{entry.driftPct}%
                    </span>
                    <span className="text-muted-foreground">
                      → {entry.action} {formatUsd(entry.amountUsd)}
                    </span>
                  </div>
                </div>

                {/* Before/After bars */}
                <div className="space-y-1">
                  {/* Current bar */}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground w-10 text-right font-mono">
                      {entry.currentPct.toFixed(1)}%
                    </span>
                    <div className="flex-1 h-2.5 bg-muted/40 rounded-full overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all', BAR_COLORS.current)}
                        style={{ width: `${currentWidth}%` }}
                      />
                    </div>
                  </div>
                  {/* Target bar */}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground w-10 text-right font-mono">
                      {entry.targetPct.toFixed(1)}%
                    </span>
                    <div className="flex-1 h-2.5 bg-muted/40 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all',
                          isOver ? BAR_COLORS.targetOver : BAR_COLORS.targetUnder,
                        )}
                        style={{ width: `${targetWidth}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </RowContextMenu>
          )
        })}
      </div>

      {/* Summary */}
      <div className="px-4 py-3 border-t border-border/30 bg-muted/20 text-xs text-muted-foreground">
        {entries.length} position{entries.length !== 1 ? 's' : ''} need{entries.length === 1 ? 's' : ''} rebalancing
      </div>
    </div>
  )
}

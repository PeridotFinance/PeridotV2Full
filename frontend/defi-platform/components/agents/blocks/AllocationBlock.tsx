'use client'

import { PieChart, Shield, AlertTriangle, Flame, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AllocationEntry } from '@/types/agents'

interface AllocationBlockProps {
  allocations: AllocationEntry[]
  blendedApy: number
  riskLevel: 'low' | 'medium' | 'high'
  reasoning: string
}

const RISK_ICONS = {
  low: Shield,
  medium: AlertTriangle,
  high: Flame,
}

const RISK_COLORS = {
  low: 'text-green-500',
  medium: 'text-yellow-500',
  high: 'text-red-500',
}

const ALLOCATION_COLORS = [
  'bg-primary',
  'bg-blue-500',
  'bg-purple-500',
  'bg-orange-500',
  'bg-pink-500',
  'bg-cyan-500',
  'bg-yellow-500',
]

const CHAIN_LABELS: Record<number, string> = {
  1: 'Ethereum',
  10: 'Optimism',
  56: 'BSC',
  97: 'BSC Testnet',
  137: 'Polygon',
  143: 'Monad',
  8453: 'Base',
  10143: 'Monad Testnet',
  42161: 'Arbitrum',
  43114: 'Avalanche',
  50312: 'Somnia Testnet',
  56457: 'Stellar',
}

function formatChain(chainId: number): string {
  return CHAIN_LABELS[chainId] ?? `Chain ${chainId}`
}

const PROTOCOL_LABELS: Record<string, string> = {
  peridot: 'Peridot',
  aave_v3: 'Aave',
  aave: 'Aave',
  compound_v3: 'Compound',
  compound: 'Compound',
  curve: 'Curve',
  morpho: 'Morpho',
  yearn: 'Yearn',
  lido: 'Lido',
  rocketpool: 'Rocket Pool',
}

function formatProtocol(protocol: string): string {
  const normalized = protocol.toLowerCase().replace(/[_\s]+/g, '_')
  return PROTOCOL_LABELS[normalized] ?? protocol.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function AllocationBlock({
  allocations,
  blendedApy,
  riskLevel,
  reasoning,
}: AllocationBlockProps) {
  const RiskIcon = RISK_ICONS[riskLevel]

  return (
    <div className="rounded-xl border border-border/60 bg-background overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/40 bg-muted/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PieChart className="w-4 h-4 text-primary" />
          <h4 className="text-xs font-semibold font-inter uppercase tracking-wider text-muted-foreground">
            Strategy Proposal
          </h4>
        </div>
        <div className="flex items-center gap-3">
          <span className={cn('flex items-center gap-1 text-xs', RISK_COLORS[riskLevel])}>
            <RiskIcon className="w-3.5 h-3.5" />
            {riskLevel} risk
          </span>
          <span className="flex items-center gap-1 text-xs font-mono font-semibold text-green-500">
            <TrendingUp className="w-3.5 h-3.5" />
            {blendedApy.toFixed(2)}% APY
          </span>
        </div>
      </div>

      {/* Allocation bar */}
      <div className="px-4 py-3">
        <div className="flex h-3 rounded-full overflow-hidden gap-0.5">
          {allocations.map((alloc, i) => (
            <div
              key={i}
              className={cn('h-full rounded-full', ALLOCATION_COLORS[i % ALLOCATION_COLORS.length])}
              style={{ width: `${alloc.percentage}%` }}
              title={`${alloc.asset} (${alloc.percentage}%)`}
            />
          ))}
        </div>
      </div>

      {/* Allocation details */}
      <div className="px-4 pb-3 space-y-2">
        {allocations.map((alloc, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <div className={cn('w-2.5 h-2.5 rounded-full', ALLOCATION_COLORS[i % ALLOCATION_COLORS.length])} />
              <span className="font-mono font-medium">{alloc.asset}</span>
              <span className="text-muted-foreground text-xs">
                {formatProtocol(alloc.protocol)} · {formatChain(alloc.chainId)}
              </span>
              {alloc.isPeridot && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">
                  PERIDOT
                </span>
              )}
            </div>
            <div className="flex items-center gap-4">
              <span className="text-muted-foreground text-xs font-mono">
                {alloc.percentage.toFixed(1)}%
              </span>
              <span className="font-mono font-semibold text-xs text-green-500">
                {alloc.apy.toFixed(2)}%
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Reasoning */}
      <div className="px-4 py-3 border-t border-border/30 bg-muted/20">
        <p className="text-xs text-muted-foreground leading-relaxed">{reasoning}</p>
      </div>
    </div>
  )
}

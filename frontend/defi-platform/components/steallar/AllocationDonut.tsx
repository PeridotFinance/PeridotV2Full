// FILE: components/steallar/AllocationDonut.tsx
"use client"

import { useMemo, useState, useEffect } from "react"
import { motion } from "framer-motion"
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts"
import { useCrossChainBalances } from "@/hooks/use-cross-chain-balances"
import { useDemoMode } from "@/context/demo-mode"
import { DEMO_POSITIONS } from "@/data/demo-mock"
import { cn } from "@/lib/utils"

// ─── Constants ────────────────────────────────────────────────────────────────

const STABLECOIN_SYMBOLS = new Set(["USDC", "USDT", "DAI", "BUSD", "FRAX", "TUSD"])

// ─── Types ────────────────────────────────────────────────────────────────────

interface Segment {
  name: string
  value: number
  color: string
}

interface AllocationDonutProps {
  isConnected: boolean
  className?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTotal(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`
  if (v >= 1_000) return `$${(v / 1_000).toFixed(2)}K`
  return `$${v.toFixed(2)}`
}

// ─── Internal hook ────────────────────────────────────────────────────────────

function useAllocationData(isConnected: boolean): { segments: Segment[]; total: number } {
  const { isDemoMode } = useDemoMode()
  const { allPositions } = useCrossChainBalances()

  return useMemo(() => {
    let stablecoinValue = 0
    let cryptoValue = 0

    if (isDemoMode || !isConnected) {
      for (const p of DEMO_POSITIONS) {
        if (STABLECOIN_SYMBOLS.has(p.symbol.toUpperCase())) {
          stablecoinValue += p.suppliedValueUSD
        } else {
          cryptoValue += p.suppliedValueUSD
        }
      }
    } else {
      for (const p of allPositions) {
        if (STABLECOIN_SYMBOLS.has(p.symbol.toUpperCase())) {
          stablecoinValue += p.suppliedValueUSD
        } else {
          cryptoValue += p.suppliedValueUSD
        }
      }
    }

    const raw: Segment[] = [
      { name: "Stablecoins", value: stablecoinValue, color: "#10B981" },
      { name: "Crypto", value: cryptoValue, color: "#6366F1" },
    ]

    const segments = raw.filter((s) => s.value > 0)
    const total = stablecoinValue + cryptoValue

    return { segments, total }
  }, [isDemoMode, isConnected, allPositions])
}

// ─── Custom tooltip ────────────────────────────────────────────────────────────

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const { name, value } = payload[0]?.payload ?? {}
  const total = payload[0]?.payload?.total ?? 1
  const pct = total > 0 ? ((value / total) * 100).toFixed(1) : "0"
  return (
    <div className="bg-background border border-foreground/[0.08] rounded-xl px-3 py-2 shadow-lg text-xs min-w-[110px]">
      <p className="text-muted-foreground/80 mb-0.5">{name}</p>
      <p className="font-semibold text-foreground">{formatTotal(value)}</p>
      <p className="text-muted-foreground">{pct}%</p>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AllocationDonut({ isConnected, className }: AllocationDonutProps) {
  const { segments, total } = useAllocationData(isConnected)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // Inject total into each segment for tooltip access
  const chartData = segments.map((s) => ({ ...s, total }))

  const isEmpty = segments.length === 0 || total === 0

  return (
    <motion.div
      data-testid="allocation-donut"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={cn("relative flex flex-col", className)}
    >
      {/* Title */}
      <p className="text-sm font-semibold text-foreground/90 mb-4">Allocation</p>

      {!mounted || isEmpty ? (
        <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground/80">
          {!mounted ? null : "Connect a wallet to see your allocation"}
        </div>
      ) : (
        <>
          {/* Chart with center label */}
          <div className="relative" style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  strokeWidth={2}
                  stroke="#fff"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>

            {/* Center overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-base font-bold text-foreground tabular-nums">
                {formatTotal(total)}
              </span>
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-5 mt-3 flex-wrap">
            {segments.map((seg) => {
              const pct = total > 0 ? ((seg.value / total) * 100).toFixed(0) : "0"
              return (
                <div key={seg.name} className="flex items-center gap-1.5">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: seg.color }}
                  />
                  <span className="text-xs text-foreground/70 font-medium">{seg.name}</span>
                  <span className="text-xs text-muted-foreground/80">{pct}%</span>
                </div>
              )
            })}
          </div>
        </>
      )}
    </motion.div>
  )
}

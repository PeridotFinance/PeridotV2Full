"use client"

import { useState } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Wallet } from "lucide-react"
import { cn } from "@/lib/utils"

interface ChainBalance {
  chainId: number
  chainName: string
  balance: number
  symbol: string
  icon?: string
}

interface ChainBalanceDropdownProps {
  balances: ChainBalance[]
  currentBalance: number
  symbol: string
  valueUsd?: number
  assetPrice?: number
  onSelectChain?: (chainId: number) => void
}

const CHAIN_META: Record<number, { color: string; dot: string }> = {
  56:    { color: "bg-amber-400/15",   dot: "bg-amber-400" },
  1:     { color: "bg-indigo-400/15",  dot: "bg-indigo-400" },
  42161: { color: "bg-sky-400/15",     dot: "bg-sky-400" },
  8453:  { color: "bg-blue-500/15",    dot: "bg-blue-500" },
  137:   { color: "bg-violet-500/15",  dot: "bg-violet-500" },
  43114: { color: "bg-red-500/15",     dot: "bg-red-400" },
  10:    { color: "bg-rose-400/15",    dot: "bg-rose-400" },
  146:   { color: "bg-emerald-400/15", dot: "bg-emerald-400" },
}

const getChainMeta = (chainId: number) =>
  CHAIN_META[chainId] ?? { color: "bg-foreground/5", dot: "bg-foreground/30" }

export function ChainBalanceDropdown({
  balances,
  currentBalance,
  symbol,
  valueUsd,
  assetPrice = 1,
  onSelectChain,
}: ChainBalanceDropdownProps) {
  const [open, setOpen] = useState(false)
  const sortedBalances = [...balances].sort((a, b) => b.balance - a.balance)
  const totalUsd = sortedBalances.reduce((s, b) => s + b.balance * assetPrice, 0)

  const displayValue = typeof valueUsd === "number"
    ? `$${valueUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `${currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${symbol}`

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground/60 hover:text-muted-foreground transition-colors cursor-pointer relative z-50">
          <Wallet className="w-3 h-3" />
          <span className="tabular-nums">{displayValue}</span>
        </button>
      </PopoverTrigger>

      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={10}
        className="w-60 p-0 bg-background border border-foreground/[0.08] rounded-2xl shadow-2xl overflow-hidden z-50"
      >
        {sortedBalances.length === 0 ? (
          <div className="px-5 py-8 text-center space-y-1">
            <p className="text-sm font-semibold text-foreground/40">No balance</p>
            <p className="text-[11px] text-muted-foreground/30 leading-relaxed">
              Fund your wallet to get started
            </p>
          </div>
        ) : (
          <>
            {/* Total hero */}
            <div className="px-5 pt-4 pb-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/40 mb-1">
                Available
              </p>
              <p className="text-2xl font-black tracking-tight text-foreground tabular-nums">
                ${totalUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>

            <div className="mx-4 h-px bg-foreground/[0.06]" />

            {/* Chain rows */}
            <div className="p-2 space-y-px">
              {sortedBalances.map((item) => {
                const meta = getChainMeta(item.chainId)
                const rowUsd = item.balance * assetPrice
                const pct = totalUsd > 0 ? (rowUsd / totalUsd) * 100 : 0

                return (
                  <button
                    key={item.chainId}
                    onClick={() => {
                      onSelectChain?.(item.chainId)
                      setOpen(false)
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-foreground/[0.04] active:bg-foreground/[0.07] transition-colors text-left group"
                  >
                    {/* Chain dot */}
                    <span className={cn("w-2 h-2 rounded-full shrink-0 mt-px", meta.dot)} />

                    {/* Name + bar */}
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold text-foreground/80 group-hover:text-foreground transition-colors truncate leading-none mb-1.5">
                        {item.chainName}
                      </p>
                      <div className="h-[3px] w-full rounded-full bg-foreground/[0.06] overflow-hidden">
                        <div
                          className={cn("h-full rounded-full transition-all", meta.dot, "opacity-60")}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>

                    {/* Amount */}
                    <div className="text-right shrink-0">
                      <p className="text-[13px] font-bold text-foreground tabular-nums leading-none">
                        ${rowUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                      <p className="text-[10px] text-muted-foreground/40 tabular-nums mt-0.5">
                        {item.balance < 0.001 ? "<0.001" : item.balance.toLocaleString(undefined, { maximumFractionDigits: 3 })} {item.symbol}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-foreground/[0.06]">
              <p className="text-[10px] text-muted-foreground/35 leading-relaxed">
                Tap a network to deposit from it
              </p>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}

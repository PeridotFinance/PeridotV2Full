"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

interface SectionCollapsibleProps {
  label: string
  children: React.ReactNode
  defaultOpen?: boolean
  count?: number
  totalUSD?: number
}

function formatShortUSD(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`
  return `$${v.toFixed(0)}`
}

export function SectionCollapsible({
  label,
  children,
  defaultOpen = true,
  count,
  totalUSD,
}: SectionCollapsibleProps) {
  const [open, setOpen] = useState(defaultOpen)

  const showCount = count !== undefined
  const showTotal = totalUSD !== undefined && totalUSD > 0

  return (
    <div data-testid={`section-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      {/* Section header */}
      <button
        data-testid={`section-toggle-${label}`}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between w-full py-3 hover:text-foreground/70 transition-colors cursor-pointer select-none"
      >
        {/* Left side: label + count badge */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground/80 uppercase tracking-widest">
            {label}
          </span>
          {showCount && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-muted text-[10px] font-semibold text-muted-foreground leading-none">
              · {count}
            </span>
          )}
          <motion.span
            animate={{ rotate: open ? 0 : -90 }}
            transition={{ duration: 0.2 }}
            className="inline-flex text-muted-foreground/80"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </motion.span>
        </div>

        {/* Right side: total USD */}
        {showTotal && (
          <span className="text-xs font-semibold text-muted-foreground tabular-nums">
            {formatShortUSD(totalUSD)}
          </span>
        )}
      </button>

      {/* Collapsible rows */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            // Horizontal room for the rows' hover highlight (ROW_HOVER_CLASSES
            // bleeds 16px each side); without it the collapse clip cut the
            // highlight off flush against "Withdraw".
            className="overflow-hidden -mx-4 px-4"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

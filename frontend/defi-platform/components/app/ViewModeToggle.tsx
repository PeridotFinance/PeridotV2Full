"use client"

import { motion } from "framer-motion"
import { useViewMode, type ViewMode } from "@/context/view-mode"
import { cn } from "@/lib/utils"

const SEGMENTS: { value: ViewMode; label: string }[] = [
  { value: "easy", label: "Easy" },
  { value: "expert", label: "Expert" },
]

interface Props {
  /** Compact (icon-height) variant for tight header rows. Default `false`. */
  compact?: boolean
  className?: string
}

/**
 * Segmented pill switch between the Easy (V2) and Expert (V1) surfaces.
 * The sliding indicator uses a shared `layoutId` so Framer Motion morphs it
 * between segments instead of fading two boxes.
 */
export function ViewModeToggle({ compact = false, className }: Props) {
  const { mode, setMode } = useViewMode()

  return (
    <div
      role="tablist"
      aria-label="View mode"
      className={cn(
        "relative inline-flex items-center rounded-full border border-border/40 bg-background/60 backdrop-blur p-0.5",
        compact ? "h-7" : "h-8",
        className
      )}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault()
          const idx = SEGMENTS.findIndex(s => s.value === mode)
          const nextIdx = (idx + (e.key === "ArrowRight" ? 1 : -1) + SEGMENTS.length) % SEGMENTS.length
          setMode(SEGMENTS[nextIdx].value)
        }
      }}
    >
      {SEGMENTS.map((seg) => {
        const isActive = mode === seg.value
        return (
          <button
            key={seg.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-pressed={isActive}
            data-testid={`view-mode-${seg.value}`}
            onClick={() => setMode(seg.value)}
            className={cn(
              "relative z-10 px-3 rounded-full text-[12px] font-semibold tracking-tight transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 cursor-pointer",
              compact ? "h-6" : "h-7",
              isActive
                ? "text-foreground"
                : "text-muted-foreground/70 hover:text-foreground/80"
            )}
          >
            {isActive && (
              <motion.span
                layoutId="view-mode-pill"
                className="absolute inset-0 rounded-full bg-primary/15 shadow-sm"
                transition={{ type: "spring", stiffness: 500, damping: 38, mass: 0.6 }}
              />
            )}
            <span className="relative flex items-center gap-1.5">
              {seg.value === "easy" && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              )}
              {seg.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

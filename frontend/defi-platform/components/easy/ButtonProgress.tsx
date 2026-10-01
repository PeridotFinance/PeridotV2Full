"use client"

import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

// A thin progress hairline pinned to the bottom edge of a button. Colour is
// inherited (`bg-current`) so it adapts to whatever button it sits in — emerald
// fill on the mobile card, foreground fill on the desktop sheet — and stays on
// the right contrast in light + dark. `progress === null` runs an indeterminate
// shimmer (single-chain, too fast to chart); a number animates a determinate
// fill (cross-chain, where we know the stage).
export function ButtonProgress({
  progress,
  className,
}: {
  progress: number | null
  className?: string
}) {
  return (
    <span
      className={cn(
        "pointer-events-none absolute inset-x-3 bottom-1.5 h-[2px] overflow-hidden rounded-full",
        className
      )}
      aria-hidden
    >
      {/* track */}
      <span className="absolute inset-0 bg-current opacity-20" />
      {progress == null ? (
        <motion.span
          className="absolute inset-y-0 w-1/3 rounded-full bg-current opacity-90"
          initial={{ x: "-130%" }}
          animate={{ x: ["-130%", "330%"] }}
          transition={{ duration: 1.1, ease: "easeInOut", repeat: Infinity }}
        />
      ) : (
        <motion.span
          className="absolute inset-y-0 left-0 rounded-full bg-current opacity-90"
          initial={false}
          animate={{ width: `${Math.max(8, Math.min(100, progress * 100))}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      )}
    </span>
  )
}

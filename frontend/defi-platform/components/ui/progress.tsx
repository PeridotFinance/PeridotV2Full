"use client"

import * as React from "react"
import * as ProgressPrimitive from "@radix-ui/react-progress"
import { motion } from "framer-motion"

import { cn } from "@/lib/utils"

type ExtraProps = {
  indicatorClassName?: string
  indicatorStyle?: React.CSSProperties
  animateShimmer?: boolean
}

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> & ExtraProps
>(({ className, value, indicatorClassName, indicatorStyle, animateShimmer = false, ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    className={cn(
      "relative h-4 w-full overflow-hidden rounded-full bg-secondary",
      className
    )}
    {...props}
  >
    <ProgressPrimitive.Indicator
      className={cn("h-full w-full flex-1 bg-primary transition-all", indicatorClassName)}
      style={{ transform: `translateX(-${100 - (value || 0)}%)`, ...indicatorStyle }}
    />
    {animateShimmer && (
      <motion.div
        aria-hidden
        className={cn("pointer-events-none absolute inset-y-0 left-0 bg-transparent mix-blend-screen")}
        style={{ width: `${value || 0}%` }}
        animate={{ backgroundPositionX: ["0%", "200%" ] }}
        transition={{ duration: 2.2, ease: "linear", repeat: Infinity }}
      >
        <div
          className="h-full w-full"
          style={{
            backgroundImage: "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.25) 50%, rgba(255,255,255,0) 100%)",
            backgroundSize: "200% 100%",
          }}
        />
      </motion.div>
    )}
  </ProgressPrimitive.Root>
))
Progress.displayName = ProgressPrimitive.Root.displayName

export { Progress }

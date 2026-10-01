"use client"

import { useState, useRef, useCallback } from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"
import { cn } from "@/lib/utils"

interface InfoTooltipProps {
  title?: string
  content: React.ReactNode
  side?: "top" | "bottom" | "left" | "right"
  align?: "start" | "center" | "end"
  /** Applied to the trigger button — use for layout (w-full, text-center, etc.) */
  className?: string
  children: React.ReactNode
}

/**
 * Wraps any element and makes it a tooltip trigger.
 * - Desktop: opens on hover, stays open when hovering content, closes on mouse leave
 * - Mobile:  opens on tap, closes on tap outside
 */
export function InfoTooltip({
  title,
  content,
  side = "top",
  align = "center",
  className,
  children,
}: InfoTooltipProps) {
  const [open, setOpen] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scheduleClose = useCallback(() => {
    closeTimer.current = setTimeout(() => setOpen(false), 120)
  }, [])

  const cancelClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
  }, [])

  const handleTriggerEnter = useCallback(() => {
    cancelClose()
    setOpen(true)
  }, [cancelClose])

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label="More information"
          onMouseEnter={handleTriggerEnter}
          onMouseLeave={scheduleClose}
          className={cn(
            "outline-none focus:outline-none focus-visible:outline-none",
            "transition-opacity duration-150 hover:opacity-60",
            "active:scale-[0.96] active:transition-none",
            className
          )}
        >
          {children}
        </button>
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side={side}
          align={align}
          sideOffset={10}
          collisionPadding={16}
          // Keep open when mouse moves from trigger into the content card
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          className={cn(
            "z-[300] w-64 outline-none",
            "rounded-2xl p-4",
            "bg-background/95 backdrop-blur-xl",
            "border border-foreground/[0.08]",
            "shadow-xl shadow-black/25",
            "data-[state=open]:animate-in   data-[state=closed]:animate-out",
            "data-[state=open]:fade-in-0    data-[state=closed]:fade-out-0",
            "data-[state=open]:zoom-in-95   data-[state=closed]:zoom-out-95",
            "data-[side=top]:slide-in-from-bottom-2",
            "data-[side=bottom]:slide-in-from-top-2",
            "data-[side=left]:slide-in-from-right-2",
            "data-[side=right]:slide-in-from-left-2",
            "duration-150"
          )}
        >
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-emerald-500/[0.05] via-transparent to-transparent pointer-events-none" />

          <div className="relative space-y-1.5">
            {title && (
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/35">
                {title}
              </p>
            )}
            <p className="text-[13px] leading-[1.6] text-foreground/65 font-medium">
              {content}
            </p>
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}

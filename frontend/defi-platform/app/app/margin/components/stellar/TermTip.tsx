'use client'

/**
 * Hover tooltip for trading jargon — the term itself is the trigger (no info
 * icon). Dotted underline as affordance.
 *
 * On touch it is a Popover, not a Tooltip. Radix's Tooltip deliberately never
 * opens from a tap, so on a phone every one of these explanations — Position
 * Size, Borrow, Est. Fill Price, Est. Liq. — was simply
 * unreachable. Those are exactly the words a first-time trader doesn't know.
 * `HintTip` below is the shared primitive; the keeper chip uses it too.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

type Side = 'top' | 'bottom' | 'left' | 'right'

/**
 * True on devices with no hover. Resolved in an effect, so the first (server-
 * matched) paint is always the tooltip branch and hydration stays quiet; the
 * swap happens before anyone can tap.
 */
function useNoHoverPointer(): boolean {
  const [noHover, setNoHover] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(hover: none)')
    const sync = () => setNoHover(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])
  return noHover
}

export function HintTip({
  tip,
  side = 'top',
  contentClassName,
  children,
}: {
  tip: ReactNode
  side?: Side
  contentClassName?: string
  /** The trigger. Must accept a ref and spread props — both branches use `asChild`. */
  children: ReactNode
}) {
  const noHover = useNoHoverPointer()

  if (noHover) {
    return (
      <Popover>
        <PopoverTrigger asChild>{children}</PopoverTrigger>
        <PopoverContent
          side={side}
          align="center"
          collisionPadding={12}
          className={cn('w-auto max-w-[260px] px-3 py-2 text-xs leading-relaxed', contentClassName)}
        >
          {tip}
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side={side} collisionPadding={12} className={cn('max-w-[240px] text-xs leading-relaxed', contentClassName)}>
          {tip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

interface Props {
  tip: ReactNode
  children: ReactNode
  className?: string
  side?: Side
}

export function TermTip({ tip, children, className, side = 'top' }: Props) {
  return (
    <HintTip tip={tip} side={side}>
      <span
        tabIndex={0}
        className={cn(
          'cursor-help underline decoration-dotted decoration-muted-foreground/50 underline-offset-[3px] outline-none focus-visible:ring-1 focus-visible:ring-primary/40 rounded-sm',
          className,
        )}
      >
        {children}
      </span>
    </HintTip>
  )
}

'use client'

/**
 * AnimatedNumber — count-up tween between value changes, so a live PnL figure
 * *moves* on every feed tick instead of snapping. Pure Framer Motion (already a
 * dep); no extra runtime. The spring is short + critically damped so fast 2.5s
 * ticks don't visibly lag the real number.
 */
import { useEffect, useRef } from 'react'
import { useMotionValue, useSpring } from 'framer-motion'

interface Props {
  value: number
  /** Decimal places to render. */
  decimals?: number
  /** Rendered before the number (e.g. "$", "+"). */
  prefix?: string
  /** Rendered after the number (e.g. "%"). */
  suffix?: string
  /** Force an explicit sign on positives (PnL wants "+$12.40"). */
  signed?: boolean
  className?: string
}

export function AnimatedNumber({ value, decimals = 2, prefix = '', suffix = '', signed = false, className }: Props) {
  const ref = useRef<HTMLSpanElement>(null)
  const mv = useMotionValue(value)
  const spring = useSpring(mv, { stiffness: 140, damping: 22, mass: 0.4 })

  useEffect(() => { mv.set(value) }, [value, mv])

  useEffect(() => {
    return spring.on('change', (v) => {
      const el = ref.current
      if (!el) return
      const sign = signed && v > 0 ? '+' : ''
      el.textContent = `${sign}${prefix}${v.toFixed(decimals)}${suffix}`
    })
  }, [spring, decimals, prefix, suffix, signed])

  // SSR / first paint: render the target directly so there's no 0→value flash.
  const sign = signed && value > 0 ? '+' : ''
  return (
    <span ref={ref} className={className}>{`${sign}${prefix}${value.toFixed(decimals)}${suffix}`}</span>
  )
}

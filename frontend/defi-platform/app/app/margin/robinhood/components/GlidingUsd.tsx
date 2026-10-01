'use client'

import { useEffect, useRef } from 'react'
import { animate, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { formatUsdNumber } from '../lib/format'

// Whole cents read as money ($0.10); only amounts under a cent keep the four
// places the rest of the page uses, so a $0.004 fee never shows as $0.00.
const signedUsd = (v: number) => {
  const abs = Math.abs(v)
  const text = abs >= 0.01 || abs === 0 ? `${v < 0 ? '-' : ''}$${abs.toFixed(2)}` : formatUsdNumber(v)
  return `${v > 0 ? '+' : ''}${text}`
}

/** A money figure that glides to its new value instead of jumping. */
export function GlidingUsd({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const last = useRef(value)
  const reduce = useReducedMotion()
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (reduce) {
      el.textContent = signedUsd(value)
      last.current = value
      return
    }
    const c = animate(last.current, value, {
      duration: 0.35,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        el.textContent = signedUsd(v)
        last.current = v
      },
    })
    return () => c.stop()
  }, [value, reduce])
  return (
    <span ref={ref} className={cn('tabular-nums', className)}>
      {signedUsd(value)}
    </span>
  )
}

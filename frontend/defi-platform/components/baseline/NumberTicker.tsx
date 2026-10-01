"use client"

import React, { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

interface NumberTickerProps {
  value: number | string
  className?: string
  prefix?: string
  suffix?: string
  decimals?: number
}

export function NumberTicker({ value, className, prefix = "", suffix = "", decimals = 0 }: NumberTickerProps) {
  const [displayValue, setDisplayValue] = useState<string>("")
  const [isAnimating, setIsAnimating] = useState(false)

  useEffect(() => {
    setIsAnimating(true)
    const numValue = typeof value === "string" ? parseFloat(value.replace(/,/g, "")) : value
    
    if (isNaN(numValue)) {
      setDisplayValue(value.toString())
      setIsAnimating(false)
      return
    }

    const startValue = parseFloat(displayValue.replace(/,/g, "")) || 0
    const endValue = numValue
    const duration = 600
    const startTime = Date.now()

    const animate = () => {
      const now = Date.now()
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      
      // Easing function
      const easeOut = 1 - Math.pow(1 - progress, 3)
      const current = startValue + (endValue - startValue) * easeOut
      
      setDisplayValue(current.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ","))
      
      if (progress < 1) {
        requestAnimationFrame(animate)
      } else {
        setIsAnimating(false)
      }
    }

    requestAnimationFrame(animate)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, decimals])

  return (
    <span className={cn("cyber-number", isAnimating && "cyber-number", className)}>
      {prefix}
      {displayValue || value}
      {suffix}
    </span>
  )
}


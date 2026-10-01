"use client"

import { useReducedMotion } from "@/lib/use-reduced-motion"
import { cn } from "@/lib/utils"

interface FloatingElementProps {
  children: React.ReactNode
  xOffset?: number
  yOffset?: number
  duration?: number
}

/**
 * CSS-based floating element component - replaces Framer Motion version
 * Uses pure CSS animations for better performance
 */
export const FloatingElement = ({ 
  children, 
  xOffset = 0, 
  yOffset = 0, 
  duration = 3 
}: FloatingElementProps) => {
  const { isLowPerfDevice, prefersReducedMotion } = useReducedMotion()

  // Skip animation on low performance devices or when reduced motion is preferred
  if (isLowPerfDevice || prefersReducedMotion) {
    return (
      <div style={{ transform: `translate(${xOffset}px, ${yOffset}px)` }}>
        {children}
      </div>
    )
  }

  // Map duration to CSS class
  const durationClass = 
    duration === 4 ? "animate-float-4s" :
    duration === 5 ? "animate-float-5s" :
    duration === 6 ? "animate-float-6s" :
    duration === 7 ? "animate-float-7s" :
    duration === 8 ? "animate-float-8s" :
    "animate-float"

  return (
    <div 
      className={cn(durationClass)}
      style={{ 
        transform: `translate(${xOffset}px, ${yOffset}px)`,
      }}
    >
      {children}
    </div>
  )
}


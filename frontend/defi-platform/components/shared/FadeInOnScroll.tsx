"use client"

import { useFadeInOnScroll } from "@/hooks/use-fade-in-on-scroll"
import { cn } from "@/lib/utils"

interface FadeInOnScrollProps {
  children: React.ReactNode
  className?: string
  threshold?: number
  rootMargin?: string
  delay?: number
  variant?: "fade-in-up" | "fade-in-up-30" | "fade-in-left" | "fade-in-scale"
  as?: keyof JSX.IntrinsicElements
}

/**
 * Component wrapper for fade-in on scroll animations
 * Uses CSS + Intersection Observer instead of Framer Motion
 */
export function FadeInOnScroll({
  children,
  className,
  threshold = 0.1,
  rootMargin = "-50px",
  delay = 0,
  variant = "fade-in-up",
  as: Component = "div",
}: FadeInOnScrollProps) {
  const { ref } = useFadeInOnScroll({
    threshold,
    rootMargin,
    delay,
    variant,
  })

  return (
    <Component
      ref={ref as any}
      className={cn(className)}
    >
      {children}
    </Component>
  )
}


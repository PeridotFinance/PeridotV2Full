"use client"

import { useEffect, useRef, useState } from "react"
import { useReducedMotion } from "@/lib/use-reduced-motion"

interface UseFadeInOnScrollOptions {
  threshold?: number
  rootMargin?: string
  delay?: number
  variant?: "fade-in-up" | "fade-in-up-30" | "fade-in-left" | "fade-in-scale"
}

/**
 * Hook that uses Intersection Observer to trigger CSS-based fade-in animations
 * Replaces Framer Motion's whileInView for better performance
 */
export function useFadeInOnScroll(options: UseFadeInOnScrollOptions = {}) {
  const {
    threshold = 0.1,
    rootMargin = "-50px",
    delay = 0,
    variant = "fade-in-up",
  } = options

  const { isLowPerfDevice, prefersReducedMotion } = useReducedMotion()
  const elementRef = useRef<HTMLElement | null>(null)
  const [isVisible, setIsVisible] = useState(false)
  const observerRef = useRef<IntersectionObserver | null>(null)
  const optionsRef = useRef({ threshold, rootMargin, delay, variant, isLowPerfDevice, prefersReducedMotion })

  // Update options ref when they change
  useEffect(() => {
    optionsRef.current = { threshold, rootMargin, delay, variant, isLowPerfDevice, prefersReducedMotion }
  }, [threshold, rootMargin, delay, variant, isLowPerfDevice, prefersReducedMotion])

  useEffect(() => {
    const element = elementRef.current
    if (!element) {
      console.warn('[useFadeInOnScroll] Element ref is null')
      return
    }

    const opts = optionsRef.current

    // Skip animation on low performance devices or when reduced motion is preferred
    if (opts.isLowPerfDevice || opts.prefersReducedMotion) {
      element.classList.remove(opts.variant)
      element.classList.add("visible")
      setIsVisible(true)
      return
    }

    // Add initial class only if not already visible
    if (!element.classList.contains("visible")) {
      element.classList.add(opts.variant)
    }

    // Clean up existing observer if any
    if (observerRef.current) {
      observerRef.current.disconnect()
      observerRef.current = null
    }

    // Fallback for browsers without IntersectionObserver support (older Safari / WebViews)
    if (typeof window === "undefined") {
      console.warn('[useFadeInOnScroll] window is undefined (SSR)')
      element.classList.remove(opts.variant)
      element.classList.add("visible")
      setIsVisible(true)
      return
    }

    if (typeof window.IntersectionObserver === "undefined") {
      console.warn('[useFadeInOnScroll] IntersectionObserver not available', {
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'
      })
      element.classList.remove(opts.variant)
      element.classList.add("visible")
      setIsVisible(true)
      return
    }

    // Set up Intersection Observer with try/catch for mobile WebViews that throw
    let observer: IntersectionObserver
    try {
      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting && !entry.target.classList.contains("visible")) {
              const currentOpts = optionsRef.current
              // Add delay if specified
              if (currentOpts.delay > 0) {
                setTimeout(() => {
                  if (entry.target && !entry.target.classList.contains("visible")) {
                    entry.target.classList.add("visible")
                    setIsVisible(true)
                  }
                }, currentOpts.delay)
              } else {
                entry.target.classList.add("visible")
                setIsVisible(true)
              }
              // Unobserve after animation to prevent re-triggering
              observer.unobserve(entry.target)
            }
          })
        },
        {
          threshold: opts.threshold,
          rootMargin: opts.rootMargin,
        }
      )
    } catch (err) {
      // Some mobile WebViews expose IntersectionObserver but throw at runtime
      console.error('[useFadeInOnScroll] Failed to create IntersectionObserver:', {
        error: err,
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        hasIntersectionObserver: typeof window.IntersectionObserver !== 'undefined',
        variant: opts.variant,
      })
      // Fallback: make element visible immediately
      element.classList.remove(opts.variant)
      element.classList.add("visible")
      setIsVisible(true)
      return
    }

    try {
      observer.observe(element)
      observerRef.current = observer
    } catch (err) {
      // If observe() throws, fallback to visible
      console.error('[useFadeInOnScroll] Failed to observe element:', {
        error: err,
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        elementTag: element.tagName,
        variant: opts.variant,
      })
      element.classList.remove(opts.variant)
      element.classList.add("visible")
      setIsVisible(true)
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect()
        observerRef.current = null
      }
    }
  }, []) // Only run once on mount, use refs for current values

  return { ref: elementRef, isVisible }
}


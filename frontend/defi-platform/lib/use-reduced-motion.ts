"use client"

import { useEffect, useState } from "react"

// This hook detects if the user prefers reduced motion
// and can be used to disable animations for better performance
export function useReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)
  const [isLowPerfDevice, setIsLowPerfDevice] = useState(false)
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    // Set client flag to prevent hydration mismatch
    setIsClient(true)

    try {
      // Check for reduced motion preference
      if (typeof window !== "undefined" && typeof window.matchMedia !== "undefined") {
        const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)")
        setPrefersReducedMotion(mediaQuery.matches)

        const handleChange = () => {
          setPrefersReducedMotion(mediaQuery.matches)
        }

        mediaQuery.addEventListener("change", handleChange)

        // Detect low performance devices (simplified heuristic)
        let isLowPerf = false
        try {
          if (typeof navigator !== "undefined" && navigator.userAgent) {
            isLowPerf = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
          }
          if (!isLowPerf && typeof window !== "undefined" && window.innerWidth) {
            isLowPerf = window.innerWidth < 768
          }
        } catch (err) {
          // If userAgent or innerWidth access fails, default to false
          console.error('[useReducedMotion] Failed to detect device type:', {
            error: err,
            message: err instanceof Error ? err.message : String(err),
          })
          isLowPerf = false
        }

        setIsLowPerfDevice(isLowPerf)

        return () => {
          mediaQuery.removeEventListener("change", handleChange)
        }
      } else {
        console.warn('[useReducedMotion] window or matchMedia not available')
      }
    } catch (err) {
      // If any browser API access fails, use safe defaults
      console.error('[useReducedMotion] Critical error:', {
        error: err,
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      })
      setPrefersReducedMotion(false)
      setIsLowPerfDevice(false)
    }
  }, [])

  // Return safe defaults during SSR
  return { 
    prefersReducedMotion: isClient ? prefersReducedMotion : false, 
    isLowPerfDevice: isClient ? isLowPerfDevice : false 
  }
}

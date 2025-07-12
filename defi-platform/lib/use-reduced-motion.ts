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

    // Check for reduced motion preference
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)")
    setPrefersReducedMotion(mediaQuery.matches)

    const handleChange = () => {
      setPrefersReducedMotion(mediaQuery.matches)
    }

    mediaQuery.addEventListener("change", handleChange)

    // Detect low performance devices (simplified heuristic)
    const isLowPerf =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
      window.innerWidth < 768

    setIsLowPerfDevice(isLowPerf)

    return () => {
      mediaQuery.removeEventListener("change", handleChange)
    }
  }, [])

  // Return safe defaults during SSR
  return { 
    prefersReducedMotion: isClient ? prefersReducedMotion : false, 
    isLowPerfDevice: isClient ? isLowPerfDevice : false 
  }
}

"use client"

import { useEffect, useState } from "react"

// This hook detects if the user prefers reduced motion
// and can be used to disable animations for better performance
export function useReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)
  const [isLowPerfDevice, setIsLowPerfDevice] = useState(false)

  useEffect(() => {
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

  return { prefersReducedMotion, isLowPerfDevice }
}

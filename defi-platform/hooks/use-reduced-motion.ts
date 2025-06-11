import { useState, useEffect } from 'react'

interface PerformanceSettings {
  isLowPerfDevice: boolean
  prefersReducedMotion: boolean
  shouldUseReducedAnimations: boolean
}

export function useReducedMotion(): PerformanceSettings {
  const [isLowPerfDevice, setIsLowPerfDevice] = useState(false)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  useEffect(() => {
    // Check for reduced motion preference
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    setPrefersReducedMotion(mediaQuery.matches)

    const handleChange = () => {
      setPrefersReducedMotion(mediaQuery.matches)
    }

    mediaQuery.addEventListener('change', handleChange)

    // Detect low performance devices
    const checkPerformance = () => {
      // Check hardware concurrency (CPU cores)
      const cores = navigator.hardwareConcurrency || 1
      
      // Check device memory (if available)
      const memory = (navigator as any).deviceMemory || 1
      
      // Check connection speed
      const connection = (navigator as any).connection
      const isSlowConnection = connection && 
        (connection.effectiveType === 'slow-2g' || 
         connection.effectiveType === '2g' ||
         connection.effectiveType === '3g')

      // Consider it low performance if:
      // - Less than 4 CPU cores AND less than 4GB RAM
      // - OR slow network connection
      // - OR user agent suggests mobile device
      const isMobile = /Mobi|Android/i.test(navigator.userAgent)
      
      setIsLowPerfDevice(
        (cores < 4 && memory < 4) || 
        isSlowConnection || 
        (isMobile && cores < 6)
      )
    }

    checkPerformance()

    return () => {
      mediaQuery.removeEventListener('change', handleChange)
    }
  }, [])

  return {
    isLowPerfDevice,
    prefersReducedMotion,
    shouldUseReducedAnimations: isLowPerfDevice || prefersReducedMotion
  }
} 
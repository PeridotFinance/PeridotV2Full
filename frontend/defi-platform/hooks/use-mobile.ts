"use client"

import { useState, useEffect } from "react"

export const useMobile = () => {
  const [isMobile, setIsMobile] = useState(false)
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    // Set client flag to prevent hydration mismatch
    setIsClient(true)

    const handleResize = () => {
      setIsMobile(window.innerWidth < 768) // Adjust breakpoint as needed
    }

    // Set initial value
    handleResize()

    // Add event listener
    window.addEventListener("resize", handleResize)

    // Remove event listener on cleanup
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  // Return false during SSR to prevent hydration mismatch
  return isClient ? isMobile : false
}

"use client"

import { useEffect } from "react"

/**
 * Hook to track if a user has visited the website before.
 * Sets a persistent cookie and/or localStorage flag.
 */
export function useVisitorTracking() {
  useEffect(() => {
    // Check if the visitor cookie exists
    const hasVisited = document.cookie
      .split("; ")
      .find((row) => row.startsWith("peridot_visited="))

    if (!hasVisited) {
      // Set a cookie that expires in 1 year (31536000 seconds)
      const maxAge = 60 * 60 * 24 * 365
      document.cookie = `peridot_visited=true; path=/; max-age=${maxAge}; SameSite=Lax`
      
      // Also set a localStorage flag for easier client-side access if needed
      localStorage.setItem("peridot_has_visited", "true")
      
      // Log for debugging (can be removed in production)
      console.log("Welcome! This is your first visit to Peridot.")
    } else {
      // Existing visitor
      console.log("Welcome back to Peridot!")
    }
  }, [])
}

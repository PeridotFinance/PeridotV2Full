"use client"

import { useEffect, useState } from "react"

/**
 * Returns `true` when the user has requested reduced motion at the OS level.
 * Components should fall back to instant or much shorter transitions when set —
 * the spring slides we use for sheets / panels can be disorienting otherwise.
 *
 * Safe to call from any client component; SSR returns `false`.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    setReduced(mq.matches)
    const listener = (e: MediaQueryListEvent) => setReduced(e.matches)
    mq.addEventListener("change", listener)
    return () => mq.removeEventListener("change", listener)
  }, [])

  return reduced
}

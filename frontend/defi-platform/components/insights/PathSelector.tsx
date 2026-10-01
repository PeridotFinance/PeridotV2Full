"use client"

import Link from "next/link"
import { useEffect, useRef } from "react"
import type { InsightsPath } from "@/lib/insights-data"
import { insightsPathConfig } from "@/lib/insights-data"

const pathOrder: Array<InsightsPath> = ["starter", "yield", "risk", "market"]

export function PathSelector({
  currentPath,
  onSelect,
  onHoverIntent,
}: {
  currentPath?: InsightsPath | null
  onSelect?: (path: InsightsPath) => void
  onHoverIntent?: (path: InsightsPath) => void
}) {
  const hoverTimerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current)
    }
  }, [])

  const triggerHoverIntent = (path: InsightsPath) => {
    if (!onHoverIntent) return
    if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current)
    hoverTimerRef.current = window.setTimeout(() => {
      onHoverIntent(path)
    }, 200)
  }

  const clearHoverIntent = () => {
    if (hoverTimerRef.current) {
      window.clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }
  }

  return (
    <nav className="insights-path-nav" aria-label="Insight sections">
      {pathOrder.map((path) => (
        onSelect ? (
          <button
            key={path}
            type="button"
            className={`insights-path-nav__btn ${currentPath === path ? "is-active" : ""}`}
            aria-pressed={currentPath === path}
            onClick={() => onSelect(path)}
            onMouseEnter={() => triggerHoverIntent(path)}
            onFocus={() => triggerHoverIntent(path)}
            onMouseLeave={clearHoverIntent}
            onBlur={clearHoverIntent}
          >
            {insightsPathConfig[path].label}
          </button>
        ) : (
          <Link
            key={path}
            href={`/insights/${path}`}
            className={`insights-path-nav__btn ${currentPath === path ? "is-active" : ""}`}
            onMouseEnter={() => triggerHoverIntent(path)}
            onFocus={() => triggerHoverIntent(path)}
            onMouseLeave={clearHoverIntent}
            onBlur={clearHoverIntent}
          >
            {insightsPathConfig[path].label}
          </Link>
        )
      ))}
    </nav>
  )
}

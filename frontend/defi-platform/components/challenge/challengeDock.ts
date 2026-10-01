"use client"

/**
 * Shared "docked" state between the ChallengeBanner (on /app/margin) and the
 * ChallengeHeaderPill (site header).
 *
 * Dismissing the banner doesn't delete the leaderboard entry point — it moves
 * it: the banner flies into the header and lives there as a compact pill for
 * the rest of the challenge. Both components read the same per-slug
 * localStorage key, and dismissal is announced with a window event so the pill
 * appears the moment the fly-out lands (a storage write alone would only reach
 * OTHER tabs).
 */
import { useEffect, useState } from "react"

/** Kept verbatim from the old banner so existing dismissals stay dismissed. */
export const CHALLENGE_DISMISS_PREFIX = "peridot:challenge-banner-dismissed:"
export const CHALLENGE_DOCK_EVENT = "peridot:challenge-banner-docked"
/** The header element the banner's fly-out animation aims for. */
export const CHALLENGE_PILL_ANCHOR_ID = "challenge-header-pill-anchor"

export function isChallengeDocked(slug: string): boolean {
  try {
    return window.localStorage.getItem(CHALLENGE_DISMISS_PREFIX + slug) === "1"
  } catch {
    return false
  }
}

/** Persist the dismissal. Safe to call more than once. */
export function persistChallengeDock(slug: string): void {
  try {
    window.localStorage.setItem(CHALLENGE_DISMISS_PREFIX + slug, "1")
  } catch {
    /* private mode / storage disabled — docks for this page view only */
  }
}

/** Tell the header pill to appear (fired when the fly-out animation lands). */
export function announceChallengeDock(slug: string): void {
  window.dispatchEvent(new CustomEvent(CHALLENGE_DOCK_EVENT, { detail: { slug } }))
}

/**
 * Whether the banner for `slug` has been dismissed into the header.
 * `false` while unmounted/unknown — callers already gate on a mounted flag.
 */
export function useChallengeDocked(slug: string | null): boolean {
  const [docked, setDocked] = useState(false)

  useEffect(() => {
    if (!slug) return
    setDocked(isChallengeDocked(slug))
    const onDock = (e: Event) => {
      const detail = (e as CustomEvent).detail as { slug?: string } | undefined
      if (!detail?.slug || detail.slug === slug) setDocked(isChallengeDocked(slug) || detail?.slug === slug)
    }
    // Same-tab dismissals arrive via the custom event; other tabs via storage.
    const onStorage = (e: StorageEvent) => {
      if (e.key === CHALLENGE_DISMISS_PREFIX + slug) setDocked(e.newValue === "1")
    }
    window.addEventListener(CHALLENGE_DOCK_EVENT, onDock)
    window.addEventListener("storage", onStorage)
    return () => {
      window.removeEventListener(CHALLENGE_DOCK_EVENT, onDock)
      window.removeEventListener("storage", onStorage)
    }
  }, [slug])

  return docked
}

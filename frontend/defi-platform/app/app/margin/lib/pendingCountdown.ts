'use client'

/**
 * Live countdown for a pending open / pending close deadline.
 *
 * Both recovery banners used to format `expiresAt` inline, which only recomputed
 * when their parent re-rendered — the positions sweep, every 15 seconds. So the
 * strip said "45s left" and went on saying it while the deadline came and went,
 * then jumped straight to "expired". A countdown that visibly stalls is worse
 * than none: it is the one element on the page telling a trader with locked
 * collateral how long they have to act.
 *
 * Ticks once a second while there is time left, then stops — no timer runs for an
 * already-expired pending.
 */
import { useEffect, useState } from 'react'

function format(msLeft: number): string {
  if (msLeft <= 0) return 'expired'
  const secs = Math.floor(msLeft / 1000)
  const m = Math.floor(secs / 60)
  return m >= 1 ? `${m}m left` : `${secs}s left`
}

export function useTimeLeft(expiresAt: Date): string {
  const expiryMs = expiresAt.getTime()
  const [label, setLabel] = useState(() => format(expiryMs - Date.now()))

  useEffect(() => {
    const update = () => {
      const left = expiryMs - Date.now()
      setLabel(format(left))
      return left
    }
    if (update() <= 0) return
    const id = setInterval(() => {
      if (update() <= 0) clearInterval(id)
    }, 1000)
    return () => clearInterval(id)
  }, [expiryMs])

  return label
}

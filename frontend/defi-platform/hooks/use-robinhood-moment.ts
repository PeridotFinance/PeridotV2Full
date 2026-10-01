'use client'

/**
 * The page-level channel for result moments. The flow that finished is often
 * not around to show its own result: a full close removes the position card,
 * and with it the close tab that ran the flow. So flows announce the moment
 * here and one host on the page (RobinhoodMomentHost) shows it.
 *
 * Same plain-window-event pattern as the refresh signal; nothing is stored,
 * a moment announced while no host is mounted is simply not shown.
 */
import { useEffect, useState } from 'react'

export type RobinhoodMoment =
  | {
      kind: 'opened'
      positionId: string
      direction: 'long' | 'short'
      leverage: number | null
      sizeUsd: number
      marginUsd: number | null
      health: number | null
      hash: string
    }
  | {
      kind: 'closed'
      positionId: string
      direction: 'long' | 'short'
      /** What went back to free margin in this transaction, USD. */
      returnedUsd: number | null
      hash: string
      via: 'close' | 'exit'
    }

const MOMENT_EVENT = 'peridot:robinhood-moment'
const FOCUS_EVENT = 'peridot:robinhood-focus'

export function showRobinhoodMoment(m: RobinhoodMoment): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(MOMENT_EVENT, { detail: m }))
}

export function useRobinhoodMomentQueue(): [RobinhoodMoment | null, () => void] {
  const [moment, setMoment] = useState<RobinhoodMoment | null>(null)
  useEffect(() => {
    const on = (e: Event) => setMoment((e as CustomEvent<RobinhoodMoment>).detail)
    window.addEventListener(MOMENT_EVENT, on)
    return () => window.removeEventListener(MOMENT_EVENT, on)
  }, [])
  return [moment, () => setMoment(null)]
}

export type RobinhoodFocusTarget = { tab: 'open' | 'closed'; positionId?: string }

/** Bring a tab (and optionally one position card) into view. */
export function focusRobinhoodPosition(target: RobinhoodFocusTarget): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(FOCUS_EVENT, { detail: target }))
}

export function useRobinhoodFocus(cb: (t: RobinhoodFocusTarget) => void): void {
  useEffect(() => {
    const on = (e: Event) => cb((e as CustomEvent<RobinhoodFocusTarget>).detail)
    window.addEventListener(FOCUS_EVENT, on)
    return () => window.removeEventListener(FOCUS_EVENT, on)
  }, [cb])
}

/**
 * One part of the page asking another to come forward: the progress path or
 * an empty ticket asking the account card for its deposit tab, a step asking
 * the ticket for the amount field. The receiver scrolls itself into view and
 * focuses its input; the sender does not need to know where it lives.
 */
export type RobinhoodPanelRequest = 'deposit' | 'withdraw' | 'trade'

const PANEL_EVENT = 'peridot:robinhood-panel'

export function requestRobinhoodPanel(panel: RobinhoodPanelRequest): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(PANEL_EVENT, { detail: panel }))
}

export function useRobinhoodPanelRequest(cb: (panel: RobinhoodPanelRequest) => void): void {
  useEffect(() => {
    const on = (e: Event) => cb((e as CustomEvent<RobinhoodPanelRequest>).detail)
    window.addEventListener(PANEL_EVENT, on)
    return () => window.removeEventListener(PANEL_EVENT, on)
  }, [cb])
}

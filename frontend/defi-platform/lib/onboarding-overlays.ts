/**
 * A one-at-a-time lane for first-visit overlays.
 *
 * Why: the mode explainer (`ModeIntroDialog`) and the Stellar login sheet
 * (`StellarFirstTimeSheet`) are each "show once per browser", each with its own
 * localStorage key, and neither knows the other exists. On a first visit to
 * Expert mode both fired at once and stacked — the sheet slid in under a modal,
 * so a newcomer had to dismiss two things before seeing a single market.
 *
 * Rather than hard-wiring one to know about the other (which breaks the moment
 * a third overlay shows up, or when one of them isn't mounted on a given page),
 * overlays announce that they're showing and wait their turn. Whoever asks
 * first goes first; the rest open when the lane clears.
 *
 * Deliberately module-level rather than React context: these components sit in
 * different subtrees (the dialog at the page root, the sheet inside ExpertView)
 * and a provider spanning both would have to live above the view switch.
 */

let openCount = 0
const listeners = new Set<() => void>()

function notify() {
  for (const fn of listeners) fn()
}

/** True while any onboarding overlay is on screen. */
export function isOnboardingOverlayOpen(): boolean {
  return openCount > 0
}

/**
 * Mark an overlay as visible. Returns the release function — call it when the
 * overlay closes. Releasing twice is harmless.
 */
export function acquireOnboardingOverlay(): () => void {
  openCount++
  notify()
  let released = false
  return () => {
    if (released) return
    released = true
    openCount = Math.max(0, openCount - 1)
    notify()
  }
}

/** Subscribe to lane changes. Returns an unsubscribe function. */
export function subscribeOnboardingOverlay(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** Test seam — resets the lane between cases. */
export function __resetOnboardingOverlays(): void {
  openCount = 0
  listeners.clear()
}

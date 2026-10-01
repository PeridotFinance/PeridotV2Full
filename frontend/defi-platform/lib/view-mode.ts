/**
 * View-mode primitives shared by server and client.
 *
 * These live outside `context/view-mode.tsx` on purpose: that module is
 * `"use client"`, and a server component importing a value from it receives a
 * client-reference proxy rather than the string. `cookies().get(<proxy>)` then
 * silently matches nothing, so the root layout used to report "easy" for every
 * visitor no matter what the cookie said — while mode-gated server routes
 * (e.g. `/app/borrow`) read the real value and disagreed with the UI. Dev never
 * showed it; only the production bundle splits the modules that way.
 */

export type ViewMode = "easy" | "expert"

export const VIEW_MODE_COOKIE = "peridot_view_mode"

/** Narrow an untrusted cookie/query value to a ViewMode. */
export function parseViewMode(value: string | undefined | null): ViewMode | null {
  return value === "easy" || value === "expert" ? value : null
}

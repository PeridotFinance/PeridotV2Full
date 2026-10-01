import { redirect } from "next/navigation"

/**
 * The Easy home now lives under `/app` itself, switchable in place via the
 * `ViewModeToggle` in the SiteHeader. Hitting `/app/easy` directly (or any
 * legacy "V2" deep-link) lands on `/app?view=easy`, which adopts the mode
 * once, persists it to a cookie, and strips the query param.
 *
 * The deep Easy subroutes (`/app/easy/portfolio`, `/activity`, `/account*`,
 * `/history`) are untouched — they still live under the EasyLayoutShell.
 */
export default function EasyRootRedirect() {
  redirect("/app?view=easy")
}

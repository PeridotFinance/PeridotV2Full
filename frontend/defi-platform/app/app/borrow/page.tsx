import type { Metadata } from "next"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import BorrowView from "@/components/app/BorrowView"
import { VIEW_MODE_COOKIE, parseViewMode } from "@/lib/view-mode"

export const metadata: Metadata = {
  title: "Borrow | Peridot Finance",
  description:
    "Borrow against your deposits on Peridot. Your savings keep earning while backing your loan — repay anytime.",
}

/**
 * Standalone Borrow page, reachable from the "Borrow" tab in the SiteHeader.
 * The Earn tab (`/app`) stays deposit-focused in Easy mode; this route gives
 * borrowing its own front door in the same Easy-mode visual language.
 *
 * Borrow is Easy-only: Expert users borrow per-market in the markets table.
 * The expert-cookie case redirects here on the server because a client-side
 * `router.replace` in the very first render gets dropped during hydration —
 * BorrowView still carries the client effect for in-page toggle flips.
 */
export default async function BorrowPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>
}) {
  // A `?view=easy|expert` deep-link outranks the cookie — ViewModeProvider
  // adopts it client-side, so the server must not redirect against it.
  const { view } = await searchParams
  const viewMode =
    parseViewMode(view) ?? parseViewMode((await cookies()).get(VIEW_MODE_COOKIE)?.value)
  if (viewMode === "expert") redirect("/app")

  return <BorrowView />
}

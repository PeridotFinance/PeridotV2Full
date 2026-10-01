"use client"

import { useEffect, useRef } from "react"
import { DepositSheet } from "./DepositSheet"
import { WithdrawSheet } from "./WithdrawSheet"
import { BorrowSheet } from "./BorrowSheet"
import { RepaySheet } from "./RepaySheet"
import { useStellarSheets } from "@/context/stellar-sheets"

/**
 * Single mount point for every stellar sheet (deposit / withdraw / borrow /
 * repay). Each child reads its own slot from `useStellarSheets()` and
 * renders only when that slot is non-null, so we never spin up the heavy
 * tx hooks for sheets the user hasn't opened.
 *
 * Future sheets get added here as they ship (Step 5, 7, 8). The provider
 * lives upstream in `<EasyLayoutShell>`.
 */
export function StellarSheets() {
  return (
    <>
      <DepositResumeFromUrl />
      <DepositSheet />
      <WithdrawSheet />
      <BorrowSheet />
      <RepaySheet />
    </>
  )
}

/**
 * Reopens the deposit sheet, prefilled, when the user arrives with a
 * `?deposit=<assetId>&amount=<n>` intent on the URL. This is how the
 * post-funding landing (`/app/funded`) hands the user back into the deposit
 * flow they started before topping up: it navigates here with the intent on
 * the query string, and we consume it once.
 *
 * Mounted inside `<StellarSheets>` so it runs in both the desktop shell and
 * the mobile `EasyView` — the two places `StellarSheetsProvider` lives — and
 * only after the user is authenticated (the shell gates on that), which is
 * exactly when `openDeposit` is meaningful. We read `window.location` rather
 * than `useSearchParams` so this deep client subtree doesn't drag a Suspense
 * boundary requirement onto the route, and strip the params with
 * `history.replaceState` so a refresh or back-nav doesn't re-trigger it.
 */
function DepositResumeFromUrl() {
  const { openDeposit } = useStellarSheets()
  const firedRef = useRef(false)

  useEffect(() => {
    if (firedRef.current || typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    const assetId = params.get("deposit")
    if (!assetId) return

    firedRef.current = true
    const amount = params.get("amount") || undefined
    openDeposit({ assetId, defaultAmount: amount })

    params.delete("deposit")
    params.delete("amount")
    const qs = params.toString()
    window.history.replaceState(
      null,
      "",
      window.location.pathname + (qs ? `?${qs}` : ""),
    )
  }, [openDeposit])

  return null
}

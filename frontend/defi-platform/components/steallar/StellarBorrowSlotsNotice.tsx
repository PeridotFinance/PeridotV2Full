"use client"

import { AlertTriangle, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { useStellarMarketSlots } from "@/hooks/use-stellar-market-slots"

/**
 * Explains the one thing that silently stops a Stellar borrow, and offers the
 * way out.
 *
 * Past two entered markets the controller cannot price the account inside a
 * single Soroban transaction, so every borrow figure reads as unknown. The app
 * used to render that as "you can borrow up to $0.00", which sent people
 * looking for collateral they already had. Leaving a market they hold nothing
 * in is one signature and restores borrowing immediately.
 *
 * Renders `null` unless the account is actually over the limit.
 */
export function StellarBorrowSlotsNotice({
  address,
  className,
}: {
  address: string | null | undefined
  className?: string
}) {
  const slots = useStellarMarketSlots(address)
  if (!slots.tooManyMarkets) return null

  const canLeave = slots.emptySlots.length > 0
  const names = (list: { symbol: string }[]) => list.map((s) => s.symbol).join(", ")

  return (
    <div
      className={cn(
        "flex flex-col gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3.5 py-3",
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
        <div className="text-xs text-amber-700 dark:text-amber-500 leading-relaxed">
          <p className="font-semibold">Borrowing is paused on this account</p>
          <p className="mt-0.5">
            You are active in {slots.enteredCount} markets, which is more than the
            network can price in one go, so your limit cannot be calculated.{" "}
            {canLeave
              ? `Leaving ${names(slots.emptySlots)} frees it up right away. Your deposits are not affected.`
              : `Withdraw your full balance from one of them (${names(
                  slots.occupiedSlots,
                )}), then you can leave it.`}
          </p>
        </div>
      </div>

      {canLeave && (
        <button
          type="button"
          onClick={() => slots.leaveEmptyMarkets()}
          disabled={slots.isLeaving}
          className="self-start inline-flex items-center gap-1.5 rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300 hover:bg-amber-500/25 transition-colors disabled:opacity-50"
        >
          {slots.isLeaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {slots.isLeaving
            ? "Leaving…"
            : `Leave ${slots.emptySlots.length > 1 ? "these markets" : "this market"}`}
        </button>
      )}

      {slots.leaveError && (
        <p className="text-[11px] text-rose-600 leading-relaxed">{slots.leaveError}</p>
      )}
    </div>
  )
}

"use client"

/**
 * The small print of a cross-chain top-up: what went wrong, or what is on its way.
 *
 * This used to be the whole feature — a bordered box with its own headline,
 * its own balance and its own button, sitting above a primary button that said
 * *Insufficient balance*. The action moved into that primary button (see
 * `use-cross-chain-top-up`), and the balance moved into the sheet's balance
 * line, which leaves this with only the things a button cannot say.
 *
 * So it renders nothing in the ordinary case, and that is the intended state.
 * Four exceptions, in the order they happen:
 *
 *   - the burn is mined and the money is still in the air,
 *   - it landed, and the button below quietly became a deposit,
 *   - the user has USDC but nowhere near enough on one chain to be worth moving,
 *   - it failed.
 */

import { cn } from "@/lib/utils"
import { CCTP_MIN_TRANSFER_USD } from "@/config/cctp"
import type { CrossChainTopUp } from "@/hooks/use-cross-chain-top-up"

/**
 * What the primary button says while the chains are being talked to. Lives here
 * rather than in the hook because it is copy, and beside the notice because the
 * two are the only places a top-up ever speaks to the user.
 */
export const TOP_UP_STEP_LABEL: Record<string, string> = {
  planning: "Preparing…",
  switching: "Switch network in your wallet…",
  approving: "Approve in your wallet…",
  burning: "Confirm in your wallet…",
}

export interface CrossChainTopUpNoticeProps {
  topUp: CrossChainTopUp
  className?: string
}

export function CrossChainTopUpNotice({ topUp, className }: CrossChainTopUpNoticeProps) {
  if (!topUp.available) return null

  if (topUp.awaitingArrival) {
    return (
      <div
        data-testid="cctp-top-up-sent"
        className={cn(
          "rounded-2xl border border-emerald-200 bg-emerald-500/[0.06] px-4 py-3.5",
          className,
        )}
      >
        <p className="text-[13px] leading-relaxed text-foreground/75">
          On its way{topUp.best ? ` from ${topUp.best.chainName}` : ""}. Usually a
          minute or two, and the button below turns into your deposit the moment
          it lands. Closing this is fine too — we&apos;ll remind you.
        </p>
      </div>
    )
  }

  // Landed. Said once, plainly, because the primary button changing from
  // "Waiting…" to "Deposit" is a quiet event and the user may have looked away.
  if (topUp.sentHash) {
    return (
      <div
        data-testid="cctp-top-up-arrived"
        className={cn(
          "rounded-2xl border border-emerald-200 bg-emerald-500/[0.06] px-4 py-3.5",
          className,
        )}
      >
        <p className="text-[13px] leading-relaxed text-foreground/75">
          Your money arrived. It&apos;s in your wallet and earning nothing yet —
          deposit it below.
        </p>
      </div>
    )
  }

  if (topUp.belowMinimum) {
    return (
      <p className={cn("px-1 text-[11px] text-muted-foreground", className)}>
        Moving money between networks costs a small fee, so it starts at $
        {CCTP_MIN_TRANSFER_USD}.
      </p>
    )
  }

  if (topUp.error) {
    return (
      <p className={cn("px-1 text-[11px] text-rose-600", className)}>{topUp.error}</p>
    )
  }

  return null
}

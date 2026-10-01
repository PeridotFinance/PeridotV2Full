"use client"

/**
 * "Your money arrived — do you want to put it to work?"
 *
 * The deliberate pause in the cross-chain deposit. USDC lands in the user's own
 * Stellar wallet and stops there; nothing supplies it for them. That was a
 * product decision, not a missing step: an automatic supply would mean a
 * transaction the user did not sign appearing minutes after they left the page,
 * and if they had changed their mind in the meantime there is no undo. So we
 * ask, and their answer closes the file — invested, or kept in the wallet.
 *
 * Also the one place a stuck transfer becomes visible. When a mint cannot land
 * (almost always a trustline that was never opened, or removed afterwards) the
 * server reports the blocker with the list and this banner shows the fix rather
 * than leaving a deposit silently in limbo.
 *
 * Renders nothing when there is nothing to say, so it is safe to mount high in
 * the app shell.
 */

import { ArrowRight, Loader2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { describeCctpBlocker } from "@/lib/cctp/trustline"
import { useCctpTransfers } from "@/hooks/use-cctp-transfers"
import { useStellarWallet } from "@/hooks/use-stellar-wallet"

export interface ArrivedNotInvestedBannerProps {
  /**
   * Open the deposit sheet for the arrived amount. Omit it where no sheet is
   * reachable (the mobile branch has no `StellarSheetsProvider`) — the banner
   * then reports the arrival without offering a button that would do nothing.
   */
  onInvest?: (amountUsdc: number) => void
  className?: string
}

export function ArrivedNotInvestedBanner({ onInvest, className }: ArrivedNotInvestedBannerProps) {
  const { address, source } = useStellarWallet()
  // Deliberately not gated on the host/feature flag: a transfer that is already
  // moving must stay visible even if the feature is switched off underneath it,
  // and it costs nothing on a wallet that has never used the flow — the query
  // simply comes back empty.
  const { inFlight, awaitingUser, recipient, dismiss } = useCctpTransfers(
    address,
    Boolean(address),
    source,
  )

  if (!address) return null

  // ── Something is stuck on the recipient's side ───────────────────────────
  const blocker =
    inFlight.length > 0 && recipient && !recipient.ready
      ? describeCctpBlocker(recipient.blocker, recipient.reserveShortfallRaw)
      : null

  if (blocker) {
    return (
      <div
        data-testid="cctp-blocked-banner"
        className={cn("rounded-2xl border border-amber-300/50 bg-amber-500/[0.07] px-4 py-3.5", className)}
      >
        <p className="text-[13px] font-semibold">{blocker.title}</p>
        <p className="mt-1 text-[12px] leading-relaxed text-foreground/70">
          {blocker.detail} Your money is safe — it lands as soon as this is done.
        </p>
      </div>
    )
  }

  // ── Money is on its way ──────────────────────────────────────────────────
  if (inFlight.length > 0) {
    const total = inFlight.reduce((sum, t) => sum + t.amountUsdc, 0)
    return (
      <div
        data-testid="cctp-inflight-banner"
        className={cn("rounded-2xl border border-foreground/[0.08] bg-muted/30 px-4 py-3.5", className)}
      >
        <p className="inline-flex items-center gap-2 text-[13px] text-foreground/75">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ${total.toLocaleString("en-US", { maximumFractionDigits: 2 })} on its way to your
          wallet — usually a minute or two.
        </p>
      </div>
    )
  }

  // ── Arrived, waiting on the user ─────────────────────────────────────────
  if (awaitingUser.length === 0) return null
  const total = awaitingUser.reduce((sum, t) => sum + t.amountUsdc, 0)

  return (
    <div
      data-testid="cctp-arrived-banner"
      className={cn(
        "rounded-2xl border border-emerald-200 bg-emerald-500/[0.06] px-4 py-3.5",
        "flex items-center justify-between gap-3",
        className,
      )}
    >
      <p className="text-[13px] leading-relaxed text-foreground/80">
        <span className="font-semibold tabular-nums">
          ${total.toLocaleString("en-US", { maximumFractionDigits: 2 })}
        </span>{" "}
        arrived in your wallet.{onInvest ? " Put it to work?" : ""}
      </p>
      <div className="flex items-center gap-2 shrink-0">
        {onInvest && (
          <button
            type="button"
            onClick={() => onInvest(total)}
            className={cn(
              "h-9 px-3.5 rounded-xl text-xs font-semibold text-white transition-colors",
              "bg-emerald-600 hover:bg-emerald-500 inline-flex items-center gap-1.5",
            )}
          >
            Deposit
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          // Dismissing every arrived transfer is the honest reading of "no
          // thanks": the user is answering about the money, not about one row.
          onClick={() => awaitingUser.forEach((t) => void dismiss(t.id))}
          aria-label="Keep it in my wallet"
          title="Keep it in my wallet"
          className="h-9 w-9 rounded-xl grid place-items-center text-muted-foreground hover:bg-foreground/[0.05] transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

"use client"

/**
 * The one thing a user must do before money can come in from another chain.
 *
 * Every surface that can start a cross-chain deposit renders this above its
 * amount field, and disables its own action while `!ready`. Not a warning — a
 * gate. A burn signed without the trustline in place leaves the source chain and
 * then parks at the forwarder on Stellar until the trustline exists and the
 * relay is re-driven; nothing is lost, but the user watches a deposit hang for
 * as long as it takes them to work out why.
 *
 * Renders nothing at all in the common case (wallet already enabled), so it can
 * sit unconditionally in a sheet without adding a step for the 95% who don't
 * need one. That is the whole point: the step appears exactly once per wallet,
 * in front of the deposit it would otherwise break.
 *
 * The copy comes from `describeCctpBlocker`, shared with the API, so the reason
 * shown here and the reason the server refuses calldata for cannot drift apart.
 */

import { Loader2, ShieldCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import { StellarTopUpHint } from "@/components/wallet/StellarTopUpHint"
import { useCctpRecipient } from "@/hooks/use-cctp-recipient"

export interface CctpTrustlineGateProps {
  /** Called once the wallet can receive, so the parent can re-enable its action. */
  onReady?: () => void
  className?: string
}

export function CctpTrustlineGate({ onReady, className }: CctpTrustlineGateProps) {
  const { status, asset, error, isWorking, needsTopUp, assetMismatch, ensure } = useCctpRecipient()

  // A configuration bug, not a user problem: the asset we would enable is no
  // longer the asset a CCTP mint arrives as. Enabling the wrong one would look
  // like success and strand the next deposit, so say so plainly and offer no
  // button at all.
  if (assetMismatch) {
    return (
      <div className={cn("rounded-xl border border-destructive/40 bg-destructive/[0.06] px-3 py-2.5", className)}>
        <p className="text-[11px] leading-relaxed text-foreground/80">
          Cross-chain deposits are unavailable right now. We&apos;ve been notified.
        </p>
      </div>
    )
  }

  // Nothing to do — and nothing to show. The overwhelmingly common case.
  if (status === "present") return null

  if (status === "checking") {
    return (
      <div className={cn("flex items-center gap-2 px-1 py-1.5 text-[11px] text-foreground/50", className)}>
        <Loader2 className="h-3 w-3 animate-spin" />
        Checking your wallet…
      </div>
    )
  }

  return (
    <div
      data-testid="cctp-trustline-gate"
      className={cn(
        "rounded-xl border border-border/50 bg-muted/30 px-3 py-3 space-y-2.5",
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0 text-foreground/60" />
        <div className="space-y-1">
          <p className="text-[12px] font-semibold leading-tight">Enable dollars once</p>
          <p className="text-[11px] leading-relaxed text-foreground/70">
            Your Stellar wallet needs to accept {asset?.code ?? "US dollars"} before money
            can arrive from another network. One signature, and it stays enabled.
          </p>
        </div>
      </div>

      {/* A top-up is not a retry: the button would fail again for the same
          reason, so we swap it for the address to send XLM to. */}
      {needsTopUp ? (
        <StellarTopUpHint />
      ) : (
        <button
          type="button"
          disabled={isWorking}
          onClick={async () => {
            if (await ensure()) onReady?.()
          }}
          className={cn(
            "w-full rounded-lg px-3 py-2 text-[12px] font-semibold transition-colors",
            "bg-foreground text-background hover:opacity-90 disabled:opacity-60",
          )}
        >
          {isWorking ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" /> Enabling…
            </span>
          ) : (
            "Enable"
          )}
        </button>
      )}

      {error && !needsTopUp && (
        <p className="text-[11px] leading-relaxed text-destructive">{error}</p>
      )}
    </div>
  )
}

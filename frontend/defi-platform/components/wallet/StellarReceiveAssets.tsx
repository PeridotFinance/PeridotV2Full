"use client"

/**
 * "Receive on Stellar" — a manual control for the trustlines a Stellar wallet
 * needs before it can receive a classic asset (EURC, USDC, …). XLM is native
 * and never appears here. Lives in the Wallet management dialog so a user can
 * enable a currency up front, without first walking into a deposit flow.
 *
 * The list is derived from `classicAssets`, so adding a future stablecoin only
 * needs an entry there. Each row runs its own `useStellarTrustline` check; the
 * enable action funds (embedded only) + opens the trustline via the signer
 * registry — same path the deposit sheet uses.
 */

import { Check, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { useStellarWallet } from "@/hooks/use-stellar-wallet"
import { useStellarTrustline } from "@/hooks/use-stellar-trustline"
import { StellarTopUpHint } from "./StellarTopUpHint"
import { stellarSorobanMainnetContracts } from "@/config/contracts"

// Classic assets the wallet can opt into receiving, derived from config.
const RECEIVABLE = Object.keys(stellarSorobanMainnetContracts.classicAssets).map(
  (symbol) => ({ symbol, assetId: `${symbol.toLowerCase()}-stellar` }),
)

/** Currency glyph for the asset badge — falls back to the first letter. */
function glyph(symbol: string): string {
  if (symbol.startsWith("EUR")) return "€"
  if (symbol.startsWith("USD")) return "$"
  return symbol[0] ?? "?"
}

function TrustlineRow({ symbol, assetId }: { symbol: string; assetId: string }) {
  const t = useStellarTrustline(assetId)

  const onEnable = async () => {
    const ok = await t.ensure()
    if (ok) toast.success(`${symbol} enabled — you can now receive it`)
    else if (t.needsTopUp) toast.info("Add a little XLM to enable this currency.")
    else if (t.error) toast.error(t.error)
  }

  const subtitle =
    t.status === "present"
      ? "Ready to receive"
      : t.needsTopUp
        ? "Needs a little XLM"
        : "On Stellar"

  return (
    <div
      data-testid={`stellar-receive-${symbol.toLowerCase()}`}
      className={cn(
        "rounded-xl px-3 py-2.5 space-y-2",
        "bg-background/40 border border-border/30",
        "hover:bg-background/70 hover:border-border/60 transition-colors duration-200",
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-8 w-8 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 flex items-center justify-center font-bold shrink-0">
            {glyph(symbol)}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground truncate">{symbol}</div>
            <div className="text-[11px] text-muted-foreground/80 truncate">{subtitle}</div>
          </div>
        </div>

        <div className="shrink-0 pl-2">
          {t.status === "checking" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground/60" />
          ) : t.status === "present" ? (
            <span className="flex items-center gap-1 text-[10px] uppercase tracking-widest font-semibold text-emerald-500">
              <Check className="h-3.5 w-3.5" />
              Ready
            </span>
          ) : (
            <button
              type="button"
              onClick={onEnable}
              disabled={t.isWorking}
              data-testid={`stellar-enable-${symbol.toLowerCase()}`}
              className={cn(
                "h-8 px-3 rounded-xl text-xs font-semibold transition-colors",
                "bg-emerald-600 text-white hover:bg-emerald-500",
                "disabled:opacity-60 disabled:cursor-not-allowed",
              )}
            >
              {t.isWorking ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : t.needsTopUp ? (
                "Retry"
              ) : (
                "Enable"
              )}
            </button>
          )}
        </div>
      </div>

      {t.needsTopUp && <StellarTopUpHint />}
    </div>
  )
}

/**
 * Renders nothing unless a Stellar wallet is connected. Safe to mount
 * unconditionally in the wallet dialog.
 */
export function StellarReceiveAssets() {
  const { isConnected } = useStellarWallet()
  if (!isConnected || RECEIVABLE.length === 0) return null

  return (
    <div className="space-y-2">
      <h4 className="text-[11px] uppercase tracking-widest font-semibold text-muted-foreground/70 px-1">
        Receive on Stellar
      </h4>
      <p className="text-xs text-muted-foreground px-1 -mt-0.5">
        Turn on the currencies you want to receive into your Stellar wallet. A
        one-time setup per currency — each reserves a small amount of XLM on your
        account.
      </p>
      <div className="space-y-1.5">
        {RECEIVABLE.map((a) => (
          <TrustlineRow key={a.assetId} symbol={a.symbol} assetId={a.assetId} />
        ))}
      </div>
    </div>
  )
}

"use client"

/**
 * Shown when a Stellar trustline can't be enabled because the wallet lacks the
 * XLM to cover the +0.5 XLM subentry reserve. Instead of a dead "Enable" button
 * and an opaque error, we tell the user exactly what's needed and give them the
 * receiving address to send a little XLM to. Used by both the wallet dialog's
 * "Receive on Stellar" list and the deposit sheet's activation step.
 */

import { useState } from "react"
import { Check, Copy } from "lucide-react"
import { cn } from "@/lib/utils"
import { useStellarWallet } from "@/hooks/use-stellar-wallet"

export function StellarTopUpHint({ className }: { className?: string }) {
  const { address } = useStellarWallet()
  const [copied, setCopied] = useState(false)

  if (!address) return null

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable — the address is still visible to copy by hand */
    }
  }

  const short = `${address.slice(0, 6)}…${address.slice(-6)}`

  return (
    <div
      data-testid="stellar-topup-hint"
      className={cn(
        "rounded-xl border border-amber-300/40 bg-amber-500/[0.06] px-3 py-2.5 space-y-2",
        className,
      )}
    >
      <p className="text-[11px] leading-relaxed text-foreground/75">
        Enabling a currency reserves a small amount of XLM on your account. Add
        about <span className="font-semibold">1 XLM</span> to your Stellar wallet,
        then try again.
      </p>
      <button
        type="button"
        onClick={onCopy}
        className={cn(
          "w-full flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5",
          "bg-background/60 border border-border/40 hover:border-border/70 transition-colors",
        )}
        title="Copy your Stellar address"
      >
        <span className="font-mono text-[11px] text-foreground/80 truncate">{short}</span>
        {copied ? (
          <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-500 shrink-0">
            <Check className="h-3 w-3" /> Copied
          </span>
        ) : (
          <span className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground shrink-0">
            <Copy className="h-3 w-3" /> Copy
          </span>
        )}
      </button>
    </div>
  )
}

"use client"

/**
 * Stellar holdings (XLM / USDC / EURC) for the connected Stellar wallet, styled
 * to sit beside `AssetsAcrossChains` in the wallet dialog's Assets subtab.
 *
 * Self-contained: reads balances via `useStellarSendBalances` and renders
 * nothing when no Stellar wallet is connected. Token amounts only — there is no
 * USD price wiring for raw wallet holdings (by design, see the Overview which
 * is action-first rather than balance-first).
 */

import Image from "next/image"
import { cn } from "@/lib/utils"
import { useStellarSendBalances } from "@/hooks/use-stellar-send-balances"

function formatAmount(raw: string): string {
  const num = Number(raw)
  if (!Number.isFinite(num) || num === 0) return "0"
  if (num < 0.0001) return "<0.0001"
  return num >= 1000
    ? num.toLocaleString(undefined, { maximumFractionDigits: 2 })
    : num.toLocaleString(undefined, { maximumFractionDigits: 4 })
}

interface StellarAssetsListProps {
  /**
   * Hide the "Assets on Stellar" sub-heading — used when a parent
   * (`WalletAssetsSection`) renders one unified "Assets" header spanning EVM +
   * Stellar so the count and title aren't duplicated per chain.
   */
  hideHeader?: boolean
}

export function StellarAssetsList({ hideHeader = false }: StellarAssetsListProps = {}) {
  const { isConnected, tokens, isLoading } = useStellarSendBalances()
  if (!isConnected) return null

  // Holdings only — match the EVM list (and the unified count), which show
  // positive balances exclusively. Zero-balance trustlines belong to the
  // separate receive flow, not the balance summary.
  const positiveTokens = tokens.filter((t) => t.balanceRaw > BigInt(0))

  // Settled with nothing to show — render nothing so no empty heading dangles.
  if (!isLoading && positiveTokens.length === 0) return null

  return (
    <div className="space-y-2">
      {!hideHeader && (
        <h4 className="text-[11px] uppercase tracking-widest font-semibold text-muted-foreground/70 px-1">
          Assets on Stellar
        </h4>
      )}
      {isLoading && positiveTokens.length === 0 ? (
        <div className="space-y-1.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 bg-background/40 border border-border/30"
            >
              <div className="h-8 w-8 rounded-full bg-muted/60 animate-pulse" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 w-16 rounded bg-muted/60 animate-pulse" />
                <div className="h-3 w-24 rounded bg-muted/40 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-1.5">
          {positiveTokens.map((t) => (
            <div
              key={t.contractId}
              data-testid={`stellar-asset-${t.symbol.toLowerCase()}`}
              className={cn(
                "flex items-center justify-between rounded-xl px-3 py-2.5",
                "bg-background/40 border border-border/30",
                "hover:bg-background/70 hover:border-border/60 transition-colors duration-200",
              )}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-8 w-8 rounded-full bg-muted/40 border border-border/30 flex items-center justify-center overflow-hidden shrink-0">
                  <Image
                    src={t.logoUrl}
                    alt={t.symbol}
                    width={28}
                    height={28}
                    className="rounded-full"
                    unoptimized
                  />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-foreground truncate">{t.symbol}</div>
                  <div className="text-[11px] text-muted-foreground/80 truncate">Stellar</div>
                </div>
              </div>
              <span className="font-mono text-sm font-medium text-foreground tabular-nums shrink-0 pl-2">
                {formatAmount(t.balanceFormatted)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

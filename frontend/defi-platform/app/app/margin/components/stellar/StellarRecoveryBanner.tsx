'use client'

/**
 * Stuck-funds recovery banner.
 *
 * Surfaces vault SPOT pTokens left behind by a half-finished collateral move (a
 * deposit whose transfer-to-margin / withdraw tail failed). These funds are safe
 * but invisible in the wallet and margin totals, which is exactly why a user
 * thinks they vanished. One banner per stranded asset, with both directions:
 * finish into the trading account, or return to the wallet.
 *
 * Mirrors StellarPendingBanner's look; copy stays jargon-free (no "pTokens").
 */
import { motion } from 'framer-motion'
import { Loader2, LifeBuoy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { StuckFund } from '../../hooks/use-stellar-margin-recovery'
import type { StellarMarginAssetKey } from '../../types/stellarMargin'

interface Props {
  stuck: StuckFund[]
  /** `${key}:${direction}` of the in-flight action, or null. */
  busy: string | null
  onToMargin: (key: StellarMarginAssetKey) => void
  onToWallet: (key: StellarMarginAssetKey) => void
}

export function StellarRecoveryBanner({ stuck, busy, onToMargin, onToWallet }: Props) {
  if (!stuck.length) return null
  return (
    <div className="mb-5 space-y-2">
      {stuck.map((s) => {
        const toMarginBusy = busy === `${s.key}:margin`
        const toWalletBusy = busy === `${s.key}:wallet`
        const anyBusy = toMarginBusy || toWalletBusy
        return (
          <motion.div
            key={s.key}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 rounded-xl border text-sm bg-sky-500/10 border-sky-500/25 text-sky-800 dark:text-sky-200"
          >
            <LifeBuoy className="w-4 h-4 shrink-0 text-sky-600 dark:text-sky-300" />
            <div className="flex-1">
              <span className="font-semibold">Funds need one more step</span>{' '}
              <span className="opacity-80">
                {s.spotUnderlying.toFixed(2)} {s.label} from an interrupted transfer is waiting — finish moving it
                into your trading account, or send it back to your wallet.
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                onClick={() => onToMargin(s.key)}
                disabled={anyBusy}
                className="h-8 px-3 text-xs bg-sky-500 hover:bg-sky-600 text-white font-bold"
              >
                {toMarginBusy ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Moving…</> : 'Move to trading account'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onToWallet(s.key)}
                disabled={anyBusy}
                className="h-8 px-3 text-xs border-foreground/20 bg-foreground/5 hover:bg-foreground/10 text-inherit"
              >
                {toWalletBusy ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Returning…</> : 'Return to wallet'}
              </Button>
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}

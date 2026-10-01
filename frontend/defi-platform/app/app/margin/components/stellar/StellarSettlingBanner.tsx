'use client'

/**
 * "Settlement pending" — the last state of a close, and the only one with
 * nothing to press.
 *
 * `finish_close_position_v3` repays the debt out of the closing swap's proceeds.
 * Interest keeps accruing while the close is in flight, so those proceeds can
 * land a few stroops short of the debt they were sized against. The contract no
 * longer reverts for that (which is what used to strand closes): it books what it
 * could as a `close_residual` and keeps the position in `Closing` until the
 * remainder squares up.
 *
 * The position then has no pending close attached, so before this banner existed
 * the positions sweep classified the id as nothing at all and dropped it — the
 * trader watched their position vanish from the list a moment before it actually
 * did, with the money nowhere on screen. This says the true thing instead: the
 * trade is done, the bookkeeping isn't, and there is nothing to do about it.
 *
 * Deliberately quieter than {@link StellarPendingCloseBanner} — no buttons, and
 * a neutral palette rather than amber. An action-less notice that looks like a
 * warning teaches traders to fear a state that is entirely normal.
 */
import { motion } from 'framer-motion'
import { CheckCircle2 } from 'lucide-react'
import type { StellarSettlingView } from '../../types/stellarMargin'

interface Props {
  settling: StellarSettlingView
}

export function StellarSettlingBanner({ settling }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      data-testid="margin-settling-banner"
      className="mb-5 flex items-start gap-3 rounded-xl border border-foreground/10 bg-foreground/5 px-4 py-3 text-sm text-foreground/80"
    >
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 opacity-70" />
      <div>
        <span className="font-semibold">Settlement pending</span>{' '}
        <span className="opacity-80">
          {settling.side} · your position was settled and the last of the interest is being squared up.
        </span>
        <div className="mt-0.5 text-xs opacity-70">
          Nothing to do — it clears by itself and leaves this list within a few minutes.
        </div>
      </div>
    </motion.div>
  )
}
